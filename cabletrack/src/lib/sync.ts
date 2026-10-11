import { createClient, type RealtimeChannel, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { useStore } from '../store';
import { getLocalBlob, setRemoteFetch } from './files';
import { COLLECTIONS, type Attachment, type CollectionKey, type ID, type MemberRole } from '../types';

/*
 * Cloud sync: every record is a row in ct_records (project_id, collection, id, data).
 * Local-first: edits go to IndexedDB, are marked dirty, pushed when online, and other
 * devices pull by updated_at (server time) plus realtime notifications.
 * Conflicts: last write wins per record; unpushed local edits are never overwritten.
 */

// Publishable (anon) key: safe in the browser; access is enforced by row-level security.
const DEFAULT_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://guudeunabgxjwtxqvopt.supabase.co';
const DEFAULT_KEY = import.meta.env.VITE_SUPABASE_KEY ?? 'sb_publishable_5lI9XnMHvM9dD4z89rO2Cw_dAFfaCYi';
const CFG_KEY = 'ct-cloud-config';
const BUCKET = 'ct-attachments';

export function cloudConfig(): { url: string; key: string } {
  try {
    const v = JSON.parse(localStorage.getItem(CFG_KEY) ?? 'null');
    if (v?.url && v?.key) return v;
  } catch {
    /* ignore */
  }
  return { url: DEFAULT_URL, key: DEFAULT_KEY };
}
export function setCloudConfig(c: { url: string; key: string } | null) {
  try {
    if (c) localStorage.setItem(CFG_KEY, JSON.stringify(c));
    else localStorage.removeItem(CFG_KEY);
  } catch {
    /* ignore */
  }
  client = null;
}

let client: SupabaseClient | null = null;
export function sb(): SupabaseClient {
  if (!client) {
    const { url, key } = cloudConfig();
    client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
  }
  return client;
}

export type SyncState = { status: 'off' | 'idle' | 'syncing' | 'error' | 'offline'; message?: string; lastSync?: number; pending: number };
type Listener = (s: SyncState) => void;
let state: SyncState = { status: 'off', pending: 0 };
const listeners = new Set<Listener>();
const emit = (p: Partial<SyncState>) => {
  state = { ...state, ...p, pending: Object.keys(useStore.getState().dirty).length };
  listeners.forEach((l) => l(state));
};
export const onSync = (l: Listener) => {
  listeners.add(l);
  l(state);
  return () => {
    listeners.delete(l);
  };
};

export function friendlyError(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e);
  if (/relation .*ct_|does not exist|schema cache/i.test(m)) return 'Cloud tables are not set up yet. Run supabase/001_init.sql in the Supabase SQL editor.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'No connection. Changes are saved on this device and will sync when back online.';
  return m;
}

export async function getSession(): Promise<Session | null> {
  const { data } = await sb().auth.getSession();
  return data.session;
}

export async function signIn(email: string, password: string) {
  const { error } = await sb().auth.signInWithPassword({ email, password });
  if (error) throw error;
  await sb().rpc('ct_accept_invites').then(() => {}, () => {});
}
export async function signUp(email: string, password: string) {
  const { data, error } = await sb().auth.signUp({ email, password });
  if (error) throw error;
  return !!data.session; // false => email confirmation required
}
export async function signOut() {
  stopSync();
  await sb().auth.signOut();
}

export async function listCloudProjects(): Promise<{ id: string; name: string; role: MemberRole }[]> {
  const { data, error } = await sb().from('ct_members').select('role, ct_projects(id, name)');
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ id: r.ct_projects.id, name: r.ct_projects.name, role: r.role }));
}

/** Create a cloud project from this device's data and push everything. */
export async function createCloudProject(name: string) {
  const { data, error } = await sb().from('ct_projects').insert({ name }).select('id').single();
  if (error) throw error;
  const s = useStore.getState();
  s.setProject({ cloudId: data.id });
  // mark everything dirty so the first push uploads all local data
  const dirty: Record<string, object> = { 'project|project': {} };
  for (const c of COLLECTIONS) for (const r of s[c] as { id: ID }[]) dirty[c + '|' + r.id] = {};
  useStore.setState({ dirty, local: { ...s.local, lastPull: undefined } });
  await syncNow();
  return data.id as string;
}

