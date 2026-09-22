import * as THREE from 'three';
import type { Ctx, GameSystem } from '../core/Context';
import { getMove } from '../core/DigimonMoves';
import { evolutionOf, getSpecies, xpForDefeating } from '../core/DigimonData';
import { clamp, lerp } from '../core/Noise';
import { Battle, digivolveCost, AP_MAX, type BattleEvent, type E33Action, type Side } from './engine/BattleEngine';
import { matchWindow, validInputs, DEFEND_KEYS, WINDOWS, type DefendResult, type WindowType } from './engine/DefendWindows';
import type { TimelineHit } from './engine/timelines';
import { BattleArena } from './Arena';
import { BattleFX } from './BattleFX';

/**
 * BattleSystem — director del combate E33 in situ, en el cruce.
 *
 * El combate ocurre donde salta el encuentro: la arena de datos se proyecta
 * delante del trainer, el partner real (el mismo modelo que te sigue) se fija
 * en su pad y el salvaje se materializa en el otro. El motor puro
 * (`engine/BattleEngine`) resuelve; aquí solo se reproduce: cámara, FX,
 * animación, ventanas de defensa en tiempo real y los eventos que pinta el HUD.
 *
 * El tiempo del combate corre en su propio reloj (`bt`) escalado por
 * `timeScale`, así el harness puede acelerar hasta una fase y congelarla.
 * Se registra después de `player`, así que su escritura de cámara gana.
 */

type Phase = 'idle' | 'intro' | 'menu' | 'aim' | 'turn' | 'enemy' | 'defend' | 'outcome';

export interface BattleRequest {
  enemySpecies: string;
  enemyLevel?: number;
  trainerName?: string | null;
  rival?: boolean;
  seed?: number;
}

interface PartyMemberLike {
  species: { id: string; name: string };
  baseSpecies: string;
  model: THREE.Group;
  anim: { play(state: string, dur?: number, cb?: (() => void) | null): void; update(dt: number): void; state: string };
  level: number;
  hp: number;
  maxHp: number;
}

interface WildLike {
  species: { id: string; name: string };
  model: THREE.Group;
  anim: PartyMemberLike['anim'];
  level: number;
}

interface DigimonLike {
  pin(at: THREE.Vector3, yaw: number): PartyMemberLike;
  release(): void;
  transform(member: PartyMemberLike, to: string): boolean;
  revert(member: PartyMemberLike): void;
  grantXp(member: PartyMemberLike, amount: number): number;
  setHp(member: PartyMemberLike, hp: number): void;
  createWildMember(species: string, level: number): WildLike | null;
  disposeWildMember(m: WildLike | null): void;
}

interface PlayerLike {
  pos: THREE.Vector3;
  yaw: number;
  height: number;
}

const DEFEND_LABEL: Record<WindowType, string> = {
  dodge: 'ESQUIVAR', parry: 'PARAR', jump: 'SALTAR', gradient: 'GRADIENT',
};
const RESULT_LABEL: Partial<Record<DefendResult, string>> = {
  'perfect-parry': '¡PARRY PERFECTO!',
  'perfect-dodge': '¡ESQUIVA PERFECTA!',
  parry: '¡PARRY!',
  dodge: '¡ESQUIVADO!',
  jump: '¡SALTO!',
  gradient: '¡GRADIENT!',
  whiff: '¡Tarde!',
};
const KEY_LABEL: Record<string, string> = { Space: 'ESPACIO', KeyE: 'E', ShiftLeft: 'SHIFT', KeyF: 'F' };
/** Atajos de teclado del menú: 1 básico, 2-4 skills, 5 ULT, 6 digievolución, 7 puntería, 8 huir. */
const MENU_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8'];
/** Lead visual antes de cada hit frame (el HUD cierra el anillo en este tiempo). */
const INCOMING_LEAD = 0.32;

const smooth = (t: number) => t * t * (3 - 2 * t);
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const x = t - 1;
  return 1 + (c1 + 1) * x * x * x + c1 * x * x;
}

export class BattleSystem implements GameSystem {
  static id = 'battle';
  static deps = ['digimon', 'player', 'trainer'];

  phase: Phase = 'idle';
  /** Sub-fase fina para el harness de capturas. */
  marker = '';
  timeScale = 1;

  private ctx!: Ctx;
  private digimon!: DigimonLike;
  private player!: PlayerLike;
  private arena!: BattleArena;
  private fx!: BattleFX;

  private battle: Battle | null = null;
  private request: BattleRequest | null = null;
  private ally: PartyMemberLike | null = null;
  private wild: WildLike | null = null;

  private bt = 0;
  private waits: { t: number; res: () => void }[] = [];
  private anims: { t0: number; dur: number; fn: (t: number) => void; res: () => void }[] = [];
  private predicates: { test: () => boolean; res: () => void }[] = [];

  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private camPosT = new THREE.Vector3();
  private camLookT = new THREE.Vector3();
  private camSpeed = 3;
  private idleDrift = false;
  private shake = 0;

  private pendingAction: E33Action | { type: 'aim' } | null = null;
  private defendInput: { type: WindowType; t: number } | null = null;
  private defendInjected: WindowType | null = null;
  private windowOpenAt = 0;
  private aimShot: { x: number; y: number } | null = null;
  private tmp = new THREE.Vector3();
  private disposed = false;

  get running(): boolean {
    return this.phase !== 'idle';
  }

