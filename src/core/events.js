// src/core/events.js — bus de eventos cross-subsistema.
// Payloads planos. Sin allocs en emit (reutilizamos arrays).

export class Events {
  constructor() {
    this._map = new Map(); // name -> Set<fn>
  }

  on(name, fn) {
    let set = this._map.get(name);
    if (!set) { set = new Set(); this._map.set(name, set); }
    set.add(fn);
    return () => this.off(name, fn);
  }

  once(name, fn) {
    const off = this.on(name, (payload) => {
      off();
      fn(payload);
    });
    return off;
  }

  off(name, fn) {
    const set = this._map.get(name);
    if (set) set.delete(fn);
  }

  emit(name, payload) {
    const set = this._map.get(name);
    if (!set || set.size === 0) return;
    // snapshot para permitir off() durante el dispatch sin mutar el Set en iteración
    const listeners = [...set];
    for (let i = 0; i < listeners.length; i++) listeners[i](payload);
  }

  clear() { this._map.clear(); }
}
