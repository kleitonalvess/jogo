// Visual da colônia: níveis, escada espiral, salas mobiliadas, placas,
// vigias para o mar, luzes e peças animadas. Reconstrói só o que mudou
// quando um módulo é construído, concluído ou desmontado.

import * as THREE from 'three';

import { MODULES } from '../engine/data.js';
import { depthOf } from '../engine/game.js';
import { MATERIALS, MeshBuilder, meshFrom, textTexture } from './geometry.js';
import {
  BAY_ANGLES,
  DOOR_HALF,
  LANDING_WINDOW,
  LEVEL_H,
  PILLAR_R,
  RING_IN,
  RING_OUT,
  STAIR_IN,
  STAIR_OUT,
  floorY,
  roomLayout,
  roomSize,
  roomToWorld,
} from './layout.js';

export const PALETTE = {
  floor: '#2b363b',
  floorAlt: '#252f33',
  grate: '#1b2326',
  wall: '#41545a',
  wallLow: '#34444a',
  rib: '#2c3a40',
  trim: '#5d7177',
  ceiling: '#1c2529',
  pipe: '#8a6142',
  pipeDark: '#5c4330',
  hazard: '#d9a43a',
  hazardDark: '#1d1c19',
  lamp: '#ffdca8',
  lampCool: '#c8eef2',
  screen: '#62d6cc',
  sea: '#0e4256',
  seaDeep: '#06202b',
  steel: '#6f7d80',
  steelDark: '#3d4649',
  brass: '#b58a4a',
  fabric: ['#6c4f3d', '#3f5a6c', '#5b6b3e', '#7a3f3f', '#4d4466', '#7a6a4a'],
  paper: '#d8cfb4',
  plant: '#4f8f4a',
  plantDark: '#2f6b3a',
  algae: '#7fe08a',
  white: '#dfe4e1',
  red: '#b5463c',
  black: '#141618',
  category: { life: '#5cbfc6', energy: '#d9c25c', habitat: '#aebdc2', industry: '#cf8f68', social: '#9cc56f', care: '#e9eeec' },
};

const TAU = Math.PI * 2;
const CEIL = LEVEL_H - 0.35;

function roomMatrix(level, slot) {
  const a = BAY_ANGLES[slot];
  const origin = roomToWorld(level, slot, 0, 0);
  const m = new THREE.Matrix4().makeRotationY(-a);
  m.setPosition(origin.x, origin.y, origin.z);
  return m;
}

// ---------------------------------------------------------------------------
// Móveis

