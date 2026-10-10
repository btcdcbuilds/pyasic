// Three.js renderer: draws the Sim state each frame.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HW, armyRadius, HERO_POWER } from './sim.js';
import { weaponById } from './data.js';
import { drawWeaponIcon, drawHeroIcon } from './icons.js';
import { buildEnvironment } from './env.js';
import { Particles } from './particles.js';

const QUALITY = {
  high: { army: 220, enemy: 450, pr: 2 },
  medium: { army: 150, enemy: 300, pr: 1.5 },
  low: { army: 90, enemy: 180, pr: 1 },
};
const MAX_PROJ = 500;
const MAX_GHOSTS = 260;
const BLUE = new THREE.Color(0x2f7bff);
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpC = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------------------ geometry helpers
function colored(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}
const box = (w, h, d, x, y, z, hex) => colored(new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex);
const sph = (r, x, y, z, hex, ws = 10, hs = 7) => colored(new THREE.SphereGeometry(r, ws, hs).translate(x, y, z), hex);
const cyl = (r1, r2, h, x, y, z, hex, seg = 8) => colored(new THREE.CylinderGeometry(r1, r2, h, seg).translate(x, y, z), hex);
const cap = (r, len, x, y, z, hex, rx = 0, seg = 6) => colored(new THREE.CapsuleGeometry(r, len, 2, seg).rotateX(rx).translate(x, y, z), hex);

// Rounded soldier: tinted part (uniform, helmet, pads) + fixed-colour part (skin, gun, boots).
function soldierGeometries() {
  const tinted = mergeGeometries([
    cap(0.075, 0.24, -0.09, 0.22, 0, 0x7d7d7d),
    cap(0.075, 0.24, 0.09, 0.22, 0, 0x7d7d7d),
    colored(new THREE.CapsuleGeometry(0.17, 0.18, 3, 8).scale(1, 1, 0.72).translate(0, 0.6, 0), 0xffffff),
    cap(0.058, 0.22, -0.21, 0.6, -0.08, 0xeeeeee, 0.6),
    cap(0.058, 0.22, 0.21, 0.6, -0.1, 0xeeeeee, 0.9),
    sph(0.075, -0.18, 0.74, 0, 0xdcdcdc, 7, 5),
    sph(0.075, 0.18, 0.74, 0, 0xdcdcdc, 7, 5),
    colored(new THREE.SphereGeometry(0.155, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.9, 0), 0xffffff),
    cyl(0.19, 0.19, 0.03, 0, 0.9, 0, 0xe0e0e0, 12),
    box(0.22, 0.24, 0.1, 0, 0.62, 0.15, 0x9a9a9a),
  ]);
  const fixed = mergeGeometries([
    sph(0.12, 0, 0.86, 0, 0xf0c39a, 9, 7),
    box(0.06, 0.08, 0.52, 0.13, 0.64, -0.3, 0x24262b),
    colored(new THREE.CylinderGeometry(0.022, 0.022, 0.22, 5).rotateX(Math.PI / 2).translate(0.13, 0.65, -0.64), 0x24262b),
    box(0.05, 0.13, 0.06, 0.13, 0.56, -0.22, 0x24262b),
    cyl(0.17, 0.17, 0.05, 0, 0.45, 0, 0x3a2a1a, 10),
    sph(0.08, -0.09, 0.04, -0.03, 0x2a2a2a, 6, 4),
    sph(0.08, 0.09, 0.04, -0.03, 0x2a2a2a, 6, 4),
  ]);
  return { tinted, fixed };
}

function textCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function fmt(n) {
  n = Math.max(0, Math.round(n));
  if (n >= 10000) return (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'K';
  return n.toLocaleString('en-US');
}

function outlinedText(ctx, text, x, y, size, fill = '#fff', stroke = '#1a1a1a') {
  ctx.font = `900 ${size}px "Arial Black", Impact, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.16;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function radialTexture(inner, outer) {
  const c = textCanvas(128, 128);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Renderer {
  constructor(canvas, overlay) {
    this.canvas = canvas;
    this.overlay = overlay;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.quality = 'high';
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 420);
    this.shake = 0;
    this.time = 0;

    const { tinted, fixed } = soldierGeometries();
    this.soldierTinted = tinted;
    this.soldierFixed = fixed;
    this.matTinted = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.matFixed = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.matGhost = new THREE.MeshBasicMaterial({ color: 0xf4f6ff, transparent: true, opacity: 0.75, depthWrite: false });
    this.shadowTex = radialTexture('rgba(0,0,0,0.45)', 'rgba(0,0,0,0)');
    this.glowTex = radialTexture('rgba(255,230,120,0.9)', 'rgba(255,200,40,0)');
    this.texCache = new Map();

    this.armyLabel = this.makeLabel('army-label');
    this.bossBar = document.createElement('div');
    this.bossBar.className = 'boss-bar hidden';
    this.bossBar.innerHTML = '<div class="boss-name"></div><div class="boss-track"><div class="boss-fill"></div><span class="boss-hp"></span></div>';
    overlay.appendChild(this.bossBar);
    this.squadLabels = [];
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setQuality(q) {
    this.quality = QUALITY[q] ? q : 'high';
    this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, QUALITY[this.quality].pr);
    this.gl.setPixelRatio(pr);
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.75 ? 58 : 48;
    this.camera.updateProjectionMatrix();
    this.pointScale = (h * pr) * this.camera.projectionMatrix.elements[5] / 2;
  }

  makeLabel(cls) {
    const el = document.createElement('div');
    el.className = 'label ' + cls;
    this.overlay.appendChild(el);
    return el;
  }

  // ------------------------------------------------------------------ level setup
  load(sim) {
    this.dispose();
    this.sim = sim;
    const q = QUALITY[this.quality];
    const world = sim.world;
    const scene = this.scene;
    scene.background = new THREE.Color(world.sky);
    scene.fog = new THREE.Fog(world.fog, world.fogNear, world.fogFar);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x556070, 1.5 * world.light);
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.9 * world.light);
    sun.position.set(-5, 12, 4);
    scene.add(hemi, sun);
    this.root = new THREE.Group();
    scene.add(this.root);
    this.followers = null;
    buildEnvironment(this, world, sim.level.length + 120);
    this.buildDividers(sim);

    this.maxArmy = q.army;
    this.maxEnemy = q.enemy;
    this.army = this.makeCrowd(q.army, BLUE);
    this.armyPos = Array.from({ length: q.army }, () => ({ x: 0, z: 0, ph: Math.random() * 6.28, fresh: 2 }));
    this.enemies = this.makeCrowd(q.enemy, new THREE.Color(world.enemy));
    this.heroes = [];
    this.armyShadow = this.makeShadow();

    // ghosts: white silhouettes that float up when soldiers die (like the ads)
    this.ghostMesh = new THREE.InstancedMesh(this.soldierTinted, this.matGhost, MAX_GHOSTS);
    this.ghostMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.ghostMesh.frustumCulled = false;
    this.ghostMesh.count = 0;
    this.root.add(this.ghostMesh);
    this.ghosts = [];

    // tracer bullets
    const pg = new THREE.BoxGeometry(0.1, 0.1, 1.3);
    this.projMesh = new THREE.InstancedMesh(pg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), MAX_PROJ);
    this.projMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.projMesh.frustumCulled = false;
    this.projMesh.setColorAt(0, tmpC.set(0xffffff));
    this.root.add(this.projMesh);

    this.glow = new Particles(900, { additive: true });
    this.smoke = new Particles(500, { hard: 0.6 });
    this.root.add(this.glow.points, this.smoke.points);

    this.arcGeo = new THREE.BufferGeometry();
    this.arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 2 * 8 * 3), 3));
    this.arcLines = new THREE.LineSegments(this.arcGeo, new THREE.LineBasicMaterial({ color: 0xbfeeff, transparent: true, blending: THREE.AdditiveBlending }));
    this.arcLines.frustumCulled = false;
    this.root.add(this.arcLines);
    this.arcs = [];

    this.views = new Map();
    for (const e of sim.ents) this.views.set(e.id, this.buildEntity(e, world));
    this.bossBar.classList.add('hidden');
    this.bossBar.querySelector('.boss-name').textContent = world.boss.name;
    this.camInit = false;
  }

  dispose() {
    if (!this.root) return;
    const keep = new Set([this.soldierTinted, this.soldierFixed, this.matTinted, this.matFixed, this.matGhost, this.shadowTex, this.glowTex]);
    for (const t of this.texCache.values()) keep.add(t);
    this.scene.traverse((o) => {
      if (o.geometry && !keep.has(o.geometry)) o.geometry.dispose();
      if (o.material) {
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (keep.has(m)) continue;
          if (m.map && !keep.has(m.map)) m.map.dispose();
          m.dispose();
        }
      }
    });
    this.scene.clear();
    this.root = null;
    for (const l of this.squadLabels) l.remove();
    this.squadLabels = [];
    this.overlay.querySelectorAll('.pop').forEach((p) => p.remove());
  }

  makeCrowd(max, color) {
    const t = new THREE.InstancedMesh(this.soldierTinted, this.matTinted, max);
    const f = new THREE.InstancedMesh(this.soldierFixed, this.matFixed, max);
    for (const m of [t, f]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      this.root.add(m);
    }
    for (let i = 0; i < max; i++) t.setColorAt(i, color);
    return { t, f, color };
  }

  makeShadow() {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.02;
    m.renderOrder = 1;
    this.root.add(m);
    return m;
  }

  buildDividers(sim) {
    const geos = [];
    for (const dv of sim.dividers) {
      const len = dv.d1 - dv.d0;
      for (const x of dv.xs) {
        geos.push(new THREE.BoxGeometry(0.28, 0.9, len).translate(x, 0.45, -(dv.d0 + len / 2)));
        for (let z = 0; z <= len; z += 4) geos.push(new THREE.BoxGeometry(0.4, 1.2, 0.4).translate(x, 0.6, -(dv.d0 + z)));
      }
    }
    if (geos.length) this.root.add(new THREE.Mesh(mergeGeometries(geos), new THREE.MeshLambertMaterial({ color: this.sim.world.rail })));
  }

  cachedTex(key, w, h, draw) {
    if (this.texCache.has(key)) return this.texCache.get(key);
    const c = textCanvas(w, h);
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    this.texCache.set(key, t);
    return t;
  }

  // ------------------------------------------------------------------ entities
  buildEntity(e, world) {
    const g = new THREE.Group();
    g.position.set(0, 0, -e.d);
    const v = { g, e };
    const cx = e.x0 !== undefined ? (e.x0 + e.x1) / 2 : 0;
    const w = e.x0 !== undefined ? e.x1 - e.x0 : 0;
    switch (e.type) {
      case 'gate': {
        const canvas = textCanvas(256, 160);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.4, 2.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }));
        panel.position.set(cx, 1.7, 0);
        const posts = new THREE.Mesh(mergeGeometries([
          new THREE.CylinderGeometry(0.13, 0.13, 3.1, 8).translate(e.x0 + 0.2, 1.55, 0),
          new THREE.CylinderGeometry(0.13, 0.13, 3.1, 8).translate(e.x1 - 0.2, 1.55, 0),
        ]), new THREE.MeshLambertMaterial({ color: 0xe8ecf2 }));
        g.add(panel, posts);
        Object.assign(v, { canvas, tex, panel });
        this.drawGate(v);
        break;
      }
      case 'board': case 'hero': {
        const canvas = textCanvas(256, 200);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        const side = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
        const panel = new THREE.Mesh(new THREE.BoxGeometry(w - 0.3, 3.2, 0.3), [side, side, side, side, new THREE.MeshBasicMaterial({ map: tex }), side]);
        panel.position.set(cx, 1.65, 0);
        g.add(panel);
        Object.assign(v, { canvas, tex, panel, cx });
        this.drawBoard(v);
        break;
      }
      case 'cage': {
        const bars = [];
        const cw = w - 0.4;
        for (let i = 0; i <= 10; i++) {
          bars.push(new THREE.CylinderGeometry(0.05, 0.05, 2.3, 5).translate(cx - cw / 2 + (cw * i) / 10, 1.15, 0.9));
          bars.push(new THREE.CylinderGeometry(0.05, 0.05, 2.3, 5).translate(cx - cw / 2 + (cw * i) / 10, 1.15, -0.9));
        }
        bars.push(new THREE.BoxGeometry(cw + 0.2, 0.15, 2).translate(cx, 2.35, 0));
        const cageMesh = new THREE.Mesh(mergeGeometries(bars), new THREE.MeshLambertMaterial({ color: 0x8a6a3a }));
        g.add(cageMesh);
        g.add(new THREE.Mesh(new THREE.BoxGeometry(cw + 0.2, 0.12, 2), new THREE.MeshLambertMaterial({ color: 0x6a5030 })).translateX(cx).translateY(0.06));
        const pris = new THREE.Group();
        const k = Math.min(12, e.allies);
        const mat = new THREE.MeshLambertMaterial({ vertexColors: true, color: BLUE });
        for (let i = 0; i < k; i++) {
          const s = new THREE.Group();
          s.add(new THREE.Mesh(this.soldierTinted, mat), new THREE.Mesh(this.soldierFixed, this.matFixed));
          s.position.set(cx - cw / 2 + 0.4 + ((cw - 0.8) * (i % 6)) / 5, 0.12, i < 6 ? -0.35 : 0.35);
          s.rotation.y = Math.PI;
          s.scale.setScalar(1.15);
          pris.add(s);
        }
        g.add(pris);
        Object.assign(v, { cageMesh, pris, cx });
        v.label = this.makeLabel('ent-label cage-label');
        v.labelY = 3.3;
        v.labelX = cx;
        this.squadLabels.push(v.label);
        break;
      }
      case 'wall': {
        const canvas = textCanvas(256, 128);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        const col = { temple: 0x7a6e58, frozen: 0xbfe6ff, volcano: 0x4a3530, neon: 0x3a3456, lunar: 0x7a7c86, desert: 0xb27a42 }[world.props] || 0x9a8a7a;
        const sideMat = new THREE.MeshLambertMaterial({ color: col });
        const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 2.2, 1), [sideMat, sideMat, sideMat, sideMat, new THREE.MeshBasicMaterial({ map: tex }), sideMat]);
        wall.position.set(cx, 1.1, 0);
        g.add(wall);
        Object.assign(v, { canvas, tex, wallColor: col, cx });
        this.drawWall(v);
        break;
      }
      case 'barrel': {
        const b = new THREE.Mesh(mergeGeometries([
          cyl(0.62, 0.62, 1.4, cx, 0.7, 0, 0xd82a1a, 14),
          cyl(0.65, 0.65, 0.1, cx, 0.3, 0, 0x333333, 14),
          cyl(0.65, 0.65, 0.1, cx, 1.1, 0, 0x333333, 14),
          box(0.45, 0.45, 0.04, cx, 0.7, 0.63, 0xffd000),
        ]), new THREE.MeshLambertMaterial({ vertexColors: true }));
        g.add(b);
        break;
      }
      case 'pickup': {
        const label = `+${e.v}`;
        const tex = this.cachedTex(`pk${e.big ? 'Y' : 'B'}${label}`, 128, 64, (ctx, cw, ch) => {
          const gr = ctx.createLinearGradient(0, 0, 0, ch);
          if (e.big) { gr.addColorStop(0, '#ffe34a'); gr.addColorStop(1, '#f2a800'); } else { gr.addColorStop(0, '#4f9bff'); gr.addColorStop(1, '#1f5fe0'); }
          ctx.fillStyle = gr;
          ctx.fillRect(0, 0, cw, ch);
          ctx.fillStyle = 'rgba(255,255,255,0.25)';
          ctx.fillRect(0, 0, cw, 10);
          outlinedText(ctx, label, cw / 2, ch / 2 + 2, label.length > 3 ? 34 : 42);
        });
        const sideMat = new THREE.MeshLambertMaterial({ color: e.big ? 0xf2b400 : 0x2a6af0 });
        const h = e.big ? 1.3 : 0.85;
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.35), [sideMat, sideMat, sideMat, sideMat, new THREE.MeshBasicMaterial({ map: tex }), sideMat]);
        m.position.set(cx, h / 2 + 0.25, 0);
        const legs = new THREE.Mesh(mergeGeometries([
          new THREE.BoxGeometry(0.12, 0.3, 0.5).translate(cx - w / 2 + 0.25, 0.15, 0),
          new THREE.BoxGeometry(0.12, 0.3, 0.5).translate(cx + w / 2 - 0.25, 0.15, 0),
        ]), sideMat);
        g.add(m, legs);
        v.panel = m;
        break;
      }
      case 'coin': {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.12, 18).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xffc81a, emissive: 0x6a4a00 }));
        c.position.set(cx, 0.9, 0);
        g.add(c);
        v.spin = c;
        break;
      }
      case 'saw': {
        const saw = new THREE.Group();
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(e.half, e.half, 0.15, 24).rotateZ(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xc8ccd4 }));
        const teeth = [];
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          teeth.push(new THREE.ConeGeometry(0.15, 0.36, 4).rotateX(Math.PI / 2).rotateY(Math.PI / 2).translate(0, 0, e.half + 0.1).rotateX(a));
        }
        saw.add(disc, new THREE.Mesh(mergeGeometries(teeth), new THREE.MeshLambertMaterial({ color: 0x8a8f99 })));
        saw.position.y = e.half + 0.05;
        const rail = new THREE.Mesh(new THREE.BoxGeometry(HW * 2, 0.1, 0.4), new THREE.MeshLambertMaterial({ color: 0x333333 }));
        rail.position.y = 0.05;
        g.add(saw, rail);
        v.spin = saw;
        break;
      }
      case 'boulder': {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(e.half, 2), new THREE.MeshLambertMaterial({ color: 0x7a6e58 }));
        b.position.y = e.half;
        g.add(b);
        v.spin = b;
        break;
      }
      case 'geyser': {
        const pool = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.42, w * 0.42, 0.05, 20), new THREE.MeshBasicMaterial({ color: 0xff5a10 }));
        pool.position.set(cx, 0.03, 0);
        const col = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.25, w * 0.38, 6, 14, 1, true), new THREE.MeshBasicMaterial({ color: 0xffa020, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
        col.position.set(cx, 3, 0);
        g.add(pool, col);
        Object.assign(v, { col, cx });
        break;
      }
      case 'squad': {
        v.label = this.makeLabel('ent-label enemy-label');
        this.squadLabels.push(v.label);
        v.shadow = this.makeShadow();
        break;
      }
      case 'boss': {
        const b = buildBoss(world.boss);
        g.add(b.group);
        const sh = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false }));
        sh.rotation.x = -Math.PI / 2;
        sh.position.y = 0.03;
        g.add(sh);
        Object.assign(v, b);
        break;
      }
    }
    this.root.add(g);
    return v;
  }

  drawGate(v) {
    const { canvas, e } = v;
    const ctx = canvas.getContext('2d');
    const good = e.op === '+' || e.op === 'x';
    const pct = e.op === 'rate' || e.op === 'dmg';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const grd = ctx.createLinearGradient(0, 0, 0, canvas.height);
    if (pct) { grd.addColorStop(0, 'rgba(255,214,60,0.9)'); grd.addColorStop(1, 'rgba(235,150,10,0.9)'); }
    else if (good) { grd.addColorStop(0, 'rgba(80,170,255,0.82)'); grd.addColorStop(1, 'rgba(25,95,235,0.82)'); }
    else { grd.addColorStop(0, 'rgba(255,90,90,0.85)'); grd.addColorStop(1, 'rgba(200,20,30,0.85)'); }
    roundRect(ctx, 4, 4, canvas.width - 8, canvas.height - 8, 18);
    ctx.fillStyle = grd;
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    roundRect(ctx, 10, 10, canvas.width - 20, 40, 12);
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    roundRect(ctx, 4, 4, canvas.width - 8, canvas.height - 8, 18);
    ctx.stroke();
    let txt;
    if (pct) txt = `+${e.v}%`;
    else if (e.op === 'x') txt = `x${e.v}`;
    else if (e.op === '÷') txt = `÷${e.v}`;
    else txt = `${e.op}${e.v}`;
    outlinedText(ctx, txt, 128, pct ? 66 : 82, txt.length > 4 ? 64 : 84);
    if (pct) outlinedText(ctx, e.op === 'rate' ? 'FIRE RATE' : 'DAMAGE', 128, 128, 28);
    else if (e.op === '+' && e.cap !== undefined && e.v >= e.cap) outlinedText(ctx, 'MAX', 128, 140, 22, '#ffe34a');
    v.tex.needsUpdate = true;
  }

  drawBoard(v) {
    const { canvas, e } = v;
    const ctx = canvas.getContext('2d');
    const open = e.unlocked;
    if (open) {
      const gr = ctx.createLinearGradient(0, 0, 0, canvas.height);
      gr.addColorStop(0, '#ffe680');
      gr.addColorStop(1, '#ffb300');
      ctx.fillStyle = gr;
    } else ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = open ? '#fff6c0' : '#d8d8d8';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
    if (e.type === 'board') {
      const w = weaponById[e.weapon];
      drawWeaponIcon(ctx, w, 28, 22, 200, 92);
      outlinedText(ctx, w.name.toUpperCase(), 128, 126, 20, '#ffd23a', '#222');
    } else {
      drawHeroIcon(ctx, 128, 68, 1);
      outlinedText(ctx, 'HERO', 128, 126, 20, '#ffd23a', '#222');
    }
    if (open) outlinedText(ctx, 'RUN IN!', 128, 168, 38, '#ffffff', '#1f9a42');
    else outlinedText(ctx, fmt(Math.ceil(e.hp)), 128, 168, 46);
    v.tex.needsUpdate = true;
  }

  drawWall(v) {
    const { canvas, e } = v;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#' + new THREE.Color(v.wallColor).getHexString();
    ctx.fillRect(0, 0, 256, 128);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 3;
    for (let y = 0; y < 128; y += 32) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke();
      for (let x = (y / 32) % 2 ? 0 : 32; x < 256; x += 64) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 32); ctx.stroke(); }
    }
    outlinedText(ctx, fmt(Math.ceil(e.hp)), 128, 66, 60);
    v.tex.needsUpdate = true;
  }

  // ------------------------------------------------------------------ effects
  spark(x, y, z, color, n = 3, speed = 5, size = 0.35) {
    for (let i = 0; i < n; i++) {
      this.glow.spawn({ x, y, z, vx: (Math.random() - 0.5) * speed, vy: Math.random() * speed * 0.7, vz: (Math.random() - 0.5) * speed + 2, life: 0.18 + Math.random() * 0.15, size, grow: 0.3, color, gravity: 8, drag: 3 });
    }
  }

  explosion(x, y, z, r = 2) {
    for (let i = 0; i < 14; i++) {
      this.glow.spawn({ x: x + (Math.random() - 0.5) * r, y: y + Math.random() * r * 0.5, z: z + (Math.random() - 0.5) * r, vx: (Math.random() - 0.5) * 3, vy: 1 + Math.random() * 3, vz: (Math.random() - 0.5) * 3, life: 0.35 + Math.random() * 0.3, size: r * (0.9 + Math.random()), grow: 1.6, color: i % 3 ? 0xff7a1a : 0xffd04a, drag: 2 });
    }
    for (let i = 0; i < 8; i++) {
      this.smoke.spawn({ x: x + (Math.random() - 0.5) * r, y: y + 0.5, z: z + (Math.random() - 0.5) * r, vx: (Math.random() - 0.5) * 2, vy: 1.5 + Math.random() * 2, vz: (Math.random() - 0.5) * 2, life: 0.9 + Math.random() * 0.6, size: r * 1.4, grow: 2.2, color: 0x555555, alpha: 0.55, drag: 1.5 });
    }
  }

  dust(x, z, r, color = 0xd8d0c0, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.smoke.spawn({ x: x + Math.cos(a) * r, y: 0.3, z: z + Math.sin(a) * r, vx: Math.cos(a) * 3, vy: 0.8 + Math.random(), vz: Math.sin(a) * 3, life: 0.6 + Math.random() * 0.4, size: 1.2, grow: 2.5, color, alpha: 0.5, drag: 3 });
    }
  }

  ghost(x, z, flip = false) {
    if (this.ghosts.length >= MAX_GHOSTS) this.ghosts.shift();
    this.ghosts.push({ x, z, life: 0.9, ry: flip ? Math.PI : 0, vx: (Math.random() - 0.5) * 1.2, vz: (Math.random() - 0.5) * 1.2 + (flip ? -1.5 : 1.5) });
  }

  sparkle(x, y, z, color = 0xffe066, n = 24) {
    for (let i = 0; i < n; i++) {
      this.glow.spawn({ x, y, z, vx: (Math.random() - 0.5) * 6, vy: 2 + Math.random() * 5, vz: (Math.random() - 0.5) * 6, life: 0.5 + Math.random() * 0.4, size: 0.4, grow: 0.4, color, gravity: 9, drag: 1 });
    }
  }

  handleEvents(events, popText) {
    const sim = this.sim;
    const armyZ = -sim.d;
    for (const ev of events) {
      switch (ev.type) {
        case 'hit': {
          const w = weaponById[ev.w];
          if (Math.random() < 0.5 || w.rate < 3) this.spark(ev.x, 0.9 + Math.random() * 0.6, -ev.d, w.color, w.rate < 3 ? 4 : 2, 5, 0.3 + w.size * 0.12);
          break;
        }
        case 'boom':
          this.explosion(ev.x, 0.8, -ev.d, Math.min(3, ev.r));
          this.shake = Math.max(this.shake, 0.2);
          break;
        case 'arc':
          this.arcs.push({ x0: ev.x0, d0: ev.d0, x1: ev.x1, d1: ev.d1, life: 0.12 });
          break;
        case 'kill': {
          const e = ev.e;
          const r = armyRadius(e.m + ev.k);
          for (let i = 0; i < Math.min(ev.k, 5); i++) {
            const a = Math.random() * Math.PI * 2;
            const rr = Math.sqrt(Math.random()) * r;
            this.ghost(e.x + Math.cos(a) * rr, -e.d + Math.sin(a) * rr, true);
          }
          break;
        }
        case 'lose': {
          if (ev.cause === 'clash') break; // clash ghosts come from the kill event
          const R = sim.radius;
          for (let i = 0; i < Math.min(ev.k, 10); i++) {
            const a = Math.random() * Math.PI * 2;
            const rr = Math.sqrt(Math.random()) * R;
            this.ghost(sim.x + Math.cos(a) * rr, armyZ + Math.sin(a) * rr, false);
          }
          break;
        }
        case 'destroy': {
          const e = ev.e;
          const cx = (e.x0 + e.x1) / 2;
          if (e.type === 'barrel') this.explosion(cx, 0.8, -e.d, 2.5);
          else this.dust(cx, -e.d, 1, 0xcfc6b8, 14);
          break;
        }
        case 'crash': {
          const e = ev.e;
          const cx = e.x0 !== undefined && e.x1 !== e.x0 ? (e.x0 + e.x1) / 2 : sim.x;
          this.dust(cx, -e.d, 1.2, 0xdddddd, 16);
          this.shake = Math.max(this.shake, 0.3);
          break;
        }
        case 'unlock': {
          const v = this.views.get(ev.e.id);
          if (!v) break;
          this.sparkle(v.cx, 2, -ev.e.d, 0xffe066, 30);
          this.markUnlocked(v);
          break;
        }
        case 'collect': {
          const v = this.views.get(ev.e.id);
          if (v) v.g.visible = false;
          this.sparkle(sim.x, 1.5, armyZ - 1, 0x7affa0, 30);
          break;
        }
        case 'missed': {
          const v = this.views.get(ev.e.id);
          if (v) { v.fading = 1; }
          popText('MISSED', 'bad', (ev.e.x0 + ev.e.x1) / 2, 2.5, -ev.e.d);
          break;
        }
        case 'pickup': {
          const v = this.views.get(ev.e.id);
          if (v) v.g.visible = false;
          this.sparkle((ev.e.x0 + ev.e.x1) / 2, 1, -ev.e.d, ev.e.big ? 0xffd04a : 0x6ab0ff, ev.e.big ? 16 : 6);
          if (ev.e.big || Math.random() < 0.35) popText(`+${ev.e.v}`, ev.e.big ? 'coin' : 'good', sim.x, 2.2, armyZ);
          break;
        }
        case 'gate': {
          const e = ev.e;
          const txt = e.op === 'rate' ? `FIRE RATE +${e.v}%` : e.op === 'dmg' ? `DAMAGE +${e.v}%` : (ev.delta >= 0 ? '+' : '') + ev.delta;
          popText(txt, ev.good ? 'good' : 'bad', sim.x, 2.5, armyZ);
          this.sparkle(sim.x, 1.5, armyZ - 1, ev.good ? 0x6ab0ff : 0xff4a4a, 18);
          break;
        }
        case 'weapon':
          popText(ev.w.name.toUpperCase() + '!', 'weapon', sim.x, 3, armyZ);
          break;
        case 'powerup':
          popText(ev.text, 'good', sim.x, 3, armyZ);
          break;
        case 'hero':
          popText('HERO JOINED!', 'weapon', sim.x, 3, armyZ);
          break;
        case 'allies':
          popText(`+${ev.k} FREED`, 'good', sim.x, 3, armyZ);
          break;
        case 'gateFlip': {
          const e = ev.e;
          this.sparkle((e.x0 + e.x1) / 2, 1.7, -e.d, 0x4aa0ff, 24);
          break;
        }
        case 'coin':
          popText(`+${ev.e.value}`, 'coin', (ev.e.x0 + ev.e.x1) / 2, 1.5, -ev.e.d);
          this.sparkle((ev.e.x0 + ev.e.x1) / 2, 0.9, -ev.e.d, 0xffd04a, 8);
          break;
        case 'stomp': {
          this.shake = Math.max(this.shake, 0.7);
          this.dust(sim.x, armyZ - 1, 1.5, 0xbbb3a6, 22);
          const v = this.views.get(ev.e.id);
          if (v) v.stompAnim = 0.6;
          break;
        }
        case 'burn':
          this.explosion(sim.x, 0.5, armyZ, 1.5);
          break;
        case 'clash':
          this.dust(ev.e.x, -ev.e.d, 1, 0xd8d0c0, 10);
          break;
        case 'bossDown': {
          const v = this.views.get(ev.e.id);
          for (let i = 0; i < 4; i++) this.explosion((Math.random() - 0.5) * 3, 2 + i, -ev.e.d, 3);
          this.shake = 1;
          if (v) v.dying = 1;
          break;
        }
      }
    }
  }

  markUnlocked(v) {
    const e = v.e;
    if (e.type === 'board' || e.type === 'hero') {
      this.drawBoard(v);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(e.x1 - e.x0 + 1.5, 5), new THREE.MeshBasicMaterial({ map: this.glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.position.set(v.cx, 1.8, -0.2);
      v.g.add(glow);
      v.glow = glow;
      if (e.type === 'hero') {
        const h = buildHero();
        h.position.set(v.cx, 0, 0.9);
        h.rotation.y = Math.PI;
        v.g.add(h);
        v.heroModel = h;
      }
    } else if (e.type === 'cage') {
      v.cageMesh.visible = false; // bars burst open, prisoners wait for you
      this.dust(v.cx, -e.d, 1.5, 0xa08060, 14);
    }
  }

  // ------------------------------------------------------------------ per-frame
  render(dt) {
    const sim = this.sim;
    if (!sim) return;
    this.time += dt;
    const t = this.time;
    const R = sim.radius;
    const armyZ = -sim.d;
    const running = sim.state === 'run' && !sim.clashing;

    // ---- army: packed sunflower formation, soldiers ease into place
    const n = Math.min(this.maxArmy, Math.max(0, Math.round(sim.n)));
    const c = n > 1 ? (R * 0.92) / Math.sqrt(n) : 0;
    for (let i = 0; i < n; i++) {
      const p = this.armyPos[i];
      const r = c * Math.sqrt(i + 0.5);
      const th = i * 2.39996;
      const tx = sim.x + Math.cos(th) * r;
      const tz = armyZ + Math.sin(th) * r * 0.9;
      if (p.fresh > 1) { p.x = sim.x + (Math.random() - 0.5); p.z = armyZ + 1; }
      p.fresh = 0;
      const k = Math.min(1, dt * 7);
      p.x += (tx - p.x) * k;
      p.z += (tz - p.z) * k;
      const ph = t * 12 + p.ph;
      const bob = running ? Math.abs(Math.sin(ph)) * 0.1 : 0;
      tmpE.set(running ? -0.12 + Math.sin(ph) * 0.05 : 0, Math.sin(p.ph * 3) * 0.12, running ? Math.sin(ph) * 0.06 : 0);
      tmpQ.setFromEuler(tmpE);
      tmpM.compose(tmpP.set(p.x, bob, p.z), tmpQ, tmpS.set(1, 1, 1));
      this.army.t.setMatrixAt(i, tmpM);
      this.army.f.setMatrixAt(i, tmpM);
    }
    for (let i = n; i < this.maxArmy; i++) this.armyPos[i].fresh = 2;
    this.army.t.count = this.army.f.count = n;
    this.army.t.instanceMatrix.needsUpdate = true;
    this.army.f.instanceMatrix.needsUpdate = true;
    this.armyShadow.visible = n > 0;
    this.armyShadow.position.set(sim.x, 0.02, armyZ);
    this.armyShadow.scale.set(R * 2.6, R * 2.4, 1);

    // ---- heroes
    while (this.heroes.length < sim.heroes) {
      const h = buildHero();
      this.root.add(h);
      this.heroes.push(h);
    }
    while (this.heroes.length > sim.heroes) this.root.remove(this.heroes.pop());
    this.heroes.forEach((h, i) => {
      h.position.set(sim.heroX(i), running ? Math.abs(Math.sin(t * 9 + i)) * 0.12 : 0, armyZ + 0.4);
    });

    // ---- muzzle flashes for newly fired bullets
    for (const p of sim.proj) {
      if (p.seen) continue;
      p.seen = true;
      if (Math.random() < 0.35) this.glow.spawn({ x: p.x, y: 0.7, z: -p.d - 0.3, life: 0.06, size: 0.5 + p.w.size * 0.2, grow: 0.6, color: 0xfff0b0 });
    }

    // ---- enemies + entities
    let ei = 0;
    const camZ = this.camera.position.z;
    let bossVisible = false;
    for (const v of this.views.values()) {
      const e = v.e;
      const dz = -e.d - camZ;
      const inView = dz < 25 && dz > -200;
      if (e.type === 'squad') {
        const show = e.alive && inView;
        if (show) this.placeLabel(v.label, e.x, 1.4 + armyRadius(e.m) * 0.3, -e.d, fmt(e.m));
        else v.label.style.display = 'none';
        v.shadow.visible = show;
        if (!show) continue;
        const r = armyRadius(e.m);
        v.shadow.position.set(e.x, 0.02, -e.d);
        v.shadow.scale.set(r * 2.6, r * 2.4, 1);
        const m = Math.min(e.m, 180, this.maxEnemy - ei);
        const cc = m > 1 ? (r * 0.92) / Math.sqrt(m) : 0;
        const moving = e.d - sim.d < 34 && !e.contact;
        for (let k = 0; k < m; k++) {
          const rr = cc * Math.sqrt(k + 0.5);
          const th = k * 2.39996;
          const ph = t * 12 + k * 1.7;
          const bob = moving ? Math.abs(Math.sin(ph)) * 0.1 : Math.abs(Math.sin(t * 3 + k)) * 0.03;
          tmpE.set(moving ? 0.12 : 0, Math.PI + Math.sin(k * 5.1) * 0.15, 0);
          tmpQ.setFromEuler(tmpE);
          tmpM.compose(tmpP.set(e.x + Math.cos(th) * rr, bob, -e.d + Math.sin(th) * rr * 0.9), tmpQ, tmpS.set(1, 1, 1));
          this.enemies.t.setMatrixAt(ei, tmpM);
          this.enemies.f.setMatrixAt(ei, tmpM);
          ei++;
        }
        continue;
      }
      if (e.type === 'boss') {
        this.animateBoss(v, dt);
        bossVisible = inView && (e.alive || v.dying > 0);
        continue;
      }
      if (v.fading > 0) {
        v.fading -= dt * 2;
        v.g.position.y = -(1 - v.fading) * 3;
        if (v.fading <= 0) v.g.visible = false;
        if (v.label) v.label.style.display = 'none';
        continue;
      }
      if (!e.alive) {
        if (v.g.visible && e.type !== 'pickup' && e.type !== 'coin') v.g.visible = false;
        else if (v.g.visible) v.g.visible = false;
        if (v.label) v.label.style.display = 'none';
        continue;
      }
      if (v.label) {
        if (inView) {
          const html = e.unlocked ? `JOIN +${e.allies}<small>RUN IN!</small>` : `${fmt(Math.ceil(e.hp))}<small>FREE +${e.allies}</small>`;
          this.placeLabel(v.label, v.labelX, v.labelY, -e.d, html);
          v.label.classList.toggle('open', !!e.unlocked);
        } else v.label.style.display = 'none';
      }
      if (!inView) continue;
      if (e.dirty) {
        e.dirty = false;
        if (e.type === 'gate') this.drawGate(v);
        else if (e.type === 'board' || e.type === 'hero') this.drawBoard(v);
        else if (e.type === 'wall') this.drawWall(v);
      }
      if (e.type === 'gate') {
        const s = 1 + (e.bump || 0) * 0.06;
        v.panel.scale.set(s, s, 1);
      } else if (e.type === 'coin') v.spin.rotation.y += dt * 4;
      else if (e.type === 'saw') {
        v.spin.position.x = sim.hazardX(e);
        v.spin.rotation.x += dt * 14;
        if (Math.random() < 0.3) this.spark(v.spin.position.x, 0.1, -e.d, 0xffd080, 1, 4, 0.2);
      } else if (e.type === 'boulder') {
        const nx = sim.hazardX(e);
        v.spin.rotation.z -= (nx - v.spin.position.x) / e.half;
        v.spin.position.x = nx;
      } else if (e.type === 'geyser') {
        const on = sim.geyserOn(e);
        const ph = ((sim.t + e.phase) % e.period);
        v.col.visible = on;
        v.col.scale.y = on ? Math.min(1, ph * 6) : 0.01;
        v.col.position.y = 3 * v.col.scale.y;
        if (on && Math.random() < 0.5) this.glow.spawn({ x: v.cx + (Math.random() - 0.5), y: Math.random() * 5, z: -e.d, vy: 4, life: 0.4, size: 0.8, grow: 1.5, color: 0xff8a2a });
        else if (!on && Math.random() < 0.1) this.smoke.spawn({ x: v.cx, y: 0.2, z: -e.d, vy: 1, life: 0.8, size: 0.8, grow: 2, color: 0x444444, alpha: 0.4 });
      } else if (e.unlocked) {
        if (v.glow) v.glow.material.opacity = 0.6 + Math.sin(t * 6) * 0.3;
        if (v.panel) v.panel.position.y = 1.65 + Math.sin(t * 4) * 0.08;
        if (v.heroModel) v.heroModel.position.y = Math.abs(Math.sin(t * 5)) * 0.25;
        if (v.pris) v.pris.children.forEach((s, i) => { s.position.y = 0.12 + Math.abs(Math.sin(t * 7 + i)) * 0.35; });
      }
    }
    this.enemies.t.count = this.enemies.f.count = ei;
    this.enemies.t.instanceMatrix.needsUpdate = true;
    this.enemies.f.instanceMatrix.needsUpdate = true;

    // ---- ghosts
    this.ghosts = this.ghosts.filter((g) => (g.life -= dt) > 0);
    let gi = 0;
    for (const g of this.ghosts) {
      const k = 1 - g.life / 0.9;
      g.x += g.vx * dt;
      g.z += g.vz * dt;
      tmpE.set(-0.3 - k * 0.6, g.ry, 0);
      tmpQ.setFromEuler(tmpE);
      const s = 1 - k * 0.5;
      tmpM.compose(tmpP.set(g.x, k * 1.6, g.z), tmpQ, tmpS.set(s, s, s));
      this.ghostMesh.setMatrixAt(gi++, tmpM);
    }
    this.ghostMesh.count = gi;
    this.ghostMesh.instanceMatrix.needsUpdate = true;

    // ---- boss bar
    const b = sim.boss;
    if (bossVisible && b.alive) {
      this.bossBar.classList.remove('hidden');
      this.bossBar.querySelector('.boss-fill').style.width = `${(b.hp / b.maxHp) * 100}%`;
      this.bossBar.querySelector('.boss-hp').textContent = fmt(Math.ceil(b.hp));
    } else this.bossBar.classList.add('hidden');

    // ---- tracers
    let pi = 0;
    for (const p of sim.proj) {
      if (pi >= MAX_PROJ) break;
      const w = p.w;
      const sc = w.size * (p.hero ? 1.3 : 1);
      tmpQ.identity();
      tmpM.compose(tmpP.set(p.x, 0.7 + (p.hero ? 0.4 : 0), -p.d), tmpQ, tmpS.set(sc, sc, sc * (w.speed > 100 ? 2.4 : 1.2)));
      this.projMesh.setMatrixAt(pi, tmpM);
      this.projMesh.setColorAt(pi, tmpC.set(w.color));
      pi++;
    }
    this.projMesh.count = pi;
    this.projMesh.instanceMatrix.needsUpdate = true;
    if (this.projMesh.instanceColor) this.projMesh.instanceColor.needsUpdate = true;

    // ---- tesla arcs
    this.arcs = this.arcs.filter((a) => (a.life -= dt) > 0);
    const ap = this.arcGeo.attributes.position.array;
    let ai = 0;
    for (const a of this.arcs.slice(0, 64)) {
      let px = a.x0, py = 0.8, pz = -a.d0;
      for (let s = 1; s <= 8; s++) {
        const f = s / 8;
        const nx = a.x0 + (a.x1 - a.x0) * f + (s < 8 ? (Math.random() - 0.5) * 0.8 : 0);
        const ny = 0.8 + (s < 8 ? Math.random() * 0.8 : 0);
        const nz = -(a.d0 + (a.d1 - a.d0) * f);
        ap.set([px, py, pz, nx, ny, nz], ai);
        ai += 6;
        px = nx; py = ny; pz = nz;
      }
    }
    this.arcGeo.setDrawRange(0, ai / 3);
    this.arcGeo.attributes.position.needsUpdate = true;

    // ---- particles & ambient
    this.glow.update(dt, this.pointScale);
    this.smoke.update(dt, this.pointScale);
    if (this.ambient) {
      const pos = this.ambient.pts.geometry.attributes.position;
      const a = pos.array;
      const baseZ = this.camera.position.z;
      for (let i = 0; i < a.length; i += 3) {
        if (!this.ambient.lunar) {
          a[i + 1] += this.ambient.fall * dt;
          a[i] += Math.sin(t + i) * dt * 0.6;
          if (a[i + 1] < 0) a[i + 1] += 25;
          if (a[i + 1] > 25) a[i + 1] -= 25;
        }
        if (a[i + 2] > baseZ + 15) a[i + 2] -= 130;
        if (a[i + 2] < baseZ - 115) a[i + 2] += 130;
      }
      pos.needsUpdate = true;
    }
    if (this.followers) for (const f of this.followers) f.position.z = armyZ - 260;

    this.placeLabel(this.armyLabel, sim.x, 1.5 + R * 0.35, armyZ, fmt(sim.n) + (sim.heroes ? ` <small>+${sim.heroes}★</small>` : ''));

    // ---- camera: high and behind, like the ads
    const fight = b.alive && b.d - sim.d < 30;
    const camX = sim.x * 0.5;
    const back = fight ? 14 : 11.5;
    const height = fight ? 14 : 12.5;
    const cam = this.camera.position;
    const target = tmpP.set(camX, height, armyZ + back);
    if (!this.camInit) { cam.copy(target); this.camInit = true; } else cam.lerp(target, Math.min(1, dt * 4));
    this.shake = Math.max(0, this.shake - dt * 2);
    const sh = this.shake * this.shake * 0.6;
    this.camera.lookAt(camX * 0.8 + (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, armyZ - 15);

    this.gl.render(this.scene, this.camera);
  }

  animateBoss(v, dt) {
    const e = v.e;
    v.g.position.z = -e.d;
    const walking = e.alive && e.d - this.sim.d < 34 && !e.contact;
    const t = this.time;
    const sw = walking ? Math.sin(t * 5) * 0.5 : 0;
    v.legL.rotation.x = sw;
    v.legR.rotation.x = -sw;
    v.group.position.y = walking ? Math.abs(Math.sin(t * 5)) * 0.15 : 0;
    if (v.stompAnim > 0) {
      v.stompAnim -= dt;
      const k = Math.sin((1 - v.stompAnim / 0.6) * Math.PI);
      v.armL.rotation.x = -k * 2.4;
      v.armR.rotation.x = -k * 2.4;
      v.group.rotation.x = k * 0.25;
    } else {
      v.armL.rotation.x = -sw * 0.6;
      v.armR.rotation.x = sw * 0.6;
      v.group.rotation.x = 0;
    }
    const fl = e.flash || 0;
    for (const m of v.mats) m.emissive.setRGB(fl * 0.18, fl * 0.12, fl * 0.1);
    if (v.dying > 0) {
      v.dying -= dt * 0.8;
      const k = 1 - Math.max(0, v.dying);
      v.group.rotation.x = -k * 1.5;
      v.group.position.y = -k * 2;
      if (v.dying <= 0) v.g.visible = false;
    }
  }

  placeLabel(el, x, y, z, html) {
    tmpP.set(x, y, z).project(this.camera);
    if (tmpP.z > 1 || tmpP.z < -1) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    const sx = (tmpP.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-tmpP.y * 0.5 + 0.5) * window.innerHeight;
    el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%)`;
    if (el._html !== html) { el.innerHTML = html; el._html = html; }
  }

  project(x, y, z) {
    tmpP.set(x, y, z).project(this.camera);
    return [(tmpP.x * 0.5 + 0.5) * window.innerWidth, (-tmpP.y * 0.5 + 0.5) * window.innerHeight];
  }
}

