import type * as THREE from 'three';
import type { Ctx, GameSystem } from '../core/Context';
import { getSpecies, type SpeciesDef } from '../core/DigimonData';
import { LAYOUT } from '../core/Layout';

/**
 * Digivice: overlay con pestañas (inventario, mapa, digimons, perfil, huevos).
 * Esc/Tab lo abre y cierra; flechas cambian de pestaña. El inventario y los
 * huevos persisten vía `trainer`; los huevos incuban con tiempo de exploración
 * y al eclosionar el digimon entra al equipo.
 */

interface ItemDef {
  name: string;
  desc: string;
  icon: string;
  heal?: number;
}

const ITEMS: Record<string, ItemDef> = {
  digipan: { name: 'DigiPan', desc: 'Pan energético. Recupera 30 HP.', icon: 'item-red-vial.jpg', heal: 30 },
  potion: { name: 'Poción', desc: 'Líquido azul. Recupera 50 HP.', icon: 'item-cyan-vial.jpg', heal: 50 },
  chip: { name: 'Chip de datos', desc: 'Fragmento de código digimon. Sirve para incubar.', icon: 'item-pistol.jpg' },
};
const DEFAULT_ITEMS: Record<string, number> = { digipan: 3, potion: 1, chip: 2 };

const EGG_HATCH_SECONDS = 120;
const PORTRAIT: Record<string, string> = { agumon: '/assets/agumon-sprite.png', patamon: '/assets/patamon-sprite.png' };

type TabId = 'inventory' | 'map' | 'digimons' | 'profile' | 'eggs';
const TABS: { id: TabId; label: string }[] = [
  { id: 'inventory', label: 'INVENTARIO' },
  { id: 'map', label: 'MAPA' },
  { id: 'digimons', label: 'DIGIMONS' },
  { id: 'profile', label: 'PERFIL' },
  { id: 'eggs', label: 'HUEVOS' },
];

interface EggRecord {
  species: string;
  name: string;
  hatchInSeconds: number;
  secondsPlayed: number;
}

interface TrainerLike {
  name: string;
  wins: number;
  losses: number;
  badges: string[];
  savedItems(): Record<string, number>;
  savedEggs(): EggRecord[];
  setEggs(eggs: EggRecord[]): void;
}

interface Member {
  species: SpeciesDef;
  baseSpecies: string;
  level: number;
  hp: number;
  maxHp: number;
  friendship: number;
}

interface DigimonLike {
  party: Member[];
  getActive(): Member;
  addToParty(species: string, level?: number): Member | null;
  setHp(m: Member, hp: number): void;
}

interface PlayerLike {
  pos: THREE.Vector3;
  yaw: number;
  hp: number;
  stamina: number;
}

interface Collider {
  x: number;
  z: number;
  w: number;
  d: number;
}

interface EncountersLike {
  wilds: { model: THREE.Object3D; active: boolean }[];
  rival: { model: THREE.Object3D; active: boolean } | null;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

export class Digivice implements GameSystem {
  static id = 'digivice';
  static deps = ['player', 'digimon', 'trainer', 'buildings'];

  open = false;
  private ctx!: Ctx;
  private trainer!: TrainerLike;
  private digimon!: DigimonLike;
  private player!: PlayerLike;
  private root!: HTMLElement;
  private content!: HTMLElement;
  private tabEls: HTMLElement[] = [];
  private tab = 0;
  private items: Record<string, number> = {};
  private eggs: EggRecord[] = [];
  private mapCanvas = document.createElement('canvas');
  private wasLocked = false;
  private ignoreUnlock = false;
  private toastTimer = 0;
  private eggSave = 0;

