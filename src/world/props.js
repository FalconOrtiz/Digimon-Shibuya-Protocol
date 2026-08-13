// UrbanProps port — lamps, traffic lights, benches. MeshBasic heads, no extra PointLights.
import * as THREE from 'three';
import { roundedBox } from '../fx/Sculpt';
import { LAYOUT } from './shibuya.js';

const SIDEWALK = LAYOUT.SW_CENTER;

export class Props {
  static id = 'props';
  static deps = ['world'];

  constructor() { this.root = new THREE.Group(); this.lamps = []; }

  init(ctx) {
    this.ctx = ctx;
    this.world = ctx.get('world');
    this.world.root.add(this.root);
    this._buildAll();
    return this;
  }

  _buildAll() {
    const spots = [
      { kind: 'lamp', x: -12, z: -SIDEWALK },
      { kind: 'lamp', x: 12, z: -SIDEWALK },
      { kind: 'bench', x: -4, z: -SIDEWALK - 1.5 },
      { kind: 'bin', x: 6, z: -SIDEWALK - 1.2 },
      { kind: 'lamp', x: -12, z: SIDEWALK },
      { kind: 'lamp', x: 12, z: SIDEWALK },
      { kind: 'bench', x: 4, z: SIDEWALK + 1.5 },
      { kind: 'bin', x: -6, z: SIDEWALK + 1.2 },
      { kind: 'lamp', x: -SIDEWALK, z: -10 },
      { kind: 'lamp', x: -SIDEWALK, z: 10 },
      { kind: 'sign', x: -SIDEWALK - 1.2, z: 0 },
      { kind: 'lamp', x: SIDEWALK, z: -10 },
      { kind: 'lamp', x: SIDEWALK, z: 10 },
      { kind: 'sign', x: SIDEWALK + 1.2, z: 0 },
      { kind: 'light', x: -22, z: -22 },
      { kind: 'light', x: 22, z: -22 },
      { kind: 'light', x: -22, z: 22 },
      { kind: 'light', x: 22, z: 22 }
    ];
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i];
      let prop;
      if (s.kind === 'lamp') prop = this._streetlight(100 + i);
      else if (s.kind === 'light') prop = this._trafficLight();
      else if (s.kind === 'bench') prop = this._bench();
      else if (s.kind === 'bin') prop = this._bin();
      else prop = this._sign();
      prop.position.set(s.x, LAYOUT.SLAB_H, s.z);
      this.root.add(prop);
    }
  }

  _streetlight(seed) {
    const g = new THREE.Group();
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a3a42, metalness: 0.15, roughness: 0.5 });
    const warmMat = new THREE.MeshBasicMaterial({ color: 0xffd8a0 });
    warmMat.userData.baseR = 1.0;
    warmMat.userData.baseG = 0.85;
    warmMat.userData.baseB = 0.63;
    this.lamps.push(warmMat);

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.4, 8), poleMat);
    pole.position.y = 2.7;
    pole.castShadow = true;
    g.add(pole);

    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.7, 6), poleMat);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(0.85, 5.15, 0);
    g.add(arm);

    const lamp = new THREE.Mesh(roundedBox(0.55, 0.2, 0.34, 0.06, 2), warmMat);
    lamp.position.set(1.65, 5.0, 0);
    g.add(lamp);

    const base = new THREE.Mesh(roundedBox(0.52, 0.28, 0.52, 0.1, 2), poleMat);
    base.position.y = 0.14;
    g.add(base);

    g.rotation.y = ((seed * 17) % 360) * (Math.PI / 180);
    return g;
  }

  _trafficLight() {
    const g = new THREE.Group();
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2a30, metalness: 0.2, roughness: 0.4 });
    const boxMat = new THREE.MeshStandardMaterial({ color: 0x202026, roughness: 0.6 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.2, 8), poleMat);
    pole.position.y = 1.6;
    pole.castShadow = true;
    g.add(pole);
    const box = new THREE.Mesh(roundedBox(0.36, 0.85, 0.26, 0.05, 2), boxMat);
    box.position.y = 3.05;
    g.add(box);
    const red = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff4a4a }));
    red.position.set(0, 3.28, 0.15);
    const green = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: 0x4aff6a }));
    green.position.set(0, 2.82, 0.15);
    g.add(red, green);
    return g;
  }

  _bench() {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x6a4a38, roughness: 0.85 });
    const seat = new THREE.Mesh(roundedBox(1.6, 0.12, 0.5, 0.04, 2), wood);
    seat.position.y = 0.45;
    g.add(seat);
    const back = new THREE.Mesh(roundedBox(1.6, 0.5, 0.08, 0.04, 2), wood);
    back.position.set(0, 0.75, -0.22);
    g.add(back);
    for (const x of [-0.7, 0.7]) {
      const l = new THREE.Mesh(roundedBox(0.08, 0.45, 0.3, 0.03, 2), wood);
      l.position.set(x, 0.22, 0.12);
      g.add(l);
    }
    return g;
  }

  _bin() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.32, 0.9, 10),
      new THREE.MeshStandardMaterial({ color: 0x4a4a54, roughness: 0.8 })
    );
    body.position.y = 0.45;
    g.add(body);
    return g;
  }

  _sign() {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 2.4, 8),
      new THREE.MeshStandardMaterial({ color: 0x3a3a42, metalness: 0.15 })
    );
    pole.position.y = 1.2;
    g.add(pole);
    const plate = new THREE.Mesh(
      roundedBox(0.9, 0.4, 0.06, 0.04, 2),
      new THREE.MeshStandardMaterial({ color: 0x3a6a9a, roughness: 0.6 })
    );
    plate.position.y = 2.15;
    g.add(plate);
    return g;
  }

  setNightFactor(f) {
    for (const m of this.lamps) {
      const k = 0.12 + 0.88 * Math.max(0.35, f);
      m.color.setRGB((m.userData.baseR ?? 1) * k, (m.userData.baseG ?? 1) * k, (m.userData.baseB ?? 1) * k);
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
