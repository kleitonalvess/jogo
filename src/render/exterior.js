// O fundo do mar em volta da colônia: terreno, a torre iluminada, os
// destroços, a carcaça de baleia, a fenda com fontes termais, as ruínas da
// estação de pesquisa e o cabo que sobe para a superfície. Com fauna:
// cardumes, águas-vivas, isópodes e uma sombra grande que passa às vezes.

import * as THREE from 'three';

import { EXTERIOR, WORLD_ITEMS } from '../engine/world.js';
import { MATERIALS, MeshBuilder, meshFrom } from './geometry.js';

const SIZE = 420;
const SEG = 150;
export const BOUNDS = 205;

// ---------------------------------------------------------------------------
// Terreno

function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const s = (t) => t * t * (3 - 2 * t);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * s(xf) + (c - a) * s(yf) + (a - b - c + d) * s(xf) * s(yf);
}

function fbm(x, y) {
  let v = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < 4; i++) {
    v += valueNoise(x * f, y * f) * amp;
    f *= 2.03;
    amp *= 0.5;
  }
  return v;
}

const RIFT = { ax: -138, az: 30, bx: -40, bz: 86, width: 20, depth: 24 };

function riftDepth(x, z) {
  const dx = RIFT.bx - RIFT.ax;
  const dz = RIFT.bz - RIFT.az;
  const t = Math.max(0, Math.min(1, ((x - RIFT.ax) * dx + (z - RIFT.az) * dz) / (dx * dx + dz * dz)));
  const px = RIFT.ax + dx * t;
  const pz = RIFT.az + dz * t;
  const d = Math.hypot(x - px, z - pz);
  const edge = Math.max(0, 1 - d / RIFT.width);
  const ends = Math.min(1, t * 6, (1 - t) * 6);
  return edge * edge * (3 - 2 * edge) * RIFT.depth * ends;
}

export function groundHeight(x, z) {
  let h = (fbm(x * 0.012, z * 0.012) - 0.5) * 9 + (fbm(x * 0.05 + 40, z * 0.05) - 0.5) * 1.6;
  // Planalto onde a colônia está apoiada.
  const r = Math.hypot(x, z);
  const flat = Math.max(0, 1 - Math.max(0, r - 24) / 30);
  h = h * (1 - flat);
  // Elevação onde fica o cabo.
  const rc = Math.hypot(x - EXTERIOR.regions.cable.x, z - EXTERIOR.regions.cable.z);
  h += Math.max(0, 1 - rc / 40) * 5;
  h -= riftDepth(x, z);
  // Borda do mundo: paredões que fecham a área.
  const edge = Math.max(0, r - (BOUNDS - 25));
  h += edge * edge * 0.06;
  return h;
}

function terrainColor(x, z, h) {
  const rift = riftDepth(x, z);
  const vents = rift > 12 ? Math.min(1, (rift - 12) / 10) : 0;
  const n = fbm(x * 0.08, z * 0.08);
  const base = new THREE.Color('#55665f').lerp(new THREE.Color('#7a7a66'), n);
  if (rift > 2) base.lerp(new THREE.Color('#1e2629'), Math.min(1, rift / 14));
  if (vents > 0) base.lerp(new THREE.Color('#4a2a1e'), vents * 0.6);
  if (h > 3) base.lerp(new THREE.Color('#6a6a5c'), Math.min(1, (h - 3) / 6) * 0.5);
  return base;
}

function buildTerrain() {
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = groundHeight(x, z);
    pos.setY(i, h);
    const c = terrainColor(x, z, h);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true });
  return new THREE.Mesh(geo, mat);
}

// ---------------------------------------------------------------------------
// Construções e marcos

