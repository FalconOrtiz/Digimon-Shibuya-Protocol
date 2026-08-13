// src/main.js — bootstrap de Digimon: Shibuya Protocol.
// Crea el engine, registra todos los sistemas en orden de deps y arranca.

import { createEngine } from './core/engine.js';
import { RenderSystem } from './render/index.js';
import { Shibuya } from './world/shibuya.js';
import { Buildings } from './world/buildings.js';
import { Props } from './world/props.js';
import { StreetLife } from './world/street-life.js';
import { Npcs } from './world/npcs.js';
import { DayNight } from './world/daynight.js';
import { Encounters } from './world/encounters.js';
import { Player } from './player/controller.js';
import { DigimonSystem } from './digimon/index.js';
import { Battle } from './battle/index.js';
import { TrainerProfile } from './trainer/profile.js';
import { Digivice } from './digivice/index.js';
import { Hud } from './ui/hud.js';
import { AudioSystem } from './audio/index.js';

async function main() {
  const canvas = document.getElementById('c');
  const engine = await createEngine(canvas);
  const ctx = engine.ctx;

  // ---- registro de sistemas (orden = deps) ----
  engine.register(new RenderSystem());
  engine.register(new Shibuya());          // mundo base
  engine.register(new Buildings());        // edificios (deps world)
  engine.register(new Props());            // farolas/semáforos (deps world)
  engine.register(new StreetLife());
  engine.register(new Npcs());             // multitud (deps world)
  engine.register(new DayNight());         // ciclo día/noche (deps world)
  engine.register(new Player());           // controller FPS (deps world, buildings)
  engine.register(new DigimonSystem());    // Agumon/Patamon (deps world, player)
  engine.register(new TrainerProfile());   // perfil del trainer
  engine.register(new Battle());           // máquina de turnos (deps digimon, player)
  engine.register(new Encounters());       // salvajes + rival (deps world, battle, player)
  engine.register(new AudioSystem());      // síntesis Web Audio
  engine.register(new Hud());              // HUD + QTE (deps player, digimon, battle)
  engine.register(new Digivice());         // overlay (deps player, digimon, trainer)

  await engine.boot();

  // ---- setup inicial ----
  const trainer = ctx.get('trainer');
  const digimonSys = ctx.get('digimon');
  const digivice = ctx.get('digivice');

  trainer.setTeam(digimonSys.party.map(m => m.species.id));
  trainer.name = 'FalconOrtiz';
  ctx.events.emit('trainer:stats', { wins: 0, losses: 0 });

  // huevo inicial para el panel (demostración)
  ctx.events.emit('egg:found', { species: 'koromon' });

  // click en canvas → pointer lock (para jugar en primera persona)
  canvas.addEventListener('click', () => {
    const battle = ctx.peek('battle');
    if (!ctx.input.locked && !digivice.open && !(battle && battle.running)) ctx.input.lock();
  });

  // Tab abre/cierra el digivice (fuera de batalla)
  // se gestiona en Digivice.update() pero necesitamos un hook aquí porque
  // update() solo corre si el sistema está en la lista del engine (sí lo está).

  // estado inicial HUD
  ctx.events.emit('player:health', { current: ctx.config.player.hp, max: ctx.config.player.hp });
  ctx.events.emit('player:stamina', { current: ctx.config.player.staminaMax, max: ctx.config.player.staminaMax });
  ctx.events.emit('digivice:message', { text: 'Bienvenido a Shibuya, FalconOrtiz. ¡Encuentra digimons salvajes!' });

  // debug: exponer engine para consola
  window.__game = { engine, ctx };
}

main().catch((err) => {
  console.error('FATAL:', err);
  document.body.innerHTML = `<pre style="color:#ff5a5a;padding:20px;font-size:13px">FATAL: ${err.message}\n${err.stack}</pre>`;
});
