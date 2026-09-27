// Movimientos y fórmulas de daño (puro: sin THREE, sin DOM, rng inyectado).
// Lo comparten el motor E33 (`battle/engine`), el HUD y el Digivice.

import type { Element } from './DigimonData';

export type StatId = 'atk' | 'def' | 'spe' | 'acc';

/** Pista de presentación para BattleFX. */
export type MoveFx = 'slash' | 'tackle' | 'quick' | 'fire' | 'bubble' | 'gust' | 'sonic' | 'dive' | 'holy' | 'growl';

export interface MoveDef {
  id: string;
  name: string;
  element: Element;
  /** 0 para moves de estado. */
  power: number;
  /** 0..1. */
  accuracy: number;
  pp: number;
  priority: number;
  category: 'physical' | 'status';
  /** Coste de AP (E33). Sin coste = ataque básico (+2 AP). */
  apCost?: number;
  effect?: { stat: StatId; delta: number; target: 'foe' | 'self' };
  fx: MoveFx;
}

const basic = (id: string, name: string, element: Element, power: number, fx: MoveFx): MoveDef => ({
  id, name, element, power, accuracy: 1, pp: 35, priority: 0, category: 'physical', fx,
});
const skill = (id: string, name: string, element: Element, power: number, apCost: number, pp: number, fx: MoveFx): MoveDef => ({
  id, name, element, power, accuracy: 1, pp, priority: 0, category: 'physical', apCost, fx,
});

export const MOVES: Record<string, MoveDef> = Object.fromEntries(
  [
    /* ---- In-Training (salvajes) ------------------------------------ */
    basic('tackle', 'Tackle', 'neutral', 36, 'tackle'),
    basic('bubble-blow', 'Bubble Blow', 'water', 38, 'bubble'),
    {
      id: 'tail-whip', name: 'Tail Whip', element: 'neutral', power: 0, accuracy: 1, pp: 30,
      priority: 0, category: 'status', effect: { stat: 'def', delta: -1, target: 'foe' }, fx: 'growl',
    } satisfies MoveDef,

    /* ---- Agumon ---------------------------------------------------- */
    basic('claw-attack', 'Claw Attack', 'fire', 40, 'slash'),
    skill('baby-flame', 'Baby Flame', 'fire', 56, 2, 20, 'fire'),
    skill('pepper-breath', 'Pepper Breath', 'fire', 72, 3, 15, 'fire'),
    skill('baby-burner', 'Baby Burner', 'fire', 120, 5, 8, 'fire'),

    /* ---- Patamon --------------------------------------------------- */
    basic('wing-slap', 'Wing Slap', 'air', 40, 'gust'),
    skill('air-shot', 'Air Shot', 'air', 56, 2, 20, 'sonic'),
    skill('boom-bubble', 'Boom Bubble', 'air', 72, 3, 15, 'bubble'),
    skill('sky-dive', 'Sky Dive', 'air', 104, 4, 10, 'dive'),

    /* ---- Champion -------------------------------------------------- */
    basic('horn-strike', 'Horn Strike', 'fire', 48, 'tackle'),
    skill('mega-flame', 'Mega Flame', 'fire', 80, 3, 12, 'fire'),
    skill('nova-blast', 'Nova Blast', 'fire', 130, 5, 6, 'fire'),
    basic('angel-rod', 'Angel Rod', 'holy', 48, 'slash'),
    skill('heavens-knuckle', "Heaven's Knuckle", 'holy', 80, 3, 12, 'holy'),
    skill('hand-of-fate', 'Hand of Fate', 'holy', 120, 5, 6, 'holy'),

    /* ---- Ultimate -------------------------------------------------- */
    basic('metal-claw', 'Metal Claw', 'metal', 52, 'slash'),
    skill('giga-blaster', 'Giga Blaster', 'fire', 92, 3, 10, 'fire'),
    skill('giga-destroyer', 'Giga Destroyer', 'metal', 150, 5, 5, 'fire'),
    basic('excalibur', 'Excalibur', 'holy', 52, 'slash'),
    skill('magna-antidote', 'Magna Antidote', 'holy', 92, 3, 10, 'holy'),
    skill('gate-of-destiny', 'Gate of Destiny', 'holy', 150, 5, 5, 'holy'),
  ].map((m) => [m.id, m]),
);

export function getMove(id: string): MoveDef {
  return MOVES[id] ?? MOVES.tackle;
}

/** Ventaja 1.5× / desventaja 0.67×; todo lo demás es neutro. */
const CHART: Partial<Record<Element, Partial<Record<Element, number>>>> = {
  fire: { air: 1.5, water: 0.67 },
  water: { fire: 1.5, air: 0.67 },
  air: { water: 1.5, fire: 0.67 },
  holy: { metal: 1.5 },
  metal: { air: 1.5, fire: 0.67 },
};

export function effectiveness(moveElement: Element, defender: Element): number {
  return CHART[moveElement]?.[defender] ?? 1;
}

/** Multiplicador de etapas -6..+6 → 2/8 .. 8/2. */
export function stageMultiplier(stage: number): number {
  const s = Math.max(-6, Math.min(6, stage));
  return s >= 0 ? (2 + s) / 2 : 2 / (2 - s);
}

/** La precisión usa tercios en lugar de medios. */
export function accuracyStageMultiplier(stage: number): number {
  const s = Math.max(-6, Math.min(6, stage));
  return s >= 0 ? (3 + s) / 3 : 3 / (3 - s);
}

export interface DamageRoll {
  damage: number;
  crit: boolean;
  effectiveness: number;
  stab: boolean;
}

/**
 * Daño clásico de RPG. Crítico 1/16 que dobla el término de nivel e ignora las
 * etapas (así un jugador con ATK bajado a -6 aún puede ganar).
 */
export function computeDamage(
  level: number,
  move: MoveDef,
  atk: number,
  def: number,
  atkUnmodified: number,
  defUnmodified: number,
  attacker: Element,
  defender: Element,
  rng: () => number,
): DamageRoll {
  const eff = effectiveness(move.element, defender);
  const stab = move.element === attacker;
  if (move.power <= 0 || eff === 0) return { damage: 0, crit: false, effectiveness: eff, stab };

  const crit = rng() < 1 / 16;
  const L = crit ? level * 2 : level;
  const A = crit ? atkUnmodified : atk;
  const D = crit ? defUnmodified : def;

  let dmg = Math.floor(Math.floor((Math.floor((2 * L) / 5 + 2) * move.power * A) / Math.max(1, D)) / 50) + 2;
  if (stab) dmg = Math.floor(dmg * 1.5);
  dmg = Math.floor(dmg * eff);
  if (dmg > 0) {
    const roll = 217 + Math.floor(rng() * 39);
    dmg = Math.max(1, Math.floor((dmg * roll) / 255));
  }
  return { damage: dmg, crit, effectiveness: eff, stab };
}