  init(ctx: Ctx): this {
    this.ctx = ctx;
    this.digimon = ctx.get<DigimonLike>('digimon');
    this.player = ctx.get<PlayerLike>('player');
    this.arena = new BattleArena(ctx.scene, ctx.config.battle.arenaRadius * 0.57);
    this.fx = new BattleFX(ctx.scene, ctx.config.seed ^ 0x77);

    ctx.events.on('battle:request', (p: BattleRequest) => void this.start(p));
    ctx.events.on('battle:action', (p: { type: string; index?: number }) => this.queueAction(p));
    ctx.events.on('battle:aim-fire', (p: { x: number; y: number }) => {
      if (this.phase === 'aim') this.aimShot = { x: p.x, y: p.y };
    });
    this.publishDebug();
    return this;
  }

  /* ---- Reloj de combate ----------------------------------------------- */

  private wait(seconds: number): Promise<void> {
    return new Promise((res) => this.waits.push({ t: this.bt + seconds, res }));
  }

  private animate(dur: number, fn: (t: number) => void): Promise<void> {
    return new Promise((res) => this.anims.push({ t0: this.bt, dur, fn, res }));
  }

  private waitFor(test: () => boolean): Promise<void> {
    if (test()) return Promise.resolve();
    return new Promise((res) => this.predicates.push({ test, res }));
  }

  private say(text: string, hold = 0.6): Promise<void> {
    this.ctx.events.emit('battle:message', { text });
    return this.wait(hold);
  }

  /* ---- Inicio ------------------------------------------------------------ */

  async start(req: BattleRequest): Promise<void> {
    if (this.phase !== 'idle' || !getSpecies(req.enemySpecies)) return;
    this.phase = 'intro';
    this.marker = 'intro';
    this.request = req;
    this.bt = 0;

    if (document.pointerLockElement) document.exitPointerLock();
    this.ctx.events.emit('mode', { mode: 'battle' });

    const feet = this.tmp.set(this.player.pos.x, this.player.pos.y - this.player.height, this.player.pos.z);
    this.arena.place(feet, this.player.yaw);
    const f = this.arena.forward;
    const r = this.arena.right;
    const c = this.arena.center;
    const spot = this.arena.padPlayer.clone().addScaledVector(f, -0.9).addScaledVector(r, -1.25);
    this.ctx.events.emit('battle:stage', {
      center: { x: c.x, z: c.z },
      radius: this.arena.radius + 0.8,
      trainer: { x: spot.x, z: spot.z },
      yaw: this.player.yaw,
    });
    this.ally = this.digimon.pin(this.arena.padPlayer, Math.atan2(f.x, f.z));

    const level = req.enemyLevel ?? 4;
    this.wild = this.digimon.createWildMember(req.enemySpecies, level);
    if (!this.wild) {
      this.phase = 'idle';
      return;
    }
    this.wild.model.position.copy(this.arena.padWild);
    this.wild.model.rotation.set(0, Math.atan2(-f.x, -f.z), 0);
    this.wild.model.scale.setScalar(0.001);
    this.ctx.scene.add(this.wild.model);

    const trainer = this.ctx.get<{ chips: string[] }>('trainer');
    const seed = (req.seed ?? this.ctx.rng.int(1, 0x7fffffff)) >>> 0;
    this.battle = new Battle({
      player: { species: this.ally.species.id, level: this.ally.level, hp: this.ally.hp },
      wild: { species: req.enemySpecies, level },
      seed,
      chips: trainer.chips,
    });
    this.fx.reseed(seed ^ 0x77);

    this.arena.show();
    this.ctx.events.emit('battle:start', {
      enemy: this.battle.wild.name,
      level,
      trainer: req.trainerName ?? null,
      rival: !!req.rival,
      ap: 0,
      apMax: AP_MAX,
      gradient: 0,
      break: 0,
    });
    this.emitState();
    void this.intro();
  }

  private async intro(): Promise<void> {
    const b = this.battle!;
    const wildPad = this.arena.padWild;
    const wildH = this.heightOf(this.wild!.model);
    const r = this.arena.right;
    const f = this.arena.forward;

    this.cutTo(
      this.tmp.copy(wildPad).addScaledVector(f, -1.5).addScaledVector(r, -0.9).setY(wildPad.y + 0.35),
      wildPad.clone().setY(wildPad.y + wildH * 0.5),
    );
    this.fx.ring(wildPad, 0xff4dc8, 1.6, 0.5);
    this.fx.dust(wildPad, 20);
    void this.animate(0.42, (t) => this.wild?.model.scale.setScalar(Math.max(0.001, easeOutBack(t))));
    const sayP = this.say(
      this.request?.trainerName ? `¡${this.request.trainerName} te reta con ${b.wild.name}!` : `¡Un ${b.wild.name} salvaje aparece en el cruce!`,
      1.0,
    );

    // Arco lento desde el plano bajo del salvaje hasta el plano general.
    const from = this.camPos.clone();
    const lookFrom = this.camLook.clone();
    const { pos: wideP, look: wideL } = this.wideShot();
    await this.animate(1.8, (t) => {
      const e = smooth(t);
      this.cutTo(from.clone().lerp(wideP, e).setY(lerp(from.y, wideP.y, e * e)), lookFrom.clone().lerp(wideL, e));
    });
    await sayP;

    this.marker = 'send-out';
    this.fx.ring(this.arena.padPlayer, 0x4de1ff, 1.4, 0.45);
    this.fx.sparkles(this.arena.padPlayer, 0x9fe8ff, 32);
    await this.say(`¡Adelante, ${b.player.name}!`, 0.6);
    this.beginMenu();
  }

