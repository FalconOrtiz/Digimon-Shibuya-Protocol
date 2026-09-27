# DIGIMON: SHIBUYA PROTOCOL

Autor: Falcon Ortiz (FalconOrtiz). Repositorio: https://github.com/FalconOrtiz/Digimon-Shibuya-Protocol

Fan game 3D en el cruce de Shibuya: exploras la ciudad con tu Digimon compañero,
encuentras Digimon salvajes y peleas en combate por turnos estilo *Clair Obscur:
Expedition 33* (esquivar / parry con timing), en una arena holográfica que se
monta sobre el propio cruce.

- **Stack:** TypeScript, Three.js r185 (WebGL2), Vite. Sin otras dependencias en runtime.
- **Estilo:** low-poly cartoon con dos looks validados: *golden hour* (17:00) y *noche neón*,
  con ciclo día/noche continuo.
- **Idioma del juego:** inglés.

Antes de escribir código, lee [`ARCHITECTURE.md`](ARCHITECTURE.md) (contrato de
subsistemas, eventos, reglas) y [`ART_DIRECTION.md`](ART_DIRECTION.md) (biblia de arte).

## Arranque rápido

```bash
npm install
npx playwright install chromium   # solo para capturas y visual gate
npm run dev                       # http://127.0.0.1:5173
```

Parámetros de URL: `?hour=21.5` arranca a esa hora (17 = golden, 21.5 = noche neón) y
`&freeze` detiene el ciclo día/noche. Noche fija: <http://127.0.0.1:5173/?hour=21.5&freeze>.

## Controles

| Tecla | Exploración | Combate |
|---|---|---|
| WASD | moverse | — |
| Shift | correr | saltar (ventana de defensa) |
| Space | saltar | esquivar (dodge) |
| E | interactuar | parry |
| F | — | Gradient |
| 1–8 | — | acciones del menú |
| V | cambiar cámara primera / tercera persona | — |
| Tab / Esc | abrir / cerrar Digivice (←→ cambia de pestaña) | Esc: atrás |

**Barra de defensa:** cuando el enemigo ataca aparece una barra que se llena hacia el
marcador de impacto. Pulsa la tecla cuando el cursor está en la zona de color:
dorado = PERFECT, verde = SUCCESS, fuera = MISS.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | servidor de desarrollo |
| `npm run check` | typecheck (`tsc --noEmit`) |
| `npm test` | tests unitarios (`tests/*.test.mjs`) |
| `npm run build` | build de producción en `dist/` |
| `npm run shot -- --shot=golden-fps` | captura determinista de una toma (`shots/`) |
| `npm run gate` | visual gate: presupuesto + diff contra `docs/gold` |
| `npm run gate -- --update` | acepta las capturas actuales como nuevo baseline |
| `node tools/fx-gallery.mjs [--only=fire,claws]` | galería de FX de combate, barra de defensa y Digivice (`shots/fx/`) |

Tomas disponibles (`src/render/shots.ts`): `golden-fps`, `golden-trainer`, `golden-top`,
`night-fps`, `night-trainer`, `battle-golden`, `battle-night`, `partner-agumon`,
`partner-patamon`, `profile-agumon`, `profile-patamon`, `people-closeup`.

**Antes de cada commit:** `npm run check && npm test && npm run build`, y
`npm run gate` si el cambio es visual. Presupuesto: ≤ 300 draw calls, ≤ 2.5 M
triángulos, 60 fps a 1600×900 en calidad `high`.

## Estructura

```
src/
  core/       Engine (120 Hz fijo), Context, Events, Input, Config, Noise, TextureLab
  render/     PostFX (GTAO, Bloom, ACES, SMAA), tomas de captura
  fx/         Sculpt SDF, cielo, nubes, Chibi.ts (humanos), materials/* por dominio
  world/      Atmosphere (luces, día/noche), cruce, edificios, props, multitud, encuentros
  player/     controlador FPS / tercera persona
  digimon/    modelos SDF (Agumon, Patamon, Champion, Ultimate), animación, sculpt-util
  battle/     motor E33 puro (engine/), director, arena, BattleFX
  trainer/    perfil y guardado (localStorage)
  digivice/   UI del Digivice: items, mapa, digimons, perfil, huevos
  ui/         HUD DOM/CSS
  audio/      síntesis Web Audio
tools/        capture, visual-gate, fx-gallery, utilidades de i18n
tests/        tests node:test
docs/gold/    baseline del visual gate
docs/referencias/assets/  model sheets (Agumon, Patamon, Digivice, huevo, items, Shibuya)
```

## Estado actual (sept. 2026)

Hecho:

- Motor visual unificado en TS: texturas procedurales (TextureLab), escultura SDF,
  PostFX HDR, ciclo día/noche con looks golden y neón.
- Shibuya: cruce, bloques de edificios con fachadas y neones (atlas), props instanciados,
  tráfico y multitud chibi.
- Humanos: jugador y multitud comparten `src/fx/Chibi.ts` (mismo estilo y calidad).
- Agumon, Patamon y Digivice ajustados a sus model sheets; Champion/Ultimate portados.
- Combate E33 completo: AP, dodge/parry/salto, DATA BREAK, Gradient, ULT, digivolución,
  free aim, chips; arena hexagonal in situ; barra de defensa PERFECT/SUCCESS/MISS.
- FX de combate: pools de partículas (aditivas + humo) y efectos de malla (ondas, destellos,
  cortes, pilares, proyectiles) por ataque.
- Guardado local, Digivice con inventario, mapa, digimons, perfil y huevos.

Siguientes pasos sugeridos:

- Revisar rendimiento del combate nocturno (una medición del gate dio ~11 fps puntual).
- Pasar a TS los subsistemas que aún son JS vía `allowJs` (ver `ARCHITECTURE.md` regla 8).
- Modelar Champion/Ultimate con el mismo nivel de fidelidad que Agumon/Patamon.
- Más especies salvajes, NPC entrenadores/rival y misiones.
- Audio: música por zona/combate y SFX por ataque.
- Dividir el bundle (~950 kB) con imports dinámicos.

## Otros documentos

- [`ARCHITECTURE.md`](ARCHITECTURE.md): contrato del motor, ownership, eventos, balance.
- [`ART_DIRECTION.md`](ART_DIRECTION.md): paleta, luz, geometría, quality bar.
- [`docs/design.md`](docs/design.md), [`docs/plan.md`](docs/plan.md): diseño y plan original.
