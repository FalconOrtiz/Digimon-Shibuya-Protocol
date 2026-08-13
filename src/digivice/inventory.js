// src/digivice/inventory.js — panel de inventario.
// Items: DigiPan (curar 30 HP en batalla), pociones, chips. Event-driven.

export const DEFAULT_INVENTORY = {
  digipan: { name: 'DigiPan', desc: 'Pan energético. Recupera 30 HP en batalla.', count: 3, heal: 30 },
  potion: { name: 'Poción', desc: 'Líquido azul. Recupera 50 HP.', count: 1, heal: 50 },
  chip: { name: 'Chip de datos', desc: 'Fragmento de código digimon. Sirve para incubar.', count: 2 }
};

export class InventoryPanel {
  constructor(ctx) {
    this.ctx = ctx;
    this.events = ctx.events;
    this.items = structuredClone(DEFAULT_INVENTORY);
    this.events.on('inventory:add', (p) => this.add(p.item, p.count || 1));
    this.events.on('battle:item', (p) => this.consume(p.item));
  }

  add(itemId, count = 1) {
    const it = this.items[itemId];
    if (!it) return;
    it.count += count;
    this.events.emit('inventory:changed', { item: itemId, count: it.count });
  }

  consume(itemId) {
    const it = this.items[itemId];
    if (!it || it.count <= 0) return false;
    it.count--;
    this.events.emit('inventory:changed', { item: itemId, count: it.count });
    return true;
  }

  has(itemId) { return this.items[itemId] && this.items[itemId].count > 0; }

  render(el) {
    el.innerHTML = '';
    const list = document.createElement('div');
    list.className = 'dv-list';
    const icons = {
      potion: '/assets/imagine/item-cyan-vial.jpg',
      digipan: '/assets/imagine/item-red-vial.jpg',
      chip: '/assets/imagine/item-pistol.jpg'
    };
    for (const [id, it] of Object.entries(this.items)) {
      const row = document.createElement('div');
      row.className = 'dv-row';
      row.innerHTML = `<img class="dv-item-icon" src="${icons[id] || '/assets/items/sheet.png'}" alt="">
        <span class="dv-row-name">${it.name}</span>
        <span class="dv-row-count">×${it.count}</span>
        <span class="dv-row-desc">${it.desc}</span>`;
      list.appendChild(row);
    }
    el.appendChild(list);
  }
}
