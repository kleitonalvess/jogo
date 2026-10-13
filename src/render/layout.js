// Geometria lógica da colônia: onde fica cada nível, sala, móvel, leito e
// posto de trabalho; por onde se pode andar; e o grafo de caminhos dos
// moradores. Só matemática, sem three.js, para poder ser testado em Node.
//
// Cada nível é um anel em volta de uma escada em espiral central. A escada
// dá uma volta completa por nível e desemboca no corredor no ângulo 0 (+x).
// Os quatro compartimentos saem do anel a 45°, 135°, 225° e 315°.

export const LEVEL_H = 5;
export const PILLAR_R = 0.8;
export const STAIR_IN = 1.05;
export const STAIR_OUT = 2.9;
export const RING_IN = 3.05;
export const RING_OUT = 6.6;
export const DOOR_HALF = 1.15;
export const ROOM_START = 7.4;
export const LANDING_WINDOW = 0.42; // rad
export const BAY_ANGLES = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
export const RING_NODES = 16;
export const RING_R = 4.8;

export const ROOM_SIZE = {
  default: { len: 9, half: 4.4 },
  core: { len: 14, half: 5.4 },
  commons: { len: 11, half: 5 },
};

export function roomSize(type) {
  return ROOM_SIZE[type] || ROOM_SIZE.default;
}

export function floorY(level) {
  return -level * LEVEL_H;
}

export function bayFrame(slot) {
  const a = BAY_ANGLES[slot];
  return { angle: a, dir: { x: Math.cos(a), z: Math.sin(a) }, perp: { x: -Math.sin(a), z: Math.cos(a) } };
}

// Coordenadas de sala (u ao longo, v lateral) para o mundo.
export function roomToWorld(level, slot, u, v) {
  const f = bayFrame(slot);
  const along = ROOM_START + u;
  return { x: f.dir.x * along + f.perp.x * v, y: floorY(level), z: f.dir.z * along + f.perp.z * v };
}

export function worldToRoom(slot, x, z) {
  const f = bayFrame(slot);
  return { u: x * f.dir.x + z * f.dir.z - ROOM_START, v: x * f.perp.x + z * f.perp.z };
}

// Ângulo no plano, entre −π e π, medido a partir de +x em direção a +z.
export function angleOf(x, z) {
  return Math.atan2(z, x);
}

export function ringPoint(level, index, r = RING_R) {
  const a = (index / RING_NODES) * Math.PI * 2;
  return { x: Math.cos(a) * r, y: floorY(level), z: Math.sin(a) * r };
}

// ---------------------------------------------------------------------------
// Móveis e pontos de interesse de cada tipo de sala, em coordenadas (u, v).
// Cada móvel é um retângulo com altura; os que bloqueiam a passagem também
// servem de colisão.

function rect(kind, u, v, w, d, h, extra = {}) {
  return { kind, u, v, w, d, h, block: true, ...extra };
}

// spot: { u, v, face (rad, no plano da sala: 0 = olhando para +u), lane, pose }
function spot(u, v, face, lane, pose = 'stand', extra = {}) {
  return { u, v, face, lane, pose, ...extra };
}

const UP = 0;
const DOWN = Math.PI;
const LEFT = -Math.PI / 2; // olhando para −v
const RIGHT = Math.PI / 2; // olhando para +v

function standardWork(count, len) {
  const out = [];
  const us = [2.4, len - 2.6];
  for (let i = 0; i < count; i++) {
    const u = us[Math.floor(i / 2) % 2];
    const side = i % 2 === 0 ? -1 : 1;
    out.push(spot(u, side * 2.25, side < 0 ? LEFT : RIGHT, u, 'work'));
  }
  return out;
}

