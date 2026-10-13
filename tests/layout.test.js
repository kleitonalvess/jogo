import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createGame } from '../src/engine/game.js';
import {
  buildNavGraph,
  expandPath,
  indexModules,
  nearestNode,
  regionAt,
  roomApproach,
  roomLayout,
  roomSize,
  roomToWorld,
  shortestPath,
  walkable,
  worldToRoom,
} from '../src/render/layout.js';

const state = createGame(1);
const index = indexModules(state.modules);

test('coordenadas de sala e de mundo são inversas', () => {
  for (let slot = 0; slot < 4; slot++) {
    const p = roomToWorld(2, slot, 3.2, -1.5);
    const back = worldToRoom(slot, p.x, p.z);
    assert.ok(Math.abs(back.u - 3.2) < 1e-9 && Math.abs(back.v + 1.5) < 1e-9);
  }
});

test('corredor, porta e sala são caminháveis; móveis e a escada não', () => {
  assert.ok(walkable(index, 0, 4.8, 0));
  assert.equal(regionAt(index, 0, 2.0, 0.2).kind, 'stair');
  const door = roomToWorld(0, 0, -0.6, 0);
  assert.ok(walkable(index, 0, door.x, door.z));
  const inside = roomToWorld(0, 0, 2, 0);
  assert.ok(walkable(index, 0, inside.x, inside.z));
  const table = roomToWorld(0, 0, 6.5, -1.9);
  assert.equal(walkable(index, 0, table.x, table.z), false);
  const wallGap = roomToWorld(0, 0, -0.6, 3);
  assert.equal(walkable(index, 0, wallGap.x, wallGap.z), false, 'fora da porta é parede');
  assert.equal(walkable(index, 5, 4.8, 0), true, 'o anel existe mesmo em nível vazio');
});

test('todos os pontos de interesse das salas estão em lugar caminhável', () => {
  const types = ['core', 'habitat', 'oxygen', 'water', 'farm', 'workshop', 'tidal', 'geothermal', 'battery', 'commons', 'dock', 'clinic'];
  for (const type of types) {
    const m = { id: 1, type, level: 0, slot: 1, buildLeft: 0 };
    const index = indexModules([m]);
    const { spots } = roomLayout(m.type);
    const { len, half } = roomSize(m.type);
    for (const [kind, list] of Object.entries(spots)) {
      for (const sp of Array.isArray(list) ? list : list ? [list] : []) {
        const target = sp.approach || sp;
        assert.ok(target.u >= 0 && target.u <= len && Math.abs(target.v) <= half, `${m.type}.${kind} dentro da sala`);
        if (sp.pose === 'lie' || kind === 'terminal' || kind === 'cofre' || kind === 'airlock' || kind === 'paint') continue;
        const w = roomToWorld(m.level, m.slot, target.u, target.v);
        assert.ok(walkable(index, m.level, w.x, w.z, 0.2), `${m.type}.${kind} (${target.u}, ${target.v}) caminhável`);
      }
    }
  }
});

test('há caminho entre qualquer sala e qualquer outra, inclusive por escada', () => {
  const graph = buildNavGraph(state.modules);
  const entries = [...graph.nodes.keys()].filter((k) => k.startsWith('E'));
  for (const a of entries) {
    for (const b of entries) {
      const path = shortestPath(graph, a, b);
      assert.ok(path, `${a} → ${b}`);
    }
  }
  const path = shortestPath(graph, 'E:0:0', 'E:2:1');
  const points = expandPath(graph, path);
  assert.ok(points.some((p) => p.onStair), 'desce pela escada');
  assert.ok(Math.abs(points.at(-1).y - -10) < 1e-9);
  assert.equal(nearestNode(graph, 1, 4.8, 0.1), 'R:1:0');
});

test('o caminho dentro da sala passa pelo corredor central', () => {
  const pts = roomApproach(0, 0, { u: 5, v: -1.15, lane: 4.0 });
  for (const p of pts) assert.ok(walkable(index, 0, p.x, p.z, 0.2), JSON.stringify(worldToRoom(0, p.x, p.z)));
});
