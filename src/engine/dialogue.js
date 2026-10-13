// Conversas com os moradores. Uma conversa é um objeto transitório (não vai
// para o save); o que ela muda no mundo (opiniões, memórias, o que você
// sabe, missões) fica no estado.
//
// Modelos de fala: {f|m|n} concorda com o jogador; <f|m|n> com quem fala.

import { MODULES, ROLES, WORK_AGE } from './data.js';
import { assignJob, getModule, takeItem, workersOf } from './game.js';
import { GIFT_REACTIONS, ITEMS, giftValue } from './items.js';
import { CAST, DEPARTED } from './people/cast.js';
import { canWork, displayName, fullName, gw, isSick, occupationLabel, residentById } from './people/population.js';
import { activityLabel, planFor } from './people/schedule.js';
import { adjustReputation, createRumor, refreshAggregates, remember, reputationTitle, rumorKnownShare } from './people/social.js';
import { TRADES, TRAITS } from './people/traits.js';
import { hash01, hashPick } from './rng.js';
import { forms, kinLabel, listPt } from './text.js';

const VOICES = Object.fromEntries(CAST.map((c) => [c.key, c.voice]));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Hooks de missões injetados por quests.js (evita importação circular).
const questHooks = { options: () => [], greeting: () => null };
export function registerQuestHooks(hooks) {
  Object.assign(questHooks, hooks);
}

// ---------------------------------------------------------------------------
// Texto

export function say(state, r, text) {
  const own = text.replace(/<([^<>|]*)\|([^<>|]*)(?:\|([^<>|]*))?>/g, (_, f, m, n) => (r.g === 'f' ? f : r.g === 'n' ? (n ?? m) : m));
  return forms(own, state.player.g).replaceAll('{nome}', state.player.name);
}

function tier(r) {
  if (r.opinion >= 65) return 'high';
  if (r.opinion >= 35) return 'mid';
  return 'low';
}

function salutation(minute) {
  const m = ((minute % 1440) + 1440) % 1440;
  if (m >= 5 * 60 && m < 12 * 60) return 'Bom dia';
  if (m >= 12 * 60 && m < 18 * 60) return 'Boa tarde';
  return 'Boa noite';
}

export function known(state, r) {
  if (!state.player.known[r.id]) state.player.known[r.id] = { met: null, about: 0, mood: null, facts: [] };
  return state.player.known[r.id];
}

function addFact(state, r, fact) {
  const k = known(state, r);
  if (!k.facts.includes(fact)) k.facts.push(fact);
}

// Como a pessoa chama você.
function address(state, r) {
  const title = reputationTitle(state);
  if (r.opinion >= 75) return state.player.name;
  if (title && Math.abs(r.opinion - 50) > 15 && hash01(r.id, state.cycle, 'title') < 0.5) return title.title;
  return 'Superintendente';
}

const GENERIC_GREETINGS = {
  high: ['{sal}, {addr}! Que bom ver você.', 'Oi, {addr}! Veio conversar?', '{addr}! Senta um pouco.', 'Olha só, {addr}. Melhorou meu dia.'],
  mid: ['{sal}, {addr}.', '{addr}.', 'Pois não?', '{sal}.'],
  low: ['O que foi?', 'Hm. {addr}.', 'Estou ocupad<a|o|e>.', 'Lá vem o Conselho.', 'Fala logo.'],
};

