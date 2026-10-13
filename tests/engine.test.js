import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  assignWorker,
  build,
  canBuild,
  computeEconomy,
  createGame,
  currentEvent,
  demolish,
  deserialize,
  endCycle,
  idleWorkers,
  launchExpedition,
  moduleAt,
  removePeople,
  resolveEvent,
  serialize,
  setMaintenance,
  toggleDecree,
} from '../src/engine/game.js';
import { EXPEDITIONS, FRAGMENTS_TO_WIN, MODULES, START } from '../src/engine/data.js';

function freshGame() {
  const state = createGame(42);
  state.eventQueue = [];
  return state;
}

// Avança ciclos ignorando eventos aleatórios (sempre escolhe a primeira opção).
function advance(state, cycles) {
  for (let i = 0; i < cycles; i++) {
    while (currentEvent(state)) resolveEvent(state, currentEvent(state).id === 'fragment' ? 1 : 0);
    if (state.status !== 'playing') return;
    const result = endCycle(state);
    assert.ok(result.ok, result.error);
  }
}

test('a colônia começa com a população e a disposição definidas', () => {
  const state = freshGame();
  assert.equal(state.population, START.population);
  assert.equal(state.modules.length, 6);
  assert.equal(moduleAt(state, 0, 0).type, 'core');
  const assigned = state.modules.reduce((s, m) => s + m.workers, 0) + state.maintenance;
  assert.equal(idleWorkers(state), START.population - assigned);
});

test('a mesma semente e as mesmas ações produzem a mesma partida', () => {
  const run = () => {
    const state = createGame(7);
    for (let i = 0; i < 30 && state.status === 'playing'; i++) {
      while (currentEvent(state)) resolveEvent(state, 0);
      endCycle(state);
    }
    return serialize(state);
  };
  assert.equal(run(), run());
});

test('construir consome materiais e leva ciclos para concluir', () => {
  const state = freshGame();
  const before = state.resources.materials;
  const result = build(state, 'workshop', 2, 0);
  assert.ok(result.ok, result.error);
  assert.equal(state.resources.materials, before - MODULES.workshop.cost);
  assert.equal(assignWorker(state, result.module.id, 1).ok, false, 'não aceita gente em obra');
  advance(state, MODULES.workshop.buildCycles);
  assert.equal(result.module.buildLeft, 0);
  assert.ok(assignWorker(state, result.module.id, 1).ok);
});

test('regras de posicionamento: conexão vertical e faixas de profundidade', () => {
  const state = freshGame();
  state.resources.materials = 1000;
  assert.equal(canBuild(state, 'habitat', 3, 0).ok, false, 'nível 4 sem nível 3');
  assert.equal(canBuild(state, 'geothermal', 2, 0).ok, false, 'geotérmico só a partir do nível 4');
  assert.ok(build(state, 'habitat', 2, 0).ok);
  assert.ok(canBuild(state, 'geothermal', 3, 0).ok);
  assert.equal(canBuild(state, 'tidal', 3, 1).ok, false, 'turbina só até o nível 3');
  assert.ok(build(state, 'dock', 2, 1).ok);
  assert.equal(canBuild(state, 'dock', 2, 2).ok, false, 'apenas uma eclusa');
});

test('não é possível desmontar o único módulo que sustenta um nível inferior', () => {
  const state = freshGame();
  state.resources.materials = 1000;
  const upper = build(state, 'habitat', 2, 0).module;
  build(state, 'habitat', 3, 0);
  assert.equal(demolish(state, upper.id).ok, false);
  assert.equal(demolish(state, moduleAt(state, 0, 0).id).ok, false, 'núcleo é fixo');
});

test('atribuição respeita pessoas ociosas e vagas', () => {
  const state = freshGame();
  const oxygen = moduleAt(state, 1, 0);
  const slots = MODULES.oxygen.slots;
  while (oxygen.workers < slots) assert.ok(assignWorker(state, oxygen.id, 1).ok);
  assert.equal(assignWorker(state, oxygen.id, 1).ok, false);
  while (idleWorkers(state) > 0) setMaintenance(state, 1);
  assert.equal(setMaintenance(state, 1).ok, false);
  assert.equal(assignWorker(state, moduleAt(state, 1, 1).id, 1).ok, false);
});