function buildProp(b, glow, p, ctx) {
  const { u, v, w, d, h } = p;
  const c = PALETTE;
  switch (p.kind) {
    case 'table':
      b.box(u, h - 0.06, v, w, 0.06, d, c.steel);
      for (const du of [-w / 2 + 0.1, w / 2 - 0.1]) for (const dv of [-d / 2 + 0.1, d / 2 - 0.1]) b.box(u + du, 0, v + dv, 0.06, h - 0.06, 0.06, c.steelDark);
      if (ctx.type === 'core' || ctx.type === 'habitat') {
        for (let i = 0; i < Math.floor(w / 0.9); i++) {
          b.cylinder(u - w / 2 + 0.5 + i * 0.9, h, v + (i % 2 ? 0.2 : -0.2), 0.12, 0.05, c.steelDark, true);
          b.cylinder(u - w / 2 + 0.5 + i * 0.9, h + 0.03, v + (i % 2 ? 0.2 : -0.2), 0.09, 0.03, '#6f8f5a', true);
        }
      }
      if (ctx.type === 'core') {
        for (const side of [-1, 1]) b.box(u, 0, v + side * 0.75, w, 0.45, 0.32, c.steelDark);
      }
      break;
    case 'bench':
      b.box(u, 0, v, w, h, d, c.steelDark);
      break;
    case 'counter':
      b.box(u, 0, v, w, h - 0.05, d, c.steelDark);
      b.box(u, h - 0.05, v, w + 0.1, 0.05, d, c.steel);
      for (let i = 0; i < 4; i++) b.cylinder(u, h, v - d / 2 + 0.4 + i * 0.75, 0.13, 0.22, i % 2 ? c.brass : c.steel, true);
      break;
    case 'stove':
      b.box(u, 0, v, w, h, d, '#2a2c2e');
      glow.box(u, h, v, w * 0.7, 0.02, d * 0.7, '#ff7a3a');
      b.cylinder(u, h + 0.02, v, 0.28, 0.35, c.steel);
      break;
    case 'shelf':
      b.box(u, 0, v, w, h, d, c.steelDark);
      for (let k = 1; k < 5; k++) {
        b.box(u, (k * h) / 5, v - 0.02, w - 0.1, 0.04, d - 0.08, c.steel);
        for (let i = 0; i < 9; i++) {
          const color = [c.paper, '#a8865a', '#6c4f3d', '#8c6b4a', '#c8b48a'][(i * 7 + k) % 5];
          b.box(u - w / 2 + 0.3 + i * (w - 0.5) / 9, (k * h) / 5 + 0.04, v - 0.05, 0.18 + ((i * 3) % 4) * 0.04, 0.28 + ((i + k) % 3) * 0.06, d - 0.2, color);
        }
      }
      break;
    case 'desk':
      b.box(u, h - 0.05, v, w, 0.05, d, '#5a4a3a');
      b.box(u - w / 2 + 0.25, 0, v, 0.4, h - 0.05, d - 0.1, c.steelDark);
      b.box(u + w / 2 - 0.05, 0, v, 0.06, h - 0.05, d - 0.1, c.steelDark);
      b.box(u + 0.1, h, v - 0.1, 0.5, 0.02, 0.35, c.paper, 0.2);
      b.box(u - 0.3, h, v + 0.15, 0.3, 0.04, 0.22, c.paper, -0.3);
      glow.sphere(u + w / 2 - 0.25, h + 0.35, v + d / 2 - 0.2, 0.08, c.lamp);
      b.cylinder(u + w / 2 - 0.25, h, v + d / 2 - 0.2, 0.02, 0.3, c.brass, true);
      break;
    case 'safe':
      b.box(u, 0, v, w, h, d, '#2b3033');
      b.box(u - w / 2 - 0.01, 0.12, v, 0.02, h - 0.24, d - 0.12, '#3a4044');
      b.cylinder(u - w / 2 - 0.03, h * 0.6, v, 0.09, 0.05, c.brass, false, 0, Math.PI / 2);
      glow.box(u - w / 2 - 0.03, h * 0.35, v, 0.02, 0.12, 0.22, '#3fd27a');
      break;
    case 'terminal':
      b.box(u, 0, v, w, h, d, c.steelDark);
      glow.boxC(u - w / 2 - 0.01, 1.35, v, 0.02, 0.7, d - 0.25, c.screen);
      glow.boxC(u - w / 2 - 0.015, 1.35, v, 0.01, 0.04, d - 0.4, '#e9fffb');
      b.box(u - w / 2 - 0.2, 0.9, v, 0.35, 0.06, d - 0.2, c.steel);
      for (let i = 0; i < 6; i++) glow.box(u - w / 2 - 0.25, 0.97, v - 0.5 + i * 0.2, 0.08, 0.02, 0.08, i % 3 ? '#e9b45a' : '#5fd0c8');
      break;
    case 'bunk': {
      const fabric = PALETTE.fabric[(ctx.seed + Math.round(u * 7)) % PALETTE.fabric.length];
      const fabric2 = PALETTE.fabric[(ctx.seed + Math.round(u * 3) + 2) % PALETTE.fabric.length];
      for (const du of [-w / 2 + 0.05, w / 2 - 0.05]) for (const dv of [-d / 2 + 0.05, d / 2 - 0.05]) b.box(u + du, 0, v + dv, 0.07, h, 0.07, c.steelDark);
      b.box(u, 0.3, v, w, 0.12, d, c.steel);
      b.box(u, 0.42, v, w - 0.1, 0.14, d - 0.1, fabric);
      b.box(u + w / 2 - 0.3, 0.56, v, 0.4, 0.1, d - 0.25, c.white);
      b.box(u, 1.4, v, w, 0.12, d, c.steel);
      b.box(u, 1.52, v, w - 0.1, 0.14, d - 0.1, fabric2);
      b.box(u + w / 2 - 0.3, 1.66, v, 0.4, 0.1, d - 0.25, c.white);
      // cortina
      const side = Math.sign(v) || 1;
      b.box(u - w / 2 + 0.35, 0.3, v - side * (d / 2), 0.7, 1.8, 0.03, fabric2);
      break;
    }
    case 'locker':
      b.box(u, 0, v, w, h, d, '#4a5a5f');
      for (let i = 1; i < Math.round(Math.max(w, d) / 0.5); i++) {
        if (w > d) b.box(u - w / 2 + i * 0.5, 0.05, v - d / 2 - 0.005, 0.02, h - 0.1, 0.01, c.rib);
        else b.box(u - w / 2 - 0.005, 0.05, v - d / 2 + i * 0.5, 0.01, h - 0.1, 0.02, c.rib);
      }
      break;
    case 'cell':
      b.cylinder(u, 0, v, w / 2, 0.25, c.steelDark);
      glow.cylinder(u, 0.25, v, w / 2 - 0.12, h - 0.6, '#3a8fa0');
      b.cylinder(u, h - 0.35, v, w / 2, 0.35, c.steelDark);
      b.torus(u, h * 0.4, v, w / 2 - 0.05, c.steel, Math.PI / 2);
      b.cylinder(u, h, v, 0.08, LEVEL_H - h - 0.35, c.pipe, true);
      break;
    case 'membrane':
      for (let k = 0; k < 3; k++) b.cylinder(u, 0.35 + k * 0.55, v, 0.22, w, k % 2 ? '#7e9aa0' : '#9db4b8', false, 0, Math.PI / 2);
      b.box(u - w / 2, 0, v, 0.08, h, d, c.steelDark);
      b.box(u + w / 2, 0, v, 0.08, h, d, c.steelDark);
      glow.box(u + w / 2 + 0.05, 1.3, v - d / 2 + 0.2, 0.02, 0.15, 0.25, '#56d18f');
      break;
    case 'tank':
      b.cylinder(u, 0, v, w / 2, h, '#7b9196');
      b.torus(u, h * 0.3, v, w / 2 + 0.02, c.steelDark, Math.PI / 2);
      b.torus(u, h * 0.7, v, w / 2 + 0.02, c.steelDark, Math.PI / 2);
      b.cylinder(u, h, v, 0.1, LEVEL_H - h - 0.35, c.pipe, true);
      break;
    case 'algae':
      b.box(u, 0, v, w, h - 0.1, d, c.steelDark);
      glow.box(u, h - 0.12, v, w - 0.15, 0.04, d - 0.15, c.algae);
      for (let i = 0; i < 6; i++) glow.box(u - w / 2 + 0.3 + i * (w - 0.5) / 5, h - 0.1, v + (i % 2 ? 0.2 : -0.2), 0.06, 0.25 + (i % 3) * 0.1, 0.06, '#9df0a0');
      glow.box(u, 2.6, v, w - 0.4, 0.05, 0.25, '#e8d0ff');
      break;
    case 'bench-work':
      b.box(u, h - 0.06, v, w, 0.06, d, '#6b5a45');
      b.box(u, 0, v, w - 0.1, h - 0.06, d - 0.1, c.steelDark);
      b.box(u - 0.6, h, v, 0.3, 0.12, 0.2, c.red);
      b.cylinder(u + 0.4, h, v, 0.1, 0.25, c.steel, true);
      b.box(u + 0.8, h, v - 0.1, 0.5, 0.03, 0.06, c.steel, 0.6);
      break;
    case 'press':
      b.box(u, 0, v, w, 0.5, d, c.steelDark);
      b.box(u, 0.5, v, w * 0.3, h - 0.5, d * 0.3, c.hazard);
      b.box(u, h - 0.3, v, w, 0.3, d, c.steelDark);
      break;
    case 'scrap':
      for (let i = 0; i < 9; i++) {
        const du = ((i * 37) % 10) / 10 - 0.5;
        const dv = ((i * 53) % 10) / 10 - 0.5;
        if (i % 3 === 0) b.cylinder(u + du * w * 0.7, 0, v + dv * d * 0.7, 0.18, 0.5 + (i % 4) * 0.15, c.pipeDark, true);
        else b.box(u + du * w * 0.7, 0, v + dv * d * 0.7, 0.4, 0.3 + (i % 3) * 0.2, 0.35, i % 2 ? c.steel : '#6d5a48', i * 0.5);
      }
      break;
    case 'pipe-rack':
      for (let i = 0; i < 4; i++) b.cylinder(u, 0, v - d / 2 + 0.5 + i * (d - 1) / 3, 0.12, LEVEL_H - 0.35, i % 2 ? c.pipe : c.steel, true);
      break;
    case 'turbine':
      b.cylinder(u, 0, v, 0.9, 0.4, c.steelDark);
      b.cylinder(u, 0.4, v, d / 2 - 0.2, 2.6, '#55676c', false, 0, 0, 0);
      b.torus(u - w / 2 + 0.2, 1.7, v, d / 2 - 0.2, c.hazard, 0, Math.PI / 2);
      ctx.animated.push({ kind: 'fan', u: u - w / 2 + 0.15, y: 1.7, v, r: d / 2 - 0.4 });
      break;
    case 'vent-core':
      b.cylinder(u, 0, v, w / 2, 0.5, c.steelDark);
      glow.cylinder(u, 0.5, v, w / 2 - 0.35, h - 1.2, '#ff7a33');
      b.cylinder(u, h - 0.7, v, w / 2, 0.7, c.steelDark);
      for (let k = 0; k < 4; k++) b.torus(u, 0.8 + k * 0.6, v, w / 2 - 0.25, c.steel, Math.PI / 2);
      ctx.lamps.push({ u, v, y: 1.6, color: '#ff8a40', intensity: 1.3 });
      break;
    case 'console':
      b.box(u, 0, v, w, h, d, c.steelDark);
      glow.boxC(u, h + 0.02, v, w - 0.2, 0.02, d - 0.2, c.screen);
      break;
    case 'battery':
      b.box(u, 0, v, w, h, d, '#3d4a3f');
      for (let k = 0; k < 4; k++) glow.box(u - w / 2 + 0.25 + k * 0.3, h * 0.75, v - Math.sign(v) * (d / 2 + 0.005), 0.08, 0.08, 0.01, k < 3 ? '#56d18f' : '#e9b45a');
      break;
    case 'garden':
      b.box(u, 0, v, w, h, d, '#5b4a3a');
      b.box(u, h - 0.05, v, w - 0.1, 0.05, d - 0.1, '#3a2c20');
      for (let i = 0; i < Math.round(w * d * 2.2); i++) {
        const du = (((i * 37) % 17) / 17 - 0.5) * (w - 0.3);
        const dv = (((i * 53) % 13) / 13 - 0.5) * (d - 0.3);
        b.sphere(u + du, h + 0.18 + (i % 3) * 0.06, v + dv, 0.2 + (i % 4) * 0.05, i % 2 ? c.plant : c.plantDark, true, 0.8);
        if (i % 5 === 0) glow.sphere(u + du + 0.1, h + 0.42, v + dv, 0.05, ['#f2d35a', '#e8826a', '#f0f0e0'][i % 3]);
      }
      glow.box(u, CEIL - 0.1, v, Math.min(w, 2.6), 0.06, Math.min(d, 1.2), '#fff2c8');
      break;
    case 'hatch':
      b.box(u, 0, v, w, h, d, c.steelDark);
      b.torus(u - w / 2 - 0.02, h / 2, v, 1.3, c.hazard, 0, Math.PI / 2);
      b.disc(u - w / 2 - 0.03, h / 2, v, 1.25, '#4a5559', 0, -Math.PI / 2);
      b.torus(u - w / 2 - 0.12, h / 2, v, 0.45, c.brass, 0, Math.PI / 2);
      glow.box(u - w / 2 - 0.05, h + 0.25, v, 0.02, 0.18, 0.5, '#ff5a3a');
      break;
    case 'suit-rack':
      b.box(u, h - 0.1, v, w, 0.08, 0.1, c.steel);
      for (let i = 0; i < 3; i++) {
        const du = u - w / 2 + 0.4 + i * 0.8;
        b.cylinder(du, 0.5, v, 0.28, 1.0, '#9a7a4a');
        b.sphere(du, 1.75, v, 0.3, c.brass);
        glow.disc(du, 1.75, v + Math.sign(-v || 1) * 0.29, 0.14, '#1a4a5a', 0, 0);
      }
      break;
    case 'cot':
      b.box(u, 0, v, w, 0.5, d, c.white);
      b.box(u, 0.5, v, w - 0.1, 0.12, d - 0.1, '#c7d3d6');
      b.box(u + w / 2 - 0.25, 0.62, v, 0.35, 0.08, d - 0.3, '#f2f2ee');
      break;
    case 'cabinet':
      b.box(u, 0, v, w, h, d, c.white);
      b.box(u - w / 2 - 0.01, h * 0.62, v, 0.02, 0.4, 0.12, c.red);
      b.box(u - w / 2 - 0.01, h * 0.62, v, 0.02, 0.12, 0.4, c.red);
      break;
    default:
      b.box(u, 0, v, w, h, d, c.steel);
  }
}

