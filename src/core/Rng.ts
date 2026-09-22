// PRNG determinista (mulberry32) con fork. Nunca Math.random() en gameplay/visuales.

export class Rng {
  readonly seed: number;
  private s: number;

  constructor(seed = 1337) {
    this.seed = seed >>> 0;
    this.s = this.seed;
  }

  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [0, 1) */
  float(): number {
    return this.next();
  }

  /** [a, b) */
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }

  /** [a, b] entero inclusivo */
  int(a: number, b: number): number {
    return Math.floor(this.range(a, b + 1));
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Sub-rng independiente: consumir el fork no contamina al padre. */
  fork(): Rng {
    return new Rng(this.int(1, 0x7fffffff));
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
