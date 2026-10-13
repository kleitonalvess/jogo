// Telas e janelas: título, criação de personagem, abertura, conversa,
// ocorrências, relatório da manhã, pausa e desfecho.

import { FRAGMENTS_TO_WIN, RESOURCES } from '../engine/data.js';
import { canAfford, eventDef, eventSpeaker, eventText, eventTitle, outcomeText } from '../engine/game.js';
import { epilogue } from '../engine/epilogue.js';
import { BEARDS, EXTRAS, HAIR_COLORS, HAIR_STYLES, SKIN_TONES } from '../engine/people/cast.js';
import { displayName, fullName, occupationLabel, residentById } from '../engine/people/population.js';
import { btn, esc, fmt, meter, signed } from './format.js';

export function renderTitle(hasSave) {
  return `<section class="title-screen" aria-label="Nadir">
    <div class="title-block">
      <p class="eyebrow">Colônia submarina · −160 a −360 m</p>
      <h1 class="logo">Nadir</h1>
      <p class="tagline">O clima expulsou a humanidade da superfície. Aqui embaixo, trinta e quatro pessoas respiram o ar que você decidir produzir, e acreditam no que você decidir contar.</p>
      <div class="title-actions">
        ${hasSave ? btn('continue', {}, 'Continuar', { cls: 'primary big' }) : ''}
        ${btn('new-game', {}, 'Nova partida', { cls: hasSave ? 'ghost big' : 'primary big' })}
        ${btn('show-help', {}, 'Como jogar', { cls: 'ghost' })}
      </div>
      ${hasSave ? '<p class="hint">Começar uma nova partida apaga a atual deste navegador.</p>' : ''}
    </div>
  </section>`;
}

const HAIR_LABELS = { curto: 'Curto', raspado: 'Raspado', coque: 'Coque', longo: 'Longo', cacheado: 'Cacheado', trancas: 'Tranças', careca: 'Careca', rabo: 'Rabo de cavalo' };
const BEARD_LABELS = { nenhuma: 'Sem barba', curta: 'Curta', cheia: 'Cheia', bigode: 'Bigode' };
const EXTRA_LABELS = { nenhum: 'Nada', oculos: 'Óculos', lenco: 'Lenço', gorro: 'Gorro', 'oculos-protecao': 'Óculos de proteção', cachecol: 'Cachecol' };

export function renderCreation(c) {
  const swatch = (field, list, current) =>
    list.map((color, i) => btn('create-set', { field, value: i }, '', { cls: `swatch ${current === i ? 'is-selected' : ''}`, label: `${field} ${i + 1}`, extra: ` style="--sw:${color}"` })).join('');
  const pills = (field, list, labels, current) => list.map((v) => btn('create-set', { field, value: v }, esc(labels[v] || v), { cls: `pill ${current === v ? 'is-selected' : ''}` })).join('');
  return `<section class="creation" aria-label="Criação de personagem">
    <div class="creation-panel">
      <p class="eyebrow">Ficha do Conselho</p>
      <h2>Quem vai suceder Severino Bastos?</h2>
      <label class="field"><span>Nome</span><input id="create-name" maxlength="24" value="${esc(c.name)}" autocomplete="off"></label>
      <div class="field"><span>Como os moradores se referem a você</span><div class="pills">
        ${[
          ['f', 'Ela · a Superintendente'],
          ['m', 'Ele · o Superintendente'],
          ['n', 'Elu · ê Superintendente'],
        ]
          .map(([v, l]) => btn('create-set', { field: 'g', value: v }, l, { cls: `pill ${c.g === v ? 'is-selected' : ''}` }))
          .join('')}
      </div></div>
      <div class="field"><span>Tom de pele</span><div class="swatches">${swatch('skin', SKIN_TONES, c.appearance.skin)}</div></div>
      <div class="field"><span>Cabelo</span><div class="pills">${pills('hair', HAIR_STYLES, HAIR_LABELS, c.appearance.hair)}</div></div>
      <div class="field"><span>Cor do cabelo</span><div class="swatches">${swatch('hairColor', HAIR_COLORS, c.appearance.hairColor)}</div></div>
      <div class="field"><span>Barba</span><div class="pills">${pills('beard', BEARDS, BEARD_LABELS, c.appearance.beard)}</div></div>
      <div class="field"><span>Detalhe</span><div class="pills">${pills('extra', EXTRAS, EXTRA_LABELS, c.appearance.extra)}</div></div>
      <div class="creation-actions">${btn('back-title', {}, 'Voltar', { cls: 'ghost' })}${btn('start-game', {}, 'Descer à colônia', { cls: 'primary big' })}</div>
    </div>
  </section>`;
}

