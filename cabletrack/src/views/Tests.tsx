import { useMemo, useState } from 'react';
import { me, today, uid, useStore } from '../store';
import { Empty, Field, Modal, Num, confirmDelete } from '../ui';
import { fmt } from '../lib/calc';
import { linkBudget } from '../lib/budget';
import { download, parseCSV, readFile, toCSV } from '../lib/csv';
import { Attachments } from '../components';
import { endLabel } from './Cables';
import type { AppData, TestResult, TestType } from '../types';

export const TEST_LABEL: Record<TestType, string> = {
  olts: 'Tier 1 OLTS (loss)',
  otdr: 'Tier 2 OTDR',
  polarity: 'Polarity',
  endface: 'End-face inspection',
  continuity: 'Continuity / VFL',
  'copper-cert': 'Copper certification',
  'splice-loss': 'Splice loss',
  'reel-otdr': 'Reel test on receipt',
  other: 'Other',
};

export default function Tests() {
  const data = useStore() as unknown as AppData;
  const { tests, cables, cableTypes, upsert, upsertMany, remove } = useStore();
  const [q, setQ] = useState('');
  const [resF, setResF] = useState('');
  const [edit, setEdit] = useState<TestResult | null>(() => {
    const c = sessionStorage.getItem('test-cable');
    if (!c) return null;
    sessionStorage.removeItem('test-cable');
    return blank(data, c);
  });
  const [msg, setMsg] = useState('');
  const tag = (id: string) => cables.find((c) => c.id === id)?.tag ?? '(deleted)';
  const list = tests
    .filter((t) => (!resF || t.result === resF) && (!q || (tag(t.cableId) + ' ' + t.type + ' ' + (t.fibres ?? '') + ' ' + (t.technician ?? '')).toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => b.date.localeCompare(a.date) || tag(a.cableId).localeCompare(tag(b.cableId), undefined, { numeric: true }));

  const coverage = useMemo(() => {
    const fibreCables = cables.filter((c) => cableTypes.find((t) => t.id === c.typeId)?.category === 'fibre');
    const tested = new Set(tests.filter((t) => t.type === 'olts' || t.type === 'copper-cert').map((t) => t.cableId));
    return { total: cables.length, tested: cables.filter((c) => tested.has(c.id)).length, fibre: fibreCables.length };
  }, [cables, cableTypes, tests]);

  const onImport = async (f: File) => {
    const rows = parseCSV(await readFile(f));
    if (rows.length < 2) return setMsg('No rows found.');
    const head = rows[0].map((h) => h.trim().toLowerCase());
    const col = (...n: string[]) => head.findIndex((h) => n.includes(h));
    const ci = { tag: col('tag', 'cable', 'cable id', 'link', 'link id', 'id'), fibre: col('fibre', 'fiber', 'fibres', 'fibers', 'strand'), wl: col('wavelength', 'wavelength nm', 'lambda'), loss: col('loss', 'loss db', 'measured', 'insertion loss'), limit: col('limit', 'limit db', 'budget'), result: col('result', 'pass/fail', 'status'), date: col('date', 'test date'), type: col('type', 'test type'), len: col('length', 'length m'), tech: col('technician', 'operator'), inst: col('instrument', 'tester') };
    if (ci.tag < 0) return setMsg('CSV needs a cable tag / link id column.');
    const byTag = new Map(cables.map((c) => [c.tag.toLowerCase(), c]));
    const out: TestResult[] = [];
    let missing = 0;
    const g = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');
    for (const r of rows.slice(1)) {
      const c = byTag.get(g(r, ci.tag).toLowerCase());
      if (!c) { missing++; continue; }
      const measured = g(r, ci.loss) ? Number(g(r, ci.loss)) : undefined;
      const b = linkBudget(c, cableTypes.find((t) => t.id === c.typeId), data.project, Number(g(r, ci.wl)) || undefined);
      const limit = g(r, ci.limit) ? Number(g(r, ci.limit)) : b ? Math.round(b.totalDb * 100) / 100 : undefined;
      const rs = g(r, ci.result).toLowerCase();
      const result: TestResult['result'] = rs.startsWith('p') ? 'pass' : rs.startsWith('f') ? 'fail' : measured != null && limit != null ? (measured <= limit ? 'pass' : 'fail') : 'marginal';
      const type = (Object.keys(TEST_LABEL) as TestType[]).find((k) => k === g(r, ci.type).toLowerCase()) ?? 'olts';
      out.push({ id: uid(), cableId: c.id, date: g(r, ci.date) || today(), type, fibres: g(r, ci.fibre) || undefined, wavelengthNm: Number(g(r, ci.wl)) || undefined, measuredDb: measured, limitDb: limit, lengthM: Number(g(r, ci.len)) || undefined, result, technician: g(r, ci.tech) || me(), instrument: g(r, ci.inst) || undefined, createdAt: Date.now() });
    }
    upsertMany('tests', out);
    setMsg(`Imported ${out.length} results.${missing ? ` ${missing} rows had a tag not in the cable schedule and were skipped.` : ''}`);
  };

  const exportCsv = () => download(`test-results-${today()}.csv`, toCSV([
    ['cable', 'type', 'A end', 'B end', 'date', 'test', 'fibres', 'direction', 'wavelength_nm', 'measured_db', 'limit_db', 'length_m', 'result', 'instrument', 'technician', 'notes'],
    ...list.map((t) => { const c = cables.find((x) => x.id === t.cableId); return [c?.tag, cableTypes.find((x) => x.id === c?.typeId)?.name, c ? endLabel(data, c, 'A') : '', c ? endLabel(data, c, 'B') : '', t.date, TEST_LABEL[t.type], t.fibres, t.direction, t.wavelengthNm, t.measuredDb, t.limitDb, t.lengthM, t.result, t.instrument, t.technician, t.notes]; }),
  ]));

  return (
    <>
      <div className="page-head">
        <h1>Test results</h1>
        <div className="row">
          <button className="btn primary" onClick={() => setEdit(blank(data, cables[0]?.id ?? ''))} disabled={!cables.length}>+ Result</button>
          <label className="btn">Import CSV<input type="file" accept=".csv,.txt" hidden onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} /></label>
          <button className="btn" onClick={() => download('test-import-template.csv', toCSV([['tag', 'type', 'fibre', 'wavelength', 'loss', 'limit', 'result', 'date', 'length', 'technician', 'instrument'], ['EXAMPLE-001', 'olts', '1', '1310', '1.21', '', '', today(), '285', '', '']]))}>Template</button>
          <button className="btn" onClick={exportCsv}>Export CSV</button>
        </div>
      </div>
      {msg && <div className="notice">{msg}</div>}
      <div className="kpis">
        <div className="kpi"><div className="label">Cables with a loss / cert test</div><div className="value">{coverage.tested} / {coverage.total}</div></div>
        <div className="kpi"><div className="label">Results</div><div className="value">{tests.length}</div></div>
        <div className="kpi"><div className="label">Failed</div><div className="value" style={{ color: tests.some((t) => t.result === 'fail') ? 'var(--bad)' : undefined }}>{tests.filter((t) => t.result === 'fail').length}</div></div>
      </div>
      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <input placeholder="Search cable, test, technician…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
          <select value={resF} onChange={(e) => setResF(e.target.value)}><option value="">All results</option><option value="pass">Pass</option><option value="fail">Fail</option><option value="marginal">Marginal</option></select>
        </div>
        {list.length === 0 ? <Empty>No test results. Add them one by one, or import your tester's CSV export (map columns to the template).</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Cable</th><th>Test</th><th>Fibres</th><th className="num">λ nm</th><th className="num">Measured</th><th className="num">Limit</th><th className="num">Margin</th><th>Result</th><th>By</th><th /></tr></thead>
              <tbody>
                {list.map((t) => (
                  <tr key={t.id}>
                    <td>{t.date}</td><td><b>{tag(t.cableId)}</b></td><td className="small">{TEST_LABEL[t.type]}</td><td>{t.fibres}</td>
                    <td className="num">{t.wavelengthNm ?? ''}</td>
                    <td className="num">{t.measuredDb != null ? fmt(t.measuredDb, 2) + ' dB' : ''}</td>
                    <td className="num">{t.limitDb != null ? fmt(t.limitDb, 2) + ' dB' : ''}</td>
                    <td className="num">{t.measuredDb != null && t.limitDb != null ? fmt(t.limitDb - t.measuredDb, 2) : ''}</td>
                    <td><span className={'pill ' + (t.result === 'pass' ? 'ok' : t.result === 'fail' ? 'bad' : 'warn')}>{t.result}</span></td>
                    <td className="small">{t.technician}</td>
                    <td><button className="btn sm" onClick={() => setEdit(t)}>Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {edit && (
        <TestForm data={data} value={edit} onChange={setEdit} onClose={() => setEdit(null)}
          onSave={() => { upsert('tests', edit); setEdit(null); }}
          onDelete={tests.some((t) => t.id === edit.id) ? () => { if (confirmDelete('this result')) { remove('tests', edit.id); setEdit(null); } } : undefined} />
      )}
    </>
  );
}

function blank(data: AppData, cableId: string): TestResult {
  const c = data.cables.find((x) => x.id === cableId);
  const t = data.cableTypes.find((x) => x.id === c?.typeId);
  const b = c ? linkBudget(c, t, data.project, 1310) : null;
  return { id: uid(), cableId, date: today(), type: t?.category === 'copper' ? 'copper-cert' : 'olts', fibres: 'all', direction: 'A-B', wavelengthNm: t?.category === 'fibre' ? (t.fibreClass === 'mm' ? 850 : 1310) : undefined, limitDb: b ? Math.round(b.totalDb * 100) / 100 : undefined, result: 'pass', technician: me(), createdAt: Date.now() };
}

function TestForm({ data, value, onChange, onSave, onClose, onDelete }: { data: AppData; value: TestResult; onChange: (t: TestResult) => void; onSave: () => void; onClose: () => void; onDelete?: () => void }) {
  const set = (p: Partial<TestResult>) => {
    const n = { ...value, ...p };
    if (('measuredDb' in p || 'limitDb' in p) && n.measuredDb != null && n.limitDb != null) n.result = n.measuredDb <= n.limitDb ? 'pass' : 'fail';
    onChange(n);
  };
  const c = data.cables.find((x) => x.id === value.cableId);
  const t = data.cableTypes.find((x) => x.id === c?.typeId);
  const b = c ? linkBudget(c, t, data.project, value.wavelengthNm) : null;
  const saved = data.tests.some((x) => x.id === value.id);
  return (
    <Modal title={saved ? 'Edit test result' : 'New test result'} onClose={onClose} wide>
      <div className="grid g3">
        <Field label="Cable">
          <select value={value.cableId} onChange={(e) => set({ cableId: e.target.value })}>
            {[...data.cables].sort((a, b2) => a.tag.localeCompare(b2.tag, undefined, { numeric: true })).map((x) => <option key={x.id} value={x.id}>{x.tag}</option>)}
          </select>
        </Field>
        <Field label="Test"><select value={value.type} onChange={(e) => set({ type: e.target.value as TestType })}>{Object.entries(TEST_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Date"><input type="date" value={value.date} onChange={(e) => set({ date: e.target.value })} /></Field>
        <Field label="Fibres / pairs (e.g. 1-12, all)"><input value={value.fibres ?? ''} onChange={(e) => set({ fibres: e.target.value || undefined })} /></Field>
        <Field label="Direction"><select value={value.direction ?? ''} onChange={(e) => set({ direction: (e.target.value || undefined) as TestResult['direction'] })}><option value="">—</option><option value="A-B">A → B</option><option value="B-A">B → A</option><option value="bi">Bi-directional</option></select></Field>
        <Field label="Wavelength (nm)"><select value={value.wavelengthNm ?? ''} onChange={(e) => set({ wavelengthNm: Number(e.target.value) || undefined })}><option value="">—</option>{[850, 1300, 1310, 1550, 1625].map((w) => <option key={w} value={w}>{w}</option>)}</select></Field>
        <Field label="Measured loss (dB)"><Num value={value.measuredDb} step={0.01} onChange={(v) => set({ measuredDb: v })} /></Field>
        <Field label="Limit (dB)"><Num value={value.limitDb} step={0.01} onChange={(v) => set({ limitDb: v })} /></Field>
        <Field label="Result"><select value={value.result} onChange={(e) => set({ result: e.target.value as TestResult['result'] })}><option value="pass">Pass</option><option value="fail">Fail</option><option value="marginal">Marginal</option></select></Field>
        <Field label="Measured length (m)"><Num value={value.lengthM} onChange={(v) => set({ lengthM: v })} /></Field>
        <Field label="Instrument (model / serial)"><input value={value.instrument ?? ''} onChange={(e) => set({ instrument: e.target.value || undefined })} /></Field>
        <Field label="Technician"><input value={value.technician ?? ''} onChange={(e) => set({ technician: e.target.value || undefined })} /></Field>
      </div>
      {b && (
        <p className="small">
          Calculated budget for this link: <b>{fmt(b.totalDb, 2)} dB</b> = {b.basis}.{' '}
          <button className="btn sm" onClick={() => set({ limitDb: Math.round(b.totalDb * 100) / 100 })}>Use as limit</button>
          <br /><span className="muted">Allowances from Settings (default TIA-568.3 maxima as quoted by FOA). Use your project's acceptance limits if they differ.</span>
        </p>
      )}
      <Field label="Notes"><textarea rows={2} value={value.notes ?? ''} onChange={(e) => set({ notes: e.target.value || undefined })} /></Field>
      {saved ? <Attachments entity="test" entityId={value.id} title="Tester files (PDF, .sor, .flw) & photos" /> : <p className="small muted">Save first to attach tester files.</p>}
      <div className="row" style={{ marginTop: 12 }}>
        {onDelete && <button className="btn danger" onClick={onDelete}>Delete</button>}
        <div className="spacer" />
        <button className="btn primary" disabled={!value.cableId} onClick={onSave}>Save</button>
      </div>
    </Modal>
  );
}
