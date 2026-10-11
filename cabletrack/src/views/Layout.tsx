import { useMemo, useRef, useState } from 'react';
import { uid, useStore } from '../store';
import { Field, Modal, Num, confirmDelete } from '../ui';
import { fmt, pathwayFill, polylineLength } from '../lib/calc';
import { PathwayForm, newPathway } from './Pathways';
import type { AppData, Drop, Pathway, Point, Rack } from '../types';

type Tool = 'select' | 'rack' | 'pathway' | 'drop' | 'pan';
type Sel = { kind: 'rack' | 'pathway' | 'drop'; id: string } | null;

const SNAP = 50;
const snap = (v: number) => Math.round(v / SNAP) * SNAP;

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

function fitView(racks: Rack[], pathways: Pathway[]) {
  const pts: Point[] = [...racks.map((r) => ({ x: r.x, y: r.y })), ...pathways.flatMap((p) => p.points)];
  if (pts.length === 0) return { x: -2000, y: -2000, w: 24000 };
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const minX = Math.min(...xs) - 2000, maxX = Math.max(...xs) + 2000, minY = Math.min(...ys) - 2000, maxY = Math.max(...ys) + 2000;
  const w = Math.max(maxX - minX, (maxY - minY) / 0.6);
  return { x: minX + (maxX - minX - w) / 2, y: minY + (maxY - minY - w * 0.6) / 2, w };
}

