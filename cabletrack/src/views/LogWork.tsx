import { useMemo, useState } from 'react';
import { today, uid, useStore } from '../store';
import { Empty, Field, confirmDelete } from '../ui';
import { cableStageStatus, fmt, progressIndex, MEASURE_UNIT } from '../lib/calc';
import type { ProgressEntry } from '../types';

export default function LogWork() {
  const { cables, cableTypes, stages, crews, progress, upsertMany, remove } = useStore();
  const [date, setDate] = useState(today());
  const [crewId, setCrewId] = useState(crews[0]?.id ?? '');
  const [stageId, setStageId] = useState(stages[0]?.id ?? '');
  const [q, setQ] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [sel, setSel] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');

  const types = useMemo(() => new Map(cableTypes.map((t) => [t.id, t])), [cableTypes]);
  const idx = useMemo(() => progressIndex(progress), [progress]);
  const stage = stages.find((s) => s.id === stageId);
  const unit = stage ? MEASURE_UNIT[stage.measure] : '';

  const list = useMemo(() => {
    if (!stage) return [];
    return cables
      .map((c) => ({ c, t: types.get(c.typeId), r: cableStageStatus(c, types.get(c.typeId), stage, idx) }))
      .filter(({ c, r }) => {
        if (r.state === 'na') return false;
        if (!showDone && r.state === 'done') return false;
        if (q && !(c.tag + ' ' + c.fromLabel + ' ' + c.toLabel).toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => a.c.tag.localeCompare(b.c.tag, undefined, { numeric: true }));
  }, [cables, types, stage, idx, showDone, q]);

  const toggle = (id: string, remaining: number) => {
    const s = { ...sel };
    if (id in s) delete s[id];
    else s[id] = String(remaining);
    setSel(s);
  };

  const selectAllVisible = () => {
    const s = { ...sel };
    for (const { c, r } of list) if (r.state !== 'done') s[c.id] = String(r.target - r.done);
    setSel(s);
  };

  const save = () => {
    if (!crewId || !stage) return;
    const entries: ProgressEntry[] = [];
    for (const [cableId, v] of Object.entries(sel)) {
      const qty = Number(v);
      if (!qty || qty <= 0) continue;
      entries.push({ id: uid(), date, crewId, cableId, stageId: stage.id, qty, notes: note || undefined, createdAt: Date.now() });
    }
    upsertMany('progress', entries);
    const tot = entries.reduce((a, e) => a + e.qty, 0);
    setMsg(`Logged ${entries.length} cables, ${fmt(tot)} ${unit} ${stage.name.toLowerCase()}`);
    setSel({});
    setNote('');
  };

  const todays = progress
    .filter((p) => p.date === date && (!crewId || p.crewId === crewId))
    .sort((a, b) => b.createdAt - a.createdAt);

  const selTotal = Object.values(sel).reduce((a, v) => a + (Number(v) || 0), 0);

  if (crews.length === 0 || cables.length === 0)
    return (
      <>
        <div className="page-head"><h1>Log work</h1></div>
        <div className="card">
          <Empty>
            {crews.length === 0 ? 'Add crews first (Crews & workers). ' : ''}
            {cables.length === 0 ? 'Add cables to the cable schedule first.' : ''}
          </Empty>
        </div>
      </>
    );

  return (
    <>
      <div className="page-head">
        <h1>Log work</h1>
      </div>
      <div className="card">
        <div className="row" style={{ marginBottom: 12 }}>
          <Field label="Date">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Crew">
            <select value={crewId} onChange={(e) => setCrewId(e.target.value)}>
              {crews.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="row" style={{ marginBottom: 12 }}>
          {stages.map((s) => (
            <button
              key={s.id}
              className={'btn' + (s.id === stageId ? ' active' : '')}
              style={s.id === stageId ? { background: s.color, borderColor: s.color } : undefined}
              onClick={() => {
                setStageId(s.id);
                setSel({});
                setMsg('');
              }}
            >
              {s.name}
            </button>
          ))}
        </div>
        <div className="row" style={{ marginBottom: 8 }}>
          <input placeholder="Filter cables…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
          <label className="row small" style={{ gap: 4 }}>
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> show complete
          </label>
          <button className="btn sm" onClick={selectAllVisible}>
            Select all remaining
          </button>
          <button className="btn sm" onClick={() => setSel({})}>
            Clear
          </button>
        </div>
        {list.length === 0 ? (
          <Empty>Nothing outstanding for this stage{q ? ' matching the filter' : ''}.</Empty>
        ) : (
          <div className="table-wrap" style={{ maxHeight: '50vh', overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th />
                  <th>Tag</th>
                  <th>Type</th>
                  <th className="num">Done / target</th>
                  <th style={{ width: 140 }}>Qty today ({unit})</th>
                </tr>
              </thead>
              <tbody>
                {list.map(({ c, t, r }) => {
                  const remaining = r.target - r.done;
                  const on = c.id in sel;
                  const qn = Number(sel[c.id]) || 0;
                  return (
                    <tr key={c.id} onClick={(e) => (e.target as HTMLElement).tagName !== 'INPUT' && toggle(c.id, remaining)} style={{ cursor: 'pointer' }}>
                      <td>
                        <input type="checkbox" checked={on} onChange={() => toggle(c.id, remaining)} />
                      </td>
                      <td>
                        <b>{c.tag}</b>
                        <div className="small muted">
                          {c.fromLabel} → {c.toLabel}
                        </div>
                      </td>
                      <td className="small">{t?.name}</td>
                      <td className="num">
                        {fmt(r.done)} / {fmt(r.target)}
                        <div className="bar" style={{ marginTop: 4 }}>
                          <div style={{ width: r.pct + '%', background: stage?.color }} />
                        </div>
                      </td>
                      <td>
                        {on && (
                          <>
                            <input type="number" inputMode="decimal" min={0} value={sel[c.id]} onChange={(e) => setSel({ ...sel, [c.id]: e.target.value })} style={{ width: 110 }} />
                            {stage?.measure === 'fibres' && t?.ribbonSize && qn > 0 && (
                              <div className="small muted">= {fmt(qn / t.ribbonSize, 1)} ribbon splices</div>
                            )}
                            {stage?.measure === 'length' && t?.fibreCount && qn > 0 && (
                              <div className="small muted">= {fmt((qn * t.fibreCount) / 1000, 1)} fibre-km</div>
                            )}
                            {qn > remaining && <div className="small" style={{ color: 'var(--warn)' }}>more than remaining ({fmt(remaining)})</div>}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="row" style={{ marginTop: 12 }}>
          <input placeholder="Note for these entries (optional)" value={note} onChange={(e) => setNote(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
          {msg && <span className="pill ok">{msg}</span>}
          <button className="btn primary" disabled={Object.keys(sel).length === 0} onClick={save}>
            Save {Object.keys(sel).length} cables · {fmt(selTotal)} {unit}
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Logged on {date}{crewId ? ` by ${crews.find((c) => c.id === crewId)?.name}` : ''}</h2>
        {todays.length === 0 ? (
          <Empty>Nothing logged yet.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cable</th>
                  <th>Stage</th>
                  <th className="num">Qty</th>
                  <th>Notes</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {todays.map((p) => {
                  const s = stages.find((x) => x.id === p.stageId);
                  return (
                    <tr key={p.id}>
                      <td>{cables.find((c) => c.id === p.cableId)?.tag ?? '(deleted)'}</td>
                      <td>
                        <span className="dot" style={{ background: s?.color }} />
                        {s?.name}
                      </td>
                      <td className="num">
                        {fmt(p.qty)} {s ? MEASURE_UNIT[s.measure] : ''}
                      </td>
                      <td className="small">{p.notes}</td>
                      <td>
                        <button className="btn sm danger" onClick={() => confirmDelete('this entry') && remove('progress', p.id)}>
                          Undo
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
    </>
  );
}
