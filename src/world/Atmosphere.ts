import * as THREE from 'three';
import { createSkyMaterial, createSkyUniforms, SKY_PALETTE, type SkyUniforms } from '../fx/SkyShader';
import { buildCloudLayer, type CloudLayer } from '../fx/Clouds';
import { applyNightFactor } from '../fx/materials/NeonMaterials';
import { smoothstep } from '../core/Noise';
import type { Ctx, GameSystem } from '../core/Context';

/**
 * Atmosphere — sky, clouds, light rig, PMREM environment, fog and the day/night
 * clock. The only owner of lights in the game (ART_DIRECTION §4).
 *
 * Rig: one VSM key (sun by day, moon by night), a hemisphere fill and a warm
 * bounce fake. Everything else that makes surfaces read as expensive comes from
 * the PMREM baked out of the same sky shader the dome draws, so reflections on
 * wet asphalt and glass always agree with the visible sky.
 */

const SUN_MAX_ELEVATION = THREE.MathUtils.degToRad(56);
/** Measured from +Z (south) turning toward +X. West-south-west at dusk, so the
 * north-facing gold camera sees lit facades with shadows raking toward it. */
const SUN_AZIMUTH = THREE.MathUtils.degToRad(200);
const MOON_DIR = new THREE.Vector3(0.45, 0.72, -0.52).normalize();

/** Area the key light must resolve: crossing plus first ring of blocks. */
const PLAY_AREA = { cx: 0, cz: 0, hx: 78, hz: 78, minY: -1, maxY: 60 };
const SUN_DISTANCE = 240;
const SKY_RADIUS = 460;
const SKY_INTENSITY = 1.6;
/** Rebuild the PMREM when the clock has moved this many hours. */
const ENV_REFRESH_HOURS = 0.25;

interface DayPhase {
  hour: number;
  zenith: number;
  horizon: number;
  haze: number;
  nadir: number;
  sun: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  fog: number;
  fogDensity: number;
  env: number;
}

const DAY_PHASES: DayPhase[] = [
  { hour: 1, zenith: 0x0c0c22, horizon: 0x2a2a50, haze: 0x34345a, nadir: 0x16162a, sun: 0x9aa8d8, sunIntensity: 0.22, hemiSky: 0x3a3a60, hemiGround: 0x1a1a28, hemiIntensity: 0.45, fog: 0x1a1a32, fogDensity: 0.003, env: 0.5 },
  { hour: 5.5, zenith: 0x3a3a5e, horizon: 0xffb46a, haze: 0xffc890, nadir: 0x3a3050, sun: 0xffb46a, sunIntensity: 0.9, hemiSky: 0x7a6a8a, hemiGround: 0x4a4048, hemiIntensity: 0.7, fog: 0x5a4060, fogDensity: 0.0026, env: 0.7 },
  { hour: 9, zenith: 0x5a7ab8, horizon: 0xc8d8f0, haze: 0xd8e4f4, nadir: 0x5a6478, sun: 0xfff2c8, sunIntensity: 2.6, hemiSky: 0xa0b4d0, hemiGround: 0x5a5a60, hemiIntensity: 0.95, fog: 0x9aa8c0, fogDensity: 0.0016, env: 0.95 },
  { hour: 13, zenith: 0x4a6ab0, horizon: 0xb8cce8, haze: 0xc8d8ec, nadir: 0x5a6478, sun: 0xfff8d8, sunIntensity: 2.9, hemiSky: 0xa8b8d4, hemiGround: 0x5a5a60, hemiIntensity: 1.0, fog: 0x9aa8c0, fogDensity: 0.0015, env: 1.0 },
  { hour: 15.5, zenith: 0x5a78c0, horizon: 0xf0d0b0, haze: 0xffe0c0, nadir: 0x6a6070, sun: 0xffe8c0, sunIntensity: 2.7, hemiSky: 0xb8b8d8, hemiGround: 0x6a6060, hemiIntensity: 1.0, fog: 0xb8a8b0, fogDensity: 0.0016, env: 1.0 },
  // GOLDEN gold shot
  { hour: 17, zenith: 0x7a86c8, horizon: 0xffc890, haze: 0xffdcb0, nadir: 0x7a6070, sun: 0xffc488, sunIntensity: 2.6, hemiSky: 0xf0c8c8, hemiGround: 0x9a7466, hemiIntensity: 1.25, fog: 0xf0c8a8, fogDensity: 0.0016, env: 1.15 },
  { hour: 18.6, zenith: 0x3d2a6b, horizon: 0xff9868, haze: 0xffb080, nadir: 0x4a3a5e, sun: 0xff9860, sunIntensity: 1.2, hemiSky: 0x9a80b0, hemiGround: 0x3a3448, hemiIntensity: 0.8, fog: 0x6a4a6a, fogDensity: 0.0024, env: 0.85 },
  { hour: 19.6, zenith: 0x1e1e48, horizon: 0x6a5a90, haze: 0x7a6a98, nadir: 0x22223e, sun: 0x8898d0, sunIntensity: 0.4, hemiSky: 0x5a5a88, hemiGround: 0x22222e, hemiIntensity: 0.6, fog: 0x2e2a4a, fogDensity: 0.0026, env: 0.65 },
  // NIGHT gold shot
  { hour: 21.5, zenith: 0x121430, horizon: 0x3a3470, haze: 0x4a4080, nadir: 0x14142a, sun: 0xa0b0ff, sunIntensity: 0.5, hemiSky: 0x7060b0, hemiGround: 0x6a3a5a, hemiIntensity: 1.35, fog: 0x241a3a, fogDensity: 0.0022, env: 0.8 },
];

