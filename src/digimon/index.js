// src/digimon/index.js — sistema digimon: instancias jugables + animadores.
// Crea Agumon (principal) y Patamon (secundario), los pone junto al jugador
// (follow suave) y los anima con DigimonAnimator.

import * as THREE from 'three';
import { buildDigimon } from './models.js';
import { DigimonAnimator } from './anim.js';
import { getSpecies } from './registry.js';
import { MOVES } from '../core/config.js';

export class DigimonSystem {
  static id = 'digimon';
  static deps = ['world', 'player'];

  constructor() {
    this.party = [];   // { species, model, anim, stats, level, friendship }
  }

  init(ctx) {
    this.ctx = ctx;
    this.player = ctx.get('player');
    this.scene = ctx.scene;
    this.events = ctx.events;

    // Agumon principal + Patamon secundario
    this.addToParty('agumon', 5);
    this.addToParty('patamon', 4);

    // el activo sigue al jugador
    this.active = this.party[0];
    this.followPos = new THREE.Vector3(2.5, 0, 2.5);

    return this;
  }

  addToParty(speciesId, level = 5) {
    const spec = getSpecies(speciesId);
    if (!spec) return null;
    const model = buildDigimon(speciesId);
    const anim = new DigimonAnimator(model);
    model.position.set(3, 0, 3);
    this.scene.add(model);

    const member = {
      species: spec,
      model,
      anim,
      level,
      hp: spec.hp,
      maxHp: spec.hp,
      friendship: 50,
      xp: 0
    };
    this.party.push(member);
    return member;
  }

  // digimon activo para batalla (el primero con hp > 0)
  getActive() {
    return this.party.find(m => m.hp > 0) || this.party[0];
  }

  setActive(member) {
    this.active = member;
    this.events.emit('digimon:active', { species: member.species.id, name: member.species.name });
  }

  update(dt) {
    // follow suave del digimon activo detrás del jugador
    const p = this.player.pos;
    // posición objetivo: detrás e izquierda del jugador
    const sin = Math.sin(this.player.yaw + Math.PI / 2);
    const cos = Math.cos(this.player.yaw + Math.PI / 2);
    const tx = p.x + sin * 2.2;
    const tz = p.z + cos * 2.2;

    const m = this.active.model;
    const speed = 4;
    m.position.x += (tx - m.position.x) * Math.min(1, speed * dt);
    m.position.z += (tz - m.position.z) * Math.min(1, speed * dt);

    // mirar hacia la dirección del jugador
    const targetYaw = this.player.yaw + Math.PI; // mirando en la misma dirección que el jugador
    m.rotation.y += wrapAngle(targetYaw - m.rotation.y) * Math.min(1, 6 * dt);

    // animación según movimiento
    const moving = Math.abs(tx - m.position.x) + Math.abs(tz - m.position.z) > 0.05;
    if (moving && this.active.anim.state === 'idle') {
      this.active.anim.play('walk', 0.6);
    } else if (!moving && this.active.anim.state === 'walk') {
      this.active.anim.play('idle', 0.4);
    }
    this.active.anim.update(dt);
  }

  resize() {}
  dispose() {
    for (const m of this.party) {
      this.scene.remove(m.model);
      m.model.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    }
  }
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
