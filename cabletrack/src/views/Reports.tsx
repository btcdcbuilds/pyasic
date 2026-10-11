import { useMemo, useState } from 'react';
import { today, useStore } from '../store';
import { Empty, Field } from '../ui';
import { crewSummaries, fmt, MEASURE_UNIT, stageTotals } from '../lib/calc';
import { download, toCSV } from '../lib/csv';
import type { AppData } from '../types';

export default function Reports() {
  const data = useStore() as unknown as AppData;
  const { project, crews, workers, stages, cables, cableTypes, progress, time } = data;
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());

  const inRange = (d: string) => d >= from && d <= to;
  const sums = useMemo(() => crewSummaries(data, from, to), [data, from, to]);
  const totals = useMemo(() => stageTotals(data), [data]);
  const cableMap = new Map(cables.map((c) => [c.id, c]));
  const typeMap = new Map(cableTypes.map((t) => [t.id, t]));
  const stageMap = new Map(stages.map((s) => [s.id, s]));
  const workerMap = new Map(workers.map((w) => [w.id, w]));
  const crewMap = new Map(crews.map((c) => [c.id, c]));

  const prog = progress.filter((p) => inRange(p.date)).sort((a, b) => a.date.localeCompare(b.date) || a.crewId.localeCompare(b.crewId));
  const hrs = time.filter((t) => inRange(t.date)).sort((a, b) => a.date.localeCompare(b.date));
  const totalHours = hrs.reduce((a, t) => a + t.hours, 0);

  const exportProgress = () =>
    download(
      `progress-${from}_${to}.csv`,
      toCSV([
        ['date', 'crew', 'cable', 'cable_type', 'fibres', 'stage', 'qty', 'unit', 'notes'],
        ...prog.map((p) => {
          const c = cableMap.get(p.cableId);
          const t = c ? typeMap.get(c.typeId) : undefined;
          const s = stageMap.get(p.stageId);
          return [p.date, crewMap.get(p.crewId)?.name, c?.tag, t?.name, t?.fibreCount, s?.name, p.qty, s ? MEASURE_UNIT[s.measure] : '', p.notes];
        }),
      ]),
    );
  const exportHours = () =>
    download(
      `hours-${from}_${to}.csv`,
      toCSV([
        ['date', 'worker', 'role', 'crew', 'hours', 'notes'],
        ...hrs.map((t) => {
          const w = workerMap.get(t.workerId);
          return [t.date, w?.name, w?.role, t.crewId ? crewMap.get(t.crewId)?.name : '', t.hours, t.notes];
        }),
      ]),
    );

  return (
    <>
      <div className="page-head no-print">
        <h1>Reports</h1>
        <div className="row">
          <Field label="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <button className="btn" onClick={() => { setFrom(today()); setTo(today()); }}>Today</button>
          <button className="btn primary" onClick={() => window.print()}>Print / PDF</button>
          <button className="btn" onClick={exportProgress}>Progress CSV</button>
          <button className="btn" onClick={exportHours}>Hours CSV</button>
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 20 }}>{from === to ? 'Daily' : 'Period'} progress report - {project.name}</h2>
        <table>
          <tbody>
            <tr><th>Client</th><td>{project.client || '—'}</td><th>Site</th><td>{project.site || '—'}</td></tr>
            <tr><th>Period</th><td>{from === to ? from : `${from} to ${to}`}</td><th>Generated</th><td>{new Date().toLocaleString()}</td></tr>
            <tr><th>Total hours</th><td>{fmt(totalHours, 1)} h</td><th>Workers on site</th><td>{new Set(hrs.map((h) => h.workerId)).size}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Work completed this period by crew</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Crew</th>
                <th className="num">Workers</th>
                <th className="num">Hours</th>
                {stages.map((s) => <th key={s.id} className="num">{s.name} ({MEASURE_UNIT[s.measure]})</th>)}
                <th className="num">Fibre-km pulled</th>
              </tr>
            </thead>
            <tbody>
              {crews.map((c) => {
                const s = sums.get(c.id);
                return (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td className="num">{s?.workers ?? 0}</td>
                    <td className="num">{fmt(s?.hours ?? 0, 1)}</td>
                    {stages.map((st) => <td key={st.id} className="num">{fmt(s?.byStage[st.id] ?? 0)}</td>)}
                    <td className="num">{fmt((s?.strandMetres ?? 0) / 1000, 1)}</td>
                  </tr>
                );
              })}
              <tr>
                <td><b>Total</b></td>
                <td className="num"><b>{new Set(hrs.map((h) => h.workerId)).size}</b></td>
                <td className="num"><b>{fmt(totalHours, 1)}</b></td>
                {stages.map((st) => <td key={st.id} className="num"><b>{fmt(prog.filter((p) => p.stageId === st.id).reduce((a, p) => a + p.qty, 0))}</b></td>)}
                <td className="num"><b>{fmt([...sums.values()].reduce((a, s) => a + s.strandMetres, 0) / 1000, 1)}</b></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Project status to date</h2>
        <table>
          <thead>
            <tr><th>Stage</th><th className="num">Done</th><th className="num">Target</th><th className="num">%</th><th className="num">Cables complete</th></tr>
          </thead>
          <tbody>
            {totals.map((t) => (
              <tr key={t.stage.id}>
                <td>{t.stage.name}</td>
                <td className="num">{fmt(t.done)} {MEASURE_UNIT[t.stage.measure]}</td>
                <td className="num">{fmt(t.target)} {MEASURE_UNIT[t.stage.measure]}</td>
                <td className="num">{fmt(t.pct, 1)}%</td>
                <td className="num">{t.cablesComplete} / {t.cablesApplicable}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Labour</h2>
        {hrs.length === 0 ? <Empty>No hours logged in this period.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Worker</th><th>Role</th><th>Crew</th><th className="num">Hours</th><th>Notes</th></tr></thead>
              <tbody>
                {hrs.map((t) => {
                  const w = workerMap.get(t.workerId);
                  return (
                    <tr key={t.id}>
                      <td>{t.date}</td><td>{w?.name}</td><td>{w?.role}</td>
                      <td>{t.crewId ? crewMap.get(t.crewId)?.name : ''}</td>
                      <td className="num">{fmt(t.hours, 1)}</td><td className="small">{t.notes}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Work log detail</h2>
        {prog.length === 0 ? <Empty>No work logged in this period.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Crew</th><th>Cable</th><th>Type</th><th>Stage</th><th className="num">Qty</th><th>Notes</th></tr></thead>
              <tbody>
                {prog.map((p) => {
                  const c = cableMap.get(p.cableId);
                  const s = stageMap.get(p.stageId);
                  return (
                    <tr key={p.id}>
                      <td>{p.date}</td><td>{crewMap.get(p.crewId)?.name}</td><td>{c?.tag}</td>
                      <td className="small">{c ? typeMap.get(c.typeId)?.name : ''}</td><td>{s?.name}</td>
                      <td className="num">{fmt(p.qty)} {s ? MEASURE_UNIT[s.measure] : ''}</td><td className="small">{p.notes}</td>
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
