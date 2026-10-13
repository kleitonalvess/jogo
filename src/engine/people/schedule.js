// Rotina diária dos moradores. Dada uma pessoa e uma hora do dia, diz o que
// ela está fazendo e onde. É determinístico (mesma pessoa, mesmo dia, mesma
// rotina) e independente da renderização: a camada 3D converte o lugar em
// coordenadas.
//
// Lugares:
//   { kind: 'bunk', module, index }        leito no alojamento
//   { kind: 'work', module, index }        posto de trabalho no módulo
//   { kind: 'mess', index }                mesa do refeitório (Núcleo)
//   { kind: 'kitchen' }                    balcão da cozinha (Núcleo)
//   { kind: 'office' }                     mesa do Conselho (Núcleo)
//   { kind: 'archive', index }             arquivo e sala de aula (Núcleo)
//   { kind: 'commons', module, index }     Átrio
//   { kind: 'ring', level, angle }         corredor circular de um nível
//   { kind: 'clinic', module, index }      maca da Enfermaria
//   { kind: 'dock', module, index }        eclusa
//   { kind: 'away' }                       fora da base

import { MODULES } from '../data.js';
import { hash01 } from '../rng.js';
import { activeGatherings } from './social.js';
import { isSick } from './population.js';

const H = 60;

function modulesOf(state, type) {
  return state.modules.filter((m) => m.type === type && m.buildLeft === 0);
}

function first(state, type) {
  return modulesOf(state, type)[0] || null;
}

function deepestLevel(state) {
  return state.modules.reduce((d, m) => Math.max(d, m.level), 0);
}

// Índice estável de alguém entre os que dividem o mesmo lugar.
function indexAmong(state, r, filter) {
  const peers = state.residents.filter((o) => o.alive && filter(o)).map((o) => o.id);
  return Math.max(0, peers.indexOf(r.id));
}

function bunk(state, r) {
  return { kind: 'bunk', module: r.home, index: indexAmong(state, r, (o) => o.home === r.home) };
}

function messSeat(state, r) {
  return { kind: 'mess', index: r.id % 24 };
}

function leisurePlace(state, r, day) {
  const roll = hash01(r.id, day, 'leisure');
  const commons = modulesOf(state, 'commons');
  const homeMod = state.modules.find((m) => m.id === r.home);
  if (r.personality.social < 0.35 && roll < 0.7) return bunk(state, r);
  if (commons.length && roll < 0.35 + r.personality.social * 0.5) {
    const mod = commons[Math.floor(hash01(r.id, day, 'commons') * commons.length)];
    return { kind: 'commons', module: mod.id, index: r.id % 16 };
  }
  if (roll < 0.85) {
    // Conversa no corredor perto de casa ou de um amigo.
    const friendIds = Object.entries(r.bonds).filter(([, v]) => v > 30).map(([id]) => Number(id));
    const friend = friendIds.length ? state.residents.find((o) => o.id === friendIds[Math.floor(hash01(r.id, day, 'friend') * friendIds.length)]) : null;
    const target = friend && friend.alive ? state.modules.find((m) => m.id === friend.home) : homeMod;
    const level = target ? target.level : 0;
    return { kind: 'ring', level, angle: Math.floor(hash01(r.id, day, 'ring') * 16) };
  }
  return bunk(state, r);
}

function workPlace(state, r) {
  if (r.job === 'maintenance') return null;
  const mod = state.modules.find((m) => m.id === r.job && m.buildLeft === 0);
  if (!mod) return null;
  return { kind: 'work', module: mod.id, index: indexAmong(state, r, (o) => o.job === mod.id) };
}

// Quem faz a manutenção percorre os corredores, um nível por hora.
function patrolPlace(state, r, minute, day, salt) {
  const levels = deepestLevel(state) + 1;
  const hour = Math.floor(minute / H);
  const level = Math.floor(hash01(r.id, day, hour, salt) * levels);
  const angle = Math.floor(((minute % H) / H) * 16 + hash01(r.id, salt) * 16) % 16;
  return { kind: 'ring', level, angle };
}

function act(activity, place, extra = {}) {
  return { activity, place, ...extra };
}

