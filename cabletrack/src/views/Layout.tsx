import { useEffect, useMemo, useRef, useState } from 'react';
import { uid, useStore } from '../store';
import { Field, Modal, Num, confirmDelete } from '../ui';
import { fmt, pathwayFill, polylineLength } from '../lib/calc';
import { addFile, blobUrl } from '../lib/files';
import { PathwayForm, newPathway } from './Pathways';
import { LocationForm } from './Locations';
import { LOCATION_KIND_LABEL } from '../components';
import type { AppData, Drop, Location, LocationKind, Pathway, Point } from '../types';
import { AREA_KINDS, RACK_KINDS } from '../types';

type Tool = 'select' | 'point' | 'pathway' | 'drop' | 'pan' | 'calibrate' | 'place';
type Sel = { kind: 'loc' | 'pathway' | 'drop'; id: string } | null;

const SNAP = 50;
const snap = (v: number) => Math.round(v / SNAP) * SNAP;
const DEFAULT_MM_PER_PX = 10;

function nearestOnPolyline(pts: Point[], p: Point): Point {
  let best = pts[0];
  let bd = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
    const q = { x: a.x + t * dx, y: a.y + t * dy };
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}

function fitView(points: Location[], pathways: Pathway[], area?: Location) {
  const pts: Point[] = [...points.map((r) => ({ x: r.x!, y: r.y! })), ...pathways.flatMap((p) => p.points)];
  if (area?.plan) {
    pts.push({ x: 0, y: 0 }, { x: area.plan.widthPx * area.plan.mmPerPx, y: area.plan.heightPx * area.plan.mmPerPx });
  }
  if (pts.length === 0) return { x: -2000, y: -2000, w: 24000 };
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const minX = Math.min(...xs) - 2000, maxX = Math.max(...xs) + 2000, minY = Math.min(...ys) - 2000, maxY = Math.max(...ys) + 2000;
  const w = Math.max(maxX - minX, (maxY - minY) / 0.6);
  return { x: minX + (maxX - minX - w) / 2, y: minY + (maxY - minY - w * 0.6) / 2, w };
}

