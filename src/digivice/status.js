// src/digivice/status.js — panel de SALUD/STAMINA: barras del trainer y del digimon.

export class StatusPanel {
  constructor(ctx) {
    this.ctx = ctx;
    this.player = ctx.get('player');
    this.digimonSys = ctx.get('digimon');
  }

  render(el) {
    el.innerHTML = '';
    const p = this.player;
    const cfg = this.ctx.config.player;
    const active = this.digimonSys.getActive();

    const bar = (label, cur, max, color) => `
      <div class="dv-status-row">
        <span class="dv-status-label">${label}</span>
        <div class="dv-bar"><div class="dv-bar-fill" style="width:${Math.round(cur / max * 100)}%;background:${color}"></div></div>
        <span class="dv-status-num">${Math.round(cur)}/${max}</span>
      </div>`;

    const div = document.createElement('div');
    div.className = 'dv-status';
    div.innerHTML = `
      <div class="dv-card-head">TRAINER</div>
      ${bar('Salud', p.hp, cfg.hp, '#ff5a5a')}
      ${bar('Stamina', p.stamina, cfg.staminaMax, '#ffd24a')}
      <div class="dv-card-head" style="margin-top:10px">${active ? active.species.name : '—'} (ACTIVO)</div>
      ${active ? bar('HP Digimon', active.hp, active.maxHp, '#7dff9a') : '<div class="dv-empty">Sin digimon activo</div>'}
    `;
    el.appendChild(div);
  }
}
