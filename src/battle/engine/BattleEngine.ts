/**
 * BattleEngine — lógica de turnos pura. Sin THREE, sin DOM, sin timers.
 *
 * El motor es dueño del estado autoritativo de un combate y resuelve cada paso
 * como una lista tipada de eventos que la presentación (BattleSystem) reproduce
 * a su ritmo. Toda tirada pasa por el rng sembrado, así que un combate es una
 * función pura de (setup, seed, acciones): eso hace posibles los tests y las
 * capturas deterministas.
 *
 * Dos APIs:
 *  - `turn(action)`: turno clásico por velocidad (tests y fallback).
 *  - E33: `act()` → `beginEnemyAttack()` → `resolveHitFrame()`×N →
 *    `endEnemyAttack()`, más `resolveFreeAim()`.
 *
 * Reglas E33:
 *  - AP 0–9; básico +2; skills cuestan `apCost`; defensas +1; contra +1.
 *  - DATA BREAK 100: golpes limpios suman; decae −5/turno; al llenarse →
 *    aturdido 2 turnos, daño recibido ×1.5 y la barra se vacía.
 *  - Gradient +5% por AP gastado, +10% por defensa gradient; 100% → ULT
 *    (×2.5 del básico, +20 break, el turno del jugador se repite).
 *  - Digievolución: 50% Gradient → Champion, 100% → Ultimate.
 *  - Puntería libre: −1 AP, multiplicador del punto débil, +8 break.
 */

import { getMove, computeDamage, accuracyStageMultiplier, stageMultiplier, type MoveDef, type StatId } from '../../core/DigimonMoves';
import { DIGIMON_SPECIES, evolutionOf, statsAtLevel, type BaseStats } from '../../core/DigimonData';
import { makeRng } from '../../core/Noise';
import { ATTACK_TIMELINES, type AttackTimeline, type TimelineHit } from './timelines';
import { negatesDamage, defendAp, type DefendResult } from './DefendWindows';
import { skillDamageMult, overclockBonus, basicBreakBonus, gradualCharge } from './digichips';

export type Side = 'player' | 'wild';

export interface MoveSlot {
  id: string;
  pp: number;
}

export interface Combatant {
  side: Side;
  species: string;
  name: string;
  level: number;
  stats: BaseStats;
  hp: number;
  moves: MoveSlot[];
  stages: Record<StatId, number>;
  /** DATA BREAK 0..100. */
  break: number;
  /** Turnos de aturdimiento restantes; mientras > 0 ese lado solo defiende. */
  brokenTurns: number;
}

export type BattleAction = { type: 'move'; index: number } | { type: 'run' };

export type E33Action =
  | { type: 'basic' }
  | { type: 'skill'; index: number }
  | { type: 'ult' }
  | { type: 'digivolve' }
  | { type: 'run' };

export type BattleEvent =
  | {
      kind: 'move';
      side: Side;
      moveId: string;
      moveName: string;
      missed: boolean;
      damage: number;
      effectiveness: number;
      crit: boolean;
      hpAfter: number;
    }
  | { kind: 'stat'; side: Side; target: Side; stat: StatId; delta: number; failed: boolean; moveName: string }
  | { kind: 'faint'; side: Side }
  | { kind: 'run'; success: boolean }
  | { kind: 'end'; result: 'victory' | 'defeat' | 'fled' }
  | { kind: 'windup'; side: Side; timelineId: string; windupTime: number; hits: number }
  | {
      kind: 'hit-frame';
      side: Side;
      hitIndex: number;
      hit: TimelineHit;
      result: DefendResult;
      damage: number;
      hpAfter: number;
      ap: number;
      breakGain: number;
    }
  | { kind: 'counter'; side: Side; damage: number; hpAfter: number; ap: number }
  | { kind: 'break'; side: Side; broken: boolean; turns: number }
  | { kind: 'ult'; side: Side; damage: number; hpAfter: number; replay: true }
  | { kind: 'digivolve'; side: Side; from: string; to: string; name: string }
  | { kind: 'freeaim'; side: Side; weakPointId: string; mult: number; damage: number; hpAfter: number; ap: number };