  /* ---- Menú --------------------------------------------------------------- */

  private beginMenu(): void {
    const b = this.battle;
    if (!b) return;
    this.phase = 'menu';
    this.marker = b.gradient >= 100 ? 'gradient-ready' : 'menu';
    this.idleDrift = true;
    this.pendingAction = null;
    this.emitState();
    this.emitMenu(true);
    this.ctx.events.emit('battle:turn', { actor: 'player', phase: 'menu', ap: b.ap, gradient: b.gradient });
  }

  private emitMenu(open: boolean): void {
    const b = this.battle;
    if (!b || !open) {
      this.ctx.events.emit('battle:menu', { open: false });
      return;
    }
    const cost = digivolveCost(b.evolutionStage);
    const to = evolutionOf(b.player.species);
    this.ctx.events.emit('battle:menu', {
      open: true,
      name: b.player.name,
      ap: b.ap,
      gradient: b.gradient,
      moves: b.player.moves.map((slot, index) => {
        const m = getMove(slot.id);
        const apCost = index === 0 ? 0 : m.apCost ?? 0;
        return { index, name: m.name, element: m.element, apCost, pp: slot.pp, usable: b.ap >= apCost && slot.pp > 0 };
      }),
      ult: { usable: b.gradient >= 100 },
      digivolve: {
        usable: !!to && cost !== null && b.gradient >= cost,
        cost,
        to: to ? getSpecies(to)?.name ?? to : null,
      },
      aim: { usable: b.ap >= 1 },
    });
  }

  private queueAction(p: { type: string; index?: number }): void {
    if (this.phase !== 'menu') return;
    switch (p.type) {
      case 'basic':
        this.pendingAction = { type: 'basic' };
        break;
      case 'skill':
        this.pendingAction = p.index === 0 ? { type: 'basic' } : { type: 'skill', index: p.index ?? 1 };
        break;
      case 'ult':
      case 'digivolve':
      case 'run':
      case 'aim':
        this.pendingAction = { type: p.type };
        break;
    }
  }

  private handleMenuKeys(): void {
    const input = this.ctx.input;
    const moves = this.battle?.player.moves.length ?? 1;
    for (let i = 0; i < MENU_KEYS.length; i++) {
      if (!input.tapRaw(MENU_KEYS[i])) continue;
      if (i === 0) this.queueAction({ type: 'basic' });
      else if (i < 4 && i < moves) this.queueAction({ type: 'skill', index: i });
      else if (i === 4) this.queueAction({ type: 'ult' });
      else if (i === 5) this.queueAction({ type: 'digivolve' });
      else if (i === 6) this.queueAction({ type: 'aim' });
      else if (i === 7) this.queueAction({ type: 'run' });
    }
    const a = this.pendingAction;
    if (!a) return;
    this.pendingAction = null;
    if (a.type === 'aim') this.enterAim();
    else void this.playTurn(a);
  }

  /* ---- Puntería libre (Digivice) ----------------------------------------- */

  private enterAim(): void {
    const b = this.battle;
    if (!b || b.ap < 1) {
      void this.say('Necesitas 1 AP para apuntar.', 0.6);
      return;
    }
    this.phase = 'aim';
    this.marker = 'aim';
    this.idleDrift = false;
    this.aimShot = null;
    this.emitMenu(false);
    this.punchInOn('player');
    this.ctx.events.emit('battle:aim', { open: true });
    void this.say('PUNTERÍA — clic sobre el núcleo del salvaje', 0.1);
  }

  /** Resuelve el disparo: distancia en pantalla al punto débil proyectado. */
  private resolveAim(x: number, y: number): void {
    const b = this.battle!;
    this.phase = 'turn';
    this.marker = 'aim:shot';
    this.ctx.events.emit('battle:aim', { open: false });

    const wp = getSpecies(b.wild.species)?.weakPoints[0];
    const model = this.wild!.model;
    const core = this.tmp.copy(model.position).setY(model.position.y + this.heightOf(model) * 0.45);
    const center = core.clone().project(this.ctx.camera);
    const edge = core.clone().addScaledVector(this.arena.right, wp?.radius ?? 0.2).project(this.ctx.camera);
    const radius = Math.max(0.03, Math.abs(edge.x - center.x) * 0.5 * 1.6);
    const sx = (center.x + 1) / 2;
    const sy = (1 - center.y) / 2;
    const hit = Math.hypot(x - sx, (y - sy) * (this.ctx.camera.aspect > 0 ? 1 / this.ctx.camera.aspect : 1)) < radius;

    void (async () => {
      for (const ev of b.resolveFreeAim(wp?.id ?? 'core', hit)) {
        if (this.disposed) return;
        await this.playEvent(ev);
      }
      this.emitState();
      this.syncAllyHp();
      if (b.result) return this.finish(b.result);
      await this.wait(0.3);
      this.beginMenu();
    })();
  }

  /* ---- Turno ---------------------------------------------------------------- */

  private async playTurn(action: E33Action): Promise<void> {
    const b = this.battle;
    if (!b || this.phase !== 'menu') return;
    this.phase = 'turn';
    this.marker = 'turn';
    this.idleDrift = false;
    this.emitMenu(false);

    const events = b.act(action);
    for (const ev of events) {
      if (this.disposed) return;
      await this.playEvent(ev);
    }
    this.emitState();
    this.syncAllyHp();
    if (b.result) return this.finish(b.result);

    const refused = events.length === 1 && events[0].kind === 'stat' && events[0].failed && events[0].side === 'player';
    if (refused || events.some((e) => e.kind === 'ult' || e.kind === 'digivolve')) {
      await this.wait(0.35);
      this.beginMenu();
      return;
    }

    await this.playEnemyAttack();
    this.emitState();
    this.syncAllyHp();
    if (b.result) return this.finish(b.result);
    this.glideToWide(2.2);
    this.beginMenu();
  }

