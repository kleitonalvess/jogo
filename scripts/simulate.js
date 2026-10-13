// Simulador de balanceamento: joga partidas automáticas com estratégias
// simples e resume os resultados. Uso: node scripts/simulate.js [partidas] [ciclos]

import {
  assignWorker,
  build,
  canAfford,
  canBuild,
  canLaunchExpedition,
  computeEconomy,
  createGame,
  currentEvent,
  endCycle,
  eventDef,
  housingCapacity,
  idleWorkers,
  launchExpedition,
  resolveEvent,
  setMaintenance,
  toggleDecree,
} from '../src/engine/game.js';
import { LEVELS, MODULES, SLOTS_PER_LEVEL } from '../src/engine/data.js';

const WEIGHTS = { oxygen: 0.3, water: 0.2, food: 0.2, materials: 0.3, energy: 0.05, hull: 1, morale: 0.8, trust: 1.2, secrets: -2, people: -12 };

function scoreChoice(state, choice) {
  let score = 0;
  for (const [key, value] of Object.entries(choice.effects)) {
    if (typeof value === 'number' && WEIGHTS[key]) score += value * WEIGHTS[key];
    if (key === 'modifier') score += (value.mult - 1) * value.cycles * 10;
  }
  if (state.trust < 30 && choice.effects.trust) score += choice.effects.trust * 2;
  return score;
}

function resolveEvents(state, chooser) {
  let guard = 0;
  while (currentEvent(state) && state.status === 'playing' && guard++ < 10) {
    const def = eventDef(currentEvent(state));
    const options = def.choices.map((c, i) => ({ c, i })).filter(({ c }) => canAfford(state, c.effects));
    const picked = chooser(state, options);
    resolveEvent(state, picked.i);
  }
}

export const strategies = {
  // Não faz nada além de responder eventos com a primeira opção possível.
  passive(state) {
    resolveEvents(state, (s, options) => options[0]);
  },

  // Uma estratégia razoável, mas não ótima, para checar se o jogo é vencível.
  steady(state) {
    resolveEvents(state, (s, options) =>
      options.reduce((best, o) => (scoreChoice(s, o.c) > scoreChoice(s, best.c) ? o : best)),
    );
    if (state.status !== 'playing') return;

    planBuilds(state);
    planWorkers(state);
    planDecrees(state);
    planExpedition(state);
  },
};

function firstFreeSlot(state, type) {
  for (let level = 0; level < LEVELS; level++) {
    for (let slot = 0; slot < SLOTS_PER_LEVEL; slot++) {
      if (canBuild(state, type, level, slot).ok) return { level, slot };
    }
  }
  return null;
}

function count(state, type) {
  return state.modules.filter((m) => m.type === type).length;
}

function capacity(state, type) {
  return count(state, type) * (MODULES[type].slots || 0) * (MODULES[type].rate || 0);
}

function tryBuild(state, type) {
  const spot = firstFreeSlot(state, type);
  if (spot) return build(state, type, spot.level, spot.slot).ok;
  return false;
}

function planBuilds(state) {
  const eco = computeEconomy(state);
  const pop = state.population + 4;
  const building = state.modules.some((m) => m.buildLeft > 0);
  if (building && state.resources.materials < 60) return;

  if (count(state, 'workshop') === 0) return void tryBuild(state, 'workshop');
  if (eco.energy.net < 2) {
    if (tryBuild(state, 'tidal') || tryBuild(state, 'geothermal')) return;
  }
  if (capacity(state, 'oxygen') < pop) return void tryBuild(state, 'oxygen');
  if (capacity(state, 'farm') < pop) return void tryBuild(state, 'farm');
  if (capacity(state, 'water') < pop) return void tryBuild(state, 'water');
  if (housingCapacity(state) <= state.population + 1) return void tryBuild(state, 'habitat');
  if (count(state, 'dock') === 0 && state.cycle >= 6) return void tryBuild(state, 'dock');
  if (count(state, 'commons') === 0 && state.morale < 55) return void tryBuild(state, 'commons');
  if (count(state, 'battery') === 0) return void tryBuild(state, 'battery');
}