export type BattleResult = 'victory' | 'defeat' | 'fled' | null;

export interface CombatantInit {
  species: string;
  level: number;
  /** HP arrastrado de un combate anterior; sin valor = lleno. */
  hp?: number;
}

function speciesOf(id: string) {
  const s = DIGIMON_SPECIES[id];
  if (!s) throw new Error(`[battle] especie desconocida: ${id}`);
  return s;
}

function buildCombatant(side: Side, init: CombatantInit): Combatant {
  const data = speciesOf(init.species);
  const stats = statsAtLevel(data, init.level);
  return {
    side,
    species: data.id,
    name: data.name.toUpperCase(),
    level: init.level,
    stats,
    hp: Math.max(1, Math.min(stats.hp, init.hp ?? stats.hp)),
    moves: data.moves.slice(0, 4).map((id) => ({ id, pp: getMove(id).pp })),
    stages: { atk: 0, def: 0, spe: 0, acc: 0 },
    break: 0,
    brokenTurns: 0,
  };
}

export const BREAK_POOL = 100;
export const BREAK_DECAY = 5;
export const BREAK_STUN_TURNS = 2;
export const BREAK_DMG_MULT = 1.5;
export const AP_MAX = 9;
export const AP_BASIC_GAIN = 2;
export const GRADIENT_PER_AP = 5;
export const GRADIENT_PER_DEFEND = 10;
export const ULT_MULT = 2.5;
export const COUNTER_MULT = 1.5;
export const FREE_AIM_COST = 1;
export const FREE_AIM_BREAK = 8;
export const DIGIVOLVE_COST = 50;
export const ULTIMATE_COST = 100;

/** Coste de Gradient de la siguiente digievolución (null si no hay más). */
export function digivolveCost(stage: number): number | null {
  if (stage >= 2) return null;
  return stage === 0 ? DIGIVOLVE_COST : ULTIMATE_COST;
}

export class Battle {
  readonly player: Combatant;
  readonly wild: Combatant;
  result: BattleResult = null;

  ap = 0;
  gradient = 0;
  chips: string[] = [];
  /** 0 Rookie, 1 Champion, 2 Ultimate. */
  evolutionStage = 0;
  /** Especie con la que empezó el combate (para des-digievolucionar al salir). */
  readonly baseSpecies: string;

  enemyAttacking = false;
  currentTimeline: AttackTimeline | null = null;
  parryCount = 0;
  timelineHits = 0;

  private rng: () => number;
  private runAttempts = 0;

  constructor(opts: { player: CombatantInit; wild: CombatantInit; seed: number; chips?: string[] }) {
    this.player = buildCombatant('player', opts.player);
    this.wild = buildCombatant('wild', opts.wild);
    this.baseSpecies = this.player.species;
    this.rng = makeRng(opts.seed >>> 0 || 1);
    this.chips = opts.chips ?? [];
  }

  side(s: Side): Combatant {
    return s === 'player' ? this.player : this.wild;
  }

  /* ---- Turno clásico ------------------------------------------------ */

  turn(action: BattleAction): BattleEvent[] {
    if (this.result) return [];
    const events: BattleEvent[] = [];

    if (action.type === 'run') {
      this.runAttempts++;
      if (this.tryRun()) {
        events.push({ kind: 'run', success: true }, { kind: 'end', result: 'fled' });
        this.result = 'fled';
        return events;
      }
      events.push({ kind: 'run', success: false });
      this.actClassic(this.wild, this.player, this.pickWildMove(), events);
      this.checkEnd(events);
      return events;
    }

    const playerMove = this.moveFor(this.player, action.index);
    const wildMove = this.pickWildMove();
    const order: [Combatant, Combatant, MoveDef][] =
      this.orderFirst(playerMove, wildMove) === 'player'
        ? [[this.player, this.wild, playerMove], [this.wild, this.player, wildMove]]
        : [[this.wild, this.player, wildMove], [this.player, this.wild, playerMove]];

    for (const [attacker, defender, move] of order) {
      if (this.result) break;
      if (attacker.hp <= 0) continue;
      this.actClassic(attacker, defender, move, events);
      this.checkEnd(events);
    }
    return events;
  }

