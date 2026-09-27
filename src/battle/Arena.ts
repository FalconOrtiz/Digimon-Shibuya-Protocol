import * as THREE from 'three';

/**
 * Arena de combate: una "zona de datos" hexagonal proyectada sobre el asfalto
 * allí donde empieza el encuentro. Es una capa emisiva aditiva (no sustituye
 * al suelo): anillo hexagonal, retícula tenue, pads de cada bando y pilares de
 * datos en las esquinas. Todo con polygonOffset para no pelear con el asfalto.
 */

const CYAN = 0x4de1ff;
const MAGENTA = 0xff4dc8;

function hdr(hex: number, k: number): THREE.Color {
  return new THREE.Color(hex).multiplyScalar(k);
}

function gridTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, S, S);
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 2;
  const step = S / 8;
  for (let i = 0; i <= 8; i++) {
    g.beginPath();
    g.moveTo(i * step, 0);
    g.lineTo(i * step, S);
    g.moveTo(0, i * step);
    g.lineTo(S, i * step);
    g.stroke();
  }
  g.fillStyle = 'rgba(255,255,255,1)';
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) g.fillRect(i * step - 3, j * step - 3, 6, 6);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class BattleArena {
  readonly root = new THREE.Group();
  readonly padPlayer = new THREE.Vector3();
  readonly padWild = new THREE.Vector3();
  readonly center = new THREE.Vector3();
  /** Dirección de jugador → salvaje (unitaria, en XZ). */
  readonly forward = new THREE.Vector3(0, 0, -1);
  readonly right = new THREE.Vector3(1, 0, 0);

  private mats: THREE.Material[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private grid: THREE.CanvasTexture;
  private gridMat: THREE.MeshBasicMaterial;
  private padA: THREE.Mesh;
  private padB: THREE.Mesh;
  private pillars: THREE.Mesh[] = [];
  private fade = 0;
  private fadeTarget = 0;

  constructor(parent: THREE.Object3D, readonly radius = 3.4, readonly padGap = 1.55) {
    this.root.name = 'BattleArena';
    this.root.visible = false;
    parent.add(this.root);

    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number): THREE.Mesh => {
      this.geos.push(geo);
      this.mats.push(mat);
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.position.y = y;
      m.renderOrder = 2;
      this.root.add(m);
      return m;
    };
    const overlay = (color: THREE.Color, opacity: number, map?: THREE.Texture) =>
      new THREE.MeshBasicMaterial({
        color,
        map,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        fog: false,
      });

    this.grid = gridTexture();
    this.gridMat = overlay(hdr(CYAN, 0.9), 0.22, this.grid);
    add(new THREE.CircleGeometry(radius, 6), this.gridMat, 0.012).rotation.z = Math.PI / 6;
    add(new THREE.RingGeometry(radius - 0.06, radius, 6, 1), overlay(hdr(CYAN, 3.2), 0.95), 0.014).rotation.z = Math.PI / 6;
    add(new THREE.RingGeometry(radius * 0.62, radius * 0.62 + 0.025, 6, 1), overlay(hdr(CYAN, 2), 0.5), 0.014).rotation.z = Math.PI / 6;

    this.padA = add(new THREE.RingGeometry(0.62, 0.7, 40), overlay(hdr(CYAN, 3), 0.9), 0.016);
    this.padB = add(new THREE.RingGeometry(0.62, 0.7, 40), overlay(hdr(MAGENTA, 3), 0.9), 0.016);

    const pillarGeo = new THREE.BoxGeometry(0.05, 1, 0.05);
    pillarGeo.translate(0, 0.5, 0);
    this.geos.push(pillarGeo);
    for (let i = 0; i < 6; i++) {
      const mat = overlay(hdr(i % 2 ? MAGENTA : CYAN, 2.4), 0.6);
      this.mats.push(mat);
      const p = new THREE.Mesh(pillarGeo, mat);
      const a = (i / 6) * Math.PI * 2;
      p.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
      this.root.add(p);
      this.pillars.push(p);
    }
  }

  /** Coloca la arena delante de `feet`, mirando en `yaw` (convención de la cámara: forward = -Z). */
  place(feet: THREE.Vector3, yaw: number, ahead = 2.6): void {
    this.forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    this.right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    this.center.copy(feet).addScaledVector(this.forward, ahead);
    this.padPlayer.copy(this.center).addScaledVector(this.forward, -this.padGap);
    this.padWild.copy(this.center).addScaledVector(this.forward, this.padGap);
    this.root.position.copy(this.center);
    this.root.rotation.y = yaw;
    this.padA.position.set(0, 0.016, this.padGap);
    this.padB.position.set(0, 0.016, -this.padGap);
  }

  show(): void {
    this.root.visible = true;
    this.fadeTarget = 1;
  }

  hide(): void {
    this.fadeTarget = 0;
  }

  update(dt: number, t: number): void {
    this.fade += (this.fadeTarget - this.fade) * Math.min(1, dt * 5);
    if (this.fadeTarget === 0 && this.fade < 0.01) {
      this.fade = 0;
      this.root.visible = false;
      return;
    }
    this.grid.offset.set(0, (t * 0.08) % 1);
    this.gridMat.opacity = (0.16 + Math.sin(t * 2.2) * 0.05) * this.fade;
    this.padA.rotation.z = t * 0.6;
    this.padB.rotation.z = -t * 0.6;
    for (let i = 0; i < this.pillars.length; i++) {
      this.pillars[i].scale.y = this.fade * (0.6 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.7 + i * 1.3)));
    }
    this.root.scale.setScalar(0.85 + 0.15 * this.fade);
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    this.grid.dispose();
  }
}
