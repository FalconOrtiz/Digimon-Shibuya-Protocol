import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../src/core/Rng.ts';
import { Events } from '../src/core/Events.ts';
import { topoSort } from '../src/core/Engine.ts';

test('Rng: misma seed, misma secuencia; fork no contamina al padre', () => {
  const a = new Rng(42);
  const b = new Rng(42);
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
  const c = new Rng(7);
  const d = new Rng(7);
  c.fork().next();
  d.fork();
  assert.equal(c.next(), d.next());
});

test('Rng.int es inclusivo en ambos extremos', () => {
  const r = new Rng(1);
  const seen = new Set();
  for (let i = 0; i < 2000; i++) seen.add(r.int(0, 3));
  assert.deepEqual([...seen].sort(), [0, 1, 2, 3]);
});

test('Events: on/off/once y off durante el dispatch', () => {
  const ev = new Events();
  const calls = [];
  const off = ev.on('x', (p) => calls.push(['a', p]));
  ev.once('x', (p) => calls.push(['once', p]));
  ev.on('x', () => off());
  ev.emit('x', 1);
  ev.emit('x', 2);
  assert.deepEqual(calls, [['a', 1], ['once', 1]]);
});

const sys = (id, deps = []) => {
  const C = class { init() {} };
  C.id = id;
  C.deps = deps;
  return new C();
};

test('topoSort: las deps van antes aunque tengan más deps propias', () => {
  // The old boot() sorted by dependency count, so 'player' (1 dep) ran before
  // 'buildings' (1 dep) only by accident and 'hud' (1 dep on battle, 3 deps)
  // could init before battle.
  const order = topoSort([
    sys('hud', ['battle']),
    sys('battle', ['digimon', 'player', 'world']),
    sys('player', ['world', 'buildings']),
    sys('digimon', ['world', 'player']),
    sys('buildings', ['world']),
    sys('world'),
  ]).map((s) => s.constructor.id);
  const at = (id) => order.indexOf(id);
  assert.ok(at('world') < at('buildings'));
  assert.ok(at('buildings') < at('player'));
  assert.ok(at('player') < at('digimon'));
  assert.ok(at('digimon') < at('battle'));
  assert.ok(at('battle') < at('hud'));
});

test('topoSort: ciclo y dependencia desconocida son errores', () => {
  assert.throws(() => topoSort([sys('a', ['b']), sys('b', ['a'])]), /Dependency cycle/);
  assert.throws(() => topoSort([sys('a', ['nope'])]), /is not registered/);
});
