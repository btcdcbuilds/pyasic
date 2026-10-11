import { useMemo, useState } from 'react';
import { uid, useStore } from '../store';
import { Empty, Field, Modal, Num, confirmDelete } from '../ui';
import { cableStageStatus, fmt, progressIndex, MEASURE_UNIT } from '../lib/calc';
import { download, parseCSV, readFile, toCSV } from '../lib/csv';
import type { CableRun } from '../types';

export default function Cables() {
  const data = useStore();
  const { cables, cableTypes, stages, racks, pathways, progress, crews, upsert, upsertMany, remove, removeMany } = data;
  const [q, setQ] = useState('');
  const [typeF, setTypeF] = useState('');
  const [stageF, setStageF] = useState('');
  const [edit, setEdit] = useState<CableRun | null>(null);
  const [detail, setDetail] = useState<CableRun | null>(null);
  const [bulk, setBulk] = useState(false);
  const [importMsg, setImportMsg] = useState('');

  const types = useMemo(() => new Map(cableTypes.map((t) => [t.id, t])), [cableTypes]);
  const idx = useMemo(() => progressIndex(progress), [progress]);

  const filtered = cables.filter((c) => {
    if (typeF && c.typeId !== typeF) return false;
    if (q) {
      const s = (c.tag + ' ' + c.fromLabel + ' ' + c.toLabel + ' ' + (c.notes ?? '')).toLowerCase();
      if (!s.includes(q.toLowerCase())) return false;
    }
    if (stageF) {
      const [sid, want] = stageF.split(':');
      const st = stages.find((s) => s.id === sid);
      if (!st) return true;
      const r = cableStageStatus(c, types.get(c.typeId), st, idx);
      if (r.state === 'na') return false;
      if (want === 'done' && r.state !== 'done') return false;
      if (want === 'open' && r.state === 'done') return false;
    }
    return true;
  });

  const totalM = filtered.reduce((a, c) => a + c.lengthM, 0);
  const totalF = filtered.reduce((a, c) => a + (types.get(c.typeId)?.fibreCount ?? 0), 0);

  const newCable = (): CableRun => ({
    id: uid(),
    tag: '',
    typeId: cableTypes[0]?.id ?? '',
    fromLabel: '',
    toLabel: '',
    lengthM: 0,
    pathwayIds: [],
  });

  const onImport = async (file: File) => {
    const rows = parseCSV(await readFile(file));
    if (rows.length < 2) return setImportMsg('No rows found.');
    const head = rows[0].map((h) => h.trim().toLowerCase());
    const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
    const ci = {
      tag: col('tag', 'cable', 'cable id', 'cable tag', 'id'),
      type: col('type', 'cable type'),
      from: col('from', 'a end', 'a-end', 'source'),
      to: col('to', 'b end', 'b-end', 'destination'),
      len: col('length', 'length m', 'length (m)', 'metres', 'meters'),
      notes: col('notes', 'comment', 'comments'),
    };
    if (ci.tag < 0) return setImportMsg('CSV needs a "tag" column. Download the template for the expected format.');
    const byName = (s: string) => {
      const n = s.trim().toLowerCase();
      return cableTypes.find((t) => t.id.toLowerCase() === n || t.name.toLowerCase() === n || (t.partNumber ?? '').toLowerCase() === n);
    };
    const rackBy = (s: string) => racks.find((r) => r.name.toLowerCase() === s.trim().toLowerCase());
    const existing = new Map(cables.map((c) => [c.tag.toLowerCase(), c]));
    const out: CableRun[] = [];
    let unmatched = 0;
    for (const r of rows.slice(1)) {
      const tag = (r[ci.tag] ?? '').trim();
      if (!tag) continue;
      const typeName = ci.type >= 0 ? r[ci.type] ?? '' : '';
      const t = byName(typeName);
      if (!t) unmatched++;
      const fromLabel = ci.from >= 0 ? (r[ci.from] ?? '').trim() : '';
      const toLabel = ci.to >= 0 ? (r[ci.to] ?? '').trim() : '';
      const prev = existing.get(tag.toLowerCase());
      out.push({
        id: prev?.id ?? uid(),
        tag,
        typeId: t?.id ?? prev?.typeId ?? cableTypes[0]?.id ?? '',
        fromLabel,
        toLabel,
        fromRackId: rackBy(fromLabel)?.id,
        toRackId: rackBy(toLabel)?.id,
        lengthM: ci.len >= 0 ? Number(r[ci.len]) || 0 : prev?.lengthM ?? 0,
        pathwayIds: prev?.pathwayIds ?? [],
        notes: ci.notes >= 0 ? r[ci.notes] || undefined : prev?.notes,
      });
    }
    upsertMany('cables', out);
    setImportMsg(`Imported ${out.length} cables.` + (unmatched ? ` ${unmatched} had an unrecognised type and were set to "${cableTypes[0]?.name}". Check them.` : ''));
  };

  const exportCSV = () => {
    const head = ['tag', 'type', 'from', 'to', 'length_m', 'fibres', ...stages.map((s) => `${s.name} (${MEASURE_UNIT[s.measure]})`), 'notes'];
    const rows = cables.map((c) => {
      const t = types.get(c.typeId);
      return [
        c.tag,
        t?.name,
        c.fromLabel,
        c.toLabel,
        c.lengthM,
        t?.fibreCount,
        ...stages.map((s) => {
          const r = cableStageStatus(c, t, s, idx);
          return r.state === 'na' ? 'n/a' : `${r.done}/${r.target}`;
        }),
        c.notes,
      ];
    });
    download(`cable-schedule-${new Date().toISOString().slice(0, 10)}.csv`, toCSV([head, ...rows]));
  };

  return (
    <>
      <div className="page-head">
        <h1>Cable schedule</h1>
        <div className="row">
          <button className="btn primary" onClick={() => setEdit(newCable())}>
            + Cable
          </button>
          <button className="btn" onClick={() => setBulk(true)}>
            + Bulk add
          </button>
          <label className="btn">
            Import CSV
            <input type="file" accept=".csv,.txt" hidden onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
          </label>
          <button
            className="btn"
            onClick={() =>
              download(
                'cable-schedule-template.csv',
                toCSV([
                  ['tag', 'type', 'from', 'to', 'length', 'notes'],
                  ['EXAMPLE-001', cableTypes[0]?.name ?? '', 'BLDG-A MMR R01', 'BLDG-B MMR R01', 285, 'example row - delete'],
                ]),
              )
            }
          >
            Template
          </button>
          <button className="btn" onClick={exportCSV}>
            Export CSV
          </button>
        </div>
      </div>
      {importMsg && <div className="notice">{importMsg}</div>}

      <div className="card">
        <div className="row" style={{ marginBottom: 12 }}>
          <input placeholder="Search tag, from, to…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
          <select value={typeF} onChange={(e) => setTypeF(e.target.value)}>
            <option value="">All types</option>
            {cableTypes
              .filter((t) => cables.some((c) => c.typeId === t.id))
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
          <select value={stageF} onChange={(e) => setStageF(e.target.value)}>
            <option value="">Any status</option>
            {stages.map((s) => [
              <option key={s.id + 'o'} value={s.id + ':open'}>
                Not {s.name.toLowerCase()}
              </option>,
              <option key={s.id + 'd'} value={s.id + ':done'}>
                {s.name}
              </option>,
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
                  <th>Tag</th>
                  <th>Type</th>
                  <th>From → To</th>
                  <th className="num">Length</th>
                  <th>
                    Status{' '}
                    <span style={{ textTransform: 'none', fontWeight: 400 }}>
                      ({stages.map((s) => s.name[0]).join(' ')})
                    </span>
                  </th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const t = types.get(c.typeId);
                  return (
                    <tr key={c.id}>
                      <td>
                        <a href="#cables" onClick={(e) => (e.preventDefault(), setDetail(c))}>
                          <b>{c.tag || '(no tag)'}</b>
                        </a>
                      </td>
                      <td className="small">{t?.name ?? <span className="pill bad">unknown type</span>}</td>
                      <td className="small">
                        {c.fromLabel || '—'} → {c.toLabel || '—'}
                      </td>
                      <td className="num">{fmt(c.lengthM)} m</td>
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
                      <td className="row" style={{ flexWrap: 'nowrap' }}>
                        <button className="btn sm" onClick={() => setEdit(c)}>
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {edit && (
        <Modal title={cables.some((c) => c.id === edit.id) ? `Edit ${edit.tag}` : 'New cable'} onClose={() => setEdit(null)}>
          <CableForm
            value={edit}
            onChange={setEdit}
            onSave={() => {
              upsert('cables', edit);
              setEdit(null);
            }}
            onDelete={
              cables.some((c) => c.id === edit.id)
                ? () => {
                    if (!confirmDelete(`cable ${edit.tag} and its progress records`)) return;
                    removeMany('progress', progress.filter((p) => p.cableId === edit.id).map((p) => p.id));
                    remove('cables', edit.id);
                    setEdit(null);
                  }
                : undefined
            }
          />
        </Modal>
      )}

      {bulk && <BulkAdd onClose={() => setBulk(false)} />}

      {detail && (
        <Modal title={`Cable ${detail.tag}`} onClose={() => setDetail(null)} wide>
          {(() => {
            const t = types.get(detail.typeId);
            const hist = progress.filter((p) => p.cableId === detail.id).sort((a, b) => b.date.localeCompare(a.date));
            return (
              <>
                <table style={{ marginBottom: 16 }}>
                  <tbody>
                    <tr><th>Type</th><td>{t?.name}</td><th>Fibres</th><td>{t?.fibreCount ?? '—'}</td></tr>
                    <tr><th>From</th><td>{detail.fromLabel}</td><th>To</th><td>{detail.toLabel}</td></tr>
                    <tr><th>Length</th><td>{fmt(detail.lengthM)} m</td><th>Route</th><td>{detail.pathwayIds.map((id) => pathways.find((p) => p.id === id)?.name).filter(Boolean).join(' → ') || '—'}</td></tr>
                  </tbody>
                </table>
                <table style={{ marginBottom: 16 }}>
                  <thead>
                    <tr><th>Stage</th><th className="num">Done</th><th className="num">Target</th><th className="num">%</th></tr>
                  </thead>
                  <tbody>
                    {stages.map((s) => {
                      const r = cableStageStatus(detail, t, s, idx);
                      return (
                        <tr key={s.id}>
                          <td><span className="dot" style={{ background: s.color }} />{s.name}</td>
                          {r.state === 'na' ? (
                            <td colSpan={3} className="muted num">not applicable</td>
                          ) : (
                            <>
                              <td className="num">{fmt(r.done)} {MEASURE_UNIT[s.measure]}</td>
                              <td className="num">{fmt(r.target)} {MEASURE_UNIT[s.measure]}</td>
                              <td className="num">{fmt(r.pct)}%</td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <h3>History</h3>
                {hist.length === 0 ? (
                  <Empty>No work logged yet.</Empty>
                ) : (
                  <table>
                    <thead><tr><th>Date</th><th>Crew</th><th>Stage</th><th className="num">Qty</th><th>Notes</th><th /></tr></thead>
                    <tbody>
                      {hist.map((p) => {
                        const s = stages.find((x) => x.id === p.stageId);
                        return (
                          <tr key={p.id}>
                            <td>{p.date}</td>
                            <td>{crews.find((c) => c.id === p.crewId)?.name ?? '—'}</td>
                            <td>{s?.name}</td>
                            <td className="num">{fmt(p.qty)} {s ? MEASURE_UNIT[s.measure] : ''}</td>
                            <td className="small">{p.notes}</td>
                            <td><button className="btn sm danger" onClick={() => confirmDelete('this entry') && remove('progress', p.id)}>✕</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </>
            );
          })()}
        </Modal>
      )}
    </>
  );
}

function CableForm({ value, onChange, onSave, onDelete }: { value: CableRun; onChange: (c: CableRun) => void; onSave: () => void; onDelete?: () => void }) {
  const { cableTypes, racks, pathways } = useStore();
  const set = (p: Partial<CableRun>) => onChange({ ...value, ...p });
  const rackSel = (side: 'from' | 'to') => (
    <select
      value={(side === 'from' ? value.fromRackId : value.toRackId) ?? ''}
      onChange={(e) => {
        const r = racks.find((x) => x.id === e.target.value);
        if (side === 'from') set({ fromRackId: r?.id, fromLabel: r ? r.name : value.fromLabel });
        else set({ toRackId: r?.id, toLabel: r ? r.name : value.toLabel });
      }}
    >
      <option value="">— rack (optional) —</option>
      {racks.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
        </option>
      ))}
    </select>
  );
  return (
    <div className="grid" style={{ gridTemplateColumns: '1fr' }}>
      <div className="grid g2">
        <Field label="Tag / Cable ID">
          <input value={value.tag} onChange={(e) => set({ tag: e.target.value })} autoFocus />
        </Field>
        <Field label="Length (m)">
          <Num value={value.lengthM} onChange={(v) => set({ lengthM: v ?? 0 })} min={0} />
        </Field>
      </div>
      <Field label="Cable type">
        <select value={value.typeId} onChange={(e) => set({ typeId: e.target.value })}>
          {cableTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} {t.brand !== 'TBC' ? `(${t.brand})` : ''}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid g2">
        <Field label="From (A end)">
          <input value={value.fromLabel} onChange={(e) => set({ fromLabel: e.target.value })} />
          {racks.length > 0 && rackSel('from')}
        </Field>
        <Field label="To (B end)">
          <input value={value.toLabel} onChange={(e) => set({ toLabel: e.target.value })} />
          {racks.length > 0 && rackSel('to')}
        </Field>
      </div>
      {pathways.length > 0 && (
        <Field label="Route (trays / baskets it passes through)">
          <div className="row">
            {pathways.map((p) => (
              <label key={p.id} className="row small" style={{ gap: 4 }}>
                <input
                  type="checkbox"
                  checked={value.pathwayIds.includes(p.id)}
                  onChange={(e) => set({ pathwayIds: e.target.checked ? [...value.pathwayIds, p.id] : value.pathwayIds.filter((x) => x !== p.id) })}
                />
                {p.name}
              </label>
            ))}
          </div>
        </Field>
      )}
      <Field label="Notes">
        <textarea rows={2} value={value.notes ?? ''} onChange={(e) => set({ notes: e.target.value || undefined })} />
      </Field>
      <div className="row">
        {onDelete && (
          <button className="btn danger" onClick={onDelete}>
            Delete
          </button>
        )}
        <div className="spacer" />
        <button className="btn primary" onClick={onSave} disabled={!value.tag.trim()}>
          Save
        </button>
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
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const tags = Array.from({ length: Math.min(count ?? 0, 2000) }, (_, i) => prefix + String((start ?? 1) + i).padStart(pad ?? 0, '0'));
  return (
    <Modal title="Bulk add cables" onClose={onClose}>
      <div className="grid g2">
        <Field label="Tag prefix"><input value={prefix} onChange={(e) => setPrefix(e.target.value)} /></Field>
        <Field label="Start number"><Num value={start} onChange={setStart} /></Field>
        <Field label="How many"><Num value={count} onChange={setCount} min={1} /></Field>
        <Field label="Zero-pad digits"><Num value={pad} onChange={setPad} min={0} /></Field>
        <Field label="Cable type">
          <select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            {cableTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <Field label="Length each (m)"><Num value={len} onChange={setLen} min={0} /></Field>
        <Field label="From"><input value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <p className="small muted">Preview: {tags.slice(0, 3).join(', ')}{tags.length > 3 ? ` … ${tags[tags.length - 1]}` : ''} ({tags.length})</p>
      <div className="row">
        <div className="spacer" />
        <button
          className="btn primary"
          disabled={tags.length === 0}
          onClick={() => {
            upsertMany('cables', tags.map((tag) => ({ id: uid(), tag, typeId, fromLabel: from, toLabel: to, lengthM: len ?? 0, pathwayIds: [] })));
            onClose();
          }}
        >
          Add {tags.length} cables
        </button>
      </div>
    </Modal>
  );
}
