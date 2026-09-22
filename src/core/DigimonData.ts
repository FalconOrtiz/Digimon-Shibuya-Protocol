// Fuente única por especie: nombre, elemento, stats base, moves, ataques E33 y
// cadena de digievolución. Puro: lo leen digimon/, battle/, digivice/ y ui/.

export type Element = 'fire' | 'air' | 'water' | 'neutral' | 'holy' | 'metal';

export type Stage = 'in-training' | 'rookie' | 'champion' | 'ultimate';

export interface BaseStats {
  hp: number;
  atk: number;
  def: number;
  /** Velocidad: orden de turno clásico y probabilidad de huida. */
  spe: number;
}

export interface WeakPoint {
  id: string;
  part: string;
  mult: number;
  radius: number;
}

export interface SpeciesDef {
  id: string;
  name: string;
  element: Element;
  stage: Stage;
  base: BaseStats;
  /** Ids de `MOVES`: el primero es el básico (+2 AP), el resto skills con coste. */
  moves: string[];
  /** Timelines E33 que usa cuando ataca (`battle/engine/timelines`). */
  attacks: string[];
  weakPoints: WeakPoint[];
  color: number;
  description: string;
  digivolvesTo?: string;
  wild?: boolean;
}

const core = (mult: number, radius: number): WeakPoint[] => [{ id: 'core', part: 'body', mult, radius }];

export const DIGIMON_SPECIES: Record<string, SpeciesDef> = {
  agumon: {
    id: 'agumon', name: 'Agumon', element: 'fire', stage: 'rookie',
    base: { hp: 44, atk: 60, def: 46, spe: 58 },
    moves: ['claw-attack', 'baby-flame', 'pepper-breath', 'baby-burner'],
    attacks: ['pepper-breath', 'tackle-rush'],
    weakPoints: core(2, 0.22),
    color: 0xe08030,
    description: 'Un digimon reptil que sueña con ser fuerte. Su Pepper Breath quema todo.',
    digivolvesTo: 'greymon',
  },
  patamon: {
    id: 'patamon', name: 'Patamon', element: 'air', stage: 'rookie',
    base: { hp: 42, atk: 52, def: 48, spe: 66 },
    moves: ['wing-slap', 'air-shot', 'boom-bubble', 'sky-dive'],
    attacks: ['wing-gust', 'sonic-sweep'],
    weakPoints: core(2, 0.2),
    color: 0xf0a040,
    description: 'Una cría alada alegre. Sus Boom Bubbles explotan con sorpresa.',
    digivolvesTo: 'angemon',
  },
  greymon: {
    id: 'greymon', name: 'Greymon', element: 'fire', stage: 'champion',
    base: { hp: 60, atk: 78, def: 60, spe: 62 },
    moves: ['horn-strike', 'mega-flame', 'nova-blast'],
    attacks: ['pepper-breath', 'tackle-rush'],
    weakPoints: core(2, 0.24),
    color: 0xe88a2a,
    description: 'Dinosaurio de casco óseo. Su Nova Blast funde el asfalto.',
    digivolvesTo: 'metalgreymon',
  },
  angemon: {
    id: 'angemon', name: 'Angemon', element: 'holy', stage: 'champion',
    base: { hp: 56, atk: 68, def: 62, spe: 74 },
    moves: ['angel-rod', 'heavens-knuckle', 'hand-of-fate'],
    attacks: ['wing-gust', 'sonic-sweep'],
    weakPoints: core(2, 0.22),
    color: 0xf2efe8,
    description: 'Ángel guerrero de seis alas. Su Hand of Fate purifica datos corruptos.',
    digivolvesTo: 'magnaangemon',
  },
  metalgreymon: {
    id: 'metalgreymon', name: 'MetalGreymon', element: 'metal', stage: 'ultimate',
    base: { hp: 78, atk: 98, def: 78, spe: 68 },
    moves: ['metal-claw', 'giga-blaster', 'giga-destroyer'],
    attacks: ['pepper-breath', 'tackle-rush'],
    weakPoints: core(2, 0.26),
    color: 0xe88a2a,
    description: 'Cyborg de brazo metálico. Su Giga Destroyer arrasa manzanas enteras.',
  },
  magnaangemon: {
    id: 'magnaangemon', name: 'MagnaAngemon', element: 'holy', stage: 'ultimate',
    base: { hp: 72, atk: 86, def: 80, spe: 82 },
    moves: ['excalibur', 'magna-antidote', 'gate-of-destiny'],
    attacks: ['wing-gust', 'sonic-sweep'],
    weakPoints: core(2, 0.24),
    color: 0xf2efe8,
    description: 'Ángel acorazado. Abre la Gate of Destiny sobre el cruce.',
  },
  koromon: {
    id: 'koromon', name: 'Koromon', element: 'neutral', stage: 'in-training', wild: true,
    base: { hp: 40, atk: 44, def: 38, spe: 42 },
    moves: ['tackle', 'bubble-blow'],
    attacks: ['tackle-rush', 'bubble-spray'],
    weakPoints: core(2.2, 0.2),
    color: 0xffb0a0,
    description: 'Un digimon esférico rosa que bota por Shibuya. Débil pero insistente.',
  },
  nyaromon: {
    id: 'nyaromon', name: 'Nyaromon', element: 'neutral', stage: 'in-training', wild: true,
    base: { hp: 38, atk: 46, def: 36, spe: 56 },
    moves: ['tackle', 'tail-whip'],
    attacks: ['tail-lash', 'tackle-rush'],
    weakPoints: core(2.2, 0.18),
    color: 0xffd27a,
    description: 'Un digimon gatuno que ronronea. Su cola golpea más de lo que parece.',
  },
  bukamon: {
    id: 'bukamon', name: 'Bukamon', element: 'water', stage: 'in-training', wild: true,
    base: { hp: 46, atk: 42, def: 42, spe: 46 },
    moves: ['bubble-blow', 'tackle'],
    attacks: ['bubble-spray', 'tail-lash'],
    weakPoints: core(2.2, 0.2),
    color: 0x7ac0ff,
    description: 'Un digimon marino que nada por los charcos de Shibuya después de llover.',
  },
};

export function getSpecies(id: string): SpeciesDef | undefined {
  return DIGIMON_SPECIES[id];
}

export function speciesMoveNames(id: string): string[] {
  return DIGIMON_SPECIES[id]?.moves ?? [];
}

/** Stats a un nivel, sin IV/EV. */
export function statsAtLevel(species: SpeciesDef, level: number): BaseStats {
  const grow = (base: number) => Math.floor((2 * base * level) / 100);
  return {
    hp: grow(species.base.hp) + level + 10,
    atk: grow(species.base.atk) + 5,
    def: grow(species.base.def) + 5,
    spe: grow(species.base.spe) + 5,
  };
}

/** XP para subir del nivel n al n+1. */
export function xpToNext(level: number): number {
  return 20 + level * 12;
}

/** XP que da derrotar a un salvaje de ese nivel. */
export function xpForDefeating(level: number): number {
  return 15 + level * 5;
}

/** Rookie → Champion → Ultimate. */
export function evolutionOf(id: string): string | undefined {
  return DIGIMON_SPECIES[id]?.digivolvesTo;
}
