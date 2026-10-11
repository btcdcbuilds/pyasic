import { useState } from 'react';
import { uid, useStore } from '../store';
import { Empty, Field, Modal, Num, confirmDelete } from '../ui';
import { fmt } from '../lib/calc';
import type { Rack, RackDevice } from '../types';

const U_MM = 44.45; // EIA-310 rack unit
const KIND_COLOR: Record<RackDevice['kind'], string> = {
  'fibre-panel': '#2a78d6',
  'splice-enclosure': '#1baf7a',
  'patch-panel': '#6250d6',
  'cable-manager': '#94a3b8',
  equipment: '#475569',
  blank: '#cbd5e1',
};
const KIND_LABEL: Record<RackDevice['kind'], string> = {
  'fibre-panel': 'Fibre panel / MPO cassette',
  'splice-enclosure': 'Splice enclosure',
  'patch-panel': 'Copper patch panel',
  'cable-manager': 'Cable manager',
  equipment: 'Equipment',
  blank: 'Blank',
};

export default function Racks() {
  const { racks, cables, cableTypes, drops, pathways, upsert } = useStore();
  const [rackId, setRackId] = useState(() => sessionStorage.getItem('rack-sel') ?? racks[0]?.id ?? '');
  const [dev, setDev] = useState<RackDevice | null>(null);
  const rack = racks.find((r) => r.id === rackId) ?? racks[0];
  if (!rack)
    return (
      <>
        <div className="page-head"><h1>Rack elevations</h1></div>
        <div className="card"><Empty>No racks yet. Add racks on the Floor layout.</Empty></div>
      </>
    );

  const types = new Map(cableTypes.map((t) => [t.id, t]));
  const rc = cables.filter((c) => c.fromRackId === rack.id || c.toRackId === rack.id);
  const fibresIn = rc.reduce((a, c) => a + (types.get(c.typeId)?.fibreCount ?? 0), 0);
  const mpoIn = rc.reduce((a, c) => {
    const t = types.get(c.typeId);
    return a + (t?.termination === 'pre-term-mpo' && t.fibreCount && t.fibresPerConnector ? Math.ceil(t.fibreCount / t.fibresPerConnector) : 0);
  }, 0);
  const ribbonsIn = rc.reduce((a, c) => {
    const t = types.get(c.typeId);
    return a + (t?.termination === 'ribbon-splice' && t.fibreCount && t.ribbonSize ? Math.ceil(t.fibreCount / t.ribbonSize) : 0);
  }, 0);
  const usedU = rack.devices.reduce((a, d) => a + d.uSize, 0);
  const ports = rack.devices.reduce((a, d) => a + (d.ports ?? 0), 0);
  const rDrops = drops.filter((d) => d.rackId === rack.id);
  const maxBend = Math.max(0, ...rc.map((c) => types.get(c.typeId)?.bendRadiusMm ?? 0));

  const setRack = (r: Rack) => upsert('racks', r);
  const saveDev = (d: RackDevice) => {
    const others = rack.devices.filter((x) => x.id !== d.id);
    setRack({ ...rack, devices: [...others, d].sort((a, b) => b.uStart - a.uStart) });
  };
  const clash = (d: RackDevice) =>
    d.uStart < 1 || d.uStart + d.uSize - 1 > rack.heightU || rack.devices.some((x) => x.id !== d.id && d.uStart <= x.uStart + x.uSize - 1 && x.uStart <= d.uStart + d.uSize - 1);
  const nextFree = (size: number) => {
    for (let u = rack.heightU - size + 1; u >= 1; u--) if (!clash({ id: '_', name: '', uStart: u, uSize: size, kind: 'blank' })) return u;
    return 1;
  };

  // Elevation geometry
  const W = 380, uH = 14, top = 24, H = rack.heightU * uH + top + 20;
  const yOfU = (u: number) => top + (rack.heightU - u + 1) * uH; // bottom edge of U

  return (
    <>
      <div className="page-head">
        <h1>Rack elevations</h1>
        <div className="row">
          <select value={rack.id} onChange={(e) => { setRackId(e.target.value); sessionStorage.setItem('rack-sel', e.target.value); }}>
            {racks.map((r) => <option key={r.id} value={r.id}>{[r.building, r.room, r.name].filter(Boolean).join(' / ')}</option>)}
          </select>
          <button className="btn primary" onClick={() => setDev({ id: uid(), name: 'Fibre panel', kind: 'fibre-panel', uSize: 4, uStart: nextFree(4) })}>+ Device</button>
        </div>
      </div>
      <div className="side-layout">
        <div className="grid g2">
          <div className="card">
            <h2>Front elevation - {rack.name} ({rack.heightU}U, {rack.widthMm} x {rack.depthMm})</h2>
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', maxHeight: '75vh' }}>
              <rect x={60} y={top} width={W - 120} height={rack.heightU * uH} fill="var(--panel-2)" stroke="var(--muted)" strokeWidth={2} />
              {Array.from({ length: rack.heightU }, (_, i) => i + 1).map((u) => (
                <g key={u}>
                  <line x1={60} x2={W - 60} y1={yOfU(u)} y2={yOfU(u)} stroke="var(--grid)" />
                  {(u % 2 === 1 || rack.heightU <= 24) && <text x={52} y={yOfU(u) - 3} fontSize={10} textAnchor="end" fill="var(--muted)">{u}</text>}
                </g>
              ))}
              {rack.devices.map((d) => (
                <g key={d.id} onClick={() => setDev(d)} style={{ cursor: 'pointer' }}>
                  <rect x={64} y={yOfU(d.uStart + d.uSize - 1) - uH + 1} width={W - 128} height={d.uSize * uH - 2} rx={3} fill={KIND_COLOR[d.kind]} />
                  <text x={W / 2} y={yOfU(d.uStart + d.uSize - 1) - uH + (d.uSize * uH) / 2 + 4} fontSize={10} textAnchor="middle" fill="#fff">
                    {d.name} · U{d.uStart}{d.uSize > 1 ? `-${d.uStart + d.uSize - 1}` : ''}{d.ports ? ` · ${d.ports} ports` : ''}
                  </text>
                </g>
              ))}
              {rDrops.map((d) => {
                const x = d.entry.includes('left') ? 90 : d.entry.includes('right') ? W - 90 : W / 2;
                return (
                  <g key={d.id}>
                    <path d={`M ${x} 0 L ${x} ${top}`} stroke="#eb6834" strokeWidth={4} markerEnd="" />
                    <text x={x + 6} y={12} fontSize={10} fill="var(--text)">from {pathways.find((p) => p.id === d.pathwayId)?.name}</text>
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="card">
            <h2>Side view - drop from basket</h2>
            <SideView rack={rack} bendMm={maxBend} pathwayDepth={pathways.find((p) => p.id === rDrops[0]?.pathwayId)?.depthMm} elevation={pathways.find((p) => p.id === rDrops[0]?.pathwayId)?.elevationMm} />
            <p className="small muted">
              Illustrative. Uses the largest installed bend radius of cables landing here ({maxBend ? `${fmt(maxBend)} mm` : 'not set in library'}).
              Set basket height above floor on the pathway to draw it to scale.
            </p>
          </div>
        </div>
        <div>
          <div className="card">
            <h2>Capacity</h2>
            <table>
              <tbody>
                <tr><th>Rack units used</th><td className="num">{usedU} / {rack.heightU} U</td></tr>
                <tr><th>Cables landing</th><td className="num">{rc.length}</td></tr>
                <tr><th>Fibres landing</th><td className="num">{fmt(fibresIn)}</td></tr>
                <tr><th>MPO connectors landing</th><td className="num">{fmt(mpoIn)}</td></tr>
                <tr><th>Ribbon splices here</th><td className="num">{fmt(ribbonsIn)}</td></tr>
                <tr><th>Ports on devices</th><td className="num">{fmt(ports)}</td></tr>
              </tbody>
            </table>
            {ports > 0 && mpoIn + ribbonsIn * 12 > 0 && (
              <p className="small">
                {ports >= mpoIn ? <span className="pill ok">ports ≥ MPO connectors</span> : <span className="pill bad">{mpoIn - ports} more MPO ports needed</span>}
              </p>
            )}
          </div>
          <div className="card">
            <h2>Cables landing in {rack.name}</h2>
            {rc.length === 0 ? <Empty>Link cables to this rack in the Cable schedule (From/To rack).</Empty> : (
              <table>
                <tbody>
                  {rc.map((c) => (
                    <tr key={c.id}>
                      <td><b>{c.tag}</b></td>
                      <td className="small">{types.get(c.typeId)?.name}</td>
                      <td className="small muted">{c.fromRackId === rack.id ? `→ ${c.toLabel}` : `← ${c.fromLabel}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {dev && (
        <Modal title={rack.devices.some((d) => d.id === dev.id) ? `Edit ${dev.name}` : 'Add device'} onClose={() => setDev(null)}>
          <div className="grid g2">
            <Field label="Name"><input value={dev.name} onChange={(e) => setDev({ ...dev, name: e.target.value })} /></Field>
            <Field label="Type">
              <select value={dev.kind} onChange={(e) => setDev({ ...dev, kind: e.target.value as RackDevice['kind'] })}>
                {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
            <Field label="Bottom U"><Num value={dev.uStart} onChange={(v) => setDev({ ...dev, uStart: v ?? 1 })} min={1} /></Field>
            <Field label="Height (U)"><Num value={dev.uSize} onChange={(v) => setDev({ ...dev, uSize: v ?? 1 })} min={1} /></Field>
            <Field label="Ports / connectors"><Num value={dev.ports} onChange={(v) => setDev({ ...dev, ports: v })} min={0} /></Field>
          </div>
          {clash(dev) && <p className="small" style={{ color: 'var(--bad)' }}>Overlaps another device or is outside the rack.</p>}
          <div className="row" style={{ marginTop: 12 }}>
            {rack.devices.some((d) => d.id === dev.id) && <button className="btn danger" onClick={() => { if (confirmDelete(dev.name)) { setRack({ ...rack, devices: rack.devices.filter((d) => d.id !== dev.id) }); setDev(null); } }}>Delete</button>}
            <div className="spacer" />
            <button className="btn primary" disabled={clash(dev)} onClick={() => { saveDev(dev); setDev(null); }}>Save</button>
          </div>
        </Modal>
      )}
    </>
  );
}

function SideView({ rack, bendMm, pathwayDepth, elevation }: { rack: Rack; bendMm: number; pathwayDepth?: number; elevation?: number }) {
  const rackH = rack.heightU * U_MM; // mounting space only
  const basketZ = elevation ?? rackH + 600;
  const bd = pathwayDepth ?? 100;
  const R = bendMm || 150;
  const margin = 200;
  const Wd = rack.depthMm + 2 * margin + R;
  const Hd = Math.max(basketZ + bd, rackH) + margin;
  const y = (z: number) => Hd - z; // floor at bottom
  const bx = margin + rack.depthMm * 0.3; // basket centre over rack
  const entryX = bx;
  const f = Hd / 22;
  return (
    <svg viewBox={`0 -${f * 2} ${Wd} ${Hd + f * 4}`} style={{ width: '100%', height: 'auto', maxHeight: '60vh' }}>
      <line x1={0} x2={Wd} y1={y(0)} y2={y(0)} stroke="var(--muted)" strokeWidth={6} />
      <rect x={margin} y={y(rackH)} width={rack.depthMm} height={rackH} fill="var(--panel-2)" stroke="var(--muted)" strokeWidth={6} />
      <text x={margin + rack.depthMm / 2} y={y(rackH / 2)} fontSize={f} textAnchor="middle" fill="var(--muted)">{rack.name}</text>
      {/* basket section (cable direction along basket = across the page) */}
      <rect x={bx - 150} y={y(basketZ + bd)} width={300} height={bd} fill="none" stroke="#64748b" strokeWidth={6} strokeDasharray="20 12" />
      {/* waterfall drop: cable leaves basket with radius R and drops into rack top */}
      <path d={`M ${bx - 150 - R} ${y(basketZ + bd / 2)} L ${bx - R} ${y(basketZ + bd / 2)} A ${R} ${R} 0 0 1 ${entryX} ${y(basketZ + bd / 2) + R} L ${entryX} ${y(rackH)}`} fill="none" stroke="#eb6834" strokeWidth={14} strokeLinecap="round" />
      <text x={bx + 190} y={y(basketZ + bd / 2) + R * 0.8} fontSize={f} fill="var(--text)">R ≥ {fmt(R)} mm</text>
      <text x={10} y={y(basketZ + bd) - f * 0.6} fontSize={f * 0.8} fill="var(--muted)">basket {fmt(basketZ)} mm AFF{elevation ? '' : ' (not set)'}</text>
      <text x={10} y={Hd + f * 1.3} fontSize={f * 0.8} fill="var(--muted)">depth {rack.depthMm} mm · {rack.heightU}U = {fmt(rackH)} mm</text>
    </svg>
  );
}
