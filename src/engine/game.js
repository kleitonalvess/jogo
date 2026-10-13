// Motor da colônia. Funções puras sobre um objeto de estado serializável,
// sem dependência de DOM, para rodar no navegador e nos testes (Node).
//
// A população é feita de moradores com nome (people/). Cada vaga de módulo
// é ocupada por uma pessoa; a moral e a confiança são médias do humor e da
// opinião de cada um.

import {
  APTITUDE_BONUS,
  BASE_BATTERY,
  BIRTH_CYCLES,
  DECREE_CHANGE_TRUST,
  DECREES,
  DEPTH_PER_LEVEL_M,
  EVENT_CHANCE,
  EVENT_COOLDOWN,
  EXPEDITION_MAX_TEAM,
  EXPEDITION_SUPPLY,
  EXPEDITIONS,
  FRAGMENTS,
  FRAGMENTS_TO_WIN,
  HULL_FATIGUE_PER_CYCLE,
  HULL_WEAR_BASE,
  HULL_WEAR_PER_LEVEL,
  HULL_WEAR_PER_MODULE,
  LEVELS,
  MODULES,
  REPAIR_PER_MATERIAL,
  REPAIR_PER_WORKER,
  RESOURCES,
  SLOTS_PER_LEVEL,
  START,
  START_LAYOUT,
  TOP_DEPTH_M,
  UPKEEP,
} from './data.js';
import { DEFEATS, ENDINGS, RANDOM_EVENTS, STORY_EVENTS } from './events.js';
import { ITEMS } from './items.js';
import { canWork, createPopulation, displayName, inBase, isSick, living, residentById } from './people/population.js';
import {
  addSocialLog,
  adjustReputation,
  birth,
  createRumor,
  dailySocialUpdate,
  pickVictims,
  pruneGatherings,
  recordDeath,
  refreshAggregates,
  remember,
  revoltImminent,
  scheduleGathering,
  secretRumors,
  shiftMood,
  shiftOpinion,
  spreadRumors,
} from './people/social.js';
import { chance, createSeed, pick, randInt } from './rng.js';

export const SAVE_VERSION = 2;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---------------------------------------------------------------------------
// Criação

export function createGame(seed = createSeed(), options = {}) {
  const decrees = Object.fromEntries(Object.keys(DECREES).map((k) => [k, false]));
  const state = {
    version: SAVE_VERSION,
    seed,
    rng: seed,
    cycle: 1,
    time: { minute: START.minute },
    status: 'playing',
    outcome: null,
    resources: { ...START.resources },
    hull: START.hull,
    morale: 0,
    trust: 0,
    secrets: 0,
    revealed: 0,
    fragments: 0,
    found: [],
    maintenance: START.maintenance,
    modules: [],
    nextModuleId: 1,
    residents: [],
    nextResidentId: 1,
    rumors: [],
    nextRumorId: 1,
    gatherings: [],
    nextGatheringId: 1,
    decrees,
    decreesAtCycleStart: { ...decrees },
    modifiers: [],
    expedition: null,
    shortage: { water: 0, food: 0 },
    birthProgress: 0,
    eventQueue: [],
    eventCooldowns: {},
    flags: { finalQueued: false },
    archive: [],
    quests: {},
    world: { taken: {}, notes: {} },
    player: {
      name: options.name || 'Superintendente',
      g: options.g || 'f',
      appearance: options.appearance || { skin: 2, hair: 'curto', hairColor: 1, height: 1, build: 1, beard: 'nenhuma', extra: 'nenhum' },
      inventory: {},
      reputation: { truth: 0, mercy: 0 },
      known: {},
      talkedToday: [],
      suitTank: 100,
    },
    stats: { deaths: 0, births: 0, expeditions: 0, leaks: 0, conversations: 0, gifts: 0 },
    log: [],
  };
  for (const [type, level, slot] of START_LAYOUT) {
    state.modules.push({ id: state.nextModuleId++, type, level, slot, workers: 0, buildLeft: 0 });
  }
  createPopulation(state);
  syncWorkers(state);
  refreshAggregates(state);
  addLog(state, 'Severino Bastos, Superintendente da Colônia Nadir, foi sepultado no mar há duas semanas. O Conselho escolheu quem vai sucedê-lo.', 'story');
  return state;
}

// ---------------------------------------------------------------------------
// Consultas

export function depthOf(level) {
  return TOP_DEPTH_M + level * DEPTH_PER_LEVEL_M;
}

export function pressureOf(level) {
  return Math.round(depthOf(level) / 10 + 1);
}

export function moduleAt(state, level, slot) {
  return state.modules.find((m) => m.level === level && m.slot === slot) || null;
}

export function getModule(state, id) {
  return state.modules.find((m) => m.id === id) || null;
}

function activeModules(state) {
  return state.modules.filter((m) => m.buildLeft === 0);
}

// Quem conta como trabalhando: vivo, na base, em idade de trabalho e não doente.
function working(state) {
  return state.residents.filter((r) => r.job && canWork(r));
}

