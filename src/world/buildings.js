// CityBlocks port from Paulius (D:\Digimon\game): setback towers,
// TextureLab window facade, rounded volumes. Video ads only on QFRONT + TSUTAYA.
import * as THREE from 'three';
import { roundedBox } from '../fx/Sculpt';
import { bakeColorMap, cached } from '../core/TextureLab';
import { makeRng } from '../core/Noise';
import { imagineVideo, IMAGINE } from './imagine-atlas.js';

const FACADE_PALETTE = [0x6a5a68, 0x7a6868, 0x6a5860, 0x7a6a62, 0x645c6c, 0x7a7070];
const BILLBOARD_COLORS = [0x4de1ff, 0xff4dc8, 0xffd24a, 0xff8a3a, 0x7a6aff, 0x4aff8a];

const facadeTex = cached('shibuya-facade', () =>
  bakeColorMap({
    size: 256,
    color: (u, v) => {
      const r = makeRng(Math.floor(u * 24) * 7 + Math.floor(v * 32) * 13 + 11);
      const lit = r() < 0.5;
      if (lit) {
        const w = (r() - 0.5) * 0.08;
        return [0xf0 / 255 + w, 0xd8 / 255 + w, 0xa8 / 255 + w];
      }
      const w = (r() - 0.5) * 0.05;
      return [0x2e / 255 + w, 0x32 / 255 + w, 0x44 / 255 + w];
    }
  })
);

export class Buildings {
  static id = 'buildings';
  static deps = ['world'];

  constructor() { this.root = new THREE.Group(); this.colliders = []; this.windowMats = []; }

  init(ctx) {
    this.ctx = ctx;
    this.world = ctx.get('world');
    this.world.root.add(this.root);
    this._buildAll();
    if (ctx.events) {
      ctx.events.on('world:time', () => {
        const nf = ctx.peek('daynight')?.nightFactor ?? 0.5;
        for (const m of this.windowMats) m.emissiveIntensity = 0.12 + 0.55 * nf;
      });
    }
    return this;
  }

  _buildAll() {
    const bs = 48;
    const spots = [
      { x: -bs, z: -bs, h: 52, neon: 'SCRAMBLE SQ', neonColor: 0x4de1ff, style: 'crown', w: 36, d: 36 },
      { x: bs, z: -bs, h: 34, neon: 'QFRONT', neonColor: 0xff4dc8, screen: 'video', video: IMAGINE.ads.qfront, w: 36, d: 36 },
      { x: -bs, z: bs, h: 30, neon: '109', neonColor: 0x4de1ff, style: 'cylinder', w: 36, d: 36 },
      { x: bs, z: bs, h: 26, neon: 'HIKARIE', neonColor: 0xff4dc8, w: 36, d: 36 },
      { x: -bs * 2, z: -bs * 2, h: 22, w: 34, d: 34 },
      { x: 0, z: -bs * 2, h: 24, neon: 'TSUTAYA', neonColor: 0x4de1ff, screen: 'video', video: IMAGINE.ads.digitonic, w: 34, d: 34 },
      { x: bs * 2, z: -bs * 2, h: 28, w: 34, d: 34 },
      { x: -bs * 2, z: 0, h: 20, neon: 'DOGENZAKA', w: 34, d: 34 },
      { x: bs * 2, z: 0, h: 24, neon: 'MIYAMASUZAKA', w: 34, d: 34 },
      { x: -bs * 2, z: bs * 2, h: 18, neon: 'LOVE HOTEL', w: 34, d: 34 },
      { x: 0, z: bs * 2, h: 16, neon: 'CENTER-GAI', w: 34, d: 34 },
      { x: bs * 2, z: bs * 2, h: 30, neon: 'STARBUCKS', neonColor: 0x5aff7d, w: 34, d: 34 }
    ];

    for (const s of spots) {
      this.root.add(this._buildBuilding(s));
      this.colliders.push({ x: s.x - s.w / 2, z: s.z - s.d / 2, w: s.w, d: s.d, h: s.h });
    }
    this._buildHachiko();
  }

