import { useMemo, useState } from 'react';
import { uid, useStore } from '../store';
import { Bar, Empty, Field, Modal, Num, confirmDelete } from '../ui';
import { fmt, pathwayFill, remainingCapacity } from '../lib/calc';
import { pathwayLengthM } from '../lib/route';
import { PATHWAY_PRESETS, DEFAULT_FILL_LIMIT_PCT, FILL_GUIDANCE } from '../data/library';
import { PATHWAY_KIND_LABEL, ROUND_KINDS, OPEN_KINDS, conduitFillLimit } from '../data/norms';
import { Attachments, LocationSelect, locationPath } from '../components';
import type { AppData, Pathway, PathwayKind } from '../types';
import { AREA_KINDS } from '../types';

export const KIND_LABEL = PATHWAY_KIND_LABEL;

export function newPathway(p: Partial<Pathway> = {}): Pathway {
  return { id: uid(), name: 'Pathway', kind: 'wire-basket', widthMm: 300, depthMm: 100, fillLimitPct: DEFAULT_FILL_LIMIT_PCT, points: [], ...p };
}

export const sizeLabel = (p: Pathway) =>
  ROUND_KINDS.includes(p.kind) && p.diameterMm ? `⌀${p.diameterMm}` : OPEN_KINDS.includes(p.kind) ? '—' : `${p.widthMm} x ${p.depthMm}`;