function buildTower(b, glow) {
  const R = EXTERIOR.tower.radius;
  // A torre: um cilindro com anéis nos níveis e janelas acesas.
  b.cylinder(0, -2, 0, R + 2, 6, '#3a4448');
  b.cylinder(0, 0, 0, R, 240, '#46555a');
  for (let level = 0; level < 6; level++) {
    const y = 380 - (160 + level * 40);
    b.cylinder(0, y - 0.5, 0, R + 0.6, 1.2, '#2e383c');
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      if (k % 3 === 0) continue;
      glow.add('box', { x: Math.cos(a) * (R + 0.05), y: y + 2.4, z: Math.sin(a) * (R + 0.05), sx: 0.1, sy: 0.6, sz: 0.9, ry: -a }, k % 5 ? '#ffd29a' : '#9fe0e8');
    }
  }
  // Poço do elevador da eclusa, no lado norte.
  b.box(0, 0, -R - 1.2, 4, 228, 3, '#3c4a4f');
  b.box(0, 0, -R - 2.8, 3.2, 3.4, 0.4, '#2a3236');
  glow.box(0, 3.5, -R - 3.05, 2.4, 0.15, 0.05, '#ff6a3a');
  glow.box(-1.3, 0.2, -R - 3.05, 0.1, 3, 0.05, '#e9b45a');
  glow.box(1.3, 0.2, -R - 3.05, 0.1, 3, 0.05, '#e9b45a');
  // Âncoras e cabos de sustentação
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    const x = Math.cos(a) * (R + 10);
    const z = Math.sin(a) * (R + 10);
    b.box(x, -1, z, 3, 2, 3, '#33393b', -a);
    b.add('cyl8', { x: Math.cos(a) * (R + 5), y: 12, z: Math.sin(a) * (R + 5), sx: 0.25, sy: 26, sz: 0.25, rz: Math.cos(a) * 0.35, rx: -Math.sin(a) * 0.35 }, '#55605f');
  }
}

function buildWreck(b, glow) {
  const { x, z } = EXTERIOR.regions.wreck;
  // Submarino de abastecimento partido ao meio.
  const ang = 0.6;
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  for (let i = -5; i <= 5; i++) {
    if (i === 1) continue;
    const px = x + ca * i * 3 - 8;
    const pz = z + sa * i * 3 + 4;
    const tilt = i > 1 ? 0.25 : 0;
    b.add('cyl', { x: px, y: groundHeight(px, pz) + 2.2, z: pz, sx: 5 - Math.abs(i) * 0.25, sy: 3.1, sz: 5 - Math.abs(i) * 0.25, rz: Math.PI / 2, ry: -ang, rx: tilt }, i % 2 ? '#5a4a3a' : '#634f3c');
  }
  b.box(x - 8, groundHeight(x - 8, z + 4) + 3.8, z + 4, 3, 3, 2, '#5c4b3a', -ang);
  b.box(x - 8, groundHeight(x - 8, z + 4) + 6.6, z + 4, 0.3, 2.2, 0.3, '#3a3028', -ang);
  glow.sphere(x - 9.5, groundHeight(x - 9.5, z + 3) + 3.2, z + 3, 0.18, '#7ad6d0');
  // Destroços espalhados
  for (let i = 0; i < 26; i++) {
    const a = i * 2.4;
    const d = 6 + (i * 37) % 26;
    const px = x + Math.cos(a) * d;
    const pz = z + Math.sin(a) * d;
    const h = groundHeight(px, pz);
    if (i % 3 === 0) b.add('cyl8', { x: px, y: h + 0.4, z: pz, sx: 1.2, sy: 2.5, sz: 1.2, rz: Math.PI / 2, ry: a }, '#6a5a48');
    else b.box(px, h - 0.2, pz, 1 + (i % 4) * 0.6, 0.6 + (i % 3) * 0.5, 1 + (i % 2), i % 2 ? '#4f4a44' : '#5e4e40', a);
  }
  // A boia meteorológica caída
  const buoy = WORLD_ITEMS.find((w) => w.id === 'buoy');
  const bh = groundHeight(buoy.x, buoy.z);
  b.add('cyl', { x: buoy.x, y: bh + 0.8, z: buoy.z, sx: 1.6, sy: 3.6, sz: 1.6, rz: Math.PI / 2 - 0.25, ry: 0.4 }, '#c9a640');
  b.add('cone', { x: buoy.x + 2.2, y: bh + 1.2, z: buoy.z - 0.9, sx: 1.2, sy: 1.6, sz: 1.2, rz: -Math.PI / 2 + 0.2, ry: 0.4 }, '#c9a640');
  b.box(buoy.x - 0.4, bh + 1.4, buoy.z, 0.5, 2.5, 0.12, '#3a3028', 0.4);
}

