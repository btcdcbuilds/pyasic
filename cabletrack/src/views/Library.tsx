import { useState } from 'react';
import { uid, useStore } from '../store';
import { Field, Modal, Num, confirmDelete } from '../ui';
import { fmt } from '../lib/calc';
import { STANDARDS } from '../data/library';
import type { CableCategory, CableType, RackModel, Termination } from '../types';

const TERM_LABEL: Record<Termination, string> = {
  none: 'None',
  'ribbon-splice': 'Ribbon mass-fusion splice',
  'single-splice': 'Single fusion splice',
  'pre-term-mpo': 'Pre-terminated MPO',
  'field-connector': 'Field connector',
  rj45: 'RJ45 / jack',
  other: 'Other',
};

export default function Library() {
  const [tab, setTab] = useState<'cables' | 'racks' | 'standards'>('cables');
  return (
    <>
      <div className="page-head">
        <h1>Cable library</h1>
        <div className="row">
          <button className={'btn' + (tab === 'cables' ? ' active' : '')} onClick={() => setTab('cables')}>Cable types</button>
          <button className={'btn' + (tab === 'racks' ? ' active' : '')} onClick={() => setTab('racks')}>Rack models</button>
          <button className={'btn' + (tab === 'standards' ? ' active' : '')} onClick={() => setTab('standards')}>Standards &amp; guidance</button>
        </div>
      </div>
      {tab === 'cables' && <CableTypes />}
      {tab === 'racks' && <RackModels />}
      {tab === 'standards' && <Standards />}
    </>
  );
}

