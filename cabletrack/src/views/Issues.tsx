import { useState } from 'react';
import { me, today, uid, useStore } from '../store';
import { Empty, Field, Modal, confirmDelete } from '../ui';
import { Attachments } from '../components';
import { download, toCSV } from '../lib/csv';
import type { Issue, IssueKind } from '../types';

export const ISSUE_LABEL: Record<IssueKind, string> = { defect: 'Defect', punch: 'Punch list', ncr: 'NCR', rfi: 'RFI', safety: 'Safety', delay: 'Delay' };
const PREFIX: Record<IssueKind, string> = { defect: 'DEF', punch: 'PL', ncr: 'NCR', rfi: 'RFI', safety: 'SAF', delay: 'DLY' };

export default function Issues() {
  const { issues, crews, cables, upsert, remove } = useStore();
  const [statusF, setStatusF] = useState('open');
  const [kindF, setKindF] = useState('');
  const [edit, setEdit] = useState<Issue | null>(null);
  const list = issues
    .filter((i) => (!statusF || (statusF === 'open' ? i.status !== 'closed' : i.status === statusF)) && (!kindF || i.kind === kindF))
    .sort((a, b) => b.raisedDate.localeCompare(a.raisedDate) || b.ref.localeCompare(a.ref));
  const nextRef = (k: IssueKind) => PREFIX[k] + '-' + String(issues.filter((i) => i.kind === k).reduce((m, i) => Math.max(m, Number(i.ref.replace(/\D/g, '')) || 0), 0) + 1).padStart(3, '0');
  return (
    <>
      <div className="page-head">
        <h1>Issues, punch list &amp; NCRs</h1>
        <div className="row">
          <button className="btn primary" onClick={() => setEdit({ id: uid(), ref: nextRef('defect'), kind: 'defect', title: '', status: 'open', priority: 'medium', raisedBy: me(), raisedDate: today() })}>+ Issue</button>
          <button className="btn" onClick={() => download(`issues-${today()}.csv`, toCSV([['ref', 'kind', 'title', 'status', 'priority', 'raised', 'raised_by', 'assigned', 'due', 'closed', 'related_cable', 'description', 'closeout'], ...issues.map((i) => [i.ref, ISSUE_LABEL[i.kind], i.title, i.status, i.priority, i.raisedDate, i.raisedBy, crews.find((c) => c.id === i.assignedCrewId)?.name, i.dueDate, i.closedDate, i.entity === 'cable' ? cables.find((c) => c.id === i.entityId)?.tag : '', i.description, i.closeout])]))}>Export CSV</button>
        </div>
      </div>
      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <select value={statusF} onChange={(e) => setStatusF(e.target.value)}><option value="open">Open (not closed)</option><option value="closed">Closed</option><option value="">All</option></select>
          <select value={kindF} onChange={(e) => setKindF(e.target.value)}><option value="">All kinds</option>{Object.entries(ISSUE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </div>
        {list.length === 0 ? <Empty>No issues.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Ref</th><th>Kind</th><th>Title</th><th>Priority</th><th>Status</th><th>Raised</th><th>Assigned</th><th>Due</th><th /></tr></thead>
              <tbody>
                {list.map((i) => (
                  <tr key={i.id}>
                    <td><b>{i.ref}</b></td><td className="small">{ISSUE_LABEL[i.kind]}</td><td>{i.title}</td>
                    <td><span className={'pill ' + (i.priority === 'high' ? 'bad' : i.priority === 'medium' ? 'warn' : '')}>{i.priority}</span></td>
                    <td><span className={'pill ' + (i.status === 'closed' ? 'ok' : '')}>{i.status}</span></td>
                    <td className="small">{i.raisedDate}</td><td className="small">{crews.find((c) => c.id === i.assignedCrewId)?.name}</td>
                    <td className="small" style={{ color: i.dueDate && i.dueDate < today() && i.status !== 'closed' ? 'var(--bad)' : undefined }}>{i.dueDate}</td>
                    <td><button className="btn sm" onClick={() => setEdit(i)}>Open</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {edit && (
        <Modal title={edit.ref} onClose={() => setEdit(null)} wide>
          <div className="grid g3">
            <Field label="Kind"><select value={edit.kind} onChange={(e) => { const k = e.target.value as IssueKind; setEdit({ ...edit, kind: k, ref: issues.some((x) => x.id === edit.id) ? edit.ref : nextRef(k) }); }}>{Object.entries(ISSUE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Ref"><input value={edit.ref} onChange={(e) => setEdit({ ...edit, ref: e.target.value })} /></Field>
            <Field label="Priority"><select value={edit.priority} onChange={(e) => setEdit({ ...edit, priority: e.target.value as Issue['priority'] })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></Field>
          </div>
          <Field label="Title"><input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} autoFocus /></Field>
          <Field label="Description"><textarea rows={3} value={edit.description ?? ''} onChange={(e) => setEdit({ ...edit, description: e.target.value || undefined })} /></Field>
          <div className="grid g3">
            <Field label="Status"><select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value as Issue['status'], closedDate: e.target.value === 'closed' ? edit.closedDate ?? today() : undefined })}><option value="open">Open</option><option value="in-progress">In progress</option><option value="closed">Closed</option></select></Field>
            <Field label="Assigned crew"><select value={edit.assignedCrewId ?? ''} onChange={(e) => setEdit({ ...edit, assignedCrewId: e.target.value || undefined })}><option value="">—</option>{crews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label="Due"><input type="date" value={edit.dueDate ?? ''} onChange={(e) => setEdit({ ...edit, dueDate: e.target.value || undefined })} /></Field>
            <Field label="Related cable"><select value={edit.entity === 'cable' ? edit.entityId ?? '' : ''} onChange={(e) => setEdit({ ...edit, entity: e.target.value ? 'cable' : undefined, entityId: e.target.value || undefined })}><option value="">—</option>{cables.map((c) => <option key={c.id} value={c.id}>{c.tag}</option>)}</select></Field>
            <Field label="Raised by"><input value={edit.raisedBy ?? ''} onChange={(e) => setEdit({ ...edit, raisedBy: e.target.value })} /></Field>
            <Field label="Raised"><input type="date" value={edit.raisedDate} onChange={(e) => setEdit({ ...edit, raisedDate: e.target.value })} /></Field>
          </div>
          {edit.status === 'closed' && <Field label="Close-out / corrective action"><textarea rows={2} value={edit.closeout ?? ''} onChange={(e) => setEdit({ ...edit, closeout: e.target.value || undefined })} /></Field>}
          {issues.some((x) => x.id === edit.id) ? <Attachments entity="issue" entityId={edit.id} /> : <p className="small muted">Save first to attach photos.</p>}
          <div className="row" style={{ marginTop: 12 }}>
            {issues.some((x) => x.id === edit.id) && <button className="btn danger" onClick={() => { if (confirmDelete(edit.ref)) { remove('issues', edit.id); setEdit(null); } }}>Delete</button>}
            <div className="spacer" />
            <button className="btn primary" disabled={!edit.title} onClick={() => { upsert('issues', edit); setEdit(null); }}>Save</button>
          </div>
        </Modal>
      )}
    </>
  );
}
