// Personagens procedurais: cada morador tem corpo, rosto, cabelo, barba,
// acessórios e uniforme montados a partir da sua aparência. Animação por
// código (andar, correr, sentar, deitar, trabalhar, falar, acenar).

import * as THREE from 'three';

import { HAIR_COLORS, SKIN_TONES } from '../engine/people/cast.js';
import { MATERIALS, MeshBuilder } from './geometry.js';

export const OUTFITS = {
  council: { suit: '#25334a', trim: '#b58a4a', pants: '#1b2230' },
  guard: { suit: '#3b4246', trim: '#a8382f', pants: '#2a2f32', armband: '#a8382f' },
  cook: { suit: '#7a7466', trim: '#e8e2d0', pants: '#4b4840', apron: '#e8e2d0' },
  archive: { suit: '#5b4636', trim: '#c8b48a', pants: '#3a3028' },
  diver: { suit: '#3d5c6a', trim: '#b58a4a', pants: '#2c4450' },
  life: { suit: '#2f7f86', trim: '#9fd3d6', pants: '#24555a' },
  energy: { suit: '#b58a2a', trim: '#2a2a2a', pants: '#6d5418' },
  industry: { suit: '#8d4a2b', trim: '#d9a43a', pants: '#5a3320' },
  care: { suit: '#d8dcd8', trim: '#b5463c', pants: '#9aa3a3' },
  social: { suit: '#5d7d3d', trim: '#dfe4e1', pants: '#3e5429' },
  habitat: { suit: '#6d7478', trim: '#aebdc2', pants: '#474d50' },
  elder: { suit: '#6b5d52', trim: '#c8b48a', pants: '#463c35' },
  idle: { suit: '#5a6266', trim: '#7c868a', pants: '#3c4245' },
  player: { suit: '#1d2838', trim: '#e9b45a', pants: '#151c27' },
  suit: { suit: '#8a6a3c', trim: '#3a3a36', pants: '#6e5530' },
};

const CHILD_COLORS = ['#c9a640', '#a8423a', '#5b8a3a', '#3f6fa0', '#9a5ab0', '#d07a3a'];

function shade(hex, k) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
}

function partMesh(builder) {
  const mesh = new THREE.Mesh(builder.build(), MATERIALS.solid);
  mesh.castShadow = false;
  return mesh;
}