function CableTypes() {
  const { cableTypes, cables, upsert, remove } = useStore();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<'' | CableCategory>('');
  const [edit, setEdit] = useState<CableType | null>(null);
  const [guide, setGuide] = useState<CableType | null>(null);
  const brands = [...new Set(cableTypes.map((t) => t.brand))].sort();
  const [brand, setBrand] = useState('');
  const list = cableTypes.filter(
    (t) => (!cat || t.category === cat) && (!brand || t.brand === brand) && (!q || (t.name + ' ' + t.brand + ' ' + (t.partNumber ?? '')).toLowerCase().includes(q.toLowerCase())),
  );
  return (
    <>
      <div className="notice warn">
        Spec values in the library were collected from manufacturer pages via web search and are marked <b>check</b> until you confirm them against the datasheet for the exact cable delivered to site. The three contract cable types (brand "TBC") have no specs yet. Open one and use "Copy specs from" once the manufacturer is confirmed.
      </div>
      <div className="card">
        <div className="row" style={{ marginBottom: 12 }}>
          <input placeholder="Search name, brand, part no…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
          <select value={brand} onChange={(e) => setBrand(e.target.value)}>
            <option value="">All brands</option>
            {brands.map((b) => <option key={b}>{b}</option>)}
          </select>
          <select value={cat} onChange={(e) => setCat(e.target.value as CableCategory | '')}>
            <option value="">All categories</option>
            <option value="fibre">Fibre</option>
            <option value="copper">Copper</option>
            <option value="power">Power</option>
            <option value="other">Other</option>
          </select>
          <button className="btn primary" onClick={() => setEdit({ id: uid(), brand: '', name: '', category: 'fibre', termination: 'none', ends: 2, stageIds: [], verified: false })}>+ Cable type</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Brand</th><th>Name</th><th>Part no.</th><th className="num">Fibres / pairs</th><th className="num">OD mm</th>
                <th className="num">Bend R mm<br />installed / pulling</th><th className="num">Pull N</th><th className="num">kg/km</th><th>Termination</th><th>Data</th><th className="num">In use</th><th />
              </tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id}>
                  <td>{t.brand}</td>
                  <td><b>{t.name}</b></td>
                  <td className="small">{t.partNumber}</td>
                  <td className="num">{t.fibreCount ? t.fibreCount + 'F' : t.pairCount ? t.pairCount + 'pr' : '—'}</td>
                  <td className="num">{t.odMm ?? '—'}</td>
                  <td className="num">{t.bendRadiusMm ?? '—'} / {t.bendRadiusLoadedMm ?? '—'}</td>
                  <td className="num">{t.maxPullN ?? '—'}</td>
                  <td className="num">{t.weightKgKm ?? '—'}</td>
                  <td className="small">{TERM_LABEL[t.termination]}{t.fibresPerConnector && t.termination === 'pre-term-mpo' ? ` (MPO-${t.fibresPerConnector})` : ''}{t.ribbonSize ? ` (${t.ribbonSize}F ribbon)` : ''}</td>
                  <td>
                    {t.verified ? <span className="pill ok">verified</span> : t.sourceUrl ? <span className="pill warn">check</span> : <span className="pill">no specs</span>}
                    {t.sourceUrl && <> <a href={t.sourceUrl} target="_blank" rel="noreferrer" className="small">source</a></>}
                  </td>
                  <td className="num">{cables.filter((c) => c.typeId === t.id).length || ''}</td>
                  <td className="row" style={{ flexWrap: 'nowrap' }}>
                    <button className="btn sm" onClick={() => setGuide(t)}>Guide</button>
                    <button className="btn sm" onClick={() => setEdit(t)}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {edit && (
        <Modal title={edit.name || 'New cable type'} onClose={() => setEdit(null)} wide>
          <CableTypeForm value={edit} onChange={setEdit} />
          <div className="row" style={{ marginTop: 16 }}>
            {cableTypes.some((t) => t.id === edit.id) && (
              <button className="btn danger" disabled={cables.some((c) => c.typeId === edit.id)} title={cables.some((c) => c.typeId === edit.id) ? 'In use by cables' : ''}
                onClick={() => { if (confirmDelete(`cable type ${edit.name}`)) { remove('cableTypes', edit.id); setEdit(null); } }}>Delete</button>
            )}
            <div className="spacer" />
            <button className="btn primary" disabled={!edit.name} onClick={() => { upsert('cableTypes', edit); setEdit(null); }}>Save</button>
          </div>
        </Modal>
      )}
      {guide && (
        <Modal title={`Install guide - ${guide.name}`} onClose={() => setGuide(null)} wide>
          <InstallGuide t={guide} />
        </Modal>
      )}
    </>
  );
}