const TRAIT_FLAVOR = {
  brincalhao: ['Veio ouvir piada? Tenho uma ótima sobre bombas de ar. Ela é um sopro.', 'Se você veio cobrar produtividade, eu estou produzindo alegria.'],
  rabugento: ['Se for reclamar do barulho, não fui eu.', 'Mais um dia nessa lata.'],
  ansioso: ['Você ouviu esse estalo? Juro que ouvi um estalo.', 'Está tudo bem com o casco, né? Né?'],
  fofoqueiro: ['Ah, você precisa saber da última!', 'Chega mais perto, que as paredes têm ouvido.'],
  devoto: ['Que os Fundadores nos guardem.', 'Os Fundadores sabiam o que faziam. Eu confio.'],
  sonhador: ['Sabia que agora mesmo está fazendo sol em algum lugar lá em cima?', 'Sonhei com vento de novo.'],
  solitario: ['...', 'Hm.'],
  curioso: ['Posso perguntar uma coisa? Só uma. Ou três.', 'O que tem atrás da porta lacrada do Nível 6?'],
  melancolico: ['Às vezes eu esqueço que existe outra cor além do azul.', 'Dia comprido hoje.'],
  generoso: ['Já comeu? Tem um tablete sobrando aqui.', 'Se precisar de alguma coisa, é só pedir.'],
  desconfiado: ['O que você quer de mim?', 'Ninguém do Conselho aparece sem motivo.'],
  rebelde: ['Ainda mandando em todo mundo?', 'Fala, chefe. Ou devo dizer "senhor<a|o|e> do oxigênio"?'],
  leal: ['Às ordens, {addr}.', 'Tudo em ordem por aqui.'],
  trabalhador: ['Rapidinho, que eu tenho trabalho.', 'Bom ver o Conselho por aqui.'],
  preguicoso: ['Estou na pausa. Uma pausa estratégica.', 'Ninguém viu você me pegando parad<a|o|e>, combinado?'],
};

function greetingFor(state, r, plan) {
  const t = tier(r);
  const voice = r.key ? VOICES[r.key] : null;
  const day = state.cycle;
  let line;
  if (voice && voice.greet) line = hashPick(voice.greet[t], r.id, day, 'g');
  else {
    line = hashPick(GENERIC_GREETINGS[t], r.id, day, 'g');
    const flavor = r.traits.map((k) => TRAIT_FLAVOR[k]).filter(Boolean);
    if (flavor.length && hash01(r.id, day, 'fl') < 0.55) line += ' ' + hashPick(hashPick(flavor, r.id, day, 'ft'), r.id, day, 'fl2');
  }
  line = line.replace('{sal}', salutation(state.time.minute)).replaceAll('{addr}', address(state, r));
  const prefix = [];
  if (plan && plan.activity === 'sleep') prefix.push('(Acorda assustad<a|o|e>.) Hã? A essa hora?');
  else if (isSick(r)) prefix.push('(Tosse.)');
  const grief = r.memories.find((m) => m.kind === 'grief' && state.cycle - m.day <= 4);
  if (grief) return say(state, r, `${prefix.join(' ')} ${hashPick(['(Os olhos estão vermelhos.)', '(Fala baixo.)'], r.id, day)} ${t === 'low' ? 'Agora não.' : 'Desculpe. Não é um bom dia.'}`.trim());
  return say(state, r, `${prefix.join(' ')} ${line}`.trim());
}

// ---------------------------------------------------------------------------
// Assuntos

