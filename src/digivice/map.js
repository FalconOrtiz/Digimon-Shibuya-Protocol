// Digivice map — night Shibuya: named streets, sidewalks, landmarks.
import * as THREE from 'three';

const WORLD_VIEW = 170;
const SIZE = 300;

export class MapPanel {
  constructor(ctx) {
    this.ctx = ctx;
    this.player = ctx.get('player');
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = SIZE;
  }

  _draw() {
    const g = this.canvas.getContext('2d');
    const s = SIZE / WORLD_VIEW;
    const cx = SIZE / 2, cy = SIZE / 2;
    const px = (x) => cx + x * s;
    const py = (z) => cy + z * s;

    g.fillStyle = '#0c1424';
    g.fillRect(0, 0, SIZE, SIZE);

    g.strokeStyle = 'rgba(77,225,255,0.08)';
    g.lineWidth = 1;
    for (let i = -5; i <= 5; i++) {
      g.beginPath();
      g.moveTo(cx + i * 28, 0); g.lineTo(cx + i * 28, SIZE);
      g.stroke();
      g.beginPath();
      g.moveTo(0, cy + i * 28); g.lineTo(SIZE, cy + i * 28);
      g.stroke();
    }

    // sidewalks (lighter)
    g.strokeStyle = '#6a6470';
    g.lineWidth = 26;
    g.beginPath();
    g.moveTo(px(0), py(-90)); g.lineTo(px(0), py(90));
    g.moveTo(px(-90), py(0)); g.lineTo(px(90), py(0));
    g.stroke();

    // asphalt roads
    g.strokeStyle = '#3a3644';
    g.lineWidth = 16;
    g.beginPath();
    g.moveTo(px(0), py(-90)); g.lineTo(px(0), py(90));
    g.moveTo(px(-90), py(0)); g.lineTo(px(90), py(0));
    g.stroke();

    // scramble
    g.fillStyle = '#4a4554';
    g.fillRect(px(-14), py(-14), 28 * s, 28 * s);
    g.strokeStyle = '#c8c4c0';
    g.lineWidth = 2;
    for (let i = -5; i <= 5; i++) {
      g.beginPath();
      g.moveTo(px(-12), py(i * 2));
      g.lineTo(px(12), py(i * 2));
      g.stroke();
    }

    const blocks = [
      { x: -48, z: -48, name: 'SCRAMBLE', c: '#5a4860' },
      { x: 48, z: -48, name: 'QFRONT', c: '#604858' },
      { x: -48, z: 48, name: '109', c: '#585060' },
      { x: 48, z: 48, name: 'HIKARIE', c: '#504858' },
      { x: 0, z: -96, name: 'TSUTAYA', c: '#3a4860' },
      { x: -96, z: 0, name: 'DOGENZAKA', c: '#404050' },
      { x: 96, z: 0, name: 'MIYAMA', c: '#404050' },
      { x: 0, z: 96, name: 'CENTER-GAI', c: '#404858' }
    ];
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const b of blocks) {
      g.fillStyle = b.c;
      g.fillRect(px(b.x - 20), py(b.z - 20), 40 * s, 40 * s);
      g.fillStyle = '#d8e4f0';
      g.font = 'bold 8px sans-serif';
      g.fillText(b.name, px(b.x), py(b.z));
    }

    g.fillStyle = '#4de1ff';
    g.font = '7px sans-serif';
    g.fillText('KOEN-DORI', px(0), py(-40));
    g.fillText('CENTER-GAI', px(0), py(40));
    g.fillText('DOGENZAKA', px(-40), py(-8));
    g.fillText('MIYAMASUZAKA', px(40), py(-8));

    g.fillStyle = '#c9a87a';
    g.beginPath();
    g.arc(px(-24), py(-8), 4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e8d8b0';
    g.font = '7px sans-serif';
    g.fillText('HACHIKO', px(-24), py(-14));

    const enc = this.ctx.get('encounters');
    if (enc && enc.rival && enc.rival.active) {
      g.fillStyle = '#ff4dc8';
      g.beginPath();
      g.arc(px(enc.rival.model.position.x), py(enc.rival.model.position.z), 4, 0, Math.PI * 2);
      g.fill();
    }
    if (enc) {
      g.fillStyle = '#4de1ff';
      for (const w of enc.wilds) {
        if (!w.model) continue;
        g.beginPath();
        g.arc(px(w.model.position.x), py(w.model.position.z), 3, 0, Math.PI * 2);
        g.fill();
      }
    }

    const p = this.player.pos;
    g.save();
    g.translate(px(p.x), py(p.z));
    g.rotate(-this.player.yaw);
    g.fillStyle = '#4de1ff';
    g.beginPath();
    g.moveTo(0, -7);
    g.lineTo(5, 6);
    g.lineTo(0, 3);
    g.lineTo(-5, 6);
    g.closePath();
    g.fill();
    g.restore();

    g.fillStyle = 'rgba(77,225,255,0.7)';
    g.font = 'bold 9px sans-serif';
    g.fillText('N', cx, 12);
  }

  render(el) {
    el.innerHTML = '';
    this.canvas.style.width = '100%';
    this.canvas.style.height = 'auto';
    this.canvas.style.borderRadius = '10px';
    this.canvas.style.border = '1px solid rgba(77,225,255,0.35)';
    el.appendChild(this.canvas);
    this._draw();
  }

  update() { this._draw(); }

  getCanvas() { return this.canvas; }
}
