// src/digivice/profile.js — panel de PERFIL del trainer: nombre, insignias, W/L.

export class ProfilePanel {
  constructor(ctx) {
    this.ctx = ctx;
    this.trainer = ctx.get('trainer');
  }

  render(el) {
    el.innerHTML = '';
    const t = this.trainer;
    const card = document.createElement('div');
    card.className = 'dv-card dv-profile';
    const p = this.ctx.get('player');
    const cfg = this.ctx.config.player;
    card.innerHTML = `
      <div class="dv-profile-avatar">F</div>
      <div class="dv-profile-info">
        <div class="dv-card-name">${t.name}</div>
        <div class="dv-wl">Victorias: <b>${t.wins}</b> · Derrotas: <b>${t.losses}</b></div>
        <div class="dv-wl">Vida ${Math.round(p.hp)}/${cfg.hp} · Energía ${Math.round(p.stamina)}/${cfg.staminaMax}</div>
      </div>
    `;
    el.appendChild(card);

    const badges = document.createElement('div');
    badges.className = 'dv-badges';
    if (t.badges.length === 0) {
      badges.innerHTML = '<div class="dv-empty">Sin insignias aún. Derrota trainers para ganarlas.</div>';
    } else {
      for (const b of t.badges) {
        const el2 = document.createElement('span');
        el2.className = 'dv-badge';
        el2.textContent = b;
        badges.appendChild(el2);
      }
    }
    el.appendChild(badges);
  }
}