function concernsOf(state, r) {
  const out = [];
  const grief = r.memories.find((m) => m.kind === 'grief' && state.cycle - m.day <= 12);
  if (grief) {
    const who = residentById(state, grief.about);
    if (who) out.push({ w: 10, text: `Ainda penso ${who.g === 'f' ? 'na' : who.g === 'n' ? 'ne' : 'no'} ${displayName(who)} o tempo todo. ${r.kin[who.id] ? 'Era ' + (who.g === 'f' ? 'minha ' : 'meu ') + kinLabel(r.kin[who.id], who) + '.' : 'Era uma pessoa boa.'}` });
  }
  if (isSick(r)) out.push({ w: 9, text: 'Essa febre não me larga. A Helena diz que passa. A Helena sempre diz que passa.' });
  if (r.age >= WORK_AGE[0] && r.age <= WORK_AGE[1] && !r.role && !r.job) {
    out.push({ w: r.traits.includes('preguicoso') ? 3 : 8, text: r.traits.includes('preguicoso') ? 'Sem função, sem chefe, sem pressa. Não reclamo.' : 'Estou sem função. Fico andando pelos corredores, me sentindo um peso.' });
  }
  if (r.job && r.job !== 'maintenance') {
    const mod = getModule(state, r.job);
    if (mod && MODULES[mod.type].trade && r.trade && MODULES[mod.type].trade !== r.trade) {
      out.push({ w: 6, text: `Eu levo jeito para ${TRADES[r.trade].toLowerCase()}, mas me puseram em ${MODULES[mod.type].name}. Faço o que dá.` });
    } else if (mod) {
      out.push({ w: 2, text: `Gosto do trabalho em ${MODULES[mod.type].name}. É barulhento, mas é meu.` });
    }
  }
  const home = getModule(state, r.home);
  if (home) {
    const load = state.residents.filter((o) => o.alive && !o.away && o.home === home.id).length;
    if (load > (MODULES[home.type].housing || 0)) out.push({ w: 7, text: 'O alojamento está lotado. Tem gente dormindo no chão do corredor.' });
  }
  if (state.resources.oxygen < 40) out.push({ w: 8, text: 'O ar está pesado. Você sente? Eu acordo com dor de cabeça.' });
  if (state.resources.food < 40) out.push({ w: 6, text: 'As porções estão menores. As crianças percebem primeiro.' });
  if (state.hull < 45) out.push({ w: 7, text: 'O casco geme a noite toda. Ninguém dorme direito.' });
  if (state.decrees.patrols && r.personality.truth > 0.2) out.push({ w: 5, text: 'Essas patrulhas... a gente não pode mais nem conversar em paz.' });
  if (state.decrees.rationing) out.push({ w: 4, text: 'Com o racionamento, eu sonho com comida.' });
  if (state.decrees.doubleShift) out.push({ w: 5, text: 'Dois turnos seguidos. Minhas mãos não param de tremer.' });
  const secret = state.rumors.find((x) => x.kind === 'secret' && !x.public && x.knownBy.includes(r.id));
  if (secret) out.push({ w: 4, text: 'Tem coisas que eu sei e preferia não saber. Mas não me pergunte.' });
  if (out.length === 0) out.push({ w: 1, text: hashPick(['Nada de novo. E aqui embaixo isso é uma boa notícia.', 'Tudo no lugar. O casco aguenta, o ar circula, a gente segue.'], r.id, state.cycle) });
  return out.sort((a, b) => b.w - a.w);
}

function moodLine(r) {
  if (r.mood >= 70) return 'Estou bem. De verdade.';
  if (r.mood >= 45) return 'Vou levando.';
  if (r.mood >= 25) return `Cansad<a|o|e>. Muito cansad<a|o|e>.`;
  return 'Mal. Não sei quanto tempo mais eu aguento isso.';
}

function aboutLine(state, r, index) {
  if (r.key && VOICES[r.key] && VOICES[r.key].about) return VOICES[r.key].about[index] || null;
  return (r.backstory || [])[index] || null;
}

function aboutCount(r) {
  if (r.key && VOICES[r.key] && VOICES[r.key].about) return VOICES[r.key].about.length;
  return (r.backstory || []).length;
}

// O que a pessoa sabe e conta: segredos, ações suas, a vida dos outros.
function gossipFor(state, r) {
  const playerKnows = state.player.rumorsKnown;
  const fresh = state.rumors.filter((x) => x.knownBy.includes(r.id) && !playerKnows.includes(x.id));
  const willing = r.personality.gossip + (r.opinion - 50) / 100;
  if (fresh.length && willing > 0.15) {
    const rumor = fresh.sort((a, b) => b.day - a.day)[0];
    playerKnows.push(rumor.id);
    if (rumor.kind === 'secret') {
      const share = Math.round(rumorKnownShare(state, rumor) * 100);
      return `(Olha para os lados.) ${rumor.text} ${share >= 15 ? 'Muita gente já sabe.' : 'Pouca gente sabe. Por enquanto.'}`;
    }
    return rumor.text;
  }
  // Fofoca sobre outros moradores.
  const options = [];
  for (const [id, v] of Object.entries(r.bonds)) {
    const o = residentById(state, Number(id));
    if (!o || !o.alive || o.id === r.id) continue;
    if (v <= -30) options.push(`Eu e ${o.g === 'f' ? 'a' : 'o'} ${displayName(o)} não nos falamos. É uma longa história e eu não vou contar.`);
    for (const [id2, v2] of Object.entries(o.bonds)) {
      const p = residentById(state, Number(id2));
      if (p && p.alive && p.id !== r.id && v2 <= -35 && !o.kin[p.id]) options.push(`${displayName(o)} e ${displayName(p)} não se suportam. Melhor não pôr os dois no mesmo turno.`);
      if (p && p.alive && p.id !== r.id && v2 >= 60 && !o.kin[p.id] && !Object.values(o.kin).includes('spouse')) options.push(`Repara como ${displayName(o)} olha para ${displayName(p)} no refeitório. Isso ainda vira casamento.`);
    }
    if (o.mood < 30) options.push(`${displayName(o)} anda muito para baixo. Alguém devia conversar com ${gw(o, 'ela', 'ele', 'elu')}.`);
    if (o.opinion < 25) options.push(`${displayName(o)} anda falando mal do Conselho. Não ouvi de mim.`);
  }
  const title = reputationTitle(state);
  if (title) options.push(`Sabe como andam te chamando nos corredores? "${title.title}". ${title.desc}`);
  if (options.length === 0) return 'Ninguém conta nada para mim. Ou eu não presto atenção.';
  return hashPick(options, r.id, state.cycle, 'gossip', state.stats.conversations);
}

