// Movimientos y cálculo de daño. Cada move tiene ventana de QTE.

import { MOVES, type MoveDef } from './Config';
import { EXTRA_MOVES, speciesMoveNames } from './DigimonData';

const ALL_MOVES: Record<string, MoveDef> = { ...MOVES, ...EXTRA_MOVES };

/** element -> ventaja (1.5×) / desventaja (0.7×) */
const ELEMENT_CHART: Record<string, { strong: string | null; weak: string | null }> = {
  fire: { strong: 'air', weak: 'water' },
  water: { strong: 'fire', weak: 'air' },
  air: { strong: 'water', weak: 'fire' },
  holy: { strong: 'metal', weak: null },
  metal: { strong: 'air', weak: 'fire' },
  neutral: { strong: null, weak: null },
};

export function getMove(id: string): MoveDef {
  return ALL_MOVES[id] ?? EXTRA_MOVES.tackle;
}

export function moveIdsFor(speciesId: string): string[] {
  return speciesMoveNames(speciesId);
}

export function elementMultiplier(attacker: string, defender: string): number {
  const a = ELEMENT_CHART[attacker] ?? ELEMENT_CHART.neutral;
  if (a.strong && a.strong === defender) return 1.5;
  if (a.weak && a.weak === defender) return 0.7;
  return 1.0;
}

export function computeDamage(o: { power: number; atk: number; def: number; level?: number; mult?: number }): number {
  const level = o.level ?? 5;
  const base = Math.floor(((2 * level / 5 + 2) * o.power * (o.atk / Math.max(1, o.def))) / 50) + 2;
  return Math.max(1, Math.floor(base * (o.mult ?? 1)));
}

export type QteGrade = 'crit' | 'hit' | 'miss';

export function qteResult(timing: number, window: number): QteGrade {
  const dist = Math.abs(timing - 0.5);
  if (dist <= window) return 'crit';
  if (dist <= Math.max(window * 2.5, 0.25)) return 'hit';
  return 'miss';
}

export function damageForMove(
  moveId: string,
  attacker: { element: string; atk: number },
  defender: { element: string; def: number },
  qte: QteGrade = 'hit',
  level = 5,
): number {
  const move = ALL_MOVES[moveId];
  if (!move || qte === 'miss') return 0;
  const mult = elementMultiplier(attacker.element, defender.element) * (qte === 'crit' ? 1.6 : 1);
  return computeDamage({ power: move.dmg, atk: attacker.atk, def: defender.def, level, mult });
}