  /** Reproduce la AttackTimeline enemiga: telegrafiado + ventanas de defensa. */
  private async playEnemyAttack(): Promise<void> {
    const b = this.battle!;
    const { event, timeline } = b.beginEnemyAttack();
    if (!timeline) {
      if (event.kind === 'stat') await this.say(`${b.wild.name} está aturdido: pierde su turno.`, 0.8);
      return;
    }

    this.phase = 'enemy';
    this.marker = 'windup';
    this.punchInOn('wild');
    this.ctx.events.emit('battle:turn', { actor: 'enemy', digimon: b.wild.name, action: timeline.name, phase: 'windup' });
    this.ctx.events.emit('battle:telegraph', { name: timeline.name, windup: timeline.windup, hits: timeline.hits.length });
    const sayP = this.say(`${b.wild.name} prepara ${timeline.name.toUpperCase()}…`, 0.4);

    const mon = this.wild!.model;
    const pad = this.arena.padWild;
    const f = this.arena.forward;
    const kind = timeline.windup;
    await this.animate(timeline.windupTime, (t) => {
      const c = Math.sin(t * Math.PI);
      mon.position.copy(pad);
      mon.scale.setScalar(1);
      if (kind === 'dash') {
        mon.position.addScaledVector(f, c * 0.45);
        mon.scale.set(1 + c * 0.1, 1 - c * 0.12, 1 + c * 0.1);
      } else if (kind === 'breath') {
        mon.scale.set(1 + c * 0.12, 1 + c * 0.18, 1 + c * 0.12);
      } else if (kind === 'leap') {
        mon.position.y = pad.y + c * 0.5;
      } else {
        mon.scale.setScalar(1 + Math.sin(t * Math.PI * 4) * 0.05);
      }
    });
    mon.position.copy(pad);
    mon.scale.setScalar(1);
    await sayP;

    this.phase = 'defend';
    this.glideToWide(4);
    let prevT = 0;
    for (let i = 0; i < timeline.hits.length; i++) {
      if (this.disposed || b.result) return;
      const hit = timeline.hits[i];
      await this.wait(Math.max(0, hit.t - prevT - INCOMING_LEAD));
      prevT = hit.t;

      this.ctx.events.emit('battle:window', {
        state: 'incoming', lead: INCOMING_LEAD, hitType: hit.type, keys: this.keysFor(hit.type),
      });
      void this.animate(INCOMING_LEAD, (t) => {
        mon.position.copy(pad).addScaledVector(f, -Math.sin(t * Math.PI * 0.5) * this.arena.padGap * 0.9);
      });
      await this.wait(INCOMING_LEAD);

      const result = await this.openDefendWindow(hit);
      for (const ev of b.resolveHitFrame(i, result)) {
        if (this.disposed) return;
        await this.playEvent(ev);
      }
      void this.animate(0.2, (t) => mon.position.lerpVectors(mon.position, pad, smooth(t)));
      this.emitState();
      if (b.result) return;
    }

    this.marker = 'resolve';
    for (const ev of b.endEnemyAttack()) {
      if (this.disposed) return;
      await this.playEvent(ev);
    }
    mon.position.copy(pad);
  }

  /** Input real de la ventana abierta (lo escribe `update`, fuera de este async). */
  private pressed(): WindowType | null {
    return this.defendInput?.type ?? null;
  }

  private keysFor(type: TimelineHit['type']): { type: WindowType; key: string; label: string }[] {
    return validInputs(type).map((w) => ({ type: w, key: KEY_LABEL[DEFEND_KEYS[w]] ?? DEFEND_KEYS[w], label: DEFEND_LABEL[w] }));
  }

  /** Abre la ventana del hit frame y espera el input (teclas reales o harness). */
  private async openDefendWindow(hit: TimelineHit): Promise<DefendResult> {
    const chips = this.battle!.chips;
    const input = this.ctx.input;
    for (const key of Object.values(DEFEND_KEYS)) input.tapRaw(key);
    this.defendInput = null;
    this.windowOpenAt = this.bt;
    this.marker = `defend:${hit.type}`;
    this.ctx.events.emit('battle:window', { state: 'open', duration: WINDOWS.dodge.close, hitType: hit.type, keys: this.keysFor(hit.type) });

    const longest = WINDOWS.dodge.close + 0.05;
    await this.waitFor(() => !!this.defendInjected || !!this.defendInput || this.bt - this.windowOpenAt > longest);

    let pressed: { type: WindowType; t: number } | null = this.defendInput;
    if (this.defendInjected) pressed = { type: this.defendInjected, t: 0.05 };
    this.defendInjected = null;
    this.defendInput = null;
    let result = matchWindow(hit, pressed, chips);

    // Esquiva perfecta: abre un parry de remate dentro de la misma ventana.
    if (result === 'perfect-dodge' && hit.type !== 'gradient') {
      this.marker = 'defend:follow-up';
      this.ctx.events.emit('battle:window', { state: 'follow-up', duration: WINDOWS.parry.close, hitType: hit.type, keys: this.keysFor('strike').filter((k) => k.type === 'parry') });
      const t0 = this.bt;
      const parried = () => this.pressed() === 'parry' || this.defendInjected === 'parry';
      await this.waitFor(() => parried() || this.bt - t0 > WINDOWS.parry.close);
      if (parried()) result = 'perfect-parry';
      this.defendInput = null;
      this.defendInjected = null;
    }

    this.marker = result === 'clean' || result === 'whiff' ? 'resolve:hit' : `defend:${result}`;
    this.ctx.events.emit('battle:window', { state: 'closed', result, label: RESULT_LABEL[result] ?? '' });
    this.ctx.events.emit('battle:defend', { result, label: RESULT_LABEL[result] ?? '' });
    return result;
  }

