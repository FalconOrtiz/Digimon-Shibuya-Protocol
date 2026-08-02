// src/battle/qte.js — sistema de timing estilo Expedition 33.
// Tres tipos de QTE:
//   - crit: barra con zona dorada; pulsa cerca del centro → CRIT (1.6×)
//   - parry: al recibir ataque, pulsa cuando el anillo colisiona → 0 daño + contra
//   - dodge: igual que parry pero esquiva (más ventana, sin contraataque)
//
// El QTE se renderiza en el HUD; aquí vive la lógica de timing + input.

export class QteSystem {
  constructor(ctx) {
    this.ctx = ctx;
    this.input = ctx.input;
    this.events = ctx.events;
    this.active = null;
  }

  // start(type, { window, durationMs }) → promise que resuelve resultado
  // result: 'crit' | 'hit' | 'miss' | 'perfect' | 'late'
  start(type, opts = {}) {
    if (this.active) return null;
    const window = opts.window ?? 0.18;
    const duration = opts.durationMs ?? 900;
    const started = performance.now();

    this.active = {
      type,               // 'crit' | 'parry' | 'dodge'
      window,
      duration,
      started,
      resolved: false,
      result: null
    };

    this.events.emit('battle:qte', { type, state: 'start', window });

    return new Promise((resolve) => {
      this._resolve = resolve;
    });
  }

  // se llama desde el input: el jugador pulsa la tecla de acción
  press() {
    if (!this.active || this.active.resolved) return;
    const a = this.active;
    const elapsed = performance.now() - a.started;
    const t = Math.min(1, elapsed / a.duration);   // 0..1 posición en la barra

    let result;
    if (a.type === 'crit') {
      result = qteCritResult(t, a.window);
    } else {
      // parry/dodge: anillo colisiona en t ∈ [0.3, 0.6] aprox.
      result = qteParryResult(t, a.window);
    }
    this._finish(result);
  }

  // timeout: no pulsó a tiempo
  timeout() {
    if (!this.active || this.active.resolved) return;
    const a = this.active;
    const result = a.type === 'crit' ? 'miss' : 'late';
    this._finish(result);
  }

  _finish(result) {
    const a = this.active;
    a.resolved = true;
    a.result = result;
    this.active = null;
    this.events.emit('battle:qte', { type: a.type, state: 'end', result });
    if (this._resolve) this._resolve(result);
    this._resolve = null;
  }

  isActive() { return !!this.active; }
  current() { return this.active; }
}

// --- lógica pura (testeable) ---

// barra 0..1, zona dorada centrada en 0.5 con ancho window
export function qteCritResult(t, window) {
  const dist = Math.abs(t - 0.5);
  const hitZone = Math.max(window * 2.5, 0.28);
  if (dist <= window) return 'crit';
  if (dist <= hitZone) return 'hit';
  return 'miss';
}

// anillo que se cierra: perfecto si t ∈ [0.4, 0.6], ok [0.3, 0.7], late fuera
export function qteParryResult(t, window) {
  const perfect = 0.1 + window * 0.6;   // ancho del perfect window
  const center = 0.5;
  const dist = Math.abs(t - center);
  if (dist <= perfect) return 'perfect';
  if (dist <= 0.2) return 'ok';
  return 'late';
}