// ---------------------------------------------------------------------------
// Mudança de função

export function jobOpenings(state) {
  const out = [];
  for (const m of state.modules) {
    const def = MODULES[m.type];
    if (!def.slots || m.buildLeft > 0) continue;
    const free = def.slots - workersOf(state, m.id).length;
    if (free > 0) out.push({ job: m.id, label: `${def.name} (Nível ${m.level + 1})`, trade: def.trade, free });
  }
  out.push({ job: 'maintenance', label: 'Manutenção do casco', trade: 'mecânica', free: Infinity });
  return out;
}

export function jobAcceptance(state, r, job) {
  const opening = jobOpenings(state).find((o) => o.job === job);
  const match = opening && opening.trade && opening.trade === r.trade;
  let p = 0.55 + (r.opinion - 50) / 90 - r.personality.stubborn * 0.45 + (match ? 0.3 : -0.05);
  if (!r.job) p += 0.3;
  return clamp(p, 0.05, 0.98);
}

function requestJob(state, r, job) {
  const opening = jobOpenings(state).find((o) => o.job === job);
  if (!opening) return { text: 'Não tem vaga lá.', ok: false };
  const roll = hash01(r.id, state.cycle, 'job', String(job));
  if (roll > jobAcceptance(state, r, job)) {
    r.opinion = clamp(r.opinion - 2, 0, 100);
    const why = r.traits.includes('teimoso') ? 'Não. Eu sei onde sou útil.' : r.opinion < 40 ? 'E por que eu faria um favor ao Conselho?' : 'Prefiro ficar onde estou, se não for uma ordem.';
    return { text: why, ok: false, canOrder: true };
  }
  const result = assignJob(state, r.id, job);
  if (!result.ok) return { text: result.error, ok: false };
  const match = opening.trade === r.trade;
  remember(r, { day: state.cycle, kind: 'player', text: `Mudou para ${opening.label} a pedido do Conselho.`, weight: match ? 3 : 0 });
  if (match) r.opinion = clamp(r.opinion + 4, 0, 100);
  return { text: match ? 'Finalmente uma coisa que eu sei fazer! Começo amanhã cedo.' : 'Tudo bem. Se precisam de mim lá, eu vou.', ok: true };
}

function orderJob(state, r, job) {
  const opening = jobOpenings(state).find((o) => o.job === job);
  const result = assignJob(state, r.id, job);
  if (!result.ok) return { text: result.error, ok: false };
  r.opinion = clamp(r.opinion - 10, 0, 100);
  adjustReputation(state, { mercy: -1 });
  remember(r, { day: state.cycle, kind: 'player', text: `Foi mandad${gw(r, 'a', 'o', 'e')} para ${opening ? opening.label : 'outra função'} contra a vontade.`, weight: -10 });
  return { text: hashPick(['Sim, Superintendente. (Não olha nos seus olhos.)', 'Como quiser. Não esperava outra coisa.', 'Ordem é ordem.'], r.id, state.cycle), ok: true };
}