export function workersOf(state, moduleId) {
  return working(state).filter((r) => r.job === moduleId);
}

export function syncWorkers(state) {
  const counts = new Map();
  let maintenance = 0;
  for (const r of working(state)) {
    if (r.job === 'maintenance') maintenance += 1;
    else counts.set(r.job, (counts.get(r.job) || 0) + 1);
  }
  for (const m of state.modules) m.workers = counts.get(m.id) || 0;
  state.maintenance = maintenance;
}

export function idleResidents(state) {
  return state.residents.filter((r) => canWork(r) && !r.job);
}

export function idleWorkers(state) {
  return idleResidents(state).length;
}

export function assignedWorkers(state) {
  return working(state).length;
}

export function expeditionMembers(state) {
  return state.expedition ? state.expedition.members.length : 0;
}

// Pessoas que consomem recursos na base, contando você.
export function baseConsumers(state) {
  return inBase(state).length + 1;
}

export function totalPopulation(state) {
  return living(state).length;
}

export function housingCapacity(state) {
  return activeModules(state).reduce((sum, m) => sum + (MODULES[m.type].housing || 0), 0);
}

export function batteryCapacity(state) {
  return activeModules(state).reduce((sum, m) => sum + (MODULES[m.type].storage || 0), BASE_BATTERY);
}

export function moraleFactor(morale) {
  if (morale >= 75) return 1.1;
  if (morale >= 45) return 1;
  if (morale >= 25) return 0.85;
  return 0.7;
}

// Rendimento de uma pessoa: humor, aptidão e disposição.
export function workerFactor(state, r) {
  const mod = r.job && r.job !== 'maintenance' ? getModule(state, r.job) : null;
  const trade = mod ? MODULES[mod.type].trade : 'mecânica';
  const aptitude = trade && r.trade === trade ? APTITUDE_BONUS : 1;
  return moraleFactor(r.mood) * aptitude * r.personality.diligence * (state.decrees.doubleShift ? 1.25 : 1);
}

export function productivity(state) {
  const people = working(state);
  if (people.length === 0) return 1;
  return people.reduce((s, r) => s + workerFactor(state, r), 0) / people.length;
}

export function modifierMult(state, target) {
  return state.modifiers
    .filter((m) => m.target === target || (m.target === 'all' && target !== 'leak'))
    .reduce((acc, m) => acc * m.mult, 1);
}

export function hullFatigue(state) {
  return 1 + (state.cycle - 1) * HULL_FATIGUE_PER_CYCLE;
}

export function moduleWear(level) {
  return HULL_WEAR_PER_MODULE + HULL_WEAR_PER_LEVEL * level;
}

export function surfaceReading(state) {
  let reading = null;
  for (const id of state.found) {
    const f = FRAGMENTS.find((x) => x.id === id);
    if (f && f.surface !== null) reading = f.surface;
  }
  return reading;
}

function moduleLabor(state, mod) {
  return workersOf(state, mod.id).reduce((s, r) => s + workerFactor(state, r), 0);
}

// Produção de um módulo concluído no próximo dia, a partir da previsão.
export function moduleOutput(state, mod, eco) {
  const def = MODULES[mod.type];
  if (!def.produces || mod.buildLeft > 0) return null;
  const efficiency = def.produces === 'energy' ? 1 : eco.energy.efficiency;
  return {
    resource: def.produces,
    amount: moduleLabor(state, mod) * def.rate * efficiency * modifierMult(state, def.produces),
  };
}