// ---------------------------------------------------------------------------

function porthole(b, glow, x, y, z, ry, r = 0.4) {
  b.torus(x, y, z, r + 0.05, PALETTE.brass, 0, ry);
  glow.add('disc', { x, y, z, sx: r * 2, sy: r * 2, sz: 1, ry }, PALETTE.sea);
}

// Parede reta de um lado da sala, com vigias opcionais. (du, dv) aponta
// para dentro da sala; as vigias ficam na face interna.
function roomWall(b, glow, u0, v0, u1, v1, color, windows = 0, inward = { du: 0, dv: 0 }) {
  const w = Math.hypot(u1 - u0, v1 - v0);
  const ry = -Math.atan2(v1 - v0, u1 - u0);
  b.add('box', { x: (u0 + u1) / 2, y: CEIL / 2, z: (v0 + v1) / 2, sx: w, sy: CEIL, sz: 0.2, ry }, color);
  b.add('box', { x: (u0 + u1) / 2 + inward.du * 0.02, y: 0.35, z: (v0 + v1) / 2 + inward.dv * 0.02, sx: w, sy: 0.7, sz: 0.24, ry }, PALETTE.wallLow);
  const facing = Math.atan2(inward.du, inward.dv);
  for (let i = 1; i <= windows; i++) {
    const t = i / (windows + 1);
    porthole(b, glow, u0 + (u1 - u0) * t + inward.du * 0.12, 2.2, v0 + (v1 - v0) * t + inward.dv * 0.12, facing);
  }
}

