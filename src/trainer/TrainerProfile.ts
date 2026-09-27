import type { Ctx, GameSystem } from '../core/Context';
import { PlayerDataStore, partyRecord, type EggRecord, type PartyRecord } from './PlayerData';

/**
 * Perfil del trainer y guardado local. Único dueño de PlayerData: el resto de
 * subsistemas leen con `ctx.get('trainer')` y escriben por eventos o por los
 * métodos de aquí, nunca tocando el storage.
 *
 * En modo captura (`?capture`) no se lee ni se escribe localStorage, para que
 * cada toma parta del mismo estado.
 */
export class TrainerProfile implements GameSystem {
  static id = 'trainer';
  static deps: string[] = [];

  readonly data = new PlayerDataStore();
  level = 42;
  private ctx!: Ctx;

  get name(): string {
    return this.data.name;
  }
  set name(v: string) {
    this.data.name = v;
  }
  get wins(): number {
    return this.data.wins;
  }
  get losses(): number {
    return this.data.losses;
  }
  get badges(): string[] {
    return this.data.badges;
  }
  get team(): string[] {
    return this.data.party.map((p) => p.species);
  }

  init(ctx: Ctx): this {
    this.ctx = ctx;
    const capture = typeof location !== 'undefined' && new URLSearchParams(location.search).has('capture');
    if (!capture && typeof localStorage !== 'undefined') this.data.setStorage(localStorage);
    const loaded = this.data.load();
    if (!this.data.hasParty) this.data.party = [partyRecord('agumon', 5), partyRecord('patamon', 4)];

    ctx.events.on('inventory:changed', (p: { item: string; count: number }) => {
      this.data.items[p.item] = p.count;
      this.persist();
    });
    ctx.events.on('battle:end', (p: { result: 'win' | 'lose' | 'fled' }) => {
      this.data.recordResult(p.result === 'win' ? 'victory' : p.result === 'lose' ? 'defeat' : 'fled');
      this.emitStats();
    });
    if (loaded) ctx.events.emit('save:loaded', { data: this.data.toJSON() });
    return this;
  }

  /** Estado guardado del equipo (DigimonSystem lo lee al arrancar). */
  savedParty(): { party: PartyRecord[]; active: number } {
    return { party: this.data.party, active: this.data.active };
  }

  /** DigimonSystem vuelca aquí el equipo tras cada cambio de HP/XP/nivel. */
  syncParty(party: PartyRecord[], active: number): void {
    this.data.party = party.map((p) => ({ ...p }));
    this.data.active = active;
    this.persist();
  }

  get chips(): string[] {
    return this.data.chips;
  }
  setChips(chips: string[]): void {
    this.data.setDigichips(chips);
  }

  savedItems(): Record<string, number> {
    return this.data.items;
  }
  savedEggs(): EggRecord[] {
    return this.data.eggs;
  }
  setEggs(eggs: EggRecord[]): void {
    this.data.eggs = eggs.map((e) => ({ ...e }));
    this.persist();
  }

  addBadge(name: string): void {
    if (this.data.badges.includes(name)) return;
    this.data.badges.push(name);
    this.ctx.events.emit('trainer:badge', { badge: name });
    this.persist(true);
  }

  update(dt: number): void {
    this.data.playSeconds += dt;
  }

  /** Guarda con throttle de 1 s, o inmediatamente con `now`. */
  persist(now = false): void {
    const t = performance.now();
    if (!now) {
      this.data.save(t);
      return;
    }
    this.data.saveNow(t);
    this.ctx.events.emit('save:written', { data: this.data.toJSON() });
  }

  private emitStats(): void {
    this.ctx.events.emit('trainer:stats', { wins: this.data.wins, losses: this.data.losses });
  }

  dispose(): void {
    this.data.saveNow(performance.now());
  }
}
