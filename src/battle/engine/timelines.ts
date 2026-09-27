/**
 * AttackTimelines del combate E33. Datos puros: un ataque enemigo es un
 * telegrafiado seguido de hit frames; cada hit frame abre una ventana de
 * defensa (DefendWindows.ts).
 */

export type TimelineHitType = 'strike' | 'jumpable' | 'gradient';

export interface TimelineHit {
  /** Segundos desde el primer hit frame (0 = primer golpe). */
  t: number;
  /** strike = parable/esquivable; jumpable = además saltable; gradient = solo esquivar/saltar/graduar. */
  type: TimelineHitType;
  /** Daño plano si conecta limpio (escala con la DEF del defensor). */
  damage: number;
  /** Clave de FX: 'claw' | 'gust' | 'beam' | 'slam' | 'bubble'. */
  sfx: string;
  /** DATA BREAK que genera un golpe limpio (12 por defecto). */
  break?: number;
}

export interface AttackTimeline {
  id: string;
  name: string;
  /** Pista de animación del telegrafiado. */
  windup: 'dash' | 'breath' | 'leap' | 'cast';
  /** Segundos de telegrafiado antes del primer hit (mínimo 0.6 para que se lea). */
  windupTime: number;
  hits: TimelineHit[];
  /** Recompensa por parar el combo entero (contraataque automático). */
  counter?: { damage: number; sfx: string; break: number };
}

export const ATTACK_TIMELINES: Record<string, AttackTimeline> = {
  'tackle-rush': {
    id: 'tackle-rush', name: 'Tackle Rush', windup: 'dash', windupTime: 0.9,
    hits: [
      { t: 0.0, type: 'strike', damage: 8, sfx: 'claw', break: 12 },
      { t: 0.55, type: 'strike', damage: 8, sfx: 'claw', break: 12 },
      { t: 1.1, type: 'jumpable', damage: 12, sfx: 'slam', break: 16 },
    ],
    counter: { damage: 24, sfx: 'counter', break: 20 },
  },
  'wing-gust': {
    id: 'wing-gust', name: 'Wing Gust', windup: 'breath', windupTime: 1.1,
    hits: [
      { t: 0.0, type: 'gradient', damage: 10, sfx: 'beam', break: 10 },
      { t: 0.4, type: 'strike', damage: 6, sfx: 'gust', break: 8 },
    ],
    counter: { damage: 18, sfx: 'counter', break: 14 },
  },
  'pepper-breath': {
    id: 'pepper-breath', name: 'Pepper Breath', windup: 'breath', windupTime: 1.0,
    hits: [
      { t: 0.0, type: 'strike', damage: 9, sfx: 'beam', break: 12 },
      { t: 0.45, type: 'strike', damage: 9, sfx: 'beam', break: 12 },
      { t: 0.9, type: 'jumpable', damage: 11, sfx: 'slam', break: 14 },
    ],
    counter: { damage: 26, sfx: 'counter', break: 22 },
  },
  'sonic-sweep': {
    id: 'sonic-sweep', name: 'Sonic Sweep', windup: 'leap', windupTime: 1.2,
    hits: [
      { t: 0.0, type: 'jumpable', damage: 10, sfx: 'slam', break: 12 },
      { t: 0.5, type: 'strike', damage: 7, sfx: 'gust', break: 8 },
      { t: 1.0, type: 'gradient', damage: 12, sfx: 'beam', break: 14 },
    ],
    counter: { damage: 22, sfx: 'counter', break: 18 },
  },
  'bubble-spray': {
    id: 'bubble-spray', name: 'Bubble Spray', windup: 'breath', windupTime: 0.95,
    hits: [
      { t: 0.0, type: 'strike', damage: 6, sfx: 'bubble', break: 10 },
      { t: 0.35, type: 'strike', damage: 6, sfx: 'bubble', break: 10 },
      { t: 0.8, type: 'gradient', damage: 9, sfx: 'bubble', break: 12 },
    ],
    counter: { damage: 18, sfx: 'counter', break: 16 },
  },
  'tail-lash': {
    id: 'tail-lash', name: 'Tail Lash', windup: 'cast', windupTime: 0.8,
    hits: [
      { t: 0.0, type: 'strike', damage: 7, sfx: 'claw', break: 10 },
      { t: 0.3, type: 'jumpable', damage: 9, sfx: 'slam', break: 12 },
    ],
    counter: { damage: 16, sfx: 'counter', break: 14 },
  },
};