  /* ---- Reproducción de eventos del motor ---------------------------------- */

  private async playEvent(ev: BattleEvent): Promise<void> {
    const b = this.battle!;
    switch (ev.kind) {
      case 'move':
        return this.playMove(ev);
      case 'stat':
        if (ev.failed && ev.side === 'player') {
          const why = ev.moveName === 'STUNNED' ? `${b.player.name} está aturdido.` :
            ev.moveName === 'ULT' ? 'El Gradient no está al 100%.' :
            ev.moveName === 'DIGIVOLVE' ? 'Aún no hay Gradient suficiente para digievolucionar.' :
            `No hay AP suficiente para ${ev.moveName}.`;
          return this.say(why, 0.7);
        }
        return this.playStat(ev);
      case 'faint':
        return this.playFaint(ev.side);
      case 'run':
        return this.say(ev.success ? '¡Escapaste!' : '¡No puedes escapar!', 0.8);
      case 'hit-frame':
        return this.playHitFrame(ev);
      case 'counter': {
        this.marker = 'counter';
        const w = this.wild!;
        const at = this.focusOf(w.model);
        this.fx.impact(at, 0xffd24a, 1.5);
        this.ally!.anim.play('attack', 0.4);
        w.anim.play('hit', 0.45);
        this.shake = 0.06;
        this.ctx.events.emit('battle:hit', { target: 'enemy', damage: ev.damage, crit: false, counter: true });
        return this.say(`¡CONTRAATAQUE! −${ev.damage}`, 0.7);
      }
      case 'break':
        this.marker = 'break';
        this.fx.ring(this.arena.padWild, 0x37e0ff, 1.8, 0.5);
        this.ctx.events.emit('battle:flash', { color: '#37e0ff' });
        return this.say(`¡DATA BREAK! ${b.wild.name} queda aturdido ${ev.turns} turnos.`, 1.0);
      case 'ult': {
        this.marker = 'ult';
        this.punchInOn('player');
        const at = this.focusOf(this.wild!.model);
        this.ally!.anim.play('attack', 0.5);
        await this.wait(0.2);
        this.fx.impact(at, 0xff4dc8, 2.2);
        this.fx.ring(this.arena.padWild, 0xff4dc8, 2.4, 0.5);
        this.wild!.anim.play('hit', 0.5);
        this.shake = 0.12;
        this.ctx.events.emit('battle:flash', { color: '#ff4dc8' });
        this.ctx.events.emit('battle:hit', { target: 'enemy', damage: ev.damage, crit: true });
        return this.say(`¡PROTOCOLO ULTIMATE! −${ev.damage}`, 0.9);
      }
      case 'digivolve':
        return this.playDigivolve(ev.to, ev.name);
      case 'freeaim':
        if (ev.damage > 0) {
          this.fx.impact(this.focusOf(this.wild!.model), 0x6ef0ff, 1.4);
          this.wild!.anim.play('hit', 0.4);
          this.ctx.events.emit('battle:hit', { target: 'enemy', damage: ev.damage, crit: ev.mult >= 2 });
          return this.say(ev.mult >= 2 ? `¡PUNTO DÉBIL! −${ev.damage}` : `¡Golpe! −${ev.damage}`, 0.7);
        }
        return this.say('¡Fallaste el disparo!', 0.6);
      default:
        return;
    }
  }

