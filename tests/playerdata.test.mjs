import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PlayerDataStore, partyRecord, SAVE_KEY } from '../src/trainer/PlayerData.ts';

class MemoryStorage {
  map = new Map();
  getItem(k) {
    return this.map.get(k) ?? null;
  }
  setItem(k, v) {
    this.map.set(k, v);
  }
  removeItem(k) {
    this.map.delete(k);
  }
}

test('save: equipo, chips, objetos, huevos y estadísticas hacen round-trip', () => {
  const storage = new MemoryStorage();
  const a = new PlayerDataStore();
  a.setStorage(storage);
  a.party = [partyRecord('agumon', 7), partyRecord('patamon', 4)];
  a.party[0].hp = 20;
  a.party[0].xp = 33;
  a.active = 1;
  a.items = { digipan: 2 };
  a.eggs = [{ species: 'koromon', name: 'Koromon', hatchInSeconds: 120, secondsPlayed: 60 }];
  a.setDigichips(['break-bit', 'reflex-core', 'gradual-charge']);
  a.recordResult('victory');
  a.recordResult('victory');
  a.recordResult('defeat');
  a.saveNow();

  const b = new PlayerDataStore();
  b.setStorage(storage);
  assert.ok(b.load());
  assert.equal(b.party.length, 2);
  assert.deepEqual(b.party[0], { ...a.party[0] });
  assert.equal(b.active, 1);
  assert.deepEqual(b.items, { digipan: 2 });
  assert.equal(b.eggs[0].secondsPlayed, 60);
  assert.deepEqual(b.chips, ['break-bit', 'reflex-core', 'gradual-charge']);
  assert.deepEqual(b.stats, { wins: 2, losses: 1, battles: 3 });
});

test('save: guardado corrupto o de otra versión arranca limpio sin lanzar', () => {
  const storage = new MemoryStorage();
  storage.setItem(SAVE_KEY, '{not json');
  const s = new PlayerDataStore();
  s.setStorage(storage);
  assert.equal(s.load(), false);
  assert.equal(s.hasParty, false);
  storage.setItem(SAVE_KEY, JSON.stringify({ version: 999, party: [partyRecord('agumon', 5)] }));
  assert.equal(s.load(), false);
  assert.equal(s.hasParty, false);
});

test('save: especies desconocidas se descartan al cargar', () => {
  const s = new PlayerDataStore();
  const json = s.toJSON();
  json.party = [partyRecord('agumon', 5), { species: 'pikachu', level: 5, hp: 1, maxHp: 1, xp: 0 }];
  assert.ok(s.fromJSON(json));
  assert.deepEqual(s.party.map((p) => p.species), ['agumon']);
});

test('save: throttle de 1 s y reset borra el storage', () => {
  const storage = new MemoryStorage();
  const s = new PlayerDataStore();
  s.setStorage(storage);
  s.saveNow(0);
  s.name = 'Otro';
  s.save(500);
  assert.equal(JSON.parse(storage.getItem(SAVE_KEY)).name, 'FalconOrtiz', 'dentro del throttle no escribe');
  s.save(1200);
  assert.equal(JSON.parse(storage.getItem(SAVE_KEY)).name, 'Otro');
  s.reset();
  assert.equal(storage.map.size, 0);
});
