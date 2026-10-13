// Vida social da colônia: humor e opinião de cada morador, memórias,
// luto, nascimentos, boatos, segredos que vazam e a reputação do jogador.
//
// A moral e a confiança da colônia deixam de ser números soltos: são a
// média do humor e da opinião de pessoas com nome.

import { MODULES, REVOLT_OPINION, REVOLT_SHARE, WORK_AGE } from '../data.js';
import { chance, pick, random, weightedPick } from '../rng.js';
import { forms, kinLabel } from '../text.js';
import { HAIR_COLORS } from './cast.js';
import { FIRST_NAMES } from './names.js';
import { canWork, displayName, fullName, gw, inBase, isAdult, living, residentById } from './population.js';
import { personalityFrom } from './traits.js';

const MEMORY_LIMIT = 10;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---------------------------------------------------------------------------
// Agregados

export function refreshAggregates(state) {
  const people = living(state).filter((r) => r.age >= 10);
  const adults = people.filter(isAdult);
  state.morale = people.length ? people.reduce((s, r) => s + r.mood, 0) / people.length : 0;
  state.trust = adults.length ? adults.reduce((s, r) => s + r.opinion, 0) / adults.length : 0;
}

export function discontentShare(state) {
  const adults = living(state).filter(isAdult);
  if (adults.length === 0) return 0;
  return adults.filter((r) => r.opinion < REVOLT_OPINION).length / adults.length;
}

export function revoltImminent(state) {
  return discontentShare(state) >= REVOLT_SHARE;
}

// Variação para a colônia inteira, modulada pela sensibilidade de cada um.
export function shiftMood(state, delta, filter = null) {
  for (const r of living(state)) {
    if (filter && !filter(r)) continue;
    r.mood = clamp(r.mood + delta * (delta < 0 ? r.personality.sensitivity : 1), 0, 100);
  }
  refreshAggregates(state);
}

export function shiftOpinion(state, delta, filter = null) {
  for (const r of living(state)) {
    if (filter && !filter(r)) continue;
    r.opinion = clamp(r.opinion + delta, 0, 100);
  }
  refreshAggregates(state);
}

// ---------------------------------------------------------------------------
// Memórias

export function remember(r, memory) {
  r.memories.unshift(memory);
  if (r.memories.length > MEMORY_LIMIT) {
    // Esquece primeiro o que pesou menos.
    let weakest = 1;
    for (let i = 2; i < r.memories.length; i++) {
      if (Math.abs(r.memories[i].weight) <= Math.abs(r.memories[weakest].weight)) weakest = i;
    }
    r.memories.splice(weakest, 1);
  }
}

export function memoriesAbout(r, kind) {
  return r.memories.filter((m) => m.kind === kind);
}

// O jogador fez algo com este morador: ele lembra e muda de opinião.
export function rememberPlayer(state, r, text, opinion, weight = opinion) {
  remember(r, { day: state.cycle, kind: 'player', text, weight });
  r.opinion = clamp(r.opinion + opinion, 0, 100);
  refreshAggregates(state);
}

// ---------------------------------------------------------------------------
// Mortes e nascimentos

const CAUSES = {
  oxygen: 'asfixia',
  water: 'sede',
  food: 'fome',
  expedition: 'acidente lá fora',
  fever: 'febre',
  age: 'velhice',
  ascension: 'subida',
  breach: 'rompimento do casco',
};

// Quem morre numa crise: idosos, doentes e quem está fraco primeiro.
export function pickVictims(state, count, pool = null) {
  const candidates = (pool || inBase(state)).slice();
  const victims = [];
  for (let i = 0; i < count && candidates.length > 0; i++) {
    const v = weightedPick(state, candidates, (r) => 1 + (r.age > 60 ? 2.5 : 0) + (r.status && r.status.kind === 'sick' ? 2 : 0) + (r.age < 6 ? 0.8 : 0) + (r.key && !r.supporting ? -0.6 : 0));
    victims.push(v);
    candidates.splice(candidates.indexOf(v), 1);
  }
  return victims;
}

