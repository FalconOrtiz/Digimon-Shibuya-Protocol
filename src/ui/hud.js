// src/ui/hud.js — HUD en primera persona.
// Crosshair, hitmarker, barras HP/Stamina del trainer, indicador del digimon
// activo, prompts de batalla (menú de acciones + QTE: barra dorada / anillo de
// parry), mensajes de batalla. Event-driven (sin polling).

export class Hud {
  static id = 'hud';
  static deps = ['player', 'digimon', 'trainer'];

  constructor() { this.mode = 'explore'; }

  init(ctx) {
    this.ctx = ctx;
    this.events = ctx.events;
    this.player = ctx.get('player');
    this.digimonSys = ctx.get('digimon');
    this.battle = ctx.get('battle');
    this.rootEl = document.getElementById('ui-root');

    this._build();
    this._wire();
    return this;
  }

  _build() {
    const el = document.createElement('div');
    el.id = 'hud';
    el.innerHTML = `
      <div id="crosshair"><span></span></div>
      <div id="hitmarker" class="hidden"></div>
      <div id="hud-top-left">
        <div class="profile-head">
          <div id="profile-avatar"><img src="/assets/imagine/avatar-hood.jpg" alt=""></div>
          <div class="profile-info">
            <div id="hud-trainer-name">FalconOrtiz</div>
            <div id="profile-level">NIVEL <span id="profile-level-num">42</span></div>
          </div>
        </div>
        <div id="hud-bars">
          <div class="hud-bar-row"><span class="hud-bar-label">VIDA</span><div class="hud-bar"><div id="hud-hp" class="hud-bar-fill hp"></div></div><span class="hud-bar-num" id="hud-hp-num">100/100</span></div>
          <div class="hud-bar-row"><span class="hud-bar-label">ENERGIA</span><div class="hud-bar"><div id="hud-stamina" class="hud-bar-fill st"></div></div><span class="hud-bar-num" id="hud-st-num">100/100</span></div>
        </div>
      </div>
      <div id="hud-digimon">
        <img id="hud-digimon-portrait" alt="" />
        <div>
          <div id="hud-digimon-name"></div>
          <div class="hud-bar"><div id="hud-dhp" class="hud-bar-fill dhp"></div></div>
          <div id="hud-digimon-lv"></div>
        </div>
      </div>
      <div id="hud-relock" class="hidden">Clic para volver a Shibuya</div>
      <div id="hud-interact" class="hidden">[E] Interactuar</div>
      <div id="battle-ui" class="hidden">
        <div id="battle-enemy-info"></div>
        <div id="battle-e33">
          <div class="e33-row"><span>AP</span><div class="e33-pips" id="e33-ap"></div></div>
          <div class="e33-row"><span>GRD</span><div class="hud-bar"><div id="e33-grd" class="hud-bar-fill st"></div></div></div>
          <div class="e33-row"><span>BRK</span><div class="hud-bar"><div id="e33-brk" class="hud-bar-fill ehp"></div></div></div>
        </div>
        <div id="battle-actions" class="hidden"></div>
        <div id="battle-qte" class="hidden">
          <div id="qte-label"></div>
          <div id="qte-bar"><div id="qte-zone"></div><div id="qte-cursor"></div></div>
          <div id="qte-ring" class="hidden"></div>
        </div>
        <div id="battle-log"></div>
      </div>
      <div id="hud-message" class="hidden"></div>
    `;
    this.rootEl.appendChild(el);

    this.hpEl = el.querySelector('#hud-hp');
    this.hpNumEl = el.querySelector('#hud-hp-num');
    this.stEl = el.querySelector('#hud-stamina');
    this.stNumEl = el.querySelector('#hud-st-num');
    this.dhpEl = el.querySelector('#hud-dhp');
    this.dNameEl = el.querySelector('#hud-digimon-name');
    this.dLvEl = el.querySelector('#hud-digimon-lv');
    this.hitmarkerEl = el.querySelector('#hitmarker');
    this.msgEl = el.querySelector('#hud-message');
    this.interactEl = el.querySelector('#hud-interact');
    this.relockEl = el.querySelector('#hud-relock');
    this.dPortraitEl = el.querySelector('#hud-digimon-portrait');
    this.battleEl = el.querySelector('#battle-ui');
    this.enemyInfoEl = el.querySelector('#battle-enemy-info');
    this.actionsEl = el.querySelector('#battle-actions');
    this.qteEl = el.querySelector('#battle-qte');
    this.qteLabelEl = el.querySelector('#qte-label');
    this.qteZoneEl = el.querySelector('#qte-zone');
    this.qteCursorEl = el.querySelector('#qte-cursor');
    this.qteRingEl = el.querySelector('#qte-ring');
    this.logEl = el.querySelector('#battle-log');
    this.e33Ap = el.querySelector('#e33-ap');
    this.e33Grd = el.querySelector('#e33-grd');
    this.e33Brk = el.querySelector('#e33-brk');

    // perfil del trainer
    const trainer = this.ctx.get('trainer');
    if (trainer) {
      el.querySelector('#hud-trainer-name').textContent = trainer.name;
      el.querySelector('#profile-level-num').textContent = trainer.level;
    }

    this._updateDhp();

    this._qteAnimId = null;
    this._qteStart = 0;
    this._qteDuration = 1;
    this._qteType = 'crit';
  }

