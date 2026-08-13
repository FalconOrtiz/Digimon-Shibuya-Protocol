// src/battle/index.js — máquina de turnos estilo Expedition 33 + Digimon.
//
// Flujo:
//   intro → playerTurn (menú: ataque/habilidad/ítem/digivolve/huir)
//     → elegir move → QTE crit (barra dorada) → resolveDamage
//   → enemyTurn → QTE parry/dodge (anillo) → resolveDamage
//   → checkEnd → repetir o fin
//
// Los turnos se ordenan por SP (speed). El jugador elige con el Digivice/HUD;
// la batalla emite eventos para que el HUD y la presentación se actualicen.

import { QteSystem, qteCritResult } from './qte.js';
import { BattleArena } from './arena.js';
import { damageForMove, getMove } from '../core/digimon-moves.js';
import { getSpecies, EXTRA_MOVES } from '../core/digimon-data.js';

const PHASE = {
  INTRO: 'intro',
  PLAYER_TURN: 'player_turn',
  PLAYER_CHOOSING: 'player_choosing',
  PLAYER_QTE: 'player_qte',
  PLAYER_ANIM: 'player_anim',
  ENEMY_TURN: 'enemy_turn',
  ENEMY_QTE: 'enemy_qte',
  ENEMY_ANIM: 'enemy_anim',
  END: 'end'
};

export class Battle {
  static id = 'battle';
  static deps = ['digimon', 'player', 'world'];

  constructor() {
    this.phase = PHASE.INTRO;
    this.running = false;
    this.qte = null;
    this._qtePromise = null;
    this._timeouts = [];
  }

  init(ctx) {
    this.ctx = ctx;
    this.events = ctx.events;
    this.digimonSys = ctx.get('digimon');
    this.playerSys = ctx.get('player');
    this.qte = new QteSystem(ctx);
    this.arena = new BattleArena(ctx.scene);

    // escuchar inputs de acción (espacio = confirmar / QTE)
    ctx.input; // input se consulta en update()

    this.events.on('battle:request', (p) => this.start(p));
    this.events.on('battle:action', (p) => this._onAction(p));

    return this;
  }

  // arrancar batalla: p = { enemySpecies, enemyLevel, trainerName?, rival? }
  start(p) {
    if (this.running) return;
    this.running = true;
    this.enemy = this._makeEnemy(p);
    this.playerDigimon = this.digimonSys.getActive();
    this.ap = 3;
    this.apMax = 9;
    this.gradient = 0;
    this.breakMeter = 0;
    this.brokenTurns = 0;
    this.round = 1;
    this.result = null;
    this.phase = PHASE.INTRO;

    // MODO BATALLA: liberar el mouse para poder seleccionar opciones con clic.
    // Digivice must NOT treat this unlock as a pause-menu request.
    const dv = this.ctx.peek('digivice');
    if (dv) dv._ignoreUnlock = true;
    if (document.pointerLockElement) document.exitPointerLock();
    this._wasLocked = true;
    if (dv && dv.open) dv.close();

    this.events.emit('battle:start', {
      enemy: this.enemy.species.name,
      trainer: p.trainerName || null,
      rival: !!p.rival,
      ap: this.ap, apMax: this.apMax, gradient: this.gradient, break: this.breakMeter
    });
    this._emitE33();

    // pausa de exploración
    this.events.emit('mode', { mode: 'battle' });
    if (this.arena) this.arena.show();

    this._after(900, () => {
      this._beginPlayerTurn();
    });
  }

  _makeEnemy(p) {
    const spec = getSpecies(p.enemySpecies) || getSpecies('koromon');
    const level = p.enemyLevel || 4;
    const hpScale = 1 + (level - 1) * 0.12;
    return {
      species: spec,
      level,
      hp: Math.floor(spec.hp * hpScale),
      maxHp: Math.floor(spec.hp * hpScale),
      moves: spec.moves || ['tackle'],
      trainerName: p.trainerName || null,
      rival: !!p.rival
    };
  }

  _emitE33() {
    this.events.emit('battle:e33', {
      ap: this.ap, apMax: this.apMax, gradient: this.gradient, break: this.breakMeter, broken: this.brokenTurns
    });
  }

  _beginPlayerTurn() {
    this.phase = PHASE.PLAYER_TURN;
    this._emitE33();
    this.events.emit('battle:turn', {
      actor: 'player',
      digimon: this.playerDigimon.species.name,
      phase: this.phase,
      ap: this.ap, gradient: this.gradient, break: this.breakMeter
    });
  }

