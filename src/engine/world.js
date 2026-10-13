// O mundo em tempo real: relógio, objetos para apanhar no fundo do mar,
// interações dentro da colônia e a passagem de um dia para o outro.
// Continua puro (sem DOM): a camada 3D chama estas funções.

import { MODULES } from './data.js';
import { addLog, createGame, discoverFragment, endCycle, giveItem, hasItem, takeItem } from './game.js';
import { ITEMS } from './items.js';
import { initQuests, onDayStart, onInteract, onPickup, worldItemVisible } from './quests.js';
import { displayName, living, residentById } from './people/population.js';
import { activeGatherings, adjustReputation, refreshAggregates, remember, shiftMood } from './people/social.js';
import { hash01 } from './rng.js';
import { clockLabel } from './text.js';

// Minutos de jogo por segundo real.
export const TIME_SCALE = 2;
export const BEDTIME = 20 * 60;
export const PASS_OUT = 26 * 60; // 02:00 do dia seguinte

export const SUIT = { tank: 100, drainPerSecond: 0.55, sprintDrain: 0.95, climbDrain: 1.15, ventDrain: 2.5 };

// Coordenadas do lado de fora: metros a partir do eixo da colônia.
// Norte é −z. A eclusa desce até o leito, ao norte da torre.
export const EXTERIOR = {
  airlock: { x: 0, z: -26 },
  tower: { radius: 17 },
  regions: {
    wreck: { name: 'Campo de Destroços', x: 76, z: -96, r: 34 },
    whale: { name: 'Carcaça da Baleia', x: -92, z: -62, r: 16 },
    rift: { name: 'Fenda Abissal', x: -86, z: 62, r: 40 },
    vents: { name: 'Fontes Termais', x: -86, z: 62, r: 40 },
    cable: { name: 'Coluna de Ascensão', x: 12, z: 150, r: 14 },
    ruins: { name: 'Estação de Pesquisa', x: 124, z: 22, r: 18 },
  },
  airCaches: [
    { id: 'air-wreck', x: 58, z: -74 },
    { id: 'air-rift', x: -52, z: 44 },
    { id: 'air-cable', x: 4, z: 128 },
  ],
  cableHeight: 110,
};

// Coisas para apanhar. zone: exterior | colony. respawn em dias (0 = única).
export const WORLD_ITEMS = [
  { id: 'buoy', zone: 'exterior', x: 90, z: -114, fragment: 'buoy', label: 'Gravador da boia meteorológica 7', kind: 'buoy' },
  { id: 'zenith', zone: 'exterior', x: -92, z: 64, fragment: 'zenith', label: 'Sonda de comunicação da fundação', kind: 'probe', deep: true },
  { id: 'relay', zone: 'exterior', x: 12, z: 150, h: EXTERIOR.cableHeight, fragment: 'last', label: 'Caixa de retransmissão', kind: 'relay' },
  { id: 'placa-ruth', zone: 'exterior', x: -70, z: 72, item: 'placa-ruth', label: 'Placa de identificação', kind: 'tag', deep: true },
  { id: 'foto-ceu', zone: 'exterior', x: 62, z: -88, item: 'foto-ceu', label: 'Fotografia na cabine do submarino', kind: 'relic' },
  { id: 'pimenta', zone: 'exterior', x: 75, z: -80, item: 'pimenta', label: 'Lata na cozinha do submarino', kind: 'relic' },
  { id: 'oculos-sol', zone: 'exterior', x: 98, z: -98, item: 'oculos-sol', label: 'Óculos escuros', kind: 'relic' },
  { id: 'brinquedo', zone: 'exterior', x: 54, z: -108, item: 'brinquedo', label: 'Robô de lata', kind: 'relic' },
  { id: 'caixa-musica', zone: 'exterior', x: -112, z: 50, item: 'caixa-musica', label: 'Caixinha de música', kind: 'relic', deep: true },
  { id: 'dente-baleia', zone: 'exterior', x: -88, z: -58, item: 'dente-baleia', label: 'Dente de baleia', kind: 'relic' },
  { id: 'concha', zone: 'exterior', x: -99, z: -68, item: 'concha', label: 'Concha espiral', kind: 'relic' },
  { id: 'livro', zone: 'exterior', x: 121, z: 17, item: 'livro', label: 'Livro na estante tombada', kind: 'relic' },
  { id: 'bussola', zone: 'exterior', x: 129, z: 26, item: 'bussola', label: 'Bússola de bancada', kind: 'relic' },
  { id: 'semente', zone: 'exterior', x: 116, z: 30, item: 'semente', label: 'Caixa do banco de sementes', kind: 'relic' },
  { id: 'moeda', zone: 'exterior', x: 133, z: 13, item: 'moeda', label: 'Moeda no chão de metal', kind: 'relic' },
  ...[
    [-100, 58],
    [-84, 72],
    [-62, 78],
    [-118, 46],
    [-76, 56],
  ].map(([x, z], i) => ({ id: `alga-${i}`, zone: 'exterior', x, z, item: 'alga-vermelha', label: 'Alga vermelha', kind: 'algae', respawn: 2, deep: true })),
  ...[
    [24, -44],
    [-30, -48],
    [44, -70],
    [86, -78],
    [102, -120],
    [-60, -40],
    [-78, -76],
    [-40, 30],
    [30, 60],
    [60, 30],
    [100, 0],
    [-20, 110],
    [40, 120],
    [-120, 10],
  ].map(([x, z], i) => ({ id: `sucata-${i}`, zone: 'exterior', x, z, item: 'sucata', qty: 2, label: 'Pilha de sucata', kind: 'scrap', respawn: 3 })),
  { id: 'lata-tinta', zone: 'colony', module: 'workshop', item: 'lata-tinta', label: 'Lata de tinta de casco', kind: 'paint', requires: 'tinta' },
];

