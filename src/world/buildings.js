// src/world/buildings.js — kit modular de edificios de Shibuya.
// Fachadas procedurales (retícula de ventanas), tiendas en planta baja,
// pantallas LED gigantes, marquesinas de neón. Todo generado en código.

import * as THREE from 'three';
import { facadeTex, neonSignTex, ledBillboardTex, brighten } from './tex.js';

export class Buildings {
  static id = 'buildings';
  static deps = ['world'];

  constructor() { this.root = new THREE.Group(); this.colliders = []; }

  init(ctx) {
    this.ctx = ctx;
    this.rng = ctx.rng.fork();
    this.world = ctx.get('world');
    this.world.root.add(this.root);
    this._buildAll();
    return this;
  }

  _buildAll() {
    const bs = 48;
    const half = bs / 2;
    // Disposición basada en el cruce real de Shibuya (lat 35.6595, lon 139.7005):
    //   N  (z negativo, hacia Aoyama/Omotesando): Tsutaya a la izquierda, edificios de oficinas
    //   S  (z positivo, hacia Center-gai): el 109 a la izquierda-sur, Love Hotel Hill a la derecha
    //   E  (x positivo, hacia Miyamasuzaka): QFRONT con su pantalla gigante, Hikarie más allá
    //   W  (x negativo, hacia Hachiko/estación): Scramble Square (la torre más alta), Dogenzaka
    const spots = [
      // esquinas del cruce
      { x: -bs, z: -bs, h: 52, kind: 'tower', neon: 'SCRAMBLE SQ', led: true, w: bs * 0.92, d: bs * 0.92 },  // NO: Scramble Square (torre alta)
      { x: bs, z: -bs, h: 34, kind: 'tower', neon: 'QFRONT', led: true, ledBig: true, w: bs * 0.92, d: bs * 0.92 }, // NE: QFRONT pantalla gigante
      { x: -bs, z: bs, h: 30, kind: 'retail', neon: '109', led: true, w: bs * 0.92, d: bs * 0.92 },       // SO: Shibuya 109
      { x: bs, z: bs, h: 26, kind: 'office', neon: 'HIKARIE', led: false, w: bs * 0.92, d: bs * 0.92 },   // SE: Hikarie
      // corona exterior (calles que salen del cruce)
      { x: -bs * 2, z: -bs * 2, h: 22, kind: 'office', w: bs * 0.9, d: bs * 0.9 },   // noroeste lejano (Dogenzaka arriba)
      { x: 0, z: -bs * 2, h: 24, kind: 'office', neon: 'KOEN-DORI', w: bs * 0.9, d: bs * 0.9 },  // norte: calle Koen-dori
      { x: bs * 2, z: -bs * 2, h: 28, kind: 'tower', w: bs * 0.9, d: bs * 0.9 },      // noreste lejano (Miyamasuzaka)
      { x: -bs * 2, z: 0, h: 20, kind: 'office', neon: 'DOGENZAKA', w: bs * 0.9, d: bs * 0.9 },  // oeste: Dogenzaka
      { x: bs * 2, z: 0, h: 24, kind: 'office', neon: 'MIYAMASUZAKA', w: bs * 0.9, d: bs * 0.9 },  // este: Miyamasuzaka
      { x: -bs * 2, z: bs * 2, h: 18, kind: 'retail', neon: 'LOVE HOTEL', w: bs * 0.9, d: bs * 0.9 },  // sur-oeste (Love Hotel Hill)
      { x: 0, z: bs * 2, h: 16, kind: 'retail', neon: 'CENTER-GAI', w: bs * 0.9, d: bs * 0.9 },      // sur: Center-gai
      { x: bs * 2, z: bs * 2, h: 30, kind: 'tower', w: bs * 0.9, d: bs * 0.9 },      // sureste lejano
    ];

    for (const s of spots) {
      const b = this._buildBuilding(s);
      this.root.add(b.group);
      this.colliders.push({ x: s.x - s.w / 2, z: s.z - s.d / 2, w: s.w, d: s.d, h: s.h });
    }

    // estatua Hachiko: salida oeste del cruce, junto a la estación (frente a Scramble Square)
    this._buildHachiko();
  }