  _wire() {
    const ev = this.events;
    ev.on('player:health', (p) => {
      this.hpEl.style.width = `${(p.current / p.max) * 100}%`;
      if (this.hpNumEl) this.hpNumEl.textContent = `${Math.round(p.current)}/${p.max}`;
    });
    ev.on('player:stamina', (p) => {
      this.stEl.style.width = `${(p.current / p.max) * 100}%`;
      if (this.stNumEl) this.stNumEl.textContent = `${Math.round(p.current)}/${p.max}`;
    });
    ev.on('digimon:damage', (p) => this._updateDhp());
    ev.on('digimon:heal', (p) => this._updateDhp());
    ev.on('digimon:xp', (p) => {
      this._msg(`+${p.gained} XP a ${this._digimonName(p.digimon)}`);
    });
    ev.on('battle:hit', (p) => {
      if (p.target === 'enemy' && p.damage > 0) {
        this._hitmarker(p.crit);
      }
      if (p.target === 'player' && p.damage > 0) {
        this._msg(`¡Te golpearon! -${p.damage} HP`);
      }
      this._updateEnemyHp();
      this._updateDhp();
    });
    ev.on('battle:e33', (p) => this._paintE33(p));
    ev.on('battle:start', (p) => this._onBattleStart(p));
    ev.on('battle:end', (p) => this._onBattleEnd(p));
    ev.on('battle:turn', (p) => this._onBattleTurn(p));
    ev.on('battle:qte', (p) => this._onQte(p));
    ev.on('battle:message', (p) => this._msg(p.text));
    ev.on('digivice:message', (p) => this._msg(p.text));
    ev.on('mode', (p) => {
      this.mode = p.mode;
      if (p.mode === 'explore') this.battleEl.classList.add('hidden');
    });
    ev.on('digivice:close', () => {
      if (this.relockEl) this.relockEl.classList.remove('hidden');
    });
    ev.on('digivice:open', () => {
      if (this.relockEl) this.relockEl.classList.add('hidden');
    });
  }

  _digimonName(id) {
    const m = this.digimonSys.party.find(x => x.species.id === id);
    return m ? m.species.name : id;
  }

  _updateDhp() {
    const active = this.digimonSys.getActive();
    if (!active) return;
    this.dhpEl.style.width = `${(active.hp / active.maxHp) * 100}%`;
    this.dNameEl.textContent = active.species.name;
    this.dLvEl.textContent = `NV.${active.level}`;
    if (this.dPortraitEl) {
      const id = active.species.id;
      this.dPortraitEl.src = id === 'patamon' ? '/assets/patamon-sprite.png' : '/assets/agumon-sprite.png';
      this.dPortraitEl.style.display = 'block';
    }
  }

