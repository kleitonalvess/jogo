// Diário do jogador: missões, registro de moradores, arquivo da fundação,
// itens e reputação.

import { FRAGMENTS } from '../engine/data.js';
import { dossier } from '../engine/dialogue.js';
import { ITEMS } from '../engine/items.js';
import { displayName, fullName, living, residentById } from '../engine/people/population.js';
import { reputationTitle, rumorKnownShare, secretRumors } from '../engine/people/social.js';
import { QUESTS, fragmentHints, objectives } from '../engine/quests.js';
import { btn, esc, meter, pct } from './format.js';

const TABS = [
  ['quests', 'Missões'],
  ['people', 'Moradores'],
  ['archive', 'Arquivo'],
  ['items', 'Itens'],
  ['self', 'Você'],
];

const OUTCOMES = {
  irene: { subiu: 'Irene subiu pela coluna de cabos.', fugiu: 'Irene fugiu sozinha, depois da sua recusa.', aliada: 'Irene decidiu esperar e ajudar a preparar a subida de todos.', ficou: 'Irene ficou na colônia.' },
  nina: { ceu: 'Nina ganhou uma foto do céu.', consolo: 'Nina ganhou uma relíquia lá de cima.' },
  tinta: { preso: 'Davi foi detido.', acordo: 'Você fez um acordo com Davi.', aliado: 'Davi e os Subidores estão do seu lado.' },
  ruth: { devolvida: 'A placa de Ruth voltou para Ícaro.' },
  febre: { remedio: 'A Enfermaria tem remédio contra a febre.' },
  clara: { ata: 'Clara ajudou você a abrir o cofre.', tarde: 'Clara morreu antes de contar tudo.' },
  rafael: { codigo: 'Rafael entregou o código do cofre.', recusado: 'Você recusou usar Rafael contra o pai.' },
  augusto: { confronto: 'Você confrontou Augusto.', pacto: 'Você fez um pacto de silêncio com Augusto.', neutro: 'Augusto aceitou que a decisão é sua.' },
  zuleica: { banquete: 'Dona Zu fez um banquete com pimenta de verdade.' },
  teodoro: { verdade: 'Teodoro ensina a verdade às crianças.', fundadores: 'Teodoro ensina que os Fundadores sabiam o que faziam.', esperanca: 'Teodoro ensina esperança.' },
};

export function renderJournal(state, ui, portrait) {
  const tabs = TABS.map(([key, label]) => btn('journal-tab', { tab: key }, label, { cls: `tab ${ui.journalTab === key ? 'is-active' : ''}`, extra: ` role="tab" aria-selected="${ui.journalTab === key}"` })).join('');
  let body = '';
  if (ui.journalTab === 'quests') body = renderQuests(state);
  if (ui.journalTab === 'people') body = renderPeople(state, ui, portrait);
  if (ui.journalTab === 'archive') body = renderArchive(state);
  if (ui.journalTab === 'items') body = renderItems(state);
  if (ui.journalTab === 'self') body = renderSelf(state);
  return `<section class="sheet journal" role="dialog" aria-modal="true" aria-label="Diário">
    <header class="sheet-head"><div><p class="eyebrow">Diário de ${esc(state.player.name)} · Dia ${state.cycle}</p><h2>Diário</h2></div>${btn('close-panel', {}, 'Fechar', { cls: 'ghost small' })}</header>
    <nav class="tabs" role="tablist">${tabs}</nav>
    <div class="sheet-body">${body}</div>
  </section>`;
}

