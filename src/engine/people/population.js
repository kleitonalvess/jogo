// Criação e consulta da população. Cada morador é um registro serializável;
// nada aqui depende de DOM ou de renderização.

import { MODULES, ROLES, WORK_AGE } from '../data.js';
import { chance, pick, randInt, random, shuffle } from '../rng.js';
import { BEARDS, CAST, CAST_BONDS, EXTRAS, HAIR_COLORS, HAIR_STYLES, SKIN_TONES } from './cast.js';
import { forms } from '../text.js';
import { FIRST_NAMES, NICKNAMES, SURNAMES } from './names.js';
import { TRAIT_CONFLICTS, TRAITS, TRADES, personalityFrom } from './traits.js';

const GENERATED_ADULTS = 15;
const GENERATED_CHILDREN = 4;

// ---------------------------------------------------------------------------
// Consultas

export function residentById(state, id) {
  return state.residents.find((r) => r.id === id) || null;
}

export function residentByKey(state, key) {
  return state.residents.find((r) => r.key === key) || null;
}

export function living(state) {
  return state.residents.filter((r) => r.alive);
}

// Moradores fisicamente na base (vivos e fora de expedição).
export function inBase(state) {
  return state.residents.filter((r) => r.alive && !r.away);
}

export function isAdult(r) {
  return r.age >= WORK_AGE[0];
}

export function canWork(r) {
  return r.alive && !r.away && r.age >= WORK_AGE[0] && r.age <= WORK_AGE[1] && !r.role && !isSick(r);
}

export function isSick(r) {
  return !!(r.status && r.status.kind === 'sick');
}

export function displayName(r) {
  return r.nick || r.first;
}

export function fullName(r) {
  return `${r.first} ${r.last}`;
}

// Escolhe a forma de uma palavra conforme o gênero gramatical do morador.
export function gw(r, f, m, n = m) {
  return r.g === 'f' ? f : r.g === 'n' ? n : m;
}

export function occupationLabel(state, r) {
  if (!r.alive) return 'Falecid' + gw(r, 'a', 'o', 'e');
  if (r.away) return 'Em expedição';
  if (r.title && r.role) return r.title;
  if (r.role) return ROLES[r.role].label;
  if (r.age < WORK_AGE[0]) return r.age < 6 ? 'Criança pequena' : 'Estudante';
  if (r.age > WORK_AGE[1]) return r.title || 'Aposentad' + gw(r, 'a', 'o', 'e');
  if (r.job === 'maintenance') return 'Manutenção do casco';
  if (r.job) {
    const mod = state.modules.find((m) => m.id === r.job);
    if (mod) return MODULES[mod.type].name;
  }
  return 'Sem função';
}

// Categoria visual do uniforme, usada pela renderização.
export function outfitOf(state, r) {
  if (r.age < WORK_AGE[0]) return 'child';
  if (r.role === 'council') return 'council';
  if (r.role === 'guard') return 'guard';
  if (r.role === 'cook') return 'cook';
  if (r.role === 'archive') return 'archive';
  if (r.role === 'diver') return 'diver';
  if (r.age > WORK_AGE[1]) return 'elder';
  if (r.job === 'maintenance') return 'industry';
  if (r.job) {
    const mod = state.modules.find((m) => m.id === r.job);
    if (mod) return MODULES[mod.type].category;
  }
  return 'idle';
}

export function jobModule(state, r) {
  if (!r.job || r.job === 'maintenance') return null;
  return state.modules.find((m) => m.id === r.job) || null;
}

export function kinOf(r, otherId) {
  return r.kin[otherId] || null;
}

export function bond(r, otherId) {
  return r.bonds[otherId] || 0;
}

// ---------------------------------------------------------------------------
// Criação

function newResident(state, data) {
  const personality = personalityFrom(data.traits);
  const r = {
    id: state.nextResidentId++,
    key: data.key || null,
    first: data.first,
    last: data.last,
    nick: data.nick || null,
    g: data.g,
    age: data.age,
    alive: true,
    deathDay: null,
    deathCause: null,
    role: data.role || null,
    title: data.title || null,
    job: null,
    trade: data.trade || null,
    traits: data.traits,
    personality,
    favorite: data.favorite || null,
    home: null,
    appearance: data.appearance,
    mood: clamp(personality.mood + (data.moodOffset || 0), 5, 95),
    opinion: clamp(56 + personality.opinionBias + (data.opinionOffset || 0), 5, 95),
    bonds: {},
    kin: {},
    memories: [],
    status: null,
    away: false,
    knows: [],
    backstory: data.backstory || null,
    supporting: !!data.supporting,
    born: data.born ?? null,
  };
  state.residents.push(r);
  return r;
}

