// Three.js renderer: draws the Sim state each frame.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HW, armyRadius, HERO_POWER } from './sim.js';
import { weaponById } from './data.js';
import { drawWeaponIcon, drawHeroIcon } from './icons.js';

const MAX_ARMY_DRAW = 300;
const MAX_ENEMY_DRAW = 1100;
const MAX_PROJ = 600;
const MAX_PARTS = 700;
const BLUE = new THREE.Color(0x2f7bff);
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpC = new THREE.Color();

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
const sph = (r, x, y, z, hex, ws = 8, hs = 6) => colored(new THREE.SphereGeometry(r, ws, hs).translate(x, y, z), hex);
const cyl = (r1, r2, h, x, y, z, hex, seg = 8) => colored(new THREE.CylinderGeometry(r1, r2, h, seg).translate(x, y, z), hex);

// Soldier = tinted part (uniform, helmet) + fixed-colour part (skin, gun, boots).
function soldierGeometries() {
  const tinted = mergeGeometries([
    box(0.15, 0.36, 0.17, -0.09, 0.2, 0, 0x8a8a8a),
    box(0.15, 0.36, 0.17, 0.09, 0.2, 0, 0x8a8a8a),
    box(0.38, 0.4, 0.24, 0, 0.58, 0, 0xffffff),
    box(0.11, 0.34, 0.13, -0.25, 0.6, -0.04, 0xe6e6e6),
    box(0.11, 0.34, 0.13, 0.25, 0.6, -0.04, 0xe6e6e6),
    sph(0.16, 0, 0.93, 0, 0xffffff, 8, 5),
    box(0.36, 0.04, 0.36, 0, 0.9, 0, 0xd8d8d8),
  ]);
  const fixed = mergeGeometries([
    sph(0.12, 0, 0.86, 0, 0xf0c39a, 8, 6),
    box(0.07, 0.08, 0.55, 0.14, 0.62, -0.28, 0x222428),
    box(0.06, 0.16, 0.06, 0.14, 0.52, -0.2, 0x222428),
    box(0.16, 0.06, 0.2, -0.09, 0.03, -0.02, 0x2a2a2a),
    box(0.16, 0.06, 0.2, 0.09, 0.03, -0.02, 0x2a2a2a),
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

function fmt(n) {
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

export class Renderer {
  constructor(canvas, overlay) {
    this.canvas = canvas;
    this.overlay = overlay;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.quality = 'high';
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
    this.shake = 0;
    this.time = 0;

    const { tinted, fixed } = soldierGeometries();
    this.soldierTinted = tinted;
    this.soldierFixed = fixed;
    this.matTinted = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.matFixed = new THREE.MeshLambertMaterial({ vertexColors: true });

    // HTML labels
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
    this.quality = q;
    this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, this.quality === 'high' ? 2 : this.quality === 'medium' ? 1.5 : 1);
    this.gl.setPixelRatio(pr);
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.75 ? 62 : 50;
    this.camera.updateProjectionMatrix();
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
    const world = sim.world;
    const scene = this.scene;
    scene.background = new THREE.Color(world.sky);
    scene.fog = new THREE.Fog(world.fog, world.fogNear, world.fogFar);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x445566, 1.6 * world.light);
    const sun = new THREE.DirectionalLight(0xffffff, 1.6 * world.light);
    sun.position.set(-6, 14, 6);
    scene.add(hemi, sun);
    this.root = new THREE.Group();
    scene.add(this.root);
    this.buildEnvironment(world, sim.level.length + 120);

    // army
    this.army = this.makeCrowd(MAX_ARMY_DRAW, BLUE);
    this.armyPos = Array.from({ length: MAX_ARMY_DRAW }, () => ({ x: 0, z: 0, ph: Math.random() * 6.28 }));
    this.enemies = this.makeCrowd(MAX_ENEMY_DRAW, new THREE.Color(world.enemy));
    this.heroes = [];

    // projectiles
    const pg = new THREE.BoxGeometry(0.09, 0.09, 0.9);
    this.projMesh = new THREE.InstancedMesh(pg, new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_PROJ);
    this.projMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.projMesh.frustumCulled = false;
    this.projMesh.setColorAt(0, tmpC.set(0xffffff));
    this.root.add(this.projMesh);

    // particles
    this.parts = [];
    this.partMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_PARTS);
    this.partMesh.frustumCulled = false;
    this.partMesh.setColorAt(0, tmpC.set(0xffffff));
    this.root.add(this.partMesh);

    // tesla arcs
    this.arcGeo = new THREE.BufferGeometry();
    this.arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 2 * 8 * 3), 3));
    this.arcLines = new THREE.LineSegments(this.arcGeo, new THREE.LineBasicMaterial({ color: 0xaee8ff, transparent: true }));
    this.arcLines.frustumCulled = false;
    this.root.add(this.arcLines);
    this.arcs = [];

    // entities
    this.views = new Map();
    for (const e of sim.ents) this.views.set(e.id, this.buildEntity(e, world));
    this.bossBar.classList.add('hidden');
    this.bossBar.querySelector('.boss-name').textContent = world.boss.name;
  }

  dispose() {
    if (!this.root) return;
    this.scene.traverse((o) => {
      if (o.geometry && o.geometry !== this.soldierTinted && o.geometry !== this.soldierFixed) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (m === this.matTinted || m === this.matFixed) continue;
          if (m.map) m.map.dispose();
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

  // ------------------------------------------------------------------ environment
  buildEnvironment(world, len) {
    const root = this.root;
    const lam = (hex, extra = {}) => new THREE.MeshLambertMaterial({ color: hex, ...extra });
    const trackW = HW * 2 + 1.2;
    const track = new THREE.Mesh(new THREE.BoxGeometry(trackW, 0.6, len + 60), lam(world.track));
    track.position.set(0, -0.3, -len / 2 + 20);
    root.add(track);
    // lane dashes
    const dashGeo = [];
    for (let z = 10; z > -len; z -= 6) {
      for (const x of [-HW / 3 * 1, HW / 3 * 1]) dashGeo.push(new THREE.BoxGeometry(0.12, 0.02, 2.4).translate(x, 0.01, z));
    }
    root.add(new THREE.Mesh(mergeGeometries(dashGeo), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 })));
    // rails
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.7, len + 60), lam(world.rail));
      rail.position.set(s * (trackW / 2 + 0.1), 0.2, -len / 2 + 20);
      root.add(rail);
    }
    // ground / water / lava / clouds below
    const groundY = world.props === 'bridge' || world.props === 'sky' ? -14 : world.props === 'volcano' ? -3 : -0.65;
    const groundMat = world.props === 'volcano'
      ? new THREE.MeshBasicMaterial({ color: world.ground })
      : lam(world.ground);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, len + 400), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, groundY, -len / 2);
    root.add(ground);
    if (world.props === 'volcano' || world.props === 'temple' || world.props === 'sky' || world.props === 'bridge') {
      // support pillars under the track
      const pg = [];
      for (let z = 0; z > -len; z -= 40) pg.push(new THREE.BoxGeometry(2, Math.abs(groundY), 2).translate(0, groundY / 2 - 0.3, z));
      root.add(new THREE.Mesh(mergeGeometries(pg), lam(world.props === 'bridge' ? world.rail : 0x4a4440)));
    }
    this.addProps(world, len);
    this.addAmbient(world);
  }

  addProps(world, len) {
    const root = this.root;
    const lam = (hex, extra = {}) => new THREE.MeshLambertMaterial({ color: hex, ...extra });
    const basic = (hex) => new THREE.MeshBasicMaterial({ color: hex });
    const merged = (geos, mat) => { if (geos.length) root.add(new THREE.Mesh(mergeGeometries(geos), mat)); };
    const rnd = mulberry(len | 0);
    const side = () => (rnd() < 0.5 ? -1 : 1);
    const G = THREE;
    switch (world.props) {
      case 'bridge': {
        const towers = [], cables = [];
        for (let z = -20; z > -len; z -= 140) {
          for (const s of [-1, 1]) {
            towers.push(new G.BoxGeometry(1.6, 34, 1.6).translate(s * 8, 3, z));
            towers.push(new G.BoxGeometry(1.6, 34, 1.6).translate(s * 8, 3, z - 4));
            for (const y of [8, 14, 19]) towers.push(new G.BoxGeometry(1.4, 1.2, 5.6).translate(s * 8, y, z - 2));
          }
          towers.push(new G.BoxGeometry(17.6, 1.6, 1.6).translate(0, 19.5, z - 2));
        }
        for (let z = -20; z > -len - 140; z -= 140) {
          for (const s of [-1, 1]) {
            // main cable as a sagging chain of segments between towers
            let px = s * 8, py = 19, pz = z - 2;
            for (let k = 1; k <= 14; k++) {
              const t = k / 14;
              const nz = z - 2 - t * 140;
              const ny = 19 - Math.sin(t * Math.PI) * 15;
              const seg = new G.CylinderGeometry(0.22, 0.22, 1, 6);
              const dz = nz - pz, dy = ny - py;
              const l = Math.hypot(dz, dy);
              seg.scale(1, l, 1);
              seg.rotateX(Math.atan2(dz, dy) * -1 + Math.PI);
              seg.translate(px, (py + ny) / 2, (pz + nz) / 2);
              cables.push(seg);
              if (k < 14) cables.push(new G.CylinderGeometry(0.06, 0.06, ny, 4).translate(s * 7.4, ny / 2, nz));
              py = ny; pz = nz;
            }
          }
        }
        merged(towers, lam(world.rail));
        merged(cables, lam(0xb8332c));
        break;
      }
      case 'desert': {
        const mesas = [], cacti = [];
        for (let z = 0; z > -len; z -= 18) {
          const s = side();
          const h = 6 + rnd() * 18;
          mesas.push(new G.CylinderGeometry(4 + rnd() * 5, 6 + rnd() * 6, h, 7).translate(s * (18 + rnd() * 30), h / 2 - 0.6, z));
          const cx = side() * (8 + rnd() * 6);
          cacti.push(new G.CylinderGeometry(0.35, 0.4, 3, 6).translate(cx, 0.9, z - 9));
          cacti.push(new G.CylinderGeometry(0.22, 0.22, 1.2, 6).rotateZ(Math.PI / 2).translate(cx + 0.5, 1.4, z - 9));
          cacti.push(new G.CylinderGeometry(0.22, 0.22, 1, 6).translate(cx + 1.05, 1.9, z - 9));
        }
        merged(mesas, lam(0xc0703a));
        merged(cacti, lam(0x3f8f3a));
        break;
      }
      case 'temple': {
        const stone = [], moss = [], fire = [];
        for (let z = 0; z > -len; z -= 14) {
          for (const s of [-1, 1]) {
            const h = 7 + rnd() * 9;
            const x = s * (8.5 + rnd() * 3);
            stone.push(new G.BoxGeometry(2.2, h, 2.2).translate(x, h / 2 - 0.6, z));
            stone.push(new G.BoxGeometry(3, 0.8, 3).translate(x, h - 0.4, z));
            moss.push(new G.BoxGeometry(2.3, 1.2, 2.3).translate(x, h * (0.3 + rnd() * 0.4), z));
            if (rnd() < 0.5) {
              stone.push(new G.BoxGeometry(0.3, 1.6, 0.3).translate(s * 6.9, 0.8, z - 7));
              fire.push(new G.SphereGeometry(0.35, 6, 5).translate(s * 6.9, 1.9, z - 7));
            }
          }
          if (rnd() < 0.3) stone.push(new G.BoxGeometry(22, 1.6, 2).translate(0, 15, z));
        }
        merged(stone, lam(0x6d6656));
        merged(moss, lam(0x3e6b2f));
        merged(fire, basic(0xffa040));
        break;
      }
      case 'frozen': {
        const ice = [], pine = [], snow = [];
        for (let z = 0; z > -len; z -= 9) {
          const s = side();
          const x = s * (9 + rnd() * 20);
          const h = 3 + rnd() * 6;
          pine.push(new G.ConeGeometry(1.4, h, 7).translate(x, h / 2 + 0.6, z));
          snow.push(new G.ConeGeometry(0.8, h * 0.4, 7).translate(x, h * 0.85 + 0.6, z));
          const ix = -s * (8 + rnd() * 10);
          const ih = 2 + rnd() * 7;
          ice.push(new G.ConeGeometry(0.7 + rnd(), ih, 5).translate(ix, ih / 2 - 0.6, z - 4));
          if (rnd() < 0.15) {
            const mh = 30 + rnd() * 30;
            snow.push(new G.ConeGeometry(18, mh, 6).translate(side() * (60 + rnd() * 40), mh / 2 - 1, z));
          }
        }
        merged(ice, lam(0x9fd8ff, { transparent: true, opacity: 0.85 }));
        merged(pine, lam(0x2e6b4f));
        merged(snow, lam(0xffffff));
        break;
      }
      case 'volcano': {
        const rock = [], glow = [];
        for (let z = 0; z > -len; z -= 12) {
          const s = side();
          const h = 5 + rnd() * 16;
          const x = s * (10 + rnd() * 25);
          rock.push(new G.ConeGeometry(2 + rnd() * 3, h, 6).translate(x, h / 2 - 3, z));
          glow.push(new G.BoxGeometry(0.4, h * 0.6, 0.4).translate(x + 0.6, h * 0.2 - 3, z + 1.6));
          if (rnd() < 0.08) {
            rock.push(new G.CylinderGeometry(10, 40, 70, 9).translate(side() * 110, 32, z));
          }
        }
        merged(rock, lam(0x2a1f1d));
        merged(glow, basic(0xff7a1a));
        break;
      }
      case 'neon': {
        const bld = [], win = [];
        const neonCols = [0xff2bd6, 0x2bf0ff, 0x7a5cff, 0xffd02b];
        const winGeos = neonCols.map(() => []);
        for (let z = 0; z > -len; z -= 10) {
          for (const s of [-1, 1]) {
            const h = 10 + rnd() * 45;
            const w = 5 + rnd() * 5;
            const x = s * (12 + w / 2 + rnd() * 8);
            bld.push(new G.BoxGeometry(w, h, 8).translate(x, h / 2 - 0.6, z));
            const ci = Math.floor(rnd() * neonCols.length);
            for (let y = 3; y < h - 2; y += 3 + Math.floor(rnd() * 3)) winGeos[ci].push(new G.BoxGeometry(0.1, 0.3, 7).translate(x - s * (w / 2 + 0.06), y, z));
          }
        }
        merged(bld, lam(0x14122a));
        winGeos.forEach((g, i) => merged(g, basic(neonCols[i])));
        void win;
        break;
      }
      case 'sky': {
        const cloud = [], island = [], grass = [], pole = [];
        for (let z = 0; z > -len; z -= 16) {
          for (let k = 0; k < 2; k++) {
            const x = side() * (10 + rnd() * 40);
            const y = -8 - rnd() * 6;
            for (let j = 0; j < 4; j++) cloud.push(new G.SphereGeometry(3 + rnd() * 3, 7, 5).translate(x + j * 3, y + rnd() * 2, z + rnd() * 4));
          }
          if (rnd() < 0.35) {
            const x = side() * (20 + rnd() * 30);
            const y = 2 + rnd() * 10;
            island.push(new G.ConeGeometry(5, 9, 7).rotateX(Math.PI).translate(x, y - 4.5, z));
            grass.push(new G.CylinderGeometry(5, 5, 1, 7).translate(x, y + 0.5, z));
          }
          for (const s of [-1, 1]) pole.push(new G.CylinderGeometry(0.12, 0.12, 4, 5).translate(s * 6.6, 2, z));
        }
        merged(cloud, lam(0xffffff));
        merged(island, lam(0x8a6a4a));
        merged(grass, lam(0x5fbf4a));
        merged(pole, lam(0xe0c060));
        break;
      }
      case 'lunar': {
        const crater = [], dome = [], rock = [];
        for (let z = 0; z > -len; z -= 12) {
          const x = side() * (10 + rnd() * 40);
          crater.push(new G.TorusGeometry(2 + rnd() * 4, 0.5, 5, 14).rotateX(Math.PI / 2).translate(x, -0.6, z));
          rock.push(new G.DodecahedronGeometry(0.6 + rnd() * 1.5).translate(side() * (8 + rnd() * 12), -0.2, z - 6));
          if (rnd() < 0.15) dome.push(new G.SphereGeometry(5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(side() * (25 + rnd() * 20), -0.6, z));
        }
        merged(crater, lam(0x6a6a70));
        merged(rock, lam(0x77777f));
        merged(dome, lam(0xcfe8ff, { transparent: true, opacity: 0.6 }));
        const earth = new THREE.Mesh(new THREE.SphereGeometry(30, 24, 16), new THREE.MeshBasicMaterial({ color: 0x3a7bff }));
        earth.position.set(-90, 70, -260);
        this.followers = [earth];
        root.add(earth);
        break;
      }
    }
  }

  addAmbient(world) {
    // Floating particles that follow the camera: snow, embers, sand, stars.
    const kind = { frozen: [0xffffff, 0.25, -3], volcano: [0xff8a2a, 0.18, 2], desert: [0xf5d39b, 0.12, -0.5], lunar: [0xffffff, 0.3, 0], temple: [0x9cff8a, 0.12, 0.3], neon: [0xff6ae6, 0.12, 0.6] }[world.props];
    this.ambient = null;
    if (!kind) return;
    const n = world.props === 'lunar' ? 900 : 500;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 80;
      pos[i * 3 + 1] = world.props === 'lunar' ? 30 + Math.random() * 90 : Math.random() * 25;
      pos[i * 3 + 2] = -Math.random() * 120 + 20;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: kind[0], size: kind[1], transparent: true, opacity: 0.85, fog: world.props !== 'lunar' }));
    pts.frustumCulled = false;
    this.root.add(pts);
    this.ambient = { pts, fall: kind[2], lunar: world.props === 'lunar' };
  }

  // ------------------------------------------------------------------ entities
  buildEntity(e, world) {
    const g = new THREE.Group();
    g.position.set(0, 0, -e.d);
    const v = { g, e };
    switch (e.type) {
      case 'gate': {
        const w = e.x1 - e.x0;
        const cx = (e.x0 + e.x1) / 2;
        const canvas = textCanvas(256, 160);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.3, 2.6), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }));
        panel.position.set(cx, 1.7, 0);
        const posts = new THREE.Mesh(mergeGeometries([
          new THREE.BoxGeometry(0.25, 3.2, 0.25).translate(e.x0 + 0.15, 1.6, 0),
          new THREE.BoxGeometry(0.25, 3.2, 0.25).translate(e.x1 - 0.15, 1.6, 0),
        ]), new THREE.MeshLambertMaterial({ color: 0xeeeeee }));
        g.add(panel, posts);
        Object.assign(v, { canvas, tex, panel, posts });
        this.drawGate(v);
        break;
      }
      case 'board': case 'hero': {
        const w = e.x1 - e.x0;
        const cx = (e.x0 + e.x1) / 2;
        const canvas = textCanvas(256, 200);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        const panel = new THREE.Mesh(new THREE.BoxGeometry(w - 0.3, 3.4, 0.3), [
          new THREE.MeshLambertMaterial({ color: 0xffffff }), new THREE.MeshLambertMaterial({ color: 0xffffff }),
          new THREE.MeshLambertMaterial({ color: 0xffffff }), new THREE.MeshLambertMaterial({ color: 0xffffff }),
          new THREE.MeshBasicMaterial({ map: tex }), new THREE.MeshLambertMaterial({ color: 0xdddddd }),
        ]);
        panel.position.set(cx, 1.75, 0);
        g.add(panel);
        Object.assign(v, { canvas, tex, panel });
        this.drawBoard(v);
        break;
      }
      case 'cage': {
        const cx = (e.x0 + e.x1) / 2;
        const bars = [];
        const w = e.x1 - e.x0 - 0.6;
        for (let i = 0; i <= 8; i++) bars.push(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 5).translate(cx - w / 2 + (w * i) / 8, 1.2, 0.8));
        for (let i = 0; i <= 8; i++) bars.push(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 5).translate(cx - w / 2 + (w * i) / 8, 1.2, -0.8));
        bars.push(new THREE.BoxGeometry(w + 0.2, 0.15, 1.8).translate(cx, 2.4, 0));
        bars.push(new THREE.BoxGeometry(w + 0.2, 0.15, 1.8).translate(cx, 0.05, 0));
        const cage = new THREE.Mesh(mergeGeometries(bars), new THREE.MeshLambertMaterial({ color: 0x8a6a3a }));
        g.add(cage);
        // prisoners
        const pris = new THREE.Group();
        const k = Math.min(10, e.allies);
        for (let i = 0; i < k; i++) {
          const t = new THREE.Mesh(this.soldierTinted, new THREE.MeshLambertMaterial({ vertexColors: true, color: BLUE }));
          const f = new THREE.Mesh(this.soldierFixed, this.matFixed);
          const s = new THREE.Group();
          s.add(t, f);
          s.position.set(cx - w / 2 + 0.4 + ((w - 0.8) * i) / Math.max(1, k - 1), 0.1, (i % 2) * 0.6 - 0.3);
          s.scale.setScalar(1.1);
          pris.add(s);
        }
        g.add(pris);
        v.label = this.makeLabel('ent-label cage-label');
        v.labelY = 3.4;
        v.labelX = cx;
        this.squadLabels.push(v.label);
        break;
      }
      case 'wall': {
        const w = e.x1 - e.x0;
        const cx = (e.x0 + e.x1) / 2;
        const canvas = textCanvas(256, 128);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        const col = { temple: 0x7a6e58, frozen: 0xbfe6ff, volcano: 0x4a3530, neon: 0x3a3456, lunar: 0x7a7c86, desert: 0xb27a42 }[world.props] || 0x9a8a7a;
        const side = new THREE.MeshLambertMaterial({ color: col });
        const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 2.4, 1), [side, side, side, side, new THREE.MeshBasicMaterial({ map: tex }), side]);
        wall.position.set(cx, 1.2, 0);
        g.add(wall);
        Object.assign(v, { canvas, tex, wallColor: col });
        this.drawWall(v);
        break;
      }
      case 'barrel': {
        const cx = (e.x0 + e.x1) / 2;
        const b = new THREE.Mesh(mergeGeometries([
          cyl(0.65, 0.65, 1.5, cx, 0.75, 0, 0xd82a1a, 12),
          cyl(0.68, 0.68, 0.12, cx, 0.35, 0, 0x333333, 12),
          cyl(0.68, 0.68, 0.12, cx, 1.15, 0, 0x333333, 12),
          box(0.5, 0.5, 0.05, cx, 0.75, 0.66, 0xffd000),
        ]), new THREE.MeshLambertMaterial({ vertexColors: true }));
        g.add(b);
        break;
      }
      case 'coin': {
        const cx = (e.x0 + e.x1) / 2;
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.12, 16).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xffc81a, emissive: 0x6a4a00 }));
        c.position.set(cx, 0.9, 0);
        g.add(c);
        v.spin = c;
        break;
      }
      case 'saw': {
        const saw = new THREE.Group();
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(e.half, e.half, 0.15, 20).rotateZ(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xbfc4cc }));
        const teeth = [];
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          teeth.push(new THREE.ConeGeometry(0.16, 0.4, 4).rotateX(Math.PI / 2).rotateY(Math.PI / 2).translate(0, 0, e.half + 0.1).rotateX(a));
        }
        const t = new THREE.Mesh(mergeGeometries(teeth), new THREE.MeshLambertMaterial({ color: 0x8a8f99 }));
        saw.add(disc, t);
        saw.position.y = e.half + 0.05;
        const railM = new THREE.Mesh(new THREE.BoxGeometry(HW * 2, 0.1, 0.4), new THREE.MeshLambertMaterial({ color: 0x333333 }));
        railM.position.y = 0.05;
        g.add(saw, railM);
        v.spin = saw;
        break;
      }
      case 'boulder': {
        const b = new THREE.Mesh(new THREE.DodecahedronGeometry(e.half, 1), new THREE.MeshLambertMaterial({ color: 0x7a6e58, flatShading: true }));
        b.position.y = e.half;
        g.add(b);
        v.spin = b;
        break;
      }
      case 'geyser': {
        const cx = (e.x0 + e.x1) / 2;
        const w = e.x1 - e.x0;
        const pool = new THREE.Mesh(new THREE.BoxGeometry(w - 0.4, 0.05, 2.6), new THREE.MeshBasicMaterial({ color: 0xff5a10 }));
        pool.position.set(cx, 0.03, 0);
        const col = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.3, w * 0.42, 6, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xffa020, transparent: true, opacity: 0.85 }));
        col.position.set(cx, 3, 0);
        g.add(pool, col);
        v.col = col;
        break;
      }
      case 'squad': {
        v.label = this.makeLabel('ent-label enemy-label');
        this.squadLabels.push(v.label);
        break;
      }
      case 'boss': {
        const b = buildBoss(world.boss);
        g.add(b.group);
        Object.assign(v, b);
        break;
      }
    }
    this.root.add(g);
    if (e.type !== 'boss' && e.type !== 'squad') g.visible = true;
    return v;
  }

  drawGate(v) {
    const { canvas, e } = v;
    const ctx = canvas.getContext('2d');
    const good = e.op === '+' || e.op === 'x' || e.op === 'rate' || e.op === 'dmg';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const grd = ctx.createLinearGradient(0, 0, 0, canvas.height);
    if (good) { grd.addColorStop(0, 'rgba(60,150,255,0.85)'); grd.addColorStop(1, 'rgba(20,90,230,0.85)'); }
    else { grd.addColorStop(0, 'rgba(255,80,80,0.85)'); grd.addColorStop(1, 'rgba(200,20,30,0.85)'); }
    if (e.op === 'rate' || e.op === 'dmg') { grd.addColorStop(0, 'rgba(255,200,40,0.9)'); grd.addColorStop(1, 'rgba(230,140,10,0.9)'); }
    roundRect(ctx, 4, 4, canvas.width - 8, canvas.height - 8, 18);
    ctx.fillStyle = grd;
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.stroke();
    let txt;
    if (e.op === 'rate') txt = `+${e.v}%`;
    else if (e.op === 'dmg') txt = `+${e.v}%`;
    else if (e.op === 'x') txt = `x${e.v}`;
    else if (e.op === '÷') txt = `÷${e.v}`;
    else txt = `${e.op}${e.v}`;
    outlinedText(ctx, txt, 128, e.op === 'rate' || e.op === 'dmg' ? 66 : 82, txt.length > 4 ? 64 : 82);
    if (e.op === 'rate' || e.op === 'dmg') outlinedText(ctx, e.op === 'rate' ? 'FIRE RATE' : 'DAMAGE', 128, 128, 30);
    v.tex.needsUpdate = true;
  }

  drawBoard(v) {
    const { canvas, e } = v;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#d8d8d8';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
    if (e.type === 'board') {
      const w = weaponById[e.weapon];
      drawWeaponIcon(ctx, w, 28, 26, 200, 92);
      outlinedText(ctx, w.name.toUpperCase(), 128, 128, 20, '#ffd23a', '#222');
    } else {
      drawHeroIcon(ctx, 128, 70, 1);
      outlinedText(ctx, 'HERO', 128, 128, 20, '#ffd23a', '#222');
    }
    outlinedText(ctx, fmt(Math.ceil(e.hp)), 128, 168, 46);
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

  // ------------------------------------------------------------------ events → effects
  handleEvents(events, popText) {
    const sim = this.sim;
    for (const ev of events) {
      switch (ev.type) {
        case 'hit': {
          const w = weaponById[ev.w];
          this.burst(ev.x, 1 + Math.random() * 0.6, -ev.d, w.color, w.splash ? 6 : 2, 4, 0.25);
          break;
        }
        case 'boom':
          this.burst(ev.x, 1, -ev.d, 0xff8a2a, 26, 10, 0.6);
          this.burst(ev.x, 1, -ev.d, 0x555555, 10, 6, 0.8);
          this.shake = Math.max(this.shake, 0.25);
          break;
        case 'arc':
          this.arcs.push({ x0: ev.x0, d0: ev.d0, x1: ev.x1, d1: ev.d1, life: 0.12 });
          break;
        case 'kill': {
          const v = this.views.get(ev.e.id);
          if (v) this.burst(ev.e.x, 0.8, -ev.e.d, sim.world.enemy, Math.min(8, ev.k * 2), 5, 0.5);
          break;
        }
        case 'destroy': {
          const v = this.views.get(ev.e.id);
          if (!v) break;
          const cx = ev.e.x0 !== undefined ? (ev.e.x0 + ev.e.x1) / 2 : 0;
          this.burst(cx, 1.5, -ev.e.d, ev.e.type === 'barrel' ? 0xff5a1a : 0xffffff, 24, 9, 0.8);
          break;
        }
        case 'crash': {
          const cx = ev.e.x0 !== undefined && ev.e.x1 !== ev.e.x0 ? (ev.e.x0 + ev.e.x1) / 2 : sim.x;
          this.burst(cx, 1.2, -ev.e.d, 0xdddddd, 20, 7, 0.7);
          this.shake = Math.max(this.shake, 0.3);
          break;
        }
        case 'gate': {
          const e = ev.e;
          const txt = e.op === 'rate' ? `FIRE RATE +${e.v}%` : e.op === 'dmg' ? `DAMAGE +${e.v}%` : (ev.delta >= 0 ? '+' : '') + fmt(ev.delta).replace(/^0$/, '0');
          popText(ev.delta < 0 ? `${ev.delta}` : txt, ev.good ? 'good' : 'bad', sim.x, 2.5, -sim.d);
          break;
        }
        case 'weapon':
          popText(ev.w.name.toUpperCase() + '!', 'weapon', sim.x, 3, -sim.d);
          break;
        case 'powerup':
          popText(ev.text, 'good', sim.x, 3, -sim.d);
          break;
        case 'hero':
          popText('HERO JOINED!', 'weapon', sim.x, 3, -sim.d);
          break;
        case 'allies':
          popText(`+${ev.k} FREED`, 'good', sim.x, 3, -sim.d);
          break;
        case 'gateFlip': {
          const v = this.views.get(ev.e.id);
          if (v) this.burst((ev.e.x0 + ev.e.x1) / 2, 1.7, -ev.e.d, 0x4aa0ff, 20, 6, 0.6);
          break;
        }
        case 'coin':
          popText(`+${ev.e.value}`, 'coin', (ev.e.x0 + ev.e.x1) / 2, 1.5, -ev.e.d);
          break;
        case 'stomp':
          this.shake = Math.max(this.shake, 0.6);
          this.burst(sim.x, 0.3, -sim.d - 1, 0xbbbbbb, 30, 10, 0.7);
          if (this.views.get(ev.e.id)) this.views.get(ev.e.id).stompAnim = 0.5;
          break;
        case 'burn':
          this.burst(sim.x, 0.5, -sim.d, 0xff6a1a, 24, 8, 0.6);
          break;
        case 'bossDown': {
          const v = this.views.get(ev.e.id);
          this.burst(0, 3, -ev.e.d, 0xff8a2a, 80, 14, 1.2);
          this.burst(0, 3, -ev.e.d, sim.world.boss.color, 60, 12, 1.4);
          this.shake = 1;
          if (v) v.dying = 1;
          break;
        }
        case 'lose':
          if (ev.k > 0) this.burst(sim.x, 0.6, -sim.d, 0x2f7bff, Math.min(10, ev.k), 5, 0.5);
          break;
      }
    }
  }

  burst(x, y, z, color, count, speed, life) {
    for (let i = 0; i < count && this.parts.length < MAX_PARTS; i++) {
      this.parts.push({
        x, y, z,
        vx: (Math.random() - 0.5) * speed, vy: Math.random() * speed * 0.8, vz: (Math.random() - 0.5) * speed,
        life: life * (0.6 + Math.random() * 0.6), max: life, color, s: 0.5 + Math.random() * 0.9,
      });
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

    // ---- army
    const n = Math.min(MAX_ARMY_DRAW, Math.max(0, Math.round(sim.n)));
    const c = n > 1 ? (R * 0.95) / Math.sqrt(n) : 0;
    const running = sim.state === 'run' && !sim.clashing;
    for (let i = 0; i < n; i++) {
      const p = this.armyPos[i];
      const r = c * Math.sqrt(i + 0.5);
      const th = i * 2.39996;
      const tx = sim.x + Math.cos(th) * r;
      const tz = armyZ + Math.sin(th) * r * 0.85;
      if (p.fresh === undefined || p.fresh > 1) { p.x = sim.x; p.z = armyZ; }
      p.fresh = 0;
      p.x += (tx - p.x) * Math.min(1, dt * 8);
      p.z = tz + (p.z - tz) * Math.max(0, 1 - dt * 8);
      const bob = running ? Math.abs(Math.sin(t * 11 + p.ph)) * 0.12 : 0;
      tmpE.set(running ? Math.sin(t * 11 + p.ph) * 0.06 : 0, 0, 0);
      tmpQ.setFromEuler(tmpE);
      tmpM.compose(tmpP.set(p.x, bob, p.z), tmpQ, tmpS.set(1, 1, 1));
      this.army.t.setMatrixAt(i, tmpM);
      this.army.f.setMatrixAt(i, tmpM);
    }
    for (let i = n; i < MAX_ARMY_DRAW; i++) this.armyPos[i].fresh = 2;
    this.army.t.count = n;
    this.army.f.count = n;
    this.army.t.instanceMatrix.needsUpdate = true;
    this.army.f.instanceMatrix.needsUpdate = true;

    // ---- heroes
    while (this.heroes.length < sim.heroes) {
      const h = buildHero();
      this.root.add(h);
      this.heroes.push(h);
    }
    while (this.heroes.length > sim.heroes) this.root.remove(this.heroes.pop());
    this.heroes.forEach((h, i) => {
      h.position.set(sim.heroX(i), running ? Math.abs(Math.sin(t * 9 + i)) * 0.15 : 0, armyZ + 0.6);
    });

    // ---- enemies + entities
    let ei = 0;
    const camZ = this.camera.position.z;
    let bossVisible = false;
    for (const v of this.views.values()) {
      const e = v.e;
      const dz = -e.d - camZ;
      const inView = dz < 20 && dz > -200;
      if (e.type === 'squad') {
        const show = e.alive && inView;
        if (v.label) {
          if (show) this.placeLabel(v.label, e.x, 1.6 + armyRadius(e.m) * 0.25, -e.d, fmt(e.m));
          else v.label.style.display = 'none';
        }
        if (!show) continue;
        const m = Math.min(e.m, 160, MAX_ENEMY_DRAW - ei);
        const r = armyRadius(e.m);
        const cc = m > 1 ? (r * 0.95) / Math.sqrt(m) : 0;
        const moving = e.d - sim.d < 34 && !e.contact;
        for (let k = 0; k < m; k++) {
          const rr = cc * Math.sqrt(k + 0.5);
          const th = k * 2.39996;
          const bob = moving ? Math.abs(Math.sin(t * 11 + k)) * 0.12 : Math.abs(Math.sin(t * 3 + k)) * 0.03;
          tmpQ.setFromAxisAngle(tmpP.set(0, 1, 0), Math.PI);
          tmpM.compose(tmpP.set(e.x + Math.cos(th) * rr, bob, -e.d + Math.sin(th) * rr * 0.85), tmpQ, tmpS.set(1, 1, 1));
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
      // static entities
      if (!e.alive && v.g.visible) {
        v.g.visible = false;
      }
      if (v.label) {
        if (e.alive && inView) this.placeLabel(v.label, v.labelX, v.labelY, -e.d, `${fmt(Math.ceil(e.hp))}<small>FREE +${e.allies}</small>`);
        else v.label.style.display = 'none';
      }
      if (!e.alive || !inView) continue;
      if (e.dirty) {
        e.dirty = false;
        if (e.type === 'gate') this.drawGate(v);
        else if (e.type === 'board' || e.type === 'hero') this.drawBoard(v);
        else if (e.type === 'wall') this.drawWall(v);
      }
      if (e.type === 'coin') v.spin.rotation.y += dt * 4;
      else if (e.type === 'saw') {
        v.spin.position.x = sim.hazardX(e);
        v.spin.rotation.x += dt * 14;
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
      }
    }
    this.enemies.t.count = ei;
    this.enemies.f.count = ei;
    this.enemies.t.instanceMatrix.needsUpdate = true;
    this.enemies.f.instanceMatrix.needsUpdate = true;

    // ---- boss bar
    const b = sim.boss;
    if (bossVisible && b.alive) {
      this.bossBar.classList.remove('hidden');
      this.bossBar.querySelector('.boss-fill').style.width = `${(b.hp / b.maxHp) * 100}%`;
      this.bossBar.querySelector('.boss-hp').textContent = fmt(Math.ceil(b.hp));
    } else this.bossBar.classList.add('hidden');

    // ---- projectiles
    let pi = 0;
    for (const p of sim.proj) {
      if (pi >= MAX_PROJ) break;
      const w = p.w;
      tmpQ.identity();
      const sc = w.size * (p.hero ? 1.3 : 1);
      tmpM.compose(tmpP.set(p.x, 0.65 + (p.hero ? 0.5 : 0), -p.d), tmpQ, tmpS.set(sc, sc, sc * (w.speed > 100 ? 2.2 : 1)));
      this.projMesh.setMatrixAt(pi, tmpM);
      this.projMesh.setColorAt(pi, tmpC.set(w.color));
      pi++;
    }
    this.projMesh.count = pi;
    this.projMesh.instanceMatrix.needsUpdate = true;
    if (this.projMesh.instanceColor) this.projMesh.instanceColor.needsUpdate = true;

    // ---- particles
    let k = 0;
    this.parts = this.parts.filter((p) => (p.life -= dt) > 0);
    for (const p of this.parts) {
      p.vy -= 18 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.1) { p.y = 0.1; p.vy *= -0.3; p.vx *= 0.7; p.vz *= 0.7; }
      const s = p.s * Math.min(1, p.life / p.max * 2);
      tmpQ.identity();
      tmpM.compose(tmpP.set(p.x, p.y, p.z), tmpQ, tmpS.set(s, s, s));
      this.partMesh.setMatrixAt(k, tmpM);
      this.partMesh.setColorAt(k, tmpC.set(p.color));
      k++;
    }
    this.partMesh.count = k;
    this.partMesh.instanceMatrix.needsUpdate = true;
    if (this.partMesh.instanceColor) this.partMesh.instanceColor.needsUpdate = true;

    // ---- arcs
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

    // ---- ambient particles
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

    // ---- army label
    this.placeLabel(this.armyLabel, sim.x, 1.7 + R * 0.25, armyZ, fmt(sim.n) + (sim.heroes ? ` <small>+${sim.heroes}★</small>` : ''));

    // ---- camera
    const fight = !b.alive || b.d - sim.d < 26;
    const camX = sim.x * 0.55;
    const back = fight ? 15 : 12.5;
    const height = fight ? 12 : 10.5;
    const cam = this.camera.position;
    const target = tmpP.set(camX, height, armyZ + back);
    if (!this.camInit) { cam.copy(target); this.camInit = true; } else cam.lerp(target, Math.min(1, dt * 5));
    this.shake = Math.max(0, this.shake - dt * 2);
    const sh = this.shake * this.shake;
    this.camera.lookAt(camX * 0.8 + (Math.random() - 0.5) * sh, 0 + (Math.random() - 0.5) * sh, armyZ - 14);

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
    if (v.stompAnim > 0) {
      v.stompAnim -= dt;
      const k = Math.sin((1 - v.stompAnim / 0.5) * Math.PI);
      v.armL.rotation.x = -k * 2.2;
      v.armR.rotation.x = -k * 2.2;
    } else {
      v.armL.rotation.x = -sw * 0.6;
      v.armR.rotation.x = sw * 0.6;
    }
    if (v.dying > 0) {
      v.dying -= dt * 0.8;
      v.group.rotation.x = -(1 - Math.max(0, v.dying)) * 1.5;
      v.group.position.y = -(1 - Math.max(0, v.dying)) * 2;
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

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildHero() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const body = mergeGeometries([
    box(0.2, 0.5, 0.22, -0.13, 0.25, 0, 0x2a4f9a),
    box(0.2, 0.5, 0.22, 0.13, 0.25, 0, 0x2a4f9a),
    box(0.62, 0.62, 0.38, 0, 0.82, 0, 0x2f7bff),
    box(0.66, 0.1, 0.4, 0, 0.62, 0, 0xffc81a),
    box(0.1, 0.62, 0.42, 0.1, 0.85, 0, 0xffc81a),
    box(0.17, 0.5, 0.2, -0.4, 0.85, -0.1, 0x2f7bff),
    sph(0.17, 0, 1.3, 0, 0x8a5a3a),
    sph(0.21, 0, 1.38, 0, 0x2f7bff, 8, 5),
    box(0.5, 0.05, 0.5, 0, 1.36, 0, 0xffc81a),
    box(0.3, 0.3, 0.5, 0.36, 0.72, -0.1, 0x333333),
  ]);
  g.add(new THREE.Mesh(body, mat));
  // minigun barrels pointing forward (-z)
  const gun = new THREE.Group();
  const barrels = mergeGeometries([0, 1, 2, 3, 4, 5].map((i) => cyl(0.035, 0.035, 0.95, Math.cos(i) * 0.09, Math.sin(i) * 0.09, 0, 0x555555, 5).rotateX(Math.PI / 2)));
  gun.add(new THREE.Mesh(barrels, mat));
  gun.position.set(0.36, 0.72, -0.6);
  g.add(gun);
  g.scale.setScalar(1.7);
  return g;
}

function buildBoss(cfg) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: cfg.color, flatShading: true });
  const acc = new THREE.MeshLambertMaterial({ color: cfg.accent, flatShading: true });
  const eye = new THREE.MeshBasicMaterial({ color: cfg.eye });
  const S = 1;
  const mk = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); return o; };
  const torso = cfg.mech
    ? mk(new THREE.BoxGeometry(3.6, 3, 2.4), mat, 0, 5.2, 0)
    : mk(new THREE.DodecahedronGeometry(1.9, 1), mat, 0, 5.2, 0);
  if (!cfg.mech) torso.scale.set(1.15, 1.05, 0.8);
  const belt = mk(new THREE.BoxGeometry(3.4, 0.6, 2.2), acc, 0, 3.8, 0);
  const head = cfg.mech ? mk(new THREE.BoxGeometry(1.6, 1.1, 1.4), acc, 0, 7.3, 0) : mk(new THREE.SphereGeometry(0.95, 10, 8), mat, 0, 7.4, 0);
  const eyes = [mk(new THREE.SphereGeometry(0.16, 6, 5), eye, -0.35, 7.5, 0.85), mk(new THREE.SphereGeometry(0.16, 6, 5), eye, 0.35, 7.5, 0.85)];
  const pivotLeg = (x) => {
    const p = new THREE.Group();
    p.position.set(x, 3.6, 0);
    p.add(mk(cfg.mech ? new THREE.BoxGeometry(1, 3.6, 1.2) : new THREE.CylinderGeometry(0.55, 0.45, 3.6, 7), acc, 0, -1.8, 0));
    p.add(mk(new THREE.BoxGeometry(1.2, 0.5, 1.6), mat, 0, -3.4, 0.2));
    return p;
  };
  const pivotArm = (x) => {
    const p = new THREE.Group();
    p.position.set(x, 6.2, 0);
    p.add(mk(cfg.mech ? new THREE.BoxGeometry(0.9, 3.4, 0.9) : new THREE.CylinderGeometry(0.55, 0.65, 3.4, 7), mat, 0, -1.7, 0));
    p.add(mk(cfg.mech ? new THREE.CylinderGeometry(0.35, 0.35, 1.6, 8) : new THREE.SphereGeometry(0.8, 8, 6), acc, 0, -3.6, 0));
    return p;
  };
  const legL = pivotLeg(-0.9);
  const legR = pivotLeg(0.9);
  const armL = pivotArm(-2.4);
  const armR = pivotArm(2.4);
  group.add(torso, belt, head, ...eyes, legL, legR, armL, armR);
  if (cfg.horns) {
    group.add(mk(new THREE.ConeGeometry(0.22, 1.1, 6), acc, -0.6, 8.3, 0), mk(new THREE.ConeGeometry(0.22, 1.1, 6), acc, 0.6, 8.3, 0));
  }
  if (cfg.mech) group.add(mk(new THREE.BoxGeometry(0.2, 1.4, 0.2), eye, 0, 8.3, 0));
  group.rotation.y = 0; // faces +z toward the army by default (eyes at +z)
  group.scale.setScalar(S);
  return { group, legL, legR, armL, armR, dying: 0, stompAnim: 0 };
}

export { fmt, HERO_POWER };