export function recordDeath(state, r, cause, { blame = 0, silent = false } = {}) {
  if (!r.alive) return;
  r.alive = false;
  r.deathDay = state.cycle;
  r.deathCause = cause;
  r.job = null;
  r.away = false;
  r.status = null;
  state.stats.deaths += 1;
  const causeText = CAUSES[cause] || cause;
  for (const o of living(state)) {
    const kin = o.kin[r.id];
    const b = o.bonds[r.id] || 0;
    if (kin || b > 30) {
      const grief = kin ? 22 : 10;
      o.mood = clamp(o.mood - grief * o.personality.sensitivity, 0, 100);
      const article = r.g === 'f' ? 'a' : r.g === 'n' ? 'e' : 'o';
      const label = kin ? `${article} ${kinLabel(kin, r)}` : r.g === 'f' ? 'uma amiga' : r.g === 'n' ? 'ume amigue' : 'um amigo';
      remember(o, { day: state.cycle, kind: 'grief', about: r.id, text: `Perdeu ${label}, ${displayName(r)}.`, weight: -grief });
      if (blame) o.opinion = clamp(o.opinion - blame * (kin ? 2 : 1), 0, 100);
    }
  }
  if (blame) shiftOpinion(state, -blame * 0.5);
  if (!silent) {
    addSocialLog(state, `${fullName(r)} morreu (${causeText}).`, 'crit', r.id);
    scheduleGathering(state, { kind: 'funeral', about: r.id, day: state.cycle + 1, start: 18 * 60, end: 19 * 60, place: 'commons' });
  }
  refreshAggregates(state);
}

export function couplesForBirth(state) {
  const out = [];
  for (const r of living(state)) {
    for (const [id, kind] of Object.entries(r.kin)) {
      if (kind !== 'spouse') continue;
      const o = residentById(state, Number(id));
      if (!o || !o.alive || r.id > o.id) continue;
      const mother = r.g === 'f' ? r : o.g === 'f' ? o : r;
      if (mother.age >= 20 && mother.age <= 42 && !r.away && !o.away) out.push([r, o]);
    }
  }
  return out;
}

export function birth(state, parents = null) {
  const couples = couplesForBirth(state);
  const pair = parents || (couples.length ? pick(state, couples) : null);
  if (!pair) return null;
  const [a, b] = pair;
  const g = chance(state, 0.5) ? 'f' : 'm';
  const used = new Set(state.residents.map((r) => r.first));
  const pool = FIRST_NAMES[g].filter((n) => !used.has(n));
  const first = pick(state, pool.length ? pool : FIRST_NAMES[g]);
  const traits = ['curioso', pick(state, ['brincalhao', 'teimoso', 'gentil', 'sonhador'])];
  const child = {
    id: state.nextResidentId++,
    key: null,
    first,
    last: a.last,
    nick: null,
    g,
    age: 0,
    alive: true,
    deathDay: null,
    deathCause: null,
    role: null,
    title: null,
    job: null,
    trade: null,
    traits,
    personality: personalityFrom(traits),
    favorite: null,
    home: a.home,
    appearance: {
      skin: pick(state, [a.appearance.skin, b.appearance.skin]),
      hair: 'careca',
      hairColor: pick(state, [a.appearance.hairColor, b.appearance.hairColor]) % HAIR_COLORS.length,
      height: 0.42,
      build: 1,
      beard: 'nenhuma',
      extra: 'nenhum',
    },
    mood: 80,
    opinion: 60,
    bonds: {},
    kin: {},
    memories: [],
    status: null,
    away: false,
    knows: [],
    backstory: ['(Um bebê. Dorme, chora e olha fixo para as luzes.)'],
    supporting: false,
    born: state.cycle,
  };
  state.residents.push(child);
  for (const p of [a, b]) {
    child.bonds[p.id] = 95;
    p.bonds[child.id] = 95;
    child.kin[p.id] = 'parent';
    p.kin[child.id] = 'child';
    p.mood = clamp(p.mood + 15, 0, 100);
    remember(p, { day: state.cycle, kind: 'birth', about: child.id, text: `${gw(child, 'A', 'O')} ${gw(child, 'filha', 'filho')} ${child.first} nasceu.`, weight: 15 });
  }
  for (const [id, kind] of Object.entries(a.kin)) {
    if (kind === 'child' && Number(id) !== child.id) {
      const sib = residentById(state, Number(id));
      if (sib) {
        sib.kin[child.id] = 'sibling';
        child.kin[sib.id] = 'sibling';
        sib.bonds[child.id] = 70;
        child.bonds[sib.id] = 70;
      }
    }
  }
  state.stats.births += 1;
  addSocialLog(state, `Nasceu ${child.first} ${child.last}, ${gw(child, 'filha', 'filho')} de ${displayName(a)} e ${displayName(b)}.`, 'good', child.id);
  scheduleGathering(state, { kind: 'birth', about: child.id, day: state.cycle, start: 19 * 60, end: 20 * 60 + 30, place: 'commons' });
  refreshAggregates(state);
  return child;
}

