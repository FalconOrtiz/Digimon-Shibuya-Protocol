import * as THREE from 'three';
import { buildDigimon, disposeDigimon } from './models';
import { DigimonAnimator } from './anim';
import { getSpecies, statsAtLevel, xpToNext, type SpeciesDef } from '../core/DigimonData';
import type { Ctx, GameSystem } from '../core/Context';
import { groundHeightAt } from '../core/Layout';

/**
 * Partner Digimon: el equipo, el modelo 3D que sigue al trainer en exploración
 * (la misma escultura que en combate) y la fábrica de salvajes que usan otros
 * subsistemas vía ctx, nunca por import.
 */

export interface PartyMember {
  species: SpeciesDef;
  /** Especie rookie guardada; `species` cambia al digievolucionar en combate. */
  baseSpecies: string;
  model: THREE.Group;
  anim: DigimonAnimator;
  level: number;
  hp: number;
  maxHp: number;
  friendship: number;
  xp: number;
}

export interface WildMember {
  species: SpeciesDef;
  model: THREE.Group;
  anim: DigimonAnimator;
  level: number;
}

interface PlayerLike {
  pos: THREE.Vector3;
  yaw: number;
  followAnchor?: THREE.Vector3;
}

interface TrainerLike {
  savedParty(): { party: { species: string; level: number; hp: number; maxHp: number; xp: number }[]; active: number };
  syncParty(party: { species: string; level: number; hp: number; maxHp: number; xp: number }[], active: number): void;
}

export class DigimonSystem implements GameSystem {
  static id = 'digimon';
  static deps = ['world', 'player', 'trainer'];

  party: PartyMember[] = [];
  active!: PartyMember;
  private ctx!: Ctx;
  private player!: PlayerLike;
  private trainer!: TrainerLike;
  /** true = otro sistema (combate, captura) controla la pose del activo. */
  private pinned = false;

  init(ctx: Ctx): this {
    this.ctx = ctx;
    this.player = ctx.get<PlayerLike>('player');
    this.trainer = ctx.get<TrainerLike>('trainer');
    const saved = this.trainer.savedParty();
    for (const rec of saved.party) {
      const m = this.addToParty(rec.species, rec.level, false);
      if (!m) continue;
      m.hp = Math.max(0, Math.min(m.maxHp, rec.hp));
      m.xp = rec.xp;
    }
    if (!this.party.length) this.addToParty('agumon', 5, false);
    this.active = this.party[Math.min(saved.active, this.party.length - 1)] ?? this.party[0];
    for (const m of this.party) m.model.visible = m === this.active;
    this.snapToPlayer();
    return this;
  }

  addToParty(speciesId: string, level = 5, sync = true): PartyMember | null {
    const spec = getSpecies(speciesId);
    if (!spec) return null;
    const model = buildDigimon(speciesId);
    model.position.set(3, 0, 3);
    model.visible = false;
    this.ctx.scene.add(model);
    const maxHp = statsAtLevel(spec, level).hp;
    const member: PartyMember = {
      species: spec,
      baseSpecies: spec.id,
      model,
      anim: new DigimonAnimator(model),
      level,
      hp: maxHp,
      maxHp,
      friendship: 50,
      xp: 0,
    };
    this.party.push(member);
    if (sync) this.sync();
    return member;
  }

  createWildMember(speciesId: string, level = 4): WildMember | null {
    const spec = getSpecies(speciesId);
    if (!spec) return null;
    const model = buildDigimon(speciesId);
    return { species: spec, model, anim: new DigimonAnimator(model), level };
  }

  disposeWildMember(member: { model?: THREE.Object3D } | null): void {
    if (member?.model) disposeDigimon(member.model);
  }

  /** Cambia el modelo por otra especie en el sitio; los stats de combate los lleva el motor. */
  transform(member: PartyMember, toId: string): boolean {
    const spec = getSpecies(toId);
    if (!spec) return false;
    const from = member.species.id;
    const old = member.model;
    const model = buildDigimon(toId);
    model.position.copy(old.position);
    model.rotation.copy(old.rotation);
    model.visible = old.visible;
    this.ctx.scene.add(model);
    disposeDigimon(old);
    member.species = spec;
    member.model = model;
    member.anim = new DigimonAnimator(model);
    this.ctx.events.emit('digimon:digivolve', { from, to: toId });
    return true;
  }