function setBond(a, b, value) {
  a.bonds[b.id] = value;
  b.bonds[a.id] = value;
}

const KIN_PAIRS = {
  spouse: ['spouse', 'spouse'],
  parent: ['child', 'parent'],
  sibling: ['sibling', 'sibling'],
  aunt: ['niece', 'aunt'],
};

function link(a, b, kind, value) {
  setBond(a, b, value);
  if (KIN_PAIRS[kind]) {
    // a.kin[b] descreve o que b é para a.
    a.kin[b.id] = KIN_PAIRS[kind][0];
    b.kin[a.id] = KIN_PAIRS[kind][1];
  }
}

function randomTraits(state) {
  const keys = Object.keys(TRAITS);
  for (;;) {
    const a = pick(state, keys);
    const b = pick(state, keys);
    if (a === b) continue;
    if (TRAIT_CONFLICTS.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) continue;
    return [a, b];
  }
}

function randomAppearance(state, g, age) {
  const old = age >= 55;
  const styles = g === 'm' ? ['curto', 'raspado', 'careca', 'cacheado', 'curto', 'rabo'] : g === 'f' ? ['coque', 'longo', 'trancas', 'cacheado', 'rabo', 'curto'] : HAIR_STYLES;
  let hairColor = randInt(state, 0, 4);
  if (old) hairColor = chance(state, 0.7) ? pick(state, [5, 6]) : hairColor;
  if (age >= 14 && age < 35 && chance(state, 0.08)) hairColor = pick(state, [7, 8]);
  let height;
  if (age < 14) height = 0.5 + age * 0.03 + random(state) * 0.04;
  else height = (g === 'm' ? 1.0 : 0.95) + random(state) * 0.1;
  return {
    skin: randInt(state, 0, SKIN_TONES.length - 1),
    hair: pick(state, styles),
    hairColor: Math.min(hairColor, HAIR_COLORS.length - 1),
    height: Math.round(height * 100) / 100,
    build: Math.round((0.86 + random(state) * 0.34) * 100) / 100,
    beard: g === 'm' && age >= 18 && chance(state, 0.45) ? pick(state, BEARDS.slice(1)) : 'nenhuma',
    extra: age < 14 ? (chance(state, 0.15) ? 'gorro' : 'nenhum') : chance(state, 0.4) ? pick(state, EXTRAS.slice(1)) : 'nenhum',
  };
}

function takeName(state, used, g) {
  const pool = FIRST_NAMES[g].filter((n) => !used.has(n));
  const name = pick(state, pool.length ? pool : FIRST_NAMES[g]);
  used.add(name);
  return name;
}

function takeSurname(state, used) {
  const pool = SURNAMES.filter((n) => !used.has(n));
  const name = pick(state, pool);
  used.add(name);
  return name;
}

function randomGender(state) {
  const roll = random(state);
  return roll < 0.48 ? 'f' : roll < 0.96 ? 'm' : 'n';
}

// Cria os moradores, distribui leitos e funções e tece os laços.
// Espera que os módulos iniciais já existam em state.modules.
export function createPopulation(state) {
  state.residents = [];
  state.nextResidentId = 1;
  const usedFirst = new Set(CAST.map((c) => c.first));
  const usedLast = new Set(CAST.map((c) => c.last));

  const byKey = {};
  for (const c of CAST) {
    byKey[c.key] = newResident(state, c);
    byKey[c.key].castJob = c.job || null;
  }
  for (const [a, b, kind, value] of CAST_BONDS) link(byKey[a], byKey[b], kind, value);

  // Gerados: quatro famílias com uma criança, um par de irmãos e solteiros.
  const generated = [];
  const families = [];
  for (let f = 0; f < GENERATED_CHILDREN; f++) {
    const surname = takeSurname(state, usedLast);
    const ageA = randInt(state, 26, 44);
    const ga = randomGender(state) === 'm' ? 'm' : 'f';
    const gb = chance(state, 0.85) ? (ga === 'm' ? 'f' : 'm') : ga;
    const a = makeGenerated(state, usedFirst, surname, ga, ageA);
    const b = makeGenerated(state, usedFirst, surname, gb, clamp(ageA + randInt(state, -5, 5), 22, 50));
    const kid = makeGenerated(state, usedFirst, surname, randomGender(state), randInt(state, 3, 13));
    link(a, b, 'spouse', randInt(state, 55, 90));
    link(a, kid, 'parent', randInt(state, 75, 95));
    link(b, kid, 'parent', randInt(state, 75, 95));
    generated.push(a, b, kid);
    families.push([a, b, kid]);
  }
  const siblingSurname = takeSurname(state, usedLast);
  const s1 = makeGenerated(state, usedFirst, siblingSurname, randomGender(state), randInt(state, 20, 40));
  const s2 = makeGenerated(state, usedFirst, siblingSurname, randomGender(state), clamp(s1.age + randInt(state, -6, 6), 18, 50));
  link(s1, s2, 'sibling', randInt(state, 40, 85));
  generated.push(s1, s2);
  while (generated.filter((r) => r.age >= 14).length < GENERATED_ADULTS) {
    generated.push(makeGenerated(state, usedFirst, takeSurname(state, usedLast), randomGender(state), randInt(state, 19, 58)));
  }

  assignHomes(state, byKey, families);
  assignStartingJobs(state, byKey);
  weaveFriendships(state);
  for (const r of state.residents) {
    if (!r.backstory && !r.key) r.backstory = generateBackstory(state, r).map((line) => forms(line, r.g));
  }
  return byKey;
}

