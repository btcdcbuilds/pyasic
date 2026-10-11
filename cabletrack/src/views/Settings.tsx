import { useState } from 'react';
import { exportData, uid, useStore } from '../store';
import { Field, Num, confirmDelete } from '../ui';
import { download, readFile } from '../lib/csv';
import type { AppData, StageMeasure } from '../types';

const MEASURES: { v: StageMeasure; label: string }[] = [
  { v: 'length', label: 'Metres of cable' },
  { v: 'fibres', label: 'Fibres (x ends)' },
  { v: 'connectors', label: 'Connectors (x ends)' },
  { v: 'count', label: 'Count (1 per cable)' },
];

export default function Settings() {
  const { project, stages, progress, setProject, upsert, remove, replaceAll, reset } = useStore();
  const [msg, setMsg] = useState('');

  const backup = () => download(`cabletrack-backup-${new Date().toISOString().slice(0, 16).replace(':', '')}.json`, JSON.stringify(exportData(), null, 2), 'application/json');
  const restore = async (f: File) => {
    try {
      const d = JSON.parse(await readFile(f)) as AppData;
      if (!d.stages || !d.cables) throw new Error('Not a CableTrack backup file');
      if (!window.confirm('Replace ALL current data with this backup?')) return;
      replaceAll(d);
      setMsg(`Restored backup: ${d.cables.length} cables, ${d.progress.length} progress entries, ${d.time.length} time entries.`);
    } catch (e) {
      setMsg('Restore failed: ' + (e as Error).message);
    }
  };

  return (
    <>
      <div className="page-head"><h1>Settings</h1></div>
      {msg && <div className="notice">{msg}</div>}
      <div className="card">
        <h2>Project</h2>
        <div className="grid g2">
          <Field label="Project name"><input value={project.name} onChange={(e) => setProject({ name: e.target.value })} /></Field>
          <Field label="Client"><input value={project.client} onChange={(e) => setProject({ client: e.target.value })} /></Field>
          <Field label="Site"><input value={project.site} onChange={(e) => setProject({ site: e.target.value })} /></Field>
          <Field label="Start date"><input type="date" value={project.startDate} onChange={(e) => setProject({ startDate: e.target.value })} /></Field>
          <Field label="Default shift hours"><Num value={project.defaultShiftHours} step={0.5} onChange={(v) => setProject({ defaultShiftHours: v ?? 0 })} /></Field>
        </div>
      </div>

      <div className="card">
        <h2>Work stages</h2>
        <p className="small muted" style={{ marginTop: 0 }}>
          The activities you track. Rename, re-colour or add stages to fit any job (e.g. "Labelled", "Dressed", "Certified"). Which stages apply to each cable type is set in the Cable library.
        </p>
        <table>
          <thead><tr><th>Colour</th><th>Name</th><th>Measured in</th><th>ID</th><th /></tr></thead>
          <tbody>
            {stages.map((s, i) => (
              <tr key={s.id}>
                <td><input type="color" value={s.color} onChange={(e) => upsert('stages', { ...s, color: e.target.value })} style={{ padding: 0, width: 34, height: 28 }} /></td>
                <td><input value={s.name} onChange={(e) => upsert('stages', { ...s, name: e.target.value })} /></td>
                <td>
                  <select value={s.measure} onChange={(e) => upsert('stages', { ...s, measure: e.target.value as StageMeasure })}>
                    {MEASURES.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}
                  </select>
                </td>
                <td className="small muted">{s.id}</td>
                <td className="row" style={{ flexWrap: 'nowrap' }}>
                  <button className="btn sm" disabled={i === 0} onClick={() => {
                    const arr = [...stages];
                    [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
                    useStore.setState({ stages: arr });
                  }}>↑</button>
                  <button className="btn sm danger" onClick={() => {
                    const n = progress.filter((p) => p.stageId === s.id).length;
                    if (confirmDelete(`stage "${s.name}"${n ? ` (${n} progress entries will be orphaned)` : ''}`)) remove('stages', s.id);
                  }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn" style={{ marginTop: 10 }} onClick={() => upsert('stages', { id: uid().slice(0, 8), name: 'New stage', measure: 'count', color: '#6250d6' })}>+ Add stage</button>
      </div>

      <div className="card">
        <h2>Data &amp; backup</h2>
        <div className="notice warn">
          Data is saved in this browser on this device. Download a backup at the end of every shift, and keep it somewhere safe (email/OneDrive). To move data to another device, restore the backup there.
        </div>
        <div className="row">
          <button className="btn primary" onClick={backup}>Download backup (.json)</button>
          <label className="btn">Restore backup<input type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} /></label>
          <div className="spacer" />
          <button className="btn danger" onClick={() => window.confirm('Erase ALL data on this device? Download a backup first.') && reset()}>Erase all data</button>
        </div>
      </div>
    </>
  );
}
