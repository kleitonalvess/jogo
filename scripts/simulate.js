// Simulador de balanceamento: joga partidas automáticas com estratégias
// simples e resume os resultados. Uso: node scripts/simulate.js [partidas] [dias]

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
  syncWorkers,
  toggleDecree,
} from '../src/engine/game.js';
import { LEVELS, MODULES, SLOTS_PER_LEVEL } from '../src/engine/data.js';
import { canWork, inBase } from '../src/engine/people/population.js';

const WEIGHTS = { oxygen: 0.3, water: 0.2, food: 0.2, materials: 0.3, energy: 0.05, hull: 1, morale: 0.8, trust: 1.2, secrets: -3, people: -12, speakerOpinion: 0.1, subjectOpinion: 0.1 };

function scoreChoice(state, choice) {
  let score = 0;
  for (const [key, value] of Object.entries(choice.effects)) {
    if (typeof value === 'number' && WEIGHTS[key]) score += value * WEIGHTS[key];
    if (key === 'modifier') score += (value.mult - 1) * value.cycles * 10;
    if (key === 'secret') score -= 4;
  }
  if (state.trust < 35 && choice.effects.trust) score += choice.effects.trust * 2;
  return score;
}

function resolveEvents(state, chooser) {
  let guard = 0;
  while (currentEvent(state) && state.status === 'playing' && guard++ < 10) {
    const def = eventDef(currentEvent(state));
    const options = def.choices.map((c, i) => ({ c, i })).filter(({ c }) => canAfford(state, c.effects));
    if (options.length === 0) {
      state.eventQueue.shift();
      continue;
    }
    resolveEvent(state, chooser(state, options).i);
  }
}

export const strategies = {
  // Não faz nada além de responder eventos com a primeira opção possível.
  passive(state) {
    resolveEvents(state, (s, options) => options[0]);
  },

  // Uma estratégia razoável, mas não ótima, para checar se o jogo é sustentável.
  steady(state) {
    resolveEvents(state, (s, options) => options.reduce((best, o) => (scoreChoice(s, o.c) > scoreChoice(s, best.c) ? o : best)));
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
  const pop = eco.population + 3;
  const building = state.modules.some((m) => m.buildLeft > 0);
  if (building && state.resources.materials < 70) return;

  const spareGenerator = state.modules.some((m) => (m.type === 'geothermal' || m.type === 'tidal') && (m.buildLeft > 0 || m.workers < MODULES[m.type].slots));
  if (eco.energy.net < 0 && !spareGenerator) {
    if (tryBuild(state, 'geothermal') || tryBuild(state, 'tidal')) return;
  }
  // Cada módulo a mais desgasta o casco: só expande com folga de reparo.
  if (eco.hull.wear > 6.5) return;
  if (capacity(state, 'oxygen') < pop) return void tryBuild(state, 'oxygen');
  if (capacity(state, 'farm') < pop) return void tryBuild(state, 'farm');
  if (capacity(state, 'water') < pop) return void tryBuild(state, 'water');
  if (housingCapacity(state) <= eco.population + 1) return void tryBuild(state, 'habitat');
  if (count(state, 'battery') === 0) return void tryBuild(state, 'battery');
}

function planWorkers(state) {
  // Reorganiza todo mundo do zero a cada dia, sempre olhando a previsão real.
  for (const r of state.residents) if (canWork(r) || r.job) r.job = null;
  syncWorkers(state);

  const pop = inBase(state).length + 1;
  const ration = state.decrees.rationing ? 0.75 : 1;
  const want = (key, perPerson) => {
    const need = pop * perPerson;
    return state.resources[key] > need * 4 ? need * 0.9 : need + 2;
  };
  const fillUntil = (type, done) => {
    for (const m of state.modules.filter((x) => x.type === type && x.buildLeft === 0)) {
      while (!done() && m.workers < MODULES[type].slots && idleWorkers(state) > 0) {
        if (!assignWorker(state, m.id, 1).ok) break;
      }
    }
  };
  const eco = () => computeEconomy(state);
  fillUntil('oxygen', () => eco().production.oxygen >= want('oxygen', 1));
  fillUntil('water', () => eco().production.water >= want('water', ration));
  fillUntil('farm', () => eco().production.food >= want('food', ration));
  fillUntil('geothermal', () => eco().energy.net >= 1);
  fillUntil('tidal', () => eco().energy.net >= 1);
  fillUntil('clinic', () => state.modules.some((m) => m.type === 'clinic' && m.workers > 0));

  const target = state.hull < 95 ? eco().hull.wear + (state.hull < 70 ? 2 : 0.5) : eco().hull.wear;
  while (eco().hull.repair < target && idleWorkers(state) > 0) {
    if (!setMaintenance(state, 1).ok) break;
  }
  const reserve = state.expedition ? 0 : 2;
  const spare = Math.max(0, idleWorkers(state) - reserve);
  fillUntil('workshop', () => idleWorkers(state) <= idleWorkers(state) - spare || idleWorkers(state) <= reserve);
}

function planDecrees(state) {
  const eco = computeEconomy(state);
  const wantRation = eco.after.food < 20 || eco.after.water < 20;
  if (state.decrees.rationing !== wantRation) toggleDecree(state, 'rationing');
}

function planExpedition(state) {
  if (state.resources.oxygen < 60 || state.resources.materials > 150) return;
  const team = Math.min(2, idleWorkers(state) + 1);
  if (team > 0 && canLaunchExpedition(state, 'wreck', team).ok) launchExpedition(state, 'wreck', team);
}

export function runBot(strategy, seed, maxDays = 60) {
  const state = createGame(seed);
  while (state.status === 'playing' && state.cycle <= maxDays) {
    strategies[strategy](state);
    if (state.status !== 'playing') break;
    const result = endCycle(state);
    if (!result.ok) throw new Error(result.error);
  }
  return state;
}

function summarize(strategy, games, maxDays) {
  const results = [];
  for (let seed = 1; seed <= games; seed++) results.push(runBot(strategy, seed, maxDays));
  const lost = results.filter((s) => s.status === 'lost');
  const alive = results.filter((s) => s.status === 'playing').length;
  const causes = {};
  for (const s of lost) causes[s.outcome.key] = (causes[s.outcome.key] || 0) + 1;
  const avg = (fn) => (results.reduce((a, s) => a + fn(s), 0) / results.length).toFixed(1);
  console.log(`\n== ${strategy} (${games} partidas, até o dia ${maxDays})`);
  console.log(`sobreviveram ${alive} · derrotas ${lost.length} ${JSON.stringify(causes)}`);
  console.log(
    `dia final médio ${avg((s) => s.cycle)} · população ${avg((s) => s.residents.filter((r) => r.alive).length)} · mortes ${avg((s) => s.stats.deaths)} · moral ${avg((s) => s.morale)} · confiança ${avg((s) => s.trust)} · vazamentos ${avg((s) => s.stats.leaks)}`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const games = Number(process.argv[2] || 100);
  const maxDays = Number(process.argv[3] || 60);
  for (const strategy of Object.keys(strategies)) summarize(strategy, games, maxDays);
}
