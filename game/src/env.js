// Per-world scenery: track, ground, side props and ambient particles.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HW, mulberry32 as mulberry } from './sim.js';
import { drawBtc } from './icons.js';

export function buildEnvironment(r, world, len, theme = { env: 'world' }, bossDs = []) {
  if (theme.env === 'gridiron' || theme.env === 'footy') {
    buildStadium(r, world, len, theme, bossDs);
    addAmbient(r, world);
    return;
  }
  const root = r.root;
  const lam = (hex, extra = {}) => new THREE.MeshLambertMaterial({ color: hex, ...extra });
  const trackW = HW * 2 + 1.2;
  const track = new THREE.Mesh(new THREE.BoxGeometry(trackW, 0.6, len + 60), lam(world.track));
  track.position.set(0, -0.3, -len / 2 + 20);
  root.add(track);
  // lane dashes
  const dashGeo = [];
  for (let z = 10; z > -len; z -= 6) dashGeo.push(new THREE.BoxGeometry(0.14, 0.02, 2.6).translate(0, 0.01, z));
  for (const x of [-HW + 0.25, HW - 0.25]) dashGeo.push(new THREE.BoxGeometry(0.12, 0.02, len + 60).translate(x, 0.01, -len / 2 + 20));
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
  addProps(r, world, len);
  if (theme.env === 'bitcoin') addBitcoinProps(r, len);
  addAmbient(r, world);
}

// Bitcoin theme extras on top of the world scenery: rows of mining rigs and coin billboards.
function addBitcoinProps(r, len) {
  const root = r.root;
  const G = THREE;
  const rigs = [], fans = [], leds = [], posts = [];
  for (let z = -6; z > -len; z -= 3.2) {
    for (const s of [-1, 1]) {
      const x = s * (HW + 2.3);
      rigs.push(new G.BoxGeometry(1.1, 0.75, 1.5).translate(x, 0.38, z));
      fans.push(new G.CylinderGeometry(0.28, 0.28, 0.05, 10).rotateX(Math.PI / 2).translate(x, 0.38, z + 0.76));
      leds.push(new G.BoxGeometry(0.08, 0.08, 0.04).translate(x + 0.4, 0.62, z + 0.77));
    }
  }
  root.add(new G.Mesh(mergeGeometries(rigs), new G.MeshLambertMaterial({ color: 0x8c9096 })));
  root.add(new G.Mesh(mergeGeometries(fans), new G.MeshLambertMaterial({ color: 0x2a2c30 })));
  root.add(new G.Mesh(mergeGeometries(leds), new G.MeshBasicMaterial({ color: 0x3aff6a })));
  const tex = r.cachedTex('btc', 128, 128, drawBtc);
  const faceMat = new G.MeshBasicMaterial({ map: tex, transparent: true });
  let k = 0;
  for (let z = -30; z > -len; z -= 46) {
    const s = k++ % 2 ? 1 : -1;
    const x = s * (HW + 6.5);
    posts.push(new G.CylinderGeometry(0.18, 0.18, 6, 6).translate(x, 3, z - 0.2));
    const sign = new G.Mesh(new G.PlaneGeometry(4.2, 4.2), faceMat);
    sign.position.set(x, 7.2, z);
    sign.rotation.y = -s * 0.25;
    root.add(sign);
  }
  if (posts.length) root.add(new G.Mesh(mergeGeometries(posts), new G.MeshLambertMaterial({ color: 0x55585e })));
}

