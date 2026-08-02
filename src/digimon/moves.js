// src/digimon/moves.js — definición de movimientos y cálculo de daño.
// Cada move tiene ventana de QTE (fracción de la barra donde es crit).

import { MOVES } from '../core/config.js';
import { EXTRA_MOVES, speciesMoveNames } from './registry.js';

const ALL_MOVES = { ...MOVES, ...EXTRA_MOVES };

// element -> ventaja (1.5×) / desventaja (0.7×)
const ELEMENT_CHART = {
  fire: { strong: 'air', weak: 'water' },
  water: { strong: 'fire', weak: 'air' },
  air: { strong: 'water', weak: 'fire' },
  neutral: { strong: null, weak: null }
};

export function getMove(id) {
  return ALL_MOVES[id];
}

export function moveIdsFor(speciesId) {
  return speciesMoveNames(speciesId);
}

export function elementMultiplier(attacker, defender) {
  const a = ELEMENT_CHART[attacker] || ELEMENT_CHART.neutral;
  if (a.strong && a.strong === defender) return 1.5;
  if (a.weak && a.weak === defender) return 0.7;
  return 1.0;
}

// daño base estilo Pokémon-ish:
// floor( ((2*level/5 + 2) * power * atk/def) / 50 ) + 2  — simplificado
export function computeDamage({ power, atk, def, level = 5, mult = 1.0 }) {
  const base = Math.floor(((2 * level / 5 + 2) * power * (atk / Math.max(1, def))) / 50) + 2;
  return Math.max(1, Math.floor(base * mult));
}

// resultado de QTE: 'crit' | 'hit' | 'miss'
export function qteResult(timing, window, critMult) {
  // timing: 0..1 posición donde pulsaste en la barra; window: ancho de la zona dorada
  const center = 0.5;
  const dist = Math.abs(timing - center);
  const critZone = window;
  const hitZone = Math.max(critZone * 2.5, 0.25);
  if (dist <= critZone) return 'crit';
  if (dist <= hitZone) return 'hit';
  return 'miss';
}

export function damageForMove(moveId, attackerStats, defenderStats, qte = 'hit', level = 5) {
  const move = ALL_MOVES[moveId];
  if (!move) return 0;
  const mult = elementMultiplier(attackerStats.element, defenderStats.element);
  let qteMult = 1.0;
  if (qte === 'crit') qteMult = 1.6;
  if (qte === 'miss') return 0;
  return computeDamage({
    power: move.dmg,
    atk: attackerStats.atk,
    def: defenderStats.def,
    level,
    mult: mult * qteMult
  });
}
