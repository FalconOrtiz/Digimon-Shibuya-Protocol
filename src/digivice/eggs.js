// src/digivice/eggs.js — panel de DIGIHUEVOS.
// Huevos encontrados en el mundo; incuban con el tiempo jugado. Al eclosionar
// → evento egg:hatch y el digimon se une al equipo.

import { getSpecies } from '../digimon/registry.js';

export const EGG_OPTIONS = ['koromon', 'nyaromon', 'bukamon'];

export class EggsPanel {
  constructor(ctx) {
    this.ctx = ctx;
    this.events = ctx.events;
    this.eggs = [];            // { species, foundAt, hatchInSeconds, secondsPlayed }
    this._seconds = 0;

    this.events.on('egg:found', (p) => this.addEgg(p.species));
    this.events.on('egg:tick', (p) => this._tick(p.seconds));
  }

  addEgg(speciesId) {
    const spec = getSpecies(speciesId) || getSpecies('koromon');
    this.eggs.push({
      species: spec.id,
      name: spec.name,
      foundAt: Date.now(),
      hatchInSeconds: 120,      // 2 minutos de juego para eclosionar
      secondsPlayed: 0
    });
    this.events.emit('egg:status', { count: this.eggs.length });
  }

  _tick(seconds) {
    this._seconds = seconds;
    for (const egg of this.eggs) {
      egg.secondsPlayed += seconds;
    }
    // comprobar eclosiones
    const hatched = this.eggs.filter(e => e.secondsPlayed >= e.hatchInSeconds);
    for (const e of hatched) {
      this.eggs = this.eggs.filter(x => x !== e);
      this.events.emit('egg:hatch', { digimon: e.species, name: e.name });
      // el digimon eclosionado se une al equipo vía digimon system (hook en main)
    }
  }

  render(el) {
    el.innerHTML = '';
    if (this.eggs.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'dv-empty';
      empty.textContent = 'Sin digihuevos. Explora Shibuya y busca huevos brillantes.';
      el.appendChild(empty);
      return;
    }
    const list = document.createElement('div');
    list.className = 'dv-list';
    for (const e of this.eggs) {
      const pct = Math.min(100, Math.round((e.secondsPlayed / e.hatchInSeconds) * 100));
      const row = document.createElement('div');
      row.className = 'dv-row';
      row.innerHTML = `
        <span class="dv-row-name">🥚 ${e.name}</span>
        <div class="dv-bar"><div class="dv-bar-fill" style="width:${pct}%;background:#ffb84a"></div></div>
        <span class="dv-row-count">${pct}%</span>`;
      list.appendChild(row);
    }
    el.appendChild(list);
  }
}
