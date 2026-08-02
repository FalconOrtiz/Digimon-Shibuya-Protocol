// src/audio/index.js — síntesis Web Audio (sin archivos).
// SFX: pasos, golpes, habilidades, QTE success/fail, digivice beep, batalla.

export class AudioSystem {
  static id = 'audio';
  static deps = [];

  constructor() { this.ctx = null; this.master = null; }

  init(ctx) {
    this.gameCtx = ctx;
    // AudioContext se crea con gesto del usuario (click) para respetar autoplay policy
    document.addEventListener('pointerdown', () => this._ensure(), { once: true });
    document.addEventListener('keydown', () => this._ensure(), { once: true });
    this._wire();
    return this;
  }

  _ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  }

  _osc(type, freq, dur, vol = 0.3, slideTo = null, delay = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  _noise(dur, vol = 0.25, delay = 0, filterFreq = 1200) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0);
  }

  // ---- SFX ----
  footstep() { this._noise(0.08, 0.12, 0, 800); }
  jump() { this._osc('sine', 300, 0.2, 0.15, 600); }
  land() { this._noise(0.1, 0.2, 0, 400); }

  // QTE
  qteSuccess() {
    this._osc('triangle', 880, 0.12, 0.3);
    this._osc('triangle', 1320, 0.18, 0.25, null, 0.09);
  }
  qteFail() { this._osc('sawtooth', 220, 0.25, 0.2, 90); }
  qteCrit() {
    this._osc('square', 660, 0.1, 0.3);
    this._osc('square', 990, 0.14, 0.3, null, 0.08);
    this._osc('square', 1320, 0.2, 0.25, null, 0.16);
  }

  // habilidades (elementales)
  fire() { this._noise(0.35, 0.3, 0, 2500); this._osc('sawtooth', 400, 0.3, 0.15, 90); }
  air() { this._noise(0.25, 0.25, 0, 3500); this._osc('sine', 900, 0.2, 0.15, 1400); }
  water() { this._noise(0.4, 0.2, 0, 900); this._osc('sine', 200, 0.35, 0.15, 500); }
  hit() { this._noise(0.12, 0.35, 0, 700); this._osc('square', 150, 0.12, 0.3, 60); }
  digivolve() {
    this._osc('sine', 400, 0.4, 0.3, 1200);
    this._osc('sine', 600, 0.5, 0.25, 1800, 0.2);
    this._osc('triangle', 1200, 0.6, 0.2, 2400, 0.4);
  }
  beep() { this._osc('square', 1200, 0.06, 0.15); }
  victory() {
    this._osc('triangle', 523, 0.15, 0.3);
    this._osc('triangle', 659, 0.15, 0.3, null, 0.15);
    this._osc('triangle', 784, 0.3, 0.3, null, 0.3);
  }
  battleStart() {
    this._osc('sawtooth', 200, 0.4, 0.25, 100);
    this._osc('sawtooth', 100, 0.5, 0.25, 50, 0.15);
    this._noise(0.5, 0.2, 0, 500);
  }

  // hook eventos del juego
  _wire() {
    const ev = this.gameCtx.events;
    ev.on('battle:hit', (p) => { if (p.damage > 0) this.hit(); });
    ev.on('battle:qte', (p) => {
      if (p.state !== 'end') return;
      if (p.result === 'crit') this.qteCrit();
      else if (p.result === 'perfect') this.qteCrit();
      else if (p.result === 'hit' || p.result === 'ok') this.qteSuccess();
      else this.qteFail();
    });
    ev.on('battle:start', () => this.battleStart());
    ev.on('battle:end', (p) => { if (p.result === 'win') this.victory(); });
    ev.on('digivice:open', () => this.beep());
    ev.on('digivice:close', () => this.beep());
  }

  update() {}
  resize() {}
  dispose() { if (this.ctx) this.ctx.close(); }
}