  private async playMove(ev: Extract<BattleEvent, { kind: 'move' }>): Promise<void> {
    const b = this.battle!;
    const attacker = ev.side === 'player' ? this.ally! : this.wild!;
    const defender = ev.side === 'player' ? this.wild! : this.ally!;
    const aPad = ev.side === 'player' ? this.arena.padPlayer : this.arena.padWild;
    const dPad = ev.side === 'player' ? this.arena.padWild : this.arena.padPlayer;
    const move = getMove(ev.moveId);
    const name = ev.side === 'player' ? b.player.name : b.wild.name;

    this.marker = 'attack';
    this.punchInOn(ev.side);
    const sayP = this.say(`¡${name} usa ${move.name.toUpperCase()}!`, 0.45);
    attacker.anim.play('attack', 0.5);

    const from = this.focusOf(attacker.model);
    const to = this.focusOf(defender.model);
    switch (move.fx) {
      case 'fire':
        this.fx.fireArc(from, to, 0.4);
        await this.wait(0.4);
        break;
      case 'bubble':
        this.fx.bubbles(from, to, 0.5);
        await this.wait(0.45);
        break;
      case 'gust':
        this.fx.gust(dPad, 0.7);
        await this.wait(0.45);
        break;
      case 'sonic':
        this.fx.sonicRings(from, to);
        await this.wait(0.4);
        break;
      case 'holy':
        this.fx.holyBeam(to, 0.55);
        await this.wait(0.4);
        break;
      default: {
        const hitPoint = aPad.clone().lerp(dPad, 0.62);
        this.fx.dashStreak(from, to);
        await this.animate(0.18, (t) => {
          attacker.model.position.lerpVectors(aPad, hitPoint, t * t);
          attacker.model.position.y = aPad.y + Math.sin(t * Math.PI) * (move.fx === 'dive' ? 0.6 : 0.2);
        });
      }
    }

    if (ev.missed) {
      await sayP;
      await this.say('¡Falló!', 0.6);
    } else {
      this.marker = 'impact';
      const strength = (ev.effectiveness > 1 ? 1.6 : ev.effectiveness < 1 ? 0.7 : 1) * (ev.crit ? 1.35 : 1);
      this.fx.impact(to, ev.effectiveness > 1 ? 0xffd24a : 0xffe9a8, strength);
      defender.anim.play('hit', 0.45);
      this.shake = 0.05 * strength;
      this.ctx.events.emit('battle:hit', {
        target: ev.side === 'player' ? 'enemy' : 'player', damage: ev.damage, crit: ev.crit, eff: ev.effectiveness,
      });
      this.emitState();
      await sayP;
      if (ev.crit) await this.say('¡Golpe crítico!', 0.5);
      if (ev.effectiveness > 1) await this.say('¡Es muy eficaz!', 0.6);
      else if (ev.effectiveness < 1) await this.say('No es muy eficaz…', 0.6);
    }
    await this.animate(0.2, (t) => attacker.model.position.lerpVectors(attacker.model.position, aPad, smooth(t)));
    attacker.model.position.copy(aPad);
  }

  private async playStat(ev: Extract<BattleEvent, { kind: 'stat' }>): Promise<void> {
    const b = this.battle!;
    const user = ev.side === 'player' ? this.ally! : this.wild!;
    const target = ev.target === 'player' ? this.ally! : this.wild!;
    this.punchInOn(ev.side);
    user.anim.play('attack', 0.4);
    this.fx.sonicRings(this.focusOf(user.model), this.focusOf(target.model));
    await this.say(`¡${ev.side === 'player' ? b.player.name : b.wild.name} usa ${ev.moveName.toUpperCase()}!`, 0.5);
    if (ev.failed) return this.say('Pero no tuvo efecto.', 0.5);
    const stat = { atk: 'ATAQUE', def: 'DEFENSA', spe: 'VELOCIDAD', acc: 'PRECISIÓN' }[ev.stat];
    const who = ev.target === 'player' ? b.player.name : b.wild.name;
    return this.say(`La ${stat} de ${who} ${ev.delta < 0 ? 'baja' : 'sube'}.`, 0.6);
  }

  private async playHitFrame(ev: Extract<BattleEvent, { kind: 'hit-frame' }>): Promise<void> {
    const ally = this.ally!;
    const m = ally.model;
    const pad = this.arena.padPlayer;
    const at = this.focusOf(m);

    if (ev.result !== 'clean' && ev.result !== 'whiff') {
      const r = this.arena.right;
      if (ev.result === 'dodge' || ev.result === 'perfect-dodge') {
        void this.animate(0.3, (t) => m.position.copy(pad).addScaledVector(r, Math.sin(t * Math.PI) * 0.6));
      } else if (ev.result === 'jump') {
        void this.animate(0.34, (t) => m.position.copy(pad).setY(pad.y + Math.sin(t * Math.PI) * 0.55));
      } else {
        ally.anim.play('attack', 0.25);
      }
      this.fx.sparkles(at, ev.result === 'gradient' ? 0xff4dc8 : 0x6ef0ff, 18);
      if (ev.result.includes('parry')) this.fx.impact(at, 0x6ef0ff, 0.8);
      this.ctx.events.emit('battle:hit', { target: 'player', damage: 0, blocked: true, dodge: ev.result.includes('dodge') });
      await this.wait(0.32);
      m.position.copy(pad);
      return;
    }

    this.fx.impact(at, 0xff7a4a, 1);
    ally.anim.play('hit', 0.45);
    this.shake = 0.05;
    this.ctx.events.emit('battle:hit', { target: 'player', damage: ev.damage, crit: false, blocked: false });
    this.emitState();
    await this.wait(0.3);
  }

  private async playFaint(side: Side): Promise<void> {
    const b = this.battle!;
    const mon = side === 'player' ? this.ally! : this.wild!;
    const pad = side === 'player' ? this.arena.padPlayer : this.arena.padWild;
    this.marker = 'faint';
    const f = this.arena.forward;
    const r = this.arena.right;
    this.glideTo(
      pad.clone().addScaledVector(f, side === 'wild' ? -2.0 : 2.0).addScaledVector(r, 1.6).setY(pad.y + 0.35),
      this.focusOf(mon.model),
      5,
    );
    mon.anim.play('death', 0.7);
    await this.wait(0.7);
    this.fx.dust(pad, 30);
    if (side === 'wild') {
      await this.animate(0.5, (t) => mon.model.scale.setScalar(Math.max(0.001, 1 - t)));
      mon.model.visible = false;
    }
    await this.say(`¡${side === 'player' ? b.player.name : b.wild.name} se debilitó!`, 0.9);
  }

