// src/trainer/profile.js — perfil del trainer.
// Nombre, insignias, victorias/derrotas, equipo. Event-driven para la UI.

export class TrainerProfile {
  static id = 'trainer';
  static deps = [];

  constructor() {
    this.name = 'FalconOrtiz';
    this.level = 42;
    this.badges = [];
    this.wins = 0;
    this.losses = 0;
    this.team = [];      // ids de especie
  }

  init(ctx) {
    this.ctx = ctx;
    this.events = ctx.events;
    this.events.on('battle:end', (p) => this._onBattleEnd(p));
    return this;
  }

  _onBattleEnd(p) {
    if (p.result === 'win') this.wins++;
    if (p.result === 'lose') this.losses++;
    this.events.emit('trainer:stats', { wins: this.wins, losses: this.losses });
  }

  setTeam(ids) { this.team = ids; }

  addBadge(name) {
    if (!this.badges.includes(name)) {
      this.badges.push(name);
      this.events.emit('trainer:badge', { badge: name });
    }
  }

  resize() {}
  dispose() {}
}