export const INTRO_CARDS = [
  'Há sessenta anos, o ar da superfície passou dos sessenta graus. As cidades costeiras viraram fornos; as do interior, poeira.',
  'Duzentas e catorze pessoas desceram ao fundo do mar para esperar. "Uma geração, no máximo", disseram os Fundadores.',
  'A geração passou. A colônia Nadir continua a cento e sessenta metros de profundidade, presa a uma encosta escura, respirando o ar que suas máquinas conseguem tirar da água.',
  'Severino Bastos, Superintendente por vinte anos, morreu há duas semanas. O Conselho escolheu você.',
];

export function renderIntro(index) {
  return `<section class="intro" aria-live="polite">
    <p class="intro-card">${esc(INTRO_CARDS[index])}</p>
    <div class="intro-actions">${btn('intro-next', {}, index < INTRO_CARDS.length - 1 ? 'Continuar' : 'Acordar', { cls: 'primary' })}${btn('intro-skip', {}, 'Pular', { cls: 'ghost small' })}</div>
  </section>`;
}

export function renderDialogue(state, conv, portrait) {
  const r = residentById(state, conv.residentId);
  const lines = conv.lines.slice(-6);
  const opts = conv.options
    .map((o, i) => btn('talk', { option: o.id }, `<span class="opt-key">${i + 1}</span><span>${esc(o.label)}</span>`, { cls: `option ${o.quest ? 'quest' : ''}` }))
    .join('');
  const img = portrait ? portrait(r) : '';
  return `<section class="dialogue" role="dialog" aria-modal="true" aria-label="Conversa com ${esc(fullName(r))}">
    <header class="dialogue-head">
      ${img ? `<img class="portrait" src="${img}" alt="" width="84" height="84">` : ''}
      <div><h2>${esc(fullName(r))}</h2><p class="muted">${esc(occupationLabel(state, r))}</p>
      <p class="bar-line small"><span>Opinião sobre você</span>${meter(r.opinion)}</p></div>
      ${btn('end-talk', {}, '×', { cls: 'close', label: 'Encerrar conversa' })}
    </header>
    <div class="dialogue-lines" id="dialogue-lines">${lines
      .map((l) => `<p class="line ${l.who}">${l.who === 'player' ? `<b>Você:</b> ${esc(l.text)}` : esc(l.text)}</p>`)
      .join('')}</div>
    <div class="dialogue-options">${conv.ended ? btn('end-talk', {}, 'Sair da conversa', { cls: 'option' }) : opts}</div>
  </section>`;
}

const EFFECT_LABELS = { oxygen: 'O₂', water: 'Água', food: 'Comida', materials: 'MAT', energy: 'kW', hull: 'Casco', morale: 'Moral', trust: 'Confiança' };
const MODIFIER_TARGETS = { oxygen: 'Produção de O₂', water: 'Produção de água', food: 'Produção de comida', materials: 'Produção de materiais', energy: 'Geração de energia', all: 'Toda a produção', leak: 'Boatos' };

export function effectChips(state, effects, data = {}) {
  const chips = [];
  for (const [key, label] of Object.entries(EFFECT_LABELS)) {
    const v = effects[key];
    if (v) chips.push(`<span class="fx ${v > 0 ? 'good' : 'bad'}">${signed(v)} ${label}</span>`);
  }
  const speaker = data.speaker ? residentById(state, data.speaker) : null;
  const subject = data.subject ? residentById(state, data.subject) : null;
  if (effects.speakerOpinion && speaker) chips.push(`<span class="fx ${effects.speakerOpinion > 0 ? 'good' : 'bad'}">${esc(displayName(speaker))} ${signed(effects.speakerOpinion)}</span>`);
  if (effects.subjectOpinion && subject) chips.push(`<span class="fx ${effects.subjectOpinion > 0 ? 'good' : 'bad'}">${esc(displayName(subject))} ${signed(effects.subjectOpinion)}</span>`);
  if (effects.people < 0) chips.push(`<span class="fx bad">${effects.victim && speaker ? `${esc(displayName(speaker))} parte` : `${effects.people} pessoas`}</span>`);
  if (effects.twins) chips.push('<span class="fx good">+2 bebês</span>');
  if (effects.marry) chips.push('<span class="fx good">Casamento</span>');
  if (effects.sick) chips.push(`<span class="fx bad">${effects.sick} doentes</span>`);
  if (effects.secrets > 0 || effects.secret) chips.push('<span class="fx bad">+1 segredo</span>');
  if (effects.revealOne) chips.push('<span class="fx good">−1 segredo</span>');
  if (effects.item) chips.push('<span class="fx good">Item para você</span>');
  if (effects.bond) chips.push(`<span class="fx ${effects.bond > 0 ? 'good' : 'bad'}">Laço entre os dois ${signed(effects.bond)}</span>`);
  if (effects.rep) {
    if (effects.rep.truth) chips.push(`<span class="fx rep">${effects.rep.truth > 0 ? 'Verdade' : 'Sigilo'}</span>`);
    if (effects.rep.mercy) chips.push(`<span class="fx rep">${effects.rep.mercy > 0 ? 'Compaixão' : 'Rigor'}</span>`);
  }
  if (effects.modifier) {
    const m = effects.modifier;
    const change = Math.round((m.mult - 1) * 100);
    const good = m.target === 'leak' ? change < 0 : change > 0;
    chips.push(`<span class="fx ${good ? 'good' : 'bad'}">${MODIFIER_TARGETS[m.target]} ${change > 0 ? '+' : '−'}${Math.abs(change)}% por ${m.cycles} dias</span>`);
  }
  if (effects.flag === 'signalTraced') chips.push('<span class="fx good">Localiza o sinal</span>');
  if (!chips.length && !effects.ending) chips.push('<span class="fx">Sem efeito imediato</span>');
  return chips.join('');
}