  /* ---- E33: acción del jugador (siempre actúa primero) --------------- */

  act(action: E33Action): BattleEvent[] {
    if (this.result) return [];
    const events: BattleEvent[] = [];
    const refuse = (moveName: string): BattleEvent[] => {
      events.push({ kind: 'stat', side: 'player', target: 'player', stat: 'atk', delta: 0, failed: true, moveName });
      return events;
    };

    if (this.player.brokenTurns > 0 && action.type !== 'run') return refuse('STUNNED');

    if (action.type === 'run') {
      this.runAttempts++;
      if (this.tryRun()) {
        events.push({ kind: 'run', success: true }, { kind: 'end', result: 'fled' });
        this.result = 'fled';
      } else {
        events.push({ kind: 'run', success: false });
      }
      return events;
    }

    if (action.type === 'ult') {
      if (this.gradient < 100) return refuse('ULT');
      this.gradient = 0;
      const roll = this.rollDamage(this.player, this.wild, this.moveFor(this.player, 0), ULT_MULT);
      this.wild.hp = Math.max(0, this.wild.hp - roll.damage);
      this.addBreak(this.wild, 20);
      events.push({ kind: 'ult', side: 'player', damage: roll.damage, hpAfter: this.wild.hp, replay: true });
      if (this.wild.hp <= 0) events.push({ kind: 'faint', side: 'wild' });
      this.checkEnd(events);
      return events;
    }

    if (action.type === 'digivolve') {
      const to = evolutionOf(this.player.species);
      const cost = digivolveCost(this.evolutionStage);
      if (!to || cost === null || this.gradient < cost) return refuse('DIGIVOLVE');
      this.gradient -= cost;
      this.evolutionStage++;

      // El jugador pasa a la forma evolucionada: stats y moves nuevos, conserva el % de HP.
      const from = this.player.species;
      const hpRatio = this.player.hp / this.player.stats.hp;
      const evolved = buildCombatant('player', { species: to, level: this.player.level });
      this.player.species = evolved.species;
      this.player.name = evolved.name;
      this.player.stats = evolved.stats;
      this.player.hp = Math.max(1, Math.round(evolved.stats.hp * hpRatio));
      this.player.moves = evolved.moves;
      events.push({ kind: 'digivolve', side: 'player', from, to, name: evolved.name });
      return events;
    }

    const isBasic = action.type === 'basic';
    const index = isBasic ? 0 : Math.max(0, Math.min(this.player.moves.length - 1, action.index));
    const move = this.moveFor(this.player, index);

    if (!isBasic && move.apCost !== undefined) {
      if (this.ap < move.apCost) return refuse(move.name);
      this.ap -= move.apCost;
      this.gradient = Math.min(100, this.gradient + move.apCost * GRADIENT_PER_AP);
    } else {
      this.ap = Math.min(AP_MAX, this.ap + AP_BASIC_GAIN);
    }

    const slot = this.player.moves[index];
    if (slot.pp > 0) slot.pp--;

    const roll = this.rollDamage(this.player, this.wild, move, isBasic ? 1 : skillDamageMult(this.chips));
    this.wild.hp = Math.max(0, this.wild.hp - roll.damage);
    this.addBreak(this.wild, isBasic ? 12 + basicBreakBonus(this.chips) : 14);

    events.push({
      kind: 'move', side: 'player', moveId: move.id, moveName: move.name,
      missed: roll.damage === 0 && move.power > 0,
      damage: roll.damage, effectiveness: roll.effectiveness, crit: roll.crit, hpAfter: this.wild.hp,
    });
    if (this.wild.hp <= 0) events.push({ kind: 'faint', side: 'wild' });
    this.checkEnd(events);
    return events;
  }