function buildRoom(b, glow, level, slot, mod, ctx) {
  const def = MODULES[mod.type];
  const { len, half } = roomSize(mod.type);
  const cat = PALETTE.category[def.category] || PALETTE.trim;
  const base = roomMatrix(level, slot);
  b.base = base;
  glow.base = base;
  const roomCtx = { type: mod.type, seed: mod.id * 7, animated: [], lamps: [] };
  // Piso, com faixas alternadas.
  for (let i = 0; i < Math.ceil(len / 1.5); i++) {
    b.box(Math.min(len, i * 1.5 + 0.75), -0.1, 0, 1.5, 0.1, half * 2, i % 2 ? PALETTE.floor : PALETTE.floorAlt);
  }
  // Teto
  b.add('box', { x: len / 2, y: CEIL + 0.05, z: 0, sx: len, sy: 0.1, sz: half * 2 }, PALETTE.ceiling);
  // Paredes laterais e do fundo (com vigias), e a frontal com a porta.
  roomWall(b, glow, 0, -half, len, -half, PALETTE.wall, Math.floor(len / 4), { du: 0, dv: 1 });
  roomWall(b, glow, 0, half, len, half, PALETTE.wall, Math.floor(len / 4), { du: 0, dv: -1 });
  roomWall(b, glow, len, -half, len, half, PALETTE.wall, mod.type === 'dock' ? 0 : 2, { du: -1, dv: 0 });
  roomWall(b, glow, 0, -half, 0, -DOOR_HALF, PALETTE.wall, 0, { du: 1, dv: 0 });
  roomWall(b, glow, 0, DOOR_HALF, 0, half, PALETTE.wall, 0, { du: 1, dv: 0 });
  b.box(0, CEIL - 0.9, 0, 0.24, 0.9, DOOR_HALF * 2, PALETTE.wall);
  // Costelas estruturais e luminárias.
  for (let i = 1; i < len / 3; i++) {
    const u = i * 3;
    b.box(u, 0, -half + 0.12, 0.25, CEIL, 0.1, PALETTE.rib);
    b.box(u, 0, half - 0.12, 0.25, CEIL, 0.1, PALETTE.rib);
    b.box(u, CEIL - 0.25, 0, 0.25, 0.2, half * 2, PALETTE.rib);
  }
  glow.box(len / 2, CEIL - 0.06, 0, len * 0.6, 0.04, 0.3, mod.type === 'farm' ? '#e8d0ff' : PALETTE.lamp);
  // Faixa da cor da categoria na altura dos olhos.
  b.box(len / 2, 1.55, -half + 0.13, len - 0.4, 0.1, 0.02, cat);
  b.box(len / 2, 1.55, half - 0.13, len - 0.4, 0.1, 0.02, cat);
  // Tubulação no teto.
  b.cylinder(len / 2, CEIL - 0.45, half - 0.5, 0.1, len, PALETTE.pipe, true, 0, Math.PI / 2);
  b.cylinder(len / 2, CEIL - 0.6, -half + 0.6, 0.07, len, PALETTE.steel, true, 0, Math.PI / 2);

  const layout = roomLayout(mod.type);
  for (const p of layout.props) buildProp(b, glow, p, roomCtx);

  // Pontos de interação e luz desta sala.
  const toWorld = (u, v, y = 0) => {
    const p = roomToWorld(level, slot, u, v);
    return { x: p.x, y: p.y + y, z: p.z };
  };
  ctx.lamps.push({ ...toWorld(len / 2, 0, CEIL - 0.6), color: mod.type === 'farm' ? '#e6d4ff' : mod.type === 'commons' ? '#ffe2b0' : '#ffd29a', intensity: mod.type === 'commons' ? 1.3 : 1, level });
  for (const l of roomCtx.lamps) ctx.lamps.push({ ...toWorld(l.u, l.v, l.y), color: l.color, intensity: l.intensity, level });
  for (const a of roomCtx.animated) ctx.animated.push({ ...a, world: toWorld(a.u, a.v, a.y), angle: BAY_ANGLES[slot], level });
  if (mod.type === 'core') {
    const s = layout.spots;
    ctx.interactables.push({ id: 'terminal', level, ...toWorld(s.terminal.u, s.terminal.v), label: 'Usar o Terminal do Conselho' });
    ctx.interactables.push({ id: 'cofre', level, ...toWorld(s.cofre.u, s.cofre.v), label: 'Examinar o cofre do Conselho' });
    ctx.interactables.push({ id: 'bed', level, ...toWorld(s.bed.u, s.bed.v), label: 'Dormir no seu beliche', nightOnly: true });
    ctx.interactables.push({ id: 'kitchen', level, ...toWorld(len - 1.4, -1.2), label: 'Pedir uma ração extra na cozinha' });
  }
  if (mod.type === 'dock') {
    const s = layout.spots.airlock;
    ctx.interactables.push({ id: 'airlock', level, ...toWorld(s.u, s.v), label: 'Vestir o traje e sair pela eclusa' });
  }
  if (mod.type === 'workshop') ctx.paintSpot = { level, ...toWorld(layout.spots.paint.u, layout.spots.paint.v) };
  b.base = null;
  glow.base = null;
}