  /** Vuelve a la forma rookie guardada (fin de combate). */
  revert(member: PartyMember): void {
    if (member.species.id !== member.baseSpecies) this.transform(member, member.baseSpecies);
  }

  /** Suma XP y sube niveles; devuelve los niveles ganados. */
  grantXp(member: PartyMember, amount: number): number {
    member.xp += amount;
    let gained = 0;
    const base = getSpecies(member.baseSpecies)!;
    while (member.xp >= xpToNext(member.level)) {
      member.xp -= xpToNext(member.level);
      member.level++;
      gained++;
      const ratio = member.hp / member.maxHp;
      member.maxHp = statsAtLevel(base, member.level).hp;
      member.hp = Math.max(1, Math.round(member.maxHp * ratio));
    }
    this.sync();
    return gained;
  }

  setHp(member: PartyMember, hp: number): void {
    const prev = member.hp;
    member.hp = Math.max(0, Math.min(member.maxHp, Math.round(hp)));
    this.ctx.events.emit(member.hp < prev ? 'digimon:damage' : 'digimon:heal', {
      digimon: member.species.id, amount: Math.abs(member.hp - prev), hp: member.hp,
    });
    this.sync();
  }

  healAll(): void {
    for (const m of this.party) m.hp = m.maxHp;
    this.sync();
  }

  getActive(): PartyMember {
    return this.party.find((m) => m.hp > 0) ?? this.party[0];
  }

  setActive(member: PartyMember): void {
    this.active = member;
    for (const m of this.party) m.model.visible = m === member;
    this.ctx.events.emit('digimon:active', { species: member.species.id, name: member.species.name });
    this.sync();
  }

  /** Otro sistema toma la pose del activo (combate). `release()` la devuelve. */
  pin(at: THREE.Vector3, yaw: number): PartyMember {
    const m = this.getActive();
    if (m !== this.active) this.setActive(m);
    this.pinned = true;
    m.model.position.copy(at);
    m.model.rotation.set(0, yaw, 0);
    return m;
  }

  release(): void {
    this.pinned = false;
    this.snapToPlayer();
  }

  snapToPlayer(): void {
    const a = this.player.followAnchor ?? this.player.pos;
    this.active.model.position.set(a.x, groundHeightAt(a.x, a.z), a.z);
    this.active.model.rotation.set(0, this.player.yaw + Math.PI + 1.05, 0);
    this.pinned = false;
  }

  /** Capture hook: planta una especie en `at` mirando a +Z (cámara de retrato). */
  showcase(speciesId: string, at: THREE.Vector3): void {
    let m = this.party.find((p) => p.species.id === speciesId);
    if (!m) m = this.addToParty(speciesId, 5, false) ?? this.active;
    this.setActive(m);
    this.pin(at.clone().setY(groundHeightAt(at.x, at.z)), 0);
  }

  update(dt: number): void {
    const m = this.active.model;
    if (!this.pinned) {
      const p = this.player.pos;
      const anchor = this.player.followAnchor;
      const tx = anchor ? anchor.x : p.x;
      const tz = anchor ? anchor.z : p.z;
      const k = Math.min(1, 4 * dt);
      const moving = Math.abs(tx - m.position.x) + Math.abs(tz - m.position.z) > 0.05;
      m.position.x += (tx - m.position.x) * k;
      m.position.z += (tz - m.position.z) * k;
      m.position.y = groundHeightAt(m.position.x, m.position.z);
      const targetYaw = this.player.yaw + Math.PI + 1.05;
      m.rotation.y += wrapAngle(targetYaw - m.rotation.y) * Math.min(1, 6 * dt);
      const anim = this.active.anim;
      if (moving && anim.state === 'idle') anim.play('walk', 0.6);
      else if (!moving && anim.state === 'walk') anim.play('idle', 0.4);
    }
    for (const member of this.party) if (member.model.visible) member.anim.update(dt);
  }

  private sync(): void {
    if (!this.trainer) return;
    this.trainer.syncParty(
      this.party.map((m) => ({ species: m.baseSpecies, level: m.level, hp: m.hp, maxHp: m.maxHp, xp: m.xp })),
      Math.max(0, this.party.indexOf(this.active)),
    );
  }

  dispose(): void {
    for (const m of this.party) disposeDigimon(m.model);
    this.party = [];
  }
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
