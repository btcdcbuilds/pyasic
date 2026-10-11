import { Fragment, useMemo, useState } from 'react';
import { me, today, uid, useStore } from '../store';
import { Bar, Empty, Field, Modal, confirmDelete } from '../ui';
import { Attachments, SignaturePad, locationPath } from '../components';
import { POINT_LEGEND } from '../data/norms';
import { isHold, lotProgress, nextLotNumber } from '../lib/itp';
import { download, toCSV } from '../lib/csv';
import type { AppData, InspPoint, ItpItem, ItpLot, ItpSignoff, ItpTemplate } from '../types';

const POINTS: InspPoint[] = ['', 'H', 'W', 'R', 'S', 'I'];

export default function Itp() {
  const [tab, setTab] = useState<'lots' | 'templates'>('lots');
  return (
    <>
      <div className="page-head no-print">
        <h1>ITP - inspection &amp; test plans</h1>
        <div className="row">
          <button className={'btn' + (tab === 'lots' ? ' active' : '')} onClick={() => setTab('lots')}>Lots &amp; sign-off</button>
          <button className={'btn' + (tab === 'templates' ? ' active' : '')} onClick={() => setTab('templates')}>ITP templates</button>
        </div>
      </div>
      {tab === 'lots' ? <Lots /> : <Templates />}
    </>
  );
}