function buildHero() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const body = mergeGeometries([
    cap(0.11, 0.42, -0.14, 0.3, 0, 0x244a9a),
    cap(0.11, 0.42, 0.14, 0.3, 0, 0x244a9a),
    colored(new THREE.CapsuleGeometry(0.3, 0.3, 3, 10).scale(1.05, 1, 0.75).translate(0, 0.9, 0), 0x2f7bff),
    cyl(0.31, 0.31, 0.08, 0, 0.66, 0, 0xffc81a, 12),
    colored(new THREE.BoxGeometry(0.08, 0.7, 0.5).rotateZ(-0.6).translate(0, 0.95, 0), 0xffc81a),
    sph(0.14, -0.34, 1.12, 0, 0xffc81a, 8, 6),
    sph(0.14, 0.34, 1.12, 0, 0xffc81a, 8, 6),
    cap(0.09, 0.32, -0.36, 0.86, -0.12, 0x2f7bff, 0.8),
    sph(0.17, 0, 1.36, 0, 0x8a5a3a),
    colored(new THREE.SphereGeometry(0.2, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.42, 0), 0x2f7bff),
    cyl(0.25, 0.25, 0.04, 0, 1.42, 0, 0xffc81a, 12),
    box(0.26, 0.26, 0.5, 0.34, 0.82, -0.12, 0x333333),
  ]);
  g.add(new THREE.Mesh(body, mat));
  const barrels = mergeGeometries([0, 1, 2, 3, 4, 5].map((i) => cyl(0.035, 0.035, 0.95, Math.cos(i) * 0.08, Math.sin(i) * 0.08, 0, 0x555555, 5).rotateX(Math.PI / 2)));
  const gun = new THREE.Mesh(barrels, mat);
  gun.position.set(0.34, 0.82, -0.75);
  g.add(gun);
  g.scale.setScalar(1.6);
  return g;
}