  init(ctx: Ctx): this {
    this.ctx = ctx;
    this.trainer = ctx.get<TrainerLike>('trainer');
    this.digimon = ctx.get<DigimonLike>('digimon');
    this.player = ctx.get<PlayerLike>('player');

    const saved = this.trainer.savedItems();
    const fresh = !Object.keys(saved).length;
    this.items = fresh ? { ...DEFAULT_ITEMS } : { ...saved };
    this.eggs = this.trainer.savedEggs().map((e) => ({ ...e }));
    if (fresh && !this.eggs.length) this.addEgg('koromon');

    this.root = document.createElement('div');
    this.root.id = 'digivice';
    this.root.className = 'digivice hidden';
    (document.getElementById('ui-root') ?? document.body).appendChild(this.root);
    this.buildShell();

    ctx.events.on('mode', (p: { mode: string }) => {
      if (p.mode === 'battle' && this.open) this.close();
    });
    ctx.events.on('inventory:add', (p: { item: string; count?: number }) => this.addItem(p.item, p.count ?? 1));
    ctx.events.on('egg:found', (p: { species: string }) => this.addEgg(p.species));
    document.addEventListener('pointerlockchange', this.onLockChange);
    return this;
  }

  /** El navegador suelta el lock con Esc: si estábamos jugando, eso abre el Digivice. */
  private onLockChange = (): void => {
    if (document.pointerLockElement === this.ctx.canvas) {
      this.wasLocked = true;
      return;
    }
    if (this.ignoreUnlock) {
      this.ignoreUnlock = false;
      return;
    }
    if (this.wasLocked && !this.open && !this.inBattle()) {
      this.wasLocked = false;
      this.show();
    }
  };

  private inBattle(): boolean {
    return !!this.ctx.peek<{ running: boolean }>('battle')?.running;
  }

  /* ---- Shell ------------------------------------------------------------- */

  private buildShell(): void {
    const frame = document.createElement('div');
    frame.className = 'digivice-frame';
    frame.innerHTML = '<div class="dv-header"><span class="dv-logo">DIGIVICE</span><span class="dv-brand">v.02 SHIBUYA</span></div>';
    const bar = document.createElement('div');
    bar.className = 'dv-tabs';
    TABS.forEach((t, i) => {
      const b = document.createElement('button');
      b.className = 'dv-tab';
      b.textContent = t.label;
      b.addEventListener('click', () => this.setTab(i));
      bar.appendChild(b);
      this.tabEls.push(b);
    });
    frame.appendChild(bar);
    this.content = document.createElement('div');
    this.content.className = 'dv-content';
    frame.appendChild(this.content);
    const footer = document.createElement('div');
    footer.className = 'dv-footer';
    footer.textContent = 'ESC abrir/cerrar · ←→ pestañas · clic en un objeto para usarlo';
    frame.appendChild(footer);
    this.root.appendChild(frame);
    this.setTab(0, false);
  }

  setTab(i: number, notify = true): void {
    this.tab = (i + TABS.length) % TABS.length;
    this.tabEls.forEach((el, k) => el.classList.toggle('active', k === this.tab));
    this.render();
    if (notify) this.ctx.events.emit('digivice:tab', { tab: TABS[this.tab].id });
  }

  private render(): void {
    const el = this.content;
    el.innerHTML = '';
    switch (TABS[this.tab].id) {
      case 'inventory':
        return this.renderInventory(el);
      case 'map':
        return this.renderMap(el);
      case 'digimons':
        return this.renderDigimons(el);
      case 'profile':
        return this.renderProfile(el);
      case 'eggs':
        return this.renderEggs(el);
    }
  }

  show(): void {
    if (this.open || this.inBattle()) return;
    this.open = true;
    this.root.classList.remove('hidden');
    if (document.pointerLockElement) {
      this.ignoreUnlock = true;
      document.exitPointerLock();
    }
    this.ctx.events.emit('digivice:open', {});
    this.ctx.events.emit('mode', { mode: 'digivice' });
    this.render();
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.root.classList.add('hidden');
    this.ctx.events.emit('digivice:close', {});
    this.ctx.events.emit('mode', { mode: 'explore' });
  }

  private toast(text: string): void {
    let t = document.getElementById('dv-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'dv-toast';
      t.className = 'dv-toast hidden';
      (document.getElementById('ui-root') ?? document.body).appendChild(t);
    }
    t.textContent = text;
    t.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t!.classList.add('hidden'), 2600);
  }

