import { useState } from 'react';
import { uid, useStore } from '../store';
import { Empty, confirmDelete } from '../ui';

const COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const ROLES = ['Supervisor', 'Leading hand', 'Technician', 'Splicer', 'Cabler', 'Apprentice', 'Labourer'];

export default function Crews() {
  const { crews, workers, upsert, remove } = useStore();
  const [crewName, setCrewName] = useState('');
  const [wName, setWName] = useState('');
  const [wRole, setWRole] = useState('Technician');
  const [wCrew, setWCrew] = useState('');

  const addCrew = () => {
    if (!crewName.trim()) return;
    upsert('crews', { id: uid(), name: crewName.trim(), color: COLORS[crews.length % COLORS.length] });
    setCrewName('');
  };
  const addWorker = () => {
    if (!wName.trim()) return;
    upsert('workers', { id: uid(), name: wName.trim(), role: wRole, crewId: wCrew || undefined, active: true });
    setWName('');
  };

  return (
    <>
      <div className="page-head">
        <h1>Crews &amp; workers</h1>
      </div>
      <div className="grid g2">
        <div className="card">
          <h2>Crews</h2>
          <div className="row" style={{ marginBottom: 12 }}>
            <input placeholder="Crew name e.g. Crew A - Pulling" value={crewName} onChange={(e) => setCrewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCrew()} style={{ flex: 1 }} />
            <button className="btn primary" onClick={addCrew}>
              Add crew
            </button>
          </div>
          {crews.length === 0 ? (
            <Empty>No crews yet. Add one for each team (e.g. pulling, splicing, termination).</Empty>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Colour</th>
                  <th>Name</th>
                  <th className="num">Members</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {crews.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <input type="color" value={c.color} onChange={(e) => upsert('crews', { ...c, color: e.target.value })} style={{ padding: 0, width: 34, height: 28 }} />
                    </td>
                    <td>
                      <input value={c.name} onChange={(e) => upsert('crews', { ...c, name: e.target.value })} style={{ width: '100%' }} />
                    </td>
                    <td className="num">{workers.filter((w) => w.crewId === c.id && w.active).length}</td>
                    <td>
                      <button className="btn sm danger" onClick={() => confirmDelete(`crew "${c.name}"`) && remove('crews', c.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h2>Add worker</h2>
          <div className="grid" style={{ gridTemplateColumns: '1fr' }}>
            <input placeholder="Full name" value={wName} onChange={(e) => setWName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addWorker()} />
            <div className="row">
              <select value={wRole} onChange={(e) => setWRole(e.target.value)} style={{ flex: 1 }}>
                {ROLES.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
              <select value={wCrew} onChange={(e) => setWCrew(e.target.value)} style={{ flex: 1 }}>
                <option value="">No crew</option>
                {crews.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn primary" onClick={addWorker}>
              Add worker
            </button>
          </div>
        </div>
      </div>
      <div className="card">
        <h2>Workers ({workers.filter((w) => w.active).length} active)</h2>
        {workers.length === 0 ? (
          <Empty>No workers yet.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Crew</th>
                  <th>Active</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...workers]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((w) => (
                    <tr key={w.id} style={{ opacity: w.active ? 1 : 0.5 }}>
                      <td>
                        <input value={w.name} onChange={(e) => upsert('workers', { ...w, name: e.target.value })} />
                      </td>
                      <td>
                        <select value={w.role} onChange={(e) => upsert('workers', { ...w, role: e.target.value })}>
                          {[...new Set([...ROLES, w.role])].map((r) => (
                            <option key={r}>{r}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select value={w.crewId ?? ''} onChange={(e) => upsert('workers', { ...w, crewId: e.target.value || undefined })}>
                          <option value="">No crew</option>
                          {crews.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input type="checkbox" checked={w.active} onChange={(e) => upsert('workers', { ...w, active: e.target.checked })} />
                      </td>
                      <td>
                        <button className="btn sm danger" onClick={() => confirmDelete(`worker "${w.name}"`) && remove('workers', w.id)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
