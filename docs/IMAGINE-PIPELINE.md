# Imagine pipeline — Shibuya Protocol

Los recursos de look (LED, HUD, suelo, iconos) se generan con **Grok Imagine** (`image_gen` / `image_edit`) y se congelan en `public/assets/imagine/`.

**Barra de estilo:** `docs/referencias/shibuya-night-hud.jpg` (noche, cebra mojada, LED, HUD glass).

## Cómo generar un asset nuevo

1. Ancla el estilo en esa foto (`image_edit` con la ref, o descríbela en `image_gen`).
2. Un sujeto por imagen. Sin marcas reales, sin celebrities.
3. Guarda el JPG en `public/assets/imagine/<id>.jpg`.
4. Registra la URL en `src/world/imagine-atlas.js`.
5. El juego lo carga con `imagineTex()` / `imagineLed()`.

## Catálogo actual

| Archivo | Uso |
|---|---|
| `led-*.jpg` | Pantallas still (SCRAMBLE, 109) |
| `ad-qfront.mp4` | Ad en loop — QFRONT |
| `ad-digitonic.mp4` | Ad en loop — TSUTAYA |
| `sky-night.jpg` | Cúpula nocturna (hemisferio, glow en horizonte) |
| `facade-night-glass.jpg` | Cristal nocturno de torres |
| `ground-wet-zebra.jpg` | Ref de cebra (no se usa como placa 3D) |
| `avatar-hood.jpg` | Avatar HUD |
| `item-*.jpg` | Iconos Digivice |

Texto exacto en LED (TSUTAYA, 109…) sigue siendo canvas si hace falta leerse; Imagine pinta el *look*.