// ---------------------------------------------------------------------------
// Presentes

export function giftableItems(state) {
  return Object.entries(state.player.inventory)
    .filter(([id, qty]) => qty > 0 && ITEMS[id] && ITEMS[id].gift)
    .map(([id, qty]) => ({ id, qty, name: ITEMS[id].name }));
}

const FAVORITE_LINES = {
  augusto: 'Uma moeda de verdade! Olha o perfil gravado. Eu... obrigado. Isto vai para a minha coleção, e você vai para a minha lista de pessoas sensatas.',
  clara: 'Girassol. (As mãos tremem.) Minha avó plantava isso no quintal. Eles viravam a cabeça para seguir o sol. Você não sabe o que me deu.',
  teodoro: 'Um livro! Inchado, manchado, lindo. Um poema sobre chuva... vou ler para as crianças amanhã. Obrigado, obrigado.',
  irene: 'Óculos escuros. (Ri, depois chora um pouco.) Para quando eu estiver lá em cima. Você é a primeira pessoa que não acha que eu sou louca.',
  nina: 'É O CÉU! É o céu de verdade! Posso ficar? Posso mostrar para todo mundo? Vou guardar na caixa das relíquias, no lugar de honra!',
  davi: 'Uma bússola. A agulha ainda aponta para o norte. (Fica olhando muito tempo.) Sabe o que isso quer dizer? Que existe um norte.',
  marta: 'Uma concha... o Tomás colecionava. Tinha uma caixa cheia. (Pigarreia.) Obrigada. Não conta para ninguém que eu fiquei assim.',
  helena: 'Uma caixinha de música! Ela toca? (Gira a manivela; uma valsa enferrujada enche a Enfermaria.) Os pacientes vão adorar.',
  icaro: 'Dente da baleia dos destroços. Eu passo por ela toda semana. Nunca tive coragem de tirar nada dela. Vou guardar com cuidado.',
  zuleica: 'PIMENTA? Pimenta de verdade? Meu bem, você não sabe o que fez. Hoje à noite o refeitório vai ter gosto de alguma coisa!',
  rafael: 'Um livro... Obrigado. Ninguém me dá nada que não seja ordem.',
};

export function giveGift(state, r, itemId) {
  if (!takeItem(state, itemId, 1)) return { text: 'Você não tem isso.', ok: false };
  const gifted = state.player.giftsToday;
  let value = giftValue(r, itemId);
  if (gifted.includes(r.id)) value = Math.round(value / 2);
  gifted.push(r.id);
  r.opinion = clamp(r.opinion + value, 0, 100);
  r.mood = clamp(r.mood + value / 2, 0, 100);
  state.stats.gifts += 1;
  remember(r, { day: state.cycle, kind: 'player', text: `Ganhou de presente: ${ITEMS[itemId].name}.`, weight: value });
  refreshAggregates(state);
  adjustReputation(state, { mercy: 1 });
  if (value >= GIFT_REACTIONS.favorite && r.key && FAVORITE_LINES[r.key]) return { text: FAVORITE_LINES[r.key], ok: true, value };
  if (value >= GIFT_REACTIONS.liked) return { text: hashPick(['Para mim? Que coisa linda. Obrigad<a|o|e>, de verdade.', 'Eu adorei. Ninguém nunca me deu nada assim.', 'Isso vai ficar do lado do meu beliche.'], r.id, state.cycle), ok: true, value };
  return { text: hashPick(['Ah. Obrigad<a|o|e>. Vou achar um lugar para isso.', 'Hum, que gentileza.', 'Não precisava. Mas obrigad<a|o|e>.'], r.id, state.cycle), ok: true, value };
}

// ---------------------------------------------------------------------------
// Pedir silêncio sobre um segredo

export function secretsKnownBy(state, r) {
  return state.rumors.filter((x) => x.kind === 'secret' && !x.public && x.knownBy.includes(r.id) && !(x.silenced || []).includes(r.id));
}