  // el jugador elige una acción desde el HUD/Digivice
  _onAction(p) {
    if (!this.running) return;
    if (this.phase !== PHASE.PLAYER_TURN) return;

    switch (p.action) {
      case 'attack': {
        this._playerAttack(p.move || this.playerDigimon.species.moves[0], { basic: true });
        break;
      }
      case 'skill': {
        if (this.ap < 3) {
          this.events.emit('battle:message', { text: 'No hay AP suficiente (cuesta 3).' });
          return;
        }
        this.ap -= 3;
        this.gradient = Math.min(100, this.gradient + 15);
        this._playerAttack(p.move || this.playerDigimon.species.moves[1] || this.playerDigimon.species.moves[0], { basic: false });
        break;
      }
      case 'ult': {
        if (this.gradient < 100) {
          this.events.emit('battle:message', { text: 'Gradient incompleto.' });
          return;
        }
        this.gradient = 0;
        this._playerAttack(this.playerDigimon.species.moves[0], { ult: true });
        break;
      }
      case 'item':
        this._useItem();
        break;
      case 'flee':
        this._flee();
        break;
      case 'digivolve':
        if (this.gradient < 50) {
          this.events.emit('digivice:message', { text: 'Necesitas 50% Gradient para digievolucionar.' });
          return;
        }
        this.events.emit('digivice:message', { text: '¡Aún no tienes el poder de digievolucionar!' });
        break;
    }
  }

  _playerAttack(moveId, flags = {}) {
    this._atkFlags = flags;
    this.phase = PHASE.PLAYER_QTE;
    const move = getMove(moveId);
    this.events.emit('battle:turn', { actor: 'player', action: move.name, phase: this.phase });

    const w = move.qteWindow || 0.18;
    this._qtePromise = this.qte.start('crit', { window: w, durationMs: 1000 });
    this._qtePromise.then((result) => {
      this._resolvePlayerAttack(moveId, result);
    });
    // timeout automático si no pulsa
    this._after(1100, () => {
      if (this.qte.isActive()) this.qte.timeout();
    });
  }

  _resolvePlayerAttack(moveId, qteResult) {
    if (qteResult === 'miss') {
      this.events.emit('battle:hit', { target: 'enemy', damage: 0, crit: false, missed: true });
      this._playerAnim('attack', () => {
        this.events.emit('battle:message', { text: '¡Fallaste el golpe!' });
        this._after(600, () => this._beginEnemyTurn());
      });
      return;
    }

    let dmg = damageForMove(
      moveId,
      { element: this.playerDigimon.species.element, atk: this.playerDigimon.species.atk },
      { element: this.enemy.species.element, def: this.enemy.species.def },
      qteResult === 'crit' ? 'crit' : 'hit',
      this.playerDigimon.level
    );
    if (this._atkFlags?.ult) dmg = Math.floor(dmg * 2.5);
    if (this._atkFlags?.basic) {
      this.ap = Math.min(this.apMax, this.ap + 2);
      this.breakMeter = Math.min(100, this.breakMeter + 8);
    } else {
      this.breakMeter = Math.min(100, this.breakMeter + 14);
    }
    if (this.breakMeter >= 100) {
      this.brokenTurns = 2;
      this.breakMeter = 0;
      dmg = Math.floor(dmg * 1.5);
      this.events.emit('battle:message', { text: '¡DATA BREAK! El enemigo queda aturdido.' });
    }
    this._emitE33();

    this.enemy.hp = Math.max(0, this.enemy.hp - dmg);

    this._playerAnim('attack', () => {
      this.events.emit('battle:hit', {
        target: 'enemy',
        damage: dmg,
        crit: qteResult === 'crit',
        missed: false
      });
      this._after(650, () => {
        if (this.enemy.hp <= 0) this._end('win');
        else this._beginEnemyTurn();
      });
    });
  }

  _useItem() {
    const healed = 30;
    this.playerDigimon.hp = Math.min(this.playerDigimon.maxHp, this.playerDigimon.hp + healed);
    this.events.emit('digimon:heal', { digimon: this.playerDigimon.species.id, amount: healed, hp: this.playerDigimon.hp });
    this.events.emit('battle:message', { text: `¡${this.playerDigimon.species.name} recuperó ${healed} HP!` });
    this._after(800, () => this._beginEnemyTurn());
  }

  _flee() {
    // huida: 80% de éxito
    const fled = this.ctx.rng.chance(0.8);
    if (fled) {
      this._end('fled');
    } else {
      this.events.emit('battle:message', { text: '¡No pudiste huir!' });
      this._after(700, () => this._beginEnemyTurn());
    }
  }

  _beginEnemyTurn() {
    if (this.brokenTurns > 0) {
      this.brokenTurns--;
      this.events.emit('battle:message', { text: 'El enemigo está aturdido…' });
      this._after(700, () => this._beginPlayerTurn());
      return;
    }
    this.phase = PHASE.ENEMY_TURN;
    const moveId = this.ctx.rng.pick(this.enemy.moves);
    const move = getMove(moveId);
    this.events.emit('battle:turn', { actor: 'enemy', digimon: this.enemy.species.name, action: move.name, phase: this.phase });

    this._after(900, () => {
      // QTE defensivo: parry (perfect → 0 daño + contra) o dodge
      const type = this.ctx.rng.chance(0.5) ? 'parry' : 'dodge';
      this.phase = PHASE.ENEMY_QTE;
      this._qtePromise = this.qte.start(type, { window: 0.15, durationMs: 900 });
      this._qtePromise.then((result) => {
        this._resolveEnemyAttack(moveId, type, result);
      });
      this._after(1000, () => {
        if (this.qte.isActive()) this.qte.timeout();
      });
    });
  }

