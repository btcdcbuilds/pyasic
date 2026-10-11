import { describe, expect, it } from 'vitest';
import { emptyData } from '../seed';
import { autoRoute, designLength, measuredLength } from './route';
import { linkBudget } from './budget';
import { pathwayFill } from './calc';
import { blockingHolds, lotProgress } from './itp';
import { migrateV1 } from '../store';
import type { AppData, CableRun, Pathway } from '../types';

const pw = (p: Partial<Pathway>): Pathway => ({ id: 'p', name: 'p', kind: 'wire-basket', widthMm: 300, depthMm: 100, fillLimitPct: 50, points: [], ...p });
const cable = (p: Partial<CableRun> = {}): CableRun => ({ id: 'c1', tag: 'C1', typeId: 'ct-864-ribbon', fromLabel: '', toLabel: '', lengthM: 100, pathwayIds: [], ...p });

function network(): AppData {
  const d = emptyData();
  d.locations = [
    { id: 'A', name: 'A', kind: 'rack', areaId: 'F', x: 0, y: 1000 },
    { id: 'B', name: 'B', kind: 'rack', areaId: 'F', x: 20000, y: 1000 },
    { id: 'C', name: 'C', kind: 'pit' },
    { id: 'F', name: 'Floor', kind: 'floor' },
  ];
  // Basket along y=0 from x=0 to x=20000 (20 m), plus a short 6 m spur joined at x=10000.
  d.pathways = [
    pw({ id: 'b1', areaId: 'F', points: [{ x: 0, y: 0 }, { x: 20000, y: 0 }] }),
    pw({ id: 'b2', areaId: 'F', points: [{ x: 10000, y: 0 }, { x: 10000, y: 6000 }] }),
    pw({ id: 'c1', kind: 'conduit', diameterMm: 50, fromId: 'B', toId: 'C', lengthM: 80 }),
  ];
  d.drops = [
    { id: 'd1', pathwayId: 'b1', rackId: 'A', at: { x: 0, y: 0 }, entry: 'top-centre', dropM: 1.5 },
    { id: 'd2', pathwayId: 'b1', rackId: 'B', at: { x: 20000, y: 0 }, entry: 'top-centre', dropM: 1.5 },
  ];
  return d;
}

describe('auto-routing', () => {
  it('routes A to B along the drawn basket including vertical drops', () => {
    const r = autoRoute(network(), 'A', 'B');
    expect(r.found).toBe(true);
    expect(r.pathwayIds).toEqual(['b1']);
    expect(r.pathM).toBeCloseTo(20 + 1.5 + 1.5, 6);
  });
  it('continues through a length-only conduit to a pit', () => {
    const r = autoRoute(network(), 'A', 'C');
    expect(r.pathwayIds).toEqual(['b1', 'c1']);
    expect(r.pathM).toBeCloseTo(1.5 + 20 + 1.5 + 80, 6); // A drop + basket + down into B (conduit starts at B) + conduit
  });
  it('reports no route when points are not connected', () => {
    const d = network();
    d.locations.push({ id: 'Z', name: 'Z', kind: 'rack' });
    expect(autoRoute(d, 'A', 'Z').found).toBe(false);
  });
  it('design length adds slack at both ends and rounds up', () => {
    const d = network();
    d.locations[0].slackM = 5;
    // B has no slack -> project default 3 m
    expect(designLength(d, cable({ fromRackId: 'A', toRackId: 'B' }), 23)).toBe(31);
  });
  it('measured length from jacket marks', () => {
    expect(measuredLength(cable({ markA: 1530, markB: 1245 }))).toBe(285);
    expect(measuredLength(cable({ markA: 10 }))).toBeUndefined();
  });
});

