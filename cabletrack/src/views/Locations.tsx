import { useMemo, useState } from 'react';
import { uid, useStore } from '../store';
import { Empty, Field, Modal, Num, confirmDelete } from '../ui';
import { Attachments, LOCATION_KIND_LABEL, LocationSelect, locationPath } from '../components';
import type { Location, LocationKind } from '../types';
import { AREA_KINDS, RACK_KINDS } from '../types';

const KINDS = Object.keys(LOCATION_KIND_LABEL) as LocationKind[];

export default function Locations() {
  const { locations, cables, rackModels, upsert, upsertMany, remove, drops } = useStore();
  const [edit, setEdit] = useState<Location | null>(null);
  const [bulk, setBulk] = useState(false);
  const [q, setQ] = useState('');
  const [kindF, setKindF] = useState('');

  const children = useMemo(() => {
    const m = new Map<string, Location[]>();
    for (const l of locations) {
      const k = l.parentId && locations.some((x) => x.id === l.parentId) ? l.parentId : '';
      (m.get(k) ?? m.set(k, []).get(k)!).push(l);
    }
    for (const v of m.values()) v.sort((a, b) => (a.code || a.name).localeCompare(b.code || b.name, undefined, { numeric: true }));
    return m;
  }, [locations]);

  const cableCount = (id: string) => cables.filter((c) => c.fromRackId === id || c.toRackId === id).length;
  const filtering = !!q || !!kindF;
  const flat = locations
    .filter((l) => (!kindF || l.kind === kindF) && (!q || locationPath(locations, l.id).toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => locationPath(locations, a.id).localeCompare(locationPath(locations, b.id), undefined, { numeric: true }));

  const row = (l: Location, depth: number) => (
    <tr key={l.id}>
      <td style={{ paddingLeft: 8 + depth * 18 }}>
        {AREA_KINDS.includes(l.kind) ? '📁 ' : '• '}
        <b>{l.code || l.name}</b>
        {l.code && <span className="muted"> {l.name}</span>}
      </td>
      <td className="small">{LOCATION_KIND_LABEL[l.kind]}</td>
      <td className="small">{RACK_KINDS.includes(l.kind) ? `${l.heightU ?? '?'}U ${l.widthMm ?? '?'}x${l.depthMm ?? '?'}` : l.plan ? 'has floor plan' : ''}</td>
      <td className="num">{l.slackM ?? ''}</td>
      <td className="num">{cableCount(l.id) || ''}</td>
      <td className="row" style={{ flexWrap: 'nowrap' }}>
        {AREA_KINDS.includes(l.kind) && (
          <button className="btn sm" onClick={() => setEdit({ id: uid(), name: '', kind: l.kind === 'site' ? 'building' : l.kind === 'building' ? 'floor' : l.kind === 'floor' ? 'room' : 'rack', parentId: l.id })}>+ child</button>
        )}
        <button className="btn sm" onClick={() => setEdit(l)}>Edit</button>
      </td>
    </tr>
  );
  const tree = (parent: string, depth: number): React.ReactNode[] =>
    (children.get(parent) ?? []).flatMap((l) => [row(l, depth), ...tree(l.id, depth + 1)]);

  return (
    <>
      <div className="page-head">
        <h1>Points &amp; areas</h1>
        <div className="row">
          <button className="btn primary" onClick={() => setEdit({ id: uid(), name: '', kind: 'building' })}>+ Location</button>
          <button className="btn" onClick={() => setBulk(true)}>+ Bulk add</button>
        </div>
      </div>
      <div className="notice">
        Points are where cables start and finish (racks, cabinets, frames, outlets, pits, building entries, closures). Areas (site, building, floor, room) group them and can hold a floor plan for the Floor layout. A cable runs from point A to point B through pathways.
      </div>
      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
          <select value={kindF} onChange={(e) => setKindF(e.target.value)}>
            <option value="">All kinds</option>
            {KINDS.map((k) => <option key={k} value={k}>{LOCATION_KIND_LABEL[k]}</option>)}
          </select>
        </div>
        {locations.length === 0 ? (
          <Empty>No locations yet. Start with a building or site, then add floors, rooms and endpoints.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name / code</th><th>Kind</th><th>Size</th><th className="num">Slack m</th><th className="num">Cables</th><th /></tr></thead>
              <tbody>{filtering ? flat.map((l) => row(l, 0)) : tree('', 0)}</tbody>
            </table>
          </div>
        )}
      </div>

      {edit && (
        <Modal title={locations.some((l) => l.id === edit.id) ? `Edit ${edit.name}` : 'New location'} onClose={() => setEdit(null)} wide>
          <LocationForm value={edit} onChange={setEdit} />
          {locations.some((l) => l.id === edit.id) && <Attachments entity="location" entityId={edit.id} />}
          <div className="row" style={{ marginTop: 16 }}>
            {locations.some((l) => l.id === edit.id) && (
              <button className="btn danger" disabled={cableCount(edit.id) > 0 || (children.get(edit.id)?.length ?? 0) > 0}
                title="Only empty locations with no cables can be deleted"
                onClick={() => {
                  if (!confirmDelete(edit.name)) return;
                  remove('locations', edit.id);
                  useStore.getState().removeMany('drops', drops.filter((d) => d.rackId === edit.id).map((d) => d.id));
                  setEdit(null);
                }}>Delete</button>
            )}
            <div className="spacer" />
            <button className="btn primary" disabled={!edit.name.trim()} onClick={() => {
              const m = rackModels.find((r) => r.id === edit.modelId);
              upsert('locations', RACK_KINDS.includes(edit.kind) && !edit.heightU ? { ...edit, heightU: m?.heightU ?? 42, widthMm: m?.widthMm ?? 600, depthMm: m?.depthMm ?? 1200, devices: edit.devices ?? [] } : edit);
              setEdit(null);
            }}>Save</button>
          </div>
        </Modal>
      )}
      {bulk && <BulkLocations onClose={() => setBulk(false)} onCreate={(ls) => upsertMany('locations', ls)} />}
    </>
  );
}

export function LocationForm({ value, onChange }: { value: Location; onChange: (l: Location) => void }) {
  const { rackModels } = useStore();
  const set = (p: Partial<Location>) => onChange({ ...value, ...p });
  const isRack = RACK_KINDS.includes(value.kind);
  return (
    <div className="grid g2">
      <Field label="Name"><input value={value.name} onChange={(e) => set({ name: e.target.value })} autoFocus /></Field>
      <Field label="Identifier / code (e.g. TIA-606: 1A, 1A.AD02)"><input value={value.code ?? ''} onChange={(e) => set({ code: e.target.value || undefined })} /></Field>
      <Field label="Kind">
        <select value={value.kind} onChange={(e) => set({ kind: e.target.value as LocationKind })}>
          {KINDS.map((k) => <option key={k} value={k}>{LOCATION_KIND_LABEL[k]}</option>)}
        </select>
      </Field>
      <Field label="Inside (parent)"><LocationSelect value={value.parentId} onChange={(id) => set({ parentId: id })} kinds={AREA_KINDS} placeholder="— top level —" exclude={value.id} /></Field>
      {!AREA_KINDS.includes(value.kind) && (
        <Field label="Drawn on floor plan of"><LocationSelect value={value.areaId} onChange={(id) => set({ areaId: id })} kinds={AREA_KINDS} placeholder="— not on a plan —" /></Field>
      )}
      <Field label="Slack / service loop for cables ending here (m)"><Num value={value.slackM} onChange={(v) => set({ slackM: v })} step={0.5} /></Field>
      {isRack && (
        <>
          <Field label="Rack model">
            <select value={value.modelId ?? ''} onChange={(e) => {
              const m = rackModels.find((r) => r.id === e.target.value);
              set({ modelId: m?.id, heightU: m?.heightU ?? value.heightU, widthMm: m?.widthMm ?? value.widthMm, depthMm: m?.depthMm ?? value.depthMm });
            }}>
              <option value="">Custom</option>
              {rackModels.map((m) => <option key={m.id} value={m.id}>{m.brand} {m.model}</option>)}
            </select>
          </Field>
          <Field label="Height (U)"><Num value={value.heightU} onChange={(v) => set({ heightU: v })} /></Field>
          <Field label="Width (mm)"><Num value={value.widthMm} onChange={(v) => set({ widthMm: v })} /></Field>
          <Field label="Depth (mm)"><Num value={value.depthMm} onChange={(v) => set({ depthMm: v })} /></Field>
        </>
      )}
      <Field label="Notes" style={{ gridColumn: '1 / -1' }}><textarea rows={2} value={value.notes ?? ''} onChange={(e) => set({ notes: e.target.value || undefined })} /></Field>
    </div>
  );
}

function BulkLocations({ onClose, onCreate }: { onClose: () => void; onCreate: (l: Location[]) => void }) {
  const [prefix, setPrefix] = useState('WO-');
  const [start, setStart] = useState<number | undefined>(1);
  const [count, setCount] = useState<number | undefined>(24);
  const [pad, setPad] = useState<number | undefined>(3);
  const [kind, setKind] = useState<LocationKind>('wall-outlet');
  const [parentId, setParentId] = useState<string>();
  const [slackM, setSlackM] = useState<number>();
  const names = Array.from({ length: Math.min(count ?? 0, 2000) }, (_, i) => prefix + String((start ?? 1) + i).padStart(pad ?? 0, '0'));
  return (
    <Modal title="Bulk add locations" onClose={onClose}>
      <div className="grid g2">
        <Field label="Name prefix"><input value={prefix} onChange={(e) => setPrefix(e.target.value)} /></Field>
        <Field label="Kind"><select value={kind} onChange={(e) => setKind(e.target.value as LocationKind)}>{KINDS.map((k) => <option key={k} value={k}>{LOCATION_KIND_LABEL[k]}</option>)}</select></Field>
        <Field label="Start number"><Num value={start} onChange={setStart} /></Field>
        <Field label="How many"><Num value={count} onChange={setCount} min={1} /></Field>
        <Field label="Zero-pad digits"><Num value={pad} onChange={setPad} min={0} /></Field>
        <Field label="Slack (m)"><Num value={slackM} onChange={setSlackM} /></Field>
        <Field label="Inside" style={{ gridColumn: '1 / -1' }}><LocationSelect value={parentId} onChange={setParentId} kinds={AREA_KINDS} placeholder="— top level —" /></Field>
      </div>
      <p className="small muted">Preview: {names.slice(0, 3).join(', ')}{names.length > 3 ? ` … ${names[names.length - 1]}` : ''} ({names.length})</p>
      <div className="row"><div className="spacer" /><button className="btn primary" disabled={!names.length} onClick={() => {
        onCreate(names.map((name) => ({ id: uid(), name, kind, parentId, slackM, ...(RACK_KINDS.includes(kind) ? { heightU: 42, widthMm: 600, depthMm: 1200, devices: [] } : {}) })));
        onClose();
      }}>Add {names.length}</button></div>
    </Modal>
  );
}
