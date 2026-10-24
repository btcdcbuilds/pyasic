// Procedural background music with WebAudio (no audio files). Each world gets its own tempo,
// key, chord progression and sounds. Three intensities: 'menu' (calm), 'run', 'boss'.
// Notes are scheduled slightly ahead of time on the audio clock so timing stays tight even if
// the game's frame rate dips.
import { mulberry32 } from './sim.js';

const WORLD_STYLE = [
  { bpm: 116, root: 45, mode: 'minor', prog: [0, 8, 3, 10], lead: 'square', bass: 'triangle' },   // Golden Bridge
  { bpm: 104, root: 43, mode: 'phrygian', prog: [0, 1, 0, 10], lead: 'sawtooth', bass: 'triangle' }, // Desert Canyon
  { bpm: 96, root: 40, mode: 'dorian', prog: [0, 10, 5, 3], lead: 'triangle', bass: 'sine' },       // Jungle Temple
  { bpm: 110, root: 47, mode: 'minor', prog: [0, 5, 8, 7], lead: 'triangle', bass: 'triangle' },   // Frozen Peaks
  { bpm: 128, root: 38, mode: 'phrygian', prog: [0, 1, 3, 1], lead: 'sawtooth', bass: 'sawtooth' }, // Volcano Forge
  { bpm: 124, root: 42, mode: 'minor', prog: [0, 8, 10, 7], lead: 'square', bass: 'sawtooth' },    // Neon City
  { bpm: 112, root: 46, mode: 'major', prog: [0, 7, 9, 5], lead: 'triangle', bass: 'triangle' },   // Sky Fortress
  { bpm: 120, root: 41, mode: 'dorian', prog: [0, 3, 10, 5], lead: 'sine', bass: 'sawtooth' },      // Lunar Base
];
const MODES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
};
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

export class Music {
  constructor(sfx) {
    this.sfx = sfx;
    this.enabled = true;
    this.mode = null;
    this.world = 0;
    this.timer = null;
  }

  get ctx() {
    return this.sfx.ctx;
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.stop();
    else if (this.wanted) this.play(this.wanted.world, this.wanted.mode);
  }

  // Start (or switch) music. Safe to call every frame with the same arguments.
  play(world, mode) {
    this.wanted = { world, mode };
    if (!this.enabled || !this.ctx) return;
    if (this.timer && this.world === world && this.mode === mode) return;
    const fresh = !this.timer || this.world !== world;
    this.world = world;
    this.mode = mode;
    if (fresh) this.buildSong(world);
    if (!this.out) {
      this.out = this.ctx.createGain();
      this.out.gain.value = 0;
      this.out.connect(this.ctx.destination);
    }
    this.out.gain.cancelScheduledValues(this.ctx.currentTime);
    this.out.gain.linearRampToValueAtTime(mode === 'menu' ? 0.12 : 0.16, this.ctx.currentTime + 0.6);
    if (!this.timer) {
      this.step = 0;
      this.nextTime = this.ctx.currentTime + 0.1;
      this.timer = setInterval(() => this.schedule(), 25);
    }
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.out && this.ctx) this.out.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.3);
  }

  buildSong(world) {
    const st = WORLD_STYLE[world % WORLD_STYLE.length];
    const rng = mulberry32(9001 + world * 77);
    const scale = MODES[st.mode];
    this.style = st;
    // 4 bars x 8 eighth-notes of melody, as scale degrees (null = rest)
    this.melody = [];
    let deg = 4;
    for (let i = 0; i < 32; i++) {
      if (rng() < 0.28 && i % 2 === 1) { this.melody.push(null); continue; }
      deg = Math.max(0, Math.min(11, deg + Math.round((rng() - 0.5) * 4)));
      if (i % 8 === 0) deg = 4 + Math.floor(rng() * 3); // land on chord tones at bar starts
      this.melody.push(deg);
    }
    this.scale = scale;
  }

  schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const st = this.style;
    const boss = this.mode === 'boss';
    const menu = this.mode === 'menu';
    const eighth = 60 / (st.bpm * (boss ? 1.12 : 1)) / 2;
    while (this.nextTime < ctx.currentTime + 0.15) {
      const t = this.nextTime;
      const s = this.step % 32;
      const bar = Math.floor(s / 8);
      const chordRoot = st.root + st.prog[bar];
      // drums
      if (!menu) {
        if (s % 4 === 0 || (boss && s % 8 === 6)) this.kick(t);
        if (s % 8 === 4) this.snare(t);
        if (boss || s % 2 === 0) this.hat(t, s % 2 === 1 ? 0.03 : 0.05);
      } else if (s % 8 === 0) this.kick(t, 0.4);
      // bass: root/fifth eighths
      if (!menu || s % 4 === 0) this.tone(t, hz(chordRoot - 12 + (s % 4 === 3 ? 7 : 0)), eighth * 0.9, st.bass, menu ? 0.1 : 0.16);
      // pad chord at the start of each bar
      if (s % 8 === 0) for (const iv of [0, 3 + (st.mode === 'major' ? 1 : 0), 7]) this.tone(t, hz(chordRoot + 12 + iv), eighth * 7.5, 'triangle', 0.035, 0.3);
      // lead melody
      const deg = this.melody[s];
      if (deg !== null && deg !== undefined && (!menu || s % 2 === 0)) {
        const oct = Math.floor(deg / 7);
        const note = st.root + 24 + this.scale[deg % 7] + oct * 12;
        this.tone(t, hz(note), eighth * (menu ? 1.6 : 0.85), st.lead, menu ? 0.03 : 0.045);
      }
      this.nextTime += eighth;
      this.step++;
    }
  }

  tone(t, freq, dur, type, vol, attack = 0.01) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  kick(t, vol = 1) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.5 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.22);
  }

  noiseHit(t, freq, q, vol, dur, type) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.sfx.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.out);
    src.start(t, Math.random() * 0.5, dur + 0.02);
  }

  snare(t) { this.noiseHit(t, 1800, 0.8, 0.25, 0.16, 'bandpass'); }
  hat(t, vol) { this.noiseHit(t, 8000, 1, vol, 0.04, 'highpass'); }
}