// ---------------------------------------------------------------------------
// Reuniões: velórios, assembleias, celebrações, protestos

export function scheduleGathering(state, g) {
  state.gatherings.push({ id: state.nextGatheringId++, ...g });
}

export function activeGatherings(state, day, minute) {
  return state.gatherings.filter((g) => g.day === day && minute >= g.start && minute < g.end);
}

export function pruneGatherings(state) {
  state.gatherings = state.gatherings.filter((g) => g.day >= state.cycle);
}

// ---------------------------------------------------------------------------
// Boatos e segredos

// kind: secret | deed | news
// opinion: efeito na opinião de quem fica sabendo
// align: { truth, mercy } — como o ato se encaixa nos valores de cada um
export function createRumor(state, rumor) {
  const r = {
    id: state.nextRumorId++,
    kind: rumor.kind || 'news',
    key: rumor.key || null,
    label: rumor.label,
    text: rumor.text,
    about: rumor.about ?? null,
    opinion: rumor.opinion || 0,
    align: rumor.align || null,
    day: state.cycle,
    public: false,
    knownBy: [],
  };
  state.rumors.push(r);
  for (const id of rumor.knownBy || []) learn(state, r, residentById(state, id), false);
  return r;
}

function learn(state, rumor, r, applyEffect = true) {
  if (!r || !r.alive || rumor.knownBy.includes(r.id)) return false;
  rumor.knownBy.push(r.id);
  if (!r.knows.includes(rumor.id)) r.knows.push(rumor.id);
  if (applyEffect) {
    let delta = rumor.opinion;
    if (rumor.align) delta += 8 * ((rumor.align.truth || 0) * r.personality.truth + (rumor.align.mercy || 0) * r.personality.mercy);
    r.opinion = clamp(r.opinion + delta, 0, 100);
  }
  return true;
}

export function rumorKnownShare(state, rumor) {
  const adults = living(state).filter(isAdult);
  if (adults.length === 0) return 0;
  return adults.filter((r) => rumor.knownBy.includes(r.id)).length / adults.length;
}

export function secretRumors(state) {
  return state.rumors.filter((r) => r.kind === 'secret' && !r.public);
}

// Contatos de alguém: família, amigos, colegas de trabalho e vizinhos.
export function contactsOf(state, r) {
  const out = new Set();
  for (const [id, v] of Object.entries(r.bonds)) if (Math.abs(v) >= 20 || r.kin[id]) out.add(Number(id));
  for (const o of inBase(state)) {
    if (o === r) continue;
    if (r.job && o.job === r.job) out.add(o.id);
    if (o.home === r.home && chance(state, 0.35)) out.add(o.id);
  }
  return [...out].map((id) => residentById(state, id)).filter((o) => o && o.alive && !o.away);
}

export function spreadFactor(state) {
  let f = state.decrees.patrols ? 0.5 : 1;
  for (const m of state.modifiers) if (m.target === 'leak') f *= m.mult;
  return f;
}

// Um dia de conversas: cada pessoa que sabe de algo conta para alguns
// contatos. Segredos que chegam a 30% dos adultos vazam de vez.
export function spreadRumors(state) {
  const factor = spreadFactor(state);
  const leaked = [];
  for (const rumor of state.rumors) {
    if (rumor.public) continue;
    const tellers = rumor.knownBy.map((id) => residentById(state, id)).filter((r) => r && r.alive && !r.away);
    for (const teller of tellers) {
      const p = (0.025 + 0.14 * teller.personality.gossip) * factor * (rumor.kind === 'secret' ? 0.8 : 1);
      for (const contact of contactsOf(state, teller)) {
        if (rumor.knownBy.includes(contact.id)) continue;
        if (random(state) < p) learn(state, rumor, contact);
      }
    }
    if (rumor.kind === 'secret' && rumorKnownShare(state, rumor) >= 0.3) leaked.push(rumor);
    if (rumor.kind !== 'secret' && state.cycle - rumor.day > 12) rumor.public = true;
  }
  for (const rumor of leaked) leakSecret(state, rumor);
  refreshAggregates(state);
  return leaked;
}

export function leakSecret(state, rumor) {
  rumor.public = true;
  const penalty = 8 + 2 * state.secrets;
  state.secrets = Math.max(0, state.secrets - 1);
  state.revealed += 1;
  state.stats.leaks += 1;
  if (rumor.key) {
    const entry = state.archive.find((a) => a.id === rumor.key && a.status === 'sealed');
    if (entry) entry.status = 'leaked';
  }
  for (const r of living(state)) {
    learn(state, rumor, r, false);
    r.opinion = clamp(r.opinion - penalty * (0.6 + 0.4 * Math.max(0, r.personality.truth + 0.5)), 0, 100);
    r.mood = clamp(r.mood - 3, 0, 100);
  }
  adjustReputation(state, { truth: -6 });
  addSocialLog(state, `Vazou: ${rumor.label}. Agora todos sabem. Confiança −${penalty}.`, 'crit');
  refreshAggregates(state);
}