  _resolveEnemyAttack(moveId, qteType, qteResult) {
    const move = getMove(moveId);

    if (qteResult === 'perfect' || qteResult === 'ok') {
      const blocked = qteResult === 'perfect';
      if (blocked) {
        // contraataque 0.5× del ataque del jugador
        const counter = damageForMove(
          this.playerDigimon.species.moves[0],
          { element: this.playerDigimon.species.element, atk: this.playerDigimon.species.atk },
          { element: this.enemy.species.element, def: this.enemy.species.def },
          'hit',
          this.playerDigimon.level
        );
        const half = Math.max(1, Math.floor(counter * 0.5));
        this.enemy.hp = Math.max(0, this.enemy.hp - half);
        this.events.emit('battle:hit', { target: 'enemy', damage: half, crit: false, counter: true });
        this.events.emit('battle:message', { text: '¡PARRY PERFECTO! Contraataque.' });
        this._after(900, () => {
          if (this.enemy.hp <= 0) this._end('win');
          else this._beginPlayerTurn();
        });
        return;
      }
      // dodge ok → 0 daño
      this.events.emit('battle:hit', { target: 'player', damage: 0, blocked: true, dodge: qteType === 'dodge' });
      this.events.emit('battle:message', { text: qteType === 'dodge' ? '¡Esquivaste el ataque!' : '¡Bloqueaste el ataque!' });
      this._after(800, () => this._beginPlayerTurn());
      return;
    }

    // late → daño completo
    const dmg = damageForMove(
      moveId,
      { element: this.enemy.species.element, atk: this.enemy.species.atk + Math.floor(this.enemy.level / 2) },
      { element: this.playerDigimon.species.element, def: this.playerDigimon.species.def },
      'hit',
      this.enemy.level
    );

    this.playerDigimon.hp = Math.max(0, this.playerDigimon.hp - dmg);
    this.events.emit('battle:hit', { target: 'player', damage: dmg, crit: false, blocked: false });
    this.events.emit('digimon:damage', { digimon: this.playerDigimon.species.id, amount: dmg, hp: this.playerDigimon.hp });

    this._after(800, () => {
      if (this.playerDigimon.hp <= 0) this._end('lose');
      else this._beginPlayerTurn();
    });
  }

  _playerAnim(state, onDone) {
    this.phase = PHASE.PLAYER_ANIM;
    const anim = this.playerDigimon.anim;
    anim.play(state, 0.45, onDone);
  }

  _end(result) {
    this.phase = PHASE.END;
    this.result = result;
    this.running = false;
    this.events.emit('battle:end', { result });
    this.events.emit('mode', { mode: 'explore' });
    if (this.arena) this.arena.hide();

    // volver a bloquear el mouse para explorar en primera persona
    if (this._wasLocked) {
      const canvas = this.ctx.canvas;
      setTimeout(() => {
        if (canvas.requestPointerLock && !document.pointerLockElement) canvas.requestPointerLock();
      }, 400);
    }
    this._wasLocked = false;

    // XP si gana
    if (result === 'win') {
      const gained = 15 + this.enemy.level * 5;
      this.playerDigimon.xp += gained;
      this.events.emit('digimon:xp', { digimon: this.playerDigimon.species.id, gained, xp: this.playerDigimon.xp });
      this.playerDigimon.anim.play('win', 0.8);
      this.events.emit('digivice:message', { text: `¡Victoria! +${gained} XP` });
    } else if (result === 'lose') {
      // revivir con 25% HP
      this.playerDigimon.hp = Math.max(1, Math.floor(this.playerDigimon.maxHp * 0.25));
      this.events.emit('battle:message', { text: 'Has sido derrotado... ¡Vuelve al Digivice!' });
    }
  }

  _after(ms, fn) {
    const id = setTimeout(fn, ms);
    this._timeouts.push(id);
    return id;
  }

  update() {
    const input = this.ctx.input;
    if (this.running && this.phase === PHASE.PLAYER_TURN && input.tap('pause')) {
      this.events.emit('battle:message', { text: 'Pulsa HUIR para salir de la batalla.' });
      return;
    }
    // input del QTE: cuando hay QTE activo, espacio o clic izquierdo dispara
    if (this.qte && this.qte.isActive()) {
      const pressed = input.tap('jump') || (input.down('Mouse0') && !this._lastMouse);
      this._lastMouse = input.down('Mouse0');
      if (pressed) {
        this.qte.press();
        return;
      }
    } else {
      this._lastMouse = false;
    }
  }

  resize() {}
  dispose() {
    for (const t of this._timeouts) clearTimeout(t);
    this._timeouts = [];
    if (this.arena) this.arena.dispose();
  }
}
