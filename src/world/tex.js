// src/world/tex.js — forja de texturas procedurales en Canvas 2D.
// Todo tileable y determinista (ctx.rng para variación de instancias).

import * as THREE from 'three';

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

export function canvasTexture(size = 256, draw, srgb = true) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  draw(g, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---- ruido simple determinista (hash) ----
function hash2(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695040888963407) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ---- asfalto: gris oscuro con speckle ----
export function asphaltTex(size = 256, seed = 7) {
  return canvasTexture(size, (g, s) => {
    g.fillStyle = '#2c2c30';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < s * s * 0.6; i++) {
      const x = hash2(i, 1, seed) * s, y = hash2(i, 2, seed) * s;
      const v = 30 + hash2(i, 3, seed) * 30;
      g.fillStyle = `rgba(${v},${v},${v + 4},0.5)`;
      g.fillRect(x, y, 1.6, 1.6);
    }
    // juntas y grietas
    g.strokeStyle = 'rgba(15,15,18,0.5)';
    g.lineWidth = 1;
    for (let x = 0; x < s; x += 64) {
      g.beginPath(); g.moveTo(x + hash2(x, 0, seed) * 4, 0); g.lineTo(x + hash2(x, 1, seed) * 4, s); g.stroke();
    }
  });
}

// ---- acera: gris claro con juntas regulares ----
export function sidewalkTex(size = 256, seed = 3) {
  return canvasTexture(size, (g, s) => {
    g.fillStyle = '#9a9a9e';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < s * s * 0.4; i++) {
      const x = hash2(i, 4, seed) * s, y = hash2(i, 5, seed) * s;
      const v = 140 + hash2(i, 6, seed) * 30;
      g.fillStyle = `rgba(${v},${v},${v},0.4)`;
      g.fillRect(x, y, 2, 2);
    }
    g.strokeStyle = 'rgba(120,120,125,0.8)';
    g.lineWidth = 2;
    const step = s / 4;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(i * step, 0); g.lineTo(i * step, s); g.stroke();
      g.beginPath(); g.moveTo(0, i * step); g.lineTo(s, i * step); g.stroke();
    }
  });
}

// ---- paso de cebra (crosswalk) ----
export function crosswalkTex(size = 256, seed = 11) {
  return canvasTexture(size, (g, s) => {
    g.fillStyle = '#2c2c30';
    g.fillRect(0, 0, s, s);
    // franjas blancas verticales, ligeramente desgastadas
    const stripeW = s / 8;
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 === 0 ? '#e8e8ea' : '#2c2c30';
      g.fillRect(i * stripeW, 0, stripeW, s);
    }
    // desgaste
    for (let i = 0; i < s * s * 0.15; i++) {
      const x = hash2(i, 7, seed) * s, y = hash2(i, 8, seed) * s;
      g.fillStyle = `rgba(60,60,64,${0.15 + hash2(i, 9, seed) * 0.3})`;
      g.fillRect(x, y, 3 + hash2(i, 10, seed) * 5, 2);
    }
  });
}

// ---- fachada: retícula de ventanas con variación ----
// opts: { base, frame, win, winDark, rows, cols, litChance, seed }
export function facadeTex(opts) {
  const { base = '#8a8378', frame = '#6b655c', win = '#aac4d8', winDark = '#39424e',
          rows = 6, cols = 5, litChance = 0.35, seed = 5, size = 256 } = opts;
  return canvasTexture(size, (g, s) => {
    g.fillStyle = base;
    g.fillRect(0, 0, s, s);
    // textura base: ruido sutil
    for (let i = 0; i < s * s * 0.3; i++) {
      const x = hash2(i, 11, seed) * s, y = hash2(i, 12, seed) * s;
      const v = (hash2(i, 13, seed) - 0.5) * 24;
      g.fillStyle = `rgba(${v > 0 ? v : 0},${v > 0 ? v : 0},${v > 0 ? v : 0},0.15)`;
      g.fillRect(x, y, 2, 2);
    }
    const mw = s * 0.06, mh = s * 0.07;           // márgenes
    const cw = (s - mw * 2) / cols, ch = (s - mh * 2) / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = mw + c * cw, y = mh + r * ch;
        // marco de ventana
        g.fillStyle = frame;
        g.fillRect(x, y, cw, ch);
        const lit = hash2(r, c, seed) < litChance;
        g.fillStyle = lit ? win : winDark;
        g.fillRect(x + cw * 0.12, y + ch * 0.12, cw * 0.76, ch * 0.76);
        // reflejo en alguna ventana encendida
        if (lit && hash2(r, c + 50, seed) > 0.5) {
          g.fillStyle = 'rgba(255,255,255,0.35)';
          g.fillRect(x + cw * 0.2, y + ch * 0.2, cw * 0.28, ch * 0.1);
        }
      }
    }
    // desgaste por cornisas
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(0, 0, s, 3);
    g.fillRect(0, s * 0.25, s, 1.5);
    g.fillRect(0, s * 0.5, s, 1.5);
    g.fillRect(0, s * 0.75, s, 1.5);
  });
}

// ---- cartel/neón: texto brillante sobre panel ----
export function neonSignTex(text, { bg = '#101018', color = '#ff3b6b', size = 256, seed = 9 } = {}) {
  return canvasTexture(size, (g, s) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, s, s);
    g.shadowColor = color;
    g.shadowBlur = 18;
    g.fillStyle = color;
    g.font = `bold ${Math.floor(s * 0.16)}px 'Arial Black', Arial, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, s / 2, s / 2, s * 0.9);
    g.shadowBlur = 0;
    // scanlines
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = 0; y < s; y += 4) g.fillRect(0, y, s, 1.5);
  });
}

// ---- logo genérico para pantallas LED gigantes ----
export function ledBillboardTex(text, { bg = '#000614', color = '#4dd0ff', size = 512, seed = 3 } = {}) {
  return canvasTexture(size, (g, s) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, s, s);
    // patrón LED sutil
    for (let y = 0; y < s; y += 3) {
      for (let x = 0; x < s; x += 3) {
        g.fillStyle = `rgba(${(x * 7 + y * 13) % 40},${(x * 11 + y * 5) % 50},60,0.25)`;
        g.fillRect(x, y, 1.5, 1.5);
      }
    }
    g.shadowColor = color;
    g.shadowBlur = 30;
    g.fillStyle = color;
    g.font = `bold ${Math.floor(s * 0.1)}px 'Arial Black', Arial, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, s / 2, s / 2, s * 0.92);
    g.shadowBlur = 0;
  });
}

export function brighten(hex, amt) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amt);
  return c;
}