function buildUnfinished(b, glow, level, slot, mod) {
  const { len, half } = roomSize(mod.type);
  const base = roomMatrix(level, slot);
  b.base = base;
  glow.base = base;
  b.box(len / 2, -0.1, 0, len, 0.1, half * 2, PALETTE.floorAlt);
  // Andaimes e a casca ainda aberta.
  for (let i = 0; i <= len; i += 1.5) {
    b.box(i, 0, -half, 0.08, CEIL, 0.08, PALETTE.hazard);
    b.box(i, 0, half, 0.08, CEIL, 0.08, PALETTE.hazard);
  }
  b.box(len / 2, CEIL * 0.5, -half, len, 0.08, 0.08, PALETTE.hazard);
  b.box(len / 2, CEIL * 0.5, half, len, 0.08, 0.08, PALETTE.hazard);
  roomWall(b, glow, len, -half, len, half, PALETTE.wallLow, 0, { du: -1, dv: 0 });
  // Barreira na porta.
  for (let k = 0; k < 5; k++) b.box(-0.2, 0.4 + k * 0.35, 0, 0.1, 0.18, DOOR_HALF * 2, k % 2 ? PALETTE.hazard : PALETTE.hazardDark);
  glow.box(len / 2, CEIL - 0.06, 0, 0.6, 0.04, 0.3, '#ff9a3a');
  b.base = null;
  glow.base = null;
}

