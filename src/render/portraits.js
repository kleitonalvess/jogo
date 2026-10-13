// Retratos dos moradores para conversas e para o Registro: renderiza o
// próprio modelo 3D de perto, numa cena separada, e guarda a imagem.

import * as THREE from 'three';

import { outfitOf } from '../engine/people/population.js';
import { createCharacter, disposeCharacter } from './character.js';

const SIZE = 128;

// Fora da tela o three.js grava cores lineares; a imagem final precisa de sRGB.
const TO_SRGB = new Uint8ClampedArray(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  TO_SRGB[i] = Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
}

export class Portraits {
  constructor(renderer) {
    this.renderer = renderer;
    this.cache = new Map();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0f2229');
    this.scene.add(new THREE.AmbientLight('#9ab4bb', 1.1));
    const key = new THREE.DirectionalLight('#ffdcae', 2.2);
    key.position.set(1.2, 1.6, 2);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#7fd0d8', 1.4);
    rim.position.set(-2, 1, -1.5);
    this.scene.add(rim);
    this.camera = new THREE.PerspectiveCamera(24, 1, 0.05, 10);
    this.target = new THREE.WebGLRenderTarget(SIZE, SIZE);
    this.pixels = new Uint8Array(SIZE * SIZE * 4);
    this.canvas = document.createElement('canvas');
    this.canvas.width = SIZE;
    this.canvas.height = SIZE;
    this.ctx = this.canvas.getContext('2d');
  }

  get(state, r, override = null) {
    if (!r) return '';
    const outfit = override ? 'player' : outfitOf(state, r);
    const key = override ? `player:${JSON.stringify(override)}` : `${r.id}:${outfit}:${r.age}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const appearance = override || r.appearance;
    const ch = createCharacter(appearance, outfit, { child: !override && r.age < 14, seed: override ? 7 : r.id });
    this.scene.add(ch.root);
    ch.root.updateMatrixWorld(true);
    const head = new THREE.Vector3();
    ch.head.getWorldPosition(head);
    head.y += 0.1 * ch.root.scale.y;
    this.camera.position.set(head.x + 0.25, head.y + 0.05, head.z + 1.15 * ch.root.scale.y);
    this.camera.lookAt(head.x, head.y - 0.02, head.z);
    const prev = this.renderer.getRenderTarget();
    const prevTone = this.renderer.toneMapping;
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(this.scene, this.camera);
    this.renderer.readRenderTargetPixels(this.target, 0, 0, SIZE, SIZE, this.pixels);
    this.renderer.setRenderTarget(prev);
    this.renderer.toneMapping = prevTone;
    this.scene.remove(ch.root);
    disposeCharacter(ch);
    const image = this.ctx.createImageData(SIZE, SIZE);
    for (let y = 0; y < SIZE; y++) {
      const src = (SIZE - 1 - y) * SIZE * 4;
      const dst = y * SIZE * 4;
      for (let i = 0; i < SIZE * 4; i += 4) {
        image.data[dst + i] = TO_SRGB[this.pixels[src + i]];
        image.data[dst + i + 1] = TO_SRGB[this.pixels[src + i + 1]];
        image.data[dst + i + 2] = TO_SRGB[this.pixels[src + i + 2]];
        image.data[dst + i + 3] = 255;
      }
    }
    this.ctx.putImageData(image, 0, 0);
    const url = this.canvas.toDataURL('image/png');
    this.cache.set(key, url);
    return url;
  }

  clear() {
    this.cache.clear();
  }
}