function CableTypeForm({ value, onChange }: { value: CableType; onChange: (t: CableType) => void }) {
  const { stages, cableTypes } = useStore();
  const set = (p: Partial<CableType>) => onChange({ ...value, ...p });
  const donors = cableTypes.filter((t) => t.id !== value.id && t.odMm);
  return (
    <div className="grid" style={{ gridTemplateColumns: '1fr' }}>
      <Field label="Copy specs from library entry (OD, weight, bend, pull, jacket, brand, part no.)">
        <select value="" onChange={(e) => {
          const d = cableTypes.find((t) => t.id === e.target.value);
          if (d) set({ brand: d.brand, partNumber: d.partNumber, odMm: d.odMm, weightKgKm: d.weightKgKm, bendRadiusMm: d.bendRadiusMm, bendRadiusLoadedMm: d.bendRadiusLoadedMm, maxPullN: d.maxPullN, jacket: d.jacket, sourceUrl: d.sourceUrl, verified: false });
        }}>
          <option value="">— select —</option>
          {donors.map((d) => <option key={d.id} value={d.id}>{d.brand} · {d.name}</option>)}
        </select>
      </Field>
      <div className="grid g3">
        <Field label="Brand"><input value={value.brand} onChange={(e) => set({ brand: e.target.value })} /></Field>
        <Field label="Name"><input value={value.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Part number"><input value={value.partNumber ?? ''} onChange={(e) => set({ partNumber: e.target.value || undefined })} /></Field>
        <Field label="Category">
          <select value={value.category} onChange={(e) => set({ category: e.target.value as CableCategory })}>
            <option value="fibre">Fibre</option><option value="copper">Copper</option><option value="power">Power</option><option value="other">Other</option>
          </select>
        </Field>
        <Field label="Fibre count"><Num value={value.fibreCount} onChange={(v) => set({ fibreCount: v })} /></Field>
        <Field label="Pair count"><Num value={value.pairCount} onChange={(v) => set({ pairCount: v })} /></Field>
        <Field label="Outer diameter (mm)"><Num value={value.odMm} step={0.1} onChange={(v) => set({ odMm: v })} /></Field>
        <Field label="Weight (kg/km)"><Num value={value.weightKgKm} onChange={(v) => set({ weightKgKm: v })} /></Field>
        <Field label="Max pull tension (N)"><Num value={value.maxPullN} onChange={(v) => set({ maxPullN: v })} /></Field>
        <Field label="Min bend radius installed (mm)"><Num value={value.bendRadiusMm} onChange={(v) => set({ bendRadiusMm: v })} /></Field>
        <Field label="Min bend radius pulling (mm)"><Num value={value.bendRadiusLoadedMm} onChange={(v) => set({ bendRadiusLoadedMm: v })} /></Field>
        <Field label="Jacket"><input value={value.jacket ?? ''} onChange={(e) => set({ jacket: e.target.value || undefined })} /></Field>
        <Field label="Termination">
          <select value={value.termination} onChange={(e) => set({ termination: e.target.value as Termination })}>
            {Object.entries(TERM_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Fibres per ribbon"><Num value={value.ribbonSize} onChange={(v) => set({ ribbonSize: v })} /></Field>
        <Field label="Fibres per connector (MPO-16 = 16)"><Num value={value.fibresPerConnector} onChange={(v) => set({ fibresPerConnector: v })} /></Field>
        <Field label="Ends terminated/spliced"><Num value={value.ends} onChange={(v) => set({ ends: v ?? 2 })} /></Field>
        <Field label="Source URL"><input value={value.sourceUrl ?? ''} onChange={(e) => set({ sourceUrl: e.target.value || undefined })} /></Field>
        <label className="row small" style={{ gap: 6, alignSelf: 'end' }}>
          <input type="checkbox" checked={value.verified} onChange={(e) => set({ verified: e.target.checked })} /> I have checked these values against the datasheet
        </label>
      </div>
      <Field label="Stages that apply to this cable">
        <div className="row">
          {stages.map((s) => (
            <label key={s.id} className="row small" style={{ gap: 4 }}>
              <input type="checkbox" checked={value.stageIds.length === 0 || value.stageIds.includes(s.id)}
                onChange={(e) => {
                  const cur = value.stageIds.length === 0 ? stages.map((x) => x.id) : value.stageIds;
                  set({ stageIds: e.target.checked ? [...cur, s.id] : cur.filter((x) => x !== s.id) });
                }} />
              {s.name}
            </label>
          ))}
        </div>
      </Field>
      <Field label="Notes"><textarea rows={3} value={value.notes ?? ''} onChange={(e) => set({ notes: e.target.value || undefined })} /></Field>
    </div>
  );
}

function InstallGuide({ t }: { t: CableType }) {
  const { cables } = useStore();
  const runs = cables.filter((c) => c.typeId === t.id);
  const maxRun = Math.max(0, ...runs.map((c) => c.lengthM));
  const fibre = t.category === 'fibre';
  const od = t.odMm;
  // Rule-of-thumb fallbacks, used only when the datasheet value is missing (labelled as such).
  const ruleInstalled = od ? (fibre ? 10 * od : 4 * od) : undefined;
  const ruleLoaded = od && fibre ? 15 * od : undefined;
  const ribbonsPerEnd = t.fibreCount && t.ribbonSize ? Math.ceil(t.fibreCount / t.ribbonSize) : undefined;
  const connPerEnd = t.fibreCount && t.fibresPerConnector && t.termination === 'pre-term-mpo' ? Math.ceil(t.fibreCount / t.fibresPerConnector) : undefined;
  const rows: [string, string, string][] = [
    ['Outer diameter', od ? `${od} mm` : 'not set', 'datasheet'],
    ['Min bend radius - installed', t.bendRadiusMm ? `${fmt(t.bendRadiusMm, 1)} mm` : ruleInstalled ? `${fmt(ruleInstalled)} mm (rule of thumb ${fibre ? '10' : '4'}x OD)` : 'not set', t.bendRadiusMm ? 'datasheet' : fibre ? 'TIA-568 via FOA: 10x OD no load' : 'TIA-568: 4x OD UTP'],
    ['Min bend radius - pulling', t.bendRadiusLoadedMm ? `${fmt(t.bendRadiusLoadedMm, 1)} mm` : ruleLoaded ? `${fmt(ruleLoaded)} mm (rule of thumb 15x OD)` : 'not set', t.bendRadiusLoadedMm ? 'datasheet' : 'TIA-568 via FOA: 15x OD at rated tension (premises)'],
    ['Max pulling tension', t.maxPullN ? `${fmt(t.maxPullN)} N (≈ ${fmt(t.maxPullN / 9.81)} kgf)` : 'not set', 'datasheet'],
    ['Weight', t.weightKgKm ? `${t.weightKgKm} kg/km = ${fmt(t.weightKgKm / 1000, 3)} kg/m` : 'not set', 'datasheet'],
    ['Weight of longest run', t.weightKgKm && maxRun ? `${fmt(maxRun)} m ≈ ${fmt((t.weightKgKm * maxRun) / 1000)} kg` : '—', 'calculated'],
    ['Ribbons per end', ribbonsPerEnd ? `${ribbonsPerEnd} x ${t.ribbonSize}F mass-fusion splices` : '—', 'calculated'],
    ['Splice trays per end @144F/tray', ribbonsPerEnd && t.fibreCount ? `${Math.ceil(t.fibreCount / 144)} (e.g. Corning OSE-ST-3-TQ holds 12 x 12F ribbon splices)` : '—', 'Corning eCatalog; confirm with your enclosure'],
    ['Connectors per end', connPerEnd ? `${connPerEnd} x MPO-${t.fibresPerConnector}` : '—', 'calculated'],
  ];
  return (
    <>
      <table style={{ marginBottom: 16 }}>
        <thead><tr><th>Item</th><th>Value</th><th>Basis</th></tr></thead>
        <tbody>{rows.map(([a, b, c]) => <tr key={a}><td>{a}</td><td><b>{b}</b></td><td className="small muted">{c}</td></tr>)}</tbody>
      </table>
      <h3>Installation notes</h3>
      <ul className="small" style={{ lineHeight: 1.7 }}>
        <li>Keep the cable above its pulling bend radius at every corner, drop-out and waterfall while under tension, and above its installed radius once dressed. Use radius drop-outs/waterfalls where cables leave the basket into racks.</li>
        <li>Never exceed the maximum pulling tension. For long runs (up to 300 m on this job) plan intermediate pull points or figure-8 the cable mid-run, and use a swivel and a tension-limited winch or breakaway.</li>
        <li>Tie in with hook-and-loop ties applied loosely (Panduit: loosely and at random intervals; no standard numeric spacing found). Do not crush the jacket; never use tight nylon cable ties on fibre.</li>
        <li>Keep pathway fill within the design limit (Trays &amp; baskets) and the stack under 150 mm depth (TIA-569).</li>
        {t.termination === 'pre-term-mpo' && <li>Pre-terminated: protect the pulling grip/connectors throughout the pull, confirm length and slack before pulling (no field cut). MPO-16 uses a different pin pitch from MPO-12, so check the mating hardware is MPO-16.</li>}
        {t.termination === 'ribbon-splice' && <li>Ribbon splice: track splices by ribbon ({t.ribbonSize}F). Log spliced fibres in Log work; the app shows the ribbon-splice equivalent.</li>}
        {t.notes && <li>{t.notes}</li>}
      </ul>
      {t.sourceUrl && <p className="small">Source: <a href={t.sourceUrl} target="_blank" rel="noreferrer">{t.sourceUrl}</a></p>}
    </>
  );
}

function RackModels() {
  const { rackModels, upsert, remove } = useStore();
  const [edit, setEdit] = useState<RackModel | null>(null);
  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Rack / cabinet models</h2>
        <div className="spacer" />
        <button className="btn primary" onClick={() => setEdit({ id: uid(), brand: '', model: '', heightU: 42, widthMm: 600, depthMm: 1200, verified: false })}>+ Rack model</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Brand</th><th>Model</th><th>Part no.</th><th className="num">U</th><th className="num">W x D (mm)</th><th>Data</th><th /></tr></thead>
          <tbody>
            {rackModels.map((r) => (
              <tr key={r.id}>
                <td>{r.brand}</td><td>{r.model}</td><td className="small">{r.partNumber}</td>
                <td className="num">{r.heightU}</td><td className="num">{r.widthMm} x {r.depthMm}</td>
                <td>{r.verified ? <span className="pill ok">verified</span> : r.sourceUrl ? <span className="pill warn">check</span> : <span className="pill">generic</span>}{r.sourceUrl && <> <a className="small" href={r.sourceUrl} target="_blank" rel="noreferrer">source</a></>}</td>
                <td><button className="btn sm" onClick={() => setEdit(r)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <Modal title={edit.model || 'New rack model'} onClose={() => setEdit(null)}>
          <div className="grid g2">
            <Field label="Brand"><input value={edit.brand} onChange={(e) => setEdit({ ...edit, brand: e.target.value })} /></Field>
            <Field label="Model"><input value={edit.model} onChange={(e) => setEdit({ ...edit, model: e.target.value })} /></Field>
            <Field label="Part no."><input value={edit.partNumber ?? ''} onChange={(e) => setEdit({ ...edit, partNumber: e.target.value || undefined })} /></Field>
            <Field label="Height (U)"><Num value={edit.heightU} onChange={(v) => setEdit({ ...edit, heightU: v ?? 42 })} /></Field>
            <Field label="Width (mm)"><Num value={edit.widthMm} onChange={(v) => setEdit({ ...edit, widthMm: v ?? 600 })} /></Field>
            <Field label="Depth (mm)"><Num value={edit.depthMm} onChange={(v) => setEdit({ ...edit, depthMm: v ?? 1200 })} /></Field>
            <Field label="Source URL"><input value={edit.sourceUrl ?? ''} onChange={(e) => setEdit({ ...edit, sourceUrl: e.target.value || undefined })} /></Field>
            <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={edit.verified} onChange={(e) => setEdit({ ...edit, verified: e.target.checked })} /> checked against datasheet</label>
          </div>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn danger" onClick={() => { if (confirmDelete(edit.model)) { remove('rackModels', edit.id); setEdit(null); } }}>Delete</button>
            <div className="spacer" />
            <button className="btn primary" onClick={() => { upsert('rackModels', edit); setEdit(null); }}>Save</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Standards() {
  return (
    <div className="card">
      <h2>Standards &amp; installation guidance</h2>
      <p className="small muted">Standards documents are paywalled; each rule below is quoted secondhand from the named source. Your project specification takes precedence.</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Topic</th><th>Rule</th><th>Source</th></tr></thead>
          <tbody>
            {STANDARDS.map((s) => (
              <tr key={s.topic}>
                <td><b>{s.topic}</b></td>
                <td className="small">{s.rule}</td>
                <td className="small"><a href={s.url} target="_blank" rel="noreferrer">{s.source}</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