export function createWorld(seed, options = {}) {
  const state = createGame(seed, options);
  initQuests(state);
  state.world.leaks = [];
  state.world.leaksFixed = [];
  state.world.kitchenDay = 0;
  state.world.airUsed = {};
  state.player.suitTankMax = SUIT.tank;
  state.player.suitTank = SUIT.tank;
  return state;
}

// ---------------------------------------------------------------------------
// Relógio

export function clock(state) {
  return clockLabel(state.time.minute);
}

export function isNight(state) {
  const m = state.time.minute;
  return m >= BEDTIME || m < 5 * 60;
}

// Avança o relógio. Devolve { passOut } quando passa das duas da manhã.
export function tick(state, seconds) {
  if (state.status !== 'playing') return {};
  state.time.minute += seconds * TIME_SCALE;
  if (state.time.minute >= PASS_OUT) return { passOut: true };
  return {};
}

// ---------------------------------------------------------------------------
// Objetos do mundo

export function worldItem(id) {
  return WORLD_ITEMS.find((w) => w.id === id) || null;
}

export function itemAvailable(state, w) {
  if (w.fragment && state.found.includes(w.fragment)) return false;
  if (!worldItemVisible(state, w)) return false;
  const taken = state.world.taken[w.id];
  if (taken === undefined) return true;
  if (!w.respawn) return false;
  return state.cycle - taken >= w.respawn;
}

export function availableItems(state, zone) {
  return WORLD_ITEMS.filter((w) => w.zone === zone && itemAvailable(state, w));
}

export function pickUp(state, id, witnesses = []) {
  const w = worldItem(id);
  if (!w || !itemAvailable(state, w)) return { ok: false, text: 'Não há nada aqui.' };
  state.world.taken[w.id] = state.cycle;
  if (w.fragment) {
    discoverFragment(state, w.fragment, witnesses);
    return { ok: true, text: `${w.label}: um documento da fundação.`, fragment: w.fragment };
  }
  giveItem(state, w.item, w.qty || 1);
  onPickup(state, w.item);
  const item = ITEMS[w.item];
  return { ok: true, text: `${item.name}${w.qty > 1 ? ` ×${w.qty}` : ''}`, item: w.item };
}

// Estações de ar lá fora: recarregam o tanque uma vez por dia.
export function useAirCache(state, id) {
  if (state.world.airUsed[id] === state.cycle) return { ok: false, text: 'O cilindro está vazio. Recarrega amanhã.' };
  state.world.airUsed[id] = state.cycle;
  state.player.suitTank = state.player.suitTankMax;
  return { ok: true, text: 'Tanque do traje recarregado.' };
}

// Ao voltar para dentro, a sucata vira material (guardando o que algum
// morador pediu).
export function depositScrap(state) {
  const have = state.player.inventory.sucata || 0;
  const reserved = (state.favors || []).filter((f) => !f.done && f.kind === 'sucata').reduce((s, f) => s + f.qty, 0);
  const deliver = Math.max(0, have - reserved);
  if (deliver <= 0) return 0;
  takeItem(state, 'sucata', deliver);
  state.resources.materials += deliver * 3;
  addLog(state, `Você trouxe ${deliver} sucata de fora: +${deliver * 3} de materiais.`, 'good');
  return deliver * 3;
}

// ---------------------------------------------------------------------------
// Vazamentos: com o casco fraco, aparecem jatos de água pelos corredores.

export function leaksToday(state) {
  if (state.hull >= 72) return [];
  const count = Math.min(5, 1 + Math.floor((72 - state.hull) / 9));
  const levels = Math.max(...state.modules.map((m) => m.level)) + 1;
  const out = [];
  for (let i = 0; i < count; i++) {
    const id = `leak-${state.cycle}-${i}`;
    if (state.world.leaksFixed.includes(id)) continue;
    out.push({ id, level: Math.floor(hash01(state.cycle, i, 'lv') * levels), angle: Math.floor(hash01(state.cycle, i, 'an') * 16) });
  }
  return out;
}

export function patchLeak(state, id) {
  if (state.resources.materials < 2) return { ok: false, text: 'Faltam materiais para o remendo (2).' };
  state.resources.materials -= 2;
  state.hull = Math.min(100, state.hull + 1.5);
  state.world.leaksFixed.push(id);
  return { ok: true, text: 'Vazamento remendado. Casco +1,5.' };
}