// Monta o corpo. Retorna a hierarquia com pivôs para animar.
export function createCharacter(appearance, outfitKey, { child = false, seed = 0, suit = false, glowMaterial = null } = {}) {
  const skin = SKIN_TONES[appearance.skin] || SKIN_TONES[2];
  const hairColor = HAIR_COLORS[appearance.hairColor] || HAIR_COLORS[0];
  let outfit = OUTFITS[suit ? 'suit' : outfitKey] || OUTFITS.idle;
  if (outfitKey === 'child' && !suit) {
    const c = CHILD_COLORS[seed % CHILD_COLORS.length];
    outfit = { suit: c, trim: '#f0e6d0', pants: shade(c, 0.6) };
  }
  const build = appearance.build || 1;
  const headScale = child ? 1.25 : 1;

  const root = new THREE.Group();
  const body = new THREE.Group(); // o que gira para sentar ou deitar
  root.add(body);
  const hips = new THREE.Group();
  hips.position.y = 0.95;
  body.add(hips);

  // Tronco, pescoço, cabeça (uma malha só).
  const torsoB = new MeshBuilder();
  const w = 0.36 * build;
  torsoB.box(0, 0, 0, w, 0.22, 0.22, outfit.pants);
  torsoB.add('box', { x: 0, y: 0.34, z: 0, sx: w * 1.02, sy: 0.3, sz: 0.24 }, outfit.suit);
  torsoB.add('box', { x: 0, y: 0.5, z: 0, sx: w * 1.12, sy: 0.12, sz: 0.25 }, outfit.suit);
  torsoB.add('box', { x: 0, y: 0.215, z: 0, sx: w * 1.04, sy: 0.04, sz: 0.25 }, '#2a2622');
  torsoB.add('box', { x: 0, y: 0.38, z: 0.122, sx: 0.04, sy: 0.3, sz: 0.01 }, outfit.trim);
  if (outfit.apron) torsoB.add('box', { x: 0, y: 0.18, z: 0.125, sx: w * 0.8, sy: 0.5, sz: 0.01 }, outfit.apron);
  if (outfitKey === 'council' || outfitKey === 'player') {
    torsoB.add('box', { x: -w * 0.3, y: 0.46, z: 0.124, sx: 0.06, sy: 0.04, sz: 0.01 }, '#e9b45a');
  }
  torsoB.add('cyl8', { x: 0, y: 0.6, z: 0, sx: 0.11, sy: 0.1, sz: 0.11 }, skin);
  const torso = partMesh(torsoB);
  hips.add(torso);

  const head = new THREE.Group();
  head.position.y = 0.66;
  hips.add(head);
  const headB = new MeshBuilder();
  const hr = 0.115 * headScale;
  if (suit) {
    headB.sphere(0, hr + 0.02, 0, 0.21, '#b58a4a');
    headB.add('disc', { x: 0, y: hr + 0.04, z: 0.205, sx: 0.22, sy: 0.22, sz: 1 }, '#123c4a');
    headB.torus(0, hr + 0.04, 0.2, 0.12, '#7a5a2a');
    headB.add('cyl', { x: 0, y: -0.02, z: 0, sx: 0.3, sy: 0.06, sz: 0.3 }, '#7a5a2a');
  } else {
    headB.sphere(0, hr, 0, hr, skin, false, 1.12);
    // Rosto
    headB.sphere(-hr * 0.38, hr * 1.08, hr * 0.86, hr * 0.13, '#1a1614', true);
    headB.sphere(hr * 0.38, hr * 1.08, hr * 0.86, hr * 0.13, '#1a1614', true);
    headB.add('box', { x: -hr * 0.38, y: hr * 1.32, z: hr * 0.88, sx: hr * 0.42, sy: hr * 0.09, sz: hr * 0.1 }, shade(hairColor, 0.9));
    headB.add('box', { x: hr * 0.38, y: hr * 1.32, z: hr * 0.88, sx: hr * 0.42, sy: hr * 0.09, sz: hr * 0.1 }, shade(hairColor, 0.9));
    headB.add('box', { x: 0, y: hr * 0.85, z: hr * 1.0, sx: hr * 0.18, sy: hr * 0.3, sz: hr * 0.2 }, shade(skin, 0.88));
    headB.add('box', { x: 0, y: hr * 0.5, z: hr * 0.93, sx: hr * 0.42, sy: hr * 0.06, sz: hr * 0.08 }, shade(skin, 0.62));
    headB.sphere(-hr * 0.98, hr * 0.95, 0, hr * 0.2, shade(skin, 0.95), true);
    headB.sphere(hr * 0.98, hr * 0.95, 0, hr * 0.2, shade(skin, 0.95), true);
    addHair(headB, appearance.hair, hairColor, hr);
    addBeard(headB, appearance.beard, hairColor, hr);
    addExtra(headB, appearance.extra, hr, seed);
  }
  const headMesh = partMesh(headB);
  head.add(headMesh);

  // Braços e pernas: pivô no ombro/quadril, segundo pivô no cotovelo/joelho.
  const limbs = {};
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * (w * 0.62 + 0.03), 0.52, 0);
    hips.add(shoulder);
    const upperB = new MeshBuilder();
    upperB.add('box', { x: 0, y: -0.14, z: 0, sx: 0.09, sy: 0.3, sz: 0.1 }, outfit.suit);
    if (outfit.armband && side < 0) upperB.add('box', { x: 0, y: -0.1, z: 0, sx: 0.1, sy: 0.06, sz: 0.11 }, outfit.armband);
    shoulder.add(partMesh(upperB));
    const elbow = new THREE.Group();
    elbow.position.y = -0.29;
    shoulder.add(elbow);
    const foreB = new MeshBuilder();
    foreB.add('box', { x: 0, y: -0.13, z: 0, sx: 0.085, sy: 0.26, sz: 0.09 }, suit ? outfit.suit : outfit.suit);
    foreB.sphere(0, -0.285, 0, 0.046, suit ? '#4a3a24' : skin, true);
    elbow.add(partMesh(foreB));

    const hip = new THREE.Group();
    hip.position.set(side * w * 0.26, 0, 0);
    hips.add(hip);
    const thighB = new MeshBuilder();
    thighB.add('box', { x: 0, y: -0.22, z: 0, sx: 0.13, sy: 0.45, sz: 0.14 }, outfit.pants);
    hip.add(partMesh(thighB));
    const knee = new THREE.Group();
    knee.position.y = -0.44;
    hip.add(knee);
    const shinB = new MeshBuilder();
    shinB.add('box', { x: 0, y: -0.22, z: 0, sx: 0.115, sy: 0.44, sz: 0.12 }, outfit.pants);
    shinB.add('box', { x: 0, y: -0.47, z: 0.04, sx: 0.12, sy: 0.08, sz: 0.24 }, suit ? '#4a3a24' : '#2a2420');
    knee.add(partMesh(shinB));
    limbs[side < 0 ? 'L' : 'R'] = { shoulder, elbow, hip, knee };
  }
  if (suit) {
    const tankB = new MeshBuilder();
    tankB.add('cyl', { x: -0.07, y: 0.34, z: -0.17, sx: 0.12, sy: 0.42, sz: 0.12 }, '#c9c2a8');
    tankB.add('cyl', { x: 0.07, y: 0.34, z: -0.17, sx: 0.12, sy: 0.42, sz: 0.12 }, '#c9c2a8');
    tankB.add('box', { x: 0, y: 0.34, z: -0.11, sx: 0.3, sy: 0.05, sz: 0.04 }, '#3a3a36');
    hips.add(partMesh(tankB));
  }

  const scale = appearance.height || 1;
  root.scale.setScalar(child ? scale * 1.2 : scale);
  if (child) root.scale.y = scale * 1.1;

  const character = { root, body, hips, head, limbs, phase: seed * 1.7, blend: 0, state: 'idle', talkTime: 0 };
  return character;
}