function buildWhale(b) {
  const { x, z } = EXTERIOR.regions.whale;
  const h = groundHeight(x, z);
  // Coluna vertebral e costelas de uma baleia que caiu há décadas.
  for (let i = 0; i < 18; i++) {
    const px = x - 14 + i * 1.6;
    const pz = z + Math.sin(i * 0.3) * 1.2;
    b.sphere(px, h + 0.6, pz, 0.45 - Math.abs(i - 7) * 0.012, '#d8d2c0', true);
    if (i > 2 && i < 13) {
      for (const side of [-1, 1]) {
        for (let k = 0; k < 5; k++) {
          const t = k / 4;
          const rib = 3.4 - Math.abs(i - 7) * 0.2;
          b.add('cyl8', { x: px, y: h + 0.6 + Math.sin(t * Math.PI * 0.85) * rib * 0.9, z: pz + side * Math.cos(t * Math.PI * 0.6) * rib * 0.6 * (0.4 + t), sx: 0.18, sy: 1.0, sz: 0.18, rx: side * (0.6 - t * 1.4) }, '#cfc8b4');
        }
      }
    }
  }
  b.add('sphere', { x: x - 16.5, y: h + 0.9, z, sx: 4.2, sy: 1.8, sz: 3 }, '#d6cfbc');
}

function buildRuins(b, glow) {
  const { x, z } = EXTERIOR.regions.ruins;
  const h = groundHeight(x, z);
  // Estação de pesquisa da fundação: domo partido e laboratório.
  b.add('sphere', { x, y: h, z, sx: 16, sy: 9, sz: 16 }, '#4b5559');
  b.box(x - 3, h, z - 9, 6, 3, 1, '#3c4448');
  b.box(x + 6, h, z + 4, 7, 2.6, 5, '#555f60');
  b.box(x + 6, h + 2.6, z + 4, 7.4, 0.3, 5.4, '#3c4448');
  for (let i = 0; i < 5; i++) b.box(x + 3 + i * 1.4, h + 0.4, z + 6.4, 0.9, 0.9, 0.9, '#6b7578', i * 0.4);
  glow.box(x + 2.6, h + 1.8, z + 4, 0.05, 0.5, 0.8, '#3ad07a');
  // Estufa de sementes tombada
  b.box(x - 7, h, z + 9, 3, 1.4, 2, '#7a8a8a', 0.5);
}

function buildRift(b, glow, vents) {
  // Fontes termais: chaminés com brilho no topo.
  const spots = [
    [-108, 52],
    [-90, 66],
    [-70, 74],
    [-122, 40],
    [-80, 56],
    [-58, 80],
  ];
  for (const [x, z] of spots) {
    const h = groundHeight(x, z);
    const tall = 3 + ((x * 7 + z) % 3);
    b.add('cone', { x, y: h + tall / 2, z, sx: 2.4, sy: tall, sz: 2.4 }, '#2e2420');
    b.add('cyl8', { x, y: h + tall * 0.75, z, sx: 1.2, sy: tall * 0.6, sz: 1.2 }, '#3a2c24');
    glow.sphere(x, h + tall + 0.1, z, 0.45, '#ff7a33');
    vents.push({ x, z, y: h + tall + 0.2 });
    // Vermes tubulares em volta
    for (let k = 0; k < 8; k++) {
      const a = k * 0.8;
      const px = x + Math.cos(a) * 2.2;
      const pz = z + Math.sin(a) * 2.2;
      const ph = groundHeight(px, pz);
      b.add('cyl8', { x: px, y: ph + 0.5, z: pz, sx: 0.12, sy: 1, sz: 0.12 }, '#e8e2d0');
      glow.sphere(px, ph + 1.05, pz, 0.1, '#e8463a');
    }
  }
  // Sondas abandonadas no fundo da fenda.
  const probe = WORLD_ITEMS.find((w) => w.id === 'zenith');
  const ph = groundHeight(probe.x, probe.z);
  b.add('cyl', { x: probe.x, y: ph + 0.8, z: probe.z, sx: 1.4, sy: 2.6, sz: 1.4, rz: 1.2, ry: 0.8 }, '#8a8f8c');
  b.add('cyl8', { x: probe.x + 0.4, y: ph + 2.2, z: probe.z, sx: 0.06, sy: 2.6, sz: 0.06, rz: 0.3 }, '#c0c4c0');
  glow.sphere(probe.x - 0.6, ph + 1.0, probe.z + 0.3, 0.12, '#ff4a3a');
}

