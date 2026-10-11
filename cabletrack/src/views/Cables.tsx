import { useMemo, useState } from 'react';
import { today, uid, useStore } from '../store';
import { Empty, Field, Modal, Num, confirmDelete } from '../ui';
import { cableStageStatus, fmt, progressIndex, MEASURE_UNIT } from '../lib/calc';
import { download, parseCSV, readFile, toCSV } from '../lib/csv';
import { autoRoute, designLength, measuredLength, pathwayLengthM, slackFor } from '../lib/route';
import { linkBudget } from '../lib/budget';
import { Attachments, LocationSelect, locationPath } from '../components';
import { PATHWAY_KIND_LABEL } from '../data/norms';
import type { AppData, CableRun } from '../types';
import { AREA_KINDS } from '../types';

export const endLabel = (data: AppData, c: CableRun, side: 'A' | 'B') => {
  const id = side === 'A' ? c.fromRackId : c.toRackId;
  const port = side === 'A' ? c.fromPort : c.toPort;
  const base = id ? locationPath(data.locations, id) : side === 'A' ? c.fromLabel : c.toLabel;
  return (base || '—') + (port ? ` : ${port}` : '');
};

export default function Cables() {
  const data = useStore() as unknown as AppData;
  const { cables, cableTypes, stages, locations, progress, crews, tests, upsert, upsertMany, remove, removeMany } = { ...data, ...useStore() };
  const [q, setQ] = useState('');
  const [typeF, setTypeF] = useState('');
  const [stageF, setStageF] = useState('');
  const [edit, setEdit] = useState<CableRun | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [bulk, setBulk] = useState(false);
  const [msg, setMsg] = useState('');

  const types = useMemo(() => new Map(cableTypes.map((t) => [t.id, t])), [cableTypes]);
  const idx = useMemo(() => progressIndex(progress), [progress]);

  const filtered = cables.filter((c) => {
    if (typeF && c.typeId !== typeF) return false;
    if (q) {
      const s = (c.tag + ' ' + endLabel(data, c, 'A') + ' ' + endLabel(data, c, 'B') + ' ' + (c.notes ?? '')).toLowerCase();
      if (!s.includes(q.toLowerCase())) return false;
    }
    if (stageF) {
      const [sid, want] = stageF.split(':');
      if (sid === 'label') return want === 'done' ? !!(c.labelA && c.labelB) : !(c.labelA && c.labelB);
      if (sid === 'route') return want === 'done' ? c.pathwayIds.length > 0 : c.pathwayIds.length === 0;
      const st = stages.find((s) => s.id === sid);
      if (!st) return true;
      const r = cableStageStatus(c, types.get(c.typeId), st, idx);
      if (r.state === 'na') return false;
      if (want === 'done' && r.state !== 'done') return false;
      if (want === 'open' && r.state === 'done') return false;
    }
    return true;
  }).sort((a, b) => a.tag.localeCompare(b.tag, undefined, { numeric: true }));

  const totalM = filtered.reduce((a, c) => a + c.lengthM, 0);
  const totalF = filtered.reduce((a, c) => a + (types.get(c.typeId)?.fibreCount ?? 0), 0);

  const newCable = (): CableRun => ({ id: uid(), tag: '', typeId: cableTypes[0]?.id ?? '', fromLabel: '', toLabel: '', lengthM: 0, pathwayIds: [] });

  const routeAll = () => {
    let ok = 0, fail = 0;
    const out: CableRun[] = [];
    for (const c of cables) {
      if (!c.fromRackId || !c.toRackId) continue;
      const r = autoRoute(data, c.fromRackId, c.toRackId);
      if (!r.found) { fail++; continue; }
      ok++;
      out.push({ ...c, pathwayIds: r.pathwayIds, routeM: Math.round(r.pathM * 10) / 10, lengthM: c.lengthM || designLength(data, c, r.pathM) });
    }
    upsertMany('cables', out);
    setMsg(`Auto-routed ${ok} cables.${fail ? ` ${fail} had no connected path (add pathways/drops between their points).` : ''} Cables with no A/B point were skipped.`);
  };

  const onImport = async (file: File) => {
    const rows = parseCSV(await readFile(file));
    if (rows.length < 2) return setMsg('No rows found.');
    const head = rows[0].map((h) => h.trim().toLowerCase());
    const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
    const ci = {
      tag: col('tag', 'cable', 'cable id', 'cable tag', 'id'),
      type: col('type', 'cable type'),
      from: col('from', 'a end', 'a-end', 'source'),
      fromPort: col('from port', 'a port', 'a-end port'),
      to: col('to', 'b end', 'b-end', 'destination'),
      toPort: col('to port', 'b port', 'b-end port'),
      len: col('length', 'length m', 'length (m)', 'metres', 'meters'),
      notes: col('notes', 'comment', 'comments'),
    };
    if (ci.tag < 0) return setMsg('CSV needs a "tag" column. Download the template for the expected format.');
    const byName = (s: string) => {
      const n = s.trim().toLowerCase();
      return cableTypes.find((t) => t.id.toLowerCase() === n || t.name.toLowerCase() === n || (t.partNumber ?? '').toLowerCase() === n);
    };
    const locBy = (s: string) => {
      const n = s.trim().toLowerCase();
      if (!n) return undefined;
      return locations.find((l) => (l.code ?? '').toLowerCase() === n || l.name.toLowerCase() === n || locationPath(locations, l.id).toLowerCase() === n);
    };
    const existing = new Map(cables.map((c) => [c.tag.toLowerCase(), c]));
    const out: CableRun[] = [];
    let unmatched = 0, unlinked = 0;
    const g = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');
    for (const r of rows.slice(1)) {
      const tag = g(r, ci.tag);
      if (!tag) continue;
      const t = byName(g(r, ci.type));
      if (!t) unmatched++;
      const fromLabel = g(r, ci.from), toLabel = g(r, ci.to);
      const fl = locBy(fromLabel), tl = locBy(toLabel);
      if ((fromLabel && !fl) || (toLabel && !tl)) unlinked++;
      const prev = existing.get(tag.toLowerCase());
      out.push({
        ...(prev ?? { pathwayIds: [] }),
        id: prev?.id ?? uid(), tag,
        typeId: t?.id ?? prev?.typeId ?? cableTypes[0]?.id ?? '',
        fromLabel, toLabel, fromRackId: fl?.id, toRackId: tl?.id,
        fromPort: g(r, ci.fromPort) || prev?.fromPort, toPort: g(r, ci.toPort) || prev?.toPort,
        lengthM: ci.len >= 0 ? Number(g(r, ci.len)) || 0 : prev?.lengthM ?? 0,
        pathwayIds: prev?.pathwayIds ?? [],
        notes: g(r, ci.notes) || prev?.notes,
      });
    }
    upsertMany('cables', out);
    setMsg(`Imported ${out.length} cables.` + (unmatched ? ` ${unmatched} had an unrecognised type (set to "${cableTypes[0]?.name}").` : '') + (unlinked ? ` ${unlinked} have A/B text that didn't match a point (kept as text; add the points in Points & areas and re-import to link).` : ''));
  };

  const exportCSV = () => {
    const head = ['tag', 'type', 'fibres', 'from', 'from_port', 'to', 'to_port', 'length_m', 'route_m', 'measured_m', 'route', 'label_A', 'label_B', ...stages.map((s) => `${s.name} (${MEASURE_UNIT[s.measure]})`), 'tests', 'notes'];
    const rows = cables.map((c) => {
      const t = types.get(c.typeId);
      const ct = tests.filter((x) => x.cableId === c.id);
      return [
        c.tag, t?.name, t?.fibreCount, endLabel(data, c, 'A').split(' : ')[0], c.fromPort, endLabel(data, c, 'B').split(' : ')[0], c.toPort,
        c.lengthM, c.routeM, measuredLength(c), c.pathwayIds.map((id) => data.pathways.find((p) => p.id === id)?.code || data.pathways.find((p) => p.id === id)?.name).join(' > '),
        c.labelA, c.labelB,
        ...stages.map((s) => { const r = cableStageStatus(c, t, s, idx); return r.state === 'na' ? 'n/a' : `${r.done}/${r.target}`; }),
        ct.length ? `${ct.filter((x) => x.result === 'pass').length}/${ct.length} pass` : '', c.notes,
      ];
    });
    download(`cable-schedule-${today()}.csv`, toCSV([head, ...rows]));
  };

  const detailCable = cables.find((c) => c.id === detail);

  return (
    <>
      <div className="page-head">
        <h1>Cable schedule</h1>
        <div className="row">
          <button className="btn primary" onClick={() => setEdit(newCable())}>+ Cable</button>
          <button className="btn" onClick={() => setBulk(true)}>+ Bulk add</button>
          <button className="btn" onClick={routeAll} title="Shortest path from A to B through pathways, for every cable with A and B points">Auto-route all</button>
          <label className="btn">Import CSV<input type="file" accept=".csv,.txt" hidden onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} /></label>
          <button className="btn" onClick={() => download('cable-schedule-template.csv', toCSV([['tag', 'type', 'from', 'from port', 'to', 'to port', 'length', 'notes'], ['EXAMPLE-001', cableTypes[0]?.name ?? '', 'R01', 'U40', 'R11', 'U40', 285, 'example row - delete']]))}>Template</button>
          <button className="btn" onClick={exportCSV}>Export CSV</button>
        </div>
      </div>
      {msg && <div className="notice">{msg}</div>}

      <div className="card">
        <div className="row" style={{ marginBottom: 12 }}>
          <input placeholder="Search tag, A/B point, notes…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
          <select value={typeF} onChange={(e) => setTypeF(e.target.value)}>
            <option value="">All types</option>
            {cableTypes.filter((t) => cables.some((c) => c.typeId === t.id)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select value={stageF} onChange={(e) => setStageF(e.target.value)}>
            <option value="">Any status</option>
            <option value="route:open">Not routed</option>
            <option value="label:open">Not labelled both ends</option>
            {stages.map((s) => [
              <option key={s.id + 'o'} value={s.id + ':open'}>Not {s.name.toLowerCase()}</option>,
              <option key={s.id + 'd'} value={s.id + ':done'}>{s.name}</option>,
            ])}
          </select>
        </div>
        <div className="small muted" style={{ marginBottom: 8 }}>
          {filtered.length} cables · {fmt(totalM)} m · {fmt(totalF)} fibres · {fmt(filtered.reduce((a, c) => a + c.lengthM * (types.get(c.typeId)?.fibreCount ?? 0), 0) / 1000)} fibre-km
        </div>
        {filtered.length === 0 ? (
          <Empty>No cables. Add cables, bulk-add a range, or import your cable schedule CSV.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tag</th><th>Type</th><th>A → B</th><th className="num">Length</th><th>Route</th><th>Labels</th>
                  <th>Status <span style={{ textTransform: 'none', fontWeight: 400 }}>({stages.map((s) => s.name[0]).join(' ')})</span></th>
                  <th>Tests</th><th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const t = types.get(c.typeId);
                  const ct = tests.filter((x) => x.cableId === c.id);
                  const meas = measuredLength(c);
                  return (
                    <tr key={c.id}>
                      <td><a href="#cables" onClick={(e) => (e.preventDefault(), setDetail(c.id))}><b>{c.tag || '(no tag)'}</b></a></td>
                      <td className="small">{t?.name ?? <span className="pill bad">unknown type</span>}</td>
                      <td className="small">{endLabel(data, c, 'A')} → {endLabel(data, c, 'B')}</td>
                      <td className="num">
                        {fmt(c.lengthM)} m
                        {(c.routeM != null || meas != null) && <div className="small muted">{c.routeM != null ? `route ${fmt(c.routeM, 1)}` : ''}{meas != null ? ` · meas ${fmt(meas)}` : ''}</div>}
                      </td>
                      <td className="small">{c.pathwayIds.length ? `${c.pathwayIds.length} pathway${c.pathwayIds.length > 1 ? 's' : ''}` : <span className="muted">—</span>}</td>
                      <td className="small">{c.labelA ? '✔A' : '·A'} {c.labelB ? '✔B' : '·B'}</td>
                      <td>
                        <div className="cells">
                          {stages.map((s) => {
                            const r = cableStageStatus(c, t, s, idx);
                            return (
                              <div key={s.id} className={'cell' + (r.state === 'na' ? ' na' : '')} title={`${s.name}: ${r.state === 'na' ? 'n/a' : `${fmt(r.done)} / ${fmt(r.target)} ${MEASURE_UNIT[s.measure]}`}`}>
                                {r.state !== 'na' && <div style={{ width: r.pct + '%', background: s.color }} />}
                              </div>
                            );
                          })}
                        </div>
                      </td>
                      <td>{ct.length === 0 ? <span className="muted small">—</span> : ct.some((x) => x.result === 'fail') ? <span className="pill bad">fail</span> : <span className="pill ok">{ct.length} pass</span>}</td>
                      <td><button className="btn sm" onClick={() => setEdit(c)}>Edit</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {edit && (
        <Modal title={cables.some((c) => c.id === edit.id) ? `Edit ${edit.tag}` : 'New cable'} onClose={() => setEdit(null)} wide>
          <CableForm value={edit} onChange={setEdit}
            onSave={() => { upsert('cables', edit); setEdit(null); }}
            onDelete={cables.some((c) => c.id === edit.id) ? () => {
              if (!confirmDelete(`cable ${edit.tag} and its progress records`)) return;
              removeMany('progress', progress.filter((p) => p.cableId === edit.id).map((p) => p.id));
              remove('cables', edit.id);
              setEdit(null);
            } : undefined} />
        </Modal>
      )}

      {bulk && <BulkAdd onClose={() => setBulk(false)} />}

      {detailCable && (
        <Modal title={`Cable ${detailCable.tag}`} onClose={() => setDetail(null)} wide>
          <CableDetail data={data} c={detailCable} idx={idx} crewName={(id) => crews.find((x) => x.id === id)?.name ?? '—'} onEdit={() => { setEdit(detailCable); setDetail(null); }} />
        </Modal>
      )}
    </>
  );
}

function CableDetail({ data, c, idx, crewName, onEdit }: { data: AppData; c: CableRun; idx: Map<string, number>; crewName: (id: string) => string; onEdit: () => void }) {
  const { remove, upsert } = useStore();
  const t = data.cableTypes.find((x) => x.id === c.typeId);
  const hist = data.progress.filter((p) => p.cableId === c.id).sort((a, b) => b.date.localeCompare(a.date));
  const ct = data.tests.filter((x) => x.cableId === c.id).sort((a, b) => b.date.localeCompare(a.date));
  const budget = linkBudget(c, t, data.project);
  const meas = measuredLength(c);
  const lots = data.itpLots.filter((l) => l.cableIds.includes(c.id));
  return (
    <>
      <table style={{ marginBottom: 16 }}>
        <tbody>
          <tr><th>Type</th><td>{t?.name}</td><th>Fibres</th><td>{t?.fibreCount ?? '—'}</td></tr>
          <tr><th>A end</th><td>{endLabel(data, c, 'A')}</td><th>B end</th><td>{endLabel(data, c, 'B')}</td></tr>
          <tr><th>Length</th><td>{fmt(c.lengthM)} m schedule{c.routeM != null ? ` · ${fmt(c.routeM, 1)} m route + ${fmt(slackFor(data, c), 1)} m slack` : ''}{meas != null ? ` · ${fmt(meas)} m measured` : ''}</td><th>Drum</th><td>{data.drums.find((d) => d.id === c.drumId)?.code ?? '—'}</td></tr>
          <tr><th>Route</th><td colSpan={3}>{c.pathwayIds.map((id) => { const p = data.pathways.find((x) => x.id === id); return p ? `${p.code || p.name} (${PATHWAY_KIND_LABEL[p.kind]})` : ''; }).filter(Boolean).join(' → ') || '—'}</td></tr>
          <tr><th>Labels</th><td>A: {c.labelA ?? 'not done'} · B: {c.labelB ?? 'not done'}</td><th>ITP lots</th><td>{lots.map((l) => l.number).join(', ') || '—'}</td></tr>
          {budget && <tr><th>Loss budget</th><td colSpan={3}><b>{fmt(budget.totalDb, 2)} dB</b> <span className="small muted">= {budget.basis}</span></td></tr>}
        </tbody>
      </table>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn sm" onClick={onEdit}>Edit cable</button>
        {!c.labelA && <button className="btn sm" onClick={() => upsert('cables', { ...c, labelA: today() })}>Label A applied today</button>}
        {!c.labelB && <button className="btn sm" onClick={() => upsert('cables', { ...c, labelB: today() })}>Label B applied today</button>}
        <a className="btn sm" href="#tests" onClick={() => sessionStorage.setItem('test-cable', c.id)}>Add test result</a>
      </div>
      <table style={{ marginBottom: 16 }}>
        <thead><tr><th>Stage</th><th className="num">Done</th><th className="num">Target</th><th className="num">%</th></tr></thead>
        <tbody>
          {data.stages.map((s) => {
            const r = cableStageStatus(c, t, s, idx);
            return (
              <tr key={s.id}>
                <td><span className="dot" style={{ background: s.color }} />{s.name}</td>
                {r.state === 'na' ? <td colSpan={3} className="muted num">not applicable</td> : (
                  <><td className="num">{fmt(r.done)} {MEASURE_UNIT[s.measure]}</td><td className="num">{fmt(r.target)} {MEASURE_UNIT[s.measure]}</td><td className="num">{fmt(r.pct)}%</td></>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <h3>Tests ({ct.length})</h3>
      {ct.length === 0 ? <p className="small muted">No test results.</p> : (
        <table style={{ marginBottom: 12 }}>
          <thead><tr><th>Date</th><th>Type</th><th>Fibres</th><th className="num">λ nm</th><th className="num">Measured</th><th className="num">Limit</th><th>Result</th></tr></thead>
          <tbody>{ct.map((x) => <tr key={x.id}><td>{x.date}</td><td>{x.type}</td><td>{x.fibres}</td><td className="num">{x.wavelengthNm ?? ''}</td><td className="num">{x.measuredDb != null ? fmt(x.measuredDb, 2) + ' dB' : ''}</td><td className="num">{x.limitDb != null ? fmt(x.limitDb, 2) + ' dB' : ''}</td><td><span className={'pill ' + (x.result === 'pass' ? 'ok' : x.result === 'fail' ? 'bad' : 'warn')}>{x.result}</span></td></tr>)}</tbody>
        </table>
      )}
      <h3>History</h3>
      {hist.length === 0 ? <p className="small muted">No work logged yet.</p> : (
        <table style={{ marginBottom: 12 }}>
          <thead><tr><th>Date</th><th>Crew</th><th>Stage</th><th className="num">Qty</th><th>By</th><th>Notes</th><th /></tr></thead>
          <tbody>
            {hist.map((p) => {
              const s = data.stages.find((x) => x.id === p.stageId);
              return (
                <tr key={p.id}>
                  <td>{p.date}</td><td>{crewName(p.crewId)}</td><td>{s?.name}{p.end ? ` (${p.end})` : ''}</td>
                  <td className="num">{fmt(p.qty)} {s ? MEASURE_UNIT[s.measure] : ''}</td><td className="small">{p.createdBy}</td><td className="small">{p.notes}</td>
                  <td><button className="btn sm danger" onClick={() => confirmDelete('this entry') && remove('progress', p.id)}>✕</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <Attachments entity="cable" entityId={c.id} />
    </>
  );
}

function CableForm({ value, onChange, onSave, onDelete }: { value: CableRun; onChange: (c: CableRun) => void; onSave: () => void; onDelete?: () => void }) {
  const data = useStore() as unknown as AppData;
  const { cableTypes, pathways, drums } = data;
  const [routeMsg, setRouteMsg] = useState('');
  const [addPw, setAddPw] = useState('');
  const set = (p: Partial<CableRun>) => onChange({ ...value, ...p });
  const routeLen = value.pathwayIds.reduce((a, id) => a + pathwayLengthM(pathways.find((p) => p.id === id) ?? ({ points: [] } as never)), 0);
  const runAuto = () => {
    if (!value.fromRackId || !value.toRackId) return setRouteMsg('Pick A and B points first.');
    const r = autoRoute(data, value.fromRackId, value.toRackId);
    if (!r.found) return setRouteMsg('No connected path found. Connect the points to pathways (drops on the Floor layout, or pathways with From/To points).');
    const len = designLength(data, value, r.pathM);
    set({ pathwayIds: r.pathwayIds, routeM: Math.round(r.pathM * 10) / 10, lengthM: value.lengthM || len });
    setRouteMsg(`Route ${fmt(r.pathM, 1)} m + slack ${fmt(slackFor(data, value), 1)} m = design ${len} m${value.lengthM && value.lengthM !== len ? ` (schedule says ${value.lengthM} m; click "Use design length" to change)` : ''}.`);
  };
  const move = (i: number, d: number) => {
    const a = [...value.pathwayIds];
    const j = i + d;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
    set({ pathwayIds: a });
  };
  const meas = measuredLength(value);
  return (
    <div className="grid" style={{ gridTemplateColumns: '1fr' }}>
      <div className="grid g3">
        <Field label="Tag / Cable ID"><input value={value.tag} onChange={(e) => set({ tag: e.target.value })} autoFocus /></Field>
        <Field label="Cable type">
          <select value={value.typeId} onChange={(e) => set({ typeId: e.target.value })}>
            {cableTypes.map((t) => <option key={t.id} value={t.id}>{t.name}{t.brand !== 'TBC' ? ` (${t.brand})` : ''}</option>)}
          </select>
        </Field>
        <Field label="Schedule length (m)"><Num value={value.lengthM} onChange={(v) => set({ lengthM: v ?? 0 })} min={0} /></Field>
      </div>
      <div className="grid g2">
        <div className="grid" style={{ gridTemplateColumns: '1fr' }}>
          <Field label="A end point"><LocationSelect value={value.fromRackId} onChange={(id) => set({ fromRackId: id })} placeholder="— point (or type below) —" /></Field>
          {!value.fromRackId && <input placeholder="A end as text" value={value.fromLabel} onChange={(e) => set({ fromLabel: e.target.value })} />}
          <Field label="A port / panel position"><input value={value.fromPort ?? ''} placeholder="e.g. U40 P1-12" onChange={(e) => set({ fromPort: e.target.value || undefined })} /></Field>
        </div>
        <div className="grid" style={{ gridTemplateColumns: '1fr' }}>
          <Field label="B end point"><LocationSelect value={value.toRackId} onChange={(id) => set({ toRackId: id })} placeholder="— point (or type below) —" /></Field>
          {!value.toRackId && <input placeholder="B end as text" value={value.toLabel} onChange={(e) => set({ toLabel: e.target.value })} />}
          <Field label="B port / panel position"><input value={value.toPort ?? ''} onChange={(e) => set({ toPort: e.target.value || undefined })} /></Field>
        </div>
      </div>

      <div className="card" style={{ background: 'var(--panel-2)', marginBottom: 0 }}>
        <div className="row" style={{ marginBottom: 8 }}>
          <b>Route A → B</b>
          <span className="small muted">{value.pathwayIds.length} pathways · {fmt(routeLen, 1)} m</span>
          <div className="spacer" />
          <button className="btn sm primary" onClick={runAuto}>Auto-route</button>
          {value.routeM != null && <button className="btn sm" onClick={() => set({ lengthM: designLength(data, value, value.routeM!) })}>Use design length</button>}
        </div>
        {routeMsg && <div className="small" style={{ marginBottom: 8 }}>{routeMsg}</div>}
        {value.pathwayIds.map((id, i) => {
          const p = pathways.find((x) => x.id === id);
          return (
            <div key={id + i} className="row small" style={{ padding: '3px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ width: 22 }}>{i + 1}.</span>
              <span style={{ flex: 1 }}>{p ? `${p.code || p.name} · ${PATHWAY_KIND_LABEL[p.kind]} · ${fmt(pathwayLengthM(p), 1)} m` : '(deleted pathway)'}</span>
              <button className="btn sm" onClick={() => move(i, -1)}>↑</button>
              <button className="btn sm" onClick={() => move(i, 1)}>↓</button>
              <button className="btn sm danger" onClick={() => set({ pathwayIds: value.pathwayIds.filter((_, j) => j !== i) })}>✕</button>
            </div>
          );
        })}
        <div className="row" style={{ marginTop: 8 }}>
          <select value={addPw} onChange={(e) => setAddPw(e.target.value)} style={{ flex: 1, minWidth: 0 }}>
            <option value="">+ add pathway manually…</option>
            {pathways.map((p) => <option key={p.id} value={p.id}>{p.code || p.name} ({PATHWAY_KIND_LABEL[p.kind]})</option>)}
          </select>
          <button className="btn sm" disabled={!addPw} onClick={() => { set({ pathwayIds: [...value.pathwayIds, addPw] }); setAddPw(''); }}>Add</button>
        </div>
      </div>

      <div className="grid g3">
        <Field label="Jacket mark at A (m)"><Num value={value.markA} onChange={(v) => set({ markA: v })} /></Field>
        <Field label="Jacket mark at B (m)"><Num value={value.markB} onChange={(v) => set({ markB: v })} /></Field>
        <Field label="Measured length">
          <input readOnly value={meas != null ? `${fmt(meas)} m` + (value.lengthM ? ` (${meas >= value.lengthM ? '+' : ''}${fmt(meas - value.lengthM)} vs schedule)` : '') : '—'} />
        </Field>
        <Field label="Label applied A (date)"><input type="date" value={value.labelA ?? ''} onChange={(e) => set({ labelA: e.target.value || undefined })} /></Field>
        <Field label="Label applied B (date)"><input type="date" value={value.labelB ?? ''} onChange={(e) => set({ labelB: e.target.value || undefined })} /></Field>
        <Field label="Drum / reel">
          <select value={value.drumId ?? ''} onChange={(e) => set({ drumId: e.target.value || undefined })}>
            <option value="">—</option>
            {drums.filter((d) => d.typeId === value.typeId).map((d) => <option key={d.id} value={d.id}>{d.code}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Notes"><textarea rows={2} value={value.notes ?? ''} onChange={(e) => set({ notes: e.target.value || undefined })} /></Field>
      <div className="row">
        {onDelete && <button className="btn danger" onClick={onDelete}>Delete</button>}
        <div className="spacer" />
        <button className="btn primary" onClick={onSave} disabled={!value.tag.trim()}>Save</button>
      </div>
    </div>
  );
}

function BulkAdd({ onClose }: { onClose: () => void }) {
  const { cableTypes, upsertMany } = useStore();
  const [prefix, setPrefix] = useState('FC-');
  const [start, setStart] = useState<number | undefined>(1);
  const [count, setCount] = useState<number | undefined>(12);
  const [pad, setPad] = useState<number | undefined>(3);
  const [typeId, setTypeId] = useState(cableTypes[0]?.id ?? '');
  const [len, setLen] = useState<number | undefined>(0);
  const [from, setFrom] = useState<string>();
  const [to, setTo] = useState<string>();
  const tags = Array.from({ length: Math.min(count ?? 0, 2000) }, (_, i) => prefix + String((start ?? 1) + i).padStart(pad ?? 0, '0'));
  return (
    <Modal title="Bulk add cables" onClose={onClose}>
      <div className="grid g2">
        <Field label="Tag prefix"><input value={prefix} onChange={(e) => setPrefix(e.target.value)} /></Field>
        <Field label="Start number"><Num value={start} onChange={setStart} /></Field>
        <Field label="How many"><Num value={count} onChange={setCount} min={1} /></Field>
        <Field label="Zero-pad digits"><Num value={pad} onChange={setPad} min={0} /></Field>
        <Field label="Cable type"><select value={typeId} onChange={(e) => setTypeId(e.target.value)}>{cableTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
        <Field label="Length each (m)"><Num value={len} onChange={setLen} min={0} /></Field>
        <Field label="A end point"><LocationSelect value={from} onChange={setFrom} /></Field>
        <Field label="B end point"><LocationSelect value={to} onChange={setTo} /></Field>
      </div>
      <p className="small muted">Preview: {tags.slice(0, 3).join(', ')}{tags.length > 3 ? ` … ${tags[tags.length - 1]}` : ''} ({tags.length})</p>
      <div className="row">
        <div className="spacer" />
        <button className="btn primary" disabled={tags.length === 0} onClick={() => {
          upsertMany('cables', tags.map((tag) => ({ id: uid(), tag, typeId, fromRackId: from, toRackId: to, fromLabel: '', toLabel: '', lengthM: len ?? 0, pathwayIds: [] })));
          onClose();
        }}>Add {tags.length} cables</button>
      </div>
    </Modal>
  );
}

export { AREA_KINDS };