function buildSealedDoor(b, level, slot) {
  const base = roomMatrix(level, slot);
  b.base = base;
  b.box(-0.6, 0, 0, 0.25, CEIL, DOOR_HALF * 2 + 0.3, '#3a4549');
  for (let k = 0; k < 6; k++) b.box(-0.75, 0.3 + k * 0.6, 0, 0.04, 0.3, DOOR_HALF * 2, k % 2 ? PALETTE.hazard : PALETTE.hazardDark, 0, () => 1);
  b.base = null;
}

// ---------------------------------------------------------------------------
// Nível: anel, escada, pilar, placas

function buildLevel(level, modsBySlot, ctx, isLast) {
  const b = new MeshBuilder();
  const glow = new MeshBuilder();
  const y = floorY(level);
  const doorHalfAngle = Math.asin(DOOR_HALF / RING_OUT);

  // Piso do anel em faixas e uma borda na beira da escada.
  b.annulus(RING_IN - 0.15, RING_OUT + 0.15, y, PALETTE.floor, 0, TAU, 64);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU;
    b.add('box', { x: Math.cos(a) * 4.8, y: y + 0.005, z: Math.sin(a) * 4.8, sx: 3.4, sy: 0.01, sz: 0.06, ry: -a }, PALETTE.grate);
  }
  // Teto do anel
  b.annulus(STAIR_OUT + 0.1, RING_OUT + 0.15, y + CEIL + 0.05, PALETTE.ceiling, 0, TAU, 64, true);
  // Parede externa do anel, com portas nas quatro baias.
  const gaps = BAY_ANGLES.map((a) => [a - doorHalfAngle, a + doorHalfAngle]);
  for (let i = 0; i < 4; i++) {
    const a0 = gaps[i][1];
    const a1 = i < 3 ? gaps[i + 1][0] : gaps[0][0] + TAU;
    b.arcWall(RING_OUT + 0.1, a0, a1, y, CEIL, 0.2, PALETTE.wall, 10);
    b.arcWall(RING_OUT + 0.05, a0, a1, y, 0.7, 0.24, PALETTE.wallLow, 10);
    // Vigia entre as baias, olhando para o mar.
    const mid = (a0 + a1) / 2;
    porthole(b, glow, Math.cos(mid) * (RING_OUT - 0.02), y + 2.2, Math.sin(mid) * (RING_OUT - 0.02), Math.atan2(-Math.cos(mid), -Math.sin(mid)), 0.55);
    // Faixa de luz no alto da parede.
    glow.arcWall(RING_OUT - 0.05, a0 + 0.08, a1 - 0.08, y + CEIL - 0.3, 0.06, 0.03, PALETTE.lamp, 6);
    ctx.lamps.push({ x: Math.cos(mid) * 5, y: y + CEIL - 0.6, z: Math.sin(mid) * 5, color: '#ffd8a0', intensity: 0.75, level });
  }
  // Costelas do anel
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU + Math.PI / 16;
    if (gaps.some(([g0, g1]) => a > g0 - 0.05 && a < g1 + 0.05)) continue;
    b.add('box', { x: Math.cos(a) * (RING_OUT - 0.08), y: y + CEIL / 2, z: Math.sin(a) * (RING_OUT - 0.08), sx: 0.12, sy: CEIL, sz: 0.25, ry: -a }, PALETTE.rib);
  }
  // Tubo que corre pelo teto do anel
  b.arcWall(RING_OUT - 0.45, 0.2, TAU - 0.2, y + CEIL - 0.45, 0.16, 0.16, PALETTE.pipe, 32);

  // Guarda-corpo na beira da escada, aberto no patamar.
  const railR = RING_IN - 0.08;
  b.arcWall(railR, LANDING_WINDOW, TAU - LANDING_WINDOW, y + 1.0, 0.06, 0.06, PALETTE.brass, 28);
  b.arcWall(railR, LANDING_WINDOW, TAU - LANDING_WINDOW, y + 0.55, 0.04, 0.04, PALETTE.steel, 28);
  for (let k = 0; k < 20; k++) {
    const a = LANDING_WINDOW + (k / 19) * (TAU - 2 * LANDING_WINDOW);
    b.box(Math.cos(a) * railR, y, Math.sin(a) * railR, 0.06, 1.0, 0.06, PALETTE.steelDark);
  }
  // Faixa de perigo no patamar e o número do nível no piso.
  for (let k = 0; k < 6; k++) {
    const a = -LANDING_WINDOW + (k / 5) * 2 * LANDING_WINDOW;
    b.add('box', { x: Math.cos(a) * (RING_IN + 0.1), y: y + 0.006, z: Math.sin(a) * (RING_IN + 0.1), sx: 0.25, sy: 0.01, sz: 0.25, ry: -a }, k % 2 ? PALETTE.hazard : PALETTE.hazardDark);
  }

  // Escada: degraus de um nível ao próximo.
  if (!isLast) {
    const steps = 28;
    for (let k = 0; k < steps; k++) {
      const s = level + k / steps;
      const a = s * TAU;
      const mid = (STAIR_IN + STAIR_OUT) / 2;
      b.add('box', { x: Math.cos(a) * mid, y: -s * LEVEL_H - 0.07, z: Math.sin(a) * mid, sx: STAIR_OUT - STAIR_IN, sy: 0.14, sz: 0.5, ry: -a }, k % 2 ? PALETTE.steel : '#5b696c');
      glow.add('box', { x: Math.cos(a) * (STAIR_OUT - 0.08), y: -s * LEVEL_H + 0.01, z: Math.sin(a) * (STAIR_OUT - 0.08), sx: 0.05, sy: 0.01, sz: 0.3, ry: -a }, '#e9b45a');
    }
    // Corrimão helicoidal
    const pts = [];
    for (let k = 0; k <= 48; k++) {
      const s = level + 0.06 + (k / 48) * 0.88;
      const a = s * TAU;
      pts.push(new THREE.Vector3(Math.cos(a) * (STAIR_OUT + 0.02), -s * LEVEL_H + 1.0, Math.sin(a) * (STAIR_OUT + 0.02)));
    }
    b.addRaw(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 0.04, 5, false), PALETTE.brass);
  }
  // Pilar central com canos.
  b.cylinder(0, y, 0, PILLAR_R, LEVEL_H, '#4a5a5f');
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU;
    b.cylinder(Math.cos(a) * (PILLAR_R + 0.08), y, Math.sin(a) * (PILLAR_R + 0.08), 0.07, LEVEL_H, k % 2 ? PALETTE.pipe : PALETTE.steel, true);
  }
  glow.cylinder(0, y + CEIL - 0.4, 0, PILLAR_R + 0.03, 0.1, '#ffcf8a');

  // Salas
  for (let slot = 0; slot < 4; slot++) {
    const mod = modsBySlot.get(slot);
    if (!mod) buildSealedDoor(b, level, slot);
    else if (mod.buildLeft > 0) buildUnfinished(b, glow, level, slot, mod);
    else buildRoom(b, glow, level, slot, mod, ctx);
    // Moldura da porta com a cor da categoria.
    const frame = new THREE.Matrix4().copy(roomMatrix(level, slot));
    b.base = frame;
    const cat = mod ? PALETTE.category[MODULES[mod.type].category] : PALETTE.steelDark;
    b.box(-0.9, 0, -DOOR_HALF - 0.12, 0.5, CEIL, 0.18, PALETTE.steelDark);
    b.box(-0.9, 0, DOOR_HALF + 0.12, 0.5, CEIL, 0.18, PALETTE.steelDark);
    b.box(-0.9, 2.9, 0, 0.5, CEIL - 2.9, DOOR_HALF * 2 + 0.4, PALETTE.wall);
    b.box(-1.16, 2.75, 0, 0.02, 0.1, DOOR_HALF * 2 + 0.4, cat);
    b.box(-0.5, 0.001, 0, 1.4, 0.01, DOOR_HALF * 2, PALETTE.grate);
    b.box(-0.6, 0, -DOOR_HALF - 0.1, 1.3, CEIL, 0.16, PALETTE.wallLow);
    b.box(-0.6, 0, DOOR_HALF + 0.1, 1.3, CEIL, 0.16, PALETTE.wallLow);
    b.box(-0.6, -0.1, 0, 1.4, 0.1, DOOR_HALF * 2 + 0.3, PALETTE.floorAlt);
    b.box(-0.6, CEIL, 0, 1.4, 0.1, DOOR_HALF * 2 + 0.3, PALETTE.ceiling);
    b.base = null;
  }

  const group = new THREE.Group();
  const solid = meshFrom(b, MATERIALS.solid);
  const glowMesh = meshFrom(glow, MATERIALS.glow);
  if (solid) group.add(solid);
  if (glowMesh) group.add(glowMesh);

  // Placas: nome do módulo sobre cada porta e o número do nível.
  for (let slot = 0; slot < 4; slot++) {
    const mod = modsBySlot.get(slot);
    const title = mod ? MODULES[mod.type].name.toUpperCase() : 'LACRADO';
    const sub = mod ? (mod.buildLeft > 0 ? `EM OBRA · ${mod.buildLeft} DIA${mod.buildLeft > 1 ? 'S' : ''}` : `NÍVEL ${level + 1}`) : `NÍVEL ${level + 1}`;
    const tex = textTexture([title, sub], { width: 384, height: 96, font: 'bold 40px "Saira Stencil One", Impact, sans-serif' });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    const p = roomToWorld(level, slot, -1.17, 0);
    sign.position.set(p.x, y + 3.35, p.z);
    sign.rotation.y = -BAY_ANGLES[slot] - Math.PI / 2;
    group.add(sign);
  }
  const levelTex = textTexture([`N${level + 1}`, `−${depthOf(level)} m`], { width: 192, height: 128, font: 'bold 64px "Saira Stencil One", Impact, sans-serif', bg: '#132126' });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), new THREE.MeshBasicMaterial({ map: levelTex, toneMapped: false }));
  plate.position.set(PILLAR_R + 0.16, y + 2.3, 0);
  plate.rotation.y = Math.PI / 2;
  group.add(plate);
  return group;
}