  _buildBuilding(s) {
    const group = new THREE.Group();
    const { w, d, h } = s;
    const rng = this.rng.fork();
    const seed = rng.int(1, 999);

    // base de la torre
    const facade = facadeTex({
      base: ['#8a8378', '#7d7f85', '#95918a', '#6f747d'][rng.int(0, 3)],
      frame: '#5c5750', win: '#b8d0e0', winDark: '#2e3742',
      rows: Math.max(4, Math.floor(h / 5)), cols: Math.max(3, Math.floor(w / 6)),
      litChance: 0.3, seed, size: 512
    });
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ map: facade, roughness: 0.75, metalness: 0.05 })
    );
    box.position.y = h / 2;
    box.castShadow = true;
    box.receiveShadow = true;
    group.add(box);

    // cornisa superior
    const cornice = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.6, 1.2, d + 0.6),
      new THREE.MeshStandardMaterial({ color: 0x3a3a3e, roughness: 0.6, metalness: 0.3 })
    );
    cornice.position.y = h + 0.6;
    group.add(cornice);

    // azotea con aparatos (cajas pequeñas)
    const roofRng = rng.fork();
    for (let i = 0; i < 4; i++) {
      const rw = 1 + roofRng.float() * 2.5, rd = 1 + roofRng.float() * 2.5;
      const unit = new THREE.Mesh(
        new THREE.BoxGeometry(rw, 0.8 + roofRng.float() * 1.2, rd),
        new THREE.MeshStandardMaterial({ color: 0x55555a, roughness: 0.8 })
      );
      unit.position.set((roofRng.float() - 0.5) * w * 0.5, h + 1.6, (roofRng.float() - 0.5) * d * 0.5);
      unit.castShadow = true;
      group.add(unit);
    }

    // planta baja: tienda con escaparate
    const shop = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.94, 4.5, d * 0.94),
      new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.4, metalness: 0.3 })
    );
    shop.position.y = 2.25;
    group.add(shop);

    // escaparate luminoso
    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.8, 3, d * 0.8),
      new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffd27a, emissiveIntensity: 0.8, roughness: 0.3 })
    );
    glow.position.y = 2.6;
    group.add(glow);

    // letrero de neón sobre la tienda
    if (s.neon) {
      const signTex = neonSignTex(s.neon, { color: ['#ff3b6b', '#3bd0ff', '#ffe23b', '#9b6bff'][rng.int(0, 3)], size: 256 });
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(w * 0.7, 3),
        new THREE.MeshBasicMaterial({ map: signTex, transparent: true })
      );
      sign.position.set(0, 5.5, d / 2 + 0.05);
      group.add(sign);
      // también en el lado opuesto
      const sign2 = sign.clone();
      sign2.position.z = -d / 2 - 0.05;
      sign2.rotation.y = Math.PI;
      group.add(sign2);
    }

    // pantalla LED gigante en fachada (solo edificios "led")
    if (s.led) {
      const ledTex = ledBillboardTex(s.neon || 'DIGIMON', { color: '#4dd0ff', size: 512 });
      // QFRONT: pantalla extra grande (el famoso display del cruce)
      const lw = s.ledBig ? w * 0.92 : w * 0.72;
      const lh = s.ledBig ? h * 0.38 : h * 0.22;
      const ly = s.ledBig ? h * 0.55 : h * 0.62;
      const led = new THREE.Mesh(
        new THREE.PlaneGeometry(lw, lh),
        new THREE.MeshBasicMaterial({ map: ledTex })
      );
      led.position.set(0, ly, d / 2 + 0.1);
      group.add(led);
      const led2 = led.clone();
      led2.position.z = -d / 2 - 0.1;
      led2.rotation.y = Math.PI;
      group.add(led2);
    }

    group.position.set(s.x, 0, s.z);
    return { group };
  }

  _buildHachiko() {
    // estatua chibi de Hachiko: base + perro sentado (cajas)
    const g = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 1.1, 1.6),
      new THREE.MeshStandardMaterial({ color: 0x8a8578, roughness: 0.9 })
    );
    base.position.y = 0.55;
    base.castShadow = true;
    g.add(base);

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.7, 0.9),
      new THREE.MeshStandardMaterial({ color: 0xc9a87a, roughness: 0.9 })
    );
    body.position.set(0, 1.1 + 0.35, 0);
    g.add(body);

    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.45, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xc9a87a, roughness: 0.9 })
    );
    head.position.set(0, 1.1 + 0.35 + 0.5, 0.15);
    g.add(head);

    // placa
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.15, 0.1),
      new THREE.MeshStandardMaterial({ color: 0xd9c9a0, emissive: 0x8a7a50, emissiveIntensity: 0.3 })
    );
    plate.position.set(0, 1.1 + 0.08, 0.82);
    g.add(plate);

    // salida oeste del cruce: entre el cruce y Scramble Square, frente a la estación
    // (posición real: Hachiko está en la esquina NO del cruce, junto a la boca de la estación)
    g.position.set(-24.5, 0, -8.5);
    this.root.add(g);
  }

  // colisión AABB contra edificios
  collide(pos, radius = 0.5) {
    for (const c of this.colliders) {
      const nx = Math.max(c.x, Math.min(pos.x, c.x + c.w));
      const nz = Math.max(c.z, Math.min(pos.z, c.z + c.d));
      const dx = pos.x - nx, dz = pos.z - nz;
      if (dx * dx + dz * dz < radius * radius) {
        return { hit: true, nx, nz };
      }
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
