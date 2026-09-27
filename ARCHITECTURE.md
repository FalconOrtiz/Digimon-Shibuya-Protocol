# DIGIMON: SHIBUYA PROTOCOL — engine contract

Autor: Falcon Ortiz. Repositorio: https://github.com/FalconOrtiz/Digimon-Shibuya-Protocol

**Cada agente debe leer esto antes de escribir código. Es el único mecanismo de coordinación.**

Target: fan game FPS en el cruce de Shibuya (Three.js r180+ / WebGL2), combate por
turnos estilo Expedition 33 (QTE timing, parry/dodge), digimons chibi procedurales.
Sin assets externos: texturas, mallas, animación y audio generados proceduralmente
en tiempo de carga. Única dependencia runtime: `three`.

## Hard rules

1. **Eres dueño de tu directorio. Nunca edites fuera de él.**
2. **Nunca importes el módulo de otro subsistema.** Obténlo en runtime:
   `const battle = ctx.get('battle')`. Esto hace seguro el trabajo paralelo.
3. **Sin dependencias npm nuevas.** Solo `three`. Sin CDN, sin imágenes/modelos/
   audio externos — el juego debe correr offline.
4. **Sin `Math.random()` en gameplay/visuales.** Usa `ctx.rng` (src/core/rng.js)
   o `ctx.rng.fork()`. La reproducibilidad de capturas depende de esto.
5. **Cero alloc por frame.** Preasigna en `init()` y reutiliza.
6. **Dispose** de geometrías, materiales, texturas y render targets en `dispose()`.
7. `npm run build` debe pasar y `node tools/capture.mjs` debe producir un frame.

## Subsistema interface

```js
export class MySystem {
  static id = 'mysystem';
  static deps = ['render'];
  async init(ctx) {}
  fixedUpdate(h, ctx) {}   // 120 Hz determinista
  update(dt, ctx) {}       // por frame
  lateUpdate(dt, ctx) {}
  resize(w, h, ctx) {}
  dispose() {}
}
```

`ctx`: `scene`, `camera`, `canvas`, `config`, `events`, `input`, `time`,
`rng`, `get(id)`, `peek(id)`, `has(id)`.

## Ownership map

| id | dir | owns |
|---|---|---|
| render | src/render/ | WebGLRenderer, pipeline, post, composite (si se separa; MVP: en engine) |
| world | src/world/ | Shibuya: cruce, calles, manzanas, edificios, neones, props, NPCs, día/noche |
| player | src/player/ | controller FPS, cámara, stamina, colisiones AABB |
| digimon | src/digimon/ | modelos chibi procedurales (Agumon/Patamon), anims, registry, moves |
| battle | src/battle/ | máquina de turnos, QTE, arena, IA enemiga |
| trainer | src/trainer/ | perfil del trainer, rival |
| digivice | src/digivice/ | UI Digivice: inventario, mapa, digimons, perfil, huevos, stamina |
| ui | src/ui/ | HUD DOM/CSS, crosshair, barras, prompts, pantallas |
| audio | src/audio/ | síntesis Web Audio |

Compartido (del lead, no editar): `src/core/`, `src/main.js`, `tools/`, `vite.config.js`.

## Eventos canónicos

| evento | payload | emisor |
|---|---|---|
| `battle:start` | `{ wild, trainer }` | world/player |
| `battle:end` | `{ result: 'win'\|'lose'\|'fled' }` | battle |
| `battle:turn` | `{ actor, action }` | battle |
| `battle:qte` | `{ type: 'crit'\|'parry'\|'dodge', window, success }` | battle |
| `battle:hit` | `{ target, damage, crit, blocked }` | battle |
| `digimon:damage` | `{ digimon, amount, hp }` | battle |
| `digimon:heal` | `{ digimon, amount, hp }` | battle/digivice |
| `digimon:digivolve` | `{ from, to }` | battle |
| `player:stamina` | `{ current, max }` | player |
| `player:health` | `{ current, max }` | player |
| `digivice:open` / `digivice:close` | `{}` | digivice |
| `digivice:tab` | `{ tab }` | digivice |
| `inventory:changed` | `{ item, count }` | digivice |
| `egg:hatch` | `{ digimon }` | digivice |
| `world:time` | `{ hour, dayPhase }` | world |
| `interact` | `{ target }` | player |
| `encounter` | `{ digimon, at }` | world |

Si necesitas un evento nuevo, añade fila aquí en el mismo commit.

## Stats / balance

| | HP | ATK | DEF | SP |
|---|---|---|---|---|
| Agumon | 90 | 12 | 8 | 10 |
| Patamon | 75 | 9 | 7 | 14 |

Moves: Baby Flame (fuego 18), Peppers Breath (fuego 26, carga 1 turno);
Boom Bubble (aire 16), Air Shot (aire 22).
QTE: crit 1.6×, parry 0 daño + contra 0.5×, dodge 0 daño.
Stamina: sprint 30/s, regen 15/s. HP trainer 100.

## Quality bar

- Sin superficies planas/sin textura: variación de albedo + normal + roughness +
  detail layer.
- Sin iluminación uniforme: contact shadows, AO, key/fill/rim.
- Valores físicamente plausibles: albedo 0.02–0.9, intensidades realistas.
- Nada perfectamente recto/limpio/repetido: edge wear, grime, warp sutil, variación
  de instancias.
- Cada acción tiene peso: recoil, shake, transiente de audio, FX.
- Los digimons deben ser reconocibles como Agumon/Patamon (silueta + color + rasgos).