// ---------------------------------------------------------------------------

export class ColonyView {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.levels = new Map();
    this.signatures = new Map();
    this.lamps = [];
    this.animated = [];
    this.interactables = [];
    this.paintSpot = null;
    this.fans = [];
    this.deepest = 0;
    this.top = null;
  }

  sync(state) {
    const byLevel = new Map();
    for (const m of state.modules) {
      if (!byLevel.has(m.level)) byLevel.set(m.level, new Map());
      byLevel.get(m.level).set(m.slot, m);
    }
    const deepest = Math.max(...byLevel.keys());
    const deepestChanged = deepest !== this.deepest;
    this.deepest = deepest;
    let changed = false;
    for (const level of [...this.levels.keys()]) {
      if (!byLevel.has(level)) {
        this.group.remove(this.levels.get(level).group);
        this.levels.delete(level);
        changed = true;
      }
    }
    for (const [level, mods] of byLevel) {
      const sig = [...mods.values()].map((m) => `${m.slot}${m.type}${m.buildLeft}`).sort().join('|') + (level === deepest ? '#last' : '');
      if (this.signatures.get(level) === sig && !deepestChanged) continue;
      this.signatures.set(level, sig);
      const old = this.levels.get(level);
      if (old) {
        this.group.remove(old.group);
        disposeGroup(old.group);
      }
      const ctx = { lamps: [], animated: [], interactables: [], paintSpot: null };
      const group = buildLevel(level, mods, ctx, level === deepest);
      this.group.add(group);
      this.levels.set(level, { group, ...ctx });
      changed = true;
    }
    if (!this.top) {
      this.top = buildTopCap();
      this.group.add(this.top);
    }
    if (changed) this.collect();
    return changed;
  }

  collect() {
    this.lamps = [];
    this.interactables = [];
    this.paintSpot = null;
    for (const fan of this.fans) this.group.remove(fan);
    this.fans = [];
    for (const lv of this.levels.values()) {
      this.lamps.push(...lv.lamps);
      this.interactables.push(...lv.interactables);
      if (lv.paintSpot) this.paintSpot = lv.paintSpot;
      for (const a of lv.animated) {
        if (a.kind !== 'fan') continue;
        const fan = buildFan(a.r);
        fan.position.set(a.world.x, a.world.y, a.world.z);
        fan.rotation.y = -a.angle;
        this.group.add(fan);
        this.fans.push(fan);
      }
    }
  }

  update(dt) {
    for (const fan of this.fans) fan.children[0].rotation.x += dt * 2.4;
  }
}