export default function Layout() {
  const data = useStore() as unknown as AppData;
  const { racks, pathways, drops, cables, rackModels } = data;
  const { upsert, remove, upsertMany } = useStore();
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState(() => fitView(racks, pathways));
  const [tool, setTool] = useState<Tool>('select');
  const [sel, setSel] = useState<Sel>(null);
  const [draft, setDraft] = useState<Point[]>([]);
  const [hoverPt, setHoverPt] = useState<Point | null>(null);
  const [dropPath, setDropPath] = useState<string>('');
  const [routeCable, setRouteCable] = useState('');
  const [rowModal, setRowModal] = useState(false);
  const [newModel, setNewModel] = useState(rackModels[0]?.id ?? '');
  const drag = useRef<{ mode: 'rack' | 'pan' | 'vertex'; id?: string; idx?: number; start: Point; orig: Point; moved: boolean } | null>(null);

  const svgH = 0.6 * view.w; // aspect approx
  const toWorld = (e: { clientX: number; clientY: number }): Point => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM()!.inverse();
    const r = pt.matrixTransform(m);
    return { x: r.x, y: r.y };
  };

  const route = cables.find((c) => c.id === routeCable);
  const routeSet = new Set(route?.pathwayIds ?? []);
  const fills = useMemo(() => new Map(pathways.map((p) => [p.id, pathwayFill(data, p)])), [data, pathways]);

  const zoom = (f: number, about?: Point) => {
    const c = about ?? { x: view.x + view.w / 2, y: view.y + svgH / 2 };
    const w = Math.max(1000, Math.min(200000, view.w * f));
    const k = w / view.w;
    setView({ w, x: c.x - (c.x - view.x) * k, y: c.y - (c.y - view.y) * k });
  };

  const fitAll = () => setView(fitView(racks, pathways));

  const onDown = (e: React.PointerEvent) => {
    const p = toWorld(e);
    if (tool === 'pan' || e.button === 1 || (tool === 'select' && e.target === svgRef.current)) {
      drag.current = { mode: 'pan', start: { x: e.clientX, y: e.clientY }, orig: { x: view.x, y: view.y }, moved: false };
      (e.target as Element).setPointerCapture?.(e.pointerId);
      if (tool === 'select') setSel(null);
      return;
    }
    if (tool === 'rack') {
      const m = rackModels.find((r) => r.id === newModel);
      const n = racks.length + 1;
      const r: Rack = { id: uid(), name: 'R' + String(n).padStart(2, '0'), building: '', room: '', row: '', modelId: m?.id, heightU: m?.heightU ?? 42, widthMm: m?.widthMm ?? 600, depthMm: m?.depthMm ?? 1200, x: snap(p.x), y: snap(p.y), rotation: 0, devices: [] };
      upsert('racks', r);
      setSel({ kind: 'rack', id: r.id });
      setTool('select');
      return;
    }
    if (tool === 'pathway') {
      setDraft([...draft, { x: snap(p.x), y: snap(p.y) }]);
    }
  };

  const onMove = (e: React.PointerEvent) => {
    const p = toWorld(e);
    if (tool === 'pathway') setHoverPt({ x: snap(p.x), y: snap(p.y) });
    const d = drag.current;
    if (!d) return;
    d.moved = true;
    if (d.mode === 'pan') {
      const svg = svgRef.current!;
      const scale = view.w / svg.clientWidth;
      setView({ ...view, x: d.orig.x - (e.clientX - d.start.x) * scale, y: d.orig.y - (e.clientY - d.start.y) * scale });
    } else if (d.mode === 'rack' && d.id) {
      const r = racks.find((x) => x.id === d.id);
      if (r) upsert('racks', { ...r, x: snap(d.orig.x + p.x - d.start.x), y: snap(d.orig.y + p.y - d.start.y) });
    } else if (d.mode === 'vertex' && d.id != null && d.idx != null) {
      const pw = pathways.find((x) => x.id === d.id);
      if (pw) upsert('pathways', { ...pw, points: pw.points.map((q, i) => (i === d.idx ? { x: snap(p.x), y: snap(p.y) } : q)) });
    }
  };
  const onUp = () => { drag.current = null; };

  const finishPathway = () => {
    if (draft.length >= 2) {
      const pw = newPathway({ name: 'Basket ' + (pathways.length + 1), points: draft });
      upsert('pathways', pw);
      setSel({ kind: 'pathway', id: pw.id });
    }
    setDraft([]);
    setHoverPt(null);
    setTool('select');
  };

  const clickRack = (e: React.PointerEvent, r: Rack) => {
    e.stopPropagation();
    if (tool === 'drop') {
      const pw = pathways.find((p) => p.id === dropPath);
      if (!pw || pw.points.length < 2) return;
      const at = nearestOnPolyline(pw.points, { x: r.x, y: r.y });
      const d: Drop = { id: uid(), pathwayId: pw.id, rackId: r.id, at, entry: 'top-centre' };
      upsert('drops', d);
      setSel({ kind: 'drop', id: d.id });
      return;
    }
    if (tool !== 'select') return;
    setSel({ kind: 'rack', id: r.id });
    drag.current = { mode: 'rack', id: r.id, start: toWorld(e), orig: { x: r.x, y: r.y }, moved: false };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const clickPathway = (e: React.PointerEvent, p: Pathway) => {
    if (tool === 'drop') { e.stopPropagation(); setDropPath(p.id); return; }
    if (tool !== 'select') return;
    e.stopPropagation();
    setSel({ kind: 'pathway', id: p.id });
  };

  const selRack = sel?.kind === 'rack' ? racks.find((r) => r.id === sel.id) : undefined;
  const selPath = sel?.kind === 'pathway' ? pathways.find((r) => r.id === sel.id) : undefined;
  const selDrop = sel?.kind === 'drop' ? drops.find((r) => r.id === sel.id) : undefined;

  const gridStep = view.w > 60000 ? 6000 : view.w > 20000 ? 1200 : 600;
  const gx0 = Math.floor(view.x / gridStep) * gridStep;
  const gy0 = Math.floor(view.y / gridStep) * gridStep;
  const lines = [];
  for (let x = gx0; x < view.x + view.w; x += gridStep) lines.push(<line key={'x' + x} x1={x} x2={x} y1={view.y} y2={view.y + svgH} stroke="var(--grid)" strokeWidth={view.w / 1500} />);
  for (let y = gy0; y < view.y + svgH; y += gridStep) lines.push(<line key={'y' + y} y1={y} y2={y} x1={view.x} x2={view.x + view.w} stroke="var(--grid)" strokeWidth={view.w / 1500} />);
  const fs = view.w / 70;

  return (
    <>
      <div className="page-head">
        <h1>Floor layout</h1>
        <div className="row">
          <select value={routeCable} onChange={(e) => setRouteCable(e.target.value)}>
            <option value="">Highlight cable route…</option>
            {cables.map((c) => <option key={c.id} value={c.id}>{c.tag}</option>)}
          </select>
        </div>
      </div>
      <div className="toolbar">
        {([['select', '↖ Select / move'], ['pan', '✋ Pan'], ['rack', '▭ Add rack'], ['pathway', '〰 Draw basket/tray'], ['drop', '⤓ Add drop']] as [Tool, string][]).map(([t, l]) => (
          <button key={t} className={'btn sm' + (tool === t ? ' active' : '')} onClick={() => { setTool(t); setDraft([]); setDropPath(''); }}>{l}</button>
        ))}
        <button className="btn sm" onClick={() => setRowModal(true)}>+ Row of racks</button>
        <div className="spacer" />
        <button className="btn sm" onClick={() => zoom(0.8)}>＋</button>
        <button className="btn sm" onClick={() => zoom(1.25)}>－</button>
        <button className="btn sm" onClick={fitAll}>Fit</button>
      </div>
      {tool === 'rack' && (
        <div className="notice row">
          Click on the plan to place a rack. Model:
          <select value={newModel} onChange={(e) => setNewModel(e.target.value)}>
            {rackModels.map((m) => <option key={m.id} value={m.id}>{m.brand} {m.model} ({m.widthMm}x{m.depthMm})</option>)}
          </select>
        </div>
      )}
      {tool === 'pathway' && (
        <div className="notice row">
          Click to add points along the basket route (snaps to {SNAP} mm). {draft.length} points.
          <button className="btn sm primary" onClick={finishPathway} disabled={draft.length < 2}>Finish</button>
          <button className="btn sm" onClick={() => setDraft(draft.slice(0, -1))}>Undo point</button>
        </div>
      )}
      {tool === 'drop' && <div className="notice">{dropPath ? `Basket "${pathways.find((p) => p.id === dropPath)?.name}" selected. Now click the rack it drops into.` : 'Click a basket/tray, then click the rack it drops into.'}</div>}

      <div className="side-layout">
        <div className="canvas-wrap">
          <svg
            ref={svgRef}
            viewBox={`${view.x} ${view.y} ${view.w} ${svgH}`}
            preserveAspectRatio="xMidYMid meet"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onDoubleClick={() => tool === 'pathway' && finishPathway()}
            onWheel={(e) => zoom(e.deltaY > 0 ? 1.15 : 0.87, toWorld(e))}
            style={{ cursor: tool === 'pan' ? 'grab' : tool === 'select' ? 'default' : 'crosshair' }}
          >
            {lines}
            {/* Pathways */}
            {pathways.map((p) => {
              const f = fills.get(p.id);
              const col = f?.status === 'over' ? 'var(--bad)' : f?.status === 'warn' ? 'var(--warn)' : '#64748b';
              const isSel = selPath?.id === p.id || dropPath === p.id;
              const dim = route && !routeSet.has(p.id);
              const pts = p.points.map((q) => `${q.x},${q.y}`).join(' ');
              return (
                <g key={p.id} onPointerDown={(e) => clickPathway(e, p)} style={{ cursor: 'pointer', opacity: dim ? 0.25 : 1 }}>
                  <polyline points={pts} fill="none" stroke={routeSet.has(p.id) ? '#2a78d6' : col} strokeOpacity={0.35} strokeWidth={Math.max(p.widthMm, view.w / 300)} strokeLinejoin="round" />
                  <polyline points={pts} fill="none" stroke={isSel ? 'var(--accent)' : col} strokeWidth={view.w / 600} strokeDasharray={p.kind === 'wire-basket' || p.kind === 'basket-liner' ? `${view.w / 200} ${view.w / 400}` : undefined} />
                  {p.points.length > 1 && (
                    <text x={p.points[0].x} y={p.points[0].y - p.widthMm / 2 - fs * 0.4} fontSize={fs * 0.8} fill="var(--text)">
                      {p.name} · {p.widthMm}x{p.depthMm} · {fmt(f?.fillPct ?? 0)}%
                    </text>
                  )}
                  {isSel && tool === 'select' && p.points.map((q, i) => (
                    <circle key={i} cx={q.x} cy={q.y} r={view.w / 250} fill="var(--accent)"
                      onPointerDown={(e) => { e.stopPropagation(); drag.current = { mode: 'vertex', id: p.id, idx: i, start: q, orig: q, moved: false }; (e.target as Element).setPointerCapture?.(e.pointerId); }} />
                  ))}
                </g>
              );
            })}
            {/* Racks */}
            {racks.map((r) => {
              const w = r.rotation % 180 === 0 ? r.widthMm : r.depthMm;
              const h = r.rotation % 180 === 0 ? r.depthMm : r.widthMm;
              const isEnd = route && (route.fromRackId === r.id || route.toRackId === r.id);
              const isSel = selRack?.id === r.id;
              // front indicator: line on the "front" side
              const front = { 0: [r.x - w / 2, r.y + h / 2, r.x + w / 2, r.y + h / 2], 90: [r.x - w / 2, r.y - h / 2, r.x - w / 2, r.y + h / 2], 180: [r.x - w / 2, r.y - h / 2, r.x + w / 2, r.y - h / 2], 270: [r.x + w / 2, r.y - h / 2, r.x + w / 2, r.y + h / 2] }[r.rotation];
              return (
                <g key={r.id} onPointerDown={(e) => clickRack(e, r)} style={{ cursor: tool === 'select' ? 'move' : 'pointer' }}>
                  <rect x={r.x - w / 2} y={r.y - h / 2} width={w} height={h} fill={isEnd ? '#2a78d6' : 'var(--panel-2)'} fillOpacity={isEnd ? 0.35 : 1} stroke={isSel ? 'var(--accent)' : 'var(--muted)'} strokeWidth={isSel ? view.w / 400 : view.w / 1200} />
                  <line x1={front[0]} y1={front[1]} x2={front[2]} y2={front[3]} stroke="var(--text)" strokeWidth={view.w / 500} />
                  <text x={r.x} y={r.y + fs * 0.3} fontSize={Math.min(fs, w / 2.5)} textAnchor="middle" fill="var(--text)">{r.name}</text>
                </g>
              );
            })}
            {/* Drops */}
            {drops.map((d) => {
              const r = racks.find((x) => x.id === d.rackId);
              if (!r) return null;
              const isSel = selDrop?.id === d.id;
              return (
                <g key={d.id} onPointerDown={(e) => { if (tool === 'select') { e.stopPropagation(); setSel({ kind: 'drop', id: d.id }); } }} style={{ cursor: 'pointer' }}>
                  <line x1={d.at.x} y1={d.at.y} x2={r.x} y2={r.y} stroke="#eb6834" strokeWidth={view.w / 700} strokeDasharray={`${view.w / 300} ${view.w / 500}`} />
                  <circle cx={d.at.x} cy={d.at.y} r={view.w / 220} fill="#eb6834" stroke={isSel ? 'var(--accent)' : 'var(--panel)'} strokeWidth={view.w / 800} />
                </g>
              );
            })}
            {/* Draft */}
            {draft.length > 0 && (
              <polyline points={[...draft, ...(hoverPt ? [hoverPt] : [])].map((q) => `${q.x},${q.y}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth={view.w / 400} strokeDasharray={`${view.w / 200}`} />
            )}
            {/* Scale bar */}
            <g>
              <line x1={view.x + view.w * 0.03} x2={view.x + view.w * 0.03 + gridStep * 5} y1={view.y + svgH * 0.95} y2={view.y + svgH * 0.95} stroke="var(--text)" strokeWidth={view.w / 500} />
              <text x={view.x + view.w * 0.03} y={view.y + svgH * 0.95 - fs * 0.5} fontSize={fs * 0.8} fill="var(--text)">{fmt((gridStep * 5) / 1000, 1)} m (grid {gridStep} mm)</text>
            </g>
          </svg>
        </div>

        <div>
          {!sel && (
            <div className="card small">
              <h2>How to use</h2>
              <ol style={{ paddingLeft: 18, lineHeight: 1.7, margin: 0 }}>
                <li><b>+ Row of racks</b> to lay out a row (e.g. 10 x Vertiv VR3300).</li>
                <li><b>Draw basket/tray</b>: click points along the route, then Finish. Set width/depth in the panel (drawn to scale).</li>
                <li><b>Add drop</b>: click a basket then a rack to mark where cables drop in.</li>
                <li>Route cables through baskets on the Cable schedule; fill updates live (grey OK, amber near limit, red over).</li>
                <li>Drag to pan, scroll to zoom. The thick edge on a rack is its front.</li>
              </ol>
              <p className="muted">{racks.length} racks · {pathways.length} pathways · {fmt(pathways.reduce((a, p) => a + polylineLength(p.points), 0) / 1000, 1)} m of basket drawn · {drops.length} drops</p>
            </div>
          )}
          {selRack && (
            <div className="card">
              <h2>Rack {selRack.name}</h2>
              <div className="grid g2">
                <Field label="Name"><input value={selRack.name} onChange={(e) => upsert('racks', { ...selRack, name: e.target.value })} /></Field>
                <Field label="Row"><input value={selRack.row} onChange={(e) => upsert('racks', { ...selRack, row: e.target.value })} /></Field>
                <Field label="Building"><input value={selRack.building} onChange={(e) => upsert('racks', { ...selRack, building: e.target.value })} /></Field>
                <Field label="Room / hall"><input value={selRack.room} onChange={(e) => upsert('racks', { ...selRack, room: e.target.value })} /></Field>
                <Field label="Model">
                  <select value={selRack.modelId ?? ''} onChange={(e) => {
                    const m = rackModels.find((x) => x.id === e.target.value);
                    upsert('racks', { ...selRack, modelId: m?.id, heightU: m?.heightU ?? selRack.heightU, widthMm: m?.widthMm ?? selRack.widthMm, depthMm: m?.depthMm ?? selRack.depthMm });
                  }}>
                    <option value="">Custom</option>
                    {rackModels.map((m) => <option key={m.id} value={m.id}>{m.brand} {m.model}</option>)}
                  </select>
                </Field>
                <Field label="Rotation (front faces)">
                  <select value={selRack.rotation} onChange={(e) => upsert('racks', { ...selRack, rotation: Number(e.target.value) as Rack['rotation'] })}>
                    <option value={0}>Down (0°)</option><option value={90}>Left (90°)</option><option value={180}>Up (180°)</option><option value={270}>Right (270°)</option>
                  </select>
                </Field>
                <Field label="Width mm"><Num value={selRack.widthMm} onChange={(v) => upsert('racks', { ...selRack, widthMm: v ?? 600, modelId: undefined })} /></Field>
                <Field label="Depth mm"><Num value={selRack.depthMm} onChange={(v) => upsert('racks', { ...selRack, depthMm: v ?? 1200, modelId: undefined })} /></Field>
                <Field label="Height U"><Num value={selRack.heightU} onChange={(v) => upsert('racks', { ...selRack, heightU: v ?? 42 })} /></Field>
              </div>
              <p className="small muted">Cables: {cables.filter((c) => c.fromRackId === selRack.id || c.toRackId === selRack.id).length} · Drops: {drops.filter((d) => d.rackId === selRack.id).length}</p>
              <div className="row">
                <a className="btn sm" href={'#racks'} onClick={() => sessionStorage.setItem('rack-sel', selRack.id)}>Open elevation</a>
                <div className="spacer" />
                <button className="btn sm danger" onClick={() => { if (confirmDelete(`rack ${selRack.name}`)) { remove('racks', selRack.id); useStore.setState({ drops: drops.filter((d) => d.rackId !== selRack.id) }); setSel(null); } }}>Delete</button>
              </div>
            </div>
          )}
          {selPath && (
            <div className="card">
              <h2>{selPath.name}</h2>
              <PathwayForm value={selPath} onChange={(p) => upsert('pathways', p)} />
              {(() => { const f = fills.get(selPath.id)!; return (
                <p className="small">Run length {fmt(polylineLength(selPath.points) / 1000, 1)} m · {f.cableCount} cables · fill <span className={'pill ' + (f.status === 'over' ? 'bad' : f.status === 'warn' ? 'warn' : 'ok')}>{fmt(f.fillPct, 1)}% / {selPath.fillLimitPct}%</span></p>
              ); })()}
              <div className="row">
                <div className="spacer" />
                <button className="btn sm danger" onClick={() => { if (confirmDelete(`pathway ${selPath.name}`)) { remove('pathways', selPath.id); useStore.setState({ drops: drops.filter((d) => d.pathwayId !== selPath.id) }); upsertMany('cables', cables.filter((c) => c.pathwayIds.includes(selPath.id)).map((c) => ({ ...c, pathwayIds: c.pathwayIds.filter((x) => x !== selPath.id) }))); setSel(null); } }}>Delete</button>
              </div>
            </div>
          )}
          {selDrop && (
            <div className="card">
              <h2>Drop into {racks.find((r) => r.id === selDrop.rackId)?.name}</h2>
              <p className="small">From {pathways.find((p) => p.id === selDrop.pathwayId)?.name}</p>
              <Field label="Rack entry">
                <select value={selDrop.entry} onChange={(e) => upsert('drops', { ...selDrop, entry: e.target.value as Drop['entry'] })}>
                  <option value="top-left">Top left</option><option value="top-centre">Top centre</option><option value="top-right">Top right</option><option value="rear-left">Rear left</option><option value="rear-right">Rear right</option>
                </select>
              </Field>
              <Field label="Notes (e.g. waterfall, radius drop-out, slack loop)"><textarea rows={3} value={selDrop.notes ?? ''} onChange={(e) => upsert('drops', { ...selDrop, notes: e.target.value || undefined })} /></Field>
              <div className="row" style={{ marginTop: 8 }}>
                <div className="spacer" />
                <button className="btn sm danger" onClick={() => { remove('drops', selDrop.id); setSel(null); }}>Delete</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {rowModal && <RowModal onClose={() => setRowModal(false)} centre={{ x: view.x + view.w / 3, y: view.y + svgH / 3 }} />}
    </>
  );
}

function RowModal({ onClose, centre }: { onClose: () => void; centre: Point }) {
  const { rackModels, racks, upsertMany } = useStore();
  const [row, setRow] = useState('A');
  const [count, setCount] = useState<number | undefined>(10);
  const [model, setModel] = useState(rackModels.find((m) => m.brand === 'Vertiv')?.id ?? rackModels[0]?.id ?? '');
  const [building, setBuilding] = useState('');
  const [room, setRoom] = useState('');
  const [rotation, setRotation] = useState<Rack['rotation']>(0);
  const [startNo, setStartNo] = useState<number | undefined>(1);
  const m = rackModels.find((x) => x.id === model);
  const create = () => {
    const w = m?.widthMm ?? 600;
    const d = m?.depthMm ?? 1200;
    const step = rotation % 180 === 0 ? w : d;
    const out: Rack[] = Array.from({ length: count ?? 0 }, (_, i) => ({
      id: uid(),
      name: `${row}${String((startNo ?? 1) + i).padStart(2, '0')}`,
      building, room, row,
      modelId: m?.id,
      heightU: m?.heightU ?? 42, widthMm: w, depthMm: d,
      x: snap(centre.x) + (rotation % 180 === 0 ? i * step : 0),
      y: snap(centre.y) + (rotation % 180 === 0 ? 0 : i * step),
      rotation,
      devices: [],
    }));
    upsertMany('racks', out);
    onClose();
  };
  return (
    <Modal title="Add a row of racks" onClose={onClose}>
      <div className="grid g2">
        <Field label="Row label (rack names = label + number)"><input value={row} onChange={(e) => setRow(e.target.value)} /></Field>
        <Field label="Number of racks"><Num value={count} onChange={setCount} min={1} /></Field>
        <Field label="First number"><Num value={startNo} onChange={setStartNo} min={0} /></Field>
        <Field label="Rack model">
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {rackModels.map((x) => <option key={x.id} value={x.id}>{x.brand} {x.model} ({x.widthMm}x{x.depthMm}, {x.heightU}U)</option>)}
          </select>
        </Field>
        <Field label="Building"><input value={building} onChange={(e) => setBuilding(e.target.value)} /></Field>
        <Field label="Room / hall"><input value={room} onChange={(e) => setRoom(e.target.value)} /></Field>
        <Field label="Fronts face">
          <select value={rotation} onChange={(e) => setRotation(Number(e.target.value) as Rack['rotation'])}>
            <option value={0}>Down (row runs left-right)</option><option value={180}>Up (row runs left-right)</option><option value={90}>Left (row runs up-down)</option><option value={270}>Right (row runs up-down)</option>
          </select>
        </Field>
      </div>
      <p className="small muted">Creates {count ?? 0} racks named {row}{String(startNo ?? 1).padStart(2, '0')}… placed side by side. {racks.some((r) => r.row === row) ? `Row ${row} already has racks; check names don't clash.` : ''}</p>
      <div className="row"><div className="spacer" /><button className="btn primary" onClick={create} disabled={!count}>Create row</button></div>
    </Modal>
  );
}