export default function Pathways() {
  const data = useStore() as unknown as AppData;
  const { pathways, cables, cableTypes, locations } = data;
  const { upsert, remove, upsertMany } = useStore();
  const [edit, setEdit] = useState<Pathway | null>(null);
  const [selId, setSelId] = useState<string>('');
  const [q, setQ] = useState('');
  const sel = pathways.find((p) => p.id === selId) ?? pathways[0];
  const list = pathways.filter((p) => !q || (p.name + ' ' + (p.code ?? '') + ' ' + PATHWAY_KIND_LABEL[p.kind]).toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <div className="page-head">
        <h1>Pathways</h1>
        <button className="btn primary" onClick={() => setEdit(newPathway({ name: 'Pathway ' + (pathways.length + 1) }))}>+ Pathway</button>
      </div>
      <div className="notice">
        A pathway is anything cable runs through: tray, basket, ladder, conduit, duct, trunking, riser, J-hooks. Draw it on a floor plan (Floor layout) or enter it here as "from point A to point B, length". {FILL_GUIDANCE}
      </div>
      <div className="side-layout">
        <div className="card">
          <input placeholder="Search pathways…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
          {list.length === 0 ? (
            <Empty>No pathways yet.</Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Name</th><th>Type</th><th className="num">Size (mm)</th><th className="num">Length m</th><th>Route</th><th className="num">Cables</th><th style={{ width: 150 }}>Fill</th><th /></tr>
                </thead>
                <tbody>
                  {list.map((p) => {
                    const f = pathwayFill(data, p);
                    const open = OPEN_KINDS.includes(p.kind);
                    return (
                      <tr key={p.id} onClick={() => setSelId(p.id)} style={{ cursor: 'pointer', background: sel?.id === p.id ? 'var(--panel-2)' : undefined }}>
                        <td><b>{p.code || p.name}</b>{p.code && <div className="small muted">{p.name}</div>}</td>
                        <td className="small">{PATHWAY_KIND_LABEL[p.kind]}</td>
                        <td className="num">{sizeLabel(p)}</td>
                        <td className="num">{fmt(pathwayLengthM(p), 1)}</td>
                        <td className="small">{p.points.length > 1 ? `drawn on ${locationPath(locations, p.areaId) || 'plan'}` : p.fromId ? `${locationPath(locations, p.fromId)} → ${locationPath(locations, p.toId)}` : <span className="muted">not placed</span>}</td>
                        <td className="num">{f.cableCount}</td>
                        <td>
                          {open ? <span className="muted small">n/a</span> : (
                            <>
                              <div className="row" style={{ flexWrap: 'nowrap' }}>
                                <div style={{ flex: 1 }}><Bar pct={(f.fillPct / f.limitPct) * 100} color={f.status === 'over' ? 'var(--bad)' : f.status === 'warn' ? 'var(--warn)' : 'var(--ok)'} /></div>
                                <span className={'pill ' + (f.status === 'over' ? 'bad' : f.status === 'warn' ? 'warn' : 'ok')}>{fmt(f.fillPct, 1)}%</span>
                              </div>
                              {f.missingOd > 0 && <div className="small" style={{ color: 'var(--warn)' }}>{f.missingOd} cables have no OD</div>}
                            </>
                          )}
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
        <div>{sel && <FillDetail data={data} pathway={sel} />}</div>
      </div>

      {edit && (
        <Modal title={pathways.some((p) => p.id === edit.id) ? `Edit ${edit.name}` : 'New pathway'} onClose={() => setEdit(null)} wide>
          <PathwayForm value={edit} onChange={setEdit} />
          <h3>Cables routed through this pathway</h3>
          <div style={{ maxHeight: 180, overflowY: 'auto' }} className="row">
            {cables.length === 0 && <span className="muted small">No cables in schedule.</span>}
            {cables.map((c) => (
              <label key={c.id} className="row small" style={{ gap: 4, minWidth: 120 }}>
                <input type="checkbox" checked={c.pathwayIds.includes(edit.id)} onChange={(e) => upsert('cables', { ...c, pathwayIds: e.target.checked ? [...c.pathwayIds, edit.id] : c.pathwayIds.filter((x) => x !== edit.id) })} />
                {c.tag} <span className="muted">({cableTypes.find((t) => t.id === c.typeId)?.fibreCount ?? ''}F)</span>
              </label>
            ))}
          </div>
          {pathways.some((p) => p.id === edit.id) && <Attachments entity="pathway" entityId={edit.id} />}
          <div className="row" style={{ marginTop: 16 }}>
            {pathways.some((p) => p.id === edit.id) && (
              <button className="btn danger" onClick={() => {
                if (!confirmDelete(`pathway ${edit.name}`)) return;
                remove('pathways', edit.id);
                upsertMany('cables', cables.filter((c) => c.pathwayIds.includes(edit.id)).map((c) => ({ ...c, pathwayIds: c.pathwayIds.filter((x) => x !== edit.id) })));
                useStore.getState().removeMany('drops', data.drops.filter((d) => d.pathwayId === edit.id).map((d) => d.id));
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

export function PathwayForm({ value, onChange, compact }: { value: Pathway; onChange: (p: Pathway) => void; compact?: boolean }) {
  const set = (p: Partial<Pathway>) => onChange({ ...value, ...p });
  const round = ROUND_KINDS.includes(value.kind);
  const open = OPEN_KINDS.includes(value.kind);
  return (
    <div className="grid" style={{ gridTemplateColumns: '1fr' }}>
      {!round && !open && (
        <Field label="Preset (sizes from manufacturer catalogues - see Library > Sources)">
          <select value="" onChange={(e) => {
            const pr = PATHWAY_PRESETS[Number(e.target.value)];
            if (pr) set({ brand: pr.brand + ' ' + pr.productLine, widthMm: pr.widthMm, depthMm: pr.depthMm, kind: pr.kind });
          }}>
            <option value="">— choose a preset or enter sizes below —</option>
            {PATHWAY_PRESETS.map((p, i) => <option key={i} value={i}>{p.brand} {p.productLine} {p.widthMm} x {p.depthMm} mm</option>)}
          </select>
        </Field>
      )}
      <div className={compact ? 'grid g2' : 'grid g3'}>
        <Field label="Name"><input value={value.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Identifier / code"><input value={value.code ?? ''} onChange={(e) => set({ code: e.target.value || undefined })} /></Field>
        <Field label="Type">
          <select value={value.kind} onChange={(e) => set({ kind: e.target.value as PathwayKind })}>
            {Object.entries(PATHWAY_KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        {round ? (
          <Field label="Internal diameter (mm)"><Num value={value.diameterMm} onChange={(v) => set({ diameterMm: v })} /></Field>
        ) : !open ? (
          <>
            <Field label="Usable width (mm)"><Num value={value.widthMm} onChange={(v) => set({ widthMm: v ?? 0 })} /></Field>
            <Field label="Usable depth (mm)"><Num value={value.depthMm} onChange={(v) => set({ depthMm: v ?? 0 })} /></Field>
          </>
        ) : null}
        {!open && (round ? (
          <Field label={value.fillOverride ? 'Fill limit (%)' : 'Fill limit: NEC Ch.9 by cable count'}>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input type="checkbox" checked={!!value.fillOverride} onChange={(e) => set({ fillOverride: e.target.checked })} title="Override" />
              {value.fillOverride ? <Num value={value.fillLimitPct} onChange={(v) => set({ fillLimitPct: v ?? 40 })} /> : <span className="small muted">53% / 31% / 40% (tick to override)</span>}
            </div>
          </Field>
        ) : (
          <Field label="Fill limit (%)"><Num value={value.fillLimitPct} onChange={(v) => set({ fillLimitPct: v ?? DEFAULT_FILL_LIMIT_PCT })} /></Field>
        ))}
        <Field label="Height above floor (mm)"><Num value={value.elevationMm} onChange={(v) => set({ elevationMm: v })} /></Field>
        <Field label="Brand / product"><input value={value.brand ?? ''} onChange={(e) => set({ brand: e.target.value || undefined })} /></Field>
      </div>
      {value.points.length < 2 && !compact && (
        <>
          <h3 style={{ marginBottom: 0 }}>Route (if not drawn on a plan)</h3>
          <div className="grid g3">
            <Field label="From point"><LocationSelect value={value.fromId} onChange={(id) => set({ fromId: id })} /></Field>
            <Field label="To point"><LocationSelect value={value.toId} onChange={(id) => set({ toId: id })} /></Field>
            <Field label="Length (m)"><Num value={value.lengthM} onChange={(v) => set({ lengthM: v })} step={0.1} /></Field>
          </div>
        </>
      )}
      {value.points.length >= 2 && !compact && (
        <Field label="Drawn on plan of"><LocationSelect value={value.areaId} onChange={(id) => set({ areaId: id })} kinds={AREA_KINDS} /></Field>
      )}
      {!compact && <Field label="Notes"><textarea rows={2} value={value.notes ?? ''} onChange={(e) => set({ notes: e.target.value || undefined })} /></Field>}
    </div>
  );
}

/** Greedy gravity packing of circles into the cross-section (visualisation only). */
function packCircles(width: number, ods: number[], round?: number) {
  const placed: { x: number; y: number; r: number; i: number }[] = [];
  const order = ods.map((d, i) => ({ d, i })).sort((a, b) => b.d - a.d);
  const R = round ? round / 2 : 0;
  for (const { d, i } of order) {
    const r = d / 2;
    let best: { x: number; y: number } | null = null;
    const step = Math.max(1, r / 3);
    for (let x = r; x <= width - r + 0.01; x += step) {
      // floor: flat, or the bottom of the circular duct
      let y = r;
      if (R) {
        const dx = x - R;
        if (Math.abs(dx) > R - r) continue;
        y = R - Math.sqrt((R - r) ** 2 - dx * dx);
      }
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
  const round = ROUND_KINDS.includes(pathway.kind) && !!pathway.diameterMm;
  const open = OPEN_KINDS.includes(pathway.kind);
  const cs = data.cables.filter((c) => c.pathwayIds.includes(pathway.id));
  const wt = types.get(whatIf);
  const extra = wt?.odMm && addN ? [{ odMm: wt.odMm, count: addN }] : [];
  const f = pathwayFill(data, pathway, extra);
  const W0 = round ? pathway.diameterMm! : pathway.widthMm;
  const D0 = round ? pathway.diameterMm! : pathway.depthMm;
  const ods = [...cs.map((c) => types.get(c.typeId)?.odMm ?? 0).filter((x) => x > 0), ...(wt?.odMm ? Array(Math.min(addN ?? 0, 300)).fill(wt.odMm) : [])];
  const circles = useMemo(() => packCircles(W0, ods.slice(0, 400), round ? W0 : undefined), [W0, round, ods.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const stackH = Math.max(D0, ...circles.map((c) => c.y + c.r));
  const pad = Math.max(10, W0 * 0.03);
  const W = W0 + pad * 2;
  const H = stackH + pad * 2;
  const nExisting = cs.filter((c) => types.get(c.typeId)?.odMm).length;
  const weight = cs.reduce((a, c) => a + (types.get(c.typeId)?.weightKgKm ?? 0), 0);
  const capacity = wt?.odMm ? remainingCapacity(pathwayFill(data, pathway), wt.odMm) : 0;

  return (
    <div className="card">
      <h2>{pathway.code || pathway.name} - cross-section</h2>
      {open ? (
        <p className="small muted">{PATHWAY_KIND_LABEL[pathway.kind]}: no cross-section fill applies. {cs.length} cables.</p>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', maxHeight: 260, background: 'var(--panel-2)', borderRadius: 8 }}>
            <g transform={`translate(${pad} ${H - pad}) scale(1 -1)`}>
              {round ? (
                <circle cx={W0 / 2} cy={W0 / 2} r={W0 / 2} fill="none" stroke="var(--muted)" strokeWidth={Math.max(1.5, W0 / 80)} />
              ) : (
                <>
                  <rect x={0} y={D0 * (f.limitPct / 100)} width={W0} height={Math.max(0.6, D0 / 150)} fill="var(--warn)" />
                  <polyline points={`0,${D0} 0,0 ${W0},0 ${W0},${D0}`} fill="none" stroke="var(--muted)" strokeWidth={Math.max(2, W0 / 150)} />
                </>
              )}
              {circles.map((c, k) => (
                <circle key={k} cx={c.x} cy={c.y} r={Math.max(0.1, c.r - 0.3)} fill={c.i >= nExisting ? '#eb6834' : '#2a78d6'} fillOpacity={0.85} stroke="var(--panel)" strokeWidth={0.6} />
              ))}
            </g>
          </svg>
          <div className="small muted" style={{ margin: '4px 0 10px' }}>
            Illustrative packing. Blue = routed cables, orange = what-if.{!round && ' Amber line = fill limit as a share of depth.'}
          </div>
        </>
      )}
      <table>
        <tbody>
          <tr><th>Length</th><td className="num">{fmt(pathwayLengthM(pathway), 1)} m</td></tr>
          {!open && <tr><th>Cross-section</th><td className="num">{fmt(f.pathwayAreaMm2)} mm²</td></tr>}
          {!open && <tr><th>Cable area</th><td className="num">{fmt(f.cableAreaMm2)} mm²</td></tr>}
          {!open && <tr><th>Fill</th><td className="num"><span className={'pill ' + (f.status === 'over' ? 'bad' : f.status === 'warn' ? 'warn' : 'ok')}>{fmt(f.fillPct, 1)}% of {f.limitPct}% limit</span></td></tr>}
          {round && !pathway.fillOverride && <tr><td colSpan={2} className="small muted">Limit {conduitFillLimit(f.cableCount)}% for {f.cableCount} cable(s) (NEC Ch.9 Table 1).</td></tr>}
          <tr><th>Cables</th><td className="num">{f.cableCount}</td></tr>
          <tr><th>Cable weight</th><td className="num">{weight ? fmt(weight / 1000, 2) + ' kg/m' : '—'}</td></tr>
          {!round && !open && stackH > pathway.depthMm && <tr><td colSpan={2} style={{ color: 'var(--bad)' }}>Packed stack exceeds pathway depth.</td></tr>}
        </tbody>
      </table>
      {!open && (
        <>
          <h3>What-if / spare capacity</h3>
          <div className="row">
            <select value={whatIf} onChange={(e) => setWhatIf(e.target.value)} style={{ flex: 1, minWidth: 0 }}>
              {data.cableTypes.filter((t) => t.odMm).map((t) => <option key={t.id} value={t.id}>{t.name} ({t.odMm} mm)</option>)}
            </select>
            <Num value={addN} onChange={setAddN} min={0} style={{ width: 80 }} />
          </div>
          {wt?.odMm ? (
            <p className="small">Room for about <b>{capacity}</b> more {wt.name} before the {f.limitPct}% limit{round ? ' (limit changes with cable count)' : ''}.</p>
          ) : (
            <p className="small muted">Set an outer diameter on a cable type in the Library to use the calculator.</p>
          )}
        </>
      )}
    </div>
  );
}