function addHair(b, style, color, r) {
  const dark = shade(color, 0.85);
  switch (style) {
    case 'raspado':
      b.add('sphere', { x: 0, y: r * 1.18, z: -r * 0.05, sx: r * 2.06, sy: r * 1.8, sz: r * 2.06, rx: 0 }, dark, (v) => (v.y > 0 ? 1 : 1));
      break;
    case 'careca':
      b.add('box', { x: -r * 0.92, y: r * 0.95, z: -r * 0.2, sx: r * 0.25, sy: r * 0.5, sz: r * 1.2 }, color);
      b.add('box', { x: r * 0.92, y: r * 0.95, z: -r * 0.2, sx: r * 0.25, sy: r * 0.5, sz: r * 1.2 }, color);
      b.add('box', { x: 0, y: r * 0.95, z: -r * 0.9, sx: r * 1.6, sy: r * 0.5, sz: r * 0.25 }, color);
      break;
    case 'cacheado':
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const ring = i % 2 ? 0.75 : 0.95;
        b.sphere(Math.cos(a) * r * ring, r * (1.45 + (i % 3) * 0.12), Math.sin(a) * r * ring - r * 0.1, r * 0.42, i % 2 ? color : dark, true);
      }
      b.sphere(0, r * 1.7, -r * 0.1, r * 0.55, color, true);
      break;
    case 'coque':
      b.add('sphere', { x: 0, y: r * 1.25, z: -r * 0.08, sx: r * 2.12, sy: r * 1.9, sz: r * 2.12 }, color);
      b.sphere(0, r * 2.05, -r * 0.55, r * 0.48, dark, true);
      break;
    case 'longo':
      b.add('sphere', { x: 0, y: r * 1.25, z: -r * 0.08, sx: r * 2.15, sy: r * 1.9, sz: r * 2.15 }, color);
      b.add('box', { x: 0, y: r * 0.2, z: -r * 0.75, sx: r * 1.9, sy: r * 2.2, sz: r * 0.5 }, color);
      break;
    case 'trancas':
      b.add('sphere', { x: 0, y: r * 1.25, z: -r * 0.08, sx: r * 2.12, sy: r * 1.9, sz: r * 2.12 }, color);
      for (const side of [-1, 1]) {
        for (let k = 0; k < 4; k++) b.sphere(side * r * 0.75, r * (0.75 - k * 0.42), -r * 0.45, r * 0.22, k % 2 ? color : dark, true);
      }
      break;
    case 'rabo':
      b.add('sphere', { x: 0, y: r * 1.25, z: -r * 0.08, sx: r * 2.12, sy: r * 1.9, sz: r * 2.12 }, color);
      b.add('cyl8', { x: 0, y: r * 0.9, z: -r * 1.25, sx: r * 0.45, sy: r * 1.6, sz: r * 0.45, rx: 0.5 }, dark);
      break;
    default:
      b.add('sphere', { x: 0, y: r * 1.28, z: -r * 0.06, sx: r * 2.12, sy: r * 1.75, sz: r * 2.12 }, color);
  }
}