// Resolve a parte determinística de um dia: energia, produção, consumo,
// reparos, desgaste e as variações de moral e confiança da colônia.
export function computeEconomy(state) {
  syncWorkers(state);
  const active = activeModules(state);

  let energyProduced = 0;
  let energyDemand = 0;
  for (const m of active) {
    const def = MODULES[m.type];
    if (def.energyOut) energyProduced += def.energyOut;
    if (def.produces === 'energy') energyProduced += moduleLabor(state, m) * def.rate * modifierMult(state, 'energy');
    if (def.energyUse) energyDemand += def.energyUse;
    if (def.energyPerWorker) energyDemand += m.workers * def.energyPerWorker;
  }
  const battery = state.resources.energy;
  const energyNet = energyProduced - energyDemand;
  const efficiency = energyNet >= 0 || energyDemand === 0 ? 1 : Math.min(1, (energyProduced + battery) / energyDemand);
  const blackout = efficiency < 1;
  const batteryAfter = clamp(battery + energyNet, 0, batteryCapacity(state));

  const production = { oxygen: 0, water: 0, food: 0, materials: 0 };
  for (const m of active) {
    const def = MODULES[m.type];
    if (def.produces && def.produces !== 'energy') {
      production[def.produces] += moduleLabor(state, m) * def.rate * efficiency * modifierMult(state, def.produces);
    }
  }

  const ration = state.decrees.rationing ? 0.75 : 1;
  const pop = baseConsumers(state);
  const consumption = {
    oxygen: pop * UPKEEP.oxygen,
    water: pop * UPKEEP.water * ration,
    food: pop * UPKEEP.food * ration,
    materials: 0,
  };

  let hullWear = HULL_WEAR_BASE;
  for (const m of state.modules) hullWear += moduleWear(m.level);
  hullWear *= hullFatigue(state);
  if (state.decrees.doubleShift) hullWear += 0.5;
  const crew = state.residents.filter((r) => r.job === 'maintenance' && canWork(r));
  const repairPotential = crew.reduce((s, r) => s + workerFactor(state, r), 0) * REPAIR_PER_WORKER;
  const hullRoom = Math.max(0, 100 - (state.hull - hullWear));
  const materialsAvailable = state.resources.materials + production.materials;
  const repair = Math.min(repairPotential, hullRoom, materialsAvailable * REPAIR_PER_MATERIAL);
  consumption.materials = repair / REPAIR_PER_MATERIAL;

  const after = {};
  for (const key of ['oxygen', 'water', 'food', 'materials']) {
    after[key] = state.resources[key] + production[key] - consumption[key];
  }
  const shortages = { oxygen: after.oxygen < 0, water: after.water < 0, food: after.food < 0 };
  const anyShortage = shortages.oxygen || shortages.water || shortages.food;

  const deaths = { oxygen: 0, water: 0, food: 0 };
  if (shortages.oxygen) deaths.oxygen = Math.ceil(-after.oxygen / 5);
  if (shortages.water && state.shortage.water + 1 >= 2) deaths.water = 1 + Math.floor(-after.water / 10);
  if (shortages.food && state.shortage.food + 1 >= 3) deaths.food = 1 + Math.floor(-after.food / 10);

  const housing = housingCapacity(state);
  const overcrowd = Math.max(0, pop - housing);
  const commons = active.filter((m) => m.type === 'commons').length;

  const morale = [];
  if (!anyShortage) morale.push(['Necessidades atendidas', 0.4]);
  if (overcrowd > 0) morale.push(['Superlotação', -Math.min(8, overcrowd * 0.5)]);
  if (commons > 0) morale.push(['Átrio', MODULES.commons.morale * commons * efficiency]);
  if (shortages.oxygen) morale.push(['Falta de oxigênio', -10]);
  if (shortages.water) morale.push(['Falta de água', -6]);
  if (shortages.food) morale.push(['Falta de comida', -5]);
  if (blackout) morale.push(['Apagão', -4]);
  if (state.decrees.rationing) morale.push(['Racionamento', -1.5]);
  if (state.decrees.doubleShift) morale.push(['Turnos dobrados', -2]);
  if (state.decrees.patrols) morale.push(['Patrulhas', -1]);

  const trust = [];
  if (state.morale < 30) {
    const loss = state.morale < 15 ? -3 : -1.5;
    trust.push(['Moral baixa', state.decrees.patrols ? loss / 2 : loss]);
  }
  if (state.morale >= 70) trust.push(['Moral alta', 0.5]);
  if (state.decrees.birthLicenses) trust.push(['Licenças de natalidade', 0.3]);
  if (anyShortage) trust.push(['Escassez', -1]);
  const decreeChanges = Object.keys(state.decrees).filter((k) => state.decrees[k] !== state.decreesAtCycleStart[k]).length;
  if (decreeChanges > 0) trust.push(['Mudanças no Estatuto', -DECREE_CHANGE_TRUST * decreeChanges]);

  return {
    productivity: productivity(state),
    energy: { produced: energyProduced, demand: energyDemand, net: energyNet, efficiency, blackout, batteryAfter, capacity: batteryCapacity(state) },
    production,
    consumption,
    after,
    shortages,
    deaths,
    hull: { wear: hullWear, repair, net: repair - hullWear },
    housing,
    population: pop,
    overcrowd,
    morale,
    trust,
    moraleDelta: morale.reduce((s, [, v]) => s + v, 0),
    trustDelta: trust.reduce((s, [, v]) => s + v, 0),
  };
}

// ---------------------------------------------------------------------------
// Ações do jogador. Retornam { ok, error } e alteram o estado.

function fail(error) {
  return { ok: false, error };
}

function isPlaying(state) {
  return state.status === 'playing';
}

export function levelReachable(state, level) {
  return level === 0 || state.modules.some((m) => m.level === level - 1);
}

export function canBuild(state, type, level, slot) {
  const def = MODULES[type];
  if (!def || def.buildable === false) return fail('Módulo indisponível.');
  if (level < 0 || level >= LEVELS || slot < 0 || slot >= SLOTS_PER_LEVEL) return fail('Posição inválida.');
  if (moduleAt(state, level, slot)) return fail('Espaço ocupado.');
  if (!levelReachable(state, level)) return fail('Construa primeiro no nível de cima.');
  if (def.minLevel !== undefined && level < def.minLevel) return fail(`Só a partir do nível ${def.minLevel + 1}.`);
  if (def.maxLevel !== undefined && level > def.maxLevel) return fail(`Só até o nível ${def.maxLevel + 1}.`);
  if (def.max && state.modules.filter((m) => m.type === type).length >= def.max) return fail('Limite atingido.');
  if (state.resources.materials < def.cost) return fail(`Faltam ${Math.ceil(def.cost - state.resources.materials)} de materiais.`);
  return { ok: true };
}