function silence(state, r, method) {
  const secrets = secretsKnownBy(state, r);
  if (secrets.length === 0) return { text: 'Do que você está falando?', ok: false };
  const mark = () => {
    for (const s of secrets) (s.silenced || (s.silenced = [])).push(r.id);
  };
  if (method === 'persuade') {
    if (r.opinion >= 55 || r.personality.truth < -0.1) {
      mark();
      r.opinion = clamp(r.opinion - 2, 0, 100);
      adjustReputation(state, { truth: -2 });
      remember(r, { day: state.cycle, kind: 'player', text: 'Pediu segredo sobre os arquivos do Conselho.', weight: -2 });
      return { text: 'Tudo bem. Se você diz que é para o bem de todos... eu não conto. Mas não gosto disso.', ok: true };
    }
    r.opinion = clamp(r.opinion - 4, 0, 100);
    return { text: 'Por que eu guardaria segredo para o Conselho? O que vocês já fizeram por mim?', ok: false };
  }
  if (method === 'threaten') {
    adjustReputation(state, { truth: -3, mercy: -6 });
    r.opinion = clamp(r.opinion - 22, 0, 100);
    r.mood = clamp(r.mood - 10, 0, 100);
    remember(r, { day: state.cycle, kind: 'player', text: 'Foi ameaçad' + gw(r, 'a', 'o', 'e') + ' pelo Conselho para ficar calad' + gw(r, 'a', 'o', 'e') + '.', weight: -22 });
    const kin = Object.keys(r.kin).map(Number);
    createRumor(state, {
      kind: 'deed',
      label: `o Conselho ameaçou ${displayName(r)}`,
      text: `Dizem que ${fullName(r)} foi ameaçad${gw(r, 'a', 'o', 'e')} pelo Conselho para não abrir a boca.`,
      opinion: -4,
      align: { mercy: 1 },
      knownBy: kin,
    });
    if (r.traits.includes('rebelde') || r.traits.includes('teimoso')) {
      return { text: '(Ri na sua cara.) Pode me mandar para o Nível 6. Eu conto para quem eu quiser.', ok: false };
    }
    mark();
    return { text: '(Engole em seco.) ...Entendi. Eu não sei de nada.', ok: true };
  }
  if (method === 'bribe') {
    if (!takeItem(state, 'racao', 1)) return { text: 'Com o quê? Você não tem nada para oferecer.', ok: false };
    mark();
    r.opinion = clamp(r.opinion + 2, 0, 100);
    adjustReputation(state, { truth: -2 });
    remember(r, { day: state.cycle, kind: 'player', text: 'Ganhou ração extra para ficar calad' + gw(r, 'a', 'o', 'e') + '.', weight: 2 });
    return { text: 'Ração extra? (Guarda rápido no bolso.) Eu não vi nada, não sei de nada.', ok: true };
  }
  return { text: '...', ok: false };
}

// ---------------------------------------------------------------------------
// A conversa

export function openConversation(state, residentId) {
  const r = residentById(state, residentId);
  if (!r || !r.alive) return null;
  const k = known(state, r);
  const plan = planFor(state, r, state.time.minute);
  const conv = { residentId, lines: [], options: [], menu: 'root', ended: false };
  const firstTime = !k.met;
  if (firstTime) k.met = state.cycle;
  if (!state.player.talkedToday.includes(r.id)) {
    state.player.talkedToday.push(r.id);
    state.stats.conversations += 1;
    if (plan && plan.activity === 'sleep') r.opinion = clamp(r.opinion - 3, 0, 100);
    else r.opinion = clamp(r.opinion + (r.personality.social > 0.4 ? 1 : 0.5), 0, 100);
    refreshAggregates(state);
  }
  const questGreeting = questHooks.greeting(state, r);
  if (questGreeting) conv.lines.push({ who: 'npc', text: say(state, r, questGreeting) });
  else conv.lines.push({ who: 'npc', text: greetingFor(state, r, plan) });
  if (firstTime && !questGreeting) {
    const intro = r.age < 10 ? `Eu sou ${r.first}! Tenho ${r.age} anos.` : `Acho que ainda não nos falamos direito. Sou ${fullName(r)}, ${occupationLabel(state, r).toLowerCase()}.`;
    conv.lines.push({ who: 'npc', text: say(state, r, intro) });
  }
  conv.options = rootOptions(state, r);
  return conv;
}

