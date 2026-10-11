import { useState } from 'react';
import { me, today, uid, useStore } from '../store';
import { Empty, Field } from '../ui';
import { Attachments } from '../components';
import type { DiaryEntry } from '../types';

export default function Diary() {
  const { diary, upsert, time, progress } = useStore();
  const [date, setDate] = useState(today());
  const existing = diary.find((d) => d.date === date);
  const [draft, setDraft] = useState<DiaryEntry | null>(null);
  const entry = draft && draft.date === date ? draft : existing ?? { id: uid(), date, createdBy: me() };
  const set = (p: Partial<DiaryEntry>) => setDraft({ ...entry, ...p });
  const save = () => { upsert('diary', entry); setDraft(null); };
  const dirty = !!draft && draft.date === date;
  return (
    <>
      <div className="page-head">
        <h1>Site diary</h1>
        <div className="row"><Field label="Date"><input type="date" value={date} onChange={(e) => { setDate(e.target.value); setDraft(null); }} /></Field></div>
      </div>
      <div className="card">
        <p className="small muted" style={{ marginTop: 0 }}>{time.filter((t) => t.date === date).length} timesheet entries and {progress.filter((p) => p.date === date).length} work entries logged on this day. The diary is included in the daily report.</p>
        <div className="grid g2">
          <Field label="Weather / conditions"><input value={entry.weather ?? ''} onChange={(e) => set({ weather: e.target.value || undefined })} /></Field>
          <Field label="Visitors / inspections"><input value={entry.visitors ?? ''} onChange={(e) => set({ visitors: e.target.value || undefined })} /></Field>
        </div>
        <Field label="Work notes"><textarea rows={4} value={entry.notes ?? ''} onChange={(e) => set({ notes: e.target.value || undefined })} /></Field>
        <div className="grid g2">
          <Field label="Delays / access issues"><textarea rows={3} value={entry.delays ?? ''} onChange={(e) => set({ delays: e.target.value || undefined })} /></Field>
          <Field label="Safety (toolbox, incidents, near misses)"><textarea rows={3} value={entry.safety ?? ''} onChange={(e) => set({ safety: e.target.value || undefined })} /></Field>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          {existing && !dirty && <span className="pill ok">saved</span>}
          <div className="spacer" />
          <button className="btn primary" disabled={!dirty} onClick={save}>Save diary</button>
        </div>
        {existing ? <Attachments entity="diary" entityId={existing.id} title="Site photos" /> : <p className="small muted">Save the diary to attach site photos.</p>}
      </div>
      <div className="card">
        <h2>Recent entries</h2>
        {diary.length === 0 ? <Empty>No diary entries.</Empty> : (
          <table>
            <thead><tr><th>Date</th><th>Weather</th><th>Notes</th><th>Delays</th></tr></thead>
            <tbody>{[...diary].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30).map((d) => (
              <tr key={d.id} onClick={() => { setDate(d.date); setDraft(null); }} style={{ cursor: 'pointer' }}><td>{d.date}</td><td className="small">{d.weather}</td><td className="small">{d.notes?.slice(0, 120)}</td><td className="small">{d.delays?.slice(0, 80)}</td></tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </>
  );
}
