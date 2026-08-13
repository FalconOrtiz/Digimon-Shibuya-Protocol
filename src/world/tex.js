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

// ---- asfalto: violeta-gris claro (Art Bible: #604860/#484848, legible de noche) ----
export function asphaltTex(size = 256, seed = 7) {
  return canvasTexture(size, (g, s) => {
    g.fillStyle = '#4a5260';   // asfalto cartoon azul-gris
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < s * s * 0.5; i++) {
      const x = hash2(i, 1, seed) * s, y = hash2(i, 2, seed) * s;
      const v = 88 + hash2(i, 3, seed) * 22;
      g.fillStyle = `rgba(${v},${v - 4},${v + 10},0.5)`;
      g.fillRect(x, y, 1.8, 1.8);
    }
    // grain only — long joint strokes stretch into N–S sky streaks when UVs are 0–1
  });
}

// ---- acera: gris piedra cálido ----
export function sidewalkTex(size = 256, seed = 3) {
  return canvasTexture(size, (g, s) => {
    g.fillStyle = '#5c5a58';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < s * s * 0.4; i++) {
      const x = hash2(i, 4, seed) * s, y = hash2(i, 5, seed) * s;
      const v = 78 + hash2(i, 6, seed) * 28;
      g.fillStyle = `rgba(${v},${v - 3},${v - 8},0.45)`;
      g.fillRect(x, y, 2.2, 2.2);
    }
    g.strokeStyle = 'rgba(32,30,28,0.55)';
    g.lineWidth = 3;
    const step = s / 4;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(i * step, 0); g.lineTo(i * step, s); g.stroke();
      g.beginPath(); g.moveTo(0, i * step); g.lineTo(s, i * step); g.stroke();
    }
    g.strokeStyle = 'rgba(160,156,148,0.18)';
    g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(i * step + 2, 0); g.lineTo(i * step + 2, s); g.stroke();
      g.beginPath(); g.moveTo(0, i * step + 2); g.lineTo(s, i * step + 2); g.stroke();
    }
  });
}

// ---- paso de cebra: blanco limpio sobre violeta-gris ----
export function crosswalkTex(size = 256, seed = 11) {
  return canvasTexture(size, (g, s) => {
    g.fillStyle = '#5a5468';
    g.fillRect(0, 0, s, s);
    const stripeW = s / 8;
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 === 0 ? '#e8e8e8' : '#5a5468';
      g.fillRect(i * stripeW, 0, stripeW, s);
    }
    // desgaste sutil
    for (let i = 0; i < s * s * 0.06; i++) {
      const x = hash2(i, 7, seed) * s, y = hash2(i, 8, seed) * s;
      g.fillStyle = `rgba(90,88,104,${0.1 + hash2(i, 9, seed) * 0.18})`;
      g.fillRect(x, y, 3 + hash2(i, 10, seed) * 5, 2);
    }
  });
}

// ---- fachada: retícula de ventanas con variación (estilo cartoon vibrante) ----
// opts: { base, frame, win, winDark, rows, cols, litChance, seed }
export function facadeTex(opts) {
  const { base = '#e8cfa8', frame = '#c9a878', win = '#9ad8f0', winDark = '#6a8aa8',
          rows = 6, cols = 5, litChance = 0.35, seed = 5, size = 256 } = opts;
  return canvasTexture(size, (g, s) => {
    g.fillStyle = base;
    g.fillRect(0, 0, s, s);
    // textura base: ruido sutil pintado
    for (let i = 0; i < s * s * 0.25; i++) {
      const x = hash2(i, 11, seed) * s, y = hash2(i, 12, seed) * s;
      const v = (hash2(i, 13, seed) - 0.5) * 18;
      g.fillStyle = `rgba(${v > 0 ? v : 0},${v > 0 ? v : 0},${v > 0 ? v : 0},0.1)`;
      g.fillRect(x, y, 2.5, 2.5);
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
    // cornisas suaves
    g.fillStyle = 'rgba(0,0,0,0.12)';
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

export function adBillboardTex({ bg = '#ff6b8a', accent = '#ffe23b', label = 'SHIBUYA', size = 256 } = {}) {
  return canvasTexture(size, (g, s) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, s, s);
    g.fillStyle = accent;
    g.fillRect(s * 0.08, s * 0.08, s * 0.84, s * 0.28);
    g.fillStyle = '#fff';
    g.font = `bold ${Math.floor(s * 0.12)}px Arial, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, s / 2, s * 0.22, s * 0.8);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath();
    g.arc(s * 0.72, s * 0.68, s * 0.18, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(s * 0.12, s * 0.48, s * 0.5, s * 0.08);
    g.fillRect(s * 0.12, s * 0.62, s * 0.36, s * 0.06);
  });
}

export function brighten(hex, amt) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amt);
  return c;
}
