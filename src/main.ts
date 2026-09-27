// Bootstrap de Digimon: Shibuya Protocol.

import { createEngine } from './core/Engine';
import { RenderSystem } from './render/RenderSystem';
import { Atmosphere } from './world/Atmosphere';
import { Crossing } from './world/Crossing';
import { CityBlocks } from './world/CityBlocks';
import { UrbanProps } from './world/UrbanProps';
import { Crowd } from './world/Crowd';
import { Encounters } from './world/Encounters';
import { Player } from './player/Player';
import { DigimonSystem } from './digimon';
import { BattleSystem } from './battle/BattleSystem';
import { TrainerProfile } from './trainer/TrainerProfile';
import { Digivice } from './digivice/Digivice';
import { Hud } from './ui/Hud';
import { AudioSystem } from './audio/AudioSystem';

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
  engine.register(new TrainerProfile());
  engine.register(new Player());
  engine.register(new DigimonSystem());
  // Después de `player`: en combate su escritura de cámara es la última.
  engine.register(new BattleSystem());
  engine.register(new Encounters());
  engine.register(new AudioSystem());
  engine.register(new Hud());
  engine.register(new Digivice());

  await engine.boot();

  const trainer = ctx.get<{ name: string; wins: number; losses: number; savedEggs(): unknown[] }>('trainer');
  const digivice = ctx.get<{ open: boolean }>('digivice');
  const battle = ctx.get<{ running: boolean }>('battle');

  canvas.addEventListener('click', () => {
    if (!ctx.input.locked && !digivice.open && !battle.running) ctx.input.lock();
  });

  ctx.events.emit('trainer:stats', { wins: trainer.wins, losses: trainer.losses });
  ctx.events.emit('player:health', { current: ctx.config.player.hp, max: ctx.config.player.hp });
  ctx.events.emit('player:stamina', { current: ctx.config.player.staminaMax, max: ctx.config.player.staminaMax });
  ctx.events.emit('digivice:message', { text: `Welcome to Shibuya, ${trainer.name}. Go find wild Digimon!` });

  window.__game = { engine, ctx };
}

main().catch((err: Error) => {
  console.error('FATAL:', err);
  document.body.innerHTML = `<pre style="color:#ff5a5a;padding:20px;font-size:13px">FATAL: ${err.message}\n${err.stack}</pre>`;
});
