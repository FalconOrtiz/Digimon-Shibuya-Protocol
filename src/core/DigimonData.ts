// Fuente única de stats / nombre / color / moves por especie.

import type { MoveDef } from './Config';

export type Element = 'fire' | 'air' | 'water' | 'neutral' | 'holy' | 'metal';

export interface SpeciesDef {
  id: string;
  name: string;
  element: Element;
  hp: number;
  atk: number;
  def: number;
  sp: number;
  color: number;
  moves: string[];
  description: string;
  stage: 'rookie' | 'champion' | 'ultimate' | 'wild';
  digivolvesTo?: string;
  wild?: boolean;
}

export const DIGIMON_SPECIES: Record<string, SpeciesDef> = {
  agumon: {
    id: 'agumon', name: 'Agumon', element: 'fire', stage: 'rookie',
    hp: 90, atk: 12, def: 8, sp: 10, color: 0xe08030,
    moves: ['babyFlame', 'peppersBreath'],
    description: 'Un digimon reptil que sueña con ser fuerte. Su Peppers Breath quema todo.',
    digivolvesTo: 'greymon',
  },
  patamon: {
    id: 'patamon', name: 'Patamon', element: 'air', stage: 'rookie',
    hp: 75, atk: 9, def: 7, sp: 14, color: 0xf0e0c8,
    moves: ['boomBubble', 'airShot'],
    description: 'Una cría alada alegre. Sus Boom Bubbles explotan con sorpresa.',
    digivolvesTo: 'angemon',
  },
  greymon: {
    id: 'greymon', name: 'Greymon', element: 'fire', stage: 'champion',
    hp: 140, atk: 19, def: 13, sp: 11, color: 0xe88a2a,
    moves: ['megaFlame', 'hornStrike'],
    description: 'Dinosaurio de casco óseo. Su Mega Flame funde el asfalto.',
    digivolvesTo: 'metalgreymon',
  },
  angemon: {
    id: 'angemon', name: 'Angemon', element: 'holy', stage: 'champion',
    hp: 120, atk: 16, def: 12, sp: 16, color: 0xf2efe8,
    moves: ['handOfFate', 'angelRod'],
    description: 'Ángel guerrero de seis alas. Su Hand of Fate purifica datos corruptos.',
    digivolvesTo: 'magnaangemon',
  },
  metalgreymon: {
    id: 'metalgreymon', name: 'MetalGreymon', element: 'metal', stage: 'ultimate',
    hp: 190, atk: 26, def: 18, sp: 12, color: 0xe88a2a,
    moves: ['gigaDestroyer', 'megaFlame'],
    description: 'Cyborg de brazo metálico. Sus Giga Destroyer arrasan manzanas enteras.',
  },
  magnaangemon: {
    id: 'magnaangemon', name: 'MagnaAngemon', element: 'holy', stage: 'ultimate',
    hp: 170, atk: 23, def: 17, sp: 18, color: 0xf2efe8,
    moves: ['gateOfDestiny', 'handOfFate'],
    description: 'Ángel acorazado. Abre la Gate of Destiny sobre el cruce.',
  },
  koromon: {
    id: 'koromon', name: 'Koromon', element: 'neutral', stage: 'wild', wild: true,
    hp: 50, atk: 7, def: 5, sp: 6, color: 0xffb0a0,
    moves: ['tackle'],
    description: 'Un digimon esférico rosa que bota por Shibuya. Débil pero insistente.',
  },
  nyaromon: {
    id: 'nyaromon', name: 'Nyaromon', element: 'neutral', stage: 'wild', wild: true,
    hp: 55, atk: 8, def: 5, sp: 9, color: 0xffd27a,
    moves: ['tackle', 'tailWhip'],
    description: 'Un digimon gatuno que ronronea. Su cola golpea más de lo que parece.',
  },
  bukamon: {
    id: 'bukamon', name: 'Bukamon', element: 'water', stage: 'wild', wild: true,
    hp: 60, atk: 9, def: 6, sp: 8, color: 0x7ac0ff,
    moves: ['bubbleBlow'],
    description: 'Un digimon marino que nada por los charcos de Shibuya después de llover.',
  },
};

export function getSpecies(id: string): SpeciesDef | undefined {
  return DIGIMON_SPECIES[id];
}

export function speciesMoveNames(id: string): string[] {
  return DIGIMON_SPECIES[id]?.moves ?? [];
}

export const EXTRA_MOVES: Record<string, MoveDef> = {
  tackle: { name: 'Tackle', element: 'neutral', dmg: 10, qteWindow: 0.22 },
  tailWhip: { name: 'Tail Whip', element: 'neutral', dmg: 12, qteWindow: 0.2 },
  bubbleBlow: { name: 'Bubble Blow', element: 'water', dmg: 11, qteWindow: 0.21 },
  megaFlame: { name: 'Mega Flame', element: 'fire', dmg: 30, qteWindow: 0.15 },
  hornStrike: { name: 'Horn Strike', element: 'neutral', dmg: 24, qteWindow: 0.18 },
  handOfFate: { name: 'Hand of Fate', element: 'holy', dmg: 28, qteWindow: 0.15 },
  angelRod: { name: 'Angel Rod', element: 'holy', dmg: 22, qteWindow: 0.18 },
  gigaDestroyer: { name: 'Giga Destroyer', element: 'metal', dmg: 40, qteWindow: 0.12 },
  gateOfDestiny: { name: 'Gate of Destiny', element: 'holy', dmg: 38, qteWindow: 0.12 },
};
