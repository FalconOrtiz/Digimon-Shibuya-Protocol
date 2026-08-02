// src/core/rng.js — PRNG determinista (mulberry32) con fork.
// Regla del contrato: NUNCA usar Math.random() en gameplay/visuales.
// Reproducibilidad de capturas depende de esto.

export class Rng {
  constructor(seed = 1337) {
    this.seed = seed >>> 0;
    this._s = this.seed;
  }

  // mulberry32
  next() {
    let t = (this._s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // [0, 1)
  float() { return this.next(); }

  // [a, b)
  range(a, b) { return a + (b - a) * this.next(); }

  // [a, b] entero inclusivo
  int(a, b) {
    return Math.floor(this.range(a, b + 1));
  }

  // índice aleatorio de un array
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  // true con probabilidad p
  chance(p) { return this.next() < p; }

  // sub-rng independiente: garantiza que consumir un fork no contamina al padre
  fork() {
    return new Rng(this.int(1, 0x7fffffff));
  }

  // shuffling Fisher-Yates in-place
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

export function makeRng(seed = 1337) {
  return new Rng(seed);
}
