// src/digimon/registry.js — datos de especies digimon.
// Fuente única de stats/nombre/color/moves por especie.

import { MOVES } from '../core/config.js';

export const DIGIMON_SPECIES = {
  agumon: {
    id: 'agumon',
    name: 'Agumon',
    element: 'fire',
    hp: 90, atk: 12, def: 8, sp: 10,
    color: 0xff8c2a,
    moves: ['babyFlame', 'peppersBreath'],
    description: 'Un digimon reptil que sueña con ser fuerte. Su Peppers Breath quema todo.',
    digivolvesTo: 'greymon'
  },
  patamon: {
    id: 'patamon',
    name: 'Patamon',
    element: 'air',
    hp: 75, atk: 9, def: 7, sp: 14,
    color: 0xffe066,
    moves: ['boomBubble', 'airShot'],
    description: 'Una cría alada alegre. Sus Boom Bubbles explotan con sorpresa.',
    digivolvesTo: 'angemon'
  },
  // salvajes
  koromon: {
    id: 'koromon',
    name: 'Koromon',
    element: 'neutral',
    hp: 50, atk: 7, def: 5, sp: 6,
    color: 0xffb0a0,
    moves: ['tackle'],
    description: 'Un digimon esférico rosa que bota por Shibuya. Débil pero insistente.',
    wild: true
  },
  nyaromon: {
    id: 'nyaromon',
    name: 'Nyaromon',
    element: 'neutral',
    hp: 55, atk: 8, def: 5, sp: 9,
    color: 0xffd27a,
    moves: ['tackle', 'tailWhip'],
    description: 'Un digimon gatuno que ronronea. Su cola golpea más de lo que parece.',
    wild: true
  },
  bukamon: {
    id: 'bukamon',
    name: 'Bukamon',
    element: 'water',
    hp: 60, atk: 9, def: 6, sp: 8,
    color: 0x7ac0ff,
    moves: ['bubbleBlow'],
    description: 'Un digimon marino que nada por los charcos de Shibuya después de llover.',
    wild: true
  }
};

export function getSpecies(id) {
  return DIGIMON_SPECIES[id];
}

export function speciesMoveNames(id) {
  const sp = DIGIMON_SPECIES[id];
  return sp ? sp.moves : [];
}

// movimientos que existen (tackle/tailWhip/bubbleBlow son de salvajes)
export const EXTRA_MOVES = {
  tackle: { name: 'Tackle', element: 'neutral', dmg: 10, qteWindow: 0.22 },
  tailWhip: { name: 'Tail Whip', element: 'neutral', dmg: 12, qteWindow: 0.2 },
  bubbleBlow: { name: 'Bubble Blow', element: 'water', dmg: 11, qteWindow: 0.21 }
};
