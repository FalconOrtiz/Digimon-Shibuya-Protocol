# Digimon: Shibuya Protocol — Implementation Plan

> **For Hermes:** Use subagent-driven-development to implement this plan task-by-task.

**Goal:** FPS fan game en Three.js en el cruce de Shibuya con combate por turnos
estilo Expedition 33 (QTE timing), 2 digimons chibi procedurales y Digivice completo.

**Architecture:** Subsistemas con dueño único y contrato vía ctx en este
repositorio. Sin assets: todo procedural. Vite + three ESM.
**Author:** Falcon Ortiz. Repo: FalconOrtiz/Digimon-Shibuya-Protocol.

**Tech Stack:** Vite 7, three r180, WebGL2, DOM/CSS UI, Web Audio, playwright/pngjs (tools).

---

## Fase 0 — Scaffold

### Task 0.1: Crear package.json + vite + index.html
- Create: `package.json` (name digimon-shibuya-protocol,
  type module, scripts: dev/build/preview/shot; deps: three ^0.180.0; devDeps:
  vite ^7, playwright, pngjs)
- Create: `vite.config.js`
- Create: `index.html` (canvas #c, import map NOT needed
  with Vite, module main.js, styles.css)
- Create: `ARCHITECTURE.md` (contrato de este repositorio)
- Run: `npm install` → expected: found 0 vulnerabilities
- Run: `npm run build` → expected: build OK

### Task 0.2: Tools de verificación de este repositorio
- Keep: `tools/*.mjs` en este repositorio
- Adjust paths (package name, port) en capture.mjs/shotset.mjs/baseline.mjs
- Run: `node tools/playtest.mjs` → expected: passes (boots game headless)

### Task 0.3: Git init
- Run: `git init`, commit inicial `.gitignore` (node_modules, dist) + scaffold

## Fase 1 — core

### Task 1.1: src/core/rng.js
- Deterministic PRNG (mulberry32) con `fork()`, `int(a,b)`, `float(a,b)`, `pick(arr)`,
  `chance(p)`. Seed desde config.
- Test: dos instancias misma seed → misma secuencia.

### Task 1.2: src/core/events.js
- Bus de eventos: `on/off/emit/once`, payloads planos, sin allocs en emit
  (reusar arrays de listeners).
- Test: emit/on/off/once, orden de entrega.

### Task 1.3: src/core/config.js
- Presets de calidad `q` (taa, gtao, ssr, volumetrics, shadowMapSize, particleBudget,
  decalBudget), keybinds, sensibilidad/FOV, seed global, nombres.
- `config.q` respetado por todos los subsistemas.

### Task 1.4: src/core/engine.js
- Boot: scene/camera/renderer, setAnimationLoop con Clock, fixed timestep 120 Hz
  con alpha, `ctx` (scene, camera, canvas, config, events, input, time, rng,
  get/peek/has), registro de sistemas con `deps`, resize, dispose.
- Test: arranca sin errores, un sistema update recibe dt.

### Task 1.5: src/core/input.js
- Pointer lock (click canvas → lock), WASD/mouse deltas, keys (Shift sprint,
  Ctrl crouch, Space jump, Tab digivice, 1-4 habilidades, E interact, Q/E lean),
  buffering de taps (parry window), `consume()`.
- Test: simular keydown → estado correcto.

## Fase 2 — world (Shibuya)

### Task 2.1: src/world/shibuya.js — geometría del cruce
- Suelo: plano 300×300 con textura procedural asfalto + aceras + paso de cebra
  diagonal (el famoso cruce en X) — todo CanvasTexture procedural.
- Calles: 5 vías que confluyen; carriles, líneas de tráfico, bordillos.
- Elevación y manzanas: bloques de manzana con veredas.
- Test: captura → se ve el cruce desde arriba con cebra.

### Task 2.2: src/world/buildings.js — kit modular de edificios
- Cajas con fachadas procedurales: ventanas en retícula, tiendas con escaparates,
  cornisas, alturas variables (10-40 m), esquinas curvas (109), torre con reloj.
- Texturas por CanvasTexture: ladrillo/concreto/vidrio procedural (reutilizar
  técnicas de CoD materials pero en Canvas 2D, más simple).
- Test: captura → silueta de Shibuya reconocible.

### Task 2.3: src/world/neon.js — pantallas LED y carteles
- Paneles emisivos en fachadas (MeshBasicMaterial + shader scroll), texto
  procedural ("SHIBUYA", marquesinas, logos genéricos), anuncios gigantes.
- Test: captura nocturna → neones visibles.

### Task 2.4: src/world/props.js + npcs.js + daynight.js
- Props: farolas, semáforos, bancos, papeleras, vallas, señales, estatua Hachiko
  (caja chibi).
- NPCs: sprites billboard procedurales (círculo cabeza + cuerpo) con animación
  caminar, instanciados, collision-light. Multitud cruzando el paso de cebra.
- DayNight: sky color, sun/moon, luces, neones on/off. Hora inicial 17:00 (atardecer
  azul) con ciclo lento.

## Fase 3 — player

### Task 3.1: src/player/controller.js
- FPS controller: WASD + mouse look (pointer lock), gravity, jump, crouch, sprint
  con stamina (30/s gasto, 15/s regen), lean Q/E.
- Colisiones: AABB vs mundo (calles transitables, edificios sólidos — aproximado
  con bounding boxes de manzana).
- Test: playtest scripted mueve al jugador y no atraviesa edificios.