const LAYOUTS = {
  core(len, half) {
    const props = [];
    const spots = { mess: [], kitchen: [], office: [], archive: [], bunk: [], terminal: null, cofre: null, bed: null };
    // Refeitório: duas mesas compridas à esquerda (v < 0).
    for (const v of [-1.9, -4.0]) {
      props.push(rect('table', 6.5, v, 4, 0.9, 0.78));
      for (let i = 0; i < 4; i++) {
        const u = 5.0 + i * 1.0;
        spots.mess.push(spot(u, v + 0.75, LEFT, 4.0, 'sit'));
        spots.mess.push(spot(u, v - 0.75, RIGHT, 4.0, 'sit'));
      }
    }
    // Cozinha ao fundo, à esquerda.
    props.push(rect('counter', len - 0.6, -2.0, 0.9, 3.0, 1.0));
    props.push(rect('stove', len - 0.6, -4.5, 0.9, 1.2, 1.0));
    spots.kitchen.push(spot(len - 1.6, -3.0, UP, len - 1.6, 'work'));
    // Arquivo e sala de aula à direita (v > 0).
    props.push(rect('shelf', 6.5, half - 0.35, 4.6, 0.6, 2.4));
    props.push(rect('desk', 5.0, 2.2, 1.4, 0.8, 0.78));
    spots.archive.push(spot(5.0, 3.0, LEFT, 4.0, 'work'));
    // Conselho ao fundo, à direita: mesa de Augusto, cofre e Terminal.
    props.push(rect('desk', len - 3.0, 3.0, 1.8, 0.9, 0.78));
    props.push(rect('safe', len - 0.6, half - 0.7, 0.8, 0.8, 1.1));
    props.push(rect('terminal', len - 0.35, 1.2, 0.5, 1.6, 2.0));
    spots.office.push(spot(len - 3.0, 3.85, LEFT, len - 3.0, 'sit'));
    spots.terminal = { u: len - 1.2, v: 1.2, face: UP };
    spots.cofre = { u: len - 1.5, v: half - 0.9, face: UP };
    // Aposentos do Conselho: beliches junto à entrada, dos dois lados.
    for (const side of [-1, 1]) {
      for (let k = 0; k < 2; k++) {
        const u = 0.9 + k * 1.9;
        props.push(rect('bunk', u, side * (half - 0.55), 1.7, 0.95, 2.1));
        for (let level = 0; level < 2; level++) {
          spots.bunk.push(spot(u, side * (half - 0.55), side < 0 ? LEFT : RIGHT, u, 'lie', { bedLevel: level, side, approach: { u, v: side * (half - 1.45) } }));
        }
      }
    }
    // A cama do jogador é o primeiro beliche (inferior, lado esquerdo).
    spots.bed = { u: 0.9, v: -(half - 1.45), face: LEFT };
    // Duas fileiras de alunos diante da mesa do professor.
    for (let i = 0; i < 10; i++) spots.archive.push(spot(6.0 + (i % 5) * 0.85, i < 5 ? 1.25 : 2.35, DOWN, 4.0, 'sit'));
    props.push(rect('bench', 7.7, 1.25 - 0.45, 4.4, 0.35, 0.45, { block: false }));
    props.push(rect('bench', 7.7, 2.35 - 0.45, 4.4, 0.35, 0.45, { block: false }));
    return { props, spots };
  },

  habitat(len, half) {
    const props = [];
    const bunk = [];
    // Sete beliches de dois andares: quatro à esquerda, três à direita.
    const units = [];
    for (let k = 0; k < 4; k++) units.push({ u: 1.3 + k * 2.0, side: -1 });
    for (let k = 0; k < 3; k++) units.push({ u: 2.3 + k * 2.0, side: 1 });
    for (const unit of units) {
      props.push(rect('bunk', unit.u, unit.side * (half - 0.55), 1.8, 0.95, 2.1));
      for (let level = 0; level < 2; level++) {
        bunk.push(spot(unit.u, unit.side * (half - 0.55), unit.side < 0 ? LEFT : RIGHT, unit.u, 'lie', { bedLevel: level, side: unit.side, approach: { u: unit.u, v: unit.side * (half - 1.5) } }));
      }
    }
    props.push(rect('locker', len - 0.4, 0, 0.6, 3.2, 2.0));
    props.push(rect('table', 4.6, 0, 1.2, 0.8, 0.75, { block: true }));
    return { props, spots: { bunk } };
  },

  oxygen(len) {
    const props = [];
    for (const u of [2.4, len - 2.6]) for (const side of [-1, 1]) props.push(rect('cell', u, side * 3.4, 1.4, 1.4, 2.6));
    props.push(rect('pipe-rack', len - 0.4, 0, 0.5, 4, 3));
    return { props, spots: { work: standardWork(4, len) } };
  },

  water(len) {
    const props = [];
    for (const u of [2.4, len - 2.6]) for (const side of [-1, 1]) props.push(rect('membrane', u, side * 3.45, 2.4, 1.2, 2.0));
    props.push(rect('tank', len - 0.9, 0, 1.4, 1.4, 2.6));
    return { props, spots: { work: standardWork(4, len) } };
  },

  farm(len) {
    const props = [];
    for (const u of [2.4, len - 2.6]) for (const side of [-1, 1]) props.push(rect('algae', u, side * 3.3, 2.8, 1.5, 1.3));
    return { props, spots: { work: standardWork(4, len) } };
  },

  workshop(len) {
    const props = [];
    props.push(rect('bench-work', 2.4, -3.5, 2.6, 1.0, 0.95));
    props.push(rect('bench-work', 2.4, 3.5, 2.6, 1.0, 0.95));
    props.push(rect('press', len - 2.6, -3.4, 1.6, 1.3, 2.2));
    props.push(rect('scrap', len - 2.6, 3.55, 2.0, 1.4, 1.1));
    props.push(rect('shelf', len - 0.35, 0, 0.6, 3.6, 2.4));
    const work = standardWork(4, len);
    return { props, spots: { work, paint: { u: len - 1.2, v: 1.6 } } };
  },

  tidal(len) {
    const props = [rect('turbine', len - 2.2, 0, 3.4, 4.2, 3.4), rect('console', 2.4, -3.6, 1.2, 0.8, 1.2), rect('console', 2.4, 3.6, 1.2, 0.8, 1.2)];
    return { props, spots: { work: [spot(2.4, -2.7, LEFT, 2.4, 'work'), spot(2.4, 2.7, RIGHT, 2.4, 'work')] } };
  },

  geothermal(len) {
    const props = [rect('vent-core', len - 2.4, 0, 3.0, 3.0, 3.6), rect('console', 2.4, -3.6, 1.2, 0.8, 1.2), rect('console', 2.4, 3.6, 1.2, 0.8, 1.2)];
    return { props, spots: { work: [spot(2.4, -2.7, LEFT, 2.4, 'work'), spot(2.4, 2.7, RIGHT, 2.4, 'work')] } };
  },

  battery(len) {
    const props = [];
    for (const u of [2.0, 4.5, 7.0]) for (const side of [-1, 1]) props.push(rect('battery', Math.min(u, len - 1), side * 3.4, 1.4, 1.2, 2.2));
    return { props, spots: {} };
  },

  commons(len, half) {
    const props = [];
    const spots = { leisure: [] };
    props.push(rect('garden', len / 2, 0, 3.2, 3.2, 0.6));
    for (const side of [-1, 1]) {
      props.push(rect('garden', 3.0, side * (half - 0.9), 3.4, 1.2, 0.6));
      props.push(rect('garden', len - 3.0, side * (half - 0.9), 3.4, 1.2, 0.6));
    }
    props.push(rect('bench', len / 2, -2.6, 2.6, 0.5, 0.45, { block: false }));
    props.push(rect('bench', len / 2, 2.6, 2.6, 0.5, 0.45, { block: false }));
    // Pontos em volta do jardim central, para conversas e reuniões.
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const u = len / 2 + Math.cos(a) * 3.0;
      const v = Math.sin(a) * 2.9;
      spots.leisure.push(spot(u, v, Math.atan2(-v, len / 2 - u), u, i % 4 === 1 ? 'sit' : 'stand'));
    }
    return { props, spots };
  },

  dock(len) {
    const props = [rect('hatch', len - 0.5, 0, 0.8, 3.0, 3.0), rect('locker', 2.0, -3.9, 3.0, 0.7, 2.1), rect('locker', 2.0, 3.9, 3.0, 0.7, 2.1), rect('suit-rack', 5.5, -3.7, 2.4, 0.9, 2.0)];
    return { props, spots: { work: [spot(5.0, 2.6, RIGHT, 5.0, 'work')], airlock: { u: len - 1.5, v: 0, face: UP } } };
  },

  clinic(len) {
    const props = [];
    const beds = [];
    for (let k = 0; k < 3; k++) {
      for (const side of [-1, 1]) {
        const u = 2.2 + k * 2.4;
        props.push(rect('cot', u, side * 3.4, 1.9, 0.9, 0.7));
        beds.push(spot(u, side * 3.4, side < 0 ? LEFT : RIGHT, u, 'lie', { bedLevel: 0, side, approach: { u, v: side * 2.4 } }));
      }
    }
    props.push(rect('cabinet', len - 0.4, 0, 0.6, 2.4, 2.0));
    const work = [spot(len - 1.5, -1.0, UP, len - 1.5, 'work'), spot(len - 1.5, 1.0, UP, len - 1.5, 'work')];
    return { props, spots: { work, beds } };
  },
};

