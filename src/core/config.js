// src/core/config.js — configuración global, presets de calidad, keybinds.

export const QUALITY_PRESETS = {
  low: {
    label: 'Baja',
    pixelRatio: 1,
    shadowMapSize: 1024,
    antialias: false,
    gtao: false,
    bloom: false,
    volumetric: false,
    particleBudget: 200,
    decalBudget: 64,
    npcCount: 20,
    far: 250
  },
  medium: {
    label: 'Media',
    pixelRatio: 1.5,
    shadowMapSize: 2048,
    antialias: true,
    gtao: false,
    bloom: true,
    volumetric: false,
    particleBudget: 600,
    decalBudget: 128,
    npcCount: 40,
    far: 350
  },
  high: {
    label: 'Alta',
    pixelRatio: 2,
    shadowMapSize: 4096,
    antialias: true,
    gtao: true,
    bloom: true,
    volumetric: true,
    particleBudget: 1200,
    decalBudget: 256,
    npcCount: 70,
    far: 500
  }
};

export const KEYBINDS = {
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
  pause: 'Escape'
};

export const DIGIMON_STATS = {
  agumon: { name: 'Agumon', hp: 90, atk: 12, def: 8, sp: 10, color: 0xff8c2a },
  patamon: { name: 'Patamon', hp: 75, atk: 9, def: 7, sp: 14, color: 0xffe066 }
};

export const MOVES = {
  babyFlame: { name: 'Baby Flame', element: 'fire', dmg: 18, qteWindow: 0.18 },
  peppersBreath: { name: 'Peppers Breath', element: 'fire', dmg: 26, charge: 1, qteWindow: 0.14 },
  boomBubble: { name: 'Boom Bubble', element: 'air', dmg: 16, qteWindow: 0.20 },
  airShot: { name: 'Air Shot', element: 'air', dmg: 22, qteWindow: 0.15 }
};

export function defaultConfig() {
  return {
    quality: 'high',
    get q() { return QUALITY_PRESETS[this.quality]; },
    seed: 1337,
    player: {
      eyeHeight: 1.7,
      walkSpeed: 4.2,
      sprintMult: 1.7,
      jumpVel: 5.2,
      crouchMult: 0.45,
      staminaMax: 100,
      staminaDrain: 30,   // por segundo
      staminaRegen: 15,   // por segundo
      hp: 100
    },
    battle: {
      critMult: 1.6,
      parryMult: 0.5,
      arenaRadius: 18
    },
    world: {
      startHour: 17.0,      // golden hour cálido (estilo cartoon)
      daySpeed: 0.02,       // horas por segundo real
      spawnRadius: 60
    },
    keys: KEYBINDS,
    mouse: {
      sensitivity: 0.0022,
      fov: 75,
      fovSprint: 84
    }
  };
}
