import { describe, expect, it } from 'vitest';
import { emptyData } from '../seed';
import { cableArea, crewSummaries, pathwayFill, remainingCapacity, stageTarget, stageTotals } from './calc';
import type { AppData, CableRun } from '../types';

const data = (): AppData => emptyData();
const stage = (d: AppData, id: string) => d.stages.find((s) => s.id === id)!;
const run = (typeId: string, lengthM: number, id = typeId): CableRun => ({ id, tag: id, typeId, fromLabel: 'A', toLabel: 'B', lengthM, pathwayIds: [] });

describe('stage targets for the contract cable types', () => {
  it('864F ribbon: 1728 fibres spliced over 2 ends (144 x 12F ribbon splices), no termination stage', () => {
    const d = data();
    const t = d.cableTypes.find((x) => x.id === 'ct-864-ribbon')!;
    const c = run(t.id, 300);
    expect(stageTarget(c, t, stage(d, 'splice'))).toBe(1728);
    expect(stageTarget(c, t, stage(d, 'splice')) / t.ribbonSize!).toBe(144);
    expect(stageTarget(c, t, stage(d, 'term'))).toBe(0);
    expect(stageTarget(c, t, stage(d, 'rough'))).toBe(300);
  });
  it('1728F MPO-16: 108 connectors per end = 216, no splice stage', () => {
    const d = data();
    const t = d.cableTypes.find((x) => x.id === 'ct-1728-mpo16')!;
    const c = run(t.id, 250);
    expect(stageTarget(c, t, stage(d, 'term'))).toBe(216);
    expect(stageTarget(c, t, stage(d, 'splice'))).toBe(0);
  });
  it('64F MPO-16: 4 connectors per end = 8', () => {
    const d = data();
    const t = d.cableTypes.find((x) => x.id === 'ct-64-mpo16')!;
    expect(stageTarget(run(t.id, 40), t, stage(d, 'term'))).toBe(8);
  });
});

describe('progress totals', () => {
  it('caps over-logging at the target and counts complete cables', () => {
    const d = data();
    d.cables = [run('ct-864-ribbon', 300, 'a'), run('ct-864-ribbon', 200, 'b')];
    d.crews = [{ id: 'c1', name: 'Crew A', color: '#000' }];
    d.progress = [
      { id: '1', date: '2026-10-19', crewId: 'c1', cableId: 'a', stageId: 'rough', qty: 350, createdAt: 0 },
      { id: '2', date: '2026-10-19', crewId: 'c1', cableId: 'b', stageId: 'rough', qty: 50, createdAt: 0 },
    ];
    const rough = stageTotals(d).find((t) => t.stage.id === 'rough')!;
    expect(rough.target).toBe(500);
    expect(rough.done).toBe(350); // 300 (capped) + 50
    expect(rough.cablesComplete).toBe(1);
    expect(rough.strandsComplete).toBe(864);
  });
  it('crew summary: hours, metres pulled and fibre-metres', () => {
    const d = data();
    d.cables = [run('ct-864-ribbon', 300, 'a')];
    d.crews = [{ id: 'c1', name: 'Crew A', color: '#000' }];
    d.workers = [{ id: 'w1', name: 'W1', role: 'Cabler', crewId: 'c1', active: true }];
    d.time = [{ id: 't', date: '2026-10-19', workerId: 'w1', crewId: 'c1', hours: 10, createdAt: 0 }];
    d.progress = [{ id: '1', date: '2026-10-19', crewId: 'c1', cableId: 'a', stageId: 'rough', qty: 100, createdAt: 0 }];
    const s = crewSummaries(d).get('c1')!;
    expect(s.hours).toBe(10);
    expect(s.metresPulled).toBe(100);
    expect(s.strandMetres).toBe(86400);
  });
});

describe('pathway fill', () => {
  it('computes area ratio and remaining capacity', () => {
    const d = data();
    d.cableTypes.push({ id: 'x', brand: 't', name: 't', category: 'fibre', odMm: 22.8, termination: 'none', ends: 2, stageIds: [], verified: false });
    const p = { id: 'p', name: 'B1', kind: 'wire-basket' as const, widthMm: 300, depthMm: 100, fillLimitPct: 50, points: [] };
    d.pathways = [p];
    d.cables = Array.from({ length: 10 }, (_, i) => ({ ...run('x', 10, 'c' + i), pathwayIds: ['p'] }));
    const f = pathwayFill(d, p);
    expect(f.cableAreaMm2).toBeCloseTo(10 * Math.PI * 11.4 ** 2, 6);
    expect(f.fillPct).toBeCloseTo((10 * cableArea(22.8)) / 300, 6); // /30000*100
    // allowed 15000 mm2 - 4082.8 used = 10917.2 / 408.28 = 26.7 -> 26
    expect(remainingCapacity(f, 22.8)).toBe(26);
  });
});
