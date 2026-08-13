// Digital World arena — cyan data grid, not a grass stadium.
import * as THREE from 'three';

export class BattleArena {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.visible = false;
    scene.add(this.root);
    this._build();
  }

  _build() {
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(16, 6),
      new THREE.MeshStandardMaterial({
        color: 0x102030, emissive: 0x0a3048, emissiveIntensity: 0.4, roughness: 0.4, metalness: 0
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.05;
    this.root.add(floor);

    const grid = new THREE.GridHelper(28, 18, 0x4de1ff, 0x1a4060);
    grid.position.y = 0.08;
    this.root.add(grid);

    const core = new THREE.Mesh(
      new THREE.TorusGeometry(2.2, 0.08, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0x4de1ff })
    );
    core.rotation.x = Math.PI / 2;
    core.position.y = 0.12;
    this.root.add(core);

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(18, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.48),
      new THREE.MeshBasicMaterial({ color: 0x4de1ff, transparent: true, opacity: 0.07, side: THREE.BackSide })
    );
    dome.position.y = 0.2;
    this.root.add(dome);

    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const p = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.22, 0.16, 8),
        new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff4dc8 : 0x4de1ff })
      );
      p.position.set(Math.cos(a) * 7, 0.14, Math.sin(a) * 7);
      this.root.add(p);
    }
  }

  show() { this.root.visible = true; }
  hide() { this.root.visible = false; }
  dispose() {
    this.scene.remove(this.root);
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
}
