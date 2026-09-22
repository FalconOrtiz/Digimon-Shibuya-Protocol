import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MOVES, effectiveness } from '../src/core/DigimonMoves.ts';
import { DIGIMON_SPECIES, evolutionOf, xpToNext } from '../src/core/DigimonData.ts';
import { Battle, BREAK_POOL, BREAK_STUN_TURNS, AP_MAX, GRADIENT_PER_DEFEND, digivolveCost } from '../src/battle/engine/BattleEngine.ts';
import { matchWindow, negatesDamage, defendAp, validInputs, WINDOWS } from '../src/battle/engine/DefendWindows.ts';
import { ATTACK_TIMELINES } from '../src/battle/engine/timelines.ts';
import { DIGICHIPS } from '../src/battle/engine/digichips.ts';

const e33 = (seed = 42, over = {}) =>
  new Battle({
    player: { species: 'agumon', level: 5, ...over.player },
    wild: { species: 'koromon', level: 3, ...over.wild },
    seed,
    chips: over.chips,
  });

test('E33: el básico da +2 AP y topa en 9', () => {
  const b = e33(1, { wild: { level: 40 } });
  assert.equal(b.ap, 0);
  b.act({ type: 'basic' });
  assert.equal(b.ap, 2);
  for (let i = 0; i < 10; i++) b.act({ type: 'basic' });
  assert.equal(b.ap, AP_MAX);
});

test('E33: las skills cuestan AP y se rechazan sin AP', () => {
  const b = e33(2, { wild: { level: 40 } });
  const refused = b.act({ type: 'skill', index: 1 });
  assert.ok(refused.some((e) => e.kind === 'stat' && e.failed));
  assert.equal(b.ap, 0);
  b.act({ type: 'basic' });
  const ok = b.act({ type: 'skill', index: 1 });
  assert.ok(ok.some((e) => e.kind === 'move'));
  assert.equal(b.ap, 0);
});

test('E33: parry anula un strike y da +1 AP; gradient no se puede parar', () => {
  const strike = ATTACK_TIMELINES['tackle-rush'].hits[0];
  assert.equal(matchWindow(strike, { type: 'parry', t: 0.1 }), 'parry');
  assert.equal(matchWindow(strike, { type: 'parry', t: 0.3 }), 'whiff');
  assert.equal(matchWindow(strike, null), 'clean');
  assert.equal(matchWindow(strike, { type: 'dodge', t: 0.1 }), 'perfect-dodge');
  assert.equal(matchWindow(strike, { type: 'parry', t: 0.19 }, ['reflex-core']), 'parry');
  assert.ok(negatesDamage('parry'));
  assert.equal(defendAp('parry'), 1);
  const grad = ATTACK_TIMELINES['wing-gust'].hits[0];
  assert.equal(matchWindow(grad, { type: 'parry', t: 0.1 }), 'whiff');
  assert.equal(matchWindow(grad, { type: 'gradient', t: 0.1 }), 'gradient');
  assert.ok(WINDOWS.dodge.close >= WINDOWS.parry.close);
});

test('E33: combo parado entero → contraataque automático', () => {
  const b = e33(7, { wild: { level: 20 } });
  const { timeline } = b.beginEnemyAttack();
  assert.ok(timeline);
  timeline.hits.forEach((_, i) => b.resolveHitFrame(i, 'parry'));
  const counter = b.endEnemyAttack().find((e) => e.kind === 'counter');
  assert.ok(counter, 'evento counter');
  assert.ok(counter.damage > 0);
});

test('E33: DATA BREAK aturde 2 turnos y el salvaje pierde el ataque', () => {
  const b = e33(12, { chips: ['break-bit'], wild: { level: 40 } });
  for (let i = 0; i < 12 && b.wild.break < BREAK_POOL; i++) b.act({ type: 'basic' });
  assert.ok(b.wild.break >= BREAK_POOL);
  b.endEnemyAttack();
  assert.equal(b.wild.brokenTurns, BREAK_STUN_TURNS);
  const { event, timeline } = b.beginEnemyAttack();
  assert.equal(timeline, null);
  assert.equal(event.kind, 'stat');
});