export function planFor(state, r, minute, day = state.cycle) {
  if (!r.alive) return null;
  if (r.away) return act('away', { kind: 'away' });
  if (r.override && (r.override.until === undefined || r.override.until > day * 1440 + minute)) {
    return act(r.override.activity, r.override.place);
  }

  // Reuniões têm prioridade sobre a rotina.
  for (const g of activeGatherings(state, day, minute)) {
    const attends = g.about === r.id || r.kin[g.about] || (r.bonds[g.about] || 0) > 20 || hash01(r.id, g.id, 'attend') < 0.55 + r.personality.social * 0.4;
    if (attends) {
      const mod = first(state, 'commons') || first(state, 'core');
      return act('gather', { kind: mod.type === 'commons' ? 'commons' : 'mess', module: mod.id, index: r.id % 24, gathering: g.id });
    }
  }

  if (isSick(r)) {
    const clinic = first(state, 'clinic');
    if (clinic) return act('sick', { kind: 'clinic', module: clinic.id, index: indexAmong(state, r, (o) => isSick(o)) + 2 });
    return act('sick', bunk(state, r));
  }

  const wake = 6 * H + Math.round((hash01(r.id, day, 'wake') - 0.4) * 70);
  const lunch = 12 * H + (r.id % 2) * 30;
  const dinner = 18 * H + (r.id % 3) * 25;
  const bed = r.age < 14 ? 21 * H + 15 : 22 * H + Math.round(hash01(r.id, day, 'bed') * 90);

  if (minute < wake || minute >= bed) return act('sleep', bunk(state, r));
  if (minute < wake + 50) return act('eat', messSeat(state, r));
  if (minute >= lunch && minute < lunch + 45) return act('eat', messSeat(state, r));
  if (minute >= dinner && minute < dinner + 60) return act('eat', messSeat(state, r));
  const workHours = minute >= 7 * H && minute < dinner;

  // Funções especiais
  if (r.role === 'cook') {
    if (minute >= 5 * H + 30 && minute < 20 * H) return act('work', { kind: 'kitchen' });
  } else if (r.role === 'council') {
    if (workHours) return act('work', { kind: 'office' });
  } else if (r.role === 'archive') {
    if (minute >= 7 * H + 30 && minute < 11 * H + 30) return act('teach', { kind: 'archive', index: 0 });
    if (workHours) return act('work', { kind: 'archive', index: 0 });
  } else if (r.role === 'guard') {
    const night = r.key === 'rafael';
    const on = night ? minute >= 13 * H || minute < 1 * H : workHours;
    if (on) return act('patrol', patrolPlace(state, r, minute, day, 'guard'));
  } else if (r.role === 'diver') {
    const dock = first(state, 'dock');
    if (workHours && dock) return act('work', { kind: 'dock', module: dock.id, index: 0 });
  }

  if (r.age < 14) {
    if (r.age >= 6 && minute >= 7 * H + 30 && minute < 11 * H + 30) return act('class', { kind: 'archive', index: 1 + (r.id % 10) });
    if (workHours) return act('play', leisurePlace(state, r, day * 7 + Math.floor(minute / 90)));
  } else if (workHours && r.job) {
    if (r.job === 'maintenance') return act('repair', patrolPlace(state, r, minute, day, 'repair'));
    const place = workPlace(state, r);
    if (place) return act('work', place);
  } else if (workHours && r.age > 69) {
    return act('rest', leisurePlace(state, r, day * 3 + Math.floor(minute / 120)));
  } else if (workHours) {
    return act('idle', leisurePlace(state, r, day * 5 + Math.floor(minute / 120)));
  }
  return act('leisure', leisurePlace(state, r, day));
}

const ACTIVITY_LABELS = {
  sleep: 'dormindo',
  eat: 'comendo no refeitório',
  work: 'trabalhando',
  teach: 'dando aula',
  class: 'na aula do Teodoro',
  patrol: 'fazendo a ronda',
  repair: 'consertando o casco',
  leisure: 'de folga',
  idle: 'sem função, à toa',
  rest: 'descansando',
  play: 'brincando',
  sick: 'doente',
  gather: 'numa reunião',
  away: 'em expedição',
  detained: 'detido no alojamento',
};

export function activityLabel(activity) {
  return ACTIVITY_LABELS[activity] || activity;
}

export function placeLevel(state, place) {
  if (!place) return 0;
  if (place.level !== undefined) return place.level;
  if (place.module !== undefined) {
    const mod = state.modules.find((m) => m.id === place.module);
    return mod ? mod.level : 0;
  }
  const core = state.modules.find((m) => m.type === 'core');
  return core ? core.level : 0;
}

export function placeName(state, place) {
  if (!place) return '';
  const level = placeLevel(state, place) + 1;
  switch (place.kind) {
    case 'mess':
    case 'kitchen':
      return 'Refeitório do Núcleo';
    case 'office':
      return 'Mesa do Conselho';
    case 'archive':
      return 'Arquivo';
    case 'ring':
      return `Corredor do Nível ${level}`;
    case 'away':
      return 'Fora da colônia';
    default: {
      const mod = state.modules.find((m) => m.id === place.module);
      return mod ? `${MODULES[mod.type].name}, Nível ${level}` : `Nível ${level}`;
    }
  }
}
