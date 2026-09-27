import type { Ctx, GameSystem } from '../core/Context';

/**
 * SFX sintetizados con Web Audio (sin archivos). El AudioContext nace con el
 * primer gesto del usuario (política de autoplay) y solo escucha eventos.
 */
export class AudioSystem implements GameSystem {
  static id = 'audio';
  static deps: string[] = [];

  private ac: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;

  init(ctx: Ctx): this {
    const ensure = () => this.ensure();
    document.addEventListener('pointerdown', ensure);
    document.addEventListener('keydown', ensure);
    const ev = ctx.events;
    ev.on('battle:start', () => this.battleStart());
    ev.on('battle:hit', (p: { damage: number; crit?: boolean; blocked?: boolean }) => {
      if (p.blocked) this.parry();
      else if (p.damage > 0) p.crit ? this.crit() : this.hit();
    });
    ev.on('battle:window', (p: { state: string }) => {
      if (p.state === 'open' || p.state === 'follow-up') this.osc('square', 1500, 0.05, 0.12);
    });
    ev.on('battle:defend', (p: { result: string }) => {
      if (p.result.startsWith('perfect')) this.crit();
      else if (p.result === 'clean' || p.result === 'whiff') this.fail();
      else this.success();
    });
    ev.on('battle:telegraph', () => this.osc('sawtooth', 180, 0.3, 0.14, 320));
    ev.on('digimon:digivolved', () => this.digivolve());
    ev.on('battle:end', (p: { result: string }) => {
      if (p.result === 'win') this.victory();
    });
    ev.on('digivice:open', () => this.beep());
    ev.on('digivice:close', () => this.beep());
    ev.on('digivice:tab', () => this.osc('square', 900, 0.04, 0.08));
    ev.on('egg:hatch', () => this.victory());
    return this;
  }

  private ensure(): void {
    if (this.ac) {
      if (this.ac.state === 'suspended') void this.ac.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ac = new AC();
    this.master = this.ac.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ac.destination);
    // Ruido blanco fijo (1 s) reutilizado por todos los SFX de ruido.
    const len = this.ac.sampleRate;
    this.noiseBuf = this.ac.createBuffer(1, len, this.ac.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    let s = 0x9e3779b9;
    for (let i = 0; i < len; i++) {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      d[i] = ((s >>> 0) / 4294967296) * 2 - 1;
    }
  }

  private osc(type: OscillatorType, freq: number, dur: number, vol = 0.3, slideTo?: number, delay = 0): void {
    const ac = this.ac;
    if (!ac || !this.master) return;
    const t0 = ac.currentTime + delay;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  private noise(dur: number, vol = 0.25, delay = 0, cutoff = 1200): void {
    const ac = this.ac;
    if (!ac || !this.master || !this.noiseBuf) return;
    const t0 = ac.currentTime + delay;
    const src = ac.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0, 0, dur + 0.02);
  }

  private success(): void {
    this.osc('triangle', 880, 0.12, 0.3);
    this.osc('triangle', 1320, 0.18, 0.25, undefined, 0.09);
  }
  private fail(): void {
    this.osc('sawtooth', 220, 0.25, 0.2, 90);
  }
  private crit(): void {
    this.osc('square', 660, 0.1, 0.3);
    this.osc('square', 990, 0.14, 0.3, undefined, 0.08);
    this.osc('square', 1320, 0.2, 0.25, undefined, 0.16);
  }
  private parry(): void {
    this.osc('triangle', 1760, 0.08, 0.22);
    this.noise(0.06, 0.18, 0, 5000);
  }
  private hit(): void {
    this.noise(0.12, 0.35, 0, 700);
    this.osc('square', 150, 0.12, 0.3, 60);
  }
  private digivolve(): void {
    this.osc('sine', 400, 0.4, 0.3, 1200);
    this.osc('sine', 600, 0.5, 0.25, 1800, 0.2);
    this.osc('triangle', 1200, 0.6, 0.2, 2400, 0.4);
  }
  private beep(): void {
    this.osc('square', 1200, 0.06, 0.15);
  }
  private victory(): void {
    this.osc('triangle', 523, 0.15, 0.3);
    this.osc('triangle', 659, 0.15, 0.3, undefined, 0.15);
    this.osc('triangle', 784, 0.3, 0.3, undefined, 0.3);
  }
  private battleStart(): void {
    this.osc('sawtooth', 200, 0.4, 0.25, 100);
    this.osc('sawtooth', 100, 0.5, 0.25, 50, 0.15);
    this.noise(0.5, 0.2, 0, 500);
  }

  dispose(): void {
    void this.ac?.close();
  }
}
