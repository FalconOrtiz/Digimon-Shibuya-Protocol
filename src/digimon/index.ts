import * as THREE from 'three';
import { buildDigimon, disposeDigimon } from './models';
import { DigimonAnimator } from './anim';
import { getSpecies, type SpeciesDef } from '../core/DigimonData';
import type { Ctx, GameSystem } from '../core/Context';

/**
 * Partner Digimon: the party, the 3D model that follows the trainer in
 * exploration (the same sculpt used in battle — no billboards), and the
 * factory other subsystems use for wild members (via ctx, never by import).
 */

export interface PartyMember {
  species: SpeciesDef;
  model: THREE.Group;
  anim: DigimonAnimator;
  /** Kept for callers written against the sprite era; always null. */
  sprite: null;
  level: number;
  hp: number;
  maxHp: number;
  friendship: number;
  xp: number;
}

interface PlayerLike {
  pos: THREE.Vector3;
  yaw: number;
  followAnchor?: THREE.Vector3;
}

export class DigimonSystem implements GameSystem {
  static id = 'digimon';
  static deps = ['world', 'player'];

  party: PartyMember[] = [];
  active!: PartyMember;
  private ctx!: Ctx;
  private player!: PlayerLike;
  private showcased = false;

  init(ctx: Ctx): this {
    this.ctx = ctx;
    this.player = ctx.get<PlayerLike>('player');
    this.addToParty('agumon', 5);
    this.addToParty('patamon', 4);
    this.active = this.party[0];
    for (const m of this.party) m.model.visible = m === this.active;
    this.snapToPlayer();
    return this;
  }

  addToParty(speciesId: string, level = 5): PartyMember | null {
    const spec = getSpecies(speciesId);
    if (!spec) return null;
    const model = buildDigimon(speciesId);
    model.position.set(3, 0, 3);
    this.ctx.scene.add(model);
    const member: PartyMember = {
      species: spec,
      model,
      anim: new DigimonAnimator(model),
      sprite: null,
      level,
      hp: spec.hp,
      maxHp: spec.hp,
      friendship: 50,
      xp: 0,
    };
    this.party.push(member);
    return member;
  }

  createWildMember(speciesId: string, level = 4): Omit<PartyMember, 'hp' | 'maxHp' | 'friendship' | 'xp'> | null {
    const spec = getSpecies(speciesId);
    if (!spec) return null;
    const model = buildDigimon(speciesId);
    return { species: spec, model, anim: new DigimonAnimator(model), sprite: null, level };
  }

  disposeWildMember(member: { model?: THREE.Object3D } | null): void {
    if (member?.model) disposeDigimon(member.model);
  }

  /** Swaps a party member's model for its evolved form, keeping stats and position. */
  digivolve(member: PartyMember, toId: string): boolean {
    const spec = getSpecies(toId);
    if (!spec) return false;
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
    member.maxHp = spec.hp;
    member.hp = spec.hp;
    this.ctx.events.emit('digimon:digivolved', { species: toId, name: spec.name });
    return true;
  }

  getActive(): PartyMember {
    return this.party.find((m) => m.hp > 0) ?? this.party[0];
  }

  setActive(member: PartyMember): void {
    this.active = member;
    for (const m of this.party) m.model.visible = m === member;
    this.ctx.events.emit('digimon:active', { species: member.species.id, name: member.species.name });
  }

  snapToPlayer(): void {
    const a = this.player.followAnchor ?? this.player.pos;
    this.active.model.position.set(a.x, 0, a.z);
    this.active.model.rotation.y = this.player.yaw + Math.PI + 1.05;
    this.showcased = false;
  }

  /** Capture hook: stands a species at `at`, facing +Z (towards the portrait camera). */
  showcase(speciesId: string, at: THREE.Vector3): void {
    let m = this.party.find((p) => p.species.id === speciesId);
    if (!m) m = this.addToParty(speciesId, 5) ?? this.active;
    this.setActive(m);
    m.model.position.copy(at).setY(0);
    m.model.rotation.set(0, 0, 0);
    this.showcased = true;
  }

  update(dt: number): void {
    const m = this.active.model;
    if (!this.showcased) {
      const p = this.player.pos;
      const anchor = this.player.followAnchor;
      const tx = anchor ? anchor.x : p.x;
      const tz = anchor ? anchor.z : p.z;
      const k = Math.min(1, 4 * dt);
      const moving = Math.abs(tx - m.position.x) + Math.abs(tz - m.position.z) > 0.05;
      m.position.x += (tx - m.position.x) * k;
      m.position.z += (tz - m.position.z) * k;
      m.position.y = 0;
      const targetYaw = this.player.yaw + Math.PI + 1.05;
      m.rotation.y += wrapAngle(targetYaw - m.rotation.y) * Math.min(1, 6 * dt);
      const anim = this.active.anim;
      if (moving && anim.state === 'idle') anim.play('walk', 0.6);
      else if (!moving && anim.state === 'walk') anim.play('idle', 0.4);
    }
    for (const member of this.party) if (member.model.visible) member.anim.update(dt);
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