function addBeard(b, style, color, r) {
  if (style === 'curta') b.add('box', { x: 0, y: r * 0.45, z: r * 0.62, sx: r * 1.5, sy: r * 0.7, sz: r * 0.7 }, color);
  if (style === 'cheia') b.add('sphere', { x: 0, y: r * 0.4, z: r * 0.5, sx: r * 1.8, sy: r * 1.3, sz: r * 1.2 }, color);
  if (style === 'bigode') b.add('box', { x: 0, y: r * 0.68, z: r * 0.98, sx: r * 0.75, sy: r * 0.14, sz: r * 0.12 }, color);
}

function addExtra(b, extra, r, seed) {
  const colors = ['#a8423a', '#3f6fa0', '#5b8a3a', '#c9a640', '#6b4f7a'];
  const c = colors[seed % colors.length];
  if (extra === 'oculos') {
    b.add('torus', { x: -r * 0.38, y: r * 1.08, z: r * 0.97, sx: r * 0.55, sy: r * 0.5, sz: r * 0.55 }, '#2a2a2a');
    b.add('torus', { x: r * 0.38, y: r * 1.08, z: r * 0.97, sx: r * 0.55, sy: r * 0.5, sz: r * 0.55 }, '#2a2a2a');
    b.add('box', { x: 0, y: r * 1.1, z: r * 1.0, sx: r * 0.2, sy: r * 0.05, sz: r * 0.05 }, '#2a2a2a');
  }
  if (extra === 'oculos-protecao') {
    b.add('box', { x: 0, y: r * 1.6, z: 0, sx: r * 2.1, sy: r * 0.22, sz: r * 2.1 }, '#3a2a1a');
    b.add('cyl8', { x: -r * 0.4, y: r * 1.62, z: r * 0.98, sx: r * 0.55, sy: r * 0.25, sz: r * 0.55, rx: Math.PI / 2 }, '#7a6a3a');
    b.add('cyl8', { x: r * 0.4, y: r * 1.62, z: r * 0.98, sx: r * 0.55, sy: r * 0.25, sz: r * 0.55, rx: Math.PI / 2 }, '#7a6a3a');
  }
  if (extra === 'lenco') b.add('sphere', { x: 0, y: r * 1.32, z: -r * 0.1, sx: r * 2.2, sy: r * 1.7, sz: r * 2.2 }, c);
  if (extra === 'gorro') {
    b.add('sphere', { x: 0, y: r * 1.4, z: -r * 0.05, sx: r * 2.2, sy: r * 1.7, sz: r * 2.2 }, c);
    b.add('box', { x: 0, y: r * 1.12, z: 0, sx: r * 2.25, sy: r * 0.3, sz: r * 2.25 }, shade(c, 0.8));
  }
  if (extra === 'cachecol') b.add('cyl8', { x: 0, y: -r * 0.15, z: 0, sx: r * 2.0, sy: r * 0.5, sz: r * 2.0 }, c);
}

// ---------------------------------------------------------------------------
// Animação

const lerp = (a, b, t) => a + (b - a) * t;

function setLimb(limb, s, e, h, k, t) {
  limb.shoulder.rotation.x = lerp(limb.shoulder.rotation.x, s, t);
  limb.elbow.rotation.x = lerp(limb.elbow.rotation.x, e, t);
  limb.hip.rotation.x = lerp(limb.hip.rotation.x, h, t);
  limb.knee.rotation.x = lerp(limb.knee.rotation.x, k, t);
}

