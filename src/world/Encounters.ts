import * as THREE from 'three';
import type { Ctx, GameSystem } from '../core/Context';
import type { Rng } from '../core/Rng';
import { LAYOUT, groundHeightAt } from '../core/Layout';

/**
 * Digimons salvajes que patrullan el cruce y la rival que espera en la esquina.
 * Tocar a uno emite `battle:request`; durante el combate se ocultan y el
 * derrotado reaparece lejos del trainer.
 */

const WILD_POOL = ['koromon', 'nyaromon', 'bukamon'];
const WILD_COUNT = 5;
const TRIGGER_R = 1.6;
const RIVAL_R = 2.2;
/** Radio de patrulla: el cruce y el arranque de las cuatro calles. */
const PATROL_R = 34;

interface WildMember {
  species: { id: string; name: string };
  model: THREE.Group;
  anim: { play(state: string, dur?: number): void; update(dt: number): void; state: string };
  level: number;
}

interface Wild extends WildMember {
  dir: THREE.Vector3;
  active: boolean;
  rival?: string;
}

interface DigimonLike {
  party: { species: { id: string } }[];
  createWildMember(species: string, level: number): WildMember | null;
  disposeWildMember(m: WildMember | null): void;
}

interface PlayerLike {
  pos: THREE.Vector3;
}

/** Suelo transitable: calzada del cruce o de una de las calles. */
function onRoad(x: number, z: number): boolean {
  const lane = LAYOUT.CURB - 1;
  return (Math.abs(x) < lane || Math.abs(z) < lane) && Math.hypot(x, z) < PATROL_R;
}

export class Encounters implements GameSystem {
  static id = 'encounters';
  static deps = ['digimon', 'player', 'battle'];

  readonly root = new THREE.Group();
  wilds: Wild[] = [];
  rival: Wild | null = null;
  private ctx!: Ctx;
  private rng!: Rng;
  private digimon!: DigimonLike;
  private player!: PlayerLike;
  private paused = false;
  /** Segundos de gracia tras un combate antes de poder disparar otro. */
  private grace = 0;

  init(ctx: Ctx): this {
    this.ctx = ctx;
    this.rng = ctx.rng.fork();
    this.digimon = ctx.get<DigimonLike>('digimon');
    this.player = ctx.get<PlayerLike>('player');
    this.root.name = 'Encounters';
    ctx.scene.add(this.root);

    for (let i = 0; i < WILD_COUNT; i++) this.spawn(this.rng.pick(WILD_POOL), this.rng.int(3, 6));
    const partner = this.digimon.party[0]?.species.id ?? 'agumon';
    this.rival = this.spawn(partner === 'agumon' ? 'patamon' : 'agumon', 6, 'Ren');
    if (this.rival) this.place(this.rival, 9, -16);

    ctx.events.on('battle:start', () => {
      this.paused = true;
      this.root.visible = false;
    });
    ctx.events.on('battle:end', () => {
      this.paused = false;
      this.root.visible = true;
      this.grace = 3;
      for (const w of this.wilds) if (!w.active) this.respawn(w);
    });
    return this;
  }

  private spawn(species: string, level: number, rival?: string): Wild | null {
    const m = this.digimon.createWildMember(species, level);
    if (!m) return null;
    const w: Wild = { ...m, dir: new THREE.Vector3(), active: true, rival };
    this.root.add(m.model);
    if (rival) return w;
    this.wilds.push(w);
    this.respawn(w);
    return w;
  }

  private place(w: Wild, x: number, z: number): void {
    w.model.position.set(x, groundHeightAt(x, z), z);
  }

  /** Reaparece en calzada, a más de 10 m del trainer. */
  private respawn(w: Wild): void {
    const p = this.player.pos;
    for (let tries = 0; tries < 40; tries++) {
      const a = this.rng.float() * Math.PI * 2;
      const r = 6 + this.rng.float() * (PATROL_R - 8);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (!onRoad(x, z) || Math.hypot(x - p.x, z - p.z) < 10) continue;
      this.place(w, x, z);
      break;
    }
    const h = this.rng.float() * Math.PI * 2;
    w.dir.set(Math.sin(h), 0, Math.cos(h));
    w.active = true;
  }

  update(dt: number): void {
    if (this.paused) return;
    this.grace = Math.max(0, this.grace - dt);
    const p = this.player.pos;

    for (const w of this.wilds) {
      if (!w.active) continue;
      const pos = w.model.position;
      const nx = pos.x + w.dir.x * 0.5 * dt;
      const nz = pos.z + w.dir.z * 0.5 * dt;
      if (onRoad(nx, nz)) {
        pos.set(nx, groundHeightAt(nx, nz), nz);
      } else {
        // Gira hacia el centro con algo de ruido para no rebotar en línea.
        const h = Math.atan2(-pos.x, -pos.z) + (this.rng.float() - 0.5) * 1.2;
        w.dir.set(Math.sin(h), 0, Math.cos(h));
      }
      w.model.rotation.y = Math.atan2(w.dir.x, w.dir.z);
      if (w.anim.state === 'idle') w.anim.play('walk', 1.0);
      w.anim.update(dt);
      if (!this.grace && Math.hypot(p.x - pos.x, p.z - pos.z) < TRIGGER_R) this.trigger(w);
    }

    const r = this.rival;
    if (r?.active) {
      r.anim.update(dt);
      const pos = r.model.position;
      r.model.rotation.y = Math.atan2(p.x - pos.x, p.z - pos.z);
      if (!this.grace && Math.hypot(p.x - pos.x, p.z - pos.z) < RIVAL_R) this.trigger(r);
    }
  }

  private trigger(w: Wild): void {
    w.active = false;
    this.ctx.events.emit('encounter', { digimon: w.species.id, at: w.model.position.clone(), rival: !!w.rival });
    this.ctx.events.emit('battle:request', {
      enemySpecies: w.species.id,
      enemyLevel: w.level,
      trainerName: w.rival ?? null,
      rival: !!w.rival,
    });
  }

  dispose(): void {
    for (const w of this.wilds) this.digimon.disposeWildMember(w);
    if (this.rival) this.digimon.disposeWildMember(this.rival);
    this.wilds = [];
    this.rival = null;
    this.ctx.scene.remove(this.root);
  }
}
