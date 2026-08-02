// src/digivice/map.js — mapa del cruce de Shibuya (minimapa top-down).
// Dibuja calles, cruce, marcadores de puntos de interés y la posición del jugador.
// Canvas 2D, escala fija centrada en el cruce (0,0).

import * as THREE from 'three';

const WORLD_VIEW = 160;   // metros que se ven en el mapa
const SIZE = 300;         // px del canvas

export class MapPanel {
  constructor(ctx) {
    this.ctx = ctx;
    this.player = ctx.get('player');
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = SIZE;
  }

  _draw() {
    const g = this.canvas.getContext('2d');
    const s = SIZE / WORLD_VIEW;   // px por metro
    const cx = SIZE / 2, cy = SIZE / 2;
    const px = (x) => cx + x * s;
    const py = (z) => cy + z * s;

    g.fillStyle = '#0a0e1a';
    g.fillRect(0, 0, SIZE, SIZE);

    // grid de coordenadas sutil (estilo prompt: mapa de juego limpio)
    g.strokeStyle = 'rgba(80,120,200,0.08)';
    g.lineWidth = 1;
    for (let i = -6; i <= 6; i++) {
      g.beginPath();
      g.moveTo(cx + i * 24, 0); g.lineTo(cx + i * 24, SIZE);
      g.stroke();
      g.beginPath();
      g.moveTo(0, cy + i * 24); g.lineTo(SIZE, cy + i * 24);
      g.stroke();
    }

    // calles (las 4 direcciones + diagonales)
    g.strokeStyle = '#1c2434';
    g.lineWidth = 14;
    g.beginPath();
    g.moveTo(px(0), py(-80)); g.lineTo(px(0), py(80));
    g.moveTo(px(-80), py(0)); g.lineTo(px(80), py(0));
    g.stroke();
    g.beginPath();
    g.moveTo(px(-56), py(-56)); g.lineTo(px(56), py(56));
    g.moveTo(px(-56), py(56)); g.lineTo(px(56), py(-56));
    g.stroke();

    // cruce central
    g.fillStyle = '#141c2c';
    g.fillRect(px(-22), py(-22), 44 * s, 44 * s);

    // paso de cebra
    g.strokeStyle = '#3a4a5a';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(px(-14), py(-14)); g.lineTo(px(14), py(14));
    g.moveTo(px(-14), py(14)); g.lineTo(px(14), py(-14));
    g.stroke();

    // manzanas (edificios) — disposición real del cruce
    g.fillStyle = '#24344a';
    // esquinas del cruce: 109 (SO), Scramble Sq (NO), QFRONT (NE), Hikarie (SE)
    for (const [bx, bz] of [[-48,-48],[48,-48],[-48,48],[48,48]]) {
      g.fillRect(px(bx - 22), py(bz - 22), 44 * s, 44 * s);
    }
    // corona exterior
    g.fillStyle = '#1e2c40';
    for (const [bx, bz] of [[-96,-96],[0,-96],[96,-96],[-96,0],[96,0],[-96,96],[0,96],[96,96]]) {
      g.fillRect(px(bx - 20), py(bz - 20), 40 * s, 40 * s);
    }
    // etiquetas de edificios icónicos
    g.font = '9px monospace';
    g.textAlign = 'center';
    g.fillStyle = '#7a8aa8';
    g.fillText('109', px(-48), py(48) + 4);
    g.fillText('SCRAMBLE', px(-48), py(-48) + 4);
    g.fillText('QFRONT', px(48), py(-48) + 4);
    g.fillText('HIKARIE', px(48), py(48) + 4);
    // Hachiko
    g.fillStyle = '#c9a87a';
    g.font = '8px monospace';
    g.fillText('HACHIKO', px(-24), py(-8) + 14);

    // marcadores
    // rival (si existe)
    const enc = this.ctx.get('encounters');
    if (enc && enc.rival && enc.rival.active) {
      g.fillStyle = '#ff3b6b';
      g.beginPath();
      g.arc(px(enc.rival.model.position.x), py(enc.rival.model.position.z), 5, 0, Math.PI * 2);
      g.fill();
    }
    // salvajes
    if (enc) {
      g.fillStyle = '#4dd0ff';
      for (const w of enc.wilds) {
        if (!w.active) continue;
        g.beginPath();
        g.arc(px(w.model.position.x), py(w.model.position.z), 3.5, 0, Math.PI * 2);
        g.fill();
      }
    }

    // jugador (triángulo orientado)
    const pxp = px(this.player.pos.x), pyp = py(this.player.pos.z);
    g.save();
    g.translate(pxp, pyp);
    g.rotate(this.player.yaw);
    g.fillStyle = '#7dff9a';
    g.beginPath();
    g.moveTo(6, 0); g.lineTo(-4, -4); g.lineTo(-4, 4);
    g.closePath();
    g.fill();
    g.restore();

    // norte
    g.fillStyle = '#8899aa';
    g.font = '10px monospace';
    g.textAlign = 'center';
    g.fillText('N', px(0), 12);

    // título del mapa (estilo prompt)
    g.fillStyle = '#c8d4ea';
    g.font = 'bold 11px monospace';
    g.textAlign = 'center';
    g.fillText('SHIBUYA CROSSING — TOKYO', SIZE / 2, SIZE - 10);
  }

  render(el) {
    el.innerHTML = '';
    this._draw();
    el.appendChild(this.canvas);
    const legend = document.createElement('div');
    legend.className = 'dv-legend';
    legend.innerHTML = '<span style="color:#4dd0ff">● salvaje</span> <span style="color:#ff3b6b">● rival</span> <span style="color:#7dff9a">▲ tú</span> <span style="color:#c9a87a">● Hachiko</span>';
    el.appendChild(legend);
  }
}
