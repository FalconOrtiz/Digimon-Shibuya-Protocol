# DIGIMON: SHIBUYA PROTOCOL — engine contract

Autor: Falcon Ortiz. Repositorio: https://github.com/FalconOrtiz/Digimon-Shibuya-Protocol

**Cada agente debe leer esto y `ART_DIRECTION.md` antes de escribir código.**

Fan game en el cruce de Shibuya (Three.js r185 / WebGL2, TypeScript), combate por turnos
estilo Expedition 33 y digimons esculpidos con SDF. Este repositorio es dueño del
pipeline: TextureLab procedural, Sculpt SDF, PostFX HDR.

## Hard rules

1. **Eres dueño de tu directorio. Nunca edites fuera de él.**
2. **Nunca importes el módulo de otro subsistema.** Obténlo en runtime con
   `ctx.get('battle')`. Las librerías compartidas (`core/`, `fx/`) sí se importan.
3. **Sin dependencias npm nuevas en runtime.** Solo `three`.
4. **Sin `Math.random()` en gameplay/visuales.** Usa `ctx.rng` / `ctx.rng.fork()` o
   `makeRng(seed)` de `core/Noise.ts`.
5. **Cero alloc por frame.** Preasigna en `init()` y reutiliza.
6. **Dispose** de geometrías, materiales, texturas y render targets en `dispose()`.
7. **Verde antes de commit:** `npm run check`, `npm test`, `npm run build`, y
   `node tools/visual-gate.mjs` para cualquier cambio visual.
8. **Código nuevo en TypeScript.** Los subsistemas de gameplay que siguen en JS
   (`battle/`, `digivice/`, `ui/`, `audio/`, `trainer/`, `player/`) compilan vía
   `allowJs`; al reescribir uno, pásalo a `.ts`.

## Interfaz de subsistema

```ts
export class MySystem implements GameSystem {
  static id = 'mysystem';
  static deps = ['render'];
  async init(ctx: Ctx) {}
  fixedUpdate?(h: number, ctx: Ctx) {}   // 120 Hz determinista
  update?(dt: number, ctx: Ctx) {}       // por frame
  lateUpdate?(dt: number, ctx: Ctx) {}
  resize?(w: number, h: number, ctx: Ctx) {}
  dispose?() {}
}
```

`ctx` (`src/core/Context.ts`): `scene`, `camera`, `renderer`, `canvas`, `config`,
`events`, `input`, `time`, `rng`, `get(id)`, `peek(id)`, `has(id)`.

`Engine.boot()` inicializa los sistemas en **orden topológico** de `deps`; una
dependencia desconocida o un ciclo es un error de arranque.

## Ownership map

| id | dir | owns |
|---|---|---|
| — (lead) | `src/core/` | Engine, Context, Events, Rng, Input, Config, Noise, TextureLab |
| render | `src/render/` | PostFX (GTAO, Bloom, Grade ACES, SMAA), `sceneStats`, captura |
| — (lead) | `src/fx/` | Sculpt, SkyShader, Clouds, `materials/*` (dominios de material) |
| atmosphere | `src/world/Atmosphere.ts` | **Único dueño de luces**, cielo, nubes, PMREM, niebla, reloj día/noche |
| world | `src/world/` | Cruce, CityBlocks/FacadeKit, UrbanProps, Crowd, StreetLife, Collision, Encounters |
| player | `src/player/` | Controller FPS/tercera persona, stamina, colisiones |
| digimon | `src/digimon/` | Modelos SDF (Agumon, Patamon, Champion, Ultimate), animación, registro |
| battle | `src/battle/` | Motor E33 puro, director de turnos, QTE/ventanas, arena, chips |
| trainer | `src/trainer/` | Perfil, guardado local |
| digivice | `src/digivice/` | UI Digivice: inventario, mapa, digimons, perfil, huevos |
| ui | `src/ui/` | HUD DOM/CSS |
| audio | `src/audio/` | Síntesis Web Audio |

`tools/` y `src/main.ts` son del lead.

## Pipeline visual

```
Noise.ts ──► TextureLab (*Maps: albedo+normal+roughness, cached) ──► fx/materials/*
                                                                        │
Sculpt (roundedBox, metaSurface) ──► world/* , digimon/* ◄──────────────┘
                                          │
Atmosphere (luces, PMREM, nightFactor) ──►scene──► render/PostFX ──► pantalla
```

## Eventos canónicos

| evento | payload | emisor |
|---|---|---|
| `battle:request` | `{ enemySpecies, enemyLevel, trainerName?, rival? }` | encounters |
| `battle:start` | `{ enemy, trainer, rival, ap, apMax, gradient, break }` | battle |
| `battle:end` | `{ result: 'win'\|'lose'\|'fled' }` | battle |
| `battle:turn` | `{ actor, action, phase }` | battle |
| `battle:qte` | `{ type, window, success }` | battle |
| `battle:hit` | `{ target, damage, crit, blocked }` | battle |
| `battle:e33` | `{ ap, apMax, gradient, break, broken }` | battle |
| `digimon:damage` / `digimon:heal` | `{ digimon, amount, hp }` | battle/digivice |
| `digimon:digivolve` | `{ from, to }` | battle |
| `player:stamina` / `player:health` | `{ current, max }` | player |
| `digivice:open` / `digivice:close` / `digivice:tab` | `{}` / `{ tab }` | digivice |
| `inventory:changed` | `{ item, count }` | digivice |
| `egg:hatch` | `{ digimon }` | digivice |
| `world:time` | `{ hour, dayPhase, nightFactor }` | atmosphere |
| `save:loaded` / `save:written` | `{ data }` | trainer |
| `interact` | `{ from }` | player |
| `encounter` | `{ digimon, at }` | encounters |
| `mode` | `{ mode: 'explore'\|'battle' }` | battle |

Si necesitas un evento nuevo, añade la fila aquí en el mismo commit.

## Stats / balance

| | HP | ATK | DEF | SP |
|---|---|---|---|---|
| Agumon | 90 | 12 | 8 | 10 |
| Patamon | 75 | 9 | 7 | 14 |

Motor E33 (`src/battle/engine/`): AP 0–9, básicos +2 AP, skills cuestan AP y suben el
Gradient; ventanas dodge 0.45 s / parry 0.18 s; parry perfecto → contra 0.5×;
DATA BREAK 100 → aturdido 2 turnos y ×1.5; Gradient 50 → Champion, 100 → Ultimate/ULT.

## Quality bar

Ver `ART_DIRECTION.md` §10. Presupuesto: ≤ 300 draw calls, ≤ 2.5 M triángulos, 60 fps a
1600×900 en `high`.
