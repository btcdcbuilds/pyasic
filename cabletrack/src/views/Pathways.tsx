import { useMemo, useState } from 'react';
import { uid, useStore } from '../store';
import { Bar, Empty, Field, Modal, Num, confirmDelete } from '../ui';
import { fmt, pathwayFill, polylineLength, remainingCapacity } from '../lib/calc';
import { PATHWAY_PRESETS, DEFAULT_FILL_LIMIT_PCT, FILL_GUIDANCE } from '../data/library';
import type { AppData, Pathway, PathwayKind } from '../types';

export const KIND_LABEL: Record<PathwayKind, string> = {
  'wire-basket': 'Wire basket',
  'basket-liner': 'Basket with liner',
  'solid-tray': 'Solid tray',
  ladder: 'Ladder rack',
  'fibre-raceway': 'Fibre raceway',
  conduit: 'Conduit',
};

export function newPathway(p: Partial<Pathway> = {}): Pathway {
  return { id: uid(), name: 'Basket ' + Math.floor(Math.random() * 900 + 100), kind: 'wire-basket', widthMm: 300, depthMm: 100, fillLimitPct: DEFAULT_FILL_LIMIT_PCT, points: [], ...p };
}

export default function Pathways() {
  const data = useStore() as unknown as AppData;
  const { pathways, cables, cableTypes } = data;
  const { upsert, remove } = useStore();
  const [edit, setEdit] = useState<Pathway | null>(null);
  const [selId, setSelId] = useState<string>('');
  const sel = pathways.find((p) => p.id === selId) ?? pathways[0];

  return (
    <>
      <div className="page-head">
        <h1>Trays &amp; baskets</h1>
        <button className="btn primary" onClick={() => setEdit(newPathway())}>+ Pathway</button>
      </div>
      <div className="notice">{FILL_GUIDANCE}</div>
      <div className="side-layout">
        <div className="card">
          <h2>Pathways</h2>
          {pathways.length === 0 ? (
            <Empty>No trays/baskets yet. Add one here, or draw them on the Floor layout.</Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Name</th><th>Type</th><th className="num">W x D (mm)</th><th className="num">Run (m)</th><th className="num">Cables</th><th style={{ width: 160 }}>Fill</th><th /></tr>
                </thead>
                <tbody>
                  {pathways.map((p) => {
                    const f = pathwayFill(data, p);
                    return (
                      <tr key={p.id} onClick={() => setSelId(p.id)} style={{ cursor: 'pointer', background: sel?.id === p.id ? 'var(--panel-2)' : undefined }}>
                        <td><b>{p.name}</b>{p.brand && <div className="small muted">{p.brand}</div>}</td>
                        <td className="small">{KIND_LABEL[p.kind]}</td>
                        <td className="num">{p.widthMm} x {p.depthMm}</td>
                        <td className="num">{p.points.length > 1 ? fmt(polylineLength(p.points) / 1000, 1) : '—'}</td>
                        <td className="num">{f.cableCount}</td>
                        <td>
                          <div className="row" style={{ flexWrap: 'nowrap' }}>
                            <div style={{ flex: 1 }}><Bar pct={(f.fillPct / p.fillLimitPct) * 100} color={f.status === 'over' ? 'var(--bad)' : f.status === 'warn' ? 'var(--warn)' : 'var(--ok)'} /></div>
                            <span className={'pill ' + (f.status === 'over' ? 'bad' : f.status === 'warn' ? 'warn' : 'ok')}>{fmt(f.fillPct, 1)}%</span>
                          </div>
                          {f.missingOd > 0 && <div className="small" style={{ color: 'var(--warn)' }}>{f.missingOd} cables have no OD set</div>}
                        </td>
                        <td><button className="btn sm" onClick={(e) => (e.stopPropagation(), setEdit(p))}>Edit</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div>
          {sel && <FillDetail data={data} pathway={sel} />}
        </div>
      </div>

      {edit && (
        <Modal title={pathways.some((p) => p.id === edit.id) ? `Edit ${edit.name}` : 'New pathway'} onClose={() => setEdit(null)}>
          <PathwayForm value={edit} onChange={setEdit} />
          <h3>Cables routed through this pathway</h3>
          <div style={{ maxHeight: 200, overflowY: 'auto' }} className="row">
            {cables.length === 0 && <span className="muted small">No cables in schedule.</span>}
            {cables.map((c) => {
              const on = c.pathwayIds.includes(edit.id);
              return (
                <label key={c.id} className="row small" style={{ gap: 4, minWidth: 120 }}>
                  <input type="checkbox" checked={on} onChange={(e) => upsert('cables', { ...c, pathwayIds: e.target.checked ? [...c.pathwayIds, edit.id] : c.pathwayIds.filter((x) => x !== edit.id) })} />
                  {c.tag} <span className="muted">({cableTypes.find((t) => t.id === c.typeId)?.fibreCount ?? ''}F)</span>
                </label>
              );
            })}
          </div>
          <div className="row" style={{ marginTop: 16 }}>
            {pathways.some((p) => p.id === edit.id) && (
              <button className="btn danger" onClick={() => {
                if (!confirmDelete(`pathway ${edit.name}`)) return;
                remove('pathways', edit.id);
                for (const c of cables.filter((c) => c.pathwayIds.includes(edit.id))) upsert('cables', { ...c, pathwayIds: c.pathwayIds.filter((x) => x !== edit.id) });
                setEdit(null);
              }}>Delete</button>
            )}
            <div className="spacer" />
            <button className="btn primary" onClick={() => { upsert('pathways', edit); setSelId(edit.id); setEdit(null); }}>Save</button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function PathwayForm({ value, onChange }: { value: Pathway; onChange: (p: Pathway) => void }) {
  const set = (p: Partial<Pathway>) => onChange({ ...value, ...p });
  return (
    <div className="grid" style={{ gridTemplateColumns: '1fr' }}>
      <Field label="Preset (sizes from manufacturer catalogues - see Cable library > Sources)">
        <select value="" onChange={(e) => {
          const pr = PATHWAY_PRESETS[Number(e.target.value)];
          if (pr) set({ brand: pr.brand + ' ' + pr.productLine, widthMm: pr.widthMm, depthMm: pr.depthMm, kind: pr.kind });
        }}>
          <option value="">— choose a preset or enter sizes below —</option>
          {PATHWAY_PRESETS.map((p, i) => (
            <option key={i} value={i}>{p.brand} {p.productLine} {p.widthMm} x {p.depthMm} mm</option>
          ))}
        </select>
      </Field>
      <div className="grid g2">
        <Field label="Name"><input value={value.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Type">
          <select value={value.kind} onChange={(e) => set({ kind: e.target.value as PathwayKind })}>
            {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Usable width (mm)"><Num value={value.widthMm} onChange={(v) => set({ widthMm: v ?? 0 })} /></Field>
        <Field label="Usable depth (mm)"><Num value={value.depthMm} onChange={(v) => set({ depthMm: v ?? 0 })} /></Field>
        <Field label="Fill limit (%)"><Num value={value.fillLimitPct} onChange={(v) => set({ fillLimitPct: v ?? DEFAULT_FILL_LIMIT_PCT })} /></Field>
        <Field label="Height above floor (mm)"><Num value={value.elevationMm} onChange={(v) => set({ elevationMm: v })} /></Field>
        <Field label="Brand / product"><input value={value.brand ?? ''} onChange={(e) => set({ brand: e.target.value || undefined })} /></Field>
      </div>
      <Field label="Notes"><textarea rows={2} value={value.notes ?? ''} onChange={(e) => set({ notes: e.target.value || undefined })} /></Field>
    </div>
  );
}

/** Greedy gravity packing of circles into a rectangle cross-section (for visualisation only). */
function packCircles(width: number, ods: number[]) {
  const placed: { x: number; y: number; r: number; i: number }[] = [];
  const order = ods.map((d, i) => ({ d, i })).sort((a, b) => b.d - a.d);
  for (const { d, i } of order) {
    const r = d / 2;
    let best: { x: number; y: number } | null = null;
    const step = Math.max(1, r / 3);
    for (let x = r; x <= width - r + 0.01; x += step) {
      let y = r;
      for (const p of placed) {
        const dx = Math.abs(p.x - x);
        const rr = p.r + r;
        if (dx < rr) y = Math.max(y, p.y + Math.sqrt(rr * rr - dx * dx));
      }
      if (!best || y < best.y - 0.01) best = { x, y };
    }
    if (best) placed.push({ ...best, r, i });
  }
  return placed;
}

function FillDetail({ data, pathway }: { data: AppData; pathway: Pathway }) {
  const types = new Map(data.cableTypes.map((t) => [t.id, t]));
  const [whatIf, setWhatIf] = useState(data.cableTypes.find((t) => t.odMm)?.id ?? '');
  const [addN, setAddN] = useState<number | undefined>(0);
  const cs = data.cables.filter((c) => c.pathwayIds.includes(pathway.id));
  const wt = types.get(whatIf);
  const extra = wt?.odMm && addN ? [{ odMm: wt.odMm, count: addN }] : [];
  const f = pathwayFill(data, pathway, extra);
  const ods = [...cs.map((c) => types.get(c.typeId)?.odMm ?? 0).filter((x) => x > 0), ...(wt?.odMm ? Array(Math.min(addN ?? 0, 300)).fill(wt.odMm) : [])];
  const circles = useMemo(() => packCircles(pathway.widthMm, ods.slice(0, 400)), [pathway.widthMm, ods.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const stackH = Math.max(pathway.depthMm, ...circles.map((c) => c.y + c.r));
  const pad = 10;
  const W = pathway.widthMm + pad * 2;
  const H = stackH + pad * 2;
  const nExisting = cs.filter((c) => types.get(c.typeId)?.odMm).length;
  const weight = cs.reduce((a, c) => a + (types.get(c.typeId)?.weightKgKm ?? 0), 0);

  return (
    <div className="card">
      <h2>{pathway.name} - cross-section</h2>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', maxHeight: 260, background: 'var(--panel-2)', borderRadius: 8 }}>
        <g transform={`translate(${pad} ${H - pad}) scale(1 -1)`}>
          <rect x={0} y={pathway.depthMm * (pathway.fillLimitPct / 100)} width={pathway.widthMm} height={0.6} fill="var(--warn)" />
          <polyline points={`0,${pathway.depthMm} 0,0 ${pathway.widthMm},0 ${pathway.widthMm},${pathway.depthMm}`} fill="none" stroke="var(--muted)" strokeWidth={3} />
          {circles.map((c, k) => (
            <circle key={k} cx={c.x} cy={c.y} r={c.r - 0.3} fill={c.i >= nExisting ? '#eb6834' : '#2a78d6'} fillOpacity={0.85} stroke="var(--panel)" strokeWidth={0.6} />
          ))}
        </g>
      </svg>
      <div className="small muted" style={{ margin: '4px 0 10px' }}>
        Illustrative packing only. Blue = routed cables, orange = what-if. Amber line = fill limit as a share of depth.
      </div>
      <table>
        <tbody>
          <tr><th>Cross-section</th><td className="num">{fmt(f.pathwayAreaMm2)} mm²</td></tr>
          <tr><th>Cable area</th><td className="num">{fmt(f.cableAreaMm2)} mm²</td></tr>
          <tr><th>Fill</th><td className="num"><span className={'pill ' + (f.status === 'over' ? 'bad' : f.status === 'warn' ? 'warn' : 'ok')}>{fmt(f.fillPct, 1)}% of {pathway.fillLimitPct}% limit</span></td></tr>
          <tr><th>Cables</th><td className="num">{f.cableCount}</td></tr>
          <tr><th>Cable weight</th><td className="num">{weight ? fmt(weight / 1000, 2) + ' kg/m' : '—'}</td></tr>
          {stackH > pathway.depthMm && <tr><td colSpan={2} style={{ color: 'var(--bad)' }}>Packed stack exceeds basket depth.</td></tr>}
        </tbody>
      </table>
      <h3>What-if / spare capacity</h3>
      <div className="row">
        <select value={whatIf} onChange={(e) => setWhatIf(e.target.value)} style={{ flex: 1, minWidth: 0 }}>
          {data.cableTypes.filter((t) => t.odMm).map((t) => <option key={t.id} value={t.id}>{t.name} ({t.odMm} mm)</option>)}
        </select>
        <Num value={addN} onChange={setAddN} min={0} style={{ width: 80 }} />
      </div>
      {wt?.odMm ? (
        <p className="small">Room for about <b>{remainingCapacity(pathwayFill(data, pathway), wt.odMm)}</b> more {wt.name} before the {pathway.fillLimitPct}% limit.</p>
      ) : (
        <p className="small muted">Set an outer diameter on a cable type in the Cable library to use the calculator.</p>
      )}
    </div>
  );
}

export { polylineLength };
