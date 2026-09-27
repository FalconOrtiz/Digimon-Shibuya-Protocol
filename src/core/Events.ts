// Bus de eventos cross-subsistema. Payloads planos.

export type Listener<T = any> = (payload: T) => void;

export class Events {
  private map = new Map<string, Set<Listener>>();

  on<T = any>(name: string, fn: Listener<T>): () => void {
    let set = this.map.get(name);
    if (!set) {
      set = new Set();
      this.map.set(name, set);
    }
    set.add(fn);
    return () => this.off(name, fn);
  }

  once<T = any>(name: string, fn: Listener<T>): () => void {
    const off = this.on<T>(name, (payload) => {
      off();
      fn(payload);
    });
    return off;
  }

  off(name: string, fn: Listener): void {
    this.map.get(name)?.delete(fn);
  }

  emit<T = any>(name: string, payload?: T): void {
    const set = this.map.get(name);
    if (!set || set.size === 0) return;
    // Snapshot: a listener may off() itself during dispatch.
    const listeners = [...set];
    for (let i = 0; i < listeners.length; i++) listeners[i](payload);
  }

  clear(): void {
    this.map.clear();
  }
}