  _updateEnemyHp() {
    if (!this.battle || !this.battle.running || !this.battle.enemy) return;
    const e = this.battle.enemy;
    this.enemyInfoEl.innerHTML = `
      <div class="be-name">${e.trainerName ? `👤 ${e.trainerName} — ` : ''}${e.species.name} <span class="be-lv">NV.${e.level}</span></div>
      <div class="hud-bar"><div class="hud-bar-fill ehp" style="width:${(e.hp / e.maxHp) * 100}%"></div></div>`;
  }

  _onBattleStart(p) {
    this.battleEl.classList.remove('hidden');
    this.logEl.innerHTML = '';
    this._log(`¡Batalla! ${p.enemy} apareció${p.trainer ? ` (trainer ${p.trainer})` : ''}.`);
    this._updateEnemyHp();
  }

  _onBattleEnd(p) {
    const msg = p.result === 'win' ? '¡VICTORIA!' : p.result === 'fled' ? 'Huiste de la batalla.' : 'Has sido derrotado...';
    this._log(msg);
    setTimeout(() => {
      this.battleEl.classList.add('hidden');
      this.actionsEl.classList.add('hidden');
      this.qteEl.classList.add('hidden');
    }, 1600);
  }

  _onBattleTurn(p) {
    if (p.actor === 'player') {
      this._showActions();
      this.qteEl.classList.add('hidden');
    } else if (p.actor === 'enemy') {
      this.actionsEl.classList.add('hidden');
      this._log(`${p.digimon} usa ${p.action}! ¡Prepárate para ${this.ctx.rng.chance(0.5) ? 'PARRY' : 'DODGE'}!`);
    }
  }

  _paintE33(p) {
    if (!this.e33Ap) return;
    const ap = p.ap ?? 0;
    const max = p.apMax ?? 9;
    this.e33Ap.innerHTML = Array.from({ length: max }, (_, i) =>
      `<i class="${i < ap ? 'on' : ''}"></i>`).join('');
    if (this.e33Grd) this.e33Grd.style.width = `${p.gradient ?? 0}%`;
    if (this.e33Brk) this.e33Brk.style.width = `${p.break ?? 0}%`;
  }