function planWorkers(state) {
  // Reorganiza todo mundo do zero a cada ciclo.
  for (const m of state.modules) m.workers = 0;
  state.maintenance = 0;

  const pop = state.population;
  const ration = state.decrees.rationing ? 0.75 : 1;
  const target = (key, perPerson) => {
    const need = pop * perPerson;
    return state.resources[key] > need * 4 ? need - 3 : need + 1;
  };
  const fill = (type, needed) => {
    let produced = 0;
    for (const m of state.modules.filter((x) => x.type === type && x.buildLeft === 0)) {
      while (produced < needed && m.workers < MODULES[type].slots && idleWorkers(state) > 0) {
        assignWorker(state, m.id, 1);
        produced += MODULES[type].rate;
      }
    }
  };
  fill('oxygen', target('oxygen', 1));
  fill('water', target('water', ration));
  fill('farm', target('food', ration));
  const energyGap = () => -computeEconomy(state).energy.net;
  fill('tidal', Math.max(0, energyGap()) + 1);
  fill('geothermal', Math.max(0, energyGap()) + 1);

  const wear = computeEconomy(state).hull.wear;
  const crew = state.hull < 97 ? Math.ceil((wear + (state.hull < 70 ? 2 : 0)) / 1.5) : 0;
  for (let i = 0; i < crew && idleWorkers(state) > 0; i++) setMaintenance(state, 1);
  const reserve = state.expedition ? 0 : 2;
  fill('workshop', Math.max(0, idleWorkers(state) - reserve) * MODULES.workshop.rate);
}

function planDecrees(state) {
  const eco = computeEconomy(state);
  const wantRation = eco.after.food < 15 || eco.after.water < 15;
  if (state.decrees.rationing !== wantRation) toggleDecree(state, 'rationing');
  const wantBirths = state.morale >= 55 && state.cycle > 10;
  if (state.decrees.birthLicenses !== wantBirths) toggleDecree(state, 'birthLicenses');
}

function planExpedition(state) {
  if (state.resources.oxygen < 50) return;
  const team = Math.min(2, idleWorkers(state));
  if (team > 0 && canLaunchExpedition(state, 'rift', team).ok) launchExpedition(state, 'rift', team);
}

export function runBot(strategy, seed, maxCycles = 80) {
  const state = createGame(seed);
  while (state.status === 'playing' && state.cycle <= maxCycles) {
    strategies[strategy](state);
    if (state.status !== 'playing') break;
    const result = endCycle(state);
    if (!result.ok) throw new Error(result.error);
  }
  return state;
}

function summarize(strategy, games, maxCycles) {
  const results = [];
  for (let seed = 1; seed <= games; seed++) results.push(runBot(strategy, seed, maxCycles));
  const won = results.filter((s) => s.status === 'won').length;
  const lost = results.filter((s) => s.status === 'lost');
  const alive = results.filter((s) => s.status === 'playing').length;
  const causes = {};
  for (const s of lost) causes[s.outcome.key] = (causes[s.outcome.key] || 0) + 1;
  const avg = (fn) => (results.reduce((a, s) => a + fn(s), 0) / results.length).toFixed(1);
  console.log(`\n== ${strategy} (${games} partidas, até ${maxCycles} ciclos)`);
  console.log(`vitórias ${won} · derrotas ${lost.length} ${JSON.stringify(causes)} · vivas no limite ${alive}`);
  console.log(`ciclo final médio ${avg((s) => s.cycle)} · fragmentos ${avg((s) => s.fragments)} · população ${avg((s) => s.population)} · perdas ${avg((s) => s.stats.deaths)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const games = Number(process.argv[2] || 200);
  const maxCycles = Number(process.argv[3] || 80);
  for (const strategy of Object.keys(strategies)) summarize(strategy, games, maxCycles);
}