/** Join an existing cloud project: local data is replaced by the cloud copy. */
export async function joinCloudProject(id: string) {
  const s = useStore.getState();
  s.reset();
  useStore.setState({ dirty: {}, local: { ...useStore.getState().local, lastPull: undefined } });
  useStore.getState().setProject({ cloudId: id });
  useStore.setState({ dirty: {} });
  await pull(true);
  startSync();
}

export async function myRole(projectId: string): Promise<MemberRole | null> {
  const uidv = (await getSession())?.user.id;
  if (!uidv) return null;
  const { data } = await sb().from('ct_members').select('role').eq('project_id', projectId).eq('user_id', uidv).maybeSingle();
  return (data?.role as MemberRole) ?? null;
}

export async function listMembers(projectId: string) {
  const [m, i] = await Promise.all([
    sb().from('ct_members').select('user_id, role, email, display_name').eq('project_id', projectId),
    sb().from('ct_invites').select('email, role, created_at').eq('project_id', projectId),
  ]);
  if (m.error) throw m.error;
  return { members: m.data ?? [], invites: i.data ?? [] };
}
export async function invite(projectId: string, email: string, role: MemberRole) {
  const { error } = await sb().from('ct_invites').upsert({ project_id: projectId, email: email.trim().toLowerCase(), role });
  if (error) throw error;
}
export async function setMemberRole(projectId: string, userId: string, role: MemberRole) {
  const { error } = await sb().from('ct_members').update({ role }).eq('project_id', projectId).eq('user_id', userId);
  if (error) throw error;
}

const cloudId = () => useStore.getState().project.cloudId;