export function renderEvent(state, entry, portrait) {
  const def = eventDef(entry);
  const data = entry.data || {};
  const speaker = eventSpeaker(state, entry);
  const choices = def.choices
    .map((c, i) => {
      const ok = canAfford(state, c.effects);
      return btn('choice', { index: i }, `<span class="choice-label">${esc(c.label)}</span><span class="choice-fx">${effectChips(state, c.effects, data)}</span>${ok ? '' : '<span class="reason">Recursos insuficientes</span>'}`, { cls: 'choice', disabled: !ok });
    })
    .join('');
  const kind = def.document ? 'is-document' : def.alarm ? 'is-alarm' : '';
  const eyebrow = def.document ? `Arquivo da fundação · Dia ${state.cycle}` : def.alarm ? `Alarme · Dia ${state.cycle}` : speaker ? `${esc(fullName(speaker))} · ${esc(occupationLabel(state, speaker))}` : `Ocorrência · Dia ${state.cycle}`;
  const img = speaker && portrait ? portrait(speaker) : '';
  return `<section class="modal event ${kind}" role="dialog" aria-modal="true" aria-labelledby="event-title">
    ${img ? `<img class="portrait float" src="${img}" alt="" width="72" height="72">` : ''}
    <p class="eyebrow">${eyebrow}</p>
    <h2 id="event-title">${esc(eventTitle(state, entry))}</h2>
    <p class="event-text">${esc(eventText(state, entry))}</p>
    <div class="choices">${choices}</div>
  </section>`;
}

export function renderReport(state, report) {
  const entries = (report && report.entries) || [];
  const before = report && report.before;
  const after = report && report.after;
  const diff = (key, label) => (before && after ? `<li><span>${label}</span><span class="num">${fmt(after[key])} <span class="${after[key] - before[key] >= 0 ? 'up' : 'down'}">(${signed(after[key] - before[key])})</span></span></li>` : '');
  const tone = (e) => `tone-${e.tone}`;
  return `<section class="modal report" role="dialog" aria-modal="true" aria-labelledby="report-title">
    <p class="eyebrow">Relatório da manhã · 06:00</p>
    <h2 id="report-title">Dia ${state.cycle}</h2>
    <div class="cols">
      <div><h3>Durante a noite</h3>${entries.length ? `<ul class="log-list">${entries.map((e) => `<li class="${tone(e)}">${esc(e.text)}</li>`).join('')}</ul>` : '<p class="hint">Uma noite tranquila. O casco rangeu como sempre.</p>'}</div>
      <div><h3>Estoques</h3><ul class="factors">
        ${diff('oxygen', RESOURCES.oxygen.label)}${diff('water', RESOURCES.water.label)}${diff('food', RESOURCES.food.label)}${diff('materials', RESOURCES.materials.label)}${diff('hull', 'Casco')}${diff('morale', 'Moral')}${diff('trust', 'Confiança')}${diff('population', 'Pessoas')}
      </ul></div>
    </div>
    <div class="modal-actions">${btn('start-day', {}, 'Começar o dia', { cls: 'primary' })}</div>
  </section>`;
}