  private async playDigivolve(to: string, name: string): Promise<void> {
    const ally = this.ally!;
    const pad = this.arena.padPlayer;
    this.marker = 'digivolve';
    this.punchInOn('player');
    this.ctx.events.emit('battle:flash', { color: '#ffd24a' });
    this.fx.ring(pad, 0xffd24a, 2.2, 0.6);
    this.fx.sparkles(pad, 0xfff0c4, 56);
    this.shake = 0.08;
    await this.say(`¡${ally.species.name.toUpperCase()} DIGIEVOLUCIONA A…!`, 0.9);

    this.digimon.transform(ally, to);
    const model = ally.model;
    model.scale.setScalar(0.001);
    this.fx.ring(pad, 0xff4dc8, 2.6, 0.5);
    this.fx.sparkles(pad, 0x9fe8ff, 48);
    void this.animate(0.6, (t) => model.scale.setScalar(Math.max(0.001, easeOutBack(t))));
    this.ctx.events.emit('digimon:digivolved', { species: to, name });
    await this.say(`¡${name}!`, 1.0);
    this.glideToWide(2);
  }

  /* ---- Final ------------------------------------------------------------ */

  private async finish(result: 'victory' | 'defeat' | 'fled'): Promise<void> {
    const b = this.battle!;
    const ally = this.ally!;
    this.phase = 'outcome';
    this.emitMenu(false);
    let xp = 0;
    let levels = 0;

    // HP de vuelta a la forma base, conservando el porcentaje.
    const ratio = b.player.hp / b.player.stats.hp;

    if (result === 'victory') {
      this.marker = 'victory';
      const f = this.arena.forward;
      this.glideTo(
        this.arena.padPlayer.clone().addScaledVector(f, 1.9).addScaledVector(this.arena.right, 0.9).setY(this.arena.padPlayer.y + 0.8),
        this.focusOf(ally.model),
        4,
      );
      ally.anim.play('win', 1.2);
      xp = xpForDefeating(b.wild.level);
      await this.say(`¡Has derrotado a ${b.wild.name}!`, 1.1);
    } else if (result === 'defeat') {
      this.marker = 'defeat';
      await this.say('Tu digimon no puede seguir… vuelve al Digivice.', 1.2);
    } else {
      this.marker = 'fled';
    }

    this.digimon.revert(ally);
    this.digimon.setHp(ally, result === 'defeat' ? Math.max(1, Math.floor(ally.maxHp * 0.25)) : Math.max(1, ratio * ally.maxHp));
    if (xp > 0) {
      levels = this.digimon.grantXp(ally, xp);
      this.ctx.events.emit('digimon:xp', { digimon: ally.species.id, gained: xp, xp: 0 });
      await this.say(levels > 0 ? `+${xp} XP · ¡${ally.species.name} sube a NV.${ally.level}!` : `+${xp} XP`, 0.9);
    }

    this.arena.hide();
    this.digimon.disposeWildMember(this.wild);
    this.wild = null;
    this.digimon.release();
    this.fx.clear();
    this.battle = null;
    this.phase = 'idle';
    this.marker = '';
    this.timeScale = 1;
    this.waits.length = 0;
    this.anims.length = 0;
    this.predicates.length = 0;

    const legacy = result === 'victory' ? 'win' : result === 'defeat' ? 'lose' : 'fled';
    this.ctx.events.emit('battle:end', { result: legacy, xp, levels });
    this.ctx.events.emit('mode', { mode: 'explore' });
    const canvas = this.ctx.canvas;
    setTimeout(() => {
      if (!document.pointerLockElement && this.phase === 'idle') canvas.requestPointerLock?.();
    }, 400);
  }

  /* ---- Estado para el HUD ------------------------------------------------ */

  private emitState(): void {
    const b = this.battle;
    if (!b) return;
    this.ctx.events.emit('battle:e33', {
      ap: b.ap,
      apMax: AP_MAX,
      gradient: b.gradient,
      break: b.wild.break,
      broken: b.wild.brokenTurns,
      allyBreak: b.player.break,
      ally: { name: b.player.name, level: b.player.level, hp: b.player.hp, maxHp: b.player.stats.hp, species: b.player.species },
      foe: { name: b.wild.name, level: b.wild.level, hp: b.wild.hp, maxHp: b.wild.stats.hp, species: b.wild.species },
      trainer: this.request?.trainerName ?? null,
      stage: b.evolutionStage,
    });
  }

  /** Refleja el HP del combate en el indicador del partner del HUD. */
  private syncAllyHp(): void {
    const b = this.battle;
    const ally = this.ally;
    if (!b || !ally) return;
    this.ctx.events.emit('digimon:damage', { digimon: ally.species.id, amount: 0, hp: b.player.hp, maxHp: b.player.stats.hp });
  }

  /* ---- Cámara ------------------------------------------------------------ */

  private heightOf(model: THREE.Object3D): number {
    return (model.userData.height as number | undefined) ?? 1;
  }

  private focusOf(model: THREE.Object3D): THREE.Vector3 {
    return model.position.clone().setY(model.position.y + this.heightOf(model) * 0.5);
  }

  private cutTo(pos: THREE.Vector3, look: THREE.Vector3): void {
    this.camPos.copy(pos);
    this.camLook.copy(look);
    this.camPosT.copy(pos);
    this.camLookT.copy(look);
  }

  private glideTo(pos: THREE.Vector3, look: THREE.Vector3, speed = 3): void {
    this.camPosT.copy(pos);
    this.camLookT.copy(look);
    this.camSpeed = speed;
  }

