// Tiny procedural sound effects with WebAudio (no audio files).
export class Sfx {
  constructor() {
    this.enabled = true;
    this.ctx = null;
    this.lastShot = 0;
    this.lastHit = 0;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  ok() {
    return this.enabled && this.ctx && this.ctx.state === 'running';
  }

  noise(dur, freq, q, gain, type = 'bandpass') {
    if (!this.ok()) return;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    const t = c.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }

  tone(freq, dur, type = 'square', gain = 0.15, slideTo = null, delay = 0) {
    if (!this.ok()) return;
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    const t = c.currentTime + delay;
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  shot(id) {
    if (!this.ok()) return;
    const now = this.ctx.currentTime;
    const gap = { minigun: 0.05, smg: 0.06, tesla: 0.09 }[id] || 0.08;
    if (now - this.lastShot < gap) return;
    this.lastShot = now;
    switch (id) {
      case 'laser': this.tone(1400, 0.08, 'sawtooth', 0.05, 500); break;
      case 'plasma': this.tone(300, 0.15, 'sawtooth', 0.07, 90); break;
      case 'railgun': this.tone(2200, 0.25, 'square', 0.05, 120); this.noise(0.2, 3000, 0.5, 0.12, 'highpass'); break;
      case 'tesla': this.noise(0.08, 5000, 1.5, 0.1, 'highpass'); break;
      case 'rocket': this.noise(0.3, 400, 0.6, 0.2, 'lowpass'); break;
      case 'shotgun': this.noise(0.15, 900, 0.7, 0.25); break;
      default: this.noise(0.06, id === 'minigun' ? 1600 : 1200, 1, 0.12);
    }
  }

  boom() { this.noise(0.5, 220, 0.4, 0.5, 'lowpass'); this.tone(90, 0.4, 'sine', 0.3, 40); }
  coin() { this.tone(1200, 0.08, 'square', 0.06); this.tone(1800, 0.12, 'square', 0.06, null, 0.06); }
  good() { [523, 659, 784].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.12, null, i * 0.06)); }
  bad() { this.tone(300, 0.3, 'sawtooth', 0.1, 120); }
  crash() { this.noise(0.25, 500, 0.5, 0.35, 'lowpass'); }
  clash() { this.noise(0.3, 1500, 0.4, 0.2); }
  stomp() { this.tone(70, 0.45, 'sine', 0.5, 35); this.noise(0.35, 200, 0.4, 0.4, 'lowpass'); }
  weapon() { [392, 523, 659, 1046].forEach((f, i) => this.tone(f, 0.15, 'square', 0.08, null, i * 0.07)); }
  win() { [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.15, null, i * 0.11)); }
  lose() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.3, 'sawtooth', 0.08, null, i * 0.16)); }
  click() { this.tone(900, 0.04, 'square', 0.05); }
}