function rootOptions(state, r) {
  const opts = [];
  for (const q of questHooks.options(state, r)) opts.push({ id: q.id, label: q.label, quest: true });
  opts.push({ id: 'how', label: 'Como você está?' });
  if (known(state, r).about < aboutCount(r)) opts.push({ id: 'about', label: known(state, r).about === 0 ? 'Me fale de você.' : 'Conte mais sobre você.' });
  if (r.age >= 10) opts.push({ id: 'gossip', label: 'O que andam dizendo por aí?' });
  if (canWork(r) && !r.role) opts.push({ id: 'jobs', label: 'Sobre o seu trabalho...' });
  if (giftableItems(state).length) opts.push({ id: 'gifts', label: 'Tenho uma coisa para você.' });
  if (secretsKnownBy(state, r).length && r.age >= 10) opts.push({ id: 'silence', label: 'Sobre o que você sabe dos arquivos...' });
  opts.push({ id: 'bye', label: 'Até mais.' });
  return opts;
}

export function chooseOption(state, conv, optionId) {
  const r = residentById(state, conv.residentId);
  if (!r) return conv;
  const option = conv.options.find((o) => o.id === optionId);
  if (!option) return conv;
  const npc = (text) => conv.lines.push({ who: 'npc', text: say(state, r, text) });
  conv.lines.push({ who: 'player', text: option.label });

  if (option.quest || option.run) {
    const hook = option.run ? option : questHooks.options(state, r).find((q) => q.id === optionId);
    const result = hook ? hook.run(state, r) : null;
    for (const line of (result && result.lines) || []) {
      if (typeof line === 'string') npc(line);
      else conv.lines.push({ who: line.who, text: line.who === 'npc' ? say(state, r, line.text) : line.text });
    }
    if (result && result.end) {
      conv.ended = true;
      conv.options = [];
      return conv;
    }
    conv.options = result && result.options ? result.options : rootOptions(state, r);
    return conv;
  }

  switch (optionId) {
    case 'how': {
      const concerns = concernsOf(state, r);
      npc(`${moodLine(r)} ${concerns[0].text}`);
      known(state, r).mood = state.cycle;
      addFact(state, r, concerns[0].text);
      break;
    }
    case 'about': {
      const k = known(state, r);
      const line = aboutLine(state, r, k.about);
      if (line) {
        npc(line);
        addFact(state, r, line);
        k.about += 1;
        r.opinion = clamp(r.opinion + 1.5, 0, 100);
        refreshAggregates(state);
      } else npc('Já te contei tudo que vale a pena contar.');
      break;
    }
    case 'gossip':
      npc(gossipFor(state, r));
      break;
    case 'jobs': {
      const current = occupationLabel(state, r);
      npc(`Hoje eu estou em: ${current}. ${r.trade ? `Meu forte é ${TRADES[r.trade].toLowerCase()}.` : ''}`);
      conv.options = jobOpenings(state)
        .filter((o) => o.job !== r.job)
        .slice(0, 7)
        .map((o) => ({ id: `job:${o.job}`, label: `Pode ir para ${o.label}?${o.trade === r.trade ? ' (aptidão)' : ''}` }));
      if (r.job) conv.options.unshift({ id: 'job:none', label: 'Pode largar sua função por enquanto.' });
      conv.options.push({ id: 'back', label: 'Deixa para lá.' });
      return conv;
    }
    case 'gifts':
      conv.options = giftableItems(state).map((it) => ({ id: `gift:${it.id}`, label: `Dar: ${it.name}${it.qty > 1 ? ` (${it.qty})` : ''}` }));
      conv.options.push({ id: 'back', label: 'Melhor não.' });
      return conv;
    case 'silence':
      npc(r.opinion >= 50 ? 'Os papéis? (Baixa a voz.) O que tem eles?' : 'O que você quer saber?');
      conv.options = [
        { id: 'silence:persuade', label: 'Peço que guarde isso só para você. É pelo bem da colônia.' },
        { id: 'silence:threaten', label: 'Se isso se espalhar, eu vou saber quem falou.' },
      ];
      if (state.player.inventory.racao) conv.options.push({ id: 'silence:bribe', label: 'Fique com esta ração extra e esqueça o assunto.' });
      conv.options.push({ id: 'back', label: 'Esquece.' });
      return conv;
    case 'back':
      npc(hashPick(['Tá bom.', 'Certo.', 'Como quiser.'], r.id, conv.lines.length));
      break;
    case 'bye':
      npc(hashPick(r.opinion >= 50 ? ['Até mais!', 'Volte quando quiser.', 'Cuide-se.'] : ['Hm.', 'Tá.', 'Até.'], r.id, state.cycle));
      conv.ended = true;
      conv.options = [];
      return conv;
    default:
      if (optionId.startsWith('job:')) {
        const raw = optionId.slice(4);
        const job = raw === 'none' ? null : raw === 'maintenance' ? 'maintenance' : Number(raw);
        if (job === null) {
          assignJob(state, r.id, null);
          npc('Tudo bem. Vou ficar à disposição.');
          break;
        }
        const res = requestJob(state, r, job);
        npc(res.text);
        if (!res.ok && res.canOrder) {
          conv.options = [
            { id: `order:${raw}`, label: 'Não é um pedido. É uma ordem.' },
            { id: 'back', label: 'Tudo bem, fique onde está.' },
          ];
          return conv;
        }
      } else if (optionId.startsWith('order:')) {
        const raw = optionId.slice(6);
        const job = raw === 'maintenance' ? 'maintenance' : Number(raw);
        npc(orderJob(state, r, job).text);
      } else if (optionId.startsWith('gift:')) {
        npc(giveGift(state, r, optionId.slice(5)).text);
      } else if (optionId.startsWith('silence:')) {
        npc(silence(state, r, optionId.slice(8)).text);
      }
  }
  conv.options = rootOptions(state, r);
  return conv;
}