export default function Layout() {
  const data = useStore() as unknown as AppData;
  const { locations, pathways, drops, cables, rackModels, attachments } = data;
  const { upsert, remove, upsertMany } = useStore();
  const areas = locations.filter((l) => AREA_KINDS.includes(l.kind));
  const [areaId, setAreaId] = useState<string>(() => sessionStorage.getItem('layout-area') ?? areas[0]?.id ?? '');
  const area = areas.find((a) => a.id === areaId) ?? areas[0];
  const points = locations.filter((l) => !AREA_KINDS.includes(l.kind) && l.areaId === area?.id && l.x != null && l.y != null);
  const areaPaths = pathways.filter((p) => p.points.length > 1 && p.areaId === area?.id);
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState(() => fitView(points, areaPaths, area));
  const [tool, setTool] = useState<Tool>('select');
  const [sel, setSel] = useState<Sel>(null);
  const [draft, setDraft] = useState<Point[]>([]);
  const [hoverPt, setHoverPt] = useState<Point | null>(null);
  const [dropPath, setDropPath] = useState<string>('');
  const [routeCable, setRouteCable] = useState('');
  const [rowModal, setRowModal] = useState(false);
  const [newKind, setNewKind] = useState<LocationKind>('rack');
  const [newModel, setNewModel] = useState(rackModels[0]?.id ?? '');
  const [placeId, setPlaceId] = useState('');
  const [planUrl, setPlanUrl] = useState<string | null>(null);
  const [calib, setCalib] = useState<Point[]>([]);
  const drag = useRef<{ mode: 'loc' | 'pan' | 'vertex'; id?: string; idx?: number; start: Point; orig: Point } | null>(null);

  useEffect(() => {
    if (area) sessionStorage.setItem('layout-area', area.id);
    setView(fitView(points, areaPaths, area));
    setSel(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area?.id]);

  useEffect(() => {
    let u: string | null = null;
    let live = true;
    const a = attachments.find((x) => x.id === area?.plan?.attachmentId);
    if (a) blobUrl(a).then((x) => { u = x; if (live) setPlanUrl(x); });
    else setPlanUrl(null);
    return () => { live = false; if (u) URL.revokeObjectURL(u); };
  }, [area?.plan?.attachmentId, attachments]);

  const svgH = 0.6 * view.w;
  const toWorld = (e: { clientX: number; clientY: number }): Point => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const r = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: r.x, y: r.y };
  };

  const route = cables.find((c) => c.id === routeCable);
  const routeSet = new Set(route?.pathwayIds ?? []);
  const fills = useMemo(() => new Map(pathways.map((p) => [p.id, pathwayFill(data, p)])), [data, pathways]);

  const zoom = (f: number, about?: Point) => {
    const c = about ?? { x: view.x + view.w / 2, y: view.y + svgH / 2 };
    const w = Math.max(1000, Math.min(500000, view.w * f));
    const k = w / view.w;
    setView({ w, x: c.x - (c.x - view.x) * k, y: c.y - (c.y - view.y) * k });
  };

  const newPoint = (p: Point): Location => {
    const m = rackModels.find((r) => r.id === newModel);
    const isRack = RACK_KINDS.includes(newKind);
    const n = locations.filter((l) => l.kind === newKind).length + 1;
    const prefix = newKind === 'rack' ? 'R' : newKind === 'cabinet' ? 'CAB' : newKind === 'wall-outlet' ? 'WO' : newKind === 'pit' ? 'PIT' : newKind.slice(0, 3).toUpperCase();
    return {
      id: uid(), name: prefix + String(n).padStart(2, '0'), kind: newKind, parentId: area?.id, areaId: area?.id, x: snap(p.x), y: snap(p.y), rotation: 0,
      ...(isRack ? { modelId: m?.id, heightU: m?.heightU ?? 42, widthMm: m?.widthMm ?? 600, depthMm: m?.depthMm ?? 1200, devices: [] } : {}),
    };
  };

  const onDown = (e: React.PointerEvent) => {
    const p = toWorld(e);
    if (tool === 'calibrate') {
      const next = [...calib, p];
      if (next.length < 2) return setCalib(next);
      setCalib([]);
      setTool('select');
      if (!area?.plan) return;
      const ans = window.prompt('Real distance between the two points, in metres:');
      const m = Number(ans);
      if (!m || m <= 0) return;
      const px = Math.hypot(next[1].x - next[0].x, next[1].y - next[0].y) / area.plan.mmPerPx;
      upsert('locations', { ...area, plan: { ...area.plan, mmPerPx: (m * 1000) / px } });
      return;
    }
    if (tool === 'pan' || e.button === 1 || (tool === 'select' && (e.target === svgRef.current || (e.target as Element).tagName === 'image'))) {
      drag.current = { mode: 'pan', start: { x: e.clientX, y: e.clientY }, orig: { x: view.x, y: view.y } };
      (e.target as Element).setPointerCapture?.(e.pointerId);
      if (tool === 'select') setSel(null);
      return;
    }
    if (tool === 'point') {
      const l = newPoint(p);
      upsert('locations', l);
      setSel({ kind: 'loc', id: l.id });
      setTool('select');
      return;
    }
    if (tool === 'place' && placeId) {
      const l = locations.find((x) => x.id === placeId);
      if (l) upsert('locations', { ...l, areaId: area?.id, x: snap(p.x), y: snap(p.y), rotation: l.rotation ?? 0 });
      setSel({ kind: 'loc', id: placeId });
      setPlaceId('');
      setTool('select');
      return;
    }
    if (tool === 'pathway') setDraft([...draft, { x: snap(p.x), y: snap(p.y) }]);
  };

  const onMove = (e: React.PointerEvent) => {
    const p = toWorld(e);
    if (tool === 'pathway') setHoverPt({ x: snap(p.x), y: snap(p.y) });
    const d = drag.current;
    if (!d) return;
    if (d.mode === 'pan') {
      const scale = view.w / svgRef.current!.clientWidth;
      setView({ ...view, x: d.orig.x - (e.clientX - d.start.x) * scale, y: d.orig.y - (e.clientY - d.start.y) * scale });
    } else if (d.mode === 'loc' && d.id) {
      const r = locations.find((x) => x.id === d.id);
      if (r) upsert('locations', { ...r, x: snap(d.orig.x + p.x - d.start.x), y: snap(d.orig.y + p.y - d.start.y) });
    } else if (d.mode === 'vertex' && d.id != null && d.idx != null) {
      const pw = pathways.find((x) => x.id === d.id);
      if (pw) upsert('pathways', { ...pw, points: pw.points.map((q, i) => (i === d.idx ? { x: snap(p.x), y: snap(p.y) } : q)) });
    }
  };

  const finishPathway = () => {
    if (draft.length >= 2) {
      const pw = newPathway({ name: 'Pathway ' + (pathways.length + 1), points: draft, areaId: area?.id });
      upsert('pathways', pw);
      setSel({ kind: 'pathway', id: pw.id });
    }
    setDraft([]);
    setHoverPt(null);
    setTool('select');
  };

  const clickLoc = (e: React.PointerEvent, r: Location) => {
    e.stopPropagation();
    if (tool === 'drop') {
      const pw = pathways.find((p) => p.id === dropPath);
      if (!pw || pw.points.length < 2) return;
      const d: Drop = { id: uid(), pathwayId: pw.id, rackId: r.id, at: nearestOnPolyline(pw.points, { x: r.x!, y: r.y! }), entry: 'top-centre' };
      upsert('drops', d);
      setSel({ kind: 'drop', id: d.id });
      return;
    }
    if (tool !== 'select') return;
    setSel({ kind: 'loc', id: r.id });
    drag.current = { mode: 'loc', id: r.id, start: toWorld(e), orig: { x: r.x!, y: r.y! } };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const clickPathway = (e: React.PointerEvent, p: Pathway) => {
    if (tool === 'drop') { e.stopPropagation(); setDropPath(p.id); return; }
    if (tool !== 'select') return;
    e.stopPropagation();
    setSel({ kind: 'pathway', id: p.id });
  };

  const uploadPlan = async (f: File) => {
    if (!area) return;
    if (!f.type.startsWith('image/')) return alert('Upload the floor plan as an image (PNG or JPG). Export a PDF page to PNG first.');
    const a = await addFile(f, 'location', area.id, 'Floor plan', { compress: false });
    const bmp = await createImageBitmap(f);
    upsert('locations', { ...area, plan: { attachmentId: a.id, mmPerPx: area.plan?.mmPerPx ?? DEFAULT_MM_PER_PX, widthPx: bmp.width, heightPx: bmp.height, opacity: 0.6 } });
    setView(fitView([], [], { ...area, plan: { attachmentId: a.id, mmPerPx: DEFAULT_MM_PER_PX, widthPx: bmp.width, heightPx: bmp.height, opacity: 0.6 } }));
  };

  const selLoc = sel?.kind === 'loc' ? locations.find((r) => r.id === sel.id) : undefined;
  const selPath = sel?.kind === 'pathway' ? pathways.find((r) => r.id === sel.id) : undefined;
  const selDrop = sel?.kind === 'drop' ? drops.find((r) => r.id === sel.id) : undefined;
  const unplaced = locations.filter((l) => !AREA_KINDS.includes(l.kind) && (l.x == null || !l.areaId));

  const gridStep = view.w > 60000 ? 6000 : view.w > 20000 ? 1200 : 600;
  const lines = [];
  for (let x = Math.floor(view.x / gridStep) * gridStep; x < view.x + view.w; x += gridStep) lines.push(<line key={'x' + x} x1={x} x2={x} y1={view.y} y2={view.y + svgH} stroke="var(--grid)" strokeWidth={view.w / 1500} />);
  for (let y = Math.floor(view.y / gridStep) * gridStep; y < view.y + svgH; y += gridStep) lines.push(<line key={'y' + y} y1={y} y2={y} x1={view.x} x2={view.x + view.w} stroke="var(--grid)" strokeWidth={view.w / 1500} />);
  const fs = view.w / 70;

  if (!area)
    return (
      <>
        <div className="page-head"><h1>Floor layout</h1></div>
        <div className="card">
          <p>A layout is drawn per area (site, building, floor or room). Create one to start.</p>
          <button className="btn primary" onClick={() => { const a: Location = { id: uid(), name: 'Main floor', kind: 'floor' }; upsert('locations', a); setAreaId(a.id); }}>Create "Main floor"</button>
        </div>
      </>
    );

  return (
    <>
      <div className="page-head">
        <h1>Floor layout</h1>
        <div className="row">
          <select value={area.id} onChange={(e) => setAreaId(e.target.value)}>
            {areas.map((a) => <option key={a.id} value={a.id}>{LOCATION_KIND_LABEL[a.kind]}: {a.name}</option>)}
          </select>
          <select value={routeCable} onChange={(e) => setRouteCable(e.target.value)}>
            <option value="">Highlight cable route…</option>
            {cables.map((c) => <option key={c.id} value={c.id}>{c.tag}</option>)}
          </select>
        </div>
      </div>
      <div className="toolbar">
        {([['select', '↖ Select / move'], ['pan', '✋ Pan'], ['point', '▭ Add point'], ['pathway', '〰 Draw pathway'], ['drop', '⤓ Add drop']] as [Tool, string][]).map(([t, l]) => (
          <button key={t} className={'btn sm' + (tool === t ? ' active' : '')} onClick={() => { setTool(t); setDraft([]); setDropPath(''); setCalib([]); }}>{l}</button>
        ))}
        <button className="btn sm" onClick={() => setRowModal(true)}>+ Row of racks</button>
        <label className="btn sm">🗺 {area.plan ? 'Replace plan' : 'Upload plan'}<input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && uploadPlan(e.target.files[0])} /></label>
        {area.plan && <button className={'btn sm' + (tool === 'calibrate' ? ' active' : '')} onClick={() => { setTool('calibrate'); setCalib([]); }}>📏 Set scale</button>}
        <div className="spacer" />
        <button className="btn sm" onClick={() => zoom(0.8)}>＋</button>
        <button className="btn sm" onClick={() => zoom(1.25)}>－</button>
        <button className="btn sm" onClick={() => setView(fitView(points, areaPaths, area))}>Fit</button>
      </div>
      {tool === 'point' && (
        <div className="notice row">
          Click on the plan to place a
          <select value={newKind} onChange={(e) => setNewKind(e.target.value as LocationKind)}>
            {(Object.keys(LOCATION_KIND_LABEL) as LocationKind[]).filter((k) => !AREA_KINDS.includes(k)).map((k) => <option key={k} value={k}>{LOCATION_KIND_LABEL[k]}</option>)}
          </select>
          {RACK_KINDS.includes(newKind) && (
            <select value={newModel} onChange={(e) => setNewModel(e.target.value)}>
              {rackModels.map((m) => <option key={m.id} value={m.id}>{m.brand} {m.model} ({m.widthMm}x{m.depthMm})</option>)}
            </select>
          )}
        </div>
      )}
      {tool === 'pathway' && (
        <div className="notice row">
          Click points along the route (snaps to {SNAP} mm). Start or end on another pathway to join them. {draft.length} points.
          <button className="btn sm primary" onClick={finishPathway} disabled={draft.length < 2}>Finish</button>
          <button className="btn sm" onClick={() => setDraft(draft.slice(0, -1))}>Undo point</button>
        </div>
      )}
      {tool === 'drop' && <div className="notice">{dropPath ? `"${pathways.find((p) => p.id === dropPath)?.name}" selected. Now click the point it drops into.` : 'Click a pathway, then the point (rack, outlet...) it drops into.'}</div>}
      {tool === 'calibrate' && <div className="notice">Click two points on the plan a known distance apart (e.g. a gridline span), then enter the real distance. Do this before drawing, as the plan rescales.</div>}
      {tool === 'place' && <div className="notice">Click on the plan to place {locations.find((l) => l.id === placeId)?.name}.</div>}

      <div className="side-layout">
        <div className="canvas-wrap">
          <svg ref={svgRef} viewBox={`${view.x} ${view.y} ${view.w} ${svgH}`} preserveAspectRatio="xMidYMid meet"
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => (drag.current = null)}
            onDoubleClick={() => tool === 'pathway' && finishPathway()}
            onWheel={(e) => zoom(e.deltaY > 0 ? 1.15 : 0.87, toWorld(e))}
            style={{ cursor: tool === 'pan' ? 'grab' : tool === 'select' ? 'default' : 'crosshair' }}>
            {planUrl && area.plan && (
              <image href={planUrl} x={0} y={0} width={area.plan.widthPx * area.plan.mmPerPx} height={area.plan.heightPx * area.plan.mmPerPx} opacity={area.plan.opacity} preserveAspectRatio="none" />
            )}
            {lines}
            {areaPaths.map((p) => {
              const f = fills.get(p.id);
              const col = f?.status === 'over' ? 'var(--bad)' : f?.status === 'warn' ? 'var(--warn)' : '#64748b';
              const isSel = selPath?.id === p.id || dropPath === p.id;
              const pts = p.points.map((q) => `${q.x},${q.y}`).join(' ');
              const wMm = p.diameterMm ?? p.widthMm;
              return (
                <g key={p.id} onPointerDown={(e) => clickPathway(e, p)} style={{ cursor: 'pointer', opacity: route && !routeSet.has(p.id) ? 0.25 : 1 }}>
                  <polyline points={pts} fill="none" stroke={routeSet.has(p.id) ? '#2a78d6' : col} strokeOpacity={0.35} strokeWidth={Math.max(wMm, view.w / 300)} strokeLinejoin="round" />
                  <polyline points={pts} fill="none" stroke={isSel ? 'var(--accent)' : col} strokeWidth={view.w / 600} strokeDasharray={p.kind.includes('basket') ? `${view.w / 200} ${view.w / 400}` : undefined} />
                  <text x={p.points[0].x} y={p.points[0].y - wMm / 2 - fs * 0.4} fontSize={fs * 0.8} fill="var(--text)">
                    {p.code || p.name} · {p.diameterMm ? '⌀' + p.diameterMm : `${p.widthMm}x${p.depthMm}`} · {fmt(f?.fillPct ?? 0)}%
                  </text>
                  {isSel && tool === 'select' && p.points.map((q, i) => (
                    <circle key={i} cx={q.x} cy={q.y} r={view.w / 250} fill="var(--accent)"
                      onPointerDown={(e) => { e.stopPropagation(); drag.current = { mode: 'vertex', id: p.id, idx: i, start: q, orig: q }; (e.target as Element).setPointerCapture?.(e.pointerId); }} />
                  ))}
                </g>
              );
            })}
            {points.map((r) => {
              const isRack = RACK_KINDS.includes(r.kind);
              const isEnd = route && (route.fromRackId === r.id || route.toRackId === r.id);
              const isSel = selLoc?.id === r.id;
              const stroke = isSel ? 'var(--accent)' : 'var(--muted)';
              if (!isRack) {
                const rad = Math.max(150, view.w / 160);
                return (
                  <g key={r.id} onPointerDown={(e) => clickLoc(e, r)} style={{ cursor: tool === 'select' ? 'move' : 'pointer' }}>
                    <rect x={r.x! - rad} y={r.y! - rad} width={rad * 2} height={rad * 2} rx={r.kind === 'wall-outlet' ? rad * 0.3 : rad} fill={isEnd ? '#2a78d6' : 'var(--panel)'} stroke={stroke} strokeWidth={view.w / (isSel ? 400 : 900)} />
                    <text x={r.x! + rad * 1.3} y={r.y! + fs * 0.3} fontSize={fs * 0.85} fill="var(--text)">{r.code || r.name}</text>
                  </g>
                );
              }
              const w = (r.rotation ?? 0) % 180 === 0 ? r.widthMm ?? 600 : r.depthMm ?? 1200;
              const h = (r.rotation ?? 0) % 180 === 0 ? r.depthMm ?? 1200 : r.widthMm ?? 600;
              const x = r.x!, y = r.y!;
              const front = { 0: [x - w / 2, y + h / 2, x + w / 2, y + h / 2], 90: [x - w / 2, y - h / 2, x - w / 2, y + h / 2], 180: [x - w / 2, y - h / 2, x + w / 2, y - h / 2], 270: [x + w / 2, y - h / 2, x + w / 2, y + h / 2] }[r.rotation ?? 0];
              return (
                <g key={r.id} onPointerDown={(e) => clickLoc(e, r)} style={{ cursor: tool === 'select' ? 'move' : 'pointer' }}>
                  <rect x={x - w / 2} y={y - h / 2} width={w} height={h} fill={isEnd ? '#2a78d6' : 'var(--panel-2)'} fillOpacity={isEnd ? 0.35 : 1} stroke={stroke} strokeWidth={isSel ? view.w / 400 : view.w / 1200} />
                  <line x1={front[0]} y1={front[1]} x2={front[2]} y2={front[3]} stroke="var(--text)" strokeWidth={view.w / 500} />
                  <text x={x} y={y + fs * 0.3} fontSize={Math.min(fs, w / 2.5)} textAnchor="middle" fill="var(--text)">{r.code || r.name}</text>
                </g>
              );
            })}
            {drops.map((d) => {
              const r = points.find((x) => x.id === d.rackId);
              if (!r || !areaPaths.some((p) => p.id === d.pathwayId)) return null;
              return (
                <g key={d.id} onPointerDown={(e) => { if (tool === 'select') { e.stopPropagation(); setSel({ kind: 'drop', id: d.id }); } }} style={{ cursor: 'pointer' }}>
                  <line x1={d.at.x} y1={d.at.y} x2={r.x} y2={r.y} stroke="#eb6834" strokeWidth={view.w / 700} strokeDasharray={`${view.w / 300} ${view.w / 500}`} />
                  <circle cx={d.at.x} cy={d.at.y} r={view.w / 220} fill="#eb6834" stroke={selDrop?.id === d.id ? 'var(--accent)' : 'var(--panel)'} strokeWidth={view.w / 800} />
                </g>
              );
            })}
            {draft.length > 0 && <polyline points={[...draft, ...(hoverPt ? [hoverPt] : [])].map((q) => `${q.x},${q.y}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth={view.w / 400} strokeDasharray={`${view.w / 200}`} />}
            {calib.map((c, i) => <circle key={i} cx={c.x} cy={c.y} r={view.w / 200} fill="var(--bad)" />)}
            <g>
              <line x1={view.x + view.w * 0.03} x2={view.x + view.w * 0.03 + gridStep * 5} y1={view.y + svgH * 0.95} y2={view.y + svgH * 0.95} stroke="var(--text)" strokeWidth={view.w / 500} />
              <text x={view.x + view.w * 0.03} y={view.y + svgH * 0.95 - fs * 0.5} fontSize={fs * 0.8} fill="var(--text)">{fmt((gridStep * 5) / 1000, 1)} m (grid {gridStep} mm)</text>
            </g>
          </svg>
        </div>

        <div>
          {!sel && (
            <div className="card small">
              <h2>{area.name}</h2>
              <ol style={{ paddingLeft: 18, lineHeight: 1.7, margin: 0 }}>
                <li><b>Upload plan</b> (PNG/JPG), then <b>Set scale</b> with two points a known distance apart.</li>
                <li><b>Add point</b> or <b>+ Row of racks</b> to place racks, outlets, pits, closures…</li>
                <li><b>Draw pathway</b>: click along the route, Finish. Set type and size in the panel.</li>
                <li><b>Add drop</b>: pathway, then the point it drops into.</li>
                <li>On the Cable schedule, <b>Auto-route</b> finds the shortest path A → B and sets the design length.</li>
              </ol>
              <p className="muted">{points.length} points · {areaPaths.length} pathways · {fmt(areaPaths.reduce((a, p) => a + polylineLength(p.points), 0) / 1000, 1)} m drawn</p>
              {area.plan && (
                <Field label={`Plan opacity (${Math.round(area.plan.opacity * 100)}%) · scale ${fmt(area.plan.mmPerPx, 2)} mm/px`}>
                  <input type="range" min={0.1} max={1} step={0.05} value={area.plan.opacity} onChange={(e) => upsert('locations', { ...area, plan: { ...area.plan!, opacity: Number(e.target.value) } })} />
                </Field>
              )}
              {unplaced.length > 0 && (
                <>
                  <h3>Not yet on a plan ({unplaced.length})</h3>
                  <div className="row">
                    <select value={placeId} onChange={(e) => setPlaceId(e.target.value)} style={{ flex: 1, minWidth: 0 }}>
                      <option value="">Choose a point…</option>
                      {unplaced.map((l) => <option key={l.id} value={l.id}>{l.code || l.name} ({LOCATION_KIND_LABEL[l.kind]})</option>)}
                    </select>
                    <button className="btn sm" disabled={!placeId} onClick={() => setTool('place')}>Place</button>
                  </div>
                </>
              )}
            </div>
          )}
          {selLoc && (
            <div className="card">
              <h2>{selLoc.code || selLoc.name}</h2>
              <LocationForm value={selLoc} onChange={(l) => upsert('locations', l)} />
              {RACK_KINDS.includes(selLoc.kind) && (
                <Field label="Front faces">
                  <select value={selLoc.rotation ?? 0} onChange={(e) => upsert('locations', { ...selLoc, rotation: Number(e.target.value) as Location['rotation'] })}>
                    <option value={0}>Down</option><option value={90}>Left</option><option value={180}>Up</option><option value={270}>Right</option>
                  </select>
                </Field>
              )}
              <p className="small muted">Cables: {cables.filter((c) => c.fromRackId === selLoc.id || c.toRackId === selLoc.id).length} · Drops: {drops.filter((d) => d.rackId === selLoc.id).length}</p>
              <div className="row">
                {RACK_KINDS.includes(selLoc.kind) && <a className="btn sm" href="#racks" onClick={() => sessionStorage.setItem('rack-sel', selLoc.id)}>Open elevation</a>}
                <button className="btn sm" onClick={() => { upsert('locations', { ...selLoc, x: undefined, y: undefined }); setSel(null); }}>Remove from plan</button>
                <div className="spacer" />
                <button className="btn sm danger" onClick={() => {
                  if (!confirmDelete(selLoc.name)) return;
                  remove('locations', selLoc.id);
                  useStore.getState().removeMany('drops', drops.filter((d) => d.rackId === selLoc.id).map((d) => d.id));
                  setSel(null);
                }}>Delete</button>
              </div>
            </div>
          )}
          {selPath && (
            <div className="card">
              <h2>{selPath.name}</h2>
              <PathwayForm value={selPath} onChange={(p) => upsert('pathways', p)} compact />
              {(() => { const f = fills.get(selPath.id)!; return <p className="small">Length {fmt(polylineLength(selPath.points) / 1000, 1)} m · {f.cableCount} cables · fill <span className={'pill ' + (f.status === 'over' ? 'bad' : f.status === 'warn' ? 'warn' : 'ok')}>{fmt(f.fillPct, 1)}% / {f.limitPct}%</span></p>; })()}
              <div className="row">
                <div className="spacer" />
                <button className="btn sm danger" onClick={() => {
                  if (!confirmDelete(`pathway ${selPath.name}`)) return;
                  remove('pathways', selPath.id);
                  useStore.getState().removeMany('drops', drops.filter((d) => d.pathwayId === selPath.id).map((d) => d.id));
                  upsertMany('cables', cables.filter((c) => c.pathwayIds.includes(selPath.id)).map((c) => ({ ...c, pathwayIds: c.pathwayIds.filter((x) => x !== selPath.id) })));
                  setSel(null);
                }}>Delete</button>
              </div>
            </div>
          )}
          {selDrop && (
            <div className="card">
              <h2>Drop into {locations.find((r) => r.id === selDrop.rackId)?.name}</h2>
              <p className="small">From {pathways.find((p) => p.id === selDrop.pathwayId)?.name}</p>
              <div className="grid g2">
                <Field label="Entry">
                  <select value={selDrop.entry} onChange={(e) => upsert('drops', { ...selDrop, entry: e.target.value as Drop['entry'] })}>
                    <option value="top-left">Top left</option><option value="top-centre">Top centre</option><option value="top-right">Top right</option><option value="rear-left">Rear left</option><option value="rear-right">Rear right</option><option value="bottom">Bottom / floor</option>
                  </select>
                </Field>
                <Field label="Vertical drop length (m)"><Num value={selDrop.dropM} onChange={(v) => upsert('drops', { ...selDrop, dropM: v })} step={0.1} /></Field>
              </div>
              <Field label="Notes (waterfall, radius drop-out, slack loop)"><textarea rows={3} value={selDrop.notes ?? ''} onChange={(e) => upsert('drops', { ...selDrop, notes: e.target.value || undefined })} /></Field>
              <div className="row" style={{ marginTop: 8 }}>
                <div className="spacer" />
                <button className="btn sm danger" onClick={() => { remove('drops', selDrop.id); setSel(null); }}>Delete</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {rowModal && <RowModal onClose={() => setRowModal(false)} centre={{ x: view.x + view.w / 3, y: view.y + svgH / 3 }} areaId={area.id} />}
    </>
  );
}

function RowModal({ onClose, centre, areaId }: { onClose: () => void; centre: Point; areaId: string }) {
  const { rackModels, locations, upsertMany } = useStore();
  const [row, setRow] = useState('A');
  const [count, setCount] = useState<number | undefined>(10);
  const [model, setModel] = useState(rackModels.find((m) => m.brand === 'Vertiv')?.id ?? rackModels[0]?.id ?? '');
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [startNo, setStartNo] = useState<number | undefined>(1);
  const [codePrefix, setCodePrefix] = useState('');
  const m = rackModels.find((x) => x.id === model);
  const create = () => {
    const w = m?.widthMm ?? 600;
    const d = m?.depthMm ?? 1200;
    const step = rotation % 180 === 0 ? w : d;
    upsertMany('locations', Array.from({ length: count ?? 0 }, (_, i) => {
      const n = String((startNo ?? 1) + i).padStart(2, '0');
      return {
        id: uid(), name: `${row}${n}`, code: codePrefix ? `${codePrefix}${row}${n}` : undefined, kind: 'rack' as const, parentId: areaId, areaId,
        modelId: m?.id, heightU: m?.heightU ?? 42, widthMm: w, depthMm: d,
        x: snap(centre.x) + (rotation % 180 === 0 ? i * step : 0), y: snap(centre.y) + (rotation % 180 === 0 ? 0 : i * step), rotation, devices: [],
      };
    }));
    onClose();
  };
  return (
    <Modal title="Add a row of racks" onClose={onClose}>
      <div className="grid g2">
        <Field label="Row label (names = label + number)"><input value={row} onChange={(e) => setRow(e.target.value)} /></Field>
        <Field label="Number of racks"><Num value={count} onChange={setCount} min={1} /></Field>
        <Field label="First number"><Num value={startNo} onChange={setStartNo} min={0} /></Field>
        <Field label="Code prefix (e.g. TIA-606 space '1A.')"><input value={codePrefix} onChange={(e) => setCodePrefix(e.target.value)} /></Field>
        <Field label="Rack model">
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {rackModels.map((x) => <option key={x.id} value={x.id}>{x.brand} {x.model} ({x.widthMm}x{x.depthMm}, {x.heightU}U)</option>)}
          </select>
        </Field>
        <Field label="Fronts face">
          <select value={rotation} onChange={(e) => setRotation(Number(e.target.value) as 0 | 90 | 180 | 270)}>
            <option value={0}>Down (row left-right)</option><option value={180}>Up (row left-right)</option><option value={90}>Left (row up-down)</option><option value={270}>Right (row up-down)</option>
          </select>
        </Field>
      </div>
      <p className="small muted">Creates {count ?? 0} racks side by side. {locations.some((r) => r.name.startsWith(row) && r.kind === 'rack') ? `Racks starting "${row}" already exist; check names.` : ''}</p>
      <div className="row"><div className="spacer" /><button className="btn primary" onClick={create} disabled={!count}>Create row</button></div>
    </Modal>
  );
}