// state: idle | walk | run | sit | lie | work | talk | wave | swim
export function animateCharacter(ch, dt, state, speed = 0) {
  ch.phase += dt * (state === 'run' ? 11 : state === 'walk' ? 7.5 : state === 'swim' ? 3 : 2);
  const t = Math.min(1, dt * 10);
  const p = ch.phase;
  const { L, R } = ch.limbs;
  let hipsY = 0.95;
  let bodyRx = 0;
  let headRx = 0;
  let headRy = 0;
  switch (state) {
    case 'walk':
    case 'run': {
      const amp = state === 'run' ? 0.85 : 0.5;
      setLimb(L, Math.sin(p) * amp, -0.3 - (state === 'run' ? 0.9 : 0.2), -Math.sin(p) * amp, Math.max(0, Math.sin(p + 1.6)) * amp * 1.2, t);
      setLimb(R, -Math.sin(p) * amp, -0.3 - (state === 'run' ? 0.9 : 0.2), Math.sin(p) * amp, Math.max(0, Math.sin(p - 1.5)) * amp * 1.2, t);
      hipsY = 0.95 + Math.abs(Math.sin(p)) * (state === 'run' ? 0.05 : 0.025);
      bodyRx = state === 'run' ? 0.12 : 0.03;
      break;
    }
    case 'swim': {
      setLimb(L, -0.6 + Math.sin(p) * 0.3, -0.4, 0.2 + Math.sin(p) * 0.25, 0.4, t);
      setLimb(R, -0.6 - Math.sin(p) * 0.3, -0.4, 0.2 - Math.sin(p) * 0.25, 0.4, t);
      bodyRx = 0.25;
      break;
    }
    case 'sit':
      setLimb(L, -0.25, -0.6, -1.5, 1.5, t);
      setLimb(R, -0.2, -0.7, -1.5, 1.5, t);
      hipsY = 0.5;
      headRx = Math.sin(p * 0.4) * 0.05;
      break;
    case 'lie':
      setLimb(L, -0.1, -0.2, 0, 0.05, t);
      setLimb(R, -0.1, -0.2, 0, 0.05, t);
      break;
    case 'work': {
      const k = Math.sin(p * 3);
      setLimb(L, -1.0 + k * 0.25, -0.8, 0, 0, t);
      setLimb(R, -1.1 - k * 0.25, -0.7, 0, 0, t);
      headRx = 0.25;
      break;
    }
    case 'talk': {
      ch.talkTime += dt;
      const k = Math.sin(ch.talkTime * 3.3);
      setLimb(L, -0.15 + Math.max(0, k) * 0.5, -0.9 - Math.max(0, k) * 0.4, 0, 0, t);
      setLimb(R, -0.1 + Math.max(0, -k) * 0.4, -0.5, 0, 0, t);
      headRy = Math.sin(ch.talkTime * 1.3) * 0.12;
      headRx = Math.sin(ch.talkTime * 2.1) * 0.05;
      break;
    }
    case 'wave': {
      setLimb(L, 0, -0.1, 0, 0, t);
      setLimb(R, -2.6, -0.3 + Math.sin(p * 4) * 0.4, 0, 0, t);
      break;
    }
    default: {
      setLimb(L, 0.05 + Math.sin(p) * 0.03, -0.15, 0, 0, t);
      setLimb(R, 0.05 - Math.sin(p) * 0.03, -0.15, 0, 0, t);
      headRy = Math.sin(p * 0.35) * 0.25;
    }
  }
  ch.limbs.L.shoulder.rotation.z = lerp(ch.limbs.L.shoulder.rotation.z, state === 'lie' ? 0 : 0.06, t);
  ch.limbs.R.shoulder.rotation.z = lerp(ch.limbs.R.shoulder.rotation.z, state === 'lie' ? 0 : -0.06, t);
  ch.hips.position.y = lerp(ch.hips.position.y, hipsY, t);
  ch.hips.rotation.x = lerp(ch.hips.rotation.x, bodyRx, t);
  ch.head.rotation.x = lerp(ch.head.rotation.x, headRx, t);
  ch.head.rotation.y = lerp(ch.head.rotation.y, headRy, t);
  // Deitar: o corpo inteiro gira para a horizontal.
  const lying = state === 'lie';
  ch.body.rotation.x = lerp(ch.body.rotation.x, lying ? -Math.PI / 2 : 0, t);
  ch.body.position.y = lerp(ch.body.position.y, lying ? 0.12 : 0, t);
  ch.body.position.z = lerp(ch.body.position.z, lying ? 0.85 : 0, t);
  // Respiração
  ch.hips.scale.y = 1 + Math.sin(ch.phase * 0.8) * 0.008;
}

export function disposeCharacter(ch) {
  ch.root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
  });
}