test('déficit de energia sem bateria reduz a eficiência dos módulos', () => {
  const state = freshGame();
  state.resources.energy = 0;
  moduleAt(state, 0, 2).workers = 0; // desliga a turbina
  const eco = computeEconomy(state);
  assert.ok(eco.energy.blackout);
  assert.ok(eco.energy.efficiency < 1);
  assert.ok(eco.production.oxygen < moduleAt(state, 1, 0).workers * MODULES.oxygen.rate);
});

test('racionamento corta o consumo de água e comida', () => {
  const state = freshGame();
  const normal = computeEconomy(state).consumption;
  toggleDecree(state, 'rationing');
  const rationed = computeEconomy(state).consumption;
  assert.equal(rationed.food, normal.food * 0.75);
  assert.equal(rationed.water, normal.water * 0.75);
  assert.equal(rationed.oxygen, normal.oxygen);
});

test('mudar o Estatuto custa confiança, mas desfazer no mesmo ciclo é grátis', () => {
  const state = freshGame();
  const base = computeEconomy(state).trustDelta;
  toggleDecree(state, 'patrols');
  assert.equal(computeEconomy(state).trustDelta, base - 2);
  toggleDecree(state, 'patrols');
  assert.equal(computeEconomy(state).trustDelta, base);
});

test('falta de oxigênio mata pessoas no fim do ciclo', () => {
  const state = freshGame();
  state.resources.oxygen = 0;
  moduleAt(state, 1, 0).workers = 0;
  const eco = computeEconomy(state);
  assert.ok(eco.shortages.oxygen);
  const before = state.population;
  endCycle(state);
  assert.equal(state.population, before - eco.deaths.oxygen);
  assert.ok(state.stats.deaths >= eco.deaths.oxygen);
});

test('pessoas removidas saem primeiro dos ociosos, depois da manutenção', () => {
  const state = freshGame();
  const idle = idleWorkers(state);
  removePeople(state, idle + 1);
  assert.equal(idleWorkers(state), 0);
  assert.equal(state.maintenance, START.maintenance - 1);
});

test('expedição leva suprimentos e pessoas e volta depois dos ciclos previstos', () => {
  const state = freshGame();
  state.resources.materials = 1000;
  state.resources.oxygen = 500;
  state.resources.food = 500;
  const dock = build(state, 'dock', 2, 0).module;
  dock.buildLeft = 0;
  const pop = state.population;
  assert.ok(launchExpedition(state, 'wreck', 2).ok);
  assert.equal(state.population, pop - 2);
  assert.equal(launchExpedition(state, 'wreck', 1).ok, false, 'uma equipe por vez');
  advance(state, EXPEDITIONS.wreck.cycles);
  assert.equal(state.expedition, null);
  assert.equal(state.stats.expeditions, 1);
});

test('fragmentos: revelar aumenta confiança, lacrar acumula segredos', () => {
  const state = freshGame();
  state.fragments = 1;
  state.eventQueue.push({ id: 'fragment', data: { index: 0 } });
  const trust = state.trust;
  resolveEvent(state, 0);
  assert.equal(state.trust, trust + 6);
  assert.equal(state.revealed, 1);

  state.fragments = 2;
  state.eventQueue.push({ id: 'fragment', data: { index: 1 } });
  resolveEvent(state, 1);
  assert.equal(state.secrets, 1);
  assert.deepEqual(state.archive, [
    { index: 0, status: 'revealed' },
    { index: 1, status: 'sealed' },
  ]);
});

test('o último fragmento abre a decisão final e a escolha encerra a partida', () => {
  const state = freshGame();
  state.fragments = FRAGMENTS_TO_WIN;
  state.eventQueue.push({ id: 'fragment', data: { index: FRAGMENTS_TO_WIN - 1 } });
  resolveEvent(state, 1);
  assert.equal(currentEvent(state).id, 'finalTruth');
  assert.equal(endCycle(state).ok, false, 'evento pendente bloqueia o ciclo');
  resolveEvent(state, 0);
  assert.equal(state.status, 'won');
  assert.deepEqual(state.outcome, { kind: 'ending', key: 'truth' });
});

test('casco a zero encerra a partida em derrota', () => {
  const state = freshGame();
  state.hull = 0.1;
  state.maintenance = 0;
  endCycle(state);
  assert.equal(state.status, 'lost');
  assert.equal(state.outcome.key, 'hull');
  assert.equal(endCycle(state).ok, false);
});

test('salvar e carregar preserva o estado', () => {
  const state = freshGame();
  advance(state, 5);
  const copy = deserialize(serialize(state));
  assert.deepEqual(copy, state);
  assert.throws(() => deserialize(JSON.stringify({ version: 999 })));
});
