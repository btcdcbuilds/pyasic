import { useEffect, useRef, useState } from 'react';
import { useStore } from './store';
import { addFile, blobUrl, fmtSize, removeFile } from './lib/files';
import type { Attachment, EntityKind, Location, LocationKind } from './types';
import { confirmDelete } from './ui';

export const LOCATION_KIND_LABEL: Record<LocationKind, string> = {
  site: 'Site',
  building: 'Building',
  floor: 'Floor / level',
  room: 'Room / hall',
  rack: 'Rack',
  cabinet: 'Cabinet',
  frame: 'Frame / ODF',
  'splice-enclosure': 'Splice enclosure / closure',
  'wall-outlet': 'Wall outlet',
  'consolidation-point': 'Consolidation point',
  pit: 'Pit',
  manhole: 'Manhole',
  pole: 'Pole',
  'entry-point': 'Building entry',
  junction: 'Junction / pull box',
  other: 'Other',
};

/** Full path name, e.g. "Bldg A / L2 / MMR / R01". */
export function locationPath(locs: Location[], id?: string): string {
  if (!id) return '';
  const byId = new Map(locs.map((l) => [l.id, l]));
  const parts: string[] = [];
  let cur = byId.get(id);
  let guard = 0;
  while (cur && guard++ < 10) {
    parts.unshift(cur.code || cur.name);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return parts.join(' / ');
}

export function LocationSelect({ value, onChange, kinds, placeholder = '— select —', exclude }: { value?: string; onChange: (id: string | undefined) => void; kinds?: LocationKind[]; placeholder?: string; exclude?: string }) {
  const locations = useStore((s) => s.locations);
  const opts = locations
    .filter((l) => (!kinds || kinds.includes(l.kind)) && l.id !== exclude)
    .map((l) => ({ id: l.id, label: locationPath(locations, l.id) + ` (${LOCATION_KIND_LABEL[l.kind]})` }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
      <option value="">{placeholder}</option>
      {opts.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Thumb({ a }: { a: Attachment }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    let live = true;
    if (a.mime.startsWith('image/')) blobUrl(a).then((x) => { u = x; if (live) setUrl(x); });
    return () => { live = false; if (u) URL.revokeObjectURL(u); };
  }, [a]);
  const open = async () => {
    const u2 = await blobUrl(a);
    if (u2) window.open(u2, '_blank');
    else alert('File not available on this device yet (not synced).');
  };
  return (
    <div className="att" title={a.caption || a.name}>
      <button className="att-img" onClick={open}>
        {url ? <img src={url} alt={a.caption || a.name} /> : <span>{a.name.split('.').pop()?.toUpperCase()}</span>}
      </button>
      <div className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.caption || a.name}</div>
      <div className="small muted">{new Date(a.createdAt).toLocaleDateString()} · {fmtSize(a.size)}</div>
      <button className="btn sm danger" onClick={() => confirmDelete(a.name) && removeFile(a)}>Delete</button>
    </div>
  );
}

/** Photos and files attached to any record. On phones "Take photo" opens the camera. */
export function Attachments({ entity, entityId, title = 'Photos & files' }: { entity: EntityKind; entityId: string; title?: string }) {
  const all = useStore((s) => s.attachments);
  const list = all.filter((a) => a.entity === entity && a.entityId === entityId).sort((a, b) => b.createdAt - a.createdAt);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    setBusy(true);
    for (const f of Array.from(files)) await addFile(f, entity, entityId, caption || undefined);
    setCaption('');
    setBusy(false);
  };
  return (
    <div>
      <h3>{title} ({list.length})</h3>
      <div className="row" style={{ marginBottom: 8 }}>
        <input placeholder="Caption (optional)" value={caption} onChange={(e) => setCaption(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
        <label className="btn sm">
          📷 Take photo
          <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFiles(e.target.files)} />
        </label>
        <label className="btn sm">
          📎 Add files
          <input type="file" multiple hidden onChange={(e) => onFiles(e.target.files)} />
        </label>
        {busy && <span className="small muted">saving…</span>}
      </div>
      {list.length > 0 && <div className="att-grid">{list.map((a) => <Thumb key={a.id} a={a} />)}</div>}
    </div>
  );
}

/** Finger/mouse signature capture; returns a PNG data URL. */
export function SignaturePad({ onDone, onCancel }: { onDone: (dataUrl: string) => void; onCancel: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);
  useEffect(() => {
    const c = ref.current!;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.clientWidth * ratio;
    c.height = c.clientHeight * ratio;
    const g = c.getContext('2d')!;
    g.scale(ratio, ratio);
    g.lineWidth = 2.2;
    g.lineCap = 'round';
    g.strokeStyle = '#0f172a';
  }, []);
  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  return (
    <div>
      <canvas
        ref={ref}
        className="sig-pad"
        onPointerDown={(e) => {
          drawing.current = true;
          ref.current!.setPointerCapture(e.pointerId);
          const g = ref.current!.getContext('2d')!;
          const p = pos(e);
          g.beginPath();
          g.moveTo(p.x, p.y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const g = ref.current!.getContext('2d')!;
          const p = pos(e);
          g.lineTo(p.x, p.y);
          g.stroke();
          setEmpty(false);
        }}
        onPointerUp={() => (drawing.current = false)}
      />
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn sm" onClick={() => { const c = ref.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setEmpty(true); }}>Clear</button>
        <div className="spacer" />
        <button className="btn sm" onClick={onCancel}>Cancel</button>
        <button className="btn sm primary" disabled={empty} onClick={() => onDone(ref.current!.toDataURL('image/png'))}>Use signature</button>
      </div>
    </div>
  );
}