export class Atmosphere implements GameSystem {
  static id = 'atmosphere';
  static deps: string[] = [];

  hour = 17;
  nightFactor = 0;
  frozen = false;

  private ctx!: Ctx;
  private cycleSeconds = 720;
  private skyUniforms!: SkyUniforms;
  private skyDome!: THREE.Mesh;
  private clouds!: CloudLayer;
  private key!: THREE.DirectionalLight;
  private fill!: THREE.HemisphereLight;
  private bounce!: THREE.DirectionalLight;
  private fog!: THREE.FogExp2;
  private centre = new THREE.Vector3();
  private toSun = new THREE.Vector3();
  private keyDir = new THREE.Vector3();
  private camPos = new THREE.Vector3();
  private cA = new THREE.Color();
  private cB = new THREE.Color();
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private envHour = -99;
  private envScene!: THREE.Scene;
  private envMat!: THREE.ShaderMaterial;
  private pmrem!: THREE.PMREMGenerator;
  private cityGlow!: THREE.Mesh;
  private lastPhase = '';

  init(ctx: Ctx): this {
    this.ctx = ctx;
    const scene = ctx.scene;
    const params = new URLSearchParams(location.search);
    const urlHour = params.get('hour');
    this.hour = urlHour !== null ? Number(urlHour) : ctx.config.world.startHour;
    this.frozen = params.has('freeze');
    this.cycleSeconds = ctx.config.world.cycleSeconds;
    this.centre.set(PLAY_AREA.cx, (PLAY_AREA.minY + PLAY_AREA.maxY) * 0.5, PLAY_AREA.cz);

    this.skyUniforms = createSkyUniforms(SKY_PALETTE);
    this.skyUniforms.uIntensity.value = SKY_INTENSITY;
    const skyMat = createSkyMaterial(this.skyUniforms);
    this.skyDome = new THREE.Mesh(new THREE.IcosahedronGeometry(SKY_RADIUS, 4), skyMat);
    this.skyDome.name = 'SkyDome';
    this.skyDome.frustumCulled = false;
    this.skyDome.renderOrder = -1000;
    scene.add(this.skyDome);

    this.clouds = buildCloudLayer({
      seed: ctx.config.seed,
      count: 24,
      hazeColor: new THREE.Color(SKY_PALETTE.haze).multiplyScalar(SKY_INTENSITY * 0.95),
      exposure: SKY_INTENSITY * 1.04,
    });
    scene.add(this.clouds.group);

    this.key = new THREE.DirectionalLight(0xffffff, 2);
    this.key.name = 'Key';
    this.key.castShadow = true;
    const s = ctx.config.q.shadowMapSize;
    this.key.shadow.mapSize.set(s, s);
    this.key.shadow.bias = -0.00012;
    this.key.shadow.normalBias = 0.022;
    this.key.shadow.radius = 2.0;
    this.key.shadow.blurSamples = 12;
    this.key.target.position.copy(this.centre);
    scene.add(this.key, this.key.target);

    this.fill = new THREE.HemisphereLight(0xc8b4d4, 0x7a6a62, 1);
    this.fill.name = 'SkyFill';
    scene.add(this.fill);

    this.bounce = new THREE.DirectionalLight(0xffd9a8, 0.3);
    this.bounce.name = 'GroundBounce';
    this.bounce.position.copy(this.centre).addScaledVector(new THREE.Vector3(-0.6, -0.52, -0.6).normalize(), 60);
    this.bounce.target.position.copy(this.centre);
    scene.add(this.bounce, this.bounce.target);

    this.fog = new THREE.FogExp2(0xd8b8a8, 0.0017);
    scene.fog = this.fog;

    this.envScene = new THREE.Scene();
    this.envMat = createSkyMaterial(this.skyUniforms);
    const envMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(12, 4), this.envMat);
    envMesh.frustumCulled = false;
    this.envScene.add(envMesh);
    this.cityGlow = cityGlowRing(ctx.config.seed);
    this.envScene.add(this.cityGlow);
    this.pmrem = new THREE.PMREMGenerator(ctx.renderer);

