import type { AppData, CableRun, ID, Pathway, Point } from '../types';
import { polylineLength } from './calc';

/** Length of one pathway in metres: drawn geometry, else the entered length. */
export function pathwayLengthM(p: Pathway): number {
  if (p.points.length > 1) return polylineLength(p.points) / 1000;
  return p.lengthM ?? 0;
}

const key = (areaId: string | undefined, p: Point) => `${areaId ?? '-'}:${Math.round(p.x / 25)}:${Math.round(p.y / 25)}`;

function projectOnSegment(a: Point, b: Point, p: Point) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
  const q = { x: a.x + t * dx, y: a.y + t * dy };
  return { q, t, d: Math.hypot(q.x - p.x, q.y - p.y) };
}

interface Edge {
  to: string;
  m: number;
  pathwayId?: ID;
}

/**
 * Build a routing graph:
 * - drawn pathways: vertices at polyline points (plus T-junctions and drop points inserted)
 * - logical pathways: an edge between their from/to locations
 * - drops: edge between the location node and its point on the pathway (+ vertical drop)
 */
export function buildGraph(data: AppData) {
  const adj = new Map<string, Edge[]>();
  const add = (a: string, b: string, m: number, pathwayId?: ID) => {
    if (a === b) return;
    (adj.get(a) ?? adj.set(a, []).get(a)!).push({ to: b, m, pathwayId });
    (adj.get(b) ?? adj.set(b, []).get(b)!).push({ to: a, m, pathwayId });
  };
  const loc = (id: ID) => 'L:' + id;

  // Extra split points per pathway segment (drop points, junctions with other pathway ends).
  const splits = new Map<ID, Point[]>();
  const drawn = data.pathways.filter((p) => p.points.length > 1);
  for (const d of data.drops) (splits.get(d.pathwayId) ?? splits.set(d.pathwayId, []).get(d.pathwayId)!).push(d.at);
  for (const p of drawn) {
    for (const end of [p.points[0], p.points[p.points.length - 1]]) {
      for (const o of drawn) {
        if (o.id === p.id || o.areaId !== p.areaId) continue;
        for (let i = 1; i < o.points.length; i++) {
          const { q, d } = projectOnSegment(o.points[i - 1], o.points[i], end);
          if (d < 100) (splits.get(o.id) ?? splits.set(o.id, []).get(o.id)!).push(q);
        }
      }
    }
  }

  for (const p of drawn) {
    const extra = splits.get(p.id) ?? [];
    for (let i = 1; i < p.points.length; i++) {
      const a = p.points[i - 1], b = p.points[i];
      const pts = [{ t: 0, q: a }, { t: 1, q: b }];
      for (const e of extra) {
        const r = projectOnSegment(a, b, e);
        if (r.d < 100) pts.push({ t: r.t, q: r.q });
      }
      pts.sort((x, y) => x.t - y.t);
      for (let j = 1; j < pts.length; j++) {
        const m = Math.hypot(pts[j].q.x - pts[j - 1].q.x, pts[j].q.y - pts[j - 1].q.y) / 1000;
        add(key(p.areaId, pts[j - 1].q), key(p.areaId, pts[j].q), m, p.id);
      }
    }
  }
  for (const p of data.pathways) {
    if (p.points.length > 1 || !p.fromId || !p.toId) continue;
    add(loc(p.fromId), loc(p.toId), p.lengthM ?? 0, p.id);
  }
  for (const d of data.drops) {
    const p = data.pathways.find((x) => x.id === d.pathwayId);
    if (!p) continue;
    if (p.points.length > 1) add(loc(d.rackId), key(p.areaId, d.at), d.dropM ?? 0);
  }
  // Locations placed on a plan exactly at a pathway vertex connect for free.
  for (const l of data.locations) {
    if (l.x == null || l.y == null) continue;
    const k = key(l.areaId, { x: l.x, y: l.y });
    if (adj.has(k)) add(loc(l.id), k, 0);
  }
  return adj;
}

export interface RouteResult {
  pathwayIds: ID[];
  pathM: number;
  found: boolean;
}

/** Dijkstra shortest path between two locations through the pathway network. */
export function autoRoute(data: AppData, fromId: ID, toId: ID): RouteResult {
  const adj = buildGraph(data);
  const start = 'L:' + fromId, goal = 'L:' + toId;
  if (!adj.has(start) || !adj.has(goal)) return { pathwayIds: [], pathM: 0, found: false };
  const dist = new Map<string, number>([[start, 0]]);
  const prev = new Map<string, { node: string; edge: Edge }>();
  const done = new Set<string>();
  // Small graphs: a simple O(V^2) scan is fine.
  while (true) {
    let u: string | null = null;
    let best = Infinity;
    for (const [n, d] of dist) if (!done.has(n) && d < best) { best = d; u = n; }
    if (u === null || u === goal) break;
    done.add(u);
    for (const e of adj.get(u) ?? []) {
      const nd = best + e.m;
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        prev.set(e.to, { node: u, edge: e });
      }
    }
  }
  if (!dist.has(goal)) return { pathwayIds: [], pathM: 0, found: false };
  const ids: ID[] = [];
  let n = goal;
  while (prev.has(n)) {
    const { node, edge } = prev.get(n)!;
    if (edge.pathwayId && ids[0] !== edge.pathwayId) ids.unshift(edge.pathwayId);
    n = node;
  }
  return { pathwayIds: ids, pathM: dist.get(goal)!, found: true };
}

/** Slack allowance (m) at both ends from the endpoint settings or project default. */
export function slackFor(data: AppData, c: CableRun) {
  const def = data.project.defaultSlackM ?? 0;
  const s = (id?: ID) => (id ? data.locations.find((l) => l.id === id)?.slackM ?? def : def);
  return s(c.fromRackId) + s(c.toRackId);
}

/** Design length = route path (incl. drops) + slack, rounded up to the metre. */
export function designLength(data: AppData, c: CableRun, pathM: number) {
  return Math.ceil(pathM + slackFor(data, c));
}

/** Measured installed length from jacket markings. */
export function measuredLength(c: CableRun) {
  return c.markA != null && c.markB != null ? Math.abs(c.markB - c.markA) : undefined;
}