  /* ---- E33: timeline enemiga ----------------------------------------- */

  /** Empieza el ataque enemigo. Si está aturdido, se salta el ataque entero. */
  beginEnemyAttack(): { event: BattleEvent; timeline: AttackTimeline | null } {
    if (this.result) return { event: { kind: 'end', result: this.result }, timeline: null };
    this.enemyAttacking = true;
    this.parryCount = 0;

    if (this.wild.brokenTurns > 0) {
      this.wild.brokenTurns--;
      this.enemyAttacking = false;
      return {
        event: { kind: 'stat', side: 'wild', target: 'player', stat: 'atk', delta: 0, failed: true, moveName: 'STUNNED' },
        timeline: null,
      };
    }

    const pool = speciesOf(this.wild.species).attacks;
    const id = pool.length ? pool[Math.min(pool.length - 1, Math.floor(this.rng() * pool.length))] : 'tackle-rush';
    const timeline = ATTACK_TIMELINES[id] ?? ATTACK_TIMELINES['tackle-rush'];
    this.currentTimeline = timeline;
    this.timelineHits = timeline.hits.length;
    return {
      event: { kind: 'windup', side: 'wild', timelineId: timeline.id, windupTime: timeline.windupTime, hits: timeline.hits.length },
      timeline,
    };
  }

  /** Resuelve un hit frame; `result` viene de DefendWindows.matchWindow (fuera del motor). */
  resolveHitFrame(hitIndex: number, result: DefendResult): BattleEvent[] {
    const events: BattleEvent[] = [];
    const timeline = this.currentTimeline;
    if (!timeline) return events;
    const hit = timeline.hits[Math.max(0, Math.min(timeline.hits.length - 1, hitIndex))];

    let damage = 0;
    let breakGain = 0;
    if (negatesDamage(result)) {
      this.ap = Math.min(AP_MAX, this.ap + defendAp(result));
      if (result === 'gradient') this.gradient = Math.min(100, this.gradient + GRADIENT_PER_DEFEND);
      if (result === 'parry' || result === 'perfect-parry') this.parryCount++;
    } else {
      damage = this.timelineDamage(hit.damage, this.player);
      this.player.hp = Math.max(0, this.player.hp - damage);
      breakGain = hit.break ?? 12;
      this.addBreak(this.player, breakGain);
    }

    events.push({
      kind: 'hit-frame', side: 'wild', hitIndex, hit, result, damage,
      hpAfter: this.player.hp, ap: this.ap, breakGain,
    });
    if (this.player.hp <= 0) events.push({ kind: 'faint', side: 'player' });
    this.checkEnd(events);
    return events;
  }

  /** Cierra el ataque: contra por combo parado, aturdimiento, decaimiento y chips. */
  endEnemyAttack(): BattleEvent[] {
    const events: BattleEvent[] = [];
    this.enemyAttacking = false;

    if (!this.result && this.currentTimeline && this.timelineHits > 0 && this.parryCount === this.timelineHits) {
      const counter = this.currentTimeline.counter ?? { damage: 18, sfx: 'counter', break: 14 };
      const roll = this.rollDamage(this.player, this.wild, this.moveFor(this.player, 0), COUNTER_MULT);
      this.wild.hp = Math.max(0, this.wild.hp - roll.damage);
      this.ap = Math.min(AP_MAX, this.ap + 1 + overclockBonus(this.chips));
      this.addBreak(this.wild, counter.break);
      events.push({ kind: 'counter', side: 'player', damage: roll.damage, hpAfter: this.wild.hp, ap: this.ap });
      if (this.wild.hp <= 0) {
        events.push({ kind: 'faint', side: 'wild' });
        this.checkEnd(events);
      }
    }

    if (this.wild.break >= BREAK_POOL && this.wild.brokenTurns === 0) {
      this.wild.brokenTurns = BREAK_STUN_TURNS;
      this.wild.break = 0;
      events.push({ kind: 'break', side: 'wild', broken: true, turns: BREAK_STUN_TURNS });
    }

    for (const c of [this.player, this.wild]) {
      if (c.brokenTurns === 0) c.break = Math.max(0, c.break - BREAK_DECAY);
    }
    const g = gradualCharge(this.chips);
    if (g > 0) this.gradient = Math.min(100, this.gradient + g);

    this.currentTimeline = null;
    this.timelineHits = 0;
    this.parryCount = 0;
    return events;
  }

