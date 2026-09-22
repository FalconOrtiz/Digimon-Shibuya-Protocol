// Teclado + ratón + pointer lock. Estado pulsado por frame y taps bufferizados (QTE).

import type { GameConfig } from './Config';

const PREVENT = new Set(['Tab', 'Space', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class Input {
  readonly canvas: HTMLCanvasElement;
  readonly keys: Record<string, string>;
  locked = false;
  sensitivity: number;

  private press = new Set<string>();
  private taps = new Map<string, number>();
  private mx = 0;
  private my = 0;
  private scroll = 0;

  constructor(canvas: HTMLCanvasElement, config: GameConfig) {
    this.canvas = canvas;
    this.keys = config.keys;
    this.sensitivity = config.mouse.sensitivity;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('wheel', this.onWheel);
    document.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('pointerlockchange', this.onLockChange);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.press.has(e.code)) this.taps.set(e.code, performance.now());
    this.press.add(e.code);
    if (PREVENT.has(e.code)) e.preventDefault();
  };
  private onKeyUp = (e: KeyboardEvent): void => {
    this.press.delete(e.code);
  };
  private onMouseMove = (e: MouseEvent): void => {
    if (this.locked) {
      this.mx += e.movementX;
      this.my += e.movementY;
    }
  };
  private onWheel = (e: WheelEvent): void => {
    this.scroll += Math.sign(e.deltaY);
  };
  private onMouseDown = (e: MouseEvent): void => {
    this.press.add(`Mouse${e.button}`);
    this.taps.set(`Mouse${e.button}`, performance.now());
  };
  private onMouseUp = (e: MouseEvent): void => {
    this.press.delete(`Mouse${e.button}`);
  };
  private onLockChange = (): void => {
    this.locked = document.pointerLockElement === this.canvas;
  };

  lock(): void {
    this.canvas.requestPointerLock?.();
  }

  down(code: string): boolean {
    return this.press.has(code);
  }

  downKey(name: string): boolean {
    return this.press.has(this.keys[name]);
  }

  /** Tap consumible: true una sola vez por pulsación. */
  tap(name: string): boolean {
    return this.tapRaw(this.keys[name]);
  }

  tapRaw(code: string): boolean {
    if (!this.taps.has(code)) return false;
    this.taps.delete(code);
    return true;
  }

  consumeMouse(): { dx: number; dy: number } {
    const dx = this.mx;
    const dy = this.my;
    this.mx = 0;
    this.my = 0;
    return { dx, dy };
  }

  consumeScroll(): number {
    const s = this.scroll;
    this.scroll = 0;
    return s;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('wheel', this.onWheel);
    document.removeEventListener('mousedown', this.onMouseDown);
    document.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('pointerlockchange', this.onLockChange);
  }
}
