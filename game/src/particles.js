// Soft round particles (sparks, fire, smoke, dust) drawn as GPU points with
// per-particle size, colour and fade. Replaces the old flying-cube effects.
import * as THREE from 'three';

const VERT = `
attribute float size;
attribute float alpha;
attribute vec3 tint;
varying vec3 vTint;
varying float vAlpha;
uniform float uScale;
void main() {
  vTint = tint;
  vAlpha = alpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = `
varying vec3 vTint;
varying float vAlpha;
uniform float uHard;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float a = mix(1.0 - d * d, smoothstep(1.0, 0.6, d), uHard);
  gl_FragColor = vec4(vTint, a * vAlpha);
  #include <colorspace_fragment>
}`;

export class Particles {
  constructor(max, { additive = false, hard = 0 } = {}) {
    this.max = max;
    this.list = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('tint', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uScale: { value: 400 }, uHard: { value: hard } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
  }

  // o: { x,y,z, vx,vy,vz, life, size, grow, color(THREE.Color|hex), alpha, gravity, drag }
  spawn(o) {
    if (this.list.length >= this.max) this.list.shift();
    const c = o.color instanceof THREE.Color ? o.color : new THREE.Color(o.color);
    this.list.push({
      x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0,
      life: o.life, max: o.life, size: o.size, grow: o.grow ?? 1, r: c.r, g: c.g, b: c.b,
      a: o.alpha ?? 1, gravity: o.gravity ?? 0, drag: o.drag ?? 0,
    });
  }

  update(dt, scale) {
    this.mat.uniforms.uScale.value = scale;
    const keep = [];
    for (const p of this.list) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy -= p.gravity * dt;
      const dr = Math.max(0, 1 - p.drag * dt);
      p.vx *= dr; p.vy *= dr; p.vz *= dr;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.05 && p.gravity > 0) { p.y = 0.05; p.vy *= -0.3; }
      keep.push(p);
    }
    this.list = keep;
    const n = keep.length;
    for (let i = 0; i < n; i++) {
      const p = keep[i];
      const t = 1 - p.life / p.max; // 0 → 1
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.col[i * 3] = p.r; this.col[i * 3 + 1] = p.g; this.col[i * 3 + 2] = p.b;
      this.size[i] = p.size * (1 + (p.grow - 1) * t);
      this.alpha[i] = p.a * (t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9);
    }
    this.geo.setDrawRange(0, n);
    for (const k of ['position', 'tint', 'size', 'alpha']) this.geo.attributes[k].needsUpdate = true;
  }

  clear() {
    this.list = [];
    this.geo.setDrawRange(0, 0);
  }
}