  /* ---- E33: puntería libre ------------------------------------------- */

  resolveFreeAim(weakPointId: string, hit: boolean): BattleEvent[] {
    const events: BattleEvent[] = [];
    if (this.ap < FREE_AIM_COST || this.result) return events;
    this.ap -= FREE_AIM_COST;

    if (!hit) {
      events.push({ kind: 'freeaim', side: 'player', weakPointId, mult: 0, damage: 0, hpAfter: this.wild.hp, ap: this.ap });
      return events;
    }
    const wp = speciesOf(this.wild.species).weakPoints.find((w) => w.id === weakPointId);
    const mult = wp?.mult ?? 2;
    const roll = this.rollDamage(this.player, this.wild, this.moveFor(this.player, 0), mult);
    this.wild.hp = Math.max(0, this.wild.hp - roll.damage);
    this.addBreak(this.wild, FREE_AIM_BREAK);
    events.push({ kind: 'freeaim', side: 'player', weakPointId, mult, damage: roll.damage, hpAfter: this.wild.hp, ap: this.ap });
    if (this.wild.hp <= 0) {
      events.push({ kind: 'faint', side: 'wild' });
      this.checkEnd(events);
    }
    return events;
  }

  /* ---- Helpers --------------------------------------------------------- */

  private moveFor(c: Combatant, index: number): MoveDef {
    return getMove(c.moves[Math.max(0, Math.min(c.moves.length - 1, index))].id);
  }

  private pickWildMove(): MoveDef {
    const usable = this.wild.moves.filter((m) => m.pp > 0);
    const pool = usable.length > 0 ? usable : this.wild.moves;
    return getMove(pool[Math.min(pool.length - 1, Math.floor(this.rng() * pool.length))].id);
  }

  private orderFirst(playerMove: MoveDef, wildMove: MoveDef): Side {
    if (playerMove.priority !== wildMove.priority) return playerMove.priority > wildMove.priority ? 'player' : 'wild';
    const ps = this.player.stats.spe * stageMultiplier(this.player.stages.spe);
    const ws = this.wild.stats.spe * stageMultiplier(this.wild.stages.spe);
    if (ps !== ws) return ps > ws ? 'player' : 'wild';
    return this.rng() < 0.5 ? 'player' : 'wild';
  }