  /** Plano general: tras el hombro derecho del trainer, los dos pads en cuadro. */
  private wideShot(): { pos: THREE.Vector3; look: THREE.Vector3 } {
    const a = this.arena;
    const pos = a.padPlayer.clone().addScaledVector(a.forward, -2.5).addScaledVector(a.right, 2.4);
    pos.y = a.center.y + 1.8;
    const look = a.center.clone().addScaledVector(a.forward, 0.45).addScaledVector(a.right, -0.2);
    look.y = a.center.y + 0.4;
    return { pos, look };
  }

  private glideToWide(speed = 3): void {
    const { pos, look } = this.wideShot();
    this.glideTo(pos, look, speed);
  }

  private punchInOn(side: Side): void {
    const a = this.arena;
    const pad = side === 'player' ? a.padPlayer : a.padWild;
    const other = side === 'player' ? a.padWild : a.padPlayer;
    const back = pad.clone().sub(other).setY(0).normalize();
    const right = new THREE.Vector3(back.z, 0, -back.x);
    const model = side === 'player' ? this.ally?.model : this.wild?.model;
    const h = model ? this.heightOf(model) : 1;
    const cam = pad.clone().addScaledVector(back, 1.3 + h * 0.6).addScaledVector(right, 0.9).setY(pad.y + 0.45 + h * 0.5);
    const look = other.clone().setY(other.y + 0.4);
    this.glideTo(cam, look, 6);
  }

  private applyCamera(dt: number): void {
    const cam = this.ctx.camera;
    if (this.idleDrift) {
      const { pos, look } = this.wideShot();
      const t = this.bt;
      pos.addScaledVector(this.arena.right, Math.sin(t * 0.16) * 0.35);
      pos.y += Math.sin(t * 0.21) * 0.08;
      this.camPosT.copy(pos);
      this.camLookT.copy(look);
      this.camSpeed = 1.6;
    }
    const k = 1 - Math.exp(-this.camSpeed * dt);
    this.camPos.lerp(this.camPosT, k);
    this.camLook.lerp(this.camLookT, k);

    this.shake *= Math.exp(-dt / 0.11);
    const s = this.shake;
    const t = this.bt;
    const ox = (Math.sin(t * 47.1) + Math.sin(t * 23.7 + 1.2) * 0.6) * s;
    const oy = (Math.sin(t * 61.3 + 0.7) + Math.sin(t * 31.9 + 2.1) * 0.6) * s;
    cam.position.set(this.camPos.x + ox, this.camPos.y + oy, this.camPos.z);
    cam.lookAt(this.camLook.x + ox * 0.4, this.camLook.y + oy * 0.4, this.camLook.z);
  }

  /* ---- Frame -------------------------------------------------------------- */

  update(dt: number): void {
    this.arena.update(dt, this.bt);
    if (this.phase === 'idle') return;
    const sdt = dt * this.timeScale;
    this.bt += sdt;

    for (let i = this.waits.length - 1; i >= 0; i--) {
      if (this.waits[i].t <= this.bt) this.waits.splice(i, 1)[0].res();
    }
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      const t = a.dur <= 0 ? 1 : clamp((this.bt - a.t0) / a.dur, 0, 1);
      a.fn(t);
      if (t >= 1) this.anims.splice(i, 1)[0].res();
    }
    for (let i = this.predicates.length - 1; i >= 0; i--) {
      if (this.predicates[i].test()) this.predicates.splice(i, 1)[0].res();
    }

    this.wild?.anim.update(sdt);
    this.fx.update(sdt);

    if (this.phase === 'menu') {
      this.handleMenuKeys();
    } else if (this.phase === 'aim') {
      const shot = this.aimShot;
      if (shot) {
        this.aimShot = null;
        this.resolveAim(shot.x, shot.y);
      } else if (this.ctx.input.tapRaw('Escape')) {
        this.ctx.events.emit('battle:aim', { open: false });
        this.beginMenu();
      }
    } else if (this.phase === 'defend' && !this.defendInput) {
      const input = this.ctx.input;
      for (const [type, key] of Object.entries(DEFEND_KEYS) as [WindowType, string][]) {
        if (input.tapRaw(key)) {
          this.defendInput = { type, t: this.bt - this.windowOpenAt };
          break;
        }
      }
    }
  }

  lateUpdate(dt: number): void {
    if (this.phase === 'idle') return;
    this.applyCamera(Math.max(1e-4, dt * this.timeScale));
  }

  /* ---- Harness --------------------------------------------------------- */

  private publishDebug(): void {
    const api = {
      start: (req?: Partial<BattleRequest>) => void this.start({ enemySpecies: 'koromon', enemyLevel: 4, seed: 7, ...req }),
      act: (type: string, index?: number) => this.queueAction({ type, index }),
      defend: (type: WindowType) => {
        if (this.phase === 'defend') this.defendInjected = type;
      },
      aim: (x: number, y: number) => {
        if (this.phase === 'aim') this.aimShot = { x, y };
      },
      state: () => `${this.phase}:${this.marker}`,
      setTimeScale: (k: number) => {
        this.timeScale = clamp(k, 0, 40);
      },
      gauges: () => {
        const b = this.battle;
        return b && {
          ap: b.ap, gradient: b.gradient, wildBreak: b.wild.break, playerBreak: b.player.break,
          wildHp: b.wild.hp, playerHp: b.player.hp, species: b.player.species,
        };
      },
    };
    this.ctx.scene.userData.battleDebug = api;
    (globalThis as { __BATTLE__?: typeof api }).__BATTLE__ = api;
  }

  dispose(): void {
    this.disposed = true;
    this.digimon.disposeWildMember(this.wild);
    this.arena.dispose();
    this.fx.dispose();
  }
}
