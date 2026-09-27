// HUD DOM: exploración (perfil, barras, partner) y combate E33. Solo escucha
// eventos y emite `battle:action` / `battle:aim-fire`; no conoce al motor.

import type { Ctx, GameSystem } from '../core/Context';
import './battle.css';

interface Fighter {
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  species: string;
}

interface E33State {
  ap: number;
  apMax: number;
  gradient: number;
  break: number;
  broken: number;
  allyBreak: number;
  ally: Fighter;
  foe: Fighter;
  trainer: string | null;
}

interface MenuState {
  open: boolean;
  name?: string;
  ap?: number;
  gradient?: number;
  moves?: { index: number; name: string; apCost: number; pp: number; usable: boolean }[];
  ult?: { usable: boolean };
  digivolve?: { usable: boolean; cost: number | null; to: string | null };
  aim?: { usable: boolean };
}

interface WindowZone {
  type: string;
  label: string;
  from: number;
  to: number;
  perfect?: number;
}

interface WindowState {
  state: 'incoming' | 'open' | 'follow-up' | 'closed';
  lead?: number;
  span?: number;
  duration?: number;
  timeScale?: number;
  hitType?: string;
  keys?: { key: string; label: string }[];
  zones?: WindowZone[];
  result?: string;
  label?: string;
  grade?: 'perfect' | 'good' | 'miss';
  pressedAt?: number | null;
}

interface PartyLike {
  getActive(): { species: { id: string; name: string }; baseSpecies: string; hp: number; maxHp: number; level: number };
}