// ---------------------------------------------------------------------------
// Interações dentro da colônia

export function interact(state, objectId) {
  if (objectId === 'kitchen') {
    if (state.world.kitchenDay === state.cycle) return { ok: false, text: 'A Dona Zu já separou sua ração extra hoje.' };
    if (state.resources.food < 5) return { ok: false, text: 'Não sobra nada na cozinha.' };
    state.world.kitchenDay = state.cycle;
    state.resources.food -= 1;
    giveItem(state, 'racao', 1);
    return { ok: true, text: 'Ração extra guardada no bolso.' };
  }
  const result = onInteract(state, objectId);
  return result || { ok: true };
}

export function canSleep(state) {
  if (state.eventQueue.length > 0) return { ok: false, text: 'Há uma decisão pendente antes de dormir.' };
  if (!isNight(state)) return { ok: false, text: `Ainda é cedo (${clock(state)}). Dá para dormir a partir das 20h.` };
  return { ok: true };
}

// Encerra o dia: economia, vida social, missões e a manhã seguinte.
export function endDay(state, { passedOut = false } = {}) {
  if (passedOut) {
    for (const r of state.residents) if (r.alive && r.mood > 0) r.opinion = Math.max(0, r.opinion - 0.5);
    addLog(state, 'Você desmaiou de cansaço no corredor. Alguém te carregou até o beliche.', 'warn');
  }
  const result = endCycle(state);
  if (!result.ok) return result;
  onDayStart(state);
  state.world.leaksFixed = [];
  state.player.suitTank = state.player.suitTankMax;
  return result;
}

export function moduleName(type) {
  return MODULES[type].name;
}

export function hasRelic(state, id) {
  return hasItem(state, id);
}

// ---------------------------------------------------------------------------
// Reuniões: velórios, leituras de documentos, casamentos, nascimentos.

export const GATHERING_LABELS = {
  funeral: 'Velório',
  assembly: 'Leitura do documento',
  wedding: 'Casamento',
  birth: 'Boas-vindas ao bebê',
  feast: 'Banquete',
};

export function gatheringsNow(state) {
  return activeGatherings(state, state.cycle, state.time.minute % 1440);
}

export function gatheringTitle(state, g) {
  const who = g.about && typeof g.about === 'number' ? residentById(state, g.about) : null;
  const label = GATHERING_LABELS[g.kind] || 'Reunião';
  return who ? `${label} de ${displayName(who)}` : label;
}

// Você toma a palavra numa reunião. Cada tipo mexe com gente diferente.
export function speakAtGathering(state, g) {
  if (g.spoken) return { ok: false, text: 'Você já falou nesta reunião.' };
  g.spoken = true;
  const who = typeof g.about === 'number' ? residentById(state, g.about) : null;
  const nudge = (r, delta, text) => {
    if (!r || !r.alive) return;
    r.opinion = Math.min(100, Math.max(0, r.opinion + delta));
    if (text) remember(r, { day: state.cycle, kind: 'player', text, weight: delta });
  };
  let text = '';
  if (g.kind === 'funeral' && who) {
    for (const r of living(state)) {
      if (r.kin[who.id]) nudge(r, 9, `Ouviu você falar no velório de ${displayName(who)}.`);
      else nudge(r, 1);
    }
    shiftMood(state, 1);
    adjustReputation(state, { mercy: 2 });
    text = `Você fala sobre ${displayName(who)}: o trabalho, as manias, o que fica. A família agradece em silêncio.`;
  } else if (g.kind === 'assembly') {
    for (const r of living(state)) nudge(r, r.personality.truth > 0.2 ? 3 : r.personality.truth < -0.2 ? -1 : 1);
    adjustReputation(state, { truth: 2 });
    text = 'Você lê o documento em voz alta no Átrio. Ninguém fala por um longo tempo. Depois, todos falam ao mesmo tempo.';
  } else if (g.kind === 'wedding' && who) {
    nudge(who, 6, 'Ouviu você celebrar a união.');
    for (const [id, kind] of Object.entries(who.kin)) if (kind === 'spouse') nudge(residentById(state, Number(id)), 6, 'Ouviu você celebrar a união.');
    shiftMood(state, 1);
    text = 'Você celebra a união com as palavras de sempre: "que o ar nunca falte a vocês". Alguém começa a cantar.';
  } else if (g.kind === 'birth' && who) {
    for (const [id, kind] of Object.entries(who.kin)) if (kind === 'parent') nudge(residentById(state, Number(id)), 6, 'Ouviu você dar as boas-vindas ao bebê.');
    shiftMood(state, 1);
    text = `Você segura ${displayName(who)} no colo diante de todos. O bebê agarra seu dedo e não solta.`;
  } else {
    shiftMood(state, 1);
    text = 'Você ergue um copo de água e agradece a quem cozinhou. Aplausos.';
  }
  refreshAggregates(state);
  return { ok: true, text };
}
