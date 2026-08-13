// Trees + cars using Paulius sculpt (roundedBox) and TextureLab bark.
import * as THREE from 'three';
import { roundedBox } from '../fx/Sculpt';
import { barkMaps, tile } from '../core/TextureLab';
import { LAYOUT } from './shibuya.js';

export class StreetLife {
  static id = 'streetlife';
  static deps = ['world', 'buildings'];

  constructor() { this.root = new THREE.Group(); this.cars = []; this.colliders = []; }

  init(ctx) {
    this.ctx = ctx;
    this.world = ctx.get('world');
    this.buildings = ctx.get('buildings');
    this.world.root.add(this.root);
    this._trees();
    this._cars();
    return this;
  }

  _trees() {
    const bark = tile(barkMaps(256), 2, 4);
    const barkMat = new THREE.MeshStandardMaterial({
      map: bark.map, normalMap: bark.normalMap, roughness: 0.88, metalness: 0
    });
    const potMat = new THREE.MeshStandardMaterial({ color: 0x6a5a4c, roughness: 0.82 });
    const leafA = new THREE.MeshStandardMaterial({ color: 0x3a7a48, roughness: 0.75 });
    const leafB = new THREE.MeshStandardMaterial({ color: 0x2e6840, roughness: 0.78 });
    const ring = [
      [-8, -LAYOUT.SW_CENTER], [8, -LAYOUT.SW_CENTER],
      [-8, LAYOUT.SW_CENTER], [8, LAYOUT.SW_CENTER],
      [-LAYOUT.SW_CENTER, -8], [-LAYOUT.SW_CENTER, 8],
      [LAYOUT.SW_CENTER, -8], [LAYOUT.SW_CENTER, 8]
    ];
    for (const [x, z] of ring) {
      const g = new THREE.Group();
      const pot = new THREE.Mesh(roundedBox(1.35, 0.55, 1.35, 0.14, 2), potMat);
      pot.position.y = 0.28;
      pot.castShadow = true;
      g.add(pot);
      const soil = new THREE.Mesh(
        new THREE.CylinderGeometry(0.48, 0.48, 0.08, 10),
        new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 1 })
      );
      soil.position.y = 0.58;
      g.add(soil);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.2, 2.4, 8), barkMat);
      trunk.position.y = 1.7;
      trunk.castShadow = true;
      g.add(trunk);
      const c1 = new THREE.Mesh(new THREE.SphereGeometry(0.95, 12, 10), leafA);
      c1.position.set(0, 3.15, 0);
      const c2 = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 8), leafB);
      c2.position.set(0.5, 3.0, 0.18);
      const c3 = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), leafA);
      c3.position.set(-0.42, 3.25, -0.22);
      const c4 = new THREE.Mesh(new THREE.SphereGeometry(0.48, 8, 7), leafB);
      c4.position.set(0.1, 3.55, -0.28);
      c1.castShadow = c2.castShadow = c3.castShadow = c4.castShadow = true;
      g.add(c1, c2, c3, c4);
      g.position.set(x, LAYOUT.SLAB_H, z);
      this.root.add(g);
      this.colliders.push({ x: x - 0.6, z: z - 0.6, w: 1.2, d: 1.2, h: 3 });
    }
    if (this.buildings?.colliders) this.buildings.colliders.push(...this.colliders);
  }

  _cars() {
    const colors = [0xff6b4a, 0xf4f0e8, 0x4aa8ff, 0xffd24a, 0x3a3a42];
    const lanes = [
      { x: 6, z: 40, yaw: Math.PI, axis: 'z', dir: -1 },
      { x: -6, z: -40, yaw: 0, axis: 'z', dir: 1 },
      { x: 40, z: 6, yaw: -Math.PI / 2, axis: 'x', dir: -1 },
      { x: -40, z: -6, yaw: Math.PI / 2, axis: 'x', dir: 1 },
      { x: 6, z: -50, yaw: 0, axis: 'z', dir: 1 },
      { x: -6, z: 55, yaw: Math.PI, axis: 'z', dir: -1 }
    ];
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.9 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x88b0c8, roughness: 0.18, metalness: 0.1, transparent: true, opacity: 0.72
    });
    for (let i = 0; i < lanes.length; i++) {
      const L = lanes[i];
      const body = new THREE.Mesh(
        roundedBox(1.75, 0.58, 3.4, 0.16, 2),
        new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.45, metalness: 0.12 })
      );
      body.position.y = 0.52;
      body.castShadow = true;
      const cab = new THREE.Mesh(roundedBox(1.5, 0.48, 1.55, 0.12, 2), glassMat);
      cab.position.set(0, 0.96, -0.12);
      const g = new THREE.Group();
      g.add(body, cab);
      for (const [wx, wz] of [[0.72, 1.05], [-0.72, 1.05], [0.72, -1.05], [-0.72, -1.05]]) {
        const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 10), wheelMat);
        wh.rotation.z = Math.PI / 2;
        wh.position.set(wx, 0.22, wz);
        g.add(wh);
      }
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.06), new THREE.MeshBasicMaterial({ color: 0xfff2c0 }));
      const l1 = light.clone(); l1.position.set(0.55, 0.5, -1.68);
      const l2 = light.clone(); l2.position.set(-0.55, 0.5, -1.68);
      g.add(l1, l2);
      g.position.set(L.x, 0, L.z);
      g.rotation.y = L.yaw;
      this.root.add(g);
      this.cars.push({ mesh: g, axis: L.axis, dir: L.dir, speed: 7 + i });
    }
  }

  update(dt) {
    for (const c of this.cars) {
      if (c.axis === 'z') {
        c.mesh.position.z += c.dir * c.speed * dt;
        if (Math.abs(c.mesh.position.z) > 90) c.mesh.position.z = -Math.sign(c.mesh.position.z) * 88;
      } else {
        c.mesh.position.x += c.dir * c.speed * dt;
        if (Math.abs(c.mesh.position.x) > 90) c.mesh.position.x = -Math.sign(c.mesh.position.x) * 88;
      }
    }
  }

  resize() {}
  dispose() {
    this.world.root.remove(this.root);
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
}