  private actClassic(attacker: Combatant, defender: Combatant, move: MoveDef, events: BattleEvent[]): void {
    const slot = attacker.moves.find((m) => m.id === move.id);
    if (slot && slot.pp > 0) slot.pp--;
    const hit = this.rng() < move.accuracy * accuracyStageMultiplier(attacker.stages.acc);

    if (move.category === 'status') {
      if (!hit || !move.effect) {
        events.push({
          kind: 'stat', side: attacker.side, target: defender.side,
          stat: move.effect?.stat ?? 'atk', delta: 0, failed: true, moveName: move.name,
        });
        return;
      }
      const target = move.effect.target === 'self' ? attacker : defender;
      const prev = target.stages[move.effect.stat];
      const next = Math.max(-6, Math.min(6, prev + move.effect.delta));
      target.stages[move.effect.stat] = next;
      events.push({
        kind: 'stat', side: attacker.side, target: target.side,
        stat: move.effect.stat, delta: next - prev, failed: next === prev, moveName: move.name,
      });
      return;
    }

    if (!hit) {
      events.push({
        kind: 'move', side: attacker.side, moveId: move.id, moveName: move.name,
        missed: true, damage: 0, effectiveness: 1, crit: false, hpAfter: defender.hp,
      });
      return;
    }

    const roll = this.rollDamage(attacker, defender, move, 1);
    defender.hp = Math.max(0, defender.hp - roll.damage);
    events.push({
      kind: 'move', side: attacker.side, moveId: move.id, moveName: move.name,
      missed: false, damage: roll.damage, effectiveness: roll.effectiveness, crit: roll.crit, hpAfter: defender.hp,
    });
    if (defender.hp <= 0) events.push({ kind: 'faint', side: defender.side });
  }

  /** Tirada de daño con multiplicador extra (skill, punto débil, contra, ult). */
  private rollDamage(attacker: Combatant, defender: Combatant, move: MoveDef, mult: number) {
    if (move.power <= 0) return { damage: 0, crit: false, effectiveness: 1 };
    const defMult = defender.brokenTurns > 0 ? BREAK_DMG_MULT : 1;
    const roll = computeDamage(
      attacker.level,
      move,
      Math.floor(attacker.stats.atk * stageMultiplier(attacker.stages.atk)),
      Math.floor(defender.stats.def * stageMultiplier(defender.stages.def)),
      attacker.stats.atk,
      defender.stats.def,
      speciesOf(attacker.species).element,
      speciesOf(defender.species).element,
      this.rng,
    );
    return {
      damage: Math.max(1, Math.floor(roll.damage * mult * defMult)),
      crit: roll.crit,
      effectiveness: roll.effectiveness,
    };
  }

  /** Daño de un hit de timeline: base plana escalada por la DEF del jugador. */
  private timelineDamage(base: number, defender: Combatant): number {
    // `base` es % de la vida máxima del defensor ante un rival igual; así un
    // combo sin defender cuesta ~1/3 de la barra en cualquier nivel.
    const def = Math.max(1, defender.stats.def * stageMultiplier(defender.stages.def));
    const atk = Math.max(1, this.wild.stats.atk * stageMultiplier(this.wild.stages.atk));
    const ratio = Math.min(2, Math.max(0.5, Math.sqrt(atk / def)));
    const gap = Math.min(2, Math.max(0.5, 1 + (this.wild.level - defender.level) * 0.08));
    let dmg = Math.max(1, Math.round((base / 100) * defender.stats.hp * ratio * gap * 1.2));
    if (defender.brokenTurns > 0) dmg = Math.floor(dmg * BREAK_DMG_MULT);
    return dmg;
  }

  private addBreak(target: Combatant, amount: number): void {
    if (target.brokenTurns > 0) return;
    target.break = Math.min(BREAK_POOL, target.break + amount);
  }

  private checkEnd(events: BattleEvent[]): void {
    if (this.result) return;
    if (this.wild.hp <= 0) {
      this.result = 'victory';
      events.push({ kind: 'end', result: 'victory' });
    } else if (this.player.hp <= 0) {
      this.result = 'defeat';
      events.push({ kind: 'end', result: 'defeat' });
    }
  }

  /** Huida clásica: con buena velocidad casi siempre sale, pero la tirada existe. */
  private tryRun(): boolean {
    const a = this.player.stats.spe;
    const b = Math.max(1, Math.floor(this.wild.stats.spe / 4) % 256);
    const f = Math.floor((a * 32) / b) + 30 * this.runAttempts;
    if (f > 255) return true;
    return Math.floor(this.rng() * 256) < f;
  }
}
