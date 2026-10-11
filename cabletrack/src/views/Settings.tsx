import { useEffect, useState } from 'react';
import { exportData, uid, useStore } from '../store';
import { Field, Num, confirmDelete } from '../ui';
import { download, readFile } from '../lib/csv';
import { JOB_TEMPLATES } from '../seed';
import * as cloud from '../lib/sync';
import type { AppData, MemberRole, StageMeasure } from '../types';

const MEASURES: { v: StageMeasure; label: string }[] = [
  { v: 'length', label: 'Metres of cable' },
  { v: 'fibres', label: 'Fibres (x ends)' },
  { v: 'connectors', label: 'Connectors (x ends)' },
  { v: 'count', label: 'Count (1 per cable)' },
];

export default function Settings() {
  const { project, stages, progress, local, setProject, setLocal, upsert, remove, replaceAll, reset, setCollection } = useStore();
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
  const b = project.budget;

  return (
    <>
      <div className="page-head"><h1>Settings</h1></div>
      {msg && <div className="notice">{msg}</div>}

      <div className="card">
        <h2>You (this device)</h2>
        <Field label="Your name - recorded on work you log, tests and ITP sign-offs"><input value={local.me} onChange={(e) => setLocal({ me: e.target.value })} placeholder="e.g. Site supervisor name" /></Field>
      </div>

      <div className="card">
        <h2>Project</h2>
        <div className="grid g3">
          <Field label="Project name"><input value={project.name} onChange={(e) => setProject({ name: e.target.value })} /></Field>
          <Field label="Client"><input value={project.client} onChange={(e) => setProject({ client: e.target.value })} /></Field>
          <Field label="Site"><input value={project.site} onChange={(e) => setProject({ site: e.target.value })} /></Field>
          <Field label="Contractor"><input value={project.contractor ?? ''} onChange={(e) => setProject({ contractor: e.target.value || undefined })} /></Field>
          <Field label="Contract no."><input value={project.contractNo ?? ''} onChange={(e) => setProject({ contractNo: e.target.value || undefined })} /></Field>
          <Field label="Start date"><input type="date" value={project.startDate} onChange={(e) => setProject({ startDate: e.target.value })} /></Field>
          <Field label="Default shift hours"><Num value={project.defaultShiftHours} step={0.5} onChange={(v) => setProject({ defaultShiftHours: v ?? 0 })} /></Field>
          <Field label="Default slack per cable end (m)"><Num value={project.defaultSlackM} step={0.5} onChange={(v) => setProject({ defaultSlackM: v ?? 0 })} /></Field>
          <Field label="ITP hold points when logging work">
            <select value={project.holdPointMode} onChange={(e) => setProject({ holdPointMode: e.target.value as 'warn' | 'block' | 'off' })}>
              <option value="warn">Warn (confirm to continue)</option><option value="block">Block until released</option><option value="off">Off</option>
            </select>
          </Field>
        </div>
      </div>

      <div className="card">
        <h2>Fibre loss budget allowances</h2>
        <p className="small muted" style={{ marginTop: 0 }}>Defaults are the TIA-568.3 maximum values as quoted by the Fiber Optic Association. Change them to your project's acceptance limits.</p>
        <div className="grid g3">
          <Field label="Connector (mated pair) dB"><Num value={b.connectorDb} step={0.05} onChange={(v) => setProject({ budget: { ...b, connectorDb: v ?? 0 } })} /></Field>
          <Field label="Splice dB"><Num value={b.spliceDb} step={0.05} onChange={(v) => setProject({ budget: { ...b, spliceDb: v ?? 0 } })} /></Field>
          <Field label="SM inside plant dB/km"><Num value={b.smIspDbKm} step={0.1} onChange={(v) => setProject({ budget: { ...b, smIspDbKm: v ?? 0 } })} /></Field>
          <Field label="SM outside plant dB/km"><Num value={b.smOspDbKm} step={0.1} onChange={(v) => setProject({ budget: { ...b, smOspDbKm: v ?? 0 } })} /></Field>
          <Field label="MM @850 nm dB/km"><Num value={b.mm850DbKm} step={0.1} onChange={(v) => setProject({ budget: { ...b, mm850DbKm: v ?? 0 } })} /></Field>
          <Field label="MM @1300 nm dB/km"><Num value={b.mm1300DbKm} step={0.1} onChange={(v) => setProject({ budget: { ...b, mm1300DbKm: v ?? 0 } })} /></Field>
        </div>
      </div>

      <div className="card">
        <h2>Work stages</h2>
        <p className="small muted" style={{ marginTop: 0 }}>The activities you track. Rename, re-colour or add stages to fit any job. Which stages apply to each cable type is set in the Library.</p>
        <div className="row" style={{ marginBottom: 10 }}>
          <span className="small">Apply a job template:</span>
          {JOB_TEMPLATES.map((t) => (
            <button key={t.id} className="btn sm" title={t.description} onClick={() => {
              if (progress.length && !confirm('Replace stages? Logged progress on removed stages will no longer show.')) return;
              setCollection('stages', t.stages.map((s) => ({ ...s })));
            }}>{t.name}</button>
          ))}
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Colour</th><th>Name</th><th>Measured in</th><th>ID</th><th /></tr></thead>
            <tbody>
              {stages.map((s, i) => (
                <tr key={s.id}>
                  <td><input type="color" value={s.color} onChange={(e) => upsert('stages', { ...s, color: e.target.value })} style={{ padding: 0, width: 34, height: 28 }} /></td>
                  <td><input value={s.name} onChange={(e) => upsert('stages', { ...s, name: e.target.value })} /></td>
                  <td><select value={s.measure} onChange={(e) => upsert('stages', { ...s, measure: e.target.value as StageMeasure })}>{MEASURES.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}</select></td>
                  <td className="small muted">{s.id}</td>
                  <td className="row" style={{ flexWrap: 'nowrap' }}>
                    <button className="btn sm" disabled={i === 0} onClick={() => { const arr = [...stages]; [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; setCollection('stages', arr); }}>↑</button>
                    <button className="btn sm danger" onClick={() => {
                      const n = progress.filter((p) => p.stageId === s.id).length;
                      if (confirmDelete(`stage "${s.name}"${n ? ` (${n} progress entries will be orphaned)` : ''}`)) remove('stages', s.id);
                    }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="btn" style={{ marginTop: 10 }} onClick={() => upsert('stages', { id: uid().slice(0, 8), name: 'New stage', measure: 'count', color: '#6250d6' })}>+ Add stage</button>
      </div>

      <CloudCard />

      <div className="card">
        <h2>Data &amp; backup</h2>
        <div className="notice warn">
          Data is saved on this device (IndexedDB) and works offline. {project.cloudId ? 'It also syncs to the cloud project.' : 'Connect to the cloud above to share it, or download a backup at the end of every shift.'} Photos are included in cloud sync but not in the JSON backup.
        </div>
        <div className="row">
          <button className="btn primary" onClick={backup}>Download backup (.json)</button>
          <label className="btn">Restore backup<input type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} /></label>
          <div className="spacer" />
          <button className="btn danger" onClick={() => window.confirm('Erase ALL data on this device? Download a backup first.') && reset()}>Erase all data on this device</button>
        </div>
      </div>
    </>
  );
}

const ROLE_LABEL: Record<MemberRole, string> = { admin: 'Admin', supervisor: 'Supervisor', crew_lead: 'Crew lead', viewer: 'Viewer (read only)' };

function CloudCard() {
  const { project } = useStore();
  const [session, setSession] = useState<string | null>(null);
  const [sync, setSync] = useState<cloud.SyncState>({ status: 'off', pending: 0 });
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string; role: MemberRole }[] | null>(null);
  const [members, setMembers] = useState<{ members: { user_id: string; role: string; email?: string }[]; invites: { email: string; role: string }[] } | null>(null);
  const [invEmail, setInvEmail] = useState('');
  const [invRole, setInvRole] = useState<MemberRole>('crew_lead');
  const [role, setRole] = useState<MemberRole | null>(null);

  useEffect(() => cloud.onSync(setSync), []);
  useEffect(() => {
    cloud.getSession().then((s) => setSession(s?.user.email ?? null)).catch(() => {});
    const { data } = cloud.sb().auth.onAuthStateChange((_e, s) => setSession(s?.user.email ?? null));
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session) return;
    cloud.listCloudProjects().then(setProjects).catch((e) => setErr(cloud.friendlyError(e)));
    if (project.cloudId) {
      cloud.myRole(project.cloudId).then(setRole);
      cloud.listMembers(project.cloudId).then(setMembers).catch(() => {});
    }
  }, [session, project.cloudId]);

  const run = async (f: () => Promise<unknown>) => {
    setErr('');
    setBusy(true);
    try { await f(); } catch (e) { setErr(cloud.friendlyError(e)); } finally { setBusy(false); }
  };

  return (
    <div className="card">
      <h2>Cloud &amp; team</h2>
      <p className="small muted" style={{ marginTop: 0 }}>Sign in to share the project live with your team (crew leads log from their own phones). Without cloud, everything still works on this device.</p>
      {err && <div className="notice warn">{err}</div>}
      {!session ? (
        <div className="grid g3">
          <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></Field>
          <Field label="Password"><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" /></Field>
          <div className="row" style={{ alignSelf: 'end' }}>
            <button className="btn primary" disabled={busy || !email || !pw} onClick={() => run(() => cloud.signIn(email, pw))}>Sign in</button>
            <button className="btn" disabled={busy || !email || pw.length < 6} onClick={() => run(async () => { const ok = await cloud.signUp(email, pw); if (!ok) setErr('Account created. Check your email to confirm it, then sign in.'); })}>Create account</button>
          </div>
        </div>
      ) : (
        <>
          <div className="row" style={{ marginBottom: 10 }}>
            <span>Signed in as <b>{session}</b>{role ? ` · ${ROLE_LABEL[role]}` : ''}</span>
            <div className="spacer" />
            <button className="btn sm" onClick={() => run(cloud.signOut)}>Sign out</button>
          </div>
          {project.cloudId ? (
            <>
              <div className="row" style={{ marginBottom: 10 }}>
                <span className={'pill ' + (sync.status === 'error' ? 'bad' : sync.status === 'syncing' ? 'warn' : sync.status === 'idle' ? 'ok' : '')}>{sync.status}</span>
                <span className="small">{sync.message ?? (sync.lastSync ? `Last synced ${new Date(sync.lastSync).toLocaleTimeString()}` : '')} · {sync.pending} change(s) waiting</span>
                <div className="spacer" />
                <button className="btn sm" onClick={() => { cloud.startSync(); }}>Sync now</button>
                <button className="btn sm danger" onClick={() => confirm('Disconnect this device from the cloud project? Local data is kept.') && cloud.disconnect()}>Disconnect</button>
              </div>
              {members && (
                <>
                  <h3>Team</h3>
                  <table>
                    <tbody>
                      {members.members.map((m) => (
                        <tr key={m.user_id}><td>{m.email ?? m.user_id}</td><td>
                          {role === 'admin' ? (
                            <select value={m.role} onChange={(e) => run(async () => { await cloud.setMemberRole(project.cloudId!, m.user_id, e.target.value as MemberRole); setMembers(await cloud.listMembers(project.cloudId!)); })}>
                              {Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                            </select>
                          ) : ROLE_LABEL[m.role as MemberRole]}
                        </td></tr>
                      ))}
                      {members.invites.map((i) => <tr key={i.email}><td className="muted">{i.email} (invited)</td><td className="muted">{ROLE_LABEL[i.role as MemberRole]}</td></tr>)}
                    </tbody>
                  </table>
                  {role === 'admin' && (
                    <div className="row" style={{ marginTop: 8 }}>
                      <input type="email" placeholder="Invite by email" value={invEmail} onChange={(e) => setInvEmail(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
                      <select value={invRole} onChange={(e) => setInvRole(e.target.value as MemberRole)}>{Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                      <button className="btn" disabled={!invEmail} onClick={() => run(async () => { await cloud.invite(project.cloudId!, invEmail, invRole); setInvEmail(''); setMembers(await cloud.listMembers(project.cloudId!)); })}>Invite</button>
                    </div>
                  )}
                  <p className="small muted">Invited people create an account with that email, sign in, and the project appears for them to join.</p>
                </>
              )}
            </>
          ) : (
            <div className="grid g2">
              <div>
                <h3>Put this project in the cloud</h3>
                <p className="small muted">Uploads this device's data and makes you the project admin.</p>
                <button className="btn primary" disabled={busy} onClick={() => run(async () => { await cloud.createCloudProject(project.name); cloud.startSync(); })}>Create cloud project "{project.name}"</button>
              </div>
              <div>
                <h3>Join an existing cloud project</h3>
                {projects === null ? <p className="small muted">Loading…</p> : projects.length === 0 ? <p className="small muted">No projects shared with you yet.</p> : projects.map((p) => (
                  <div key={p.id} className="row" style={{ marginBottom: 6 }}>
                    <span style={{ flex: 1 }}>{p.name} <span className="muted small">({ROLE_LABEL[p.role]})</span></span>
                    <button className="btn sm" disabled={busy} onClick={() => confirm('Joining replaces the data on this device with the cloud copy. Continue?') && run(() => cloud.joinCloudProject(p.id))}>Join</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      <details style={{ marginTop: 12 }}>
        <summary className="small muted">Cloud server settings</summary>
        <CloudConfig />
      </details>
    </div>
  );
}

function CloudConfig() {
  const cfg = cloud.cloudConfig();
  const [url, setUrl] = useState(cfg.url);
  const [key, setKey] = useState(cfg.key);
  return (
    <div className="grid g2" style={{ marginTop: 8 }}>
      <Field label="Supabase URL"><input value={url} onChange={(e) => setUrl(e.target.value)} /></Field>
      <Field label="Publishable (anon) key"><input value={key} onChange={(e) => setKey(e.target.value)} /></Field>
      <div className="row">
        <button className="btn sm" onClick={() => { cloud.setCloudConfig({ url, key }); location.reload(); }}>Save &amp; reload</button>
        <button className="btn sm" onClick={() => { cloud.setCloudConfig(null); location.reload(); }}>Reset to default</button>
      </div>
    </div>
  );
}