  _buildBuilding(s) {
    const g = new THREE.Group();
    const { w, d, h } = s;
    const rng = makeRng(s.x * 31 + s.z * 17 + 5);
    const base = FACADE_PALETTE[Math.floor(rng() * FACADE_PALETTE.length)];
    const wall = new THREE.MeshStandardMaterial({
      color: base, map: facadeTex, roughness: 0.72, metalness: 0.06
    });

    const baseH = h * 0.55;
    const baseBody = new THREE.Mesh(roundedBox(w, baseH, d, 1.2, 3), wall);
    baseBody.position.y = baseH / 2;
    baseBody.castShadow = true;
    baseBody.receiveShadow = true;
    g.add(baseBody);

    const towerW = w * 0.72;
    const towerD = d * 0.72;
    const towerH = h - baseH + 1.5;
    const towerY = baseH + towerH / 2 - 0.75;
    const towerBody = new THREE.Mesh(roundedBox(towerW, towerH, towerD, 1.0, 3), wall);
    towerBody.position.y = towerY;
    towerBody.castShadow = true;
    towerBody.receiveShadow = true;
    g.add(towerBody);

    if (s.style === 'cylinder') {
      const cyl = new THREE.Mesh(
        new THREE.CylinderGeometry(w * 0.34, w * 0.4, h, 20, 1, true),
        new THREE.MeshStandardMaterial({
          color: base, map: facadeTex, roughness: 0.65, metalness: 0.1, side: THREE.DoubleSide
        })
      );
      cyl.position.y = h / 2;
      cyl.castShadow = true;
      g.add(cyl);
      const cylTop = new THREE.Mesh(
        new THREE.CylinderGeometry(w * 0.34, w * 0.34, 1.2, 20),
        new THREE.MeshStandardMaterial({ color: 0x4a4050, roughness: 0.6 })
      );
      cylTop.position.y = h + 0.6;
      g.add(cylTop);
    } else if (s.style === 'crown') {
      const crown = new THREE.Mesh(
        roundedBox(towerW * 0.7, 2.2, towerD * 0.7, 0.4, 2),
        new THREE.MeshStandardMaterial({
          color: 0x2a3040, roughness: 0.4, metalness: 0.2,
          emissive: 0x4de1ff, emissiveIntensity: 0.9
        })
      );
      crown.position.y = towerY + towerH / 2 + 1.1;
      g.add(crown);
      const spire = new THREE.Mesh(
        new THREE.ConeGeometry(1.0, 3.2, 8),
        new THREE.MeshStandardMaterial({ color: 0x6a6a78, roughness: 0.5, metalness: 0.3 })
      );
      spire.position.y = towerY + towerH / 2 + 3.5;
      g.add(spire);
    }

    const cornice = new THREE.Mesh(
      roundedBox(w + 0.8, 1.4, d + 0.8, 0.5, 2),
      new THREE.MeshStandardMaterial({ color: 0x4a4450, roughness: 0.6, metalness: 0.12 })
    );
    cornice.position.y = baseH - 0.7;
    g.add(cornice);

    const shop = new THREE.Mesh(
      roundedBox(w * 0.9, 4.2, d * 0.9, 0.8, 2),
      new THREE.MeshStandardMaterial({ color: 0x2a2834, roughness: 0.55, metalness: 0.08 })
    );
    shop.position.y = 2.1;
    g.add(shop);
    this._storefront(g, w * 0.82, d * 0.82, 2.1);

    this._windows(g, towerW, towerD, baseH + 1.2, h - 2.2, 5, 5);
    this._windows(g, w * 0.92, d * 0.92, 5.2, baseH - 1.4, 3, 6);

    if (s.neon) {
      const zf = d * 0.5 + 0.06;
      const sign = this._neonSign(s.neon, s.neonColor ?? 0x4de1ff, w * 0.55);
      sign.position.set(0, 5.6, zf);
      g.add(sign);
      const sign2 = sign.clone();
      sign2.position.set(0, 5.6, -zf);
      sign2.rotation.y = Math.PI;
      g.add(sign2);
    }

    const billCount = 2 + Math.floor(rng() * 2);
    const faceZ = towerD * 0.5 + 0.07;
    for (let b = 0; b < billCount; b++) {
      const color = BILLBOARD_COLORS[Math.floor(rng() * BILLBOARD_COLORS.length)];
      const bw = 2.0 + rng() * 1.2;
      const bh = 1.2 + rng() * 0.6;
      const bz = (b % 2 === 0 ? 1 : -1) * faceZ;
      const by = baseH + 3 + rng() * Math.max(3, towerH - 8);
      const bx = (rng() - 0.5) * towerW * 0.45;
      const bill = this._billboard(color, bw, bh);
      bill.position.set(bx, by, bz);
      bill.rotation.y = bz > 0 ? 0 : Math.PI;
      g.add(bill);
    }

    if (s.screen === 'video' && s.video) this._videoScreen(g, s, towerW, towerD, h, baseH);

    g.position.set(s.x, 0, s.z);
    return g;
  }