function buildFan(r) {
  const holder = new THREE.Group();
  const b = new MeshBuilder();
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU;
    b.add('box', { x: 0, y: Math.cos(a) * r * 0.5, z: Math.sin(a) * r * 0.5, sx: 0.05, sy: r * 0.95, sz: 0.35, rx: a }, '#8a9a9e');
  }
  b.cylinder(0, 0, 0, 0.25, 0.3, PALETTE.hazard, false, 0, Math.PI / 2);
  const mesh = new THREE.Mesh(b.build(), MATERIALS.solid);
  holder.add(mesh);
  return holder;
}

// Tampa acima do primeiro nível: o poço da escada termina numa cúpula.
function buildTopCap() {
  const b = new MeshBuilder();
  const glow = new MeshBuilder();
  b.annulus(0, RING_OUT + 0.2, CEIL + 0.05, PALETTE.ceiling, 0, TAU, 48, true);
  glow.disc(0, CEIL, 0, 1.4, '#0f3a4a', Math.PI / 2);
  b.torus(0, CEIL - 0.02, 0, 1.45, PALETTE.brass, Math.PI / 2);
  const g = new THREE.Group();
  g.add(meshFrom(b, MATERIALS.solid));
  g.add(meshFrom(glow, MATERIALS.glow));
  return g;
}

function disposeGroup(group) {
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material && o.material.map) {
      o.material.map.dispose();
      o.material.dispose();
    }
  });
}

