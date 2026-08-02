# DIGIMON: SHIBUYA PROTOCOL — Design Doc

> Fan game no comercial. Sin assets externos: todo procedural en código (Three.js r180+).
> Combate "timed-action turn-based" estilo Clair Obscur: Expedition 33.

## Vision

Un fan game en primera persona ambientado en el cruce de Shibuya (Tokio). El jugador
es un trainer con Agumon (y Patamon de secundario) que explora el centro de Shibuya,
lucha contra digimons salvajes y contra trainers rivales con batallas por turnos con
QTE de timing (perfect parry / golden-zone crit), todo accesible desde un Digivice.

## Core pillars

1. **Shibuya vivo** — el cruce de 5 vías con su paso de cebra en diagonal, edificios
   icónicos (109, Tsutaya, Hachiko), pantallas LED, neones, multitud de NPCs, día→noche.
2. **Digimon chibi procedural** — Agumon y Patamon modelados en código (low-poly),
   animación por código (sin esqueletos), identidad visual reconocible.
3. **Combate Expedition-33** — turnos clásicos de Digimon (Ataque/Habilidad/Ítem/
   Digivolucion/Huir) pero cada acción ejecuta un QTE: barra con zona dorada para
   crit, y al recibir ataque ventana de parry/dodge perfecto.
4. **Digivice como UI total** — inventario, mapa, digimons, perfil del trainer,
   salud, stamina, digihuevos.

## Scope (MVP)

- Zona jugable: cruce + ~300×300 m de calles alrededor.
- 2 digimons jugables: Agumon, Patamon. 2-3 salvajes genéricos (Koromon, Bukamon,
  Nyaromon?) para entrenar.
- 1 trainer rival (el de Patamon si tú llevas Agumon, y viceversa).
- Combate: turnos + QTE timing + parry/dodge + habilidades por digimon.
- Digivice: inventario, mapa, digimons, perfil, salud/stamina, digihuevos.
- Audio: síntesis Web Audio (sin archivos).
- Verificación: tools/ de capture/baseline/imagediff/playtest copiadas de
  Claude-of-Duty (D:\Claude-of-Duty\tools).

## Arquitectura (herencia de Claude-of-Duty)

Subsistemas con dueño único, contrato vía `ctx`, eventos cross-subsistema,
rng determinista, cero alloc per frame, dispose. Sin dependencias nuevas (solo three).

```
src/
  core/     engine.js, config.js, input.js, events.js, rng.js
  world/    shibuya.js (cruce + calles + aceras), buildings.js (kit modular),
            neon.js (pantallas LED + carteles), props.js, npcs.js (multitud),
            daynight.js
  player/   controller.js (FPS), camera.js (feel, bob, recoil)
  digimon/  registry.js, agumon.js, patamon.js, models.js (factory chibi),
            anim.js (animación por código), moves.js (habilidades + datos)
  battle/   index.js (máquina de turnos), qte.js (timing/parry/dodge),
            arena.js (transición a zona de batalla), enemy.js (IA salvaje)
  trainer/  profile.js (stats del trainer), rival.js
  digivice/ index.js (menú Tab), inventory.js, map.js, digimons.js,
            profile.js, eggs.js, stamina.js
  ui/       hud.js (crosshair, hitmarker, barras, prompts), styles.css,
            digivice.css, screens.js (stack)
  audio/    index.js (síntesis), sfx.js
  main.js   bootstrap
```

Contrato: mismo que ARCHITECTURE.md de CoD — `static id/deps`, hooks init/
fixedUpdate/update/lateUpdate/resize/dispose, `ctx.get(id)`, `ctx.events`,
`ctx.rng`, `config.q`, superficies, eventos canónicos.

## Eventos canónicos (cross-subsistema)

- `battle:start { wild, trainer }` / `battle:end { result }`
- `battle:turn { actor, action }` / `battle:qte { type: 'crit'|'parry'|'dodge', window }`
- `battle:hit { target, damage, crit, blocked }`
- `digimon:damage { digimon, amount, hp }` / `digimon:heal`
- `digimon:digivolve { from, to }`
- `player:stamina { current, max }` / `player:health { current, max }`
- `digivice:open` / `digivice:close` / `digivice:tab { tab }`
- `inventory:changed` / `egg:hatch { digimon }`
- `world:time { hour, dayPhase }`
- `interact { target }` / `encounter { digimon, at: Vector3 }`

## Stats / balance (referencia)

- HP: Agumon 90, Patamon 75. ATK: 12 / 9. DEF: 8 / 7. SP: 10 / 14.
- Moves: Baby Flame (fuego, 18 dmg), Peppers Breath (fuego, 26, cargar 1 turno);
  Boom Bubble (aire, 16), Air Shot (aire, 22).
- QTE: crit = 1.6×; parry = 0 daño + contraataque 0.5×; dodge = 0 daño.
- Stamina: sprint 30/s, regen 15/s fuera de sprint; HP trainer 100.

## Plataforma

- Vite + three (ESM), `npm run dev` en http://127.0.0.1:5173.
- Windows host; repo en D:\digimon-shibuya-protocol.
- Git: commits locales, push solo con OK (regla del usuario).

## Fuera de scope (futuro)

- Más digimons / digievoluciones completas / digivolución en combate.
- Red / multijugador. Música original. Assets externos (Grok renders).
- Más distritos de Tokio (Akihabara, Shinjuku).
