import { ROUND_KINDS, OPEN_KINDS, conduitFillLimit } from '../data/norms';
import type { AppData, CableRun, CableType, ID, Pathway, ProgressEntry, Stage, StageMeasure } from '../types';

export const MEASURE_UNIT: Record<StageMeasure, string> = {
  length: 'm',
  fibres: 'fibres',
  connectors: 'conn',
  count: 'ea',
};

export function stageApplies(type: CableType | undefined, stageId: ID): boolean {
  if (!type) return true;
  return type.stageIds.length === 0 || type.stageIds.includes(stageId);
}

/** Target quantity for a cable at a stage, in the stage's unit. */
export function stageTarget(cable: CableRun, type: CableType | undefined, stage: Stage): number {
  if (!stageApplies(type, stage.id)) return 0;
  const fibres = type?.fibreCount ?? 0;
  const ends = type?.ends ?? 2;
  switch (stage.measure) {
    case 'length':
      return cable.lengthM;
    case 'fibres':
      return fibres * ends;
    case 'connectors': {
      const per = type?.fibresPerConnector || 1;
      return fibres > 0 ? Math.ceil(fibres / per) * ends : ends;
    }
    case 'count':
      return 1;
  }
}

/** Index of progress qty by cable and stage. */
export function progressIndex(progress: ProgressEntry[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of progress) {
    const k = p.cableId + '|' + p.stageId;
    m.set(k, (m.get(k) ?? 0) + p.qty);
  }
  return m;
}

export interface StageTotals {
  stage: Stage;
  target: number;
  done: number;
  pct: number;
  cablesComplete: number;
  cablesApplicable: number;
  /** Metres of cable whose stage is complete (useful for non-length stages). */
  metresComplete: number;
  /** Fibres in cables whose stage is complete. */
  strandsComplete: number;
}

export function stageTotals(data: AppData, cables: CableRun[] = data.cables): StageTotals[] {
  const types = new Map(data.cableTypes.map((t) => [t.id, t]));
  const idx = progressIndex(data.progress);
  return data.stages.map((stage) => {
    let target = 0;
    let done = 0;
    let cablesComplete = 0;
    let cablesApplicable = 0;
    let metresComplete = 0;
    let strandsComplete = 0;
    for (const c of cables) {
      const t = types.get(c.typeId);
      const tg = stageTarget(c, t, stage);
      if (tg <= 0) continue;
      cablesApplicable++;
      const d = Math.min(idx.get(c.id + '|' + stage.id) ?? 0, tg);
      target += tg;
      done += d;
      if (d >= tg) {
        cablesComplete++;
        metresComplete += c.lengthM;
        strandsComplete += t?.fibreCount ?? 0;
      }
    }
    return {
      stage,
      target,
      done,
      pct: target > 0 ? (done / target) * 100 : 0,
      cablesComplete,
      cablesApplicable,
      metresComplete,
      strandsComplete,
    };
  });
}

export function cableStageStatus(
  cable: CableRun,
  type: CableType | undefined,
  stage: Stage,
  idx: Map<string, number>,
): { target: number; done: number; pct: number; state: 'na' | 'none' | 'partial' | 'done' } {
  const target = stageTarget(cable, type, stage);
  if (target <= 0) return { target: 0, done: 0, pct: 0, state: 'na' };
  const done = Math.min(idx.get(cable.id + '|' + stage.id) ?? 0, target);
  const pct = (done / target) * 100;
  return { target, done, pct, state: done <= 0 ? 'none' : done >= target ? 'done' : 'partial' };
}

/** Strand-metres: fibre count x metres. A common way to express fibre installed. */
export function strandMetres(entry: ProgressEntry, cable: CableRun | undefined, type: CableType | undefined, stage: Stage | undefined) {
  if (!cable || !type || !stage || stage.measure !== 'length') return 0;
  return entry.qty * (type.fibreCount ?? 0);
}

export interface CrewSummary {
  crewId: ID;
  hours: number;
  workers: number;
  byStage: Record<ID, number>;
  metresPulled: number;
  strandMetres: number;
}