function makeGenerated(state, usedFirst, surname, g, age) {
  const first = takeName(state, usedFirst, g);
  return newResident(state, {
    first,
    last: surname,
    nick: NICKNAMES[first] && chance(state, 0.4) ? NICKNAMES[first] : null,
    g,
    age,
    traits: randomTraits(state),
    trade: pick(state, Object.keys(TRADES)),
    appearance: randomAppearance(state, g, age),
    moodOffset: randInt(state, -8, 8),
    opinionOffset: randInt(state, -8, 8),
  });
}

function housingModules(state) {
  return state.modules.filter((m) => MODULES[m.type].housing);
}

function assignHomes(state, byKey, families) {
  const core = state.modules.find((m) => m.type === 'core');
  const habitats = state.modules.filter((m) => m.type === 'habitat');
  const count = new Map(housingModules(state).map((m) => [m.id, 0]));
  const place = (r, mod) => {
    r.home = mod.id;
    count.set(mod.id, count.get(mod.id) + 1);
  };
  for (const c of CAST) {
    const r = byKey[c.key];
    place(r, c.home === 'core' ? core : habitats[c.home] || habitats[0]);
  }
  const roomiest = () => habitats.reduce((best, m) => (count.get(m.id) < count.get(best.id) ? m : best), habitats[0]);
  for (const fam of families) {
    const home = roomiest();
    for (const r of fam) place(r, home);
  }
  for (const r of state.residents) if (r.home === null) place(r, roomiest());
}

// Ocupa as vagas iniciais: primeiro quem tem função escrita no elenco,
// depois os gerados por aptidão.
function assignStartingJobs(state, byKey) {
  const staffing = { tidal: [2], oxygen: [4], water: [4], farm: [4, 2], workshop: [3], clinic: [1] };
  const openings = [];
  const seen = {};
  for (const m of state.modules) {
    const plan = staffing[m.type];
    if (!plan) continue;
    const index = seen[m.type] || 0;
    seen[m.type] = index + 1;
    const n = plan[index] ?? 0;
    for (let i = 0; i < n; i++) openings.push(m);
  }
  const fill = (r, mod) => {
    r.job = mod.id;
    openings.splice(openings.indexOf(mod), 1);
  };
  for (const r of state.residents) {
    if (!r.castJob) continue;
    const mod = openings.find((m) => m.type === r.castJob);
    if (mod) fill(r, mod);
    delete r.castJob;
  }
  for (const r of state.residents) delete r.castJob;

  const free = shuffle(state, state.residents.filter((r) => !r.key && canWork(r) && !r.job));
  // Primeiro casa aptidão com vaga; o resto ocupa o que sobrar.
  for (const r of free) {
    const match = openings.find((m) => MODULES[m.type].trade === r.trade);
    if (match) fill(r, match);
  }
  for (const r of free) {
    if (r.job) continue;
    if (openings.length > 0) {
      const mod = openings[0];
      fill(r, mod);
      if (chance(state, 0.6)) r.trade = MODULES[mod.type].trade || r.trade;
    } else if (state.residents.filter((x) => x.job === 'maintenance').length < state.maintenance) {
      r.job = 'maintenance';
    }
  }
}

