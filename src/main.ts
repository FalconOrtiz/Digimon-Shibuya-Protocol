// Bootstrap de Digimon: Shibuya Protocol.

import { createEngine } from './core/Engine';
import { RenderSystem } from './render/RenderSystem';
import { Atmosphere } from './world/Atmosphere';
import { Crossing } from './world/Crossing';
import { CityBlocks } from './world/CityBlocks';
import { UrbanProps } from './world/UrbanProps';
import { Crowd } from './world/Crowd';
import { Encounters } from './world/encounters.js';
import { Player } from './player/controller.js';
import { DigimonSystem } from './digimon/index.js';
import { Battle } from './battle/index.js';
import { TrainerProfile } from './trainer/profile.js';
import { Digivice } from './digivice/index.js';
import { Hud } from './ui/hud.js';
import { AudioSystem } from './audio/index.js';

declare global {
  interface Window {
    __game?: unknown;
  }
}

async function main(): Promise<void> {
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  const engine = await createEngine(canvas);
  const ctx = engine.ctx;

  engine.register(new RenderSystem());
  engine.register(new Atmosphere());
  engine.register(new Crossing());
  engine.register(new CityBlocks());
  engine.register(new UrbanProps());
  engine.register(new Crowd());
  engine.register(new Player());
  engine.register(new DigimonSystem());
  engine.register(new TrainerProfile());
  engine.register(new Battle());
  engine.register(new Encounters());
  engine.register(new AudioSystem());
  engine.register(new Hud());
  engine.register(new Digivice());

  await engine.boot();

  const trainer = ctx.get<any>('trainer');
  const digimonSys = ctx.get<any>('digimon');
  const digivice = ctx.get<any>('digivice');

  trainer.setTeam(digimonSys.party.map((m: any) => m.species.id));
  trainer.name = 'FalconOrtiz';
  ctx.events.emit('trainer:stats', { wins: 0, losses: 0 });
  ctx.events.emit('egg:found', { species: 'koromon' });

  canvas.addEventListener('click', () => {
    const battle = ctx.peek<any>('battle');
    if (!ctx.input.locked && !digivice.open && !(battle && battle.running)) ctx.input.lock();
  });

  ctx.events.emit('player:health', { current: ctx.config.player.hp, max: ctx.config.player.hp });
  ctx.events.emit('player:stamina', { current: ctx.config.player.staminaMax, max: ctx.config.player.staminaMax });
  ctx.events.emit('digivice:message', { text: 'Bienvenido a Shibuya, FalconOrtiz. ¡Encuentra digimons salvajes!' });

  window.__game = { engine, ctx };
}

main().catch((err: Error) => {
  console.error('FATAL:', err);
  document.body.innerHTML = `<pre style="color:#ff5a5a;padding:20px;font-size:13px">FATAL: ${err.message}\n${err.stack}</pre>`;
});