  _neonSign(text, color, width) {
    const tex = cached(`neon-${text}-${color.toString(16)}`, () =>
      bakeColorMap({
        size: 256,
        color: (u, v) => {
          const r = ((color >> 16) & 255) / 255;
          const gg = ((color >> 8) & 255) / 255;
          const b = (color & 255) / 255;
          const band = Math.abs(v - 0.5) < 0.18 && Math.abs(u - 0.5) < 0.42;
          const rnd = makeRng(Math.floor(u * 64) * 3 + Math.floor(v * 64) * 5 + 1)();
          if (band && rnd > 0.25) {
            const glow = 0.75 + rnd * 0.25;
            return [r * glow, gg * glow, b * glow];
          }
          return [0.04, 0.04, 0.06];
        }
      })
    );
    return new THREE.Mesh(new THREE.PlaneGeometry(width, 3.2), new THREE.MeshBasicMaterial({ map: tex }));
  }

  _billboard(color, width, height) {
    const tex = cached(`bill-${color.toString(16)}-${Math.round(width * 10)}`, () =>
      bakeColorMap({
        size: 128,
        color: (u, v) => {
          const r = ((color >> 16) & 255) / 255;
          const gg = ((color >> 8) & 255) / 255;
          const b = (color & 255) / 255;
          const rnd = makeRng(Math.floor(u * 8) * 5 + Math.floor(v * 8) * 9 + 2)();
          const band = Math.abs(u - 0.5) < 0.42 && Math.abs(v - 0.5) < 0.36;
          if (band) {
            const glow = 0.7 + rnd * 0.3;
            return [r * glow, gg * glow, b * glow];
          }
          return [0.04, 0.04, 0.06];
        }
      })
    );
    return new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: tex }));
  }

  _glass() {
    const m = new THREE.MeshPhysicalMaterial({
      color: 0x7aa0b8,
      roughness: 0.14,
      metalness: 0.06,
      transparent: true,
      opacity: 0.58,
      emissive: 0xf0d8a8,
      emissiveIntensity: 0.32
    });
    this.windowMats.push(m);
    return m;
  }

  _windows(g, fw, fd, y0, span, rows, cols) {
    if (span < 2) return;
    const glass = this._glass();
    const frameM = new THREE.MeshStandardMaterial({ color: 0x2a2830, roughness: 0.55 });
    const faces = [
      { x: 0, z: fd / 2 + 0.05, ry: 0, pw: fw * 0.86 },
      { x: 0, z: -fd / 2 - 0.05, ry: Math.PI, pw: fw * 0.86 },
      { x: fw / 2 + 0.05, z: 0, ry: Math.PI / 2, pw: fd * 0.86 },
      { x: -fw / 2 - 0.05, z: 0, ry: -Math.PI / 2, pw: fd * 0.86 }
    ];
    const cellW = 0.72;
    const cellH = Math.min(1.15, span / rows * 0.7);
    for (const f of faces) {
      const usable = f.pw * 0.9;
      const n = Math.max(3, Math.min(cols, Math.floor(usable / 1.05)));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < n; c++) {
          const u = (c + 0.5) / n - 0.5;
          const y = y0 + (r + 0.5) * (span / rows);
          const pane = new THREE.Mesh(new THREE.PlaneGeometry(cellW, cellH), glass);
          const fx = f.ry === 0 || f.ry === Math.PI ? u * usable : 0;
          const fz = f.ry === Math.PI / 2 || f.ry === -Math.PI / 2 ? u * usable : 0;
          pane.position.set(f.x + fx, y, f.z + fz);
          pane.rotation.y = f.ry;
          g.add(pane);
          if ((r + c) % 3 === 0) {
            const fr = new THREE.Mesh(roundedBox(cellW + 0.06, cellH + 0.06, 0.05, 0.01, 1), frameM);
            fr.position.copy(pane.position);
            fr.rotation.y = f.ry;
            g.add(fr);
          }
        }
      }
    }
  }

  _storefront(g, w, d, y) {
    // glass storefront on the shop volume
    const glass = this._glass();
    const faces = [
      { x: 0, z: d / 2 + 0.05, ry: 0, pw: w * 0.88 },
      { x: 0, z: -d / 2 - 0.05, ry: Math.PI, pw: w * 0.88 }
    ];
    for (const f of faces) {
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(f.pw, 2.4), glass);
      pane.position.set(f.x, y, f.z);
      pane.rotation.y = f.ry;
      g.add(pane);
      for (let i = -1; i <= 1; i++) {
        const bar = new THREE.Mesh(
          roundedBox(0.06, 2.4, 0.06, 0.01, 1),
          new THREE.MeshStandardMaterial({ color: 0x2a2830, roughness: 0.5 })
        );
        bar.position.set(f.x + (f.ry === 0 ? i * f.pw * 0.3 : 0), y, f.z);
        g.add(bar);
      }
    }
  }

  _videoScreen(group, s, w, d, h) {
    const face = Math.max(w, d) * 0.5 + 0.08;
    let pos, ry;
    if (s.z < -1 && Math.abs(s.z) >= Math.abs(s.x) * 0.55) {
      pos = [0, h * 0.52, face]; ry = 0;
    } else if (s.x > 0) {
      pos = [-face, h * 0.52, 0]; ry = -Math.PI / 2;
    } else {
      pos = [face, h * 0.52, 0]; ry = Math.PI / 2;
    }
    const lw = s.neon === 'QFRONT' ? w * 0.78 : w * 0.62;
    const lh = s.neon === 'QFRONT' ? h * 0.38 : h * 0.3;
    const holder = new THREE.Group();
    holder.add(new THREE.Mesh(
      roundedBox(lw + 0.4, lh + 0.4, 0.22, 0.08, 2),
      new THREE.MeshStandardMaterial({ color: 0x1a1c22, roughness: 0.4, metalness: 0.4 })
    ));
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(lw, lh),
      new THREE.MeshBasicMaterial({ map: imagineVideo(s.video), toneMapped: false })
    );
    panel.position.z = 0.13;
    holder.add(panel);
    holder.position.set(pos[0], pos[1], pos[2]);
    holder.rotation.y = ry;
    group.add(holder);
  }

  _buildHachiko() {
    const g = new THREE.Group();
    const bronze = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.8, metalness: 0.2 });
    const base = new THREE.Mesh(roundedBox(1.4, 0.9, 1.4, 0.3, 2), bronze);
    base.position.y = 0.45;
    g.add(base);
    const body = new THREE.Mesh(roundedBox(0.7, 0.7, 0.9, 0.25, 2), bronze);
    body.position.y = 1.1;
    g.add(body);
    const head = new THREE.Mesh(roundedBox(0.5, 0.45, 0.5, 0.2, 2), bronze);
    head.position.set(0, 1.6, 0.1);
    g.add(head);
    g.position.set(-24, 0, -8);
    this.root.add(g);
  }

  collide(pos, radius = 0.5) {
    for (const c of this.colliders) {
      const nx = Math.max(c.x, Math.min(pos.x, c.x + c.w));
      const nz = Math.max(c.z, Math.min(pos.z, c.z + c.d));
      const dx = pos.x - nx, dz = pos.z - nz;
      if (dx * dx + dz * dz < radius * radius) return { hit: true, nx, nz };
    }
    return { hit: false };
  }

  resize() {}
  dispose() {
    this.world.root.remove(this.root);
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
  }
}