function renderQuests(state) {
  const active = objectives(state);
  const list = active.length
    ? active.map((o) => `<li class="${o.main ? 'main' : ''}"><span class="obj-dot"></span><div><b>${esc(o.quest === 'favor' ? 'Pedido' : o.quest === 'gathering' ? 'Hoje' : QUESTS[o.quest].title)}</b><p>${esc(o.text)}</p></div></li>`).join('')
    : '<li class="muted">Nenhum objetivo ativo. Converse com as pessoas.</li>';
  const stories = Object.entries(state.quests)
    .map(([id, q]) => {
      const def = QUESTS[id];
      const outcome = q.done ? (OUTCOMES[id] && OUTCOMES[id][q.outcome]) || 'Concluída.' : null;
      return `<li class="${q.done ? 'done' : ''}"><b>${esc(def.title)}</b><p>${esc(def.summary)}</p>${outcome ? `<p class="outcome">${esc(outcome)}</p>` : ''}</li>`;
    })
    .join('');
  return `<div class="cols"><div><h3>Agora</h3><ul class="objectives">${list}</ul></div><div><h3>Histórias</h3><ul class="stories">${stories}</ul></div></div>`;
}

function renderPeople(state, ui, portrait) {
  const people = state.residents.slice().sort((a, b) => (b.key ? 1 : 0) - (a.key ? 1 : 0) || a.first.localeCompare(b.first));
  const sel = ui.journalPerson ? residentById(state, ui.journalPerson) : null;
  const list = people
    .map((r) => {
      const k = state.player.known[r.id];
      return btn('journal-person', { id: r.id }, `<span class="who">${esc(fullName(r))}</span><span class="muted">${r.alive ? (k && k.met ? 'conhecid' + (r.g === 'f' ? 'a' : r.g === 'n' ? 'e' : 'o') : 'ainda não conversaram') : '†'}</span>`, {
        cls: `person-row ${sel && sel.id === r.id ? 'is-selected' : ''} ${r.alive ? '' : 'dead'} ${r.key && !r.supporting ? 'key' : ''}`,
      });
    })
    .join('');
  let detail = '<p class="hint">Escolha alguém na lista. O que você sabe de cada pessoa vem das conversas.</p>';
  if (sel) {
    const d = dossier(state, sel);
    const img = portrait ? portrait(sel) : '';
    detail = `<article class="dossier">
      <div class="dossier-head">${img ? `<img src="${img}" alt="" width="96" height="96">` : ''}<div><h3>${esc(d.name)}${d.nick ? ` <span class="muted">"${esc(d.nick)}"</span>` : ''}</h3><p class="muted">${d.age} anos · ${esc(d.occupation)}</p>${d.alive ? `<p class="muted">Agora: ${esc(d.now)}</p>` : ''}</div></div>
      <p><b>Traços:</b> ${esc(d.traits.join(', '))}${d.trade ? ` · <b>Aptidão:</b> ${esc(d.trade)}` : ''}</p>
      ${d.opinion !== null ? `<p class="bar-line"><span>Opinião sobre você</span>${meter(d.opinion)}</p>` : ''}
      ${d.mood !== null ? `<p class="bar-line"><span>Humor (perguntado hoje)</span>${meter(d.mood)}</p>` : ''}
      ${d.relations.length ? `<p><b>Família:</b> ${esc(d.relations.join('; '))}</p>` : ''}
      ${d.friends.length ? `<p><b>Amizades:</b> ${esc(d.friends.join(', '))}</p>` : ''}
      ${d.rivals.length ? `<p><b>Desafetos:</b> ${esc(d.rivals.join(', '))}</p>` : ''}
      ${d.about.length ? `<h4>O que você sabe</h4><ul class="facts">${d.about.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : '<p class="hint">Você ainda não sabe muito sobre esta pessoa.</p>'}
      ${d.memories.length ? `<h4>Lembra de você por</h4><ul class="facts">${d.memories.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
    </article>`;
  }
  return `<div class="cols people-cols"><div class="person-list">${list}</div><div>${detail}</div></div>`;
}

function renderArchive(state) {
  const hints = fragmentHints(state);
  const docs = state.archive
    .map((a) => {
      const f = FRAGMENTS[a.index];
      const tag = { revealed: 'revelado', sealed: 'lacrado', leaked: 'vazou' }[a.status];
      return `<li class="doc-card"><div class="doc-head"><b>${esc(f.title)}</b><span class="tag ${a.status}">${tag}</span></div><p class="doc-text">${esc(f.text)}</p><p class="doc-source">${esc(f.source)}</p></li>`;
    })
    .join('');
  const missing = hints
    .filter((h) => !h.found)
    .map((h) => `<li><b>${h.hint ? esc(h.title) : '???'}</b><p class="muted">${h.hint ? esc(h.hint) : 'Ninguém te contou onde procurar.'}</p></li>`)
    .join('');
  let meterHtml = '';
  if (state.flags.rumorMeter) {
    const secrets = secretRumors(state);
    meterHtml = `<h3>O que circula nos corredores <span class="muted">(pelas contas da Dona Zu)</span></h3>${
      secrets.length
        ? `<ul class="facts">${secrets.map((s) => `<li>${esc(s.label)}: ${pct(rumorKnownShare(state, s))} dos adultos sabem. Vaza aos 30%.</li>`).join('')}</ul>`
        : '<p class="hint">Nenhum segredo correndo por aí.</p>'
    }`;
  }
  return `<div class="cols"><div><h3>Documentos da fundação · ${state.found.length}/5</h3>${docs ? `<ol class="archive">${docs}</ol>` : '<p class="hint">Nenhum documento ainda.</p>'}</div>
    <div><h3>Ainda faltam</h3><ul class="facts">${missing || '<li>Todos encontrados.</li>'}</ul>${meterHtml}</div></div>`;
}

function renderItems(state) {
  const entries = Object.entries(state.player.inventory).filter(([, q]) => q > 0);
  if (!entries.length) return '<p class="hint">Bolsos vazios. Lá fora, no leito marinho, há relíquias e sucata.</p>';
  return `<ul class="items">${entries
    .map(([id, q]) => `<li><b>${esc(ITEMS[id].name)}${q > 1 ? ` ×${q}` : ''}</b><p>${esc(ITEMS[id].desc)}</p>${ITEMS[id].gift ? '<span class="tag ok">dá para presentear</span>' : ''}</li>`)
    .join('')}</ul>`;
}

function renderSelf(state) {
  const { truth, mercy } = state.player.reputation;
  const title = reputationTitle(state);
  const alive = living(state).length;
  const allies = living(state)
    .filter((r) => r.opinion >= 75 && r.key)
    .map(displayName);
  const foes = living(state)
    .filter((r) => r.opinion < 25 && r.key)
    .map(displayName);
  const axis = (value, left, right) => `<div class="axis"><span>${left}</span><span class="axis-track"><span class="axis-mark" style="left:${50 + value / 2}%"></span></span><span>${right}</span></div>`;
  return `<div class="cols"><div>
    <h3>${title ? `Andam te chamando de "${esc(title.title)}"` : 'Ainda não te deram apelido'}</h3>
    ${title ? `<p class="hint">${esc(title.desc)}</p>` : '<p class="hint">Suas escolhas vão definir como a colônia te vê.</p>'}
    ${axis(truth, 'Sigilo', 'Verdade')}
    ${axis(mercy, 'Rigor', 'Compaixão')}
    <p class="hint">Quem valoriza a verdade gosta de transparência; quem valoriza a ordem gosta de segredos bem guardados. Compaixão e rigor dividem a colônia do mesmo jeito.</p>
  </div><div>
    <h3>A colônia</h3>
    <p>${alive} moradores · ${state.stats.deaths} mortes · ${state.stats.births} nascimentos · ${state.stats.conversations} conversas · ${state.stats.gifts} presentes</p>
    ${allies.length ? `<p><b>Do seu lado:</b> ${esc(allies.join(', '))}</p>` : ''}
    ${foes.length ? `<p><b>Contra você:</b> ${esc(foes.join(', '))}</p>` : ''}
  </div></div>`;
}

export function journalAction(ui, action, data) {
  if (action === 'journal-tab') ui.journalTab = data.tab;
  else if (action === 'journal-person') ui.journalPerson = Number(data.id);
  else return undefined;
  return null;
}