    const self = this;
    scene.userData.dayNight = {
      get hour() {
        return self.hour;
      },
      setHour(h: number) {
        self.hour = ((h % 24) + 24) % 24;
        self.sample(true);
      },
      freeze(on: boolean) {
        self.frozen = on;
      },
    };

    this.sample(true);
    return this;
  }

  private sample(forceEnv = false): void {
    const h = this.hour;
    let a = DAY_PHASES[DAY_PHASES.length - 1];
    let b = DAY_PHASES[0];
    for (let i = 0; i < DAY_PHASES.length - 1; i++) {
      if (h >= DAY_PHASES[i].hour && h <= DAY_PHASES[i + 1].hour) {
        a = DAY_PHASES[i];
        b = DAY_PHASES[i + 1];
        break;
      }
    }
    let span = b.hour - a.hour;
    let hh = h;
    if (span <= 0) {
      span += 24;
      hh = h < a.hour ? h + 24 : h;
    }
    const t = Math.min(1, Math.max(0, (hh - a.hour) / span));
    const col = (out: THREE.Color, x: number, y: number) => out.setHex(x).lerp(this.cB.setHex(y), t);
    const num = (x: number, y: number) => x + (y - x) * t;

    const su = this.skyUniforms;
    col(su.uZenith.value, a.zenith, b.zenith);
    col(su.uHorizon.value, a.horizon, b.horizon);
    col(su.uHaze.value, a.haze, b.haze);
    col(su.uNadir.value, a.nadir, b.nadir);
    col(su.uSunColor.value, a.sun, b.sun);

    this.nightFactor = Math.max(smoothstep(17.8, 20.4, h), 1 - smoothstep(4.8, 6.6, h));
    const nf = this.nightFactor;

    const sunAngle = ((h - 6.5) / 12.5) * Math.PI;
    const elevation = Math.sin(Math.max(0, Math.min(Math.PI, sunAngle))) * SUN_MAX_ELEVATION;
    const cosEl = Math.cos(elevation);
    this.toSun.set(Math.sin(SUN_AZIMUTH) * cosEl, Math.sin(elevation), Math.cos(SUN_AZIMUTH) * cosEl).normalize();
    su.uSunDir.value.copy(this.toSun);
    // The sun disc sinks below the horizon at night; the moon takes the key.
    su.uSunDiscGain.value = 7.0 * (1 - nf);

    this.keyDir.copy(this.toSun).lerp(MOON_DIR, nf).normalize();
    if (this.keyDir.y < 0.12) this.keyDir.y = 0.12;
    this.keyDir.normalize();
    this.key.position.copy(this.centre).addScaledVector(this.keyDir, SUN_DISTANCE);
    col(this.key.color, a.sun, b.sun);
    this.key.intensity = num(a.sunIntensity, b.sunIntensity);
    this.fitShadowFrustum();

    col(this.fill.color, a.hemiSky, b.hemiSky);
    col(this.fill.groundColor, a.hemiGround, b.hemiGround);
    this.fill.intensity = num(a.hemiIntensity, b.hemiIntensity);

    this.bounce.color.setHex(0xffd9a8).lerp(this.cA.setHex(0xc05a9a), nf);
    this.bounce.intensity = 0.22 + (1 - nf) * 0.12 + nf * 0.2;

    col(this.fog.color, a.fog, b.fog);
    this.fog.density = num(a.fogDensity, b.fogDensity);

    const cu = this.clouds.material.uniforms;
    (cu.uHaze.value as THREE.Color).copy(su.uHaze.value).multiplyScalar(SKY_INTENSITY * 0.95);
    cu.uExposure.value = SKY_INTENSITY * (1.04 - nf * 0.78);
    cu.uOpacity.value = 1.0 - nf * 0.55;

    const scene = this.ctx.scene;
    scene.environmentIntensity = num(a.env, b.env);
    scene.userData.nightFactor = nf;
    applyNightFactor(nf);

    let dh = Math.abs(h - this.envHour);
    dh = Math.min(dh, 24 - dh);
    if (forceEnv || dh > ENV_REFRESH_HOURS) this.rebuildEnvironment();

    const phase = this.phaseName();
    if (forceEnv || phase !== this.lastPhase || (this.ctx.time.frame & 31) === 0) {
      this.lastPhase = phase;
      this.ctx.events.emit('world:time', { hour: h, dayPhase: phase, nightFactor: nf });
    }
  }

  private rebuildEnvironment(): void {
    const glow = this.cityGlow.material as THREE.MeshBasicMaterial;
    glow.color.setScalar(0.08 + this.nightFactor * 3);
    const next = this.pmrem.fromScene(this.envScene, 0.035, 0.5, 60);
    this.ctx.scene.environment = next.texture;
    this.envTarget?.dispose();
    this.envTarget = next;
    this.envHour = this.hour;
  }

  private phaseName(): string {
    const h = this.hour;
    if (h >= 5 && h < 12) return 'morning';
    if (h >= 12 && h < 17) return 'afternoon';
    if (h >= 17 && h < 20) return 'dusk';
    return 'night';
  }

  private fitShadowFrustum(): void {
    const light = this.key;
    const view = _m.lookAt(light.position, this.centre, _up).setPosition(light.position).invert();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < 8; i++) {
      _corner.set(
        PLAY_AREA.cx + (i & 1 ? PLAY_AREA.hx : -PLAY_AREA.hx),
        i & 2 ? PLAY_AREA.maxY : PLAY_AREA.minY,
        PLAY_AREA.cz + (i & 4 ? PLAY_AREA.hz : -PLAY_AREA.hz),
      ).applyMatrix4(view);
      minX = Math.min(minX, _corner.x);
      maxX = Math.max(maxX, _corner.x);
      minY = Math.min(minY, _corner.y);
      maxY = Math.max(maxY, _corner.y);
      minZ = Math.min(minZ, _corner.z);
      maxZ = Math.max(maxZ, _corner.z);
    }
    const margin = 1.5;
    const cam = light.shadow.camera;
    cam.left = minX - margin;
    cam.right = maxX + margin;
    cam.bottom = minY - margin;
    cam.top = maxY + margin;
    cam.near = Math.max(0.5, -maxZ - 14);
    cam.far = -minZ + margin;
    cam.updateProjectionMatrix();
  }

  update(dt: number): void {
    this.ctx.camera.getWorldPosition(this.camPos);
    this.skyDome.position.copy(this.camPos);
    this.clouds.update(this.ctx.time.elapsed * 6);
    if (this.frozen) return;
    this.hour = (this.hour + (dt * 24) / this.cycleSeconds) % 24;
    this.sample();
  }

  dispose(): void {
    const scene = this.ctx.scene;
    scene.remove(this.skyDome, this.clouds.group, this.key, this.key.target, this.fill, this.bounce, this.bounce.target);
    this.skyDome.geometry.dispose();
    (this.skyDome.material as THREE.Material).dispose();
    this.clouds.mesh.geometry.dispose();
    this.clouds.material.dispose();
    this.envMat.dispose();
    this.cityGlow.geometry.dispose();
    const glow = this.cityGlow.material as THREE.MeshBasicMaterial;
    glow.map?.dispose();
    glow.dispose();
    this.envTarget?.dispose();
    this.pmrem.dispose();
    this.key.shadow.map?.dispose();
  }
}