export function crewSummaries(data: AppData, from?: string, to?: string): Map<ID, CrewSummary> {
  const inRange = (d: string) => (!from || d >= from) && (!to || d <= to);
  const cables = new Map(data.cables.map((c) => [c.id, c]));
  const types = new Map(data.cableTypes.map((t) => [t.id, t]));
  const stages = new Map(data.stages.map((s) => [s.id, s]));
  const pullStageId = data.stages.find((x) => x.measure === 'length')?.id;
  const out = new Map<ID, CrewSummary>();
  const get = (id: ID) => {
    let s = out.get(id);
    if (!s) {
      s = { crewId: id, hours: 0, workers: 0, byStage: {}, metresPulled: 0, strandMetres: 0 };
      out.set(id, s);
    }
    return s;
  };
  for (const c of data.crews) get(c.id);
  const workerSets = new Map<ID, Set<ID>>();
  for (const t of data.time) {
    if (!inRange(t.date) || !t.crewId) continue;
    const s = get(t.crewId);
    s.hours += t.hours;
    let ws = workerSets.get(t.crewId);
    if (!ws) workerSets.set(t.crewId, (ws = new Set()));
    ws.add(t.workerId);
  }
  for (const [id, ws] of workerSets) get(id).workers = ws.size;
  for (const p of data.progress) {
    if (!inRange(p.date)) continue;
    const s = get(p.crewId);
    s.byStage[p.stageId] = (s.byStage[p.stageId] ?? 0) + p.qty;
    const cable = cables.get(p.cableId);
    const type = cable ? types.get(cable.typeId) : undefined;
    const stage = stages.get(p.stageId);
    if (p.stageId === pullStageId) s.metresPulled += p.qty;
    s.strandMetres += strandMetres(p, cable, type, stage);
  }
  return out;
}

// ---------- Pathway fill ----------

export function cableArea(odMm: number) {
  return Math.PI * (odMm / 2) ** 2;
}

export interface FillResult {
  pathway: Pathway;
  cableCount: number;
  cableAreaMm2: number;
  pathwayAreaMm2: number;
  limitPct: number;
  fillPct: number;
  missingOd: number;
  status: 'ok' | 'warn' | 'over';
}

export function pathwayFill(data: AppData, pathway: Pathway, extra: { odMm: number; count: number }[] = []): FillResult {
  const types = new Map(data.cableTypes.map((t) => [t.id, t]));
  let area = 0;
  let count = 0;
  let missingOd = 0;
  for (const c of data.cables) {
    if (!c.pathwayIds.includes(pathway.id)) continue;
    count++;
    const od = types.get(c.typeId)?.odMm;
    if (!od) missingOd++;
    else area += cableArea(od);
  }
  for (const e of extra) {
    area += cableArea(e.odMm) * e.count;
    count += e.count;
  }
  const round = ROUND_KINDS.includes(pathway.kind) && !!pathway.diameterMm;
  const pa = round ? Math.PI * (pathway.diameterMm! / 2) ** 2 : pathway.widthMm * pathway.depthMm;
  const limitPct = round && !pathway.fillOverride ? conduitFillLimit(count) : pathway.fillLimitPct;
  const fillPct = pa > 0 ? (area / pa) * 100 : 0;
  const open = OPEN_KINDS.includes(pathway.kind);
  const status = open ? 'ok' : fillPct > limitPct ? 'over' : fillPct > limitPct * 0.8 ? 'warn' : 'ok';
  return { pathway, cableCount: count, cableAreaMm2: area, pathwayAreaMm2: pa, fillPct, limitPct, missingOd, status };
}

/** How many more cables of a given OD fit before hitting the fill limit. */
export function remainingCapacity(fill: FillResult, odMm: number) {
  const allowed = (fill.limitPct / 100) * fill.pathwayAreaMm2;
  return Math.max(0, Math.floor((allowed - fill.cableAreaMm2) / cableArea(odMm)));
}

export function polylineLength(points: { x: number; y: number }[]) {
  let L = 0;
  for (let i = 1; i < points.length; i++) L += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return L;
}

export const fmt = (n: number, dp = 0) =>
  n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
