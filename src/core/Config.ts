// Configuración global: tiers de calidad, keybinds, jugador, mundo, batalla.

export type QualityName = 'low' | 'medium' | 'high' | 'ultra';

export interface QualityTier {
  name: QualityName;
  label: string;
  pixelRatioCap: number;
  shadowMapSize: number;
  /** GTAO contact shadows. */
  ssao: boolean;
  bloom: boolean;
  /** Far-field depth of field in the grade pass. */
  dof: boolean;
  msaaSamples: number;
  /** Texel size of the big procedural bakes (asphalt, facades). */
  bakeSize: number;
  crowd: number;
  particleBudget: number;
  far: number;
}

export const QUALITY: Record<QualityName, QualityTier> = {
  low: { name: 'low', label: 'Baja', pixelRatioCap: 1, shadowMapSize: 1024, ssao: false, bloom: true, dof: false, msaaSamples: 0, bakeSize: 256, crowd: 60, particleBudget: 200, far: 420 },
  medium: { name: 'medium', label: 'Media', pixelRatioCap: 1.25, shadowMapSize: 2048, ssao: true, bloom: true, dof: false, msaaSamples: 2, bakeSize: 512, crowd: 110, particleBudget: 600, far: 520 },
  high: { name: 'high', label: 'Alta', pixelRatioCap: 1.5, shadowMapSize: 4096, ssao: true, bloom: true, dof: true, msaaSamples: 4, bakeSize: 512, crowd: 160, particleBudget: 1200, far: 600 },
  ultra: { name: 'ultra', label: 'Ultra', pixelRatioCap: 2, shadowMapSize: 4096, ssao: true, bloom: true, dof: true, msaaSamples: 4, bakeSize: 1024, crowd: 200, particleBudget: 1600, far: 600 },
};

export const KEYBINDS: Record<string, string> = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  sprint: 'ShiftLeft',
  crouch: 'ControlLeft',
  jump: 'Space',
  interact: 'KeyE',
  leanLeft: 'KeyQ',
  leanRight: 'KeyE',
  digivice: 'Tab',
  skill1: 'Digit1',
  skill2: 'Digit2',
  skill3: 'Digit3',
  skill4: 'Digit4',
  pause: 'Escape',
  view: 'KeyV',
};

export interface MoveDef {
  name: string;
  element: string;
  dmg: number;
  qteWindow: number;
  charge?: number;
}

export const MOVES: Record<string, MoveDef> = {
  babyFlame: { name: 'Baby Flame', element: 'fire', dmg: 18, qteWindow: 0.18 },
  peppersBreath: { name: 'Peppers Breath', element: 'fire', dmg: 26, charge: 1, qteWindow: 0.14 },
  boomBubble: { name: 'Boom Bubble', element: 'air', dmg: 16, qteWindow: 0.2 },
  airShot: { name: 'Air Shot', element: 'air', dmg: 22, qteWindow: 0.15 },
};

export interface GameConfig {
  quality: QualityName;
  readonly q: QualityTier;
  seed: number;
  player: {
    eyeHeight: number;
    walkSpeed: number;
    sprintMult: number;
    jumpVel: number;
    crouchMult: number;
    staminaMax: number;
    staminaDrain: number;
    staminaRegen: number;
    hp: number;
  };
  battle: { critMult: number; parryMult: number; arenaRadius: number };
  world: {
    /** GOLDEN gold shot (ART_DIRECTION §1). */
    startHour: number;
    /** Real seconds for a full 24 h cycle. */
    cycleSeconds: number;
    spawnRadius: number;
  };
  keys: Record<string, string>;
  mouse: { sensitivity: number; fov: number; fovSprint: number };
}

function qualityFromUrl(): QualityName | null {
  if (typeof location === 'undefined') return null;
  const q = new URLSearchParams(location.search).get('q');
  return q && q in QUALITY ? (q as QualityName) : null;
}

export function defaultConfig(): GameConfig {
  return {
    quality: qualityFromUrl() ?? 'high',
    get q() {
      return QUALITY[this.quality];
    },
    seed: 1337,
    player: {
      eyeHeight: 1.7,
      walkSpeed: 4.2,
      sprintMult: 1.7,
      jumpVel: 5.2,
      crouchMult: 0.45,
      staminaMax: 100,
      staminaDrain: 30,
      staminaRegen: 15,
      hp: 100,
    },
    battle: { critMult: 1.6, parryMult: 0.5, arenaRadius: 18 },
    world: { startHour: 17.0, cycleSeconds: 720, spawnRadius: 60 },
    keys: KEYBINDS,
    mouse: { sensitivity: 0.0022, fov: 70, fovSprint: 80 },
  };
}