export function build(state, type, level, slot) {
  if (!isPlaying(state)) return fail('A partida terminou.');
  const check = canBuild(state, type, level, slot);
  if (!check.ok) return check;
  const def = MODULES[type];
  state.resources.materials -= def.cost;
  const mod = { id: state.nextModuleId++, type, level, slot, workers: 0, buildLeft: def.buildCycles };
  state.modules.push(mod);
  addLog(state, `Obra iniciada: ${def.name} no nível ${level + 1}.`, 'info');
  return { ok: true, module: mod };
}

export function demolishRefund(mod) {
  return Math.floor(MODULES[mod.type].cost / 2);
}

export function demolish(state, id) {
  if (!isPlaying(state)) return fail('A partida terminou.');
  const mod = getModule(state, id);
  if (!mod) return fail('Módulo não encontrado.');
  if (MODULES[mod.type].buildable === false) return fail('O Núcleo não pode ser desmontado.');
  if (state.modules.some((m) => m.level === mod.level + 1) && !state.modules.some((m) => m.level === mod.level && m.id !== id)) {
    return fail('Este módulo sustenta os níveis de baixo.');
  }
  if (mod.type === 'dock' && state.expedition) return fail('Há uma equipe lá fora.');
  if (MODULES[mod.type].housing) {
    const residents = living(state).filter((r) => r.home === id);
    const other = state.modules.filter((m) => m.id !== id && MODULES[m.type].housing && m.buildLeft === 0);
    if (other.length === 0) return fail('Ninguém teria onde dormir.');
    for (const r of residents) r.home = other[r.id % other.length].id;
  }
  for (const r of state.residents) if (r.job === id) r.job = null;
  state.resources.materials += demolishRefund(mod);
  state.modules = state.modules.filter((m) => m.id !== id);
  syncWorkers(state);
  return { ok: true };
}

function slotsOf(mod) {
  return MODULES[mod.type].slots || 0;
}

// Coloca uma pessoa específica numa função (ou a deixa sem função).
export function assignJob(state, residentId, job) {
  if (!isPlaying(state)) return fail('A partida terminou.');
  const r = residentById(state, residentId);
  if (!r || !r.alive) return fail('Morador não encontrado.');
  if (r.role) return fail(`${displayName(r)} tem outra função no Conselho.`);
  if (job !== null && !canWork(r)) return fail(`${displayName(r)} não pode trabalhar agora.`);
  if (job !== null && job !== 'maintenance') {
    const mod = getModule(state, job);
    if (!mod) return fail('Módulo não encontrado.');
    if (mod.buildLeft > 0) return fail('Módulo em construção.');
    if (r.job !== job && workersOf(state, job).length >= slotsOf(mod)) return fail('Sem vagas.');
  }
  r.job = job;
  syncWorkers(state);
  return { ok: true };
}

function bestIdleFor(state, mod) {
  const trade = mod ? MODULES[mod.type].trade : 'mecânica';
  const idle = idleResidents(state);
  if (idle.length === 0) return null;
  return idle.slice().sort((a, b) => {
    const ma = a.trade === trade ? 1 : 0;
    const mb = b.trade === trade ? 1 : 0;
    if (ma !== mb) return mb - ma;
    return b.personality.diligence - a.personality.diligence || a.id - b.id;
  })[0];
}

function worstAssigned(state, list, mod) {
  const trade = mod ? MODULES[mod.type].trade : 'mecânica';
  return list.slice().sort((a, b) => {
    const ma = a.trade === trade ? 1 : 0;
    const mb = b.trade === trade ? 1 : 0;
    if (ma !== mb) return ma - mb;
    return a.personality.diligence - b.personality.diligence || b.id - a.id;
  })[0];
}

export function assignWorker(state, id, delta) {
  if (!isPlaying(state)) return fail('A partida terminou.');
  const mod = getModule(state, id);
  if (!mod) return fail('Módulo não encontrado.');
  if (mod.buildLeft > 0) return fail('Módulo em construção.');
  const current = workersOf(state, id);
  if (delta > 0) {
    if (current.length >= slotsOf(mod)) return fail('Sem vagas.');
    const r = bestIdleFor(state, mod);
    if (!r) return fail('Ninguém disponível.');
    return assignJob(state, r.id, id);
  }
  if (current.length === 0) return fail('Sem vagas.');
  return assignJob(state, worstAssigned(state, current, mod).id, null);
}