function weaveFriendships(state) {
  const people = state.residents.filter((r) => r.age >= 6);
  for (const r of people) {
    const friends = Object.keys(r.bonds).filter((id) => r.bonds[id] > 20).length;
    const want = Math.max(0, Math.round(1 + r.personality.social * 2) - friends);
    for (let i = 0; i < want; i++) {
      const candidates = people.filter((o) => o !== r && !(o.id in r.bonds) && Math.abs(o.age - r.age) < (r.age < 14 ? 6 : 30));
      if (candidates.length === 0) break;
      // Colegas de trabalho e vizinhos de alojamento se conhecem melhor.
      const scored = candidates.map((o) => ({ o, w: 1 + (o.job && o.job === r.job ? 3 : 0) + (o.home === r.home ? 2 : 0) + random(state) }));
      scored.sort((a, b) => b.w - a.w);
      setBond(r, scored[0].o, randInt(state, 25, 65));
    }
  }
  // Algumas rixas: a colônia é pequena demais para todo mundo se gostar.
  const adults = shuffle(state, state.residents.filter((r) => !r.key && r.age >= 18));
  for (let i = 0; i + 1 < adults.length && i < 6; i += 2) {
    const [a, b] = [adults[i], adults[i + 1]];
    if (a.kin[b.id]) continue;
    setBond(a, b, -randInt(state, 30, 60));
  }
}

// ---------------------------------------------------------------------------
// Histórias dos moradores gerados

const HOBBIES = [
  'conserto rádios velhos que ninguém mais usa',
  'desenho os peixes que passam pela vigia',
  'jogo dominó com o pessoal da Oficina',
  'canto no Átrio quando acho que ninguém está ouvindo',
  'coleciono parafusos de cores diferentes',
  'escrevo cartas que nunca vou mandar',
  'treino respiração para um dia mergulhar',
  'cuido de uma muda de alga no meu beliche',
  'decoro os nomes de todas as constelações do livro do Teodoro',
  'faço bonecos com restos de cabo',
];

const FEARS = [
  'acordar com água no beliche',
  'ficar sem ar no escuro',
  'esquecer a voz da minha mãe',
  'que o Conselho saiba mais do que diz',
  'ouvir o casco estalar e não ter para onde correr',
  'morrer aqui embaixo sem ter visto nada',
];

const DREAMS = [
  'ver uma tempestade de verdade',
  'plantar uma árvore e ficar velh{a|o|e} na sombra dela',
  'nadar sem traje, nem que fosse uma vez',
  'ouvir um pássaro cantar',
  'que meus netos nasçam lá em cima',
  'consertar esta colônia inteira, cano por cano',
  'sentir frio. Frio de vento, não de máquina',
];

function generateBackstory(state, r) {
  const lines = [];
  const born = randInt(state, 1, 6);
  if (r.age < 14) {
    lines.push(pick(state, [
      `Eu nasci aqui, no Nível ${born}. Todo mundo nasceu aqui, menos os velhos.`,
      'O professor Teodoro diz que eu faço pergunta demais. Eu acho que ele responde de menos.',
      'Quando crescer eu vou trabalhar na eclusa, que nem o Ícaro.',
    ]));
    lines.push(`Nas horas livres eu ${pick(state, ['brinco de esconde-esconde nos dutos', 'conto os peixes da vigia', 'desenho a superfície com giz de casco', 'escuto as histórias da Dona Zu'])}.`);
    lines.push(pick(state, ['Eu tenho medo do barulho do casco à noite.', 'Eu queria ver uma nuvem. O livro diz que é de água, mas flutua.', 'Minha mãe diz que lá em cima é quente demais. Como ela sabe?']));
    return lines;
  }
  const spouseId = Object.keys(r.kin).find((id) => r.kin[id] === 'spouse');
  const spouse = spouseId ? state.residents.find((o) => o.id === Number(spouseId)) : null;
  if (r.age > 45) lines.push(`Meus pais vieram na primeira descida. Eu nasci no Nível ${born}, quando ainda havia lugar sobrando.`);
  else lines.push(`Nasci no Nível ${born}. ${pick(state, ['Cresci ouvindo histórias da superfície que ninguém sabia se eram verdade.', 'Minha primeira lembrança é o barulho das bombas de ar.', 'Aprendi a ler com o Teodoro, como todo mundo da minha idade.'])}`);
  if (spouse) lines.push(`${spouse.g === 'f' ? 'Minha mulher' : spouse.g === 'm' ? 'Meu marido' : 'Minhe companheire'}, ${spouse.first}, é quem me segura quando o casco range. Nas folgas eu ${pick(state, HOBBIES)}.`);
  else lines.push(`Nas folgas eu ${pick(state, HOBBIES)}.`);
  if (r.traits.includes('ansioso') || r.traits.includes('melancolico')) lines.push(`Meu maior medo é ${pick(state, FEARS)}.`);
  else lines.push(`Meu sonho é ${pick(state, DREAMS)}.`);
  return lines;
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}