  /* ---- Inventario -------------------------------------------------------- */

  private addItem(id: string, count: number): void {
    if (!ITEMS[id]) return;
    this.items[id] = (this.items[id] ?? 0) + count;
    this.ctx.events.emit('inventory:changed', { item: id, count: this.items[id] });
  }

  private useItem(id: string): void {
    const def = ITEMS[id];
    if (!def?.heal || !this.items[id]) return;
    const m = this.digimon.getActive();
    if (m.hp >= m.maxHp) {
      this.toast(`${m.species.name} ya tiene la vida al máximo.`);
      return;
    }
    this.digimon.setHp(m, m.hp + def.heal);
    this.items[id]--;
    this.ctx.events.emit('inventory:changed', { item: id, count: this.items[id] });
    this.toast(`${def.name}: ${m.species.name} recupera ${def.heal} HP.`);
    this.render();
  }

  private renderInventory(el: HTMLElement): void {
    const list = document.createElement('div');
    list.className = 'dv-list';
    for (const [id, def] of Object.entries(ITEMS)) {
      const row = document.createElement('div');
      row.className = 'dv-row';
      if (def.heal) row.style.cursor = 'pointer';
      row.innerHTML = `<img class="dv-item-icon" src="/assets/imagine/${def.icon}" alt="">
        <span class="dv-row-name">${esc(def.name)}</span>
        <span class="dv-row-count">×${this.items[id] ?? 0}</span>
        <span class="dv-row-desc">${esc(def.desc)}</span>`;
      row.addEventListener('click', () => this.useItem(id));
      list.appendChild(row);
    }
    el.appendChild(list);
  }

  /* ---- Mapa (se dibuja desde los colliders reales del mundo) ------------- */

  private renderMap(el: HTMLElement): void {
    const c = this.mapCanvas;
    c.width = c.height = 320;
    Object.assign(c.style, { width: '100%', height: 'auto', borderRadius: '10px', border: '1px solid rgba(77,225,255,0.35)' });
    el.appendChild(c);
    this.drawMap();
  }