const PORTRAIT: Record<string, string> = { agumon: '/assets/agumon-sprite.png', patamon: '/assets/patamon-sprite.png' };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class Hud implements GameSystem {
  static id = 'hud';
  static deps = ['player', 'digimon', 'trainer', 'battle'];

  mode = 'explore';
  private ctx!: Ctx;
  private digimon!: PartyLike;
  private root!: HTMLElement;
  private el: Record<string, HTMLElement> = {};
  private msgTimer = 0;
  private bannerTimer = 0;
  private hitTimer = 0;
  private resultTimer = 0;
  private sweep: Animation[] = [];
  /** Timing bar layout of the current hit: seconds before and after the hit frame. */
  private bar = { lead: 0.32, span: 0.5 };
  private cursor = { x: 0.5, y: 0.5 };

  init(ctx: Ctx): this {
    this.ctx = ctx;
    this.digimon = ctx.get<PartyLike>('digimon');
    this.root = document.getElementById('ui-root') ?? document.body;
    this.build();
    this.wire();
    this.updateDigimon();
    return this;
  }

  private build(): void {
    const trainer = this.ctx.get<{ name: string; level: number }>('trainer');
    const hud = document.createElement('div');
    hud.id = 'hud';
    hud.innerHTML = `
      <div id="crosshair"><span></span></div>
      <div id="hitmarker" class="hidden"></div>
      <div id="hud-top-left">
        <div class="profile-head">
          <div id="profile-avatar"><img src="/assets/imagine/avatar-hood.jpg" alt=""></div>
          <div class="profile-info">
            <div id="hud-trainer-name">${esc(trainer.name)}</div>
            <div id="profile-level">LEVEL <span id="profile-level-num">${trainer.level}</span></div>
          </div>
        </div>
        <div id="hud-bars">
          <div class="hud-bar-row"><span class="hud-bar-label">HEALTH</span><div class="hud-bar"><div id="hud-hp" class="hud-bar-fill hp"></div></div><span class="hud-bar-num" id="hud-hp-num">100/100</span></div>
          <div class="hud-bar-row"><span class="hud-bar-label">ENERGY</span><div class="hud-bar"><div id="hud-stamina" class="hud-bar-fill st"></div></div><span class="hud-bar-num" id="hud-st-num">100/100</span></div>
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
      <div id="hud-relock" class="hidden">Click to return to Shibuya</div>
      <div id="hud-message" class="hidden"></div>
      <div id="battle-ui" class="hidden">
        <div id="bt-foe" class="bt-card"></div>
        <div id="bt-ally" class="bt-card"></div>
        <div id="bt-banner" class="hidden"></div>
        <div id="bt-menu" class="hidden"></div>
        <div id="bt-defend" class="hidden">
          <div id="bt-prompt"></div>
          <div id="bt-track"><div id="bt-fill"></div><div id="bt-lanes"></div><div id="bt-impact"></div><div id="bt-cursor"></div><div id="bt-press"></div></div>
          <div class="bt-keys" id="bt-keys"></div>
          <div id="bt-result"></div>
        </div>
        <div id="bt-aim-catch" class="hidden"></div>
        <div id="bt-reticle" class="hidden"></div>
      </div>
      <div id="bt-flash"></div>`;
    this.root.appendChild(hud);
    for (const n of hud.querySelectorAll<HTMLElement>('[id]')) this.el[n.id] = n;
    this.el.hud = hud;

    const aim = this.el['bt-aim-catch'];
    aim.addEventListener('mousemove', (e) => {
      this.cursor.x = e.clientX / innerWidth;
      this.cursor.y = e.clientY / innerHeight;
      this.el['bt-reticle'].style.left = `${e.clientX}px`;
      this.el['bt-reticle'].style.top = `${e.clientY}px`;
    });
    aim.addEventListener('mousedown', (e) => {
      this.ctx.events.emit('battle:aim-fire', { x: e.clientX / innerWidth, y: e.clientY / innerHeight });
    });
  }

  private wire(): void {
    const ev = this.ctx.events;
    ev.on('player:health', (p: { current: number; max: number }) => {
      this.el['hud-hp'].style.width = `${(p.current / p.max) * 100}%`;
      this.el['hud-hp-num'].textContent = `${Math.round(p.current)}/${p.max}`;
    });
    ev.on('player:stamina', (p: { current: number; max: number }) => {
      this.el['hud-stamina'].style.width = `${(p.current / p.max) * 100}%`;
      this.el['hud-st-num'].textContent = `${Math.round(p.current)}/${p.max}`;
    });
    ev.on('digimon:damage', () => this.updateDigimon());
    ev.on('digimon:heal', () => this.updateDigimon());
    ev.on('digimon:active', () => this.updateDigimon());
    ev.on('digimon:digivolve', () => this.updateDigimon());
    ev.on('digimon:xp', (p: { gained: number }) => this.msg(`+${p.gained} XP`));
    ev.on('digivice:message', (p: { text: string }) => this.msg(p.text));
    ev.on('digivice:close', () => this.el['hud-relock'].classList.remove('hidden'));
    ev.on('digivice:open', () => this.el['hud-relock'].classList.add('hidden'));
    ev.on('mode', (p: { mode: string }) => {
      this.mode = p.mode;
      const battle = p.mode === 'battle';
      this.el['battle-ui'].classList.toggle('hidden', !battle);
      this.el['hud-top-left'].classList.toggle('hidden', battle);
      this.el['hud-digimon'].classList.toggle('hidden', battle);
      if (!battle) this.resetBattle();
    });

    ev.on('battle:start', () => this.resetBattle());
    ev.on('battle:e33', (s: E33State) => this.paintState(s));
    ev.on('battle:menu', (m: MenuState) => this.paintMenu(m));
    ev.on('battle:message', (p: { text: string }) => this.banner(p.text));
    ev.on('battle:window', (w: WindowState) => this.paintWindow(w));
    ev.on('battle:aim', (p: { open: boolean }) => {
      this.el['bt-aim-catch'].classList.toggle('hidden', !p.open);
      this.el['bt-reticle'].classList.toggle('hidden', !p.open);
    });
    ev.on('battle:hit', (p: { target: string; damage: number; crit?: boolean }) => {
      if (p.target === 'enemy' && p.damage > 0) this.hitmarker(!!p.crit);
    });
    ev.on('battle:flash', (p: { color: string }) => this.flash(p.color));
    ev.on('battle:end', () => this.updateDigimon());
  }

  /* ---- Exploración ---------------------------------------------------- */

  private updateDigimon(): void {
    const a = this.digimon.getActive();
    if (!a) return;
    this.el['hud-dhp'].style.width = `${(a.hp / Math.max(1, a.maxHp)) * 100}%`;
    this.el['hud-digimon-name'].textContent = a.species.name;
    this.el['hud-digimon-lv'].textContent = `LV.${a.level}`;
    const img = this.el['hud-digimon-portrait'] as HTMLImageElement;
    const src = PORTRAIT[a.baseSpecies];
    img.style.display = src ? 'block' : 'none';
    if (src && !img.src.endsWith(src)) img.src = src;
  }

  private msg(text: string): void {
    const m = this.el['hud-message'];
    m.textContent = text;
    m.classList.remove('hidden');
    clearTimeout(this.msgTimer);
    this.msgTimer = window.setTimeout(() => m.classList.add('hidden'), 2200);
  }

  private hitmarker(crit: boolean): void {
    const h = this.el.hitmarker;
    h.classList.remove('hidden');
    h.classList.toggle('crit', crit);
    clearTimeout(this.hitTimer);
    this.hitTimer = window.setTimeout(() => h.classList.add('hidden'), 160);
  }

  /* ---- Combate ----------------------------------------------------------- */

  private resetBattle(): void {
    this.el['bt-menu'].classList.add('hidden');
    this.el['bt-defend'].classList.add('hidden');
    this.el['bt-aim-catch'].classList.add('hidden');
    this.el['bt-reticle'].classList.add('hidden');
    this.el['bt-banner'].classList.add('hidden');
  }

  private paintState(s: E33State): void {
    const pct = (a: number, b: number) => `${Math.max(0, Math.min(100, (a / Math.max(1, b)) * 100))}%`;
    this.el['bt-foe'].innerHTML = `
      <div class="bt-name"><span>${s.trainer ? `${esc(s.trainer)} · ` : ''}${esc(s.foe.name)}${s.broken > 0 ? '<span class="bt-badge">STUNNED</span>' : ''}</span><span class="bt-lv">LV.${s.foe.level}</span></div>
      <div class="bt-row"><span>HP</span><div class="hud-bar"><div class="hud-bar-fill ehp" style="width:${pct(s.foe.hp, s.foe.maxHp)}"></div></div></div>
      <div class="bt-row"><span>BRK</span><div class="hud-bar"><div class="hud-bar-fill brk" style="width:${pct(s.break, 100)}"></div></div></div>`;
    const pips = Array.from({ length: s.apMax }, (_, i) => `<i class="${i < s.ap ? 'on' : ''}"></i>`).join('');
    this.el['bt-ally'].innerHTML = `
      <div class="bt-name"><span>${esc(s.ally.name)}</span><span class="bt-lv">LV.${s.ally.level}</span></div>
      <div class="bt-row"><span>HP</span><div class="hud-bar"><div class="hud-bar-fill dhp" style="width:${pct(s.ally.hp, s.ally.maxHp)}"></div></div><span class="bt-num">${s.ally.hp}/${s.ally.maxHp}</span></div>
      <div class="bt-row"><span>AP</span><div class="bt-pips">${pips}</div></div>
      <div class="bt-row"><span>GRD</span><div class="hud-bar"><div class="hud-bar-fill grd${s.gradient >= 100 ? ' full' : ''}" style="width:${pct(s.gradient, 100)}"></div></div><span class="bt-num">${Math.round(s.gradient)}%</span></div>
      <div class="bt-row"><span>BRK</span><div class="hud-bar"><div class="hud-bar-fill brk" style="width:${pct(s.allyBreak, 100)}"></div></div></div>`;
  }

  private paintMenu(m: MenuState): void {
    const menu = this.el['bt-menu'];
    if (!m.open || !m.moves) {
      menu.classList.add('hidden');
      return;
    }
    const btn = (key: number, label: string, cost: string, action: string, usable: boolean, extra = '', cls = '') =>
      `<button class="bt-btn ${cls}" data-action="${action}" ${extra} ${usable ? '' : 'disabled'}><kbd>${key}</kbd><span>${esc(label)}</span><span class="bt-cost">${cost}</span></button>`;
    const moves = m.moves
      .map((mv) => btn(mv.index + 1, mv.name, mv.index === 0 ? '+2 AP' : `${mv.apCost} AP`, mv.index === 0 ? 'basic' : 'skill', mv.usable, `data-index="${mv.index}"`))
      .join('');
    const dv = m.digivolve!;
    menu.innerHTML = `
      <div class="bt-menu-title">WHAT WILL ${esc((m.name ?? '').toUpperCase())} DO?</div>
      ${moves}
      <div class="bt-split">
        ${btn(5, 'ULT', `${Math.round(m.gradient ?? 0)}%`, 'ult', !!m.ult?.usable, '', 'special')}
        ${btn(6, dv.to ? `→ ${dv.to}` : 'DIGIVOLVE', dv.cost !== null ? `${dv.cost}%` : '—', 'digivolve', dv.usable, '', 'special')}
        ${btn(7, 'FREE AIM', '1 AP', 'aim', !!m.aim?.usable)}
        ${btn(8, 'RUN', '', 'run', true)}
      </div>`;
    menu.classList.remove('hidden');
    for (const b of menu.querySelectorAll<HTMLButtonElement>('.bt-btn')) {
      b.addEventListener('click', () => {
        this.ctx.events.emit('battle:action', { type: b.dataset.action, index: b.dataset.index ? Number(b.dataset.index) : undefined });
      });
    }
  }

  private banner(text: string): void {
    const b = this.el['bt-banner'];
    b.textContent = text;
    b.classList.remove('hidden');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => b.classList.add('hidden'), 2600);
  }

  /** Starts the loading-style sweep: cursor and fill run the bar in battle time. */
  private startSweep(lead: number, span: number, zones: WindowZone[], timeScale: number): void {
    this.bar = { lead, span };
    const total = lead + span;
    const pct = (t: number) => `${((lead + t) / total) * 100}%`;
    const lanes = this.el['bt-lanes'];
    const h = 100 / Math.max(1, zones.length);
    lanes.innerHTML = zones
      .map((z, i) => {
        const perfect = z.perfect !== undefined
          ? `<i class="perfect" style="left:${pct(z.from)};width:${(Math.min(z.perfect, z.to) - z.from) / total * 100}%"></i>`
          : '';
        return `<div class="bt-lane ${z.type}" style="top:${i * h}%;height:${h}%">
          <i style="left:${pct(z.from)};width:${((z.to - z.from) / total) * 100}%"></i>${perfect}<b>${esc(z.label)}</b></div>`;
      })
      .join('');
    this.el['bt-impact'].style.left = pct(0);
    for (const a of this.sweep) a.cancel();
    const duration = (total * 1000) / Math.max(0.05, timeScale);
    const opts: KeyframeAnimationOptions = { duration, easing: 'linear', fill: 'forwards' };
    this.sweep = [
      this.el['bt-cursor'].animate([{ left: '0%' }, { left: '100%' }], opts),
      this.el['bt-fill'].animate([{ width: '0%' }, { width: '100%' }], opts),
    ];
  }

  private paintWindow(w: WindowState): void {
    const box = this.el['bt-defend'];
    const prompt = this.el['bt-prompt'];
    const result = this.el['bt-result'];
    if (w.state === 'closed') {
      for (const a of this.sweep) a.pause();
      const { lead, span } = this.bar;
      if (w.pressedAt !== null && w.pressedAt !== undefined) {
        this.el['bt-press'].style.left = `${((lead + Math.min(span, w.pressedAt)) / (lead + span)) * 100}%`;
      } else {
        this.el['bt-press'].style.left = '100%';
      }
      box.classList.remove('perfect', 'good', 'miss');
      box.classList.add(w.grade ?? 'miss');
      result.textContent = w.label ?? '';
      prompt.textContent = w.grade === 'perfect' ? 'PERFECT TIMING' : w.grade === 'good' ? 'SUCCESS' : w.result === 'clean' ? 'NO GUARD' : 'BAD TIMING';
      prompt.classList.remove('now');
      clearTimeout(this.resultTimer);
      this.resultTimer = window.setTimeout(() => box.classList.add('hidden'), 750);
      return;
    }
    clearTimeout(this.resultTimer);
    box.classList.remove('hidden', 'perfect', 'good', 'miss');
    this.el['bt-keys'].innerHTML = (w.keys ?? []).map((k) => `<span><b>${esc(k.key)}</b>${esc(k.label)}</span>`).join('');
    result.textContent = '';
    if (w.state === 'incoming') {
      prompt.textContent = w.hitType === 'gradient' ? 'GRADIENT ATTACK — COUNTER!' : 'INCOMING — GET READY';
      prompt.classList.remove('now');
      this.startSweep(w.lead ?? 0.32, w.span ?? 0.5, w.zones ?? [], w.timeScale ?? 1);
    } else if (w.state === 'open') {
      prompt.textContent = 'NOW!';
      prompt.classList.remove('now');
      void prompt.offsetWidth;
      prompt.classList.add('now');
    } else {
      prompt.textContent = 'COUNTER — PARRY!';
      prompt.classList.add('now');
      const d = w.duration ?? 0.18;
      this.startSweep(0.08, d, [{ type: 'parry', label: 'PARRY', from: 0, to: d, perfect: d }], w.timeScale ?? 1);
    }
  }

  private flash(color: string): void {
    const f = this.el['bt-flash'];
    f.style.transition = 'none';
    f.style.background = `radial-gradient(circle at 50% 46%, ${color}cc 0%, ${color}55 45%, transparent 80%)`;
    f.style.opacity = '1';
    requestAnimationFrame(() => {
      f.style.transition = 'opacity 0.35s ease-out';
      f.style.opacity = '0';
    });
  }

  update(): void {
    this.el.crosshair.style.opacity = this.mode === 'explore' ? '1' : '0';
    if (this.ctx.input.locked) this.el['hud-relock'].classList.add('hidden');
  }

  dispose(): void {
    this.el.hud?.remove();
  }
}