const layoutCache = new Map();

export function roomLayout(type) {
  if (!layoutCache.has(type)) {
    const { len, half } = roomSize(type);
    const fn = LAYOUTS[type];
    layoutCache.set(type, fn ? fn(len, half) : { props: [], spots: {} });
  }
  return layoutCache.get(type);
}

// ---------------------------------------------------------------------------
// Onde se pode andar

// Módulos agrupados por nível e posição para consultas rápidas.
export function indexModules(modules) {
  const byLevel = new Map();
  for (const m of modules) {
    if (!byLevel.has(m.level)) byLevel.set(m.level, new Map());
    byLevel.get(m.level).set(m.slot, m);
  }
  return byLevel;
}

export function levelExists(index, level) {
  return index.has(level);
}

export function deepestLevel(index) {
  let d = 0;
  for (const level of index.keys()) d = Math.max(d, level);
  return d;
}

// Onde está um ponto (x, z) de um nível: no anel, na escada, numa porta ou numa sala.
export function regionAt(index, level, x, z, radius = 0) {
  const r = Math.hypot(x, z);
  if (r >= STAIR_IN + radius && r <= STAIR_OUT - radius) return { kind: 'stair' };
  if (r >= RING_IN + radius && r <= RING_OUT - radius) return { kind: 'ring' };
  const mods = index.get(level);
  if (!mods) return null;
  for (const [slot, m] of mods) {
    if (m.buildLeft > 0) continue;
    const { u, v } = worldToRoom(slot, x, z);
    const { len, half } = roomSize(m.type);
    if (u >= -1.4 && u <= 0.2 && Math.abs(v) <= DOOR_HALF - radius) return { kind: 'door', slot, module: m };
    if (u >= 0 + radius && u <= len - radius && Math.abs(v) <= half - radius) {
      for (const p of roomLayout(m.type).props) {
        if (!p.block) continue;
        if (Math.abs(u - p.u) <= p.w / 2 + radius && Math.abs(v - p.v) <= p.d / 2 + radius) return { kind: 'blocked', slot, module: m, prop: p };
      }
      return { kind: 'room', slot, module: m, u, v };
    }
  }
  return null;
}