  private drawMap(): void {
    const g = this.mapCanvas.getContext('2d');
    if (!g) return;
    const S = this.mapCanvas.width;
    const VIEW = 150;
    const s = S / VIEW;
    const px = (x: number) => S / 2 + x * s;

    g.fillStyle = '#0c1424';
    g.fillRect(0, 0, S, S);
    // Calzada: dos bandas en cruz; las aceras llegan hasta la línea de fachada.
    g.fillStyle = '#5a5664';
    g.fillRect(px(-LAYOUT.FRONT), 0, LAYOUT.FRONT * 2 * s, S);
    g.fillRect(0, px(-LAYOUT.FRONT), S, LAYOUT.FRONT * 2 * s);
    g.fillStyle = '#34303e';
    g.fillRect(px(-LAYOUT.CURB), 0, LAYOUT.CURB * 2 * s, S);
    g.fillRect(0, px(-LAYOUT.CURB), S, LAYOUT.CURB * 2 * s);
    // Cebras.
    g.fillStyle = 'rgba(232,228,220,0.8)';
    const z0 = LAYOUT.CURB - LAYOUT.ZEBRA;
    for (let i = -LAYOUT.CURB + 1; i < LAYOUT.CURB; i += 2) {
      for (const sgn of [-1, 1]) {
        g.fillRect(px(i), px(sgn > 0 ? z0 : -LAYOUT.CURB), 1 * s, LAYOUT.ZEBRA * s);
        g.fillRect(px(sgn > 0 ? z0 : -LAYOUT.CURB), px(i), LAYOUT.ZEBRA * s, 1 * s);
      }
    }
    // Diagonales del scramble.
    g.strokeStyle = 'rgba(232,228,220,0.35)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(px(-z0), px(-z0));
    g.lineTo(px(z0), px(z0));
    g.moveTo(px(z0), px(-z0));
    g.lineTo(px(-z0), px(z0));
    g.stroke();

    const blocks = this.ctx.get<{ colliders: Collider[] }>('buildings').colliders;
    g.fillStyle = '#3c3a58';
    g.strokeStyle = 'rgba(77,225,255,0.25)';
    g.lineWidth = 1;
    for (const b of blocks) {
      if (b.w < 3 || b.d < 3) continue;
      g.fillRect(px(b.x), px(b.z), b.w * s, b.d * s);
      g.strokeRect(px(b.x), px(b.z), b.w * s, b.d * s);
    }

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = 'bold 9px sans-serif';
    g.fillStyle = '#d8e4f0';
    const A = LAYOUT.FRONT;
    for (const [name, x, z] of [
      ['QFRONT', A + 14, -(A + 13)],
      ['SCRAMBLE SQ', -(A + 15), -(A + 15)],
      ['109', -(A + 12), A + 12],
      ['HIKARIE', A + 15, A + 15],
    ] as const) g.fillText(name, px(x), px(z));

    const hx = -(LAYOUT.CURB + 5.2);
    const hz = LAYOUT.CURB + 6.5;
    g.fillStyle = '#c9a87a';
    g.beginPath();
    g.arc(px(hx), px(hz), 3.5, 0, Math.PI * 2);
    g.fill();
    g.font = '8px sans-serif';
    g.fillStyle = '#e8d8b0';
    g.fillText('HACHIKO', px(hx), px(hz) - 9);

    const enc = this.ctx.peek<EncountersLike>('encounters');
    const dot = (o: THREE.Object3D, r: number, color: string) => {
      g.fillStyle = color;
      g.beginPath();
      g.arc(px(o.position.x), px(o.position.z), r, 0, Math.PI * 2);
      g.fill();
    };
    for (const w of enc?.wilds ?? []) if (w.active) dot(w.model, 3, '#7cff6b');
    if (enc?.rival?.active) dot(enc.rival.model, 4.5, '#ff4dc8');

    const p = this.player.pos;
    g.save();
    g.translate(px(p.x), px(p.z));
    g.rotate(-this.player.yaw);
    g.fillStyle = '#4de1ff';
    g.beginPath();
    g.moveTo(0, -8);
    g.lineTo(5, 6);
    g.lineTo(0, 3);
    g.lineTo(-5, 6);
    g.closePath();
    g.fill();
    g.restore();

    g.fillStyle = 'rgba(77,225,255,0.8)';
    g.font = 'bold 10px sans-serif';
    g.fillText('N', S / 2, 12);
  }

  /* ---- Digimons / perfil ----------------------------------------------- */

  private renderDigimons(el: HTMLElement): void {
    const list = document.createElement('div');
    list.className = 'dv-list';
    for (const m of this.digimon.party) {
      const s = m.species;
      const portrait = PORTRAIT[m.baseSpecies];
      const hearts = Math.max(1, Math.min(5, Math.round(m.friendship / 20)));
      const card = document.createElement('div');
      card.className = 'dv-card';
      card.innerHTML = `
        <div class="dv-card-head">
          ${portrait ? `<img src="${portrait}" alt="" style="width:48px;height:48px;object-fit:contain">` : ''}
          <span class="dv-card-name" style="color:${hex(s.color)}">${esc(s.name)}</span>
          <span class="dv-card-lv">NV.${m.level}</span>
        </div>
        <div class="dv-stat-grid">
          <span>HP</span><b>${m.hp}/${m.maxHp}</b>
          <span>ATK</span><b>${s.base.atk}</b>
          <span>DEF</span><b>${s.base.def}</b>
          <span>VEL</span><b>${s.base.spe}</b>
        </div>
        <div class="dv-bar"><div class="dv-bar-fill" style="width:${Math.round((m.hp / Math.max(1, m.maxHp)) * 100)}%"></div></div>
        <div class="dv-friendship">Amistad: ${'♥'.repeat(hearts)}${'♡'.repeat(5 - hearts)}</div>
        <div class="dv-card-desc">${esc(s.description)}</div>`;
      list.appendChild(card);
    }
    el.appendChild(list);
  }