function buildCable(b, glow) {
  const { x, z } = EXTERIOR.regions.cable;
  const h = groundHeight(x, z);
  b.box(x, h - 0.5, z, 4, 2.2, 4, '#3a4246');
  b.cylinder(x, h + 1.5, z, 0.32, 420, '#2c2c28');
  for (let y = 4; y < 300; y += 6) b.torus(x, h + y, z, 0.42, '#6a5a3a', Math.PI / 2);
  // Caixa de retransmissão no alto do cabo.
  const top = h + EXTERIOR.cableHeight;
  b.box(x + 0.5, top - 0.6, z, 1.2, 1.4, 1.0, '#c9a640');
  glow.sphere(x + 1.15, top + 0.5, z, 0.12, '#ff3a2a');
  b.box(x - 2, h + 0.7, z + 1.5, 2.2, 0.6, 0.15, '#c9a640');
}

function buildAirCache(b, glow, cache) {
  const h = groundHeight(cache.x, cache.z);
  b.box(cache.x, h, cache.z, 1.2, 0.3, 1.2, '#3a4246');
  b.cylinder(cache.x - 0.25, h + 0.3, cache.z, 0.22, 1.4, '#c9c2a8');
  b.cylinder(cache.x + 0.25, h + 0.3, cache.z, 0.22, 1.4, '#c9c2a8');
  glow.box(cache.x, h + 1.8, cache.z, 0.3, 0.3, 0.3, '#5fd0c8');
}

// ---------------------------------------------------------------------------

export class ExteriorView {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#020b10');
    this.scene.fog = new THREE.FogExp2('#03131a', 0.026);
    this.scene.add(new THREE.AmbientLight('#3d6b7a', 1.15));
    this.scene.add(new THREE.HemisphereLight('#3a7f96', '#0a0c0e', 1.1));
    this.scene.add(buildTerrain());
    const b = new MeshBuilder();
    const glow = new MeshBuilder();
    this.vents = [];
    buildTower(b, glow);
    buildWreck(b, glow);
    buildWhale(b);
    buildRuins(b, glow);
    buildRift(b, glow, this.vents);
    buildCable(b, glow);
    for (const cache of EXTERIOR.airCaches) buildAirCache(b, glow, cache);
    this.scene.add(meshFrom(b, MATERIALS.solid));
    this.scene.add(meshFrom(glow, MATERIALS.glow));
    this.obstacles = this.buildObstacles();
    // Luz da eclusa e das fontes
    const airlockLight = new THREE.PointLight('#ffb070', 30, 26, 1.5);
    airlockLight.position.set(0, 4, -EXTERIOR.tower.radius - 5);
    this.scene.add(airlockLight);
    for (const v of this.vents.slice(0, 3)) {
      const light = new THREE.PointLight('#ff6a2a', 24, 18, 1.5);
      light.position.set(v.x, v.y + 1.5, v.z);
      this.scene.add(light);
    }
    this.items = new Map();
    this.itemGroup = new THREE.Group();
    this.scene.add(this.itemGroup);
    this.beacons = buildBeacons();
    this.scene.add(this.beacons);
    this.snow = buildSnow();
    this.scene.add(this.snow);
    this.fauna = new Fauna(this.scene);
    this.plumes = buildPlumes(this.vents);
    this.scene.add(this.plumes);
  }

  buildObstacles() {
    const R = EXTERIOR.tower.radius;
    const out = [{ x: 0, z: 0, r: R + 0.5, top: 999 }];
    const { x, z } = EXTERIOR.regions.wreck;
    for (let i = -5; i <= 5; i++) {
      if (i === 1) continue;
      out.push({ x: x + Math.cos(0.6) * i * 3 - 8, z: z + Math.sin(0.6) * i * 3 + 4, r: 2.2, top: groundHeight(x, z) + 4.2 });
    }
    const ru = EXTERIOR.regions.ruins;
    out.push({ x: ru.x, z: ru.z, r: 7.4, top: groundHeight(ru.x, ru.z) + 4.4 });
    for (const v of this.vents) out.push({ x: v.x, z: v.z, r: 1.1, top: v.y });
    const c = EXTERIOR.regions.cable;
    out.push({ x: c.x, z: c.z, r: 2.2, top: groundHeight(c.x, c.z) + 1.7 });
    return out;
  }

  // Mostra só o que ainda pode ser apanhado.
  syncItems(available) {
    const ids = new Set(available.map((w) => w.id));
    for (const [id, obj] of this.items) {
      if (!ids.has(id)) {
        this.itemGroup.remove(obj);
        this.items.delete(id);
      }
    }
    for (const w of available) {
      if (this.items.has(w.id)) continue;
      const obj = buildItem(w);
      this.items.set(w.id, obj);
      this.itemGroup.add(obj);
    }
  }

  update(dt, time, playerPos) {
    const pos = this.snow.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) - dt * 0.35;
      let x = pos.getX(i);
      let z = pos.getZ(i);
      if (y < playerPos.y - 6) y += 22;
      if (x < playerPos.x - 25) x += 50;
      if (x > playerPos.x + 25) x -= 50;
      if (z < playerPos.z - 25) z += 50;
      if (z > playerPos.z + 25) z -= 50;
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
    for (const obj of this.items.values()) {
      obj.rotation.y += dt * 0.8;
      if (obj.userData.halo) obj.userData.halo.material.opacity = 0.35 + Math.sin(time * 3 + obj.position.x) * 0.2;
    }
    const pp = this.plumes.geometry.attributes.position;
    for (let i = 0; i < pp.count; i++) {
      const base = this.plumes.userData.bases[i % this.vents.length];
      let y = pp.getY(i) + dt * (1.2 + (i % 7) * 0.2);
      if (y > base.y + 9) y = base.y;
      pp.setXYZ(i, base.x + Math.sin(y * 1.3 + i) * 0.4, y, base.z + Math.cos(y * 1.1 + i) * 0.4);
    }
    pp.needsUpdate = true;
    this.fauna.update(dt, time, playerPos);
    for (const sprite of this.beacons.children) {
      if (!sprite.isSprite) continue;
      const blink = 0.55 + 0.45 * Math.max(0, Math.sin(time * 2.2 + sprite.userData.phase));
      sprite.material.opacity = blink;
    }
  }
}

