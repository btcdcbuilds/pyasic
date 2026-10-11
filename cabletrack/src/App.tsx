import { useEffect, useState } from 'react';
import { useStore } from './store';
import Dashboard from './views/Dashboard';
import LogWork from './views/LogWork';
import Hours from './views/Hours';
import Cables from './views/Cables';
import Layout from './views/Layout';
import Racks from './views/Racks';
import Pathways from './views/Pathways';
import Library from './views/Library';
import Crews from './views/Crews';
import Reports from './views/Reports';
import Settings from './views/Settings';

const PAGES = [
  { id: 'dashboard', label: 'Dashboard', ico: '📊', el: Dashboard },
  { id: 'log', label: 'Log work', ico: '✅', el: LogWork },
  { id: 'hours', label: 'Hours', ico: '⏱️', el: Hours },
  { id: 'cables', label: 'Cable schedule', ico: '🧵', el: Cables },
  { id: 'layout', label: 'Floor layout', ico: '🗺️', el: Layout },
  { id: 'racks', label: 'Rack elevations', ico: '🗄️', el: Racks },
  { id: 'pathways', label: 'Trays & baskets', ico: '🧺', el: Pathways },
  { id: 'library', label: 'Cable library', ico: '📚', el: Library },
  { id: 'crews', label: 'Crews & workers', ico: '👷', el: Crews },
  { id: 'reports', label: 'Reports', ico: '🖨️', el: Reports },
  { id: 'settings', label: 'Settings', ico: '⚙️', el: Settings },
] as const;

type PageId = (typeof PAGES)[number]['id'];

function readHash(): PageId {
  const h = location.hash.replace('#', '');
  return (PAGES.find((p) => p.id === h)?.id ?? 'dashboard') as PageId;
}

export default function App() {
  const [page, setPage] = useState<PageId>(readHash);
  const project = useStore((s) => s.project);
  useEffect(() => {
    const on = () => setPage(readHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (id: PageId) => {
    location.hash = id;
    setPage(id);
    window.scrollTo(0, 0);
  };
  const Current = PAGES.find((p) => p.id === page)!.el;
  return (
    <div className="app">
      <nav className="nav">
        <div className="brand">CableTrack</div>
        <div className="proj">{project.name}</div>
        {PAGES.map((p) => (
          <button key={p.id} className={p.id === page ? 'active' : ''} onClick={() => go(p.id)}>
            <span className="ico">{p.ico}</span>
            {p.label}
          </button>
        ))}
      </nav>
      <main className="main">
        <Current />
      </main>
      <nav className="mobile-nav">
        {PAGES.map((p) => (
          <button key={p.id} className={p.id === page ? 'active' : ''} onClick={() => go(p.id)}>
            <span className="ico">{p.ico}</span>
            {p.label.split(' ')[0]}
          </button>
        ))}
      </nav>
    </div>
  );
}