// Resumo do que você sabe de alguém, para o Registro de Moradores.
export function dossier(state, r) {
  const k = state.player.known[r.id] || { met: null, about: 0, mood: null, facts: [] };
  const plan = planFor(state, r, state.time.minute);
  const relations = [];
  for (const [id, kind] of Object.entries(r.kin)) {
    const o = residentById(state, Number(id));
    if (o) relations.push(`${kinLabel(kind, o)} de ${fullName(o)}${o.alive ? '' : ' (†)'}`.replace(/^./, (c) => c.toUpperCase()));
  }
  const friends = Object.entries(r.bonds)
    .filter(([id, v]) => v >= 40 && !r.kin[id])
    .map(([id]) => residentById(state, Number(id)))
    .filter((o) => o && o.alive)
    .map(displayName);
  const rivals = Object.entries(r.bonds)
    .filter(([, v]) => v <= -30)
    .map(([id]) => residentById(state, Number(id)))
    .filter((o) => o && o.alive)
    .map(displayName);
  return {
    name: fullName(r),
    nick: r.nick,
    age: r.age,
    occupation: occupationLabel(state, r),
    traits: r.traits.map((t) => TRAITS[t].label),
    trade: r.trade ? TRADES[r.trade] : null,
    met: k.met,
    about: k.facts,
    mood: k.mood !== null && state.cycle - k.mood <= 2 ? r.mood : null,
    opinion: k.met ? r.opinion : null,
    relations,
    friends: k.met ? friends : [],
    rivals: k.met ? rivals : [],
    now: plan ? activityLabel(plan.activity) : r.alive ? '' : 'falecid' + gw(r, 'a', 'o', 'e'),
    alive: r.alive,
    deathCause: r.deathCause,
    memories: k.met ? r.memories.filter((m) => m.kind === 'player').slice(0, 4).map((m) => m.text) : [],
    role: r.role ? ROLES[r.role].label : null,
  };
}

export function departedNote(key) {
  return DEPARTED[key];
}

export function listNames(list) {
  return listPt(list);
}

