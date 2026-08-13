// src/digivice/index.js — el Digivice: overlay de interfaz estilo digivice clásico.
// Tabs: Inventario, Mapa, Digimons, Perfil, Salud/Stamina, Digihuevos.
// Se abre con Tab. Navegación por teclado (flechas + Enter), stack de pantallas.

import { InventoryPanel } from './inventory.js';
import { MapPanel } from './map.js';
import { DigimonsPanel } from './digimons.js';
import { ProfilePanel } from './profile.js';
import { EggsPanel } from './eggs.js';

const TABS = [
  { id: 'inventory', label: 'INVENTARIO', panel: InventoryPanel },
  { id: 'map', label: 'MAPA', panel: MapPanel },
  { id: 'digimons', label: 'DIGIMONS', panel: DigimonsPanel },
  { id: 'profile', label: 'PERFIL', panel: ProfilePanel },
  { id: 'eggs', label: 'HUEVOS', panel: EggsPanel }
];

export class Digivice {
  static id = 'digivice';
  static deps = ['player', 'digimon', 'trainer'];

  constructor() {
    this.open = false;
    this.tabIndex = 0;
    this.panels = [];
    this.rootEl = null;
  }

  init(ctx) {
    this.ctx = ctx;
    this.events = ctx.events;
    this.player = ctx.get('player');
    this.digimonSys = ctx.get('digimon');
    this.trainer = ctx.get('trainer');

    // DOM root
    this.rootEl = document.createElement('div');
    this.rootEl.id = 'digivice';
    this.rootEl.className = 'digivice hidden';
    document.getElementById('ui-root').appendChild(this.rootEl);

    // build tabs
    for (const t of TABS) {
      const panel = new t.panel(ctx);
      panel.init && panel.init(this.rootEl, this);
      this.panels.push({ tab: t, panel });
    }
    this._renderShell();

    // eventos de estado
    this.events.on('digivice:message', (p) => this._toast(p.text));
    this.events.on('mode', (p) => {
      if (p.mode === 'battle' && this.open) this.close();
    });

    this._wasLocked = false;
    this._ignoreUnlock = false;
    this._onLockChange = () => {
      const locked = document.pointerLockElement === this.ctx.canvas;
      if (locked) {
        this._wasLocked = true;
        return;
      }
      // Browser Esc always drops lock. If we were playing, that is a Digivice open.
      if (this._ignoreUnlock) {
        this._ignoreUnlock = false;
        return;
      }
      const battle = this.ctx.peek('battle');
      if (this._wasLocked && !this.open && !(battle && battle.running)) {
        this._wasLocked = false;
        this.open2();
      }
    };
    document.addEventListener('pointerlockchange', this._onLockChange);

    return this;
  }

  _renderShell() {
    this.rootEl.innerHTML = '';
    const frame = document.createElement('div');
    frame.className = 'digivice-frame';

    // header con logo
    const header = document.createElement('div');
    header.className = 'dv-header';
    header.innerHTML = '<span class="dv-logo">DIGIVICE</span><span class="dv-brand">v.01 SHIBUYA</span>';
    frame.appendChild(header);

    // barra de tabs
    const tabbar = document.createElement('div');
    tabbar.className = 'dv-tabs';
    this._tabEls = [];
    for (const t of TABS) {
      const el = document.createElement('button');
      el.className = 'dv-tab';
      el.dataset.tab = t.id;
      el.textContent = t.label;
      el.addEventListener('click', () => this.setTab(t.id));
      tabbar.appendChild(el);
      this._tabEls.push(el);
    }
    frame.appendChild(tabbar);

    // contenedor de panel
    this.contentEl = document.createElement('div');
    this.contentEl.className = 'dv-content';
    frame.appendChild(this.contentEl);

    // footer
    const footer = document.createElement('div');
    footer.className = 'dv-footer';
    footer.textContent = 'ESC abrir/cerrar · ←→ pestañas · ENTER confirmar';
    frame.appendChild(footer);

    this.rootEl.appendChild(frame);
    this._activateTab(this.tabIndex, false);
  }

  setTab(id) {
    const idx = TABS.findIndex(t => t.id === id);
    if (idx >= 0) {
      this.tabIndex = idx;
      this._activateTab(idx, true);
    }
  }

  _activateTab(idx, notify) {
    this.tabIndex = idx;
    // render de cada panel en su contenedor
    this.contentEl.innerHTML = '';
    for (let i = 0; i < this.panels.length; i++) {
      const el = this._tabEls[i];
      el.classList.toggle('active', i === idx);
      if (i === idx) {
        const panelEl = document.createElement('div');
        this.contentEl.appendChild(panelEl);
        this.panels[i].panel.render(panelEl, this);
      }
    }
    if (notify) this.events.emit('digivice:tab', { tab: TABS[idx].id });
  }

  _nextTab(dir) {
    this.tabIndex = (this.tabIndex + dir + TABS.length) % TABS.length;
    this._activateTab(this.tabIndex, true);
  }

  toggle() {
    this.open ? this.close() : this.open2();
  }

  open2() {
    if (this.open) return;
    const battle = this.ctx.peek('battle');
    if (battle && battle.running) return;
    this.open = true;
    this.rootEl.classList.remove('hidden');
    if (document.pointerLockElement) {
      this._ignoreUnlock = true;
      document.exitPointerLock();
    }
    this.events.emit('digivice:open', {});
    this.events.emit('mode', { mode: 'digivice' });
    this._activateTab(this.tabIndex, false);
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.rootEl.classList.add('hidden');
    this.events.emit('digivice:close', {});
    this.events.emit('mode', { mode: 'explore' });
  }

  _toast(text) {
    let toast = document.getElementById('dv-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'dv-toast';
      toast.className = 'dv-toast hidden';
      document.getElementById('ui-root').appendChild(toast);
    }
    toast.textContent = text;
    toast.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => toast.classList.add('hidden'), 2600);
  }

  update() {
    const input = this.ctx.input;
    const battle = this.ctx.peek('battle');
    const inBattle = !!(battle && battle.running);

    // Esc / Tab: only the Digivice. Never a second pause card.
    const toggle = input.tap('digivice') || input.tap('pause');
    if (toggle) {
      if (inBattle) {
        // battle owns Esc as cancel; do not open Digivice
        if (this.open) this.close();
        return;
      }
      if (this.open) this.close();
      else this.open2();
      return;
    }
    if (!this.open) return;
    // flechas: navegar tabs
    for (const code of ['ArrowRight', 'ArrowDown']) {
      if (input.tapRaw && input.tapRaw(code)) { this._nextTab(1); break; }
    }
    for (const code of ['ArrowLeft', 'ArrowUp']) {
      if (input.tapRaw && input.tapRaw(code)) { this._nextTab(-1); break; }
    }
    // Enter: el panel activo maneja
    if (input.tapRaw && input.tapRaw('Enter')) {
      const panel = this.panels[this.tabIndex].panel;
      if (panel.onEnter) panel.onEnter(this);
    }
  }

  resize() {}
  dispose() {
    document.removeEventListener('pointerlockchange', this._onLockChange);
    if (this.rootEl && this.rootEl.parentNode) this.rootEl.parentNode.removeChild(this.rootEl);
  }
}