// Football stadium for the gridiron and footy themes: striped turf, field markings, advertising
// boards, stands full of fans, floodlights and goal posts behind every boss. The world still sets
// the sky, light, fog and weather (snow, embers, sand...).
function buildStadium(r, world, len, theme, bossDs) {
  const root = r.root;
  const G = THREE;
  const lam = (hex, extra = {}) => new G.MeshLambertMaterial({ color: hex, ...extra });
  const merged = (geos, mat) => { if (geos.length) root.add(new G.Mesh(mergeGeometries(geos), mat)); };
  const trackW = HW * 2 + 1.2;
  const L = len + 60;
  const zc = -len / 2 + 20;
  // turf with mowing stripes
  const turf = new G.Mesh(new G.BoxGeometry(trackW + 6, 0.6, L), lam(0x3b8a36));
  turf.position.set(0, -0.3, zc);
  root.add(turf);
  const stripes = [];
  for (let z = 20; z > -len - 40; z -= 10) stripes.push(new G.BoxGeometry(trackW + 6, 0.01, 5).translate(0, 0.004, z));
  merged(stripes, lam(0x47a041));
  const white = new G.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  const lines = [];
  for (const x of [-HW - 0.3, HW + 0.3]) lines.push(new G.BoxGeometry(0.22, 0.02, L).translate(x, 0.012, zc));
  if (theme.env === 'gridiron') {
    // yard lines every 10 m, hash marks every 2 m, numbers 10..50..10
    for (let z = 0, n = 0; z > -len; z -= 10, n++) {
      lines.push(new G.BoxGeometry(trackW - 0.6, 0.02, 0.16).translate(0, 0.012, z));
      for (let h = 2; h < 10; h += 2) for (const x of [-2.2, 2.2, -HW + 0.4, HW - 0.4]) lines.push(new G.BoxGeometry(0.5, 0.02, 0.1).translate(x, 0.012, z - h));
      const yard = [10, 20, 30, 40, 50, 40, 30, 20, 10, 0][n % 10];
      if (yard) {
        const tex = r.cachedTex(`yd${yard}`, 128, 64, (ctx, w, h) => {
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.font = `${h * 0.9}px "Lilita One", "Arial Black", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(yard), w / 2, h / 2 + 3);
        });
        for (const s of [-1, 1]) {
          const num = new G.Mesh(new G.PlaneGeometry(2.2, 1.1), new G.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
          num.rotation.x = -Math.PI / 2;
          num.position.set(s * (HW - 1.7), 0.02, z - 1.2);
          root.add(num);
        }
      }
    }
  } else {
    // footy: centre circle and square, and a 50 m arc every 80 m
    for (let z = -40; z > -len; z -= 80) {
      const ring = new G.Mesh(new G.RingGeometry(2.6, 2.8, 40), white);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(0, 0.014, z);
      root.add(ring);
      for (const [w, d, x, dz] of [[8, 0.18, 0, -4], [8, 0.18, 0, 4], [0.18, 8, -4, 0], [0.18, 8, 4, 0]]) lines.push(new G.BoxGeometry(w, 0.02, d).translate(x, 0.012, z + dz));
      const arc = new G.Mesh(new G.RingGeometry(9.8, 10, 40, 1, Math.PI * 1.2, Math.PI * 0.6), white);
      arc.rotation.x = -Math.PI / 2;
      arc.position.set(0, 0.014, z - 30);
      root.add(arc);
    }
  }
  merged(lines, white);
  // advertising boards along both sidelines
  const adTex = r.cachedTex(`ads-${theme.id}`, 512, 64, (ctx, w, h) => {
    const cols = ['#1f4fd0', '#ffc81a', '#d0262a', '#1a1a1a'];
    const words = theme.env === 'gridiron' ? ['GO RUSH', 'TOUCHDOWN', 'DEFENSE!', 'GAME DAY'] : ['GO RUSH', 'KICK IT LONG', 'CARN!', 'FOOTY DAY'];
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = cols[i];
      ctx.fillRect(i * 128, 0, 128, h);
      ctx.fillStyle = i === 1 ? '#1a1a1a' : '#ffffff';
      ctx.font = `${h * 0.42}px "Lilita One", "Arial Black", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(words[i], i * 128 + 64, h / 2 + 2);
    }
  });
  adTex.wrapS = G.RepeatWrapping;
  adTex.repeat.set(L / 20, 1);
  const edge = trackW / 2 + 3;
  for (const s of [-1, 1]) {
    const board = new G.Mesh(new G.BoxGeometry(L, 1.1, 0.25), [lam(0x222222), lam(0x222222), lam(0x222222), lam(0x222222), new G.MeshBasicMaterial({ map: adTex }), new G.MeshBasicMaterial({ map: adTex })]);
    board.rotation.y = Math.PI / 2 * s;
    board.position.set(s * edge, 0.55, zc);
    root.add(board);
  }
  // stands full of fans in both teams' colours
  const army = '#' + new G.Color(theme.army).getHexString();
  const rival = '#' + new G.Color(theme.enemy).getHexString();
  const crowdTex = r.cachedTex(`crowd-${theme.id}`, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#2a2d36';
    ctx.fillRect(0, 0, w, h);
    const cols = [army, army, army, rival, '#ffffff', '#ffc81a', '#e8b48a', '#3a2414'];
    for (let y = 4; y < h; y += 8) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, y + 5, w, 2);
      for (let x = 3; x < w; x += 7) {
        ctx.fillStyle = cols[(x * 7 + y * 13 + ((x * y) % 5)) % cols.length];
        ctx.beginPath();
        ctx.arc(x + ((y / 8) % 2) * 3, y + 1, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
  crowdTex.wrapS = crowdTex.wrapT = G.RepeatWrapping;
  crowdTex.repeat.set(2, L / 12);
  const tilt = 0.5;
  const sw = 22;
  for (const s of [-1, 1]) {
    const stand = new G.Mesh(new G.PlaneGeometry(sw, L).rotateX(-Math.PI / 2).rotateZ(s * tilt), new G.MeshLambertMaterial({ map: crowdTex }));
    stand.position.set(s * (edge + 1.5 + (sw / 2) * Math.cos(tilt)), (sw / 2) * Math.sin(tilt) + 0.2, zc);
    root.add(stand);
    const roof = new G.Mesh(new G.BoxGeometry(10, 0.5, L), lam(0x3a3e48));
    roof.position.set(s * (edge + 1.5 + sw * Math.cos(tilt) - 3), sw * Math.sin(tilt) + 4.5, zc);
    root.add(roof);
  }
  // floodlights
  const poles = [], lamps = [];
  for (let z = -10; z > -len; z -= 70) {
    for (const s of [-1, 1]) {
      const x = s * (edge + 1.5 + sw * Math.cos(tilt) + 2);
      poles.push(new G.CylinderGeometry(0.35, 0.5, 26, 8).translate(x, 13, z));
      lamps.push(new G.BoxGeometry(4, 2.6, 0.5).translate(x - s * 0.6, 26.5, z + 0.3));
    }
  }
  merged(poles, lam(0x8a8f99));
  merged(lamps, new G.MeshBasicMaterial({ color: 0xfffbe0 }));
  // ground outside the stadium
  const ground = new G.Mesh(new G.PlaneGeometry(500, len + 400), lam(new G.Color(world.ground).lerp(new G.Color(0x2a2d36), 0.6).getHex()));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.65, -len / 2);
  root.add(ground);
  // goal posts just behind each boss
  const yellow = lam(0xffd21a), whiteM = lam(0xffffff), pad = lam(theme.army);
  for (const bd of bossDs) {
    const z = -(bd + 9);
    if (theme.env === 'gridiron') {
      merged([
        new G.CylinderGeometry(0.22, 0.22, 3.2, 8).translate(0, 1.6, z + 1.2),
        new G.BoxGeometry(0.3, 0.3, 1.4).translate(0, 3.2, z + 0.55),
        new G.CylinderGeometry(0.16, 0.16, 7.4, 8).rotateZ(Math.PI / 2).translate(0, 3.3, z),
        new G.CylinderGeometry(0.13, 0.13, 8, 8).translate(-3.7, 7.3, z),
        new G.CylinderGeometry(0.13, 0.13, 8, 8).translate(3.7, 7.3, z),
      ], yellow);
      const ez = new G.Mesh(new G.PlaneGeometry(trackW + 6, 9), new G.MeshBasicMaterial({ color: theme.army, transparent: true, opacity: 0.45, depthWrite: false }));
      ez.rotation.x = -Math.PI / 2;
      ez.position.set(0, 0.008, z + 4.5);
      root.add(ez);
    } else {
      const posts = [], pads = [];
      for (const [x, h] of [[-2.2, 11], [2.2, 11], [-6.6, 7], [6.6, 7]]) {
        posts.push(new G.CylinderGeometry(0.16, 0.2, h, 8).translate(x, h / 2, z));
        pads.push(new G.CylinderGeometry(0.32, 0.32, 1.8, 10).translate(x, 0.9, z));
      }
      merged(posts, whiteM);
      merged(pads, pad);
    }
  }
  if (world.props === 'lunar') {
    const earth = new G.Mesh(new G.SphereGeometry(30, 24, 16), new G.MeshBasicMaterial({ color: 0x3a7bff }));
    earth.position.set(-90, 70, -260);
    r.followers = [earth];
    root.add(earth);
  }
}

function addProps(r, world, len) {
  const root = r.root;
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
          towers.push(new G.BoxGeometry(1.6, 34, 1.6).translate(s * 9.6, 3, z));
          towers.push(new G.BoxGeometry(1.6, 34, 1.6).translate(s * 9.6, 3, z - 4));
          for (const y of [8, 14, 19]) towers.push(new G.BoxGeometry(1.4, 1.2, 5.6).translate(s * 9.6, y, z - 2));
        }
        towers.push(new G.BoxGeometry(20.8, 1.6, 1.6).translate(0, 19.5, z - 2));
      }
      for (let z = -20; z > -len - 140; z -= 140) {
        for (const s of [-1, 1]) {
          // main cable as a sagging chain of segments between towers
          let px = s * 9.6, py = 19, pz = z - 2;
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
            if (k < 14) cables.push(new G.CylinderGeometry(0.06, 0.06, ny, 4).translate(s * 9, ny / 2, nz));
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
        const cx = side() * (9.5 + rnd() * 6);
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
          const x = s * (9.8 + rnd() * 3);
          stone.push(new G.BoxGeometry(2.2, h, 2.2).translate(x, h / 2 - 0.6, z));
          stone.push(new G.BoxGeometry(3, 0.8, 3).translate(x, h - 0.4, z));
          moss.push(new G.BoxGeometry(2.3, 1.2, 2.3).translate(x, h * (0.3 + rnd() * 0.4), z));
          if (rnd() < 0.5) {
            stone.push(new G.BoxGeometry(0.3, 1.6, 0.3).translate(s * 7.8, 0.8, z - 7));
            fire.push(new G.SphereGeometry(0.35, 6, 5).translate(s * 7.8, 1.9, z - 7));
          }
        }
        if (rnd() < 0.3) stone.push(new G.BoxGeometry(26, 1.6, 2).translate(0, 15, z));
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
        const x = s * (10.5 + rnd() * 20);
        const h = 3 + rnd() * 6;
        pine.push(new G.ConeGeometry(1.4, h, 7).translate(x, h / 2 + 0.6, z));
        snow.push(new G.ConeGeometry(0.8, h * 0.4, 7).translate(x, h * 0.85 + 0.6, z));
        const ix = -s * (9.5 + rnd() * 10);
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
          const x = s * (13 + w / 2 + rnd() * 8);
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
        for (const s of [-1, 1]) pole.push(new G.CylinderGeometry(0.12, 0.12, 4, 5).translate(s * 7.6, 2, z));
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
        rock.push(new G.DodecahedronGeometry(0.6 + rnd() * 1.5).translate(side() * (9.5 + rnd() * 12), -0.2, z - 6));
        if (rnd() < 0.15) dome.push(new G.SphereGeometry(5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(side() * (25 + rnd() * 20), -0.6, z));
      }
      merged(crater, lam(0x6a6a70));
      merged(rock, lam(0x77777f));
      merged(dome, lam(0xcfe8ff, { transparent: true, opacity: 0.6 }));
      const earth = new THREE.Mesh(new THREE.SphereGeometry(30, 24, 16), new THREE.MeshBasicMaterial({ color: 0x3a7bff }));
      earth.position.set(-90, 70, -260);
      r.followers = [earth];
      root.add(earth);
      break;
    }
  }
}

function addAmbient(r, world) {
  // Floating particles that follow the camera: snow, embers, sand, stars.
  const kind = { frozen: [0xffffff, 0.25, -3], volcano: [0xff8a2a, 0.18, 2], desert: [0xf5d39b, 0.12, -0.5], lunar: [0xffffff, 0.3, 0], temple: [0x9cff8a, 0.12, 0.3], neon: [0xff6ae6, 0.12, 0.6] }[world.props];
  r.ambient = null;
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
  r.root.add(pts);
  r.ambient = { pts, fall: kind[2], lunar: world.props === 'lunar' };
}

