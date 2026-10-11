import { useMemo, useState } from 'react';
import { today, useStore } from '../store';
import { Bar, Empty } from '../ui';
import { crewSummaries, fmt, MEASURE_UNIT, stageTarget, stageTotals, progressIndex } from '../lib/calc';
import type { AppData } from '../types';
import { lotProgress } from '../lib/itp';

function addDays(d: string, n: number) {
  const x = new Date(d + 'T00:00:00');
  x.setDate(x.getDate() + n);
  return x.toISOString().slice(0, 10);
}

export default function Dashboard() {
  const data = useStore() as unknown as AppData;
  const { project, cables, cableTypes, stages, crews, time, progress } = data;
  const [range, setRange] = useState<'today' | 'week' | 'all'>('all');

  const t0 = today();
  const from = range === 'today' ? t0 : range === 'week' ? addDays(t0, -6) : undefined;
  const totals = useMemo(() => stageTotals(data), [data]);
  const crewSum = useMemo(() => crewSummaries(data, from, range === 'all' ? undefined : t0), [data, from, range, t0]);
  const types = useMemo(() => new Map(cableTypes.map((t) => [t.id, t])), [cableTypes]);

  const designM = cables.reduce((a, c) => a + c.lengthM, 0);
  const designFibreKm = cables.reduce((a, c) => a + c.lengthM * (types.get(c.typeId)?.fibreCount ?? 0), 0) / 1000;
  const pull = totals.find((t) => t.stage.measure === 'length');
  // Capped per cable so over-logging never shows more than 100% installed.
  const pulledFibreKm = useMemo(() => {
    if (!pull) return 0;
    const idx = progressIndex(progress);
    return cables.reduce((a, c) => a + Math.min(idx.get(c.id + '|' + pull.stage.id) ?? 0, c.lengthM) * (types.get(c.typeId)?.fibreCount ?? 0), 0) / 1000;
  }, [pull, progress, cables, types]);
  const hoursInRange = time.filter((t) => (!from || t.date >= from) && (range === 'all' || t.date <= t0)).reduce((a, t) => a + t.hours, 0);
  const hoursAll = time.reduce((a, t) => a + t.hours, 0);
  const pulledInRange = [...crewSum.values()].reduce((a, s) => a + s.metresPulled, 0);
  const overall = totals.length ? totals.reduce((a, t) => a + (t.target ? t.pct : 0), 0) / Math.max(1, totals.filter((t) => t.target).length) : 0;

  const ribbonSplices = useMemo(() => {
    const splice = stages.find((s) => s.id === 'splice') ?? stages.find((s) => s.measure === 'fibres');
    if (!splice) return { done: 0, target: 0 };
    const idx = progressIndex(progress);
    let done = 0;
    let target = 0;
    for (const c of cables) {
      const t = types.get(c.typeId);
      if (!t?.ribbonSize || t.termination !== 'ribbon-splice') continue;
      const tg = stageTarget(c, t, splice);
      target += tg / t.ribbonSize;
      done += Math.min(idx.get(c.id + '|' + splice.id) ?? 0, tg) / t.ribbonSize;
    }
    return { done, target };
  }, [cables, types, stages, progress]);

  if (cables.length === 0 && crews.length === 0)
    return (
      <>
        <div className="page-head">
          <h1>{project.name}</h1>
        </div>
        <div className="card">
          <h2>Getting started</h2>
          <ol style={{ lineHeight: 1.9, margin: 0 }}>
            <li><a href="#settings">Settings</a>: your name, project details, work stages (or apply a job template), loss budget allowances.</li>
            <li><a href="#library">Library</a>: confirm cable types and enter datasheet OD, weight and bend radius.</li>
            <li><a href="#crews">Crews &amp; people</a>: crews, workers, and people who sign off.</li>
            <li><a href="#locations">Points &amp; areas</a>: buildings, floors, rooms and the A/B points (racks, frames, outlets, pits).</li>
            <li><a href="#layout">Floor layout</a> / <a href="#pathways">Pathways</a>: upload plans, draw or enter trays, baskets, conduits; add drops.</li>
            <li><a href="#cables">Cable schedule</a>: import your schedule CSV, then Auto-route all.</li>
            <li><a href="#itp">ITP</a>: agree the inspection points, create lots.</li>
            <li>Each day: <a href="#log">Log work</a>, <a href="#hours">Hours</a>, <a href="#diary">Site diary</a>, <a href="#tests">Tests</a>, then print the report from <a href="#reports">Reports</a>.</li>
          </ol>
        </div>
      </>
    );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{project.name}</h1>
          <div className="small muted">
            {[project.client, project.site].filter(Boolean).join(' · ')} · updated live from logged work
          </div>
        </div>
        <div className="row">
          {(['today', 'week', 'all'] as const).map((r) => (
            <button key={r} className={'btn sm' + (range === r ? ' active' : '')} onClick={() => setRange(r)}>
              {r === 'today' ? 'Today' : r === 'week' ? 'Last 7 days' : 'To date'}
            </button>
          ))}
        </div>
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="label">Overall complete</div>
          <div className="value">{fmt(overall)}%</div>
          <div className="sub">average across stages</div>
        </div>
        <div className="kpi">
          <div className="label">Metres roughed in</div>
          <div className="value">{fmt(pull?.done ?? 0)}</div>
          <div className="sub">of {fmt(designM)} m design</div>
        </div>
        <div className="kpi">
          <div className="label">Fibre-km installed</div>
          <div className="value">{fmt(pulledFibreKm, 1)}</div>
          <div className="sub">of {fmt(designFibreKm, 1)} fibre-km</div>
        </div>
        <div className="kpi">
          <div className="label">Ribbon splices</div>
          <div className="value">{fmt(ribbonSplices.done)}</div>
          <div className="sub">of {fmt(ribbonSplices.target)}</div>
        </div>
        <div className="kpi">
          <div className="label">Hours ({range === 'all' ? 'to date' : range === 'week' ? '7 days' : 'today'})</div>
          <div className="value">{fmt(hoursInRange, 1)}</div>
          <div className="sub">{fmt(hoursAll, 1)} h total</div>
        </div>
        <div className="kpi">
          <div className="label">m pulled / man-hour</div>
          <div className="value">{hoursInRange > 0 ? fmt(pulledInRange / hoursInRange, 1) : '—'}</div>
          <div className="sub">{fmt(pulledInRange)} m in period</div>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi"><div className="label">Cables tested</div><div className="value">{new Set(data.tests.map((t) => t.cableId)).size} / {cables.length}</div><div className="sub">{data.tests.filter((t) => t.result === 'fail').length} failed results</div></div>
        <div className="kpi"><div className="label">Labelled both ends</div><div className="value">{cables.filter((c) => c.labelA && c.labelB).length} / {cables.length}</div></div>
        <div className="kpi"><div className="label">ITP hold points open</div><div className="value">{data.itpLots.reduce((a, l) => a + lotProgress(data, l).holdsOpen, 0)}</div><div className="sub">{data.itpLots.filter((l) => l.closed).length} / {data.itpLots.length} lots closed</div></div>
        <div className="kpi"><div className="label">Open issues</div><div className="value">{data.issues.filter((i) => i.status !== 'closed').length}</div><div className="sub">{data.issues.filter((i) => i.status !== 'closed' && i.priority === 'high').length} high priority</div></div>
      </div>

      <div className="card">
        <h2>Progress by stage</h2>
        <table>
          <thead>
            <tr>
              <th>Stage</th>
              <th style={{ width: '40%' }} />
              <th className="num">%</th>
              <th className="num">Done</th>
              <th className="num">Target</th>
              <th className="num">Cables complete</th>
              <th className="num">Strands complete</th>
            </tr>
          </thead>
          <tbody>
            {totals.map((t) => (
              <tr key={t.stage.id}>
                <td><span className="dot" style={{ background: t.stage.color }} />{t.stage.name}</td>
                <td><Bar pct={t.pct} color={t.stage.color} /></td>
                <td className="num"><b>{fmt(t.pct, 1)}%</b></td>
                <td className="num">{fmt(t.done)} {MEASURE_UNIT[t.stage.measure]}</td>
                <td className="num">{fmt(t.target)} {MEASURE_UNIT[t.stage.measure]}</td>
                <td className="num">{t.cablesComplete} / {t.cablesApplicable}</td>
                <td className="num">{fmt(t.strandsComplete)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DailyChart data={data} />

      <div className="card">
        <h2>Crew output ({range === 'all' ? 'to date' : range === 'week' ? 'last 7 days' : 'today'})</h2>
        {crews.length === 0 ? (
          <Empty>No crews yet.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Crew</th>
                  <th className="num">Workers</th>
                  <th className="num">Hours</th>
                  {stages.map((s) => (
                    <th key={s.id} className="num">{s.name} ({MEASURE_UNIT[s.measure]})</th>
                  ))}
                  <th className="num">Fibre-km pulled</th>
                  <th className="num">m / man-hr</th>
                </tr>
              </thead>
              <tbody>
                {crews.map((c) => {
                  const s = crewSum.get(c.id);
                  return (
                    <tr key={c.id}>
                      <td><span className="dot" style={{ background: c.color }} />{c.name}</td>
                      <td className="num">{s?.workers ?? 0}</td>
                      <td className="num">{fmt(s?.hours ?? 0, 1)}</td>
                      {stages.map((st) => (
                        <td key={st.id} className="num">{fmt(s?.byStage[st.id] ?? 0)}</td>
                      ))}
                      <td className="num">{fmt((s?.strandMetres ?? 0) / 1000, 1)}</td>
                      <td className="num">{s && s.hours > 0 ? fmt(s.metresPulled / s.hours, 1) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2>By cable type</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th className="num">Cables</th>
                <th className="num">Design m</th>
                {stages.map((s) => (
                  <th key={s.id} className="num">{s.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cableTypes
                .filter((t) => cables.some((c) => c.typeId === t.id))
                .map((t) => {
                  const cs = cables.filter((c) => c.typeId === t.id);
                  const st = stageTotals(data, cs);
                  return (
                    <tr key={t.id}>
                      <td>{t.name}</td>
                      <td className="num">{cs.length}</td>
                      <td className="num">{fmt(cs.reduce((a, c) => a + c.lengthM, 0))}</td>
                      {st.map((x) => (
                        <td key={x.stage.id} className="num">{x.target ? fmt(x.pct) + '%' : <span className="muted">n/a</span>}</td>
                      ))}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/** Metres roughed in per day, stacked by crew, last 14 days. */
function DailyChart({ data }: { data: AppData }) {
  const [hover, setHover] = useState<{ day: string; x: number; y: number } | null>(null);
  const pull = data.stages.find((s) => s.measure === 'length');
  const t0 = today();
  const days = Array.from({ length: 14 }, (_, i) => addDays(t0, i - 13));
  const byDay = new Map<string, Map<string, number>>();
  for (const p of data.progress) {
    if (p.stageId !== pull?.id || p.date < days[0]) continue;
    const m = byDay.get(p.date) ?? new Map();
    m.set(p.crewId, (m.get(p.crewId) ?? 0) + p.qty);
    byDay.set(p.date, m);
  }
  const totals = days.map((d) => [...(byDay.get(d)?.values() ?? [])].reduce((a, b) => a + b, 0));
  const max = Math.max(1, ...totals);
  const niceMax = (() => {
    const p = 10 ** Math.floor(Math.log10(max));
    return Math.ceil(max / p) * p;
  })();
  const W = 700, H = 220, L = 44, B = 24, T = 10;
  const bw = (W - L) / days.length;
  const y = (v: number) => H - B - (v / niceMax) * (H - B - T);
  if (!pull) return null;
  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>Metres {pull.name.toLowerCase()} per day - last 14 days</h2>
        <div className="spacer" />
        {data.crews.map((c) => (
          <span key={c.id} className="small"><span className="dot" style={{ background: c.color }} />{c.name}</span>
        ))}
      </div>
      <div style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} onMouseLeave={() => setHover(null)}>
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={L} x2={W} y1={y(niceMax * f)} y2={y(niceMax * f)} stroke="var(--grid)" />
              <text x={L - 6} y={y(niceMax * f) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{fmt(niceMax * f)}</text>
            </g>
          ))}
          {days.map((d, i) => {
            const x = L + i * bw + bw * 0.2;
            const w = bw * 0.6;
            let acc = 0;
            const m = byDay.get(d);
            const segs = data.crews.filter((c) => (m?.get(c.id) ?? 0) > 0);
            return (
              <g key={d} onMouseMove={(e) => setHover({ day: d, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY })}>
                <rect x={L + i * bw} y={T} width={bw} height={H - B - T} fill="transparent" />
                {segs.map((c, j) => {
                  const v = m!.get(c.id)!;
                  const y1 = y(acc + v);
                  const y0 = y(acc);
                  acc += v;
                  const h = Math.max(0, y0 - y1 - (j < segs.length - 1 ? 2 : 0));
                  return <rect key={c.id} x={x} y={y1} width={w} height={h} fill={c.color} rx={j === segs.length - 1 ? 3 : 0} />;
                })}
                {i % 2 === 1 && (
                  <text x={x + w / 2} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--muted)">
                    {new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                  </text>
                )}
              </g>
            );
          })}
          <line x1={L} x2={W} y1={H - B} y2={H - B} stroke="var(--border)" />
        </svg>
        {hover && (
          <div
            style={{ position: 'absolute', left: Math.min(hover.x + 12, 520), top: hover.y + 8, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontSize: 12, pointerEvents: 'none', boxShadow: '0 4px 12px rgba(0,0,0,.15)' }}
          >
            <b>{hover.day}</b>
            {data.crews.map((c) => {
              const v = byDay.get(hover.day)?.get(c.id);
              return v ? (
                <div key={c.id}><span className="dot" style={{ background: c.color }} />{c.name}: {fmt(v)} m</div>
              ) : null;
            })}
            <div>Total: {fmt(totals[days.indexOf(hover.day)])} m</div>
          </div>
        )}
      </div>
    </div>
  );
}
