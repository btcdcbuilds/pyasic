import { useEffect, useMemo, useState } from 'react';
import { today, uid, useStore } from '../store';
import { Empty, Field } from '../ui';
import { fmt } from '../lib/calc';
import type { TimeEntry } from '../types';

function addDays(d: string, n: number) {
  const x = new Date(d + 'T00:00:00');
  x.setDate(x.getDate() + n);
  return x.toISOString().slice(0, 10);
}
function weekStart(d: string) {
  const x = new Date(d + 'T00:00:00');
  const day = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - day);
  return x.toISOString().slice(0, 10);
}

export default function Hours() {
  const { crews, workers, time, project, upsertMany, removeMany } = useStore();
  const [date, setDate] = useState(today());
  const [crewId, setCrewId] = useState(crews[0]?.id ?? '');
  const [rows, setRows] = useState<Record<string, { hours: string; notes: string }>>({});
  const [extra, setExtra] = useState<string[]>([]);
  const [saved, setSaved] = useState('');

  const crewWorkers = useMemo(() => {
    const ids = new Set([
      ...workers.filter((w) => w.active && w.crewId === crewId).map((w) => w.id),
      ...time.filter((t) => t.date === date && t.crewId === crewId).map((t) => t.workerId),
      ...extra,
    ]);
    return workers.filter((w) => ids.has(w.id));
  }, [workers, crewId, time, date, extra]);

  useEffect(() => {
    const r: Record<string, { hours: string; notes: string }> = {};
    for (const t of time.filter((t) => t.date === date && t.crewId === crewId)) {
      r[t.workerId] = { hours: String(t.hours), notes: t.notes ?? '' };
    }
    setRows(r);
    setSaved('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, crewId]);

  const fillAll = () => {
    const r = { ...rows };
    for (const w of crewWorkers) if (!r[w.id]?.hours) r[w.id] = { hours: String(project.defaultShiftHours), notes: r[w.id]?.notes ?? '' };
    setRows(r);
  };

  const save = () => {
    const existing = time.filter((t) => t.date === date && t.crewId === crewId);
    removeMany('time', existing.map((t) => t.id));
    const entries: TimeEntry[] = [];
    for (const w of crewWorkers) {
      const h = Number(rows[w.id]?.hours);
      if (!h || h <= 0) continue;
      entries.push({ id: uid(), date, workerId: w.id, crewId, hours: h, notes: rows[w.id]?.notes || undefined, createdAt: Date.now() });
    }
    upsertMany('time', entries);
    setSaved(`Saved ${entries.length} entries, ${fmt(entries.reduce((a, e) => a + e.hours, 0), 1)} h`);
  };

  const ws = weekStart(date);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const weekly = useMemo(() => {
    const m = new Map<string, Record<string, number>>();
    for (const t of time) {
      if (t.date < days[0] || t.date > days[6]) continue;
      const r = m.get(t.workerId) ?? {};
      r[t.date] = (r[t.date] ?? 0) + t.hours;
      m.set(t.workerId, r);
    }
    return m;
  }, [time, days]);

  const others = workers.filter((w) => w.active && !crewWorkers.some((c) => c.id === w.id));

  return (
    <>
      <div className="page-head">
        <h1>Hours</h1>
      </div>
      <div className="card">
        <h2>Daily timesheet by crew</h2>
        {crews.length === 0 ? (
          <Empty>Add crews and workers first (Crews &amp; workers).</Empty>
        ) : (
          <>
            <div className="row" style={{ marginBottom: 12 }}>
              <Field label="Date">
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Crew">
                <select value={crewId} onChange={(e) => setCrewId(e.target.value)}>
                  <option value="" disabled>
                    Select crew
                  </option>
                  {crews.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="spacer" />
              <button className="btn" onClick={fillAll}>
                Fill {project.defaultShiftHours} h for all
              </button>
            </div>
            {crewWorkers.length === 0 ? (
              <Empty>No workers in this crew.</Empty>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Worker</th>
                    <th>Role</th>
                    <th style={{ width: 110 }}>Hours</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {crewWorkers.map((w) => (
                    <tr key={w.id}>
                      <td>{w.name}</td>
                      <td className="muted">{w.role}</td>
                      <td>
                        <input
                          type="number"
                          inputMode="decimal"
                          step={0.5}
                          min={0}
                          value={rows[w.id]?.hours ?? ''}
                          onChange={(e) => setRows({ ...rows, [w.id]: { hours: e.target.value, notes: rows[w.id]?.notes ?? '' } })}
                          style={{ width: 90 }}
                        />
                      </td>
                      <td>
                        <input
                          value={rows[w.id]?.notes ?? ''}
                          placeholder="e.g. induction, RDO, sick"
                          onChange={(e) => setRows({ ...rows, [w.id]: { hours: rows[w.id]?.hours ?? '', notes: e.target.value } })}
                          style={{ width: '100%' }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="row" style={{ marginTop: 12 }}>
              {others.length > 0 && (
                <select value="" onChange={(e) => e.target.value && setExtra([...extra, e.target.value])}>
                  <option value="">+ Add worker from another crew</option>
                  {others.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              )}
              <div className="spacer" />
              {saved && <span className="pill ok">{saved}</span>}
              <button className="btn primary" onClick={save} disabled={!crewId}>
                Save timesheet
              </button>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="row" style={{ marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>Week of {ws}</h2>
          <div className="spacer" />
          <button className="btn sm" onClick={() => setDate(addDays(date, -7))}>
            ← Prev week
          </button>
          <button className="btn sm" onClick={() => setDate(addDays(date, 7))}>
            Next week →
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Worker</th>
                {days.map((d) => (
                  <th key={d} className="num">
                    {new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}
                  </th>
                ))}
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {workers
                .filter((w) => weekly.has(w.id))
                .map((w) => {
                  const r = weekly.get(w.id)!;
                  const tot = Object.values(r).reduce((a, b) => a + b, 0);
                  return (
                    <tr key={w.id}>
                      <td>{w.name}</td>
                      {days.map((d) => (
                        <td key={d} className="num">
                          {r[d] ? fmt(r[d], 1) : ''}
                        </td>
                      ))}
                      <td className="num">
                        <b>{fmt(tot, 1)}</b>
                      </td>
                    </tr>
                  );
                })}
              {weekly.size === 0 && (
                <tr>
                  <td colSpan={9}>
                    <Empty>No hours logged this week.</Empty>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