/**
 * Reflection-only skyline band for the PMREM scene: dark tower silhouettes
 * dotted with lit windows and neon bars. By day it is nearly black (a hint of
 * city on the horizon); at night it is what wet asphalt and glass reflect.
 */
function cityGlowRing(seed: number): THREE.Mesh {
  const W = 1024;
  const H = 128;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  const neon = ['#ff3d8a', '#4de1ff', '#ffd23d', '#b06bff', '#ff7a2e', '#7cff6b'];
  for (let x = 0; x < W; ) {
    const bw = 14 + rnd() * 40;
    const top = H * (0.15 + rnd() * 0.5);
    g.fillStyle = '#0b0a14';
    g.fillRect(x, top, bw, H - top);
    for (let wy = top + 4; wy < H - 4; wy += 6) {
      for (let wx = x + 3; wx < x + bw - 3; wx += 5) {
        if (rnd() < 0.55) {
          g.fillStyle = rnd() < 0.75 ? '#ffc890' : '#9ad8ff';
          g.globalAlpha = 0.55 + rnd() * 0.45;
          g.fillRect(wx, wy, 2, 3);
        }
      }
    }
    g.globalAlpha = 1;
    if (rnd() < 0.8) {
      g.fillStyle = neon[Math.floor(rnd() * neon.length)];
      if (rnd() < 0.5) g.fillRect(x + bw * 0.3, top + 6, 6, (H - top) * 0.7);
      else g.fillRect(x + 2, top + 8 + rnd() * 20, bw - 4, 10);
    }
    x += bw + rnd() * 3;
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.x = 3;
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 3.2, 96, 1, true), mat);
  ring.position.y = 1.3;
  ring.frustumCulled = false;
  return ring;
}

const _m = new THREE.Matrix4();
const _corner = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
