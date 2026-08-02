// src/core/input.js — teclado + ratón + pointer lock.
// Ofrece estado pulsado por frame y taps bufferizados (para QTE de parry).

const PRESS = new Set();
const MOUSE = new Set();  // botones de ratón pulsados
const TAPS = new Map();   // code -> timestamp de último tap
let _mx = 0, _my = 0;     // deltas del ratón acumulados este frame
let _scroll = 0;

export class Input {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.keys = config.keys;
    this.locked = false;
    this.sensitivity = config.mouse.sensitivity;
    this.mx = 0; this.my = 0;
    this.scroll = 0;
    this._onKeyDown = (e) => {
      if (!PRESS.has(e.code)) TAPS.set(e.code, performance.now());
      PRESS.add(e.code);
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    };
    this._onKeyUp = (e) => PRESS.delete(e.code);
    this._onMouseMove = (e) => {
      if (this.locked) { _mx += e.movementX; _my += e.movementY; }
    };
    this._onWheel = (e) => { _scroll += Math.sign(e.deltaY); };
    this._onMouseDown = (e) => { MOUSE.add(`Mouse${e.button}`); TAPS.set(`Mouse${e.button}`, performance.now()); };
    this._onMouseUp = (e) => { MOUSE.delete(`Mouse${e.button}`); };
    this._onLockChange = () => { this.locked = document.pointerLockElement === canvas; };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('wheel', this._onWheel);
    document.addEventListener('mousedown', this._onMouseDown);
    document.addEventListener('mouseup', this._onMouseUp);
    document.addEventListener('pointerlockchange', this._onLockChange);
  }

  lock() {
    if (this.canvas.requestPointerLock) this.canvas.requestPointerLock();
  }

  // estado pulsado (para movimiento)
  down(code) { return PRESS.has(code); }
  downKey(name) { return PRESS.has(this.keys[name]); }

  // tap consumible (para QTE): true una sola vez por pulsación
  tap(name) {
    const code = this.keys[name];
    const t = TAPS.get(code);
    if (t === undefined) return false;
    TAPS.delete(code);
    return true;
  }

  // tap consumible por código directo (flechas, enter...)
  tapRaw(code) {
    const t = TAPS.get(code);
    if (t === undefined) return false;
    TAPS.delete(code);
    return true;
  }

  // deltas de ratón del frame actual (consumidos por update())
  consumeMouse() {
    const dx = _mx, dy = _my;
    _mx = 0; _my = 0;
    return { dx, dy };
  }

  consumeScroll() {
    const s = _scroll;
    _scroll = 0;
    return s;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('wheel', this._onWheel);
    document.removeEventListener('pointerlockchange', this._onLockChange);
  }
}