// ---------------------------------------------------------------------------
// Reputação do jogador (dois eixos, de −100 a 100)

export function adjustReputation(state, { truth = 0, mercy = 0 }) {
  const rep = state.player.reputation;
  rep.truth = clamp(rep.truth + truth, -100, 100);
  rep.mercy = clamp(rep.mercy + mercy, -100, 100);
}

export function reputationTitle(state) {
  const { truth, mercy } = state.player.reputation;
  const g = state.player.g;
  const strong = (v) => Math.abs(v) >= 25;
  if (!strong(truth) && !strong(mercy)) return null;
  if (strong(truth) && strong(mercy)) {
    if (truth > 0 && mercy > 0) return { title: 'Farol', desc: 'Diz a verdade e cuida de quem a ouve.' };
    if (truth > 0 && mercy < 0) return { title: 'Lâmina', desc: 'Diz a verdade, doa a quem doer.' };
    if (truth < 0 && mercy > 0) return { title: forms('{Pastora|Pastor|Pastore}', g), desc: 'Protege o rebanho, inclusive da verdade.' };
    return { title: forms('{Carcereira|Carcereiro|Carcereire}', g), desc: 'Guarda os segredos e as portas, com mão de ferro.' };
  }
  if (strong(truth)) return truth > 0 ? { title: 'Voz da Superfície', desc: 'Não esconde nada do povo.' } : { title: forms('{Guardiã|Guardião|Guardiane}', g), desc: 'Sabe mais do que diz.' };
  return mercy > 0 ? { title: forms('{Protetora|Protetor|Protetore}', g), desc: 'Nunca deixa ninguém para trás.' } : { title: 'Mão de Ferro', desc: 'Regras são regras.' };
}

// ---------------------------------------------------------------------------
// Atualização diária de humor e opinião

export function dailySocialUpdate(state, eco) {
  const rep = state.player.reputation;
  const housingLoad = new Map();
  for (const r of inBase(state)) housingLoad.set(r.home, (housingLoad.get(r.home) || 0) + 1);

  for (const r of living(state)) {
    if (r.away) continue;
    const p = r.personality;
    // O que acontece com a colônia inteira.
    r.mood += eco.moraleDelta * (eco.moraleDelta < 0 ? p.sensitivity : 1);
    r.opinion += eco.trustDelta;

    // O que acontece com esta pessoa.
    let personal = 0;
    if (r.age >= WORK_AGE[0] && r.age <= WORK_AGE[1] && !r.role) {
      if (!r.job) personal += r.traits.includes('preguicoso') ? 0.2 : -0.8;
      else {
        const mod = state.modules.find((m) => m.id === r.job);
        if (mod && MODULES[mod.type].trade === r.trade) personal += 0.4;
      }
    }
    const homeMod = state.modules.find((m) => m.id === r.home);
    if (homeMod && (housingLoad.get(r.home) || 0) > MODULES[homeMod.type].housing) personal -= 1.2;
    if (r.status && r.status.kind === 'sick') personal -= 2;
    const close = Object.entries(r.bonds).some(([id, v]) => v > 40 && residentById(state, Number(id))?.alive);
    if (close) personal += 0.3;
    else if (p.social > 0.6) personal -= 0.5;
    r.mood += personal;

    // Volta lenta ao temperamento de cada um.
    r.mood += (p.mood - r.mood) * 0.1;
    const target = 50 + p.opinionBias + 30 * (rep.truth / 100) * p.truth + 30 * (rep.mercy / 100) * p.mercy;
    r.opinion += (target - r.opinion) * 0.04;
    r.mood = clamp(r.mood, 0, 100);
    r.opinion = clamp(r.opinion, 0, 100);

    if (r.status) {
      r.status.days -= 1;
      if (r.status.days <= 0) r.status = null;
    }
  }
  refreshAggregates(state);
}

// ---------------------------------------------------------------------------

export function addSocialLog(state, text, tone = 'info', about = null) {
  state.log.unshift({ cycle: state.cycle, text, tone, about });
  if (state.log.length > 120) state.log.length = 120;
}

export function workingAdults(state) {
  return living(state).filter((r) => canWork(r));
}