describe('loss budget (TIA-568.3 defaults as quoted by FOA)', () => {
  it('864F ribbon spliced, 300 m SM inside plant: 2 x 0.75 + 2 x 0.3 + 0.3 x 1.0 = 2.4 dB', () => {
    const d = emptyData();
    const t = d.cableTypes.find((x) => x.id === 'ct-864-ribbon')!;
    const b = linkBudget(cable({ lengthM: 300 }), t, d.project)!;
    expect(b.connectors).toBe(2);
    expect(b.splices).toBe(2);
    expect(b.totalDb).toBeCloseTo(2.4, 9);
  });
  it('pre-terminated MPO, 300 m: 2 x 0.75 + 0.3 = 1.8 dB (no splices)', () => {
    const d = emptyData();
    const t = d.cableTypes.find((x) => x.id === 'ct-1728-mpo16')!;
    expect(linkBudget(cable({ lengthM: 300 }), t, d.project)!.totalDb).toBeCloseTo(1.8, 9);
  });
});

describe('conduit fill (NEC Ch.9 Table 1)', () => {
  it('uses 53% / 31% / 40% by cable count', () => {
    const d = emptyData();
    d.cableTypes.push({ id: 'x', brand: '', name: '', category: 'fibre', odMm: 20, termination: 'none', ends: 2, stageIds: [], verified: false });
    const p = pw({ id: 'cd', kind: 'conduit', diameterMm: 50 });
    d.pathways = [p];
    const add = (n: number) => (d.cables = Array.from({ length: n }, (_, i) => cable({ id: 'k' + i, typeId: 'x', pathwayIds: ['cd'] })));
    add(1);
    expect(pathwayFill(d, p).limitPct).toBe(53);
    add(2);
    expect(pathwayFill(d, p).limitPct).toBe(31);
    add(3);
    const f = pathwayFill(d, p);
    expect(f.limitPct).toBe(40);
    // 3 x pi*10^2 / (pi*25^2) = 300/625 = 48% -> over 40%
    expect(f.fillPct).toBeCloseTo(48, 9);
    expect(f.status).toBe('over');
  });
});

describe('ITP hold points', () => {
  it('blocks a stage until its hold point item is passed (and client-signed if client H)', () => {
    const d = emptyData();
    d.cables = [cable()];
    const tpl = d.itpTemplates[0];
    const item = tpl.items.find((i) => i.releasesStageId === 'rough' && i.client === 'H')!;
    d.itpLots = [{ id: 'L', number: 'LOT-001', templateId: tpl.id, title: 't', cableIds: ['c1'], pathwayIds: [], locationIds: [], createdAt: 0, signoffs: {} }];
    expect(blockingHolds(d, 'c1', 'rough').some((h) => h.item.id === item.id)).toBe(true);
    d.itpLots[0].signoffs[item.id] = { status: 'pass', by: 'X', date: '2026-10-19' };
    expect(blockingHolds(d, 'c1', 'rough').some((h) => h.item.id === item.id)).toBe(true); // client still to sign
    d.itpLots[0].signoffs[item.id] = { status: 'pass', by: 'X', date: '2026-10-19', clientBy: 'Y' };
    expect(blockingHolds(d, 'c1', 'rough').some((h) => h.item.id === item.id)).toBe(false);
    expect(blockingHolds(d, 'other', 'rough')).toEqual([]);
    expect(lotProgress(d, d.itpLots[0]).done).toBe(1);
  });
});

describe('v1 migration', () => {
  it('turns racks into rack locations under building/room areas', () => {
    const out = migrateV1({ version: 1, project: { name: 'X' }, racks: [{ id: 'r1', name: 'A01', building: 'B1', room: 'MMR', row: 'A', x: 0, y: 0, rotation: 0, heightU: 42, widthMm: 600, depthMm: 1200, devices: [] }], cables: [], pathways: [] });
    const r = out.locations!.find((l) => l.id === 'r1')!;
    expect(r.kind).toBe('rack');
    const room = out.locations!.find((l) => l.id === r.parentId)!;
    expect(room.name).toBe('MMR');
    expect(out.locations!.find((l) => l.id === room.parentId)!.name).toBe('B1');
    expect(out.project!.budget.connectorDb).toBe(0.75);
  });
});
