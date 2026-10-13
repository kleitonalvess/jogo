import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  assignJob,
  assignWorker,
  build,
  canBuild,
  computeEconomy,
  createGame,
  currentEvent,
  demolish,
  deserialize,
  discoverFragment,
  endCycle,
  idleWorkers,
  launchExpedition,
  moduleAt,
  resolveEvent,
  serialize,
  setMaintenance,
  toggleDecree,
  workersOf,
} from '../src/engine/game.js';
import { EXPEDITIONS, FRAGMENTS, FRAGMENTS_TO_WIN, MODULES } from '../src/engine/data.js';
import { canWork, living, residentByKey } from '../src/engine/people/population.js';

function freshGame(seed = 42) {
  const state = createGame(seed);
  state.eventQueue = [];
  return state;
}

// Avança dias resolvendo eventos com a primeira opção possível.
function advance(state, days) {
  for (let i = 0; i < days; i++) {
    while (currentEvent(state)) {
      const r = resolveEvent(state, currentEvent(state).id === 'fragment' ? 1 : 0);
      if (!r.ok) state.eventQueue.shift();
    }
    if (state.status !== 'playing') return;
    const result = endCycle(state);
    assert.ok(result.ok, result.error);
  }
}

test('a colônia começa com 34 moradores nomeados e as vagas ocupadas', () => {
  const state = freshGame();
  assert.equal(state.residents.length, 34);
  assert.equal(state.modules.length, 12);
  assert.equal(moduleAt(state, 0, 0).type, 'core');
  const names = new Set(state.residents.map((r) => `${r.first} ${r.last}`));
  assert.equal(names.size, 34, 'nomes únicos');
  assert.ok(residentByKey(state, 'irene'));
  assert.equal(idleWorkers(state), 0);
  assert.equal(state.maintenance, 2);
  for (const m of state.modules) {
    assert.ok(m.workers <= (MODULES[m.type].slots || 0), `${m.type} dentro do limite de vagas`);
  }
  // Toda pessoa tem um leito.
  for (const r of state.residents) assert.ok(state.modules.some((m) => m.id === r.home));
});

test('a mesma semente e as mesmas ações produzem a mesma partida', () => {
  const run = () => {
    const state = createGame(7);
    advance(state, 25);
    return serialize(state);
  };
  assert.equal(run(), run());
});

test('construir consome materiais e leva dias para concluir', () => {
  const state = freshGame();
  const before = state.resources.materials;
  const result = build(state, 'geothermal', 3, 0);
  assert.ok(result.ok, result.error);
  assert.equal(state.resources.materials, before - MODULES.geothermal.cost);
  setMaintenance(state, -1);
  assert.equal(assignWorker(state, result.module.id, 1).ok, false, 'não aceita gente em obra');
  advance(state, MODULES.geothermal.buildCycles);
  assert.equal(result.module.buildLeft, 0);
  assert.ok(assignWorker(state, result.module.id, 1).ok);
});

test('regras de posicionamento: conexão vertical e faixas de profundidade', () => {
  const state = freshGame();
  state.resources.materials = 1000;
  assert.equal(canBuild(state, 'habitat', 4, 0).ok, false, 'nível 5 sem nível 4');
  assert.equal(canBuild(state, 'geothermal', 2, 0).ok, false, 'nível 3 ocupado');
  assert.ok(build(state, 'habitat', 3, 0).ok);
  assert.ok(canBuild(state, 'geothermal', 4, 0).ok);
  assert.equal(canBuild(state, 'tidal', 3, 1).ok, false, 'turbina só até o nível 3');
  assert.equal(canBuild(state, 'dock', 3, 2).ok, false, 'apenas uma eclusa');
});

test('não é possível desmontar o único módulo que sustenta um nível inferior', () => {
  const state = freshGame();
  state.resources.materials = 1000;
  const upper = build(state, 'habitat', 3, 0).module;
  build(state, 'habitat', 4, 0);
  assert.equal(demolish(state, upper.id).ok, false);
  assert.equal(demolish(state, moduleAt(state, 0, 0).id).ok, false, 'núcleo é fixo');
});

test('cada vaga é uma pessoa: atribuir escolhe alguém ocioso e com aptidão', () => {
  const state = freshGame();
  const workshop = state.modules.find((m) => m.type === 'workshop');
  assert.equal(assignWorker(state, workshop.id, 1).ok, false, 'ninguém ocioso no começo');
  setMaintenance(state, -1);
  assert.equal(idleWorkers(state), 1);
  assert.ok(assignWorker(state, workshop.id, 1).ok);
  assert.equal(workersOf(state, workshop.id).length, 4);
  const irene = residentByKey(state, 'irene');
  assert.ok(assignJob(state, irene.id, null).ok);
  assert.equal(irene.job, null);
  const marta = residentByKey(state, 'marta');
  assert.equal(assignJob(state, marta.id, workshop.id).ok, false, 'a chefe da guarda tem outra função');
});

