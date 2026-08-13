// src/digivice/digimons.js — panel de DIGIMONS: stats de cada miembro del equipo.

export class DigimonsPanel {
  constructor(ctx) {
    this.ctx = ctx;
    this.digimonSys = ctx.get('digimon');
  }

  render(el) {
    el.innerHTML = '';
    const list = document.createElement('div');
    list.className = 'dv-list';

    for (const m of this.digimonSys.party) {
      const s = m.species;
      const card = document.createElement('div');
      card.className = 'dv-card';
      const hpPct = Math.round((m.hp / m.maxHp) * 100);
      const portrait = s.id === 'patamon' ? '/assets/patamon-sprite.png' : '/assets/agumon-sprite.png';
      card.innerHTML = `
        <div class="dv-card-head">
          <img src="${portrait}" alt="" style="width:48px;height:48px;object-fit:contain">
          <span class="dv-card-name" style="color:#${s.color.toString(16).padStart(6,'0')}">${s.name}</span>
          <span class="dv-card-lv">NV.${m.level}</span>
        </div>
        <div class="dv-stat-grid">
          <span>HP</span><b>${m.hp}/${m.maxHp}</b>
          <span>ATK</span><b>${s.atk}</b>
          <span>DEF</span><b>${s.def}</b>
          <span>SP</span><b>${s.sp}</b>
        </div>
        <div class="dv-bar"><div class="dv-bar-fill" style="width:${hpPct}%"></div></div>
        <div class="dv-friendship">Amistad: ${'♥'.repeat(Math.max(1, Math.round(m.friendship / 20)))}${'♡'.repeat(Math.max(0, 5 - Math.round(m.friendship / 20)))}</div>
        <div class="dv-card-desc">${s.description}</div>
      `;
      list.appendChild(card);
    }
    el.appendChild(list);
  }
}