export function setMaintenance(state, delta) {
  if (!isPlaying(state)) return fail('A partida terminou.');
  if (delta > 0) {
    const r = bestIdleFor(state, null);
    if (!r) return fail('Ninguém disponível.');
    return assignJob(state, r.id, 'maintenance');
  }
  const crew = state.residents.filter((r) => r.job === 'maintenance' && canWork(r));
  if (crew.length === 0) return fail('Equipe vazia.');
  return assignJob(state, worstAssigned(state, crew, null).id, null);
}

export function toggleDecree(state, key) {
  if (!isPlaying(state)) return fail('A partida terminou.');
  if (!(key in state.decrees)) return fail('Decreto desconhecido.');
  state.decrees[key] = !state.decrees[key];
  return { ok: true };
}

export function expeditionSupplies(destination, members) {
  const cycles = EXPEDITIONS[destination].cycles;
  return {
    oxygen: EXPEDITION_SUPPLY.oxygen * members * cycles,
    food: EXPEDITION_SUPPLY.food * members * cycles,
  };
}

export function hasDock(state) {
  return activeModules(state).some((m) => m.type === 'dock');
}

// Quem iria numa expedição de n pessoas: o escafandrista-chefe se puder,
// depois ociosos e por fim quem tem menos aptidão onde está.
export function expeditionCandidates(state, members) {
  const pool = [];
  const diver = state.residents.find((r) => r.role === 'diver' && r.alive && !r.away && !isSick(r));
  if (diver) pool.push(diver);
  for (const r of idleResidents(state)) if (pool.length < members) pool.push(r);
  return pool.slice(0, members);
}

export function canLaunchExpedition(state, destination, members) {
  if (!EXPEDITIONS[destination]) return fail('Destino desconhecido.');
  if (!hasDock(state)) return fail('Construa uma Eclusa de Escafandros.');
  if (state.expedition) return fail('Já há uma equipe lá fora.');
  if (members < 1 || members > EXPEDITION_MAX_TEAM) return fail(`A equipe deve ter de 1 a ${EXPEDITION_MAX_TEAM} pessoas.`);
  if (expeditionCandidates(state, members).length < members) return fail('Não há pessoas ociosas suficientes.');
  const supplies = expeditionSupplies(destination, members);
  if (state.resources.oxygen < supplies.oxygen) return fail('Oxigênio insuficiente para os tanques.');
  if (state.resources.food < supplies.food) return fail('Comida insuficiente para a viagem.');
  return { ok: true };
}

