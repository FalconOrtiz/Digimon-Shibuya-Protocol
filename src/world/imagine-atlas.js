// Imagine atlas — Grok Imagine outputs in /assets/imagine/
// Future agents: generate into public/assets/imagine, add a key here.
import * as THREE from 'three';

export const IMAGINE = {
  led: [
    '/assets/imagine/led-databreak.jpg',
    '/assets/imagine/led-digitonic.jpg',
    '/assets/imagine/led-tsunet.jpg',
    '/assets/imagine/led-117.jpg',
    '/assets/imagine/led-qfront.jpg'
  ],
  facadeNight: '/assets/imagine/facade-night-glass.jpg',
  groundZebra: '/assets/imagine/ground-wet-zebra.jpg',
  avatar: '/assets/imagine/avatar-hood.jpg',
  items: {
    potion: '/assets/imagine/item-cyan-vial.jpg',
    chip: '/assets/imagine/item-pistol.jpg',
    digipan: '/assets/imagine/item-red-vial.jpg'
  },
  skyNight: '/assets/imagine/sky-night.jpg',
  ads: {
    digitonic: '/assets/imagine/ad-digitonic.mp4',
    qfront: '/assets/imagine/ad-qfront.mp4'
  }
};

const loader = new THREE.TextureLoader();
const cache = new Map();

export function imagineTex(url) {
  if (cache.has(url)) return cache.get(url);
  const tex = loader.load(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  cache.set(url, tex);
  return tex;
}

export function imagineLed(i = 0) {
  return imagineTex(IMAGINE.led[i % IMAGINE.led.length]);
}

export function imagineVideo(url) {
  if (cache.has(url)) return cache.get(url);
  const v = document.createElement('video');
  v.src = url;
  v.loop = true;
  v.muted = true;
  v.playsInline = true;
  v.autoplay = true;
  v.crossOrigin = 'anonymous';
  v.preload = 'auto';
  const play = () => v.play().catch(() => {});
  v.addEventListener('canplay', play, { once: true });
  document.addEventListener('pointerdown', play, { once: true });
  play();
  const tex = new THREE.VideoTexture(v);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.userData.video = v;
  cache.set(url, tex);
  return tex;
}

export function imagineSky(url = IMAGINE.skyNight) {
  const tex = imagineTex(url);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}
