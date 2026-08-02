// src/world/props.js — farolas, semáforos, bancos, papeleras, señales.
// Props instanciados alrededor del cruce con variación determinista.

import * as THREE from 'three';

export class Props {
  static id = 'props';
  static deps = ['world'];

  constructor() { this.root = new THREE.Group(); this.lights = []; }

  init(ctx) {
    this.ctx = ctx;
    this.rng = ctx.rng.fork();
    this.world = ctx.get('world');
    this.world.root.add(this.root);
    this._buildAll();
    return this;
  }

  _buildAll() {
    // farolas alrededor del cruce (anillo a 34 m del centro)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const x = Math.cos(a) * 34, z = Math.sin(a) * 34;
      this._streetlight(x, z, a + Math.PI / 2);
    }
    // semáforos en las 4 entradas del cruce
    const entries = [
      { x: 0, z: 26, ry: 0 }, { x: 0, z: -26, ry: Math.PI },
      { x: 26, z: 0, ry: Math.PI / 2 }, { x: -26, z: 0, ry: -Math.PI / 2 },
    ];
    for (const e of entries) this._trafficLight(e.x, e.z, e.ry);

    // bancos y papeleras en las aceras
    const rng = this.rng;
    const spots = [
      { x: -30, z: 30 }, { x: 30, z: 30 }, { x: -30, z: -30 }, { x: 30, z: -30 },
      { x: -60, z: 60 }, { x: 60, z: -60 }, { x: -90, z: 0 }, { x: 0, z: -90 },
    ];
    for (const s of spots) {
      if (rng.chance(0.7)) this._bench(s.x, s.z, rng.int(0, 3) * (Math.PI / 4));
      if (rng.chance(0.8)) this._bin(s.x + 3, s.z + 2);
    }
  }

  _streetlight(x, z, rotY) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.1, 6, 8),
      new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.5, metalness: 0.6 })
    );
    pole.position.y = 3;
    g.add(pole);

    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 2, 6),
      new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.5, metalness: 0.6 })
    );
    arm.rotation.z = Math.PI / 2;
    arm.position.set(0.9, 5.6, 0);
    g.add(arm);

    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.14, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff2c0, emissiveIntensity: 1.2 })
    );
    head.position.set(1.4, 5.5, 0);
    g.add(head);

    // luz real
    const light = new THREE.PointLight(0xfff2c0, 0.8, 18, 2);
    light.position.set(1.4, 5.3, 0);
    g.add(light);
    this.lights.push(light);

    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.root.add(g);
  }

  _trafficLight(x, z, rotY) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.09, 4.5, 8),
      new THREE.MeshStandardMaterial({ color: 0x3a3a3e, roughness: 0.5, metalness: 0.5 })
    );
    pole.position.y = 2.25;
    g.add(pole);
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.9, 0.25),
      new THREE.MeshStandardMaterial({ color: 0x1c1c20, roughness: 0.4 })
    );
    box.position.y = 4.1;
    g.add(box);
    // luces
    const mk = (y, color, emissive) => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 10, 8),
        new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 0.25 })
      );
      m.position.set(0, y, 0.14);
      box.add(m);
      return m;
    };
    this.red = mk(4.35, 0x550000, 0xff2222);
    this.yellow = mk(4.1, 0x554400, 0xffcc22);
    this.green = mk(3.85, 0x005500, 0x22ff44);
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    this.root.add(g);
  }

  _bench(x, z, rotY) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x4a6b4a, roughness: 0.85 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x33333a, roughness: 0.6, metalness: 0.5 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.5), mat);
    seat.position.y = 0.45;
    g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.06), mat);
    back.position.set(0, 0.75, -0.22);
    g.add(back);
    for (const sx of [-0.7, 0.7]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.4), metal);
      leg.position.set(sx, 0.22, 0);
      g.add(leg);
    }
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    this.root.add(g);
  }

  _bin(x, z) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.22, 0.7, 10),
      new THREE.MeshStandardMaterial({ color: 0x2e4a66, roughness: 0.7, metalness: 0.3 })
    );
    body.position.y = 0.35;
    g.add(body);
    g.position.set(x, 0, z);
    this.root.add(g);
  }

  // para el ciclo día/noche: atenuar luces
  setNightFactor(f) {
    for (const l of this.lights) l.intensity = 0.8 * f;
    if (this.red) {
      this.red.material.emissiveIntensity = 0.25 + f * 1.2;
      this.green.material.emissiveIntensity = 0.25 + f * 1.2;
    }
  }

  resize() {}
  dispose() {
    this.world.root.remove(this.root);
    this.root.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
}
