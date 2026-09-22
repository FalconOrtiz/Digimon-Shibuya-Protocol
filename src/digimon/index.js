// src/digimon/index.js — sistema digimon: instancias jugables + animadores.
// Crea Agumon (principal) y Patamon (secundario), los pone junto al jugador
// (follow suave) y los anima con DigimonAnimator.

import * as THREE from 'three';
import { buildDigimon } from './models.js';
import { DigimonAnimator } from './anim.js';
import { getSpecies } from '../core/DigimonData';
import { disposeSprite } from './sprites.js';

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
    for (const m of this.party) {
      if (m !== this.active) m.model.visible = false;
    }

    // live model is always the 3D turnaround mesh (sprites are HUD portraits only)
    this.events.on('mode', () => {});

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
      sprite: null,
      level,
      hp: spec.hp,
      maxHp: spec.hp,
      friendship: 50,
      xp: 0
    };
    this.party.push(member);
    return member;
  }

  // fábrica pública para otros subsistemas (contrato: NUNCA importar digimon/models
  // desde fuera — esto se obtiene vía ctx.get('digimon').createWildMember())
  // Devuelve { species, model, anim, sprite } ya montado en la escena del llamador.
  createWildMember(speciesId, level = 4) {
    const spec = getSpecies(speciesId);
    if (!spec) return null;
    const model = buildDigimon(speciesId);
    const anim = new DigimonAnimator(model);
    return { species: spec, model, anim, sprite: null, level };
  }

  // libera un miembro creado con createWildMember
  disposeWildMember(member) {
    if (!member) return;
    if (member.sprite) {
      if (member.sprite.parent) member.sprite.parent.remove(member.sprite);
      disposeSprite(member.sprite);
    }
    if (member.model) {
      if (member.model.parent) member.model.parent.remove(member.model);
      member.model.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    }
  }

  // digimon activo para batalla (el primero con hp > 0)
  getActive() {
    return this.party.find(m => m.hp > 0) || this.party[0];
  }

  setActive(member) {
    this.active = member;
    for (const m of this.party) m.model.visible = m === member;
    this.events.emit('digimon:active', { species: member.species.id, name: member.species.name });
  }

  update(dt) {
    // follow suave del digimon activo detrás del jugador
    const p = this.player.pos;
    const anchor = this.player.followAnchor;
    const tx = anchor ? anchor.x : p.x;
    const tz = anchor ? anchor.z : p.z;

    const m = this.active.model;
    const sp = this.active.sprite;
    const speed = 4;
    m.position.x += (tx - m.position.x) * Math.min(1, speed * dt);
    m.position.z += (tz - m.position.z) * Math.min(1, speed * dt);
    m.position.y = 0;
    if (sp) {
      sp.position.x = m.position.x;
      sp.position.z = m.position.z;
      sp.position.y = m.position.y + 0.02;
    }

    // mirar hacia la dirección del jugador
    const targetYaw = this.player.yaw + Math.PI + 1.05;
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

  // alterna entre sprite (exploración) y modelo 3D (batalla)
  setMode(mode) {
    const showSprite = mode !== 'battle';
    for (const member of this.party) {
      if (member.sprite) {
        member.sprite.visible = showSprite;
        member.model.visible = !showSprite;
      }
    }
  }

  resize() {}
  dispose() {
    for (const m of this.party) {
      this.scene.remove(m.model);
      if (m.sprite) {
        this.scene.remove(m.sprite);
        disposeSprite(m.sprite);
      }
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