// Pode-se pisar ali sem estar na escada?
export function walkable(index, level, x, z, radius = 0.32) {
  const region = regionAt(index, level, x, z, radius);
  return !!region && region.kind !== 'blocked' && region.kind !== 'stair';
}

// Na escada, a altura depende do quanto já se girou: s é a posição
// contínua em níveis (0 = patamar do Nível 1, 1 = patamar do Nível 2...).
export function stairY(s) {
  return -s * LEVEL_H;
}

export function nearLanding(x, z) {
  return Math.abs(angleOf(x, z)) <= LANDING_WINDOW;
}

export function stairPoint(s, r = (STAIR_IN + STAIR_OUT) / 2) {
  const a = s * Math.PI * 2;
  return { x: Math.cos(a) * r, y: stairY(s), z: Math.sin(a) * r };
}

// ---------------------------------------------------------------------------
// Grafo de caminhos

function key(...parts) {
  return parts.join(':');
}

export function buildNavGraph(modules) {
  const index = indexModules(modules);
  const nodes = new Map();
  const edges = new Map();
  const addNode = (id, pos, meta = {}) => {
    nodes.set(id, { id, ...pos, ...meta });
    edges.set(id, []);
  };
  const link = (a, b, cost, kind = 'walk') => {
    edges.get(a).push({ to: b, cost, kind });
    edges.get(b).push({ to: a, cost, kind });
  };
  const levels = [...index.keys()].sort((a, b) => a - b);
  for (const level of levels) {
    for (let k = 0; k < RING_NODES; k++) addNode(key('R', level, k), ringPoint(level, k), { level });
    for (let k = 0; k < RING_NODES; k++) {
      const a = ringPoint(level, k);
      const b = ringPoint(level, (k + 1) % RING_NODES);
      link(key('R', level, k), key('R', level, (k + 1) % RING_NODES), Math.hypot(a.x - b.x, a.z - b.z));
    }
    addNode(key('S', level), stairPoint(level), { level, stair: level });
    link(key('S', level), key('R', level, 0), 3);
    for (const [slot, m] of index.get(level)) {
      if (m.buildLeft > 0) continue;
      const door = roomToWorld(level, slot, -0.7, 0);
      const entry = roomToWorld(level, slot, 0.7, 0);
      addNode(key('D', level, slot), door, { level });
      addNode(key('E', level, slot), entry, { level, room: m.id, slot });
      link(key('D', level, slot), key('R', level, slot * 4 + 2), 2.2);
      link(key('D', level, slot), key('E', level, slot), 1.4);
    }
  }
  for (let i = 0; i + 1 < levels.length; i++) {
    if (levels[i + 1] !== levels[i] + 1) continue;
    link(key('S', levels[i]), key('S', levels[i + 1]), 13, 'stair');
  }
  return { nodes, edges, index };
}