test('déficit de energia sem bateria reduz a eficiência dos módulos', () => {
  const state = freshGame();
  state.resources.energy = 0;
  const eco = computeEconomy(state);
  assert.ok(eco.energy.net < 0, 'a colônia começa com déficit de energia');
  assert.ok(eco.energy.blackout);
  assert.ok(eco.energy.efficiency < 1);
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

test('mudar o Estatuto custa confiança, mas desfazer no mesmo dia é grátis', () => {
  const state = freshGame();
  const base = computeEconomy(state).trustDelta;
  toggleDecree(state, 'patrols');
  assert.equal(computeEconomy(state).trustDelta, base - 2);
  toggleDecree(state, 'patrols');
  assert.equal(computeEconomy(state).trustDelta, base);
});

test('falta de oxigênio mata moradores com nome e deixa luto na família', () => {
  const state = freshGame();
  state.resources.oxygen = 0;
  for (const r of state.residents) if (r.job === state.modules.find((m) => m.type === 'oxygen').id) r.job = null;
  const eco = computeEconomy(state);
  assert.ok(eco.shortages.oxygen);
  const before = living(state).length;
  endCycle(state);
  const dead = state.residents.filter((r) => !r.alive);
  assert.equal(living(state).length, before - eco.deaths.oxygen);
  assert.ok(dead.every((r) => r.deathCause === 'oxygen'));
  assert.ok(state.log.some((l) => l.text.includes('morreu')));
  assert.ok(state.gatherings.some((g) => g.kind === 'funeral'), 'velório marcado');
});

test('expedição leva pessoas com nome e volta depois dos dias previstos', () => {
  const state = freshGame();
  state.resources.oxygen = 500;
  state.resources.food = 500;
  setMaintenance(state, -1);
  assert.ok(launchExpedition(state, 'wreck', 2).ok);
  const team = state.residents.filter((r) => r.away);
  assert.equal(team.length, 2);
  assert.ok(team.some((r) => r.key === 'icaro'), 'o escafandrista-chefe lidera');
  assert.equal(launchExpedition(state, 'wreck', 1).ok, false, 'uma equipe por vez');
  advance(state, EXPEDITIONS.wreck.cycles);
  assert.equal(state.expedition, null);
  assert.ok(state.residents.every((r) => !r.away));
});

test('fragmentos: revelar marca assembleia, lacrar cria um segredo que as testemunhas conhecem', () => {
  const state = freshGame();
  const teodoro = residentByKey(state, 'teodoro');
  assert.ok(discoverFragment(state, 'founding', [teodoro.id]).ok);
  assert.equal(currentEvent(state).id, 'fragment');
  resolveEvent(state, 0);
  assert.equal(state.archive[0].status, 'revealed');
  assert.ok(state.gatherings.some((g) => g.kind === 'assembly'));

  discoverFragment(state, 'buoy', [teodoro.id]);
  resolveEvent(state, 1);
  assert.equal(state.secrets, 1);
  const secret = state.rumors.find((r) => r.kind === 'secret');
  assert.ok(secret.knownBy.includes(teodoro.id));
  assert.equal(discoverFragment(state, 'buoy').ok, false, 'não se encontra o mesmo documento duas vezes');
});

test('o último fragmento abre a decisão final e a escolha encerra a partida', () => {
  const state = freshGame();
  for (const f of FRAGMENTS.slice(0, FRAGMENTS_TO_WIN)) {
    discoverFragment(state, f.id);
    resolveEvent(state, 0);
  }
  assert.equal(currentEvent(state).id, 'finalTruth');
  assert.equal(endCycle(state).ok, false, 'evento pendente bloqueia o dia');
  resolveEvent(state, 0);
  assert.equal(state.status, 'won');
  assert.deepEqual(state.outcome, { kind: 'ending', key: 'truth' });
});

test('casco a zero encerra a partida em derrota', () => {
  const state = freshGame();
  state.hull = 0.1;
  for (const r of state.residents) if (r.job === 'maintenance') r.job = null;
  endCycle(state);
  assert.equal(state.status, 'lost');
  assert.equal(state.outcome.key, 'hull');
  assert.equal(endCycle(state).ok, false);
});

test('revolta quando a maioria dos adultos perde a fé no Conselho', () => {
  const state = freshGame();
  for (const r of state.residents) r.opinion = 5;
  endCycle(state);
  assert.equal(state.status, 'lost');
  assert.equal(state.outcome.key, 'revolt');
});

test('salvar e carregar preserva o estado', () => {
  const state = freshGame();
  advance(state, 5);
  const copy = deserialize(serialize(state));
  assert.deepEqual(copy, state);
  assert.throws(() => deserialize(JSON.stringify({ version: 999 })));
});

test('quem pode trabalhar exclui crianças, idosos, doentes e quem está fora', () => {
  const state = freshGame();
  const nina = residentByKey(state, 'nina');
  const clara = residentByKey(state, 'clara');
  assert.equal(canWork(nina), false);
  assert.equal(canWork(clara), false);
  const irene = residentByKey(state, 'irene');
  irene.status = { kind: 'sick', days: 2 };
  assert.equal(canWork(irene), false);
});