  _showActions() {
    const active = this.digimonSys.getActive();
    if (!active) return;
    const b = this.battle;
    const moves = active.species.moves.map(id => {
      const m = this.ctx.get('digimon');
      // nombre del move
      return { id };
    });
    const ap = b?.ap ?? 0;
    const grd = b?.gradient ?? 0;
    this.actionsEl.innerHTML = `
      <div class="ba-title">¿Qué hará ${active.species.name}? · AP ${ap}/9 · GRD ${Math.round(grd)}%</div>
      <div class="ba-grid">
        <button class="ba-btn" data-act="attack" data-move="${active.species.moves[0]}">ATACAR · ${moveName(active.species.moves[0])} (+2 AP)</button>
        <button class="ba-btn" data-act="skill" data-move="${active.species.moves[1] || active.species.moves[0]}" ${ap < 3 ? 'disabled' : ''}>HABILIDAD · ${moveName(active.species.moves[1] || active.species.moves[0])} (3 AP)</button>
        <button class="ba-btn" data-act="ult" ${grd < 100 ? 'disabled' : ''}>ULT (${Math.round(grd)}%)</button>
        <button class="ba-btn" data-act="item">ÍTEM</button>
        <button class="ba-btn" data-act="digivolve" ${grd < 50 ? 'disabled' : ''}>DIGIEVOLUCIÓN</button>
        <button class="ba-btn" data-act="flee">HUIR</button>
      </div>`;
    this.actionsEl.classList.remove('hidden');
    this.actionsEl.querySelectorAll('.ba-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.actionsEl.classList.add('hidden');
        this.events.emit('battle:action', {
          action: btn.dataset.act,
          move: btn.dataset.move
        });
      });
    });
  }

  _onQte(p) {
    if (p.state === 'start') {
      this.qteEl.classList.remove('hidden');
      this.actionsEl.classList.add('hidden');
      this._qteType = p.type;
      this.qteZoneEl.style.width = `${Math.max(8, p.window * 200)}%`;
      this.qteZoneEl.style.left = '50%';
      this.qteZoneEl.style.transform = 'translateX(-50%)';
      this.qteLabelEl.textContent =
        p.type === 'crit' ? '¡PULSA EN LA ZONA DORADA!' :
        p.type === 'parry' ? '¡PARRY!' : '¡ESQUIVA!';
      if (p.type === 'crit') {
        this.qteRingEl.classList.add('hidden');
        this.qteBarEl = document.getElementById('qte-bar');
        this.qteBarEl.classList.remove('hidden');
      } else {
        document.getElementById('qte-bar').classList.add('hidden');
        this.qteRingEl.classList.remove('hidden');
      }
      this._qteStart = performance.now();
      this._qteDuration = 1000;
      cancelAnimationFrame(this._qteAnimId);
      this._qteAnimId = requestAnimationFrame(() => this._animateQte());
    } else if (p.state === 'end') {
      cancelAnimationFrame(this._qteAnimId);
      const label = p.result === 'crit' ? '¡CRÍTICO!' :
        p.result === 'perfect' ? '¡PERFECTO!' :
        p.result === 'hit' || p.result === 'ok' ? 'Bien' :
        p.result === 'miss' ? '¡Fallaste!' : 'Tarde...';
      this.qteLabelEl.textContent = label;
      this.qteLabelEl.classList.add('qte-result');
      setTimeout(() => {
        this.qteEl.classList.add('hidden');
        this.qteLabelEl.classList.remove('qte-result');
      }, 700);
    }
  }

  _animateQte() {
    const elapsed = performance.now() - this._qteStart;
    const t = Math.min(1, elapsed / this._qteDuration);
    if (this._qteType === 'crit') {
      this.qteCursorEl.style.left = `${t * 100}%`;
    } else {
      // anillo que se cierra
      const scale = 1 + t * 2.4;
      this.qteRingEl.style.transform = `translate(-50%,-50%) scale(${scale})`;
      this.qteRingEl.style.opacity = String(Math.max(0.15, 1 - t * 0.85));
    }
    if (t < 1) {
      this._qteAnimId = requestAnimationFrame(() => this._animateQte());
    }
  }

  _hitmarker(crit) {
    this.hitmarkerEl.classList.remove('hidden');
    this.hitmarkerEl.classList.toggle('crit', !!crit);
    clearTimeout(this._hmTimer);
    this._hmTimer = setTimeout(() => {
      this.hitmarkerEl.classList.add('hidden');
    }, 160);
  }

  _msg(text) {
    this.msgEl.textContent = text;
    this.msgEl.classList.remove('hidden');
    clearTimeout(this._msgTimer);
    this._msgTimer = setTimeout(() => this.msgEl.classList.add('hidden'), 2200);
  }

  _log(text) {
    this.logEl.innerHTML = `<div class="be-log-line">${text}</div>` + this.logEl.innerHTML;
    if (this.logEl.children.length > 4) this.logEl.removeChild(this.logEl.lastChild);
  }

  update() {
    // crosshair visible solo en exploración
    const c = document.getElementById('crosshair');
    c.style.opacity = this.mode === 'battle' ? '0' : '1';

    if (this.relockEl && this.ctx.input.locked) this.relockEl.classList.add('hidden');
  }

  resize() {}
  dispose() {
    if (this.rootEl) {
      const el = document.getElementById('hud');
      if (el) el.remove();
    }
  }
}

// nombre de move desde el registro
import { getMove } from '../core/digimon-moves.js';
function moveName(id) {
  const m = getMove(id);
  return m ? m.name : id;
}