function Lots() {
  const data = useStore() as unknown as AppData;
  const { itpLots, itpTemplates, upsert } = useStore();
  const [open, setOpen] = useState<string | null>(null);
  const [create, setCreate] = useState(false);
  const lot = itpLots.find((l) => l.id === open);
  if (lot) return <LotView lot={lot} onBack={() => setOpen(null)} />;
  return (
    <>
      <div className="notice no-print">
        An ITP lot is a batch of work inspected and signed off together, for example "864F cables FC-001 to 006" or "Level 2 basket run". Each lot uses an ITP template. Hold points can release work stages: logging that stage on the lot's cables warns (or blocks) until the hold point is signed.
      </div>
      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>Lots ({itpLots.length})</h2>
          <div className="spacer" />
          <button className="btn primary" onClick={() => setCreate(true)} disabled={!itpTemplates.length}>+ New lot</button>
        </div>
        {itpLots.length === 0 ? <Empty>No lots yet. Create one and pick the cables / pathways it covers.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Lot</th><th>Title</th><th>ITP</th><th className="num">Scope</th><th style={{ width: 160 }}>Signed</th><th>Holds open</th><th>Status</th></tr></thead>
              <tbody>
                {[...itpLots].sort((a, b) => b.number.localeCompare(a.number, undefined, { numeric: true })).map((l) => {
                  const p = lotProgress(data, l);
                  const tpl = itpTemplates.find((t) => t.id === l.templateId);
                  return (
                    <tr key={l.id} onClick={() => setOpen(l.id)} style={{ cursor: 'pointer' }}>
                      <td><b>{l.number}</b></td>
                      <td>{l.title}</td>
                      <td className="small">{tpl?.code}</td>
                      <td className="num small">{l.cableIds.length} cables{l.pathwayIds.length ? ` · ${l.pathwayIds.length} pathways` : ''}</td>
                      <td><div className="row" style={{ flexWrap: 'nowrap' }}><div style={{ flex: 1 }}><Bar pct={p.pct} color="var(--ok)" /></div><span className="small">{p.done}/{p.total}</span></div></td>
                      <td>{p.holdsOpen ? <span className="pill warn">{p.holdsOpen}</span> : <span className="pill ok">0</span>}</td>
                      <td>{l.closed ? <span className="pill ok">closed</span> : p.failed ? <span className="pill bad">{p.failed} failed</span> : <span className="pill">open</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {create && <LotForm onClose={() => setCreate(false)} onSave={(l) => { upsert('itpLots', l); setCreate(false); setOpen(l.id); }} initial={{ id: uid(), number: nextLotNumber(data), templateId: itpTemplates[0]?.id ?? '', title: '', cableIds: [], pathwayIds: [], locationIds: [], createdAt: Date.now(), createdBy: me(), signoffs: {} }} />}
    </>
  );
}

function LotForm({ initial, onSave, onClose }: { initial: ItpLot; onSave: (l: ItpLot) => void; onClose: () => void }) {
  const { itpTemplates, cables, cableTypes, pathways } = useStore();
  const [l, setL] = useState(initial);
  const [q, setQ] = useState('');
  const [typeF, setTypeF] = useState('');
  const shown = cables.filter((c) => (!typeF || c.typeId === typeF) && (!q || c.tag.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => a.tag.localeCompare(b.tag, undefined, { numeric: true }));
  const toggle = (key: 'cableIds' | 'pathwayIds', id: string, on: boolean) => setL({ ...l, [key]: on ? [...l[key], id] : l[key].filter((x) => x !== id) });
  return (
    <Modal title={initial.title ? `Edit ${initial.number}` : 'New ITP lot'} onClose={onClose} wide>
      <div className="grid g3">
        <Field label="Lot number"><input value={l.number} onChange={(e) => setL({ ...l, number: e.target.value })} /></Field>
        <Field label="ITP template"><select value={l.templateId} onChange={(e) => setL({ ...l, templateId: e.target.value })}>{itpTemplates.map((t) => <option key={t.id} value={t.id}>{t.code} {t.name}</option>)}</select></Field>
        <Field label="Title"><input value={l.title} placeholder="e.g. 864F cables FC-001 to 006" onChange={(e) => setL({ ...l, title: e.target.value })} /></Field>
      </div>
      <Field label="Description / location"><textarea rows={2} value={l.description ?? ''} onChange={(e) => setL({ ...l, description: e.target.value || undefined })} /></Field>
      <h3>Cables in this lot ({l.cableIds.length})</h3>
      <div className="row" style={{ marginBottom: 6 }}>
        <input placeholder="Filter tags…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 120 }} />
        <select value={typeF} onChange={(e) => setTypeF(e.target.value)}><option value="">All types</option>{cableTypes.filter((t) => cables.some((c) => c.typeId === t.id)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        <button className="btn sm" onClick={() => setL({ ...l, cableIds: [...new Set([...l.cableIds, ...shown.map((c) => c.id)])] })}>Select shown</button>
        <button className="btn sm" onClick={() => setL({ ...l, cableIds: l.cableIds.filter((id) => !shown.some((c) => c.id === id)) })}>Clear shown</button>
      </div>
      <div className="row" style={{ maxHeight: 180, overflowY: 'auto' }}>
        {shown.map((c) => <label key={c.id} className="row small" style={{ gap: 4, minWidth: 110 }}><input type="checkbox" checked={l.cableIds.includes(c.id)} onChange={(e) => toggle('cableIds', c.id, e.target.checked)} />{c.tag}</label>)}
      </div>
      {pathways.length > 0 && (
        <>
          <h3>Pathways in this lot ({l.pathwayIds.length})</h3>
          <div className="row" style={{ maxHeight: 120, overflowY: 'auto' }}>
            {pathways.map((p) => <label key={p.id} className="row small" style={{ gap: 4, minWidth: 110 }}><input type="checkbox" checked={l.pathwayIds.includes(p.id)} onChange={(e) => toggle('pathwayIds', p.id, e.target.checked)} />{p.code || p.name}</label>)}
          </div>
        </>
      )}
      <div className="row" style={{ marginTop: 12 }}><div className="spacer" /><button className="btn primary" disabled={!l.title || !l.templateId} onClick={() => onSave(l)}>Save lot</button></div>
    </Modal>
  );
}

function LotView({ lot, onBack }: { lot: ItpLot; onBack: () => void }) {
  const data = useStore() as unknown as AppData;
  const { upsert, remove, members } = useStore();
  const tpl = data.itpTemplates.find((t) => t.id === lot.templateId);
  const [signItem, setSignItem] = useState<ItpItem | null>(null);
  const [editLot, setEditLot] = useState(false);
  const [closing, setClosing] = useState(false);
  const p = lotProgress(data, lot);
  const sections = useMemo(() => {
    const m = new Map<string, ItpItem[]>();
    for (const it of tpl?.items ?? []) (m.get(it.section) ?? m.set(it.section, []).get(it.section)!).push(it);
    return [...m.entries()];
  }, [tpl]);
  const cableTags = lot.cableIds.map((id) => data.cables.find((c) => c.id === id)?.tag).filter(Boolean) as string[];

  const print = () => {
    document.body.classList.add('printing');
    setTimeout(() => { window.print(); document.body.classList.remove('printing'); }, 50);
  };

  if (!tpl) return <div className="card">Template missing. <button className="btn" onClick={onBack}>Back</button></div>;
  return (
    <>
      <div className="row no-print" style={{ marginBottom: 12 }}>
        <button className="btn" onClick={onBack}>← Lots</button>
        <div className="spacer" />
        <button className="btn" onClick={() => setEditLot(true)}>Edit lot</button>
        <button className="btn" onClick={() => download(`${lot.number}-itp.csv`, toCSV([
          ['Lot', 'Ref', 'Section', 'Activity', 'Criteria', 'Reference', 'Record', 'Frequency', 'Contractor', 'Client', 'Status', 'Signed by', 'Date', 'Client signed', 'Client date', 'Comment'],
          ...tpl.items.map((it) => { const s = lot.signoffs[it.id]; return [lot.number, it.ref, it.section, it.activity, it.criteria, it.reference, it.record, it.frequency, it.contractor, it.client, s?.status ?? 'pending', s?.by, s?.date, s?.clientBy, s?.clientDate, s?.comment]; }),
        ]))}>Export CSV</button>
        <button className="btn primary" onClick={print}>Print / PDF sign-off sheet</button>
      </div>

      <div className="print-area">
        <div className="card itp-sheet">
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div className="small muted">INSPECTION &amp; TEST PLAN - SIGN-OFF RECORD</div>
              <h2 style={{ fontSize: 20, margin: '4px 0' }}>{tpl.code} {tpl.name} <span className="muted small">Rev {tpl.revision}</span></h2>
            </div>
            <div className="num"><b style={{ fontSize: 18 }}>{lot.number}</b><div className="small">{lot.closed ? 'CLOSED ' + lot.closed.date : `${p.done}/${p.total} items signed`}</div></div>
          </div>
          <table className="itp-head">
            <tbody>
              <tr><th>Project</th><td>{data.project.name}</td><th>Client</th><td>{data.project.client || '—'}</td></tr>
              <tr><th>Contractor</th><td>{data.project.contractor || '—'}</td><th>Contract no.</th><td>{data.project.contractNo || '—'}</td></tr>
              <tr><th>Lot</th><td colSpan={3}><b>{lot.title}</b>{lot.description ? ` - ${lot.description}` : ''}</td></tr>
              <tr><th>Scope</th><td colSpan={3} className="small">{cableTags.length ? `Cables (${cableTags.length}): ${cableTags.join(', ')}` : ''}{lot.pathwayIds.length ? ` Pathways: ${lot.pathwayIds.map((id) => data.pathways.find((x) => x.id === id)?.code || data.pathways.find((x) => x.id === id)?.name).join(', ')}` : ''}{lot.locationIds.length ? ` Locations: ${lot.locationIds.map((id) => locationPath(data.locations, id)).join(', ')}` : ''}</td></tr>
            </tbody>
          </table>
          <div className="table-wrap">
            <table className="itp-table">
              <thead>
                <tr><th>Ref</th><th>Activity</th><th>Acceptance criteria</th><th>Reference</th><th>Record</th><th>Freq.</th><th title="Contractor">Con</th><th title="Client">Cli</th><th>Result</th><th>Contractor sign-off</th><th>Client sign-off</th></tr>
              </thead>
              <tbody>
                {sections.map(([sec, items]) => (
                  <Fragment key={sec}>
                    <tr className="itp-sec"><td colSpan={11}><b>{sec}</b></td></tr>
                    {items.map((it) => {
                      const s = lot.signoffs[it.id];
                      return (
                        <tr key={it.id} className={isHold(it) ? 'itp-hold' : ''}>
                          <td>{it.ref}</td>
                          <td><b>{it.activity}</b>{it.releasesStageId && <div className="small muted">releases: {data.stages.find((x) => x.id === it.releasesStageId)?.name}</div>}</td>
                          <td className="small">{it.criteria}</td>
                          <td className="small">{it.reference}</td>
                          <td className="small">{it.record}</td>
                          <td className="small">{it.frequency}</td>
                          <td className="num"><b>{it.contractor}</b></td>
                          <td className="num"><b>{it.client}</b></td>
                          <td>{s?.status && s.status !== 'pending' ? <span className={'pill ' + (s.status === 'pass' ? 'ok' : s.status === 'fail' ? 'bad' : '')}>{s.status.toUpperCase()}</span> : <span className="muted small">—</span>}{s?.comment && <div className="small">{s.comment}</div>}</td>
                          <td className="small">{s?.by ? <>{s.signature && <img src={s.signature} alt="signature" className="sig-img" />}<div>{s.by}{s.role ? `, ${s.role}` : ''}</div><div className="muted">{s.date}</div></> : null}</td>
                          <td className="small">{s?.clientBy ? <>{s.clientSignature && <img src={s.clientSignature} alt="signature" className="sig-img" />}<div>{s.clientBy}</div><div className="muted">{s.clientDate}</div></> : null}
                            <div className="no-print"><button className="btn sm" disabled={!!lot.closed} onClick={() => setSignItem(it)}>{s?.by ? 'Update' : 'Sign'}</button></div>
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="small muted" style={{ marginTop: 8 }}>
            {POINT_LEGEND.map((l) => <span key={l.code} style={{ marginRight: 14 }}><b>{l.code}</b> = {l.name}</span>)}
            {tpl.notes && <div style={{ marginTop: 4 }}>{tpl.notes}</div>}
          </div>
          <div className="grid g2 itp-final">
            <div className="sig-box">
              <div className="small muted">Lot closed - contractor</div>
              {lot.closed?.signature && <img src={lot.closed.signature} alt="signature" className="sig-img" />}
              <div>{lot.closed?.by ?? ' '}</div><div className="small muted">{lot.closed?.date ?? 'Date:'}</div>
            </div>
            <div className="sig-box">
              <div className="small muted">Lot accepted - client</div>
              {lot.closed?.clientSignature && <img src={lot.closed.clientSignature} alt="signature" className="sig-img" />}
              <div>{lot.closed?.clientBy ?? ' '}</div><div className="small muted">{lot.closed?.clientDate ?? 'Date:'}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card no-print">
        <div className="row">
          {!lot.closed ? (
            <button className="btn primary" disabled={p.done < p.total} title={p.done < p.total ? 'All items must be signed (pass or N/A) first' : ''} onClick={() => setClosing(true)}>Close lot</button>
          ) : (
            <button className="btn" onClick={() => confirm('Re-open this lot?') && upsert('itpLots', { ...lot, closed: undefined })}>Re-open lot</button>
          )}
          <div className="spacer" />
          <button className="btn danger" onClick={() => { if (confirmDelete(`lot ${lot.number}`)) { remove('itpLots', lot.id); onBack(); } }}>Delete lot</button>
        </div>
        <Attachments entity="itp" entityId={lot.id} title="Lot evidence (photos, test reports, certificates)" />
      </div>

      {signItem && (
        <SignModal item={signItem} current={lot.signoffs[signItem.id]} members={members.map((m) => m.name)}
          onClose={() => setSignItem(null)}
          onSave={(s) => { upsert('itpLots', { ...lot, signoffs: { ...lot.signoffs, [signItem.id]: s } }); setSignItem(null); }} />
      )}
      {editLot && <LotForm initial={lot} onClose={() => setEditLot(false)} onSave={(l) => { upsert('itpLots', l); setEditLot(false); }} />}
      {closing && <CloseModal onClose={() => setClosing(false)} onSave={(c) => { upsert('itpLots', { ...lot, closed: c }); setClosing(false); }} />}
    </>
  );
}

function SignModal({ item, current, members, onSave, onClose }: { item: ItpItem; current?: ItpSignoff; members: string[]; onSave: (s: ItpSignoff) => void; onClose: () => void }) {
  const [s, setS] = useState<ItpSignoff>(current ?? { status: 'pass', by: me(), date: today() });
  const [pad, setPad] = useState<'con' | 'cli' | null>(null);
  return (
    <Modal title={`${item.ref} ${item.activity}`} onClose={onClose} wide>
      <p className="small"><b>Criteria:</b> {item.criteria}<br /><b>Reference:</b> {item.reference} · <b>Record:</b> {item.record}</p>
      <div className="grid g3">
        <Field label="Result">
          <select value={s.status} onChange={(e) => setS({ ...s, status: e.target.value as ItpSignoff['status'] })}>
            <option value="pass">Pass / conforms</option><option value="fail">Fail / non-conformance</option><option value="na">Not applicable</option><option value="pending">Pending</option>
          </select>
        </Field>
        <Field label="Date"><input type="date" value={s.date ?? ''} onChange={(e) => setS({ ...s, date: e.target.value })} /></Field>
        <Field label="Comment"><input value={s.comment ?? ''} onChange={(e) => setS({ ...s, comment: e.target.value || undefined })} /></Field>
      </div>
      <h3>Contractor</h3>
      <div className="grid g3">
        <Field label="Name"><input list="members" value={s.by ?? ''} onChange={(e) => setS({ ...s, by: e.target.value })} /></Field>
        <Field label="Role"><input value={s.role ?? ''} onChange={(e) => setS({ ...s, role: e.target.value || undefined })} /></Field>
        <Field label="Company"><input value={s.company ?? ''} onChange={(e) => setS({ ...s, company: e.target.value || undefined })} /></Field>
      </div>
      <div className="row" style={{ marginTop: 6 }}>
        {s.signature ? <img src={s.signature} alt="signature" className="sig-img" /> : <span className="small muted">No signature</span>}
        <button className="btn sm" onClick={() => setPad('con')}>{s.signature ? 'Re-sign' : 'Sign on screen'}</button>
      </div>
      <h3>Client {item.client ? `(${item.client})` : '(optional)'}</h3>
      <div className="grid g3">
        <Field label="Name"><input value={s.clientBy ?? ''} onChange={(e) => setS({ ...s, clientBy: e.target.value || undefined })} /></Field>
        <Field label="Date"><input type="date" value={s.clientDate ?? ''} onChange={(e) => setS({ ...s, clientDate: e.target.value || undefined })} /></Field>
        <div className="row" style={{ alignSelf: 'end' }}>
          {s.clientSignature && <img src={s.clientSignature} alt="signature" className="sig-img" />}
          <button className="btn sm" onClick={() => setPad('cli')}>{s.clientSignature ? 'Re-sign' : 'Client sign'}</button>
        </div>
      </div>
      <datalist id="members">{members.map((m) => <option key={m} value={m} />)}</datalist>
      {pad && (
        <div style={{ marginTop: 12 }}>
          <SignaturePad onCancel={() => setPad(null)} onDone={(url) => { setS(pad === 'con' ? { ...s, signature: url } : { ...s, clientSignature: url, clientDate: s.clientDate ?? today() }); setPad(null); }} />
        </div>
      )}
      {item.client === 'H' && !s.clientBy && s.status === 'pass' && <p className="small" style={{ color: 'var(--warn)' }}>Client hold point: the stage it releases stays held until the client signs.</p>}
      <div className="row" style={{ marginTop: 12 }}><div className="spacer" /><button className="btn primary" disabled={!s.by} onClick={() => onSave(s)}>Save sign-off</button></div>
    </Modal>
  );
}

function CloseModal({ onSave, onClose }: { onSave: (c: NonNullable<ItpLot['closed']>) => void; onClose: () => void }) {
  const [c, setC] = useState<NonNullable<ItpLot['closed']>>({ by: me(), date: today() });
  const [pad, setPad] = useState<'con' | 'cli' | null>(null);
  return (
    <Modal title="Close lot" onClose={onClose}>
      <div className="grid g2">
        <Field label="Contractor name"><input value={c.by} onChange={(e) => setC({ ...c, by: e.target.value })} /></Field>
        <Field label="Date"><input type="date" value={c.date} onChange={(e) => setC({ ...c, date: e.target.value })} /></Field>
        <Field label="Client name (optional)"><input value={c.clientBy ?? ''} onChange={(e) => setC({ ...c, clientBy: e.target.value || undefined, clientDate: c.clientDate ?? today() })} /></Field>
        <Field label="Client date"><input type="date" value={c.clientDate ?? ''} onChange={(e) => setC({ ...c, clientDate: e.target.value || undefined })} /></Field>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        {c.signature && <img src={c.signature} alt="signature" className="sig-img" />}
        <button className="btn sm" onClick={() => setPad('con')}>Contractor sign</button>
        {c.clientSignature && <img src={c.clientSignature} alt="signature" className="sig-img" />}
        <button className="btn sm" onClick={() => setPad('cli')}>Client sign</button>
      </div>
      {pad && <div style={{ marginTop: 12 }}><SignaturePad onCancel={() => setPad(null)} onDone={(u) => { setC(pad === 'con' ? { ...c, signature: u } : { ...c, clientSignature: u }); setPad(null); }} /></div>}
      <div className="row" style={{ marginTop: 12 }}><div className="spacer" /><button className="btn primary" disabled={!c.by} onClick={() => onSave(c)}>Close lot</button></div>
    </Modal>
  );
}

function Templates() {
  const { itpTemplates, stages, upsert, remove, itpLots } = useStore();
  const [selId, setSelId] = useState(itpTemplates[0]?.id ?? '');
  const tpl = itpTemplates.find((t) => t.id === selId) ?? itpTemplates[0];
  const setT = (p: Partial<ItpTemplate>) => tpl && upsert('itpTemplates', { ...tpl, ...p });
  const setItem = (id: string, p: Partial<ItpItem>) => tpl && setT({ items: tpl.items.map((i) => (i.id === id ? { ...i, ...p } : i)) });
  return (
    <>
      <div className="card">
        <div className="row">
          <select value={tpl?.id ?? ''} onChange={(e) => setSelId(e.target.value)}>{itpTemplates.map((t) => <option key={t.id} value={t.id}>{t.code} {t.name}</option>)}</select>
          <button className="btn" onClick={() => { if (!tpl) return; const c = { ...structuredClone(tpl), id: uid(), code: tpl.code + '-COPY', name: tpl.name + ' (copy)' }; upsert('itpTemplates', c); setSelId(c.id); }}>Duplicate</button>
          <button className="btn" onClick={() => { const t: ItpTemplate = { id: uid(), code: 'ITP-NEW', name: 'New ITP', revision: 'A', scope: '', items: [] }; upsert('itpTemplates', t); setSelId(t.id); }}>New blank</button>
          <div className="spacer" />
          {tpl && <button className="btn danger" disabled={itpLots.some((l) => l.templateId === tpl.id)} title="Templates used by lots can't be deleted" onClick={() => confirmDelete(tpl.name) && remove('itpTemplates', tpl.id)}>Delete</button>}
        </div>
      </div>
      {tpl && (
        <div className="card">
          <div className="grid g4">
            <Field label="Code"><input value={tpl.code} onChange={(e) => setT({ code: e.target.value })} /></Field>
            <Field label="Name"><input value={tpl.name} onChange={(e) => setT({ name: e.target.value })} /></Field>
            <Field label="Revision"><input value={tpl.revision} onChange={(e) => setT({ revision: e.target.value })} /></Field>
            <Field label="Scope"><input value={tpl.scope} onChange={(e) => setT({ scope: e.target.value })} /></Field>
          </div>
          <Field label="Notes (printed on the sheet)"><textarea rows={2} value={tpl.notes ?? ''} onChange={(e) => setT({ notes: e.target.value || undefined })} /></Field>
          <div className="notice warn" style={{ marginTop: 10 }}>Inspection point codes in the default template are suggestions, not from any standard. Set H / W / R per your contract with the client. Criteria cite their sources; the project spec takes precedence.</div>
          <div className="table-wrap">
            <table className="itp-edit">
              <thead><tr><th>Ref</th><th>Section</th><th>Activity</th><th>Criteria</th><th>Reference</th><th>Record</th><th>Freq.</th><th>Con</th><th>Cli</th><th>Releases stage</th><th /></tr></thead>
              <tbody>
                {tpl.items.map((it) => (
                  <tr key={it.id}>
                    <td><input value={it.ref} onChange={(e) => setItem(it.id, { ref: e.target.value })} style={{ width: 50 }} /></td>
                    <td><input value={it.section} onChange={(e) => setItem(it.id, { section: e.target.value })} style={{ width: 110 }} /></td>
                    <td><textarea rows={2} value={it.activity} onChange={(e) => setItem(it.id, { activity: e.target.value })} style={{ width: 150 }} /></td>
                    <td><textarea rows={2} value={it.criteria} onChange={(e) => setItem(it.id, { criteria: e.target.value })} style={{ width: 240 }} /></td>
                    <td><textarea rows={2} value={it.reference} onChange={(e) => setItem(it.id, { reference: e.target.value })} style={{ width: 150 }} /></td>
                    <td><textarea rows={2} value={it.record} onChange={(e) => setItem(it.id, { record: e.target.value })} style={{ width: 120 }} /></td>
                    <td><input value={it.frequency} onChange={(e) => setItem(it.id, { frequency: e.target.value })} style={{ width: 90 }} /></td>
                    <td><select value={it.contractor} onChange={(e) => setItem(it.id, { contractor: e.target.value as InspPoint })}>{POINTS.map((p) => <option key={p} value={p}>{p || '–'}</option>)}</select></td>
                    <td><select value={it.client} onChange={(e) => setItem(it.id, { client: e.target.value as InspPoint })}>{POINTS.map((p) => <option key={p} value={p}>{p || '–'}</option>)}</select></td>
                    <td><select value={it.releasesStageId ?? ''} onChange={(e) => setItem(it.id, { releasesStageId: e.target.value || undefined })}><option value="">—</option>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></td>
                    <td><button className="btn sm danger" onClick={() => setT({ items: tpl.items.filter((x) => x.id !== it.id) })}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn" style={{ marginTop: 10 }} onClick={() => setT({ items: [...tpl.items, { id: uid(), ref: String(tpl.items.length + 1), section: tpl.items[tpl.items.length - 1]?.section ?? 'General', activity: '', criteria: '', reference: '', record: '', frequency: '', contractor: 'I', client: '' }] })}>+ Item</button>
          <h3>Legend</h3>
          <table><tbody>{POINT_LEGEND.map((l) => <tr key={l.code}><td><b>{l.code}</b></td><td>{l.name}</td><td className="small">{l.meaning}</td></tr>)}</tbody></table>
          <p className="small muted">Definitions as restated in a TfNSW quality specification (Q6). Codes vary by organisation.</p>
        </div>
      )}
    </>
  );
}
