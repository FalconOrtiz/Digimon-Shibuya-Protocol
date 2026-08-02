// src/world/encounters.js — digimons salvajes patrullando Shibuya.
// Spawn en el cruce y calles cercanas; al tocarlos → evento battle:request.
// También gestiona el rival (trainer) que aparece cerca del cruce.

import * as THREE from 'three';
import { buildDigimon } from '../digimon/models.js';
import { DigimonAnimator } from '../digimon/anim.js';
import { getSpecies } from '../digimon/registry.js';

const WILD_POOL = ['koromon', 'nyaromon', 'bukamon'];

export class Encounters {
  static id = 'encounters';
  static deps = ['world', 'battle', 'player'];

  constructor() { this.root = new THREE.Group(); this.wilds = []; }

  init(ctx) {
    this.ctx = ctx;
    this.rng = ctx.rng.fork();
    this.world = ctx.get('world');
    this.battle = ctx.get('battle');
    this.player = ctx.get('player');
    this.world.root.add(this.root);

    // digimons salvajes
    const count = Math.max(4, Math.floor(ctx.config.q.npcCount / 8));
    for (let i = 0; i < count; i++) this._spawnWild();

    // rival: el trainer con el digimon contrario
    this._spawnRival();

    return this;
  }

  _spawnWild() {
    const species = this.rng.pick(WILD_POOL);
    const spec = getSpecies(species);
    const model = buildDigimon(species);
    const anim = new DigimonAnimator(model);

    // posición aleatoria en el cruce o calles
    const a = this.rng.float() * Math.PI * 2;
    const r = 8 + this.rng.float() * 26;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    model.position.set(x, 0, z);
    this.root.add(model);

    const wanderDir = new THREE.Vector3(Math.cos(a + Math.PI / 2), 0, Math.sin(a + Math.PI / 2));
    const wild = {
      species: spec,
      model,
      anim,
      level: this.rng.int(3, 6),
      wanderDir,
      phase: this.rng.float() * Math.PI * 2,
      active: true
    };
    this.wilds.push(wild);
    return wild;
  }

  _spawnRival() {
    const digimonSys = this.ctx.get('digimon');
    const playerSpecies = digimonSys.party[0]?.species.id || 'agumon';
    const species = playerSpecies === 'agumon' ? 'patamon' : 'agumon';
    const spec = getSpecies(species);
    const model = buildDigimon(species);
    const anim = new DigimonAnimator(model);
    model.position.set(22, 0, -22);
    this.root.add(model);

    this.rival = {
      species: spec,
      model,
      anim,
      level: 6,
      name: 'Ren',
      active: true
    };
  }

  update(dt) {
    const ppos = this.player.pos;

    // salvajes: deambular + animar
    for (const w of this.wilds) {
      if (!w.active) continue;
      w.phase += dt * 1.2;
      const speed = 0.5;
      w.model.position.x += w.wanderDir.x * speed * dt;
      w.model.position.z += w.wanderDir.z * speed * dt;
      // rebotar dentro del radio
      const d = Math.hypot(w.model.position.x, w.model.position.z);
      if (d > 30) w.wanderDir.negate();
      w.model.rotation.y = Math.atan2(w.wanderDir.x, w.wanderDir.z);
      w.anim.update(dt);
      if (w.anim.state === 'idle') w.anim.play('walk', 1.0);

      // encounter radius
      if (w.active && d < 34 && Math.hypot(ppos.x - w.model.position.x, ppos.z - w.model.position.z) < 1.6) {
        w.active = false;
        this._trigger(w);
      }
    }

    // rival: se queda en su sitio, animación idle
    if (this.rival && this.rival.active) {
      this.rival.anim.update(dt);
      const d = Math.hypot(ppos.x - this.rival.model.position.x, ppos.z - this.rival.model.position.z);
      if (d < 2.2) {
        this.rival.active = false;
        this._triggerRival();
      }
    }
  }

  _trigger(wild) {
    this.ctx.events.emit('encounter', { digimon: wild.species.id, at: wild.model.position.clone() });
    this.ctx.events.emit('battle:request', {
      enemySpecies: wild.species.id,
      enemyLevel: wild.level
    });
  }

  _triggerRival() {
    this.ctx.events.emit('encounter', { digimon: this.rival.species.id, at: this.rival.model.position.clone(), rival: true });
    this.ctx.events.emit('battle:request', {
      enemySpecies: this.rival.species.id,
      enemyLevel: this.rival.level,
      trainerName: this.rival.name,
      rival: true
    });
  }

  // restablecer salvajes tras una batalla (los que quedaron vivos reaparecen lejos)
  resetAfterBattle() {
    for (const w of this.wilds) {
      if (!w.active) {
        w.active = true;
        const a = this.rng.float() * Math.PI * 2;
        const r = 10 + this.rng.float() * 24;
        w.model.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      }
    }
  }

  resize() {}
  dispose() {
    this.world.root.remove(this.root);
    this.root.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
}