  private renderProfile(el: HTMLElement): void {
    const t = this.trainer;
    const cfg = this.ctx.config.player;
    const card = document.createElement('div');
    card.className = 'dv-card dv-profile';
    card.innerHTML = `
      <div class="dv-profile-avatar">${esc(t.name.charAt(0).toUpperCase())}</div>
      <div class="dv-profile-info">
        <div class="dv-card-name">${esc(t.name)}</div>
        <div class="dv-wl">Victorias: <b>${t.wins}</b> · Derrotas: <b>${t.losses}</b></div>
        <div class="dv-wl">Vida ${Math.round(this.player.hp)}/${cfg.hp} · Energía ${Math.round(this.player.stamina)}/${cfg.staminaMax}</div>
      </div>`;
    el.appendChild(card);
    const badges = document.createElement('div');
    badges.className = 'dv-badges';
    badges.innerHTML = t.badges.length
      ? t.badges.map((b) => `<span class="dv-badge">${esc(b)}</span>`).join('')
      : '<div class="dv-empty">Sin insignias aún. Derrota trainers para ganarlas.</div>';
    el.appendChild(badges);
  }

  /* ---- Huevos ------------------------------------------------------------ */

  private addEgg(speciesId: string): void {
    const spec = getSpecies(speciesId) ?? getSpecies('koromon')!;
    this.eggs.push({ species: spec.id, name: spec.name, hatchInSeconds: EGG_HATCH_SECONDS, secondsPlayed: 0 });
    this.trainer.setEggs(this.eggs);
    this.ctx.events.emit('egg:status', { count: this.eggs.length });
  }

  private tickEggs(dt: number): void {
    if (!this.eggs.length) return;
    for (const e of this.eggs) e.secondsPlayed += dt;
    const hatched = this.eggs.filter((e) => e.secondsPlayed >= e.hatchInSeconds);
    this.eggSave += dt;
    if (!hatched.length && this.eggSave < 5) return;
    this.eggSave = 0;
    for (const e of hatched) {
      this.digimon.addToParty(e.species, 3);
      this.ctx.events.emit('egg:hatch', { digimon: e.species, name: e.name });
      this.toast(`¡El digihuevo eclosionó: ${e.name} se une al equipo!`);
    }
    this.eggs = this.eggs.filter((e) => e.secondsPlayed < e.hatchInSeconds);
    this.trainer.setEggs(this.eggs);
  }

  private renderEggs(el: HTMLElement): void {
    if (!this.eggs.length) {
      el.innerHTML = '<div class="dv-empty">Sin digihuevos. Explora Shibuya y busca huevos brillantes.</div>';
      return;
    }
    const list = document.createElement('div');
    list.className = 'dv-list';
    for (const e of this.eggs) {
      const pct = Math.min(100, Math.round((e.secondsPlayed / e.hatchInSeconds) * 100));
      const row = document.createElement('div');
      row.className = 'dv-row';
      row.innerHTML = `<img class="dv-item-icon" src="/assets/items/egg.png" alt="">
        <span class="dv-row-name">${esc(e.name)}</span>
        <div class="dv-bar"><div class="dv-bar-fill" style="width:${pct}%;background:#ffb84a"></div></div>
        <span class="dv-row-count">${pct}%</span>`;
      list.appendChild(row);
    }
    el.appendChild(list);
  }

  /* ---- Frame ------------------------------------------------------------- */

  update(dt: number): void {
    const input = this.ctx.input;
    const battle = this.inBattle();
    if (!battle && !this.open) this.tickEggs(dt);

    if (input.tap('digivice') || input.tap('pause')) {
      if (this.open) this.close();
      else if (!battle) this.show();
      return;
    }
    if (!this.open) return;
    if (input.tapRaw('ArrowRight') || input.tapRaw('ArrowDown')) this.setTab(this.tab + 1);
    else if (input.tapRaw('ArrowLeft') || input.tapRaw('ArrowUp')) this.setTab(this.tab - 1);
    if (TABS[this.tab].id === 'map') this.drawMap();
  }

  dispose(): void {
    document.removeEventListener('pointerlockchange', this.onLockChange);
    this.root?.remove();
  }
}