test('E33: gradient sube con AP gastado y con defensas; ULT reinicia', () => {
  const b = e33(21, { wild: { level: 40 } });
  b.ap = 9;
  b.act({ type: 'skill', index: 3 });
  const afterSkill = b.gradient;
  assert.ok(afterSkill > 0);
  b.beginEnemyAttack();
  b.resolveHitFrame(0, 'gradient');
  assert.equal(b.gradient, afterSkill + GRADIENT_PER_DEFEND);
  b.gradient = 100;
  assert.ok(b.act({ type: 'ult' }).some((e) => e.kind === 'ult'));
  assert.equal(b.gradient, 0);
});

test('E33: puntería libre cuesta 1 AP y aplica el multiplicador del punto débil', () => {
  const b = e33(31, { wild: { level: 20 } });
  b.ap = 3;
  const hp = b.wild.hp;
  const fa = b.resolveFreeAim('core', true).find((e) => e.kind === 'freeaim');
  assert.equal(b.ap, 2);
  assert.ok(fa.mult >= 2);
  assert.ok(b.wild.hp < hp);
});

test('E33: cadena de digievolución Agumon→Greymon→MetalGreymon con coste creciente', () => {
  const b = e33(51, { wild: { level: 40 } });
  b.gradient = 40;
  assert.ok(b.act({ type: 'digivolve' }).some((e) => e.kind === 'stat' && e.failed));
  b.gradient = 60;
  const dg = b.act({ type: 'digivolve' }).find((e) => e.kind === 'digivolve');
  assert.equal(dg?.to, 'greymon');
  assert.equal(b.player.moves[0].id, 'horn-strike');
  assert.equal(digivolveCost(b.evolutionStage), 100);
  b.gradient = 100;
  assert.equal(b.act({ type: 'digivolve' }).find((e) => e.kind === 'digivolve')?.to, 'metalgreymon');
  b.gradient = 100;
  assert.ok(b.act({ type: 'digivolve' }).some((e) => e.kind === 'stat' && e.failed), 'etapa máxima');

  const p = e33(52, { player: { species: 'patamon' }, wild: { level: 40 } });
  p.gradient = 100;
  assert.equal(p.act({ type: 'digivolve' }).find((e) => e.kind === 'digivolve')?.to, 'angemon');
  p.gradient = 100;
  assert.equal(p.act({ type: 'digivolve' }).find((e) => e.kind === 'digivolve')?.to, 'magnaangemon');
});

test('Datos: todas las especies tienen moves, timelines y evolución válidos', () => {
  for (const s of Object.values(DIGIMON_SPECIES)) {
    for (const m of s.moves) assert.ok(MOVES[m], `${s.id} → move ${m}`);
    for (const a of s.attacks) assert.ok(ATTACK_TIMELINES[a], `${s.id} → timeline ${a}`);
    if (s.digivolvesTo) assert.ok(DIGIMON_SPECIES[evolutionOf(s.id)], `${s.id} → ${s.digivolvesTo}`);
    assert.ok(s.weakPoints.length > 0);
  }
  for (const t of Object.values(ATTACK_TIMELINES)) for (const h of t.hits) assert.ok(validInputs(h.type).length > 0);
  assert.equal(DIGICHIPS.length, 5);
  assert.ok(effectiveness('water', 'fire') > 1);
  assert.ok(xpToNext(6) > xpToNext(5));
});

test('Determinismo: misma seed y acciones → mismo combate', () => {
  const run = () => {
    const b = e33(99, { wild: { level: 8 } });
    const log = [];
    for (let i = 0; i < 6 && !b.result; i++) {
      log.push(...b.act({ type: i % 3 === 2 ? 'skill' : 'basic', index: 1 }).map((e) => `${e.kind}:${e.damage ?? ''}`));
      const { timeline } = b.beginEnemyAttack();
      timeline?.hits.forEach((_, k) => log.push(...b.resolveHitFrame(k, k % 2 ? 'clean' : 'dodge').map((e) => `${e.kind}:${e.damage ?? ''}`)));
      b.endEnemyAttack();
    }
    return log.join('|');
  };
  assert.equal(run(), run());
});