// Balizas da fundação: luzes em postes que se veem de longe, mesmo na
// água turva. Ajudam a achar o caminho de volta.
const BEACON_COLORS = { airlock: '#ffb060', wreck: '#ffd85a', whale: '#e8e0c8', rift: '#ff6a4a', cable: '#bfe8ff', ruins: '#7fe0a0' };

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function buildBeacons() {
  const group = new THREE.Group();
  const tex = glowTexture();
  const spots = [{ key: 'airlock', x: EXTERIOR.airlock.x + 4, z: EXTERIOR.airlock.z }];
  for (const [key, reg] of Object.entries(EXTERIOR.regions)) {
    if (key === 'vents') continue;
    spots.push({ key, x: reg.x - Math.sign(reg.x || 1) * Math.min(10, reg.r * 0.5), z: reg.z - Math.sign(reg.z || 1) * Math.min(10, reg.r * 0.5) });
  }
  const b = new MeshBuilder();
  for (const s of spots) {
    const h = groundHeight(s.x, s.z);
    b.cylinder(s.x, h, s.z, 0.08, 6, '#3a4246', true);
    b.box(s.x, h - 0.2, s.z, 0.8, 0.4, 0.8, '#2c3236');
    const color = BEACON_COLORS[s.key] || '#ffffff';
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sprite.position.set(s.x, h + 6.3, s.z);
    sprite.scale.setScalar(3.2);
    sprite.userData.phase = s.x * 0.1;
    group.add(sprite);
  }
  group.add(meshFrom(b, MATERIALS.solid));
  return group;
}

function buildSnow() {
  const n = 1400;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = (Math.random() - 0.5) * 50;
    arr[i * 3 + 1] = Math.random() * 22 - 4;
    arr[i * 3 + 2] = (Math.random() - 0.5) * 50 - 26;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const mat = new THREE.PointsMaterial({ color: '#cfe3df', size: 0.07, transparent: true, opacity: 0.55, depthWrite: false });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return points;
}