async function push() {
  const pid = cloudId();
  if (!pid) return;
  const s = useStore.getState();
  const keys = Object.keys(s.dirty);
  if (!keys.length) return;
  const rows = keys.map((k) => {
    const [collection, id] = k.split('|');
    if (collection === 'project') {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { cloudId: _c, ...project } = s.project;
      return { project_id: pid, collection, id, data: project, deleted: false };
    }
    const item = (s[collection as CollectionKey] as { id: ID }[] | undefined)?.find((x) => x.id === id);
    return item && !s.dirty[k].deleted
      ? { project_id: pid, collection, id, data: item, deleted: false }
      : { project_id: pid, collection, id, data: {}, deleted: true };
  });
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb().from('ct_records').upsert(rows.slice(i, i + 500), { onConflict: 'project_id,collection,id' });
    if (error) throw error;
  }
  // Clear only the keys we pushed (edits made during the push stay dirty).
  useStore.setState((cur) => {
    const d = { ...cur.dirty };
    for (const k of keys) if (JSON.stringify(cur.dirty[k]) === JSON.stringify(s.dirty[k])) delete d[k];
    return { dirty: d };
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyRows(rows: any[]) {
  if (!rows.length) return;
  useStore.setState((cur) => {
    const next: Record<string, unknown> = {};
    const lists = new Map<string, Map<ID, unknown>>();
    let project = cur.project;
    for (const r of rows) {
      const k = r.collection + '|' + r.id;
      if (cur.dirty[k]) continue; // local edit pending: keep it
      if (r.collection === 'project') {
        if (!r.deleted) project = { ...cur.project, ...r.data, cloudId: cur.project.cloudId };
        continue;
      }
      if (!(COLLECTIONS as readonly string[]).includes(r.collection)) continue;
      let m = lists.get(r.collection);
      if (!m) {
        m = new Map((cur[r.collection as CollectionKey] as { id: ID }[]).map((x) => [x.id, x]));
        lists.set(r.collection, m);
      }
      if (r.deleted) m.delete(r.id);
      else m.set(r.id, r.data);
    }
    for (const [c, m] of lists) next[c] = [...m.values()];
    return { ...next, project } as never;
  });
}

async function pull(full = false) {
  const pid = cloudId();
  if (!pid) return;
  let since = full ? undefined : useStore.getState().local.lastPull;
  for (let page = 0; page < 200; page++) {
    let q = sb().from('ct_records').select('collection, id, data, deleted, updated_at').eq('project_id', pid).order('updated_at', { ascending: true }).limit(1000);
    if (since) q = q.gt('updated_at', since);
    const { data, error } = await q;
    if (error) throw error;
    if (!data?.length) break;
    applyRows(data);
    since = data[data.length - 1].updated_at;
    useStore.getState().setLocal({ lastPull: since });
    if (data.length < 1000) break;
  }
}

async function uploadFiles() {
  const pid = cloudId();
  if (!pid) return;
  const pending = useStore.getState().attachments.filter((a) => !a.uploaded);
  for (const a of pending.slice(0, 20)) {
    const blob = await getLocalBlob(a.id);
    if (!blob) continue; // created on another device
    const { error } = await sb().storage.from(BUCKET).upload(`${pid}/${a.id}`, blob, { contentType: a.mime, upsert: true });
    if (error && !/exists/i.test(error.message)) throw error;
    useStore.getState().upsert('attachments', { ...a, uploaded: true });
  }
}

setRemoteFetch(async (a: Attachment) => {
  const pid = cloudId();
  if (!pid) return null;
  const { data, error } = await sb().storage.from(BUCKET).download(`${pid}/${a.id}`);
  return error ? null : data;
});

let running: Promise<void> | null = null;
export async function syncNow() {
  if (!cloudId()) return emit({ status: 'off' });
  if (running) return running;
  running = (async () => {
    try {
      if (!navigator.onLine) return emit({ status: 'offline', message: 'Offline: changes saved on this device.' });
      if (!(await getSession())) return emit({ status: 'error', message: 'Signed out. Sign in under Settings > Cloud to sync.' });
      emit({ status: 'syncing', message: undefined });
      await uploadFiles();
      await push();
      await pull();
      emit({ status: 'idle', lastSync: Date.now(), message: undefined });
    } catch (e) {
      emit({ status: 'error', message: friendlyError(e) });
    } finally {
      running = null;
    }
  })();
  return running;
}

let timer: ReturnType<typeof setInterval> | null = null;
let channel: RealtimeChannel | null = null;
let unsubStore: (() => void) | null = null;
let debounce: ReturnType<typeof setTimeout> | null = null;

export function startSync() {
  const pid = cloudId();
  if (!pid) return;
  stopSync();
  syncNow();
  timer = setInterval(syncNow, 30_000);
  window.addEventListener('online', syncNow);
  document.addEventListener('visibilitychange', onVisible);
  unsubStore = useStore.subscribe((s, prev) => {
    if (s.dirty !== prev.dirty && Object.keys(s.dirty).length) {
      emit({});
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(syncNow, 3000);
    }
  });
  channel = sb()
    .channel('ct-' + pid)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ct_records', filter: `project_id=eq.${pid}` }, (payload) => {
      const r = payload.new as { collection: string; id: string; data: unknown; deleted: boolean; updated_at: string };
      if (r?.collection) applyRows([r]);
    })
    .subscribe();
}

const onVisible = () => document.visibilityState === 'visible' && syncNow();

export function stopSync() {
  if (timer) clearInterval(timer);
  timer = null;
  window.removeEventListener('online', syncNow);
  document.removeEventListener('visibilitychange', onVisible);
  unsubStore?.();
  unsubStore = null;
  if (channel) sb().removeChannel(channel);
  channel = null;
  emit({ status: cloudId() ? 'idle' : 'off' });
}

/** Disconnect this device from the cloud project (local data kept). */
export function disconnect() {
  stopSync();
  useStore.getState().setProject({ cloudId: undefined });
  useStore.setState({ dirty: {} });
  emit({ status: 'off' });
}
