// Motor de simulação. Funções puras sobre um objeto de estado serializável,
// sem dependência de DOM, para rodar no navegador e nos testes (Node).

import {
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
import { chance, createSeed, pick, randInt } from './rng.js';

export const SAVE_VERSION = 1;
const LOG_LIMIT = 80;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---------------------------------------------------------------------------
// Criação

export function createGame(seed = createSeed()) {
  const decrees = Object.fromEntries(Object.keys(DECREES).map((k) => [k, false]));
  const state = {
    version: SAVE_VERSION,
    seed,
    rng: seed,
    cycle: 1,
    status: 'playing',
    outcome: null,
    resources: { ...START.resources },
    hull: START.hull,
    morale: START.morale,
    trust: START.trust,
    secrets: 0,
    revealed: 0,
    fragments: 0,
    population: START.population,
    maintenance: START.maintenance,
    modules: [],
    nextModuleId: 1,
    decrees,
    decreesAtCycleStart: { ...decrees },
    modifiers: [],
    expedition: null,
    shortage: { water: 0, food: 0 },
    birthProgress: 0,
    eventQueue: [],
    eventCooldowns: {},
    flags: { signalBoost: false, finalQueued: false },
    archive: [],
    stats: { deaths: 0, births: 0, expeditions: 0, leaks: 0 },
    log: [],
  };
  for (const [type, level, slot, workers] of START_LAYOUT) {
    state.modules.push({ id: state.nextModuleId++, type, level, slot, workers, buildLeft: 0 });
  }
  addLog(state, 'A Colônia Nadir aguarda suas ordens. O ar dura enquanto as máquinas girarem.', 'info');
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

export function assignedWorkers(state) {
  return state.modules.reduce((sum, m) => sum + m.workers, 0) + state.maintenance;
}

export function idleWorkers(state) {
  return state.population - assignedWorkers(state);
}

export function expeditionMembers(state) {
  return state.expedition ? state.expedition.members : 0;
}

export function totalPopulation(state) {
  return state.population + expeditionMembers(state);
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

export function productivity(state) {
  return moraleFactor(state.morale) * (state.decrees.doubleShift ? 1.25 : 1);
}

export function modifierMult(state, target) {
  return state.modifiers
    .filter((m) => m.target === target || (m.target === 'all' && target !== 'leak'))
    .reduce((acc, m) => acc * m.mult, 1);
}

// Produção de um módulo concluído no próximo ciclo, a partir da previsão.
export function moduleOutput(state, mod, eco) {
  const def = MODULES[mod.type];
  if (!def.produces || mod.buildLeft > 0) return null;
  const efficiency = def.produces === 'energy' ? 1 : eco.energy.efficiency;
  return {
    resource: def.produces,
    amount: mod.workers * def.rate * eco.productivity * efficiency * modifierMult(state, def.produces),
  };
}

export function moduleWear(level) {
  return HULL_WEAR_PER_MODULE + HULL_WEAR_PER_LEVEL * level;
}

export function hullFatigue(state) {
  return 1 + (state.cycle - 1) * HULL_FATIGUE_PER_CYCLE;
}

export function leakChance(state) {
  if (state.secrets <= 0) return 0;
  const base = Math.min(0.4, state.secrets * 0.05);
  return base * (state.decrees.patrols ? 0.5 : 1) * modifierMult(state, 'leak');
}

export function surfaceReading(state) {
  let reading = null;
  for (let i = 0; i < state.fragments; i++) {
    if (FRAGMENTS[i].surface !== null) reading = FRAGMENTS[i].surface;
  }
  return reading;
}

// Resolve a parte determinística de um ciclo: energia, produção, consumo,
// reparos, desgaste e variações de moral e confiança. A interface usa a
// mesma função para mostrar a previsão do próximo ciclo.
export function computeEconomy(state) {
  const prod = productivity(state);
  const active = activeModules(state);

  let energyProduced = 0;
  let energyDemand = 0;
  for (const m of active) {
    const def = MODULES[m.type];
    if (def.energyOut) energyProduced += def.energyOut;
    if (def.produces === 'energy') energyProduced += m.workers * def.rate * prod * modifierMult(state, 'energy');
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
      production[def.produces] += m.workers * def.rate * prod * efficiency * modifierMult(state, def.produces);
    }
  }

  const ration = state.decrees.rationing ? 0.75 : 1;
  const pop = state.population;
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
  const repairPotential = state.maintenance * REPAIR_PER_WORKER * prod;
  const hullRoom = Math.max(0, 100 - (state.hull - hullWear));
  const materialsAvailable = state.resources.materials + production.materials;
  const repair = Math.min(repairPotential, hullRoom, materialsAvailable * REPAIR_PER_MATERIAL);
  consumption.materials = repair / REPAIR_PER_MATERIAL;

  const after = {};
  for (const key of ['oxygen', 'water', 'food', 'materials']) {
    after[key] = state.resources[key] + production[key] - consumption[key];
  }
  const shortages = {
    oxygen: after.oxygen < 0,
    water: after.water < 0,
    food: after.food < 0,
  };
  const anyShortage = shortages.oxygen || shortages.water || shortages.food;

  const deaths = { oxygen: 0, water: 0, food: 0 };
  if (shortages.oxygen) deaths.oxygen = Math.ceil(-after.oxygen / 5);
  if (shortages.water && state.shortage.water + 1 >= 2) deaths.water = 1 + Math.floor(-after.water / 10);
  if (shortages.food && state.shortage.food + 1 >= 3) deaths.food = 1 + Math.floor(-after.food / 10);

  const housing = housingCapacity(state);
  const overcrowd = Math.max(0, pop - housing);
  const commons = active.filter((m) => m.type === 'commons').length;

  const morale = [];
  if (!anyShortage) morale.push(['Necessidades atendidas', 0.5]);
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
    productivity: prod,
    energy: {
      produced: energyProduced,
      demand: energyDemand,
      net: energyNet,
      efficiency,
      blackout,
      batteryAfter,
      capacity: batteryCapacity(state),
    },
    production,
    consumption,
    after,
    shortages,
    deaths,
    hull: { wear: hullWear, repair, net: repair - hullWear },
    housing,
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

export function canBuild(state, type, level, slot) {
  const def = MODULES[type];
  if (!def || def.buildable === false) return fail('Módulo indisponível.');
  if (level < 0 || level >= LEVELS || slot < 0 || slot >= SLOTS_PER_LEVEL) return fail('Posição inválida.');
  if (moduleAt(state, level, slot)) return fail('Espaço ocupado.');
  if (level > 0 && !state.modules.some((m) => m.level === level - 1)) {
    return fail('Construa primeiro no nível de cima.');
  }
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
  state.resources.materials += demolishRefund(mod);
  state.modules = state.modules.filter((m) => m.id !== id);
  return { ok: true };
}

export function assignWorker(state, id, delta) {
  if (!isPlaying(state)) return fail('A partida terminou.');
  const mod = getModule(state, id);
  if (!mod) return fail('Módulo não encontrado.');
  const slots = MODULES[mod.type].slots || 0;
  if (mod.buildLeft > 0) return fail('Módulo em construção.');
  if (delta > 0 && idleWorkers(state) < delta) return fail('Ninguém disponível.');
  const next = mod.workers + delta;
  if (next < 0 || next > slots) return fail('Sem vagas.');
  mod.workers = next;
  return { ok: true };
}

export function setMaintenance(state, delta) {
  if (!isPlaying(state)) return fail('A partida terminou.');
  if (delta > 0 && idleWorkers(state) < delta) return fail('Ninguém disponível.');
  if (state.maintenance + delta < 0) return fail('Equipe vazia.');
  state.maintenance += delta;
  return { ok: true };
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

export function fragmentChance(state, destination) {
  if (state.fragments >= FRAGMENTS_TO_WIN) return 0;
  const bonus = state.flags.signalBoost ? 0.25 : 0;
  return Math.min(0.95, EXPEDITIONS[destination].fragmentChance + bonus);
}

export function canLaunchExpedition(state, destination, members) {
  if (!EXPEDITIONS[destination]) return fail('Destino desconhecido.');
  if (!activeModules(state).some((m) => m.type === 'dock')) return fail('Construa uma Eclusa de Escafandros.');
  if (state.expedition) return fail('Já há uma equipe lá fora.');
  if (members < 1 || members > EXPEDITION_MAX_TEAM) return fail(`A equipe deve ter de 1 a ${EXPEDITION_MAX_TEAM} pessoas.`);
  if (idleWorkers(state) < members) return fail('Não há pessoas ociosas suficientes.');
  const supplies = expeditionSupplies(destination, members);
  if (state.resources.oxygen < supplies.oxygen) return fail('Oxigênio insuficiente para os tanques.');
  if (state.resources.food < supplies.food) return fail('Comida insuficiente para a viagem.');
  return { ok: true };
}

export function launchExpedition(state, destination, members) {
  if (!isPlaying(state)) return fail('A partida terminou.');
  const check = canLaunchExpedition(state, destination, members);
  if (!check.ok) return check;
  const supplies = expeditionSupplies(destination, members);
  state.resources.oxygen -= supplies.oxygen;
  state.resources.food -= supplies.food;
  state.population -= members;
  state.expedition = { destination, members, cyclesLeft: EXPEDITIONS[destination].cycles };
  state.stats.expeditions += 1;
  addLog(state, `Uma equipe de ${members} saiu rumo a ${EXPEDITIONS[destination].name}.`, 'info');
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
  return typeof def.title === 'function' ? def.title(state, entry.data) : def.title;
}

export function eventText(state, entry) {
  const def = eventDef(entry);
  return typeof def.text === 'function' ? def.text(state, entry.data) : def.text;
}

export function canAfford(state, effects) {
  for (const key of Object.keys(RESOURCES)) {
    if (effects[key] < 0 && state.resources[key] < -effects[key]) return false;
  }
  if (effects.people < 0 && state.population <= -effects.people) return false;
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
  applyEffects(state, choice.effects);
  if (choice.archive) state.archive.push({ index: entry.data.index, status: choice.archive });
  addLog(state, `${eventTitle(state, entry)}: ${choice.label}.${choice.outcome ? ' ' + choice.outcome : ''}`, 'event');

  if (entry.id === 'fragment' && state.fragments >= FRAGMENTS_TO_WIN && !state.flags.finalQueued) {
    state.flags.finalQueued = true;
    state.eventQueue.push({ id: 'finalTruth' });
  }
  if (choice.effects.ending) {
    state.status = 'won';
    state.outcome = { kind: 'ending', key: choice.effects.ending };
  }
  checkDefeat(state);
  return { ok: true };
}

export function applyEffects(state, effects) {
  for (const key of Object.keys(RESOURCES)) {
    if (effects[key]) {
      const cap = key === 'energy' ? batteryCapacity(state) : Infinity;
      state.resources[key] = clamp(state.resources[key] + effects[key], 0, cap);
    }
  }
  if (effects.hull) state.hull = clamp(state.hull + effects.hull, 0, 100);
  if (effects.morale) state.morale = clamp(state.morale + effects.morale, 0, 100);
  if (effects.trust) state.trust = clamp(state.trust + effects.trust, 0, 100);
  if (effects.secrets) state.secrets = Math.max(0, state.secrets + effects.secrets);
  if (effects.revealed) state.revealed += effects.revealed;
  if (effects.people > 0) {
    state.population += effects.people;
    state.stats.births += effects.people;
  }
  if (effects.people < 0) {
    const removed = removePeople(state, -effects.people);
    state.stats.deaths += removed;
  }
  if (effects.modifier) state.modifiers.push({ ...effects.modifier });
  if (effects.flag) state.flags[effects.flag] = true;
}

// Remove pessoas da base: primeiro ociosos, depois manutenção, depois
// dos módulos mais cheios.
export function removePeople(state, count) {
  let toRemove = Math.min(count, state.population);
  const removed = toRemove;
  const fromIdle = Math.min(idleWorkers(state), toRemove);
  toRemove -= fromIdle;
  const fromMaint = Math.min(state.maintenance, toRemove);
  state.maintenance -= fromMaint;
  toRemove -= fromMaint;
  while (toRemove > 0) {
    const busiest = state.modules.reduce((a, m) => (m.workers > (a ? a.workers : 0) ? m : a), null);
    if (!busiest) break;
    busiest.workers -= 1;
    toRemove -= 1;
  }
  state.population -= removed;
  return removed;
}

// ---------------------------------------------------------------------------
// Fim de ciclo

export function endCycle(state) {
  if (!isPlaying(state)) return fail('A partida terminou.');
  if (state.eventQueue.length > 0) return fail('Resolva o evento pendente antes de encerrar o ciclo.');

  const before = snapshot(state);
  const eco = computeEconomy(state);
  const cycle = state.cycle;

  // Energia e recursos
  state.resources.energy = eco.energy.batteryAfter;
  for (const key of ['oxygen', 'water', 'food', 'materials']) {
    state.resources[key] = Math.max(0, eco.after[key]);
  }
  if (eco.energy.blackout) addLog(state, 'Apagão: as baterias secaram e os módulos operaram abaixo da capacidade.', 'warn');

  // Escassez
  state.shortage.water = eco.shortages.water ? state.shortage.water + 1 : 0;
  state.shortage.food = eco.shortages.food ? state.shortage.food + 1 : 0;
  let deaths = 0;
  for (const [key, label] of [
    ['oxygen', 'asfixia'],
    ['water', 'sede'],
    ['food', 'fome'],
  ]) {
    if (eco.deaths[key] > 0) {
      const n = removePeople(state, eco.deaths[key]);
      deaths += n;
      if (n > 0) addLog(state, `${n} ${n === 1 ? 'pessoa morreu' : 'pessoas morreram'} de ${label}.`, 'crit');
    } else if (eco.shortages[key]) {
      addLog(state, `Faltou ${RESOURCES[key].label.toLowerCase()} neste ciclo.`, 'warn');
    }
  }

  // Casco
  state.hull = clamp(state.hull + eco.hull.net, 0, 100);

  // Moral e confiança
  state.morale = clamp(state.morale + eco.moraleDelta - deaths * 4, 0, 100);
  state.trust = clamp(state.trust + eco.trustDelta - deaths * 2, 0, 100);
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
    if (state.expedition.cyclesLeft <= 0) deaths += resolveExpedition(state);
  }

  // Nascimentos
  if (state.decrees.birthLicenses && totalPopulation(state) < eco.housing && state.resources.food >= state.population * 2 && state.morale >= 50) {
    state.birthProgress += 1;
    if (state.birthProgress >= BIRTH_CYCLES) {
      state.birthProgress = 0;
      state.population += 1;
      state.stats.births += 1;
      state.morale = clamp(state.morale + 2, 0, 100);
      addLog(state, 'Um bebê nasceu na colônia.', 'good');
    }
  }

  // Vazamento de segredos
  if (chance(state, leakChance(state))) {
    const penalty = 8 + 2 * state.secrets;
    state.secrets -= 1;
    state.revealed += 1;
    state.stats.leaks += 1;
    const sealed = state.archive.find((a) => a.status === 'sealed');
    if (sealed) sealed.status = 'leaked';
    state.trust = clamp(state.trust - penalty, 0, 100);
    state.morale = clamp(state.morale - 3, 0, 100);
    addLog(state, `Vazamento: um arquivo lacrado do Conselho circula pelos corredores. Confiança −${penalty}.`, 'crit');
  }

  // Modificadores temporários
  for (const m of state.modifiers) m.cycles -= 1;
  state.modifiers = state.modifiers.filter((m) => m.cycles > 0);

  state.stats.deaths += deaths;
  state.cycle += 1;

  checkDefeat(state);
  if (isPlaying(state)) rollEvent(state);

  return { ok: true, report: { cycle, before, after: snapshot(state), deaths } };
}

function resolveExpedition(state) {
  const exp = state.expedition;
  const dest = EXPEDITIONS[exp.destination];
  let survivors = 0;
  for (let i = 0; i < exp.members; i++) if (!chance(state, dest.risk)) survivors += 1;
  const lost = exp.members - survivors;
  let loot = 0;
  for (let i = 0; i < survivors; i++) loot += randInt(state, dest.loot[0], dest.loot[1]);
  const foundFragment = survivors > 0 && chance(state, fragmentChance(state, exp.destination));

  state.expedition = null;
  state.population += survivors;
  state.resources.materials += loot;

  if (survivors === 0) {
    state.morale = clamp(state.morale - 6, 0, 100);
    addLog(state, `A equipe enviada a ${dest.name} não voltou.`, 'crit');
  } else {
    const parts = [`A equipe voltou de ${dest.name} com ${loot} de materiais`];
    if (lost > 0) parts.push(`mas ${lost} ${lost === 1 ? 'pessoa ficou' : 'pessoas ficaram'} para trás`);
    addLog(state, parts.join(', ') + '.', lost > 0 ? 'warn' : 'good');
  }
  if (lost > 0) state.morale = clamp(state.morale - 3 * lost, 0, 100);

  if (foundFragment) {
    const index = state.fragments;
    state.fragments += 1;
    state.flags.signalBoost = false;
    state.eventQueue.push({ id: 'fragment', data: { index } });
    addLog(state, `A equipe trouxe um documento da fundação: ${FRAGMENTS[index].title}.`, 'story');
  }
  return lost;
}

function rollEvent(state) {
  if (state.eventQueue.length > 0 || state.cycle < 3) return;
  if (!chance(state, EVENT_CHANCE)) return;
  const eligible = Object.entries(RANDOM_EVENTS)
    .filter(([id, def]) => (!def.when || def.when(state)) && state.cycle - (state.eventCooldowns[id] ?? -Infinity) >= EVENT_COOLDOWN)
    .map(([id]) => id);
  if (eligible.length === 0) return;
  const id = pick(state, eligible);
  state.eventCooldowns[id] = state.cycle;
  state.eventQueue.push({ id });
}

function checkDefeat(state) {
  if (!isPlaying(state)) return;
  let key = null;
  if (state.hull <= 0) key = 'hull';
  else if (totalPopulation(state) <= 0) key = 'extinct';
  else if (state.trust <= 0) key = 'revolt';
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
  return {
    ...state.resources,
    hull: state.hull,
    morale: state.morale,
    trust: state.trust,
    population: totalPopulation(state),
  };
}

export function addLog(state, text, tone = 'info') {
  state.log.unshift({ cycle: state.cycle, text, tone });
  if (state.log.length > LOG_LIMIT) state.log.length = LOG_LIMIT;
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