function buildPlumes(vents) {
  const per = 24;
  const arr = new Float32Array(vents.length * per * 3);
  const bases = vents.map((v) => ({ x: v.x, y: v.y, z: v.z }));
  for (let i = 0; i < vents.length * per; i++) {
    const v = bases[i % vents.length];
    arr[i * 3] = v.x;
    arr[i * 3 + 1] = v.y + Math.random() * 9;
    arr[i * 3 + 2] = v.z;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#9a8a7a', size: 0.5, transparent: true, opacity: 0.25, depthWrite: false }));
  points.userData.bases = bases;
  points.frustumCulled = false;
  return points;
}

function buildItem(w) {
  const g = new THREE.Group();
  const b = new MeshBuilder();
  const glow = new MeshBuilder();
  const kind = w.kind;
  if (kind === 'scrap') {
    for (let i = 0; i < 5; i++) b.box(Math.cos(i * 2) * 0.4, 0, Math.sin(i * 2) * 0.4, 0.5, 0.3 + (i % 3) * 0.15, 0.4, i % 2 ? '#7a6a58' : '#6a7378', i);
    b.cylinder(0, 0.1, 0, 0.12, 0.8, '#8a6142', true, 0, 1.2);
  } else if (kind === 'algae') {
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05;
      b.add('cyl8', { x: Math.cos(a) * 0.25, y: 0.35, z: Math.sin(a) * 0.25, sx: 0.08, sy: 0.7, sz: 0.08, rx: Math.sin(a) * 0.3 }, '#9a2a2a');
      glow.sphere(Math.cos(a) * 0.3, 0.75, Math.sin(a) * 0.3, 0.09, '#ff4a5a');
    }
  } else if (kind === 'relic' || kind === 'tag') {
    b.box(0, 0, 0, 0.35, 0.18, 0.25, kind === 'tag' ? '#a8b0b0' : '#b58a4a');
    glow.sphere(0, 0.25, 0, 0.07, '#ffe9a0');
  } else if (kind === 'buoy' || kind === 'probe') {
    glow.box(0, 1.6, 0, 0.6, 0.4, 0.1, '#ffd060');
  }
  if (!b.empty) g.add(meshFrom(b, MATERIALS.solid));
  if (!glow.empty) g.add(meshFrom(glow, MATERIALS.glow));
  // Halo que pulsa para chamar atenção de longe.
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.62, 24),
    new THREE.MeshBasicMaterial({ color: kind === 'scrap' ? '#9fd0d0' : kind === 'algae' ? '#ff7a7a' : '#ffd36a', transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }),
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.05;
  g.add(halo);
  g.userData.halo = halo;
  const y = w.h !== undefined ? groundHeight(w.x, w.z) + w.h : groundHeight(w.x, w.z);
  g.position.set(w.x, y, w.z);
  g.userData.worldItem = w.id;
  return g;
}

// ---------------------------------------------------------------------------
// Fauna