export function renderPause(settings) {
  return `<section class="modal pause" role="dialog" aria-modal="true" aria-labelledby="pause-title">
    <p class="eyebrow">Pausa</p>
    <h2 id="pause-title">Colônia Nadir</h2>
    <div class="menu-list">
      ${btn('resume', {}, 'Continuar', { cls: 'primary' })}
      ${btn('show-help', {}, 'Como jogar', { cls: 'ghost' })}
      ${btn('toggle-sound', {}, settings.sound ? 'Som: ligado' : 'Som: desligado', { cls: 'ghost' })}
      ${btn('toggle-quality', {}, settings.quality === 'high' ? 'Gráficos: alto' : 'Gráficos: leve', { cls: 'ghost' })}
      ${btn('save-now', {}, 'Salvar agora', { cls: 'ghost' })}
      ${btn('to-title', {}, 'Voltar ao título', { cls: 'ghost' })}
    </div>
    <p class="hint">A partida é salva automaticamente toda manhã e ao voltar ao título.</p>
  </section>`;
}

export function renderHelp() {
  return `<section class="modal help" role="dialog" aria-modal="true" aria-labelledby="help-title">
    <p class="eyebrow">Manual do Conselho</p>
    <h2 id="help-title">Como jogar</h2>
    <div class="cols"><div>
      <h3>Controles</h3>
      <ul><li><b>WASD</b> ou setas: andar · <b>Shift</b>: correr</li><li><b>Arrastar o mouse</b>: girar a câmera · <b>roda</b>: aproximar</li><li><b>E</b>: falar, usar, apanhar · <b>1–9</b>: escolher fala</li><li><b>J</b>: diário · <b>T</b> (segurar): esperar o tempo passar · <b>Esc</b>: pausa</li><li><b>Espaço</b>: nadar para cima lá fora</li><li>No celular: joystick à esquerda, arraste à direita para olhar, botões na tela.</li></ul>
      <h3>O dia</h3>
      <p>Cada dia vai das 6h até você dormir no seu beliche, no Núcleo (a partir das 20h). Ao dormir, a colônia produz, consome e conversa; de manhã chega o relatório.</p>
    </div><div>
      <h3>As pessoas</h3>
      <p>Os ${34} moradores têm nome, família, rotina, humor e opinião sobre você. Converse, ajude, dê presentes, peça mudanças de função. Eles lembram do que você faz e contam uns aos outros.</p>
      <h3>A colônia</h3>
      <p>Use o Terminal do Conselho, no Núcleo, para construir, escalar gente nos módulos e mudar o Estatuto. Ar, água e comida: 1 de cada por pessoa por dia.</p>
      <h3>A verdade</h3>
      <p>Encontre os ${FRAGMENTS_TO_WIN} documentos da fundação, aqui dentro e lá fora, no leito marinho. Revelar custa moral agora; esconder cria segredos que podem vazar.</p>
    </div></div>
    <div class="modal-actions">${btn('close-help', {}, 'Entendi', { cls: 'primary' })}</div>
  </section>`;
}

export function renderEnding(state, portrait) {
  const out = outcomeText(state);
  const won = state.status === 'won';
  const lines = won ? epilogue(state) : [];
  return `<section class="ending ${won ? 'won' : 'lost'}" role="dialog" aria-modal="true" aria-labelledby="ending-title">
    <div class="ending-inner">
      <p class="eyebrow">${won ? 'Desfecho' : 'Fim da colônia'} · Dia ${state.cycle}</p>
      <h1 id="ending-title">${esc(out.title)}</h1>
      <p class="ending-text">${esc(out.text)}</p>
      ${lines.length ? `<h2>O que foi feito de cada um</h2><ul class="epilogue">${lines
        .map((l) => {
          const r = state.residents.find((x) => x.key === l.key);
          const img = r && portrait ? portrait(r) : '';
          return `<li>${img ? `<img src="${img}" alt="" width="56" height="56">` : ''}<div><b>${esc(l.name)}</b><p>${esc(l.text)}</p></div></li>`;
        })
        .join('')}</ul>` : ''}
      <dl class="stats">
        <dt>Dias</dt><dd>${state.cycle}</dd>
        <dt>Moradores vivos</dt><dd>${state.residents.filter((r) => r.alive).length}</dd>
        <dt>Mortes</dt><dd>${state.stats.deaths}</dd>
        <dt>Nascimentos</dt><dd>${state.stats.births}</dd>
        <dt>Documentos</dt><dd>${state.found.length}/${FRAGMENTS_TO_WIN}</dd>
        <dt>Conversas</dt><dd>${state.stats.conversations}</dd>
      </dl>
      <div class="modal-actions">${btn('to-title', {}, 'Voltar ao título', { cls: 'primary' })}</div>
    </div>
  </section>`;
}

export function renderToast(lines) {
  return lines.map((l) => `<p>${esc(l)}</p>`).join('');
}

export function meterHtml(v) {
  return meter(v);
}