export function launchExpedition(state, destination, members) {
  if (!isPlaying(state)) return fail('A partida terminou.');
  const check = canLaunchExpedition(state, destination, members);
  if (!check.ok) return check;
  const team = expeditionCandidates(state, members);
  const supplies = expeditionSupplies(destination, members);
  state.resources.oxygen -= supplies.oxygen;
  state.resources.food -= supplies.food;
  for (const r of team) r.away = true;
  state.expedition = { destination, members: team.map((r) => r.id), cyclesLeft: EXPEDITIONS[destination].cycles };
  state.stats.expeditions += 1;
  syncWorkers(state);
  addLog(state, `${team.map(displayName).join(', ')} ${team.length > 1 ? 'saíram' : 'saiu'} rumo a ${EXPEDITIONS[destination].name}.`, 'info');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Fragmentos e arquivo

export function fragmentIndex(id) {
  return FRAGMENTS.findIndex((f) => f.id === id);
}

// Um documento da fundação foi encontrado. Quem estava junto também sabe.
export function discoverFragment(state, id, witnesses = []) {
  const index = fragmentIndex(id);
  if (index < 0 || state.found.includes(id)) return fail('Fragmento já encontrado.');
  state.found.push(id);
  state.fragments = state.found.length;
  state.eventQueue.unshift({ id: 'fragment', data: { index, witnesses } });
  addLog(state, `Documento da fundação encontrado: ${FRAGMENTS[index].title}.`, 'story');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Eventos

export function currentEvent(state) {
  return state.eventQueue[0] || null;
}

export function eventDef(entry) {
  return RANDOM_EVENTS[entry.id] || STORY_EVENTS[entry.id];
}

export function eventTitle(state, entry) {
  const def = eventDef(entry);
  return typeof def.title === 'function' ? def.title(state, entry.data || {}) : def.title;
}

export function eventText(state, entry) {
  const def = eventDef(entry);
  return typeof def.text === 'function' ? def.text(state, entry.data || {}) : def.text;
}

export function eventSpeaker(state, entry) {
  return entry && entry.data && entry.data.speaker ? residentById(state, entry.data.speaker) : null;
}

export function canAfford(state, effects) {
  for (const key of Object.keys(RESOURCES)) {
    if (effects[key] < 0 && state.resources[key] < -effects[key]) return false;
  }
  if (effects.people < 0 && inBase(state).length <= -effects.people) return false;
  return true;
}

export function resolveEvent(state, choiceIndex) {
  const entry = currentEvent(state);
  if (!entry) return fail('Nenhum evento pendente.');
  const def = eventDef(entry);
  const choice = def.choices[choiceIndex];
  if (!choice) return fail('Escolha inválida.');
  if (!canAfford(state, choice.effects)) return fail('Recursos insuficientes para esta escolha.');
  state.eventQueue.shift();
  const data = entry.data || {};
  applyEffects(state, choice.effects, data, choice.label);
  if (choice.archive) archiveFragment(state, data, choice.archive);
  const outcome = typeof choice.outcome === 'function' ? choice.outcome(state, data) : choice.outcome;
  addLog(state, `${eventTitle(state, entry)}: ${choice.label}.${outcome ? ' ' + outcome : ''}`, 'event');

  if (entry.id === 'fragment' && state.found.length >= FRAGMENTS_TO_WIN && !state.flags.finalQueued) {
    state.flags.finalQueued = true;
    state.eventQueue.push({ id: 'finalTruth', data: {} });
  }
  if (choice.effects.ending) {
    state.status = 'won';
    state.outcome = { kind: 'ending', key: choice.effects.ending };
  }
  checkDefeat(state);
  return { ok: true, outcome };
}

function archiveFragment(state, data, status) {
  const fragment = FRAGMENTS[data.index];
  state.archive.push({ id: fragment.id, index: data.index, status, day: state.cycle });
  if (status === 'sealed') {
    createRumor(state, {
      kind: 'secret',
      key: fragment.id,
      label: `o Conselho escondeu o documento "${fragment.title}"`,
      text: `Dizem que acharam um papel da fundação, ${fragment.title}, e que o Conselho trancou.`,
      opinion: -3,
      align: { truth: 1 },
      knownBy: data.witnesses || [],
    });
  } else {
    state.revealed += 1;
    scheduleGathering(state, { kind: 'assembly', about: fragment.id, day: state.cycle, start: 19 * 60, end: 20 * 60, place: 'commons' });
  }
}

// Abre o segredo mais antigo ainda lacrado.
function revealOneSecret(state) {
  const rumor = secretRumors(state)[0];
  if (!rumor) return;
  rumor.public = true;
  for (const r of living(state)) if (!rumor.knownBy.includes(r.id)) rumor.knownBy.push(r.id);
  state.secrets = Math.max(0, state.secrets - 1);
  state.revealed += 1;
  if (rumor.key) {
    const entry = state.archive.find((a) => a.id === rumor.key && a.status === 'sealed');
    if (entry) entry.status = 'revealed';
  }
}

export function applyEffects(state, effects, data = {}, reason = '') {
  for (const key of Object.keys(RESOURCES)) {
    if (effects[key]) {
      const cap = key === 'energy' ? batteryCapacity(state) : Infinity;
      state.resources[key] = clamp(state.resources[key] + effects[key], 0, cap);
    }
  }
  if (effects.hull) state.hull = clamp(state.hull + effects.hull, 0, 100);
  if (effects.morale) shiftMood(state, effects.morale);
  if (effects.trust) shiftOpinion(state, effects.trust);
  if (effects.rep) adjustReputation(state, effects.rep);
  if (effects.secrets) state.secrets = Math.max(0, state.secrets + effects.secrets);

  const speaker = data.speaker ? residentById(state, data.speaker) : null;
  const subject = data.subject ? residentById(state, data.subject) : null;
  const note = reason ? `Você decidiu: ${reason.toLowerCase()}.` : 'Uma decisão do Conselho.';
  if (effects.speakerOpinion && speaker) {
    speaker.opinion = clamp(speaker.opinion + effects.speakerOpinion, 0, 100);
    remember(speaker, { day: state.cycle, kind: 'player', text: note, weight: effects.speakerOpinion });
  }
  if (effects.subjectOpinion && subject) {
    subject.opinion = clamp(subject.opinion + effects.subjectOpinion, 0, 100);
    remember(subject, { day: state.cycle, kind: 'player', text: note, weight: effects.subjectOpinion });
  }
  if (effects.bond && speaker && subject) {
    speaker.bonds[subject.id] = clamp((speaker.bonds[subject.id] || 0) + effects.bond, -100, 100);
    subject.bonds[speaker.id] = clamp((subject.bonds[speaker.id] || 0) + effects.bond, -100, 100);
  }
  if (effects.marry && speaker && subject) {
    speaker.kin[subject.id] = 'spouse';
    subject.kin[speaker.id] = 'spouse';
    speaker.bonds[subject.id] = Math.max(80, speaker.bonds[subject.id] || 0);
    subject.bonds[speaker.id] = Math.max(80, subject.bonds[speaker.id] || 0);
    subject.home = speaker.home;
    scheduleGathering(state, { kind: 'wedding', about: speaker.id, day: state.cycle, start: 19 * 60, end: 21 * 60, place: 'commons' });
  }
  if (effects.twins && speaker && subject) {
    birth(state, [speaker, subject]);
    birth(state, [speaker, subject]);
  }
  if (effects.secret) {
    state.secrets += 1;
    const knownBy = new Set();
    for (const r of [speaker, subject]) {
      if (!r) continue;
      knownBy.add(r.id);
      for (const id of Object.keys(r.kin)) knownBy.add(Number(id));
    }
    createRumor(state, { kind: 'secret', label: effects.secret.label, text: effects.secret.text, opinion: -2, align: { truth: 1 }, knownBy: [...knownBy] });
  }
  if (effects.revealOne) revealOneSecret(state);
  if (effects.people > 0 && !effects.twins) {
    for (let i = 0; i < effects.people; i++) birth(state);
  }
  if (effects.people < 0) {
    const n = -effects.people;
    const victims = effects.victim === 'speaker' && speaker ? [speaker] : effects.victim === 'subject' && subject ? [subject] : pickVictims(state, n);
    for (const v of victims) recordDeath(state, v, effects.cause || 'acidente', { blame: effects.cause === 'ascension' ? 0 : 2 });
    syncWorkers(state);
  }
  if (effects.sick) {
    const healthy = inBase(state).filter((r) => !isSick(r));
    const clinicStaffed = state.modules.some((m) => m.type === 'clinic' && m.buildLeft === 0 && workersOf(state, m.id).length > 0);
    for (let i = 0; i < effects.sick && healthy.length > 0; i++) {
      const r = healthy.splice(randInt(state, 0, healthy.length - 1), 1)[0];
      r.status = { kind: 'sick', days: clinicStaffed ? 2 : 4 };
    }
    syncWorkers(state);
  }
  if (effects.modifier) state.modifiers.push({ ...effects.modifier });
  if (effects.flag) state.flags[effects.flag] = true;
  if (effects.item) giveItem(state, effects.item, 1);
  refreshAggregates(state);
}

// ---------------------------------------------------------------------------
// Inventário

export function giveItem(state, id, qty = 1) {
  if (!ITEMS[id]) return;
  state.player.inventory[id] = (state.player.inventory[id] || 0) + qty;
}

export function takeItem(state, id, qty = 1) {
  const have = state.player.inventory[id] || 0;
  if (have < qty) return false;
  if (have === qty) delete state.player.inventory[id];
  else state.player.inventory[id] = have - qty;
  return true;
}

export function hasItem(state, id, qty = 1) {
  return (state.player.inventory[id] || 0) >= qty;
}

// ---------------------------------------------------------------------------
// Fim do dia

export function endCycle(state) {
  if (!isPlaying(state)) return fail('A partida terminou.');
  if (state.eventQueue.length > 0) return fail('Resolva o evento pendente antes de encerrar o dia.');

  const logStart = state.log.length ? state.log[0] : null;
  const before = snapshot(state);
  const eco = computeEconomy(state);
  const cycle = state.cycle;

  // Energia e recursos
  state.resources.energy = eco.energy.batteryAfter;
  for (const key of ['oxygen', 'water', 'food', 'materials']) state.resources[key] = Math.max(0, eco.after[key]);
  if (eco.energy.blackout) addLog(state, 'Apagão: as baterias secaram e os módulos operaram abaixo da capacidade.', 'warn');

  // Escassez
  state.shortage.water = eco.shortages.water ? state.shortage.water + 1 : 0;
  state.shortage.food = eco.shortages.food ? state.shortage.food + 1 : 0;
  for (const key of ['oxygen', 'water', 'food']) {
    if (eco.deaths[key] > 0) {
      for (const v of pickVictims(state, eco.deaths[key])) recordDeath(state, v, key, { blame: 3 });
    } else if (eco.shortages[key]) {
      addLog(state, `Faltou ${RESOURCES[key].label.toLowerCase()} hoje.`, 'warn');
    }
  }

  // Casco
  state.hull = clamp(state.hull + eco.hull.net, 0, 100);

  // Humor e opinião de cada morador
  dailySocialUpdate(state, eco);
  state.decreesAtCycleStart = { ...state.decrees };

  // Obras
  for (const m of state.modules) {
    if (m.buildLeft > 0) {
      m.buildLeft -= 1;
      if (m.buildLeft === 0) addLog(state, `${MODULES[m.type].name} concluído no nível ${m.level + 1}.`, 'good');
    }
  }

  // Expedição
  if (state.expedition) {
    state.expedition.cyclesLeft -= 1;
    if (state.expedition.cyclesLeft <= 0) resolveExpedition(state);
  }

  // Nascimentos
  const room = housingCapacity(state) > baseConsumers(state) + expeditionMembers(state);
  if (state.decrees.birthLicenses && room && state.resources.food >= baseConsumers(state) * 2 && state.morale >= 50) {
    state.birthProgress += 1;
    if (state.birthProgress >= BIRTH_CYCLES) {
      state.birthProgress = 0;
      birth(state);
    }
  }

  // Boatos e segredos circulam
  spreadRumors(state);

  // Modificadores temporários
  for (const m of state.modifiers) m.cycles -= 1;
  state.modifiers = state.modifiers.filter((m) => m.cycles > 0);

  state.cycle += 1;
  state.time.minute = 6 * 60;
  state.player.talkedToday = [];
  pruneGatherings(state);
  syncWorkers(state);
  refreshAggregates(state);

  checkDefeat(state);
  if (isPlaying(state)) rollEvent(state);

  const fresh = [];
  for (const entry of state.log) {
    if (entry === logStart) break;
    fresh.push(entry);
  }
  return { ok: true, report: { cycle, before, after: snapshot(state), entries: fresh.reverse() } };
}

function resolveExpedition(state) {
  const exp = state.expedition;
  const dest = EXPEDITIONS[exp.destination];
  const team = exp.members.map((id) => residentById(state, id)).filter(Boolean);
  const hasDiver = team.some((r) => r.role === 'diver');
  const risk = dest.risk * (hasDiver ? 0.6 : 1);
  const lost = [];
  for (const r of team) if (chance(state, risk)) lost.push(r);
  const survivors = team.filter((r) => !lost.includes(r));
  let loot = 0;
  for (let i = 0; i < survivors.length; i++) loot += randInt(state, dest.loot[0], dest.loot[1]);

  state.expedition = null;
  for (const r of team) r.away = false;
  state.resources.materials += loot;
  for (const r of lost) recordDeath(state, r, 'expedition', { blame: 1 });

  if (survivors.length === 0) {
    addLog(state, `A equipe enviada a ${dest.name} não voltou.`, 'crit');
  } else {
    const names = survivors.map(displayName).join(', ');
    addLog(state, `${names} ${survivors.length > 1 ? 'voltaram' : 'voltou'} de ${dest.name} com ${loot} de materiais.`, lost.length ? 'warn' : 'good');
    for (const r of survivors) remember(r, { day: state.cycle, kind: 'expedition', text: `Voltou de ${dest.name}.`, weight: 3 });
    if (chance(state, 0.35)) {
      const relics = Object.keys(ITEMS).filter((id) => ITEMS[id].gift && ITEMS[id].category !== 'food' && !(state.player.inventory[id] > 0));
      if (relics.length) {
        const id = pick(state, relics);
        giveItem(state, id, 1);
        addLog(state, `${displayName(survivors[0])} trouxe uma relíquia para você: ${ITEMS[id].name}.`, 'good');
      }
    }
  }
  syncWorkers(state);
}

function rollEvent(state) {
  if (state.eventQueue.length > 0 || state.cycle < 3) return;
  if (!chance(state, EVENT_CHANCE)) return;
  const eligible = Object.entries(RANDOM_EVENTS)
    .filter(([id, def]) => (!def.when || def.when(state)) && state.cycle - (state.eventCooldowns[id] ?? -Infinity) >= EVENT_COOLDOWN)
    .map(([id]) => id);
  for (let attempt = 0; attempt < 4 && eligible.length > 0; attempt++) {
    const id = pick(state, eligible);
    const def = RANDOM_EVENTS[id];
    const speaker = def.speaker ? def.speaker(state) : null;
    if (def.speaker && !speaker && !def.alarm && ['ascensionRequest', 'relic', 'twins', 'feud', 'wedding', 'theft'].includes(id)) {
      eligible.splice(eligible.indexOf(id), 1);
      continue;
    }
    const subject = def.subject && speaker ? def.subject(state, speaker) : def.subject ? def.subject(state, null) : null;
    if (def.subject && !subject) {
      eligible.splice(eligible.indexOf(id), 1);
      continue;
    }
    state.eventCooldowns[id] = state.cycle;
    state.eventQueue.push({ id, data: { speaker: speaker ? speaker.id : null, subject: subject ? subject.id : null } });
    return;
  }
}

function checkDefeat(state) {
  if (!isPlaying(state)) return;
  let key = null;
  if (state.hull <= 0) key = 'hull';
  else if (totalPopulation(state) <= 0) key = 'extinct';
  else if (revoltImminent(state)) key = 'revolt';
  if (key) {
    state.status = 'lost';
    state.outcome = { kind: 'defeat', key };
    state.eventQueue = [];
  }
}

export function outcomeText(state) {
  if (!state.outcome) return null;
  const table = state.outcome.kind === 'ending' ? ENDINGS : DEFEATS;
  const def = table[state.outcome.key];
  return { title: def.title, text: typeof def.text === 'function' ? def.text(state) : def.text };
}

function snapshot(state) {
  return { ...state.resources, hull: state.hull, morale: state.morale, trust: state.trust, population: totalPopulation(state) };
}

export function addLog(state, text, tone = 'info', about = null) {
  addSocialLog(state, text, tone, about);
}

// ---------------------------------------------------------------------------
// Salvamento

export function serialize(state) {
  return JSON.stringify(state);
}

export function deserialize(json) {
  const data = JSON.parse(json);
  if (!data || data.version !== SAVE_VERSION) throw new Error('Save incompatível.');
  return data;
}