class Fauna {
  constructor(scene) {
    this.time = 0;
    // Cardume de peixes-lanterna perto dos destroços.
    const fishGeo = new THREE.ConeGeometry(0.08, 0.38, 4);
    fishGeo.rotateX(Math.PI / 2);
    this.fish = new THREE.InstancedMesh(fishGeo, new THREE.MeshBasicMaterial({ color: '#9ad8e0' }), 60);
    this.fish.frustumCulled = false;
    this.fishState = Array.from({ length: 60 }, (_, i) => ({ phase: i * 0.37, r: 2 + (i % 7) * 0.5, h: (i % 5) * 0.6 }));
    this.school = { x: 60, z: -60, y: 6 };
    scene.add(this.fish);
    // Águas-vivas luminosas sobre a fenda.
    this.jellies = [];
    const jellyGeo = new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(jellyGeo, new THREE.MeshBasicMaterial({ color: i % 2 ? '#c88cff' : '#7ae0ff', transparent: true, opacity: 0.55, depthWrite: false }));
      const base = { x: -100 + i * 7, z: 50 + (i % 3) * 9, y: 4 + (i % 4) * 2 };
      m.position.set(base.x, groundHeight(base.x, base.z) + base.y, base.z);
      m.userData.base = { ...base, ground: groundHeight(base.x, base.z) };
      scene.add(m);
      this.jellies.push(m);
    }
    // Isópodes gigantes rondando a baleia.
    this.isopods = [];
    for (let i = 0; i < 4; i++) {
      const b = new MeshBuilder();
      for (let k = 0; k < 6; k++) b.add('sphereLow', { x: 0, y: 0.18, z: k * 0.22 - 0.55, sx: 0.55 - Math.abs(k - 2.5) * 0.05, sy: 0.3, sz: 0.3 }, k % 2 ? '#b8a890' : '#a89880');
      const m = new THREE.Mesh(b.build(), MATERIALS.solid);
      m.userData.phase = i * 1.7;
      scene.add(m);
      this.isopods.push(m);
    }
    // A sombra grande que passa de tempos em tempos.
    const sb = new MeshBuilder();
    sb.add('sphere', { x: 0, y: 0, z: 0, sx: 7, sy: 4, sz: 26 }, '#010608');
    sb.add('cone', { x: 0, y: 0, z: -16, sx: 4, sy: 9, sz: 2, rx: -Math.PI / 2 }, '#010608');
    sb.add('box', { x: 0, y: 0, z: -20, sx: 12, sy: 0.4, sz: 3 }, '#010608');
    sb.add('box', { x: 5, y: -0.8, z: 4, sx: 7, sy: 0.3, sz: 2.4, ry: 0.5 }, '#010608');
    sb.add('box', { x: -5, y: -0.8, z: 4, sx: 7, sy: 0.3, sz: 2.4, ry: -0.5 }, '#010608');
    this.shadow = new THREE.Mesh(sb.build(), new THREE.MeshBasicMaterial({ color: '#02090c', transparent: true, opacity: 0.55, depthWrite: false }));
    this.shadow.visible = false;
    this.shadowTime = 40;
    scene.add(this.shadow);
    this.tmp = new THREE.Object3D();
  }

  update(dt, time, player) {
    this.time += dt;
    const t = this.time;
    // Cardume vagueia e foge do jogador.
    this.school.x = 60 + Math.sin(t * 0.05) * 40;
    this.school.z = -60 + Math.cos(t * 0.04) * 30;
    const dpx = this.school.x - player.x;
    const dpz = this.school.z - player.z;
    const dp = Math.hypot(dpx, dpz);
    if (dp < 8) {
      this.school.x += (dpx / dp) * dt * 6;
      this.school.z += (dpz / dp) * dt * 6;
    }
    const gy = groundHeight(this.school.x, this.school.z);
    this.fishState.forEach((f, i) => {
      const a = t * 0.8 + f.phase;
      this.tmp.position.set(this.school.x + Math.cos(a) * f.r, gy + this.school.y + f.h + Math.sin(a * 2) * 0.3, this.school.z + Math.sin(a) * f.r);
      this.tmp.rotation.set(0, -a, 0);
      this.tmp.updateMatrix();
      this.fish.setMatrixAt(i, this.tmp.matrix);
    });
    this.fish.instanceMatrix.needsUpdate = true;
    for (const j of this.jellies) {
      const b = j.userData.base;
      j.position.y = b.ground + b.y + Math.sin(t * 0.6 + b.x) * 0.8;
      j.position.x = b.x + Math.sin(t * 0.1 + b.z) * 3;
      j.scale.y = 1 + Math.sin(t * 2 + b.x) * 0.15;
    }
    for (const m of this.isopods) {
      const a = t * 0.05 + m.userData.phase;
      const x = -90 + Math.cos(a) * (12 + m.userData.phase);
      const z = -62 + Math.sin(a) * 8;
      m.position.set(x, groundHeight(x, z), z);
      m.rotation.y = -a;
    }
    this.shadowTime -= dt;
    if (this.shadowTime <= 0 && !this.shadow.visible) {
      this.shadow.visible = true;
      this.shadow.userData.t = 0;
      this.shadow.userData.angle = Math.random() * Math.PI * 2;
    }
    if (this.shadow.visible) {
      const s = this.shadow.userData;
      s.t += dt;
      const d = -80 + s.t * 6;
      this.shadow.position.set(player.x + Math.cos(s.angle) * d, player.y + 32, player.z + Math.sin(s.angle) * d);
      this.shadow.rotation.y = -s.angle + Math.PI / 2;
      if (d > 80) {
        this.shadow.visible = false;
        this.shadowTime = 90 + Math.random() * 80;
      }
    }
  }

  stingAt(pos) {
    return this.jellies.some((j) => j.position.distanceTo(pos) < 1.3);
  }
}