export function shortestPath(graph, from, to) {
  if (from === to) return [from];
  const dist = new Map([[from, 0]]);
  const prev = new Map();
  const open = new Set([from]);
  while (open.size) {
    let current = null;
    let best = Infinity;
    for (const id of open) {
      const d = dist.get(id);
      if (d < best) {
        best = d;
        current = id;
      }
    }
    open.delete(current);
    if (current === to) break;
    for (const e of graph.edges.get(current) || []) {
      const nd = best + e.cost;
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        prev.set(e.to, current);
        open.add(e.to);
      }
    }
  }
  if (!prev.has(to)) return null;
  const path = [to];
  let cur = to;
  while (prev.has(cur)) {
    cur = prev.get(cur);
    path.unshift(cur);
  }
  return path;
}

// Nó do grafo mais próximo de uma posição num nível.
export function nearestNode(graph, level, x, z, roomSlot = null) {
  if (roomSlot !== null && graph.nodes.has(key('E', level, roomSlot))) return key('E', level, roomSlot);
  let best = null;
  let bestD = Infinity;
  for (const node of graph.nodes.values()) {
    if (node.level !== level || node.id.startsWith('E') || node.id.startsWith('D')) continue;
    const d = Math.hypot(node.x - x, node.z - z);
    if (d < bestD) {
      bestD = d;
      best = node.id;
    }
  }
  return best;
}

// Transforma uma sequência de nós em pontos para seguir. Trechos de
// escada viram muitos pontos ao longo da hélice.
export function expandPath(graph, nodeIds) {
  const points = [];
  for (let i = 0; i < nodeIds.length; i++) {
    const node = graph.nodes.get(nodeIds[i]);
    const next = nodeIds[i + 1] ? graph.nodes.get(nodeIds[i + 1]) : null;
    points.push({ x: node.x, y: node.y, z: node.z, level: node.level });
    if (next && node.stair !== undefined && next.stair !== undefined) {
      const steps = 24;
      for (let k = 1; k < steps; k++) {
        const s = node.stair + ((next.stair - node.stair) * k) / steps;
        const p = stairPoint(s);
        points.push({ x: p.x, y: p.y, z: p.z, level: Math.round(s), onStair: true });
      }
    }
  }
  return points;
}

// Caminho dentro da sala até um ponto: entrada, corredor central, faixa
// lateral e destino.
export function roomApproach(level, slot, target) {
  const pts = [];
  const lane = target.lane ?? target.u;
  const via = target.approach || { u: target.u, v: target.v };
  pts.push(roomToWorld(level, slot, Math.max(0.7, Math.min(lane, 0.7)), 0));
  pts.push(roomToWorld(level, slot, lane, 0));
  pts.push(roomToWorld(level, slot, lane, via.v));
  pts.push(roomToWorld(level, slot, via.u, via.v));
  return pts.map((p) => ({ ...p, level }));
}