### Task 3.2: src/player/camera.js
- Eye height 1.7, head bob al caminar, FOV kick al sprint, subtle recoil/shake
  hooks para battle, sensibilidad configurable.

## Fase 4 — digimon

### Task 4.1: src/digimon/models.js — factory chibi
- Agumon: cuerpo naranja rechoncho (esfera achatada), cabeza grande con
  cresta/dientes, cola, brazos/piernas cortas — MeshStandardMaterial, sin esqueleto.
- Patamon: cuerpo amarillo redondo, orejas grandes tipo murciélago, cola corta,
  cabeza con ojos grandes.
- Factory genérica: build(parts) → Group con refs a extremidades para animar.
- Test: captura → Agumon y Patamon reconocibles.

### Task 4.2: src/digimon/anim.js
- Animación por código: idle (respiración), walk (bob), attack (lunge + swing),
  hit (flinch), death (caer), win (salto). Todo con sin()/easing, sin skinned mesh.
- Test: cada anim cambia poses sin NaN.

### Task 4.3: src/digimon/registry.js + moves.js
- Datos: name, hp/atk/def/sp, moves (nombre, elemento, daño, tipo QTE window),
  color, escala.
- Agumon: Baby Flame (fuego 18), Peppers Breath (fuego 26, carga 1 turno).
- Patamon: Boom Bubble (aire 16), Air Shot (aire 22).

## Fase 5 — battle (Expedition 33 style)

### Task 5.1: src/battle/qte.js — sistema de timing
- Barra de timing con zona dorada (crit), ventana de parry y dodge.
- Input: tecla en ventana → success crit/perfect; fuera → normal/whiff.
- Reutiliza input buffering. Emite `battle:qte`.
- Test: timing exacto → crit; tarde → miss.

### Task 5.2: src/battle/index.js — máquina de turnos
- Estados: intro → playerTurn (menú: Ataque/Habilidad/Ítem/Digivolucion/Huir) →
  qteCrit → resolveDamage → enemyTurn → qteParry/Dodge → resolve → checkEnd.
- Turnos por speed (SP): Agumon/Patamon vs salvaje.
- Eventos battle:hit, battle:qte, battle:end.
- Test: simular batalla completa sin UI → gana/lose correcto.

### Task 5.3: src/battle/arena.js + enemy.js
- Transición: al tocar digimon salvaje → zona de batalla (la calle se cierra con
  barrera de luz), cámara reposicionada, enemigo entra.
- enemy.js: IA salvaje simple (elige ataque, a veces defiende), stats escaladas
  por nivel del área.

### Task 5.4: src/battle/presentation.js
- Vista de batalla en primera persona con tu digimon enfrente + enemigo enfrente.
- Anims ataque/golpe/muerte, números de daño, barra QTE, hitmarker.
- Rival: trainer rival con su digimon (Agumon↔Patamon).

## Fase 6 — digivice + ui

### Task 6.1: src/ui/hud.js + styles.css
- Crosshair, hitmarker, barras HP/Stamina (event-driven, no polling), prompts de
  interacción, indicador de enemigos cerca.

### Task 6.2: src/digivice/index.js + screens.js
- Pantalla del digivice (overlay DOM, estilo digivice clásico), stack de pantallas,
  teclado navegación (Tab abrir/cerrar, flechas, Enter).
- Tabs: Inventario, Mapa, Digimons, Perfil, Digihuevos.

### Task 6.3: src/digivice/inventory.js + map.js
- Inventario: items (DigiPan, pociones, chips), eventos inventory:changed.
- Mapa: minimapa top-down del cruce (canvas 2D), marcadores trainers/salvajes/
  tiendas, posición jugador.

### Task 6.4: src/digivice/digimons.js + profile.js + eggs.js
- Digimons: stats de Agumon/Patamon (HP/ATK/DEF/SP/nivel/amistad).
- Perfil: nombre trainer, insignias, victorias.
- Eggs: huevos encontrados (pickup en el mundo), progreso incubación (tiempo
  jugado), hatch event → nuevo digimon.

### Task 6.5: src/audio/index.js + sfx.js
- Síntesis Web Audio: pasos, disparos/habilidades, golpes, QTE success/fail,
  digivice beep, batalla intro. Sin archivos.

## Fase 7 — integración y pulido

### Task 7.1: main.js completo — bootstrap, sistemas registrados, bucle
- Conectar todo: mundo → player → digivice → battle.
- Transiciones: explorar ↔ batalla (camera swap, HUD swap).

### Task 7.2: Encuentros y trainers
- Digimons salvajes patrullan calles (spawn por zona), tocar → encounter.
- Rival aparece en el cruce, dialogo simple, batalla.
- Pickup digihuevos.

### Task 7.3: Verificación final
- `npm run build` OK. `node tools/baseline.mjs` captura las 11 tomas.
- `node tools/playtest.mjs` smoke test.
- Commit final (local).

## Verification checklist global
- [ ] Build pasa sin errores
- [ ] Dev server sirve y el juego arranca con FPS estable
- [ ] Shibuya recognoscible en capturas (cruce en X, neones, edificios)
- [ ] Agumon y Patamon chibi reconocibles y animados
- [ ] Batalla completa jugable (turno → QTE → daño → parry → fin)
- [ ] Digivice navegable con todas las tabs
- [ ] Stamina y salud funcionan (barras HUD)
- [ ] Audio sintetizado presente
