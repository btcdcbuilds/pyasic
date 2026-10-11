import { useEffect, useState } from 'react';
import { useStore } from './store';
import { onSync, startSync, type SyncState } from './lib/sync';
import Dashboard from './views/Dashboard';
import LogWork from './views/LogWork';
import Hours from './views/Hours';
import Diary from './views/Diary';
import Cables from './views/Cables';
import Locations from './views/Locations';
import Pathways from './views/Pathways';
import Layout from './views/Layout';
import Racks from './views/Racks';
import Itp from './views/Itp';
import Tests from './views/Tests';
import Issues from './views/Issues';
import Library from './views/Library';
import Crews from './views/Crews';
import Reports from './views/Reports';
import Settings from './views/Settings';

const PAGES = [
  { id: 'dashboard', label: 'Dashboard', ico: '📊', el: Dashboard, group: 'Track' },
  { id: 'log', label: 'Log work', ico: '✅', el: LogWork, group: 'Track' },
  { id: 'hours', label: 'Hours', ico: '⏱️', el: Hours, group: 'Track' },
  { id: 'diary', label: 'Site diary', ico: '📓', el: Diary, group: 'Track' },
  { id: 'cables', label: 'Cable schedule', ico: '🧵', el: Cables, group: 'Install' },
  { id: 'locations', label: 'Points & areas', ico: '📍', el: Locations, group: 'Install' },
  { id: 'pathways', label: 'Pathways', ico: '🧺', el: Pathways, group: 'Install' },
  { id: 'layout', label: 'Floor layout', ico: '🗺️', el: Layout, group: 'Install' },
  { id: 'racks', label: 'Rack elevations', ico: '🗄️', el: Racks, group: 'Install' },
  { id: 'itp', label: 'ITP sign-off', ico: '🖊️', el: Itp, group: 'Quality' },
  { id: 'tests', label: 'Test results', ico: '🔬', el: Tests, group: 'Quality' },
  { id: 'issues', label: 'Issues / punch', ico: '⚠️', el: Issues, group: 'Quality' },
  { id: 'reports', label: 'Reports & exports', ico: '🖨️', el: Reports, group: 'Quality' },
  { id: 'library', label: 'Library', ico: '📚', el: Library, group: 'Setup' },
  { id: 'crews', label: 'Crews & people', ico: '👷', el: Crews, group: 'Setup' },
  { id: 'settings', label: 'Settings', ico: '⚙️', el: Settings, group: 'Setup' },
] as const;

type PageId = (typeof PAGES)[number]['id'];
const MOBILE: PageId[] = ['dashboard', 'log', 'hours', 'cables', 'itp', 'tests', 'issues', 'diary', 'layout', 'reports', 'settings'];

function readHash(): PageId {
  const h = location.hash.replace('#', '');
  return (PAGES.find((p) => p.id === h)?.id ?? 'dashboard') as PageId;
}

export default function App() {
  const [page, setPage] = useState<PageId>(readHash);
  const project = useStore((s) => s.project);
  const hydrated = useStore((s) => s.local.hydrated);
  const [sync, setSync] = useState<SyncState>({ status: 'off', pending: 0 });
  useEffect(() => {
    const on = () => setPage(readHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  useEffect(() => onSync(setSync), []);
  useEffect(() => {
    if (hydrated && project.cloudId) startSync();
  }, [hydrated, project.cloudId]);

  const go = (id: PageId) => {
    location.hash = id;
    setPage(id);
    window.scrollTo(0, 0);
  };
  if (!hydrated) return <div style={{ padding: 40 }} className="muted">Loading…</div>;
  const Current = PAGES.find((p) => p.id === page)!.el;
  const groups = [...new Set(PAGES.map((p) => p.group))];
  const syncPill = project.cloudId ? (
    <span className={'sync-dot ' + sync.status} title={sync.message ?? sync.status}>
      {sync.status === 'syncing' ? 'syncing…' : sync.status === 'error' ? 'sync error' : sync.status === 'offline' ? 'offline' : sync.pending ? `${sync.pending} to sync` : 'synced'}
    </span>
  ) : null;
  return (
    <div className="app">
      <nav className="nav">
        <div className="brand">CableTrack</div>
        <div className="proj">{project.name} {syncPill}</div>
        {groups.map((g) => (
          <div key={g}>
            <div className="nav-group">{g}</div>
            {PAGES.filter((p) => p.group === g).map((p) => (
              <button key={p.id} className={p.id === page ? 'active' : ''} onClick={() => go(p.id)}>
                <span className="ico">{p.ico}</span>
                {p.label}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <main className="main">
        {project.cloudId && sync.status === 'error' && <div className="notice warn no-print">{sync.message}</div>}
        <Current />
      </main>
      <nav className="mobile-nav">
        {PAGES.filter((p) => MOBILE.includes(p.id)).map((p) => (
          <button key={p.id} className={p.id === page ? 'active' : ''} onClick={() => go(p.id)}>
            <span className="ico">{p.ico}</span>
            {p.label.split(' ')[0]}
          </button>
        ))}
        <button onClick={() => { const el = document.querySelector('.more-menu') as HTMLDialogElement | null; el?.showModal(); }}>
          <span className="ico">☰</span>More
        </button>
      </nav>
      <dialog className="more-menu" onClick={(e) => (e.target as HTMLElement).tagName === 'DIALOG' && (e.target as HTMLDialogElement).close()}>
        {PAGES.map((p) => (
          <button key={p.id} className={'btn' + (p.id === page ? ' active' : '')} onClick={(e) => { go(p.id); (e.currentTarget.closest('dialog') as HTMLDialogElement).close(); }}>
            {p.ico} {p.label}
          </button>
        ))}
      </dialog>
    </div>
  );
}
