import { DIGIMON_SPECIES, statsAtLevel } from '../core/DigimonData';

/** Ids de `battle/engine/digichips` (no se importa: es otro subsistema). */
const DEFAULT_CHIPS = ['pepper-pack', 'reflex-core', 'ap-overclock'];

/**
 * PlayerData — estado persistente de la partida (un solo slot).
 *
 * Equipo de digimons (especie rookie, nivel, HP y XP entre combates), DigiChips
 * equipados, inventario, digihuevos, tiempo jugado y estadísticas de combate.
 * Se guarda en localStorage; el storage es inyectable para los tests (Node no
 * tiene localStorage). Puro: sin DOM ni THREE.
 */

export interface PartyRecord {
  species: string;
  level: number;
  hp: number;
  maxHp: number;
  xp: number;
}

export interface EggRecord {
  species: string;
  name: string;
  hatchInSeconds: number;
  secondsPlayed: number;
}

export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SaveData {
  version: 1;
  name: string;
  party: PartyRecord[];
  active: number;
  chips: string[];
  items: Record<string, number>;
  eggs: EggRecord[];
  badges: string[];
  playSeconds: number;
  wins: number;
  losses: number;
  battles: number;
}

export const SAVE_KEY = 'shibuya-protocol-save-v1';
const SAVE_VERSION = 1 as const;

export function partyRecord(species: string, level: number): PartyRecord {
  const maxHp = statsAtLevel(DIGIMON_SPECIES[species], level).hp;
  return { species, level, hp: maxHp, maxHp, xp: 0 };
}

export class PlayerDataStore {
  name = 'FalconOrtiz';
  party: PartyRecord[] = [];
  active = 0;
  chips: string[] = [...DEFAULT_CHIPS];
  items: Record<string, number> = {};
  eggs: EggRecord[] = [];
  badges: string[] = [];
  playSeconds = 0;
  wins = 0;
  losses = 0;
  battles = 0;

  private storage: SaveStorage | null = null;
  private lastSave = -Infinity;

  setStorage(s: SaveStorage | null): void {
    this.storage = s;
  }

  toJSON(): SaveData {
    return {
      version: SAVE_VERSION,
      name: this.name,
      party: this.party.map((p) => ({ ...p })),
      active: this.active,
      chips: [...this.chips],
      items: { ...this.items },
      eggs: this.eggs.map((e) => ({ ...e })),
      badges: [...this.badges],
      playSeconds: this.playSeconds,
      wins: this.wins,
      losses: this.losses,
      battles: this.battles,
    };
  }

  /** Restaura desde un objeto de guardado. true si era válido. */
  fromJSON(data: Partial<SaveData> | null | undefined): boolean {
    if (!data || data.version !== SAVE_VERSION) return false;
    if (typeof data.name === 'string') this.name = data.name;
    if (Array.isArray(data.party)) this.party = data.party.filter((p) => DIGIMON_SPECIES[p.species]).map((p) => ({ ...p }));
    this.active = Math.max(0, Math.min(this.party.length - 1, data.active ?? 0));
    if (Array.isArray(data.chips)) this.chips = data.chips.slice(0, 3);
    if (data.items && typeof data.items === 'object') this.items = { ...data.items };
    if (Array.isArray(data.eggs)) this.eggs = data.eggs.map((e) => ({ ...e }));
    if (Array.isArray(data.badges)) this.badges = [...data.badges];
    this.playSeconds = data.playSeconds ?? 0;
    this.wins = data.wins ?? 0;
    this.losses = data.losses ?? 0;
    this.battles = data.battles ?? 0;
    return true;
  }

  /** Carga desde el storage. Un guardado corrupto se descarta sin romper el arranque. */
  load(): boolean {
    if (!this.storage) return false;
    try {
      const raw = this.storage.getItem(SAVE_KEY);
      return raw ? this.fromJSON(JSON.parse(raw) as SaveData) : false;
    } catch {
      this.party = [];
      return false;
    }
  }

  saveNow(now = 0): void {
    this.lastSave = now;
    this.storage?.setItem(SAVE_KEY, JSON.stringify(this.toJSON()));
  }

  /** Guardado con throttle de 1 s; seguro de llamar cada turno. */
  save(now: number): void {
    if (now - this.lastSave < 1000) return;
    this.saveNow(now);
  }

  reset(): void {
    this.name = 'FalconOrtiz';
    this.party = [];
    this.active = 0;
    this.chips = [...DEFAULT_CHIPS];
    this.items = {};
    this.eggs = [];
    this.badges = [];
    this.playSeconds = 0;
    this.wins = 0;
    this.losses = 0;
    this.battles = 0;
    this.storage?.removeItem(SAVE_KEY);
  }

  get hasParty(): boolean {
    return this.party.length > 0;
  }

  get stats(): { wins: number; losses: number; battles: number } {
    return { wins: this.wins, losses: this.losses, battles: this.battles };
  }

  recordResult(result: 'victory' | 'defeat' | 'fled'): void {
    this.battles++;
    if (result === 'victory') this.wins++;
    else if (result === 'defeat') this.losses++;
    this.saveNow();
  }

  setDigichips(chips: string[]): void {
    this.chips = chips.slice(0, 3);
    this.saveNow();
  }

  healAll(): void {
    for (const p of this.party) p.hp = p.maxHp;
    this.saveNow();
  }
}