function buildBoss(cfg) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: cfg.color });
  const acc = new THREE.MeshLambertMaterial({ color: cfg.accent });
  const eye = new THREE.MeshBasicMaterial({ color: cfg.eye });
  const mk = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); return o; };
  const torso = cfg.mech
    ? mk(new THREE.BoxGeometry(3.6, 3, 2.4), mat, 0, 5.2, 0)
    : mk(new THREE.SphereGeometry(1.9, 20, 14), mat, 0, 5.3, 0);
  if (!cfg.mech) torso.scale.set(1.15, 1.05, 0.8);
  const chest = cfg.mech ? mk(new THREE.BoxGeometry(2.2, 1.4, 0.3), acc, 0, 5.6, 1.25) : mk(new THREE.SphereGeometry(1.2, 14, 10), acc, 0, 4.4, 0.4);
  if (!cfg.mech) chest.scale.set(1.2, 0.7, 0.8);
  const belt = mk(new THREE.CylinderGeometry(1.7, 1.7, 0.5, 18), acc, 0, 3.8, 0);
  belt.scale.z = 0.75;
  const head = cfg.mech ? mk(new THREE.BoxGeometry(1.6, 1.1, 1.4), acc, 0, 7.3, 0) : mk(new THREE.SphereGeometry(0.95, 16, 12), mat, 0, 7.4, 0);
  const eyes = [mk(new THREE.SphereGeometry(0.16, 8, 6), eye, -0.35, 7.5, 0.82), mk(new THREE.SphereGeometry(0.16, 8, 6), eye, 0.35, 7.5, 0.82)];
  const shoulders = [mk(new THREE.SphereGeometry(0.85, 14, 10), acc, -2.2, 6.4, 0), mk(new THREE.SphereGeometry(0.85, 14, 10), acc, 2.2, 6.4, 0)];
  const pivotLeg = (x) => {
    const p = new THREE.Group();
    p.position.set(x, 3.6, 0);
    p.add(mk(cfg.mech ? new THREE.BoxGeometry(1, 3.4, 1.2) : new THREE.CapsuleGeometry(0.55, 2.4, 4, 12), acc, 0, -1.8, 0));
    const foot = mk(new THREE.SphereGeometry(0.75, 12, 8), mat, 0, -3.45, 0.25);
    foot.scale.set(1, 0.45, 1.4);
    p.add(foot);
    return p;
  };
  const pivotArm = (x) => {
    const p = new THREE.Group();
    p.position.set(x, 6.2, 0);
    p.add(mk(cfg.mech ? new THREE.BoxGeometry(0.9, 3.2, 0.9) : new THREE.CapsuleGeometry(0.55, 2.4, 4, 12), mat, 0, -1.7, 0));
    p.add(mk(cfg.mech ? new THREE.CylinderGeometry(0.4, 0.4, 1.6, 12) : new THREE.SphereGeometry(0.85, 14, 10), acc, 0, -3.6, 0));
    return p;
  };
  const legL = pivotLeg(-0.95);
  const legR = pivotLeg(0.95);
  const armL = pivotArm(-2.5);
  const armR = pivotArm(2.5);
  group.add(torso, chest, belt, head, ...eyes, ...shoulders, legL, legR, armL, armR);
  if (cfg.horns) {
    const hl = mk(new THREE.ConeGeometry(0.24, 1.2, 10), acc, -0.6, 8.3, 0);
    const hr = mk(new THREE.ConeGeometry(0.24, 1.2, 10), acc, 0.6, 8.3, 0);
    hl.rotation.z = 0.35;
    hr.rotation.z = -0.35;
    group.add(hl, hr);
  }
  if (cfg.mech) group.add(mk(new THREE.BoxGeometry(0.2, 1.4, 0.2), eye, 0, 8.3, 0));
  return { group, legL, legR, armL, armR, dying: 0, stompAnim: 0, mats: [mat, acc] };
}

export { HERO_POWER };
