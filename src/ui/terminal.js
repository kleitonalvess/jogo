// Terminal do Conselho: a gestão da colônia. Relatório, planta para
// construir e escalar gente por nome, Estatuto, expedições e diário.

import { BUILD_ORDER, DECREES, DECREE_CHANGE_TRUST, EXPEDITION_MAX_TEAM, EXPEDITIONS, LEVELS, MODULES, RESOURCES, SLOTS_PER_LEVEL } from '../engine/data.js';
import {
  assignJob,
  assignWorker,
  build,
  canBuild,
  canLaunchExpedition,
  computeEconomy,
  demolish,
  demolishRefund,
  depthOf,
  expeditionCandidates,
  expeditionSupplies,
  hullFatigue,
  idleResidents,
  launchExpedition,
  levelReachable,
  moduleAt,
  moduleOutput,
  moduleWear,
  pressureOf,
  setMaintenance,
  toggleDecree,
  workersOf,
} from '../engine/game.js';
import { canWork, displayName, fullName, living, occupationLabel, residentById } from '../engine/people/population.js';
import { discontentShare } from '../engine/people/social.js';
import { TRADES } from '../engine/people/traits.js';
import { btn, esc, fmt, meter, pct, signed } from './format.js';

const TABS = [
  ['report', 'Relatório'],
  ['plan', 'Planta'],
  ['people', 'Pessoas'],
  ['statute', 'Estatuto'],
  ['expedition', 'Expedições'],
  ['log', 'Diário'],
];

export function renderTerminal(state, ui) {
  const eco = computeEconomy(state);
  const tabs = TABS.map(([key, label]) => btn('term-tab', { tab: key }, label, { cls: `tab ${ui.termTab === key ? 'is-active' : ''}`, extra: ` role="tab" aria-selected="${ui.termTab === key}"` })).join('');
  let body = '';
  if (ui.termTab === 'report') body = renderReport(state, eco);
  if (ui.termTab === 'plan') body = renderPlan(state, ui, eco);
  if (ui.termTab === 'people') body = renderPeople(state, ui);
  if (ui.termTab === 'statute') body = renderStatute(state);
  if (ui.termTab === 'expedition') body = renderExpedition(state, ui);
  if (ui.termTab === 'log') body = renderLog(state);
  return `<section class="sheet terminal" role="dialog" aria-modal="true" aria-label="Terminal do Conselho">
    <header class="sheet-head">
      <div><p class="eyebrow">Terminal do Conselho · Dia ${state.cycle}</p><h2>Colônia Nadir</h2></div>
      ${btn('close-panel', {}, 'Fechar', { cls: 'ghost small' })}
    </header>
    ${renderVitals(state, eco)}
    <nav class="tabs" role="tablist">${tabs}</nav>
    <div class="sheet-body">${body}</div>
  </section>`;
}

function netOf(eco, key) {
  return eco.production[key] - eco.consumption[key];
}

function renderVitals(state, eco) {
  const cell = (code, label, value, delta, status = '') =>
    `<div class="vital ${status}"><span class="vital-code">${code}</span><span class="vital-label">${label}</span><span class="vital-value">${value}${
      delta === null ? '' : `<span class="delta ${delta > 0.05 ? 'up' : delta < -0.05 ? 'down' : ''}">${signed(delta)}</span>`
    }</span></div>`;
  const out = [];
  for (const key of ['oxygen', 'water', 'food', 'materials']) {
    const net = netOf(eco, key);
    const status = eco.shortages[key] ? 'crit' : net < 0 && state.resources[key] / -net < 4 ? 'warn' : '';
    out.push(cell(RESOURCES[key].code, RESOURCES[key].label, fmt(state.resources[key]), net, status));
  }
  out.push(cell('kW', 'Bateria', `${fmt(state.resources.energy)}/${eco.energy.capacity}`, eco.energy.batteryAfter - state.resources.energy, eco.energy.blackout ? 'crit' : eco.energy.net < 0 ? 'warn' : ''));
  out.push(cell('CAS', 'Casco', `${fmt(state.hull)}%`, eco.hull.net, state.hull < 30 ? 'crit' : state.hull < 50 ? 'warn' : ''));
  out.push(cell('MOR', 'Moral', fmt(state.morale), null, state.morale < 25 ? 'crit' : state.morale < 45 ? 'warn' : ''));
  out.push(cell('CNF', 'Confiança', fmt(state.trust), null, discontentShare(state) > 0.35 ? 'crit' : state.trust < 40 ? 'warn' : ''));
  out.push(cell('POP', 'Pessoas', `${eco.population}`, null, eco.overcrowd > 0 ? 'warn' : ''));
  return `<div class="vitals">${out.join('')}</div>`;
}

function factorList(items) {
  if (items.length === 0) return '<li><span>Sem variação</span><span class="num">±0</span></li>';
  return items.map(([label, v]) => `<li><span>${esc(label)}</span><span class="num ${v > 0 ? 'up' : v < 0 ? 'down' : ''}">${signed(v)}</span></li>`).join('');
}

function renderReport(state, eco) {
  const rows = ['oxygen', 'water', 'food', 'materials']
    .map((key) => {
      const net = netOf(eco, key);
      return `<tr class="${eco.shortages[key] ? 'crit' : ''}"><th scope="row">${RESOURCES[key].label}</th><td>+${fmt(eco.production[key])}</td><td>−${fmt(eco.consumption[key])}</td><td class="${net > 0.05 ? 'up' : net < -0.05 ? 'down' : ''}">${signed(net)}</td><td>${fmt(Math.max(0, eco.after[key]))}</td></tr>`;
    })
    .join('');
  const deaths = eco.deaths.oxygen + eco.deaths.water + eco.deaths.food;
  const discontent = discontentShare(state);
  const fatigue = hullFatigue(state) - 1;
  return `<div class="cols">
    <div>
      ${deaths > 0 ? `<p class="alert crit">Se o dia terminar assim, ${deaths} ${deaths === 1 ? 'pessoa vai morrer' : 'pessoas vão morrer'}.</p>` : ''}
      <h3>Previsão para o fim do dia</h3>
      <div class="table-wrap"><table class="forecast"><thead><tr><th scope="col">Recurso</th><th scope="col">Produz</th><th scope="col">Gasta</th><th scope="col">Saldo</th><th scope="col">Fica</th></tr></thead><tbody>${rows}</tbody></table></div>
      <h3>Energia</h3>
      <ul class="factors">
        <li><span>Gerada</span><span class="num">${fmt(eco.energy.produced)} kW</span></li>
        <li><span>Consumida</span><span class="num">${fmt(eco.energy.demand)} kW</span></li>
        <li><span>Bateria ao fim do dia</span><span class="num">${fmt(eco.energy.batteryAfter)}/${eco.energy.capacity}</span></li>
        <li><span>Eficiência dos módulos</span><span class="num ${eco.energy.blackout ? 'down' : ''}">${pct(eco.energy.efficiency)}</span></li>
      </ul>
      <h3>Casco</h3>
      <ul class="factors">
        <li><span>Desgaste${fatigue > 0.004 ? ` (fadiga do metal +${pct(fatigue)})` : ''}</span><span class="num down">−${fmt(eco.hull.wear)}</span></li>
        <li><span>Reparo da equipe (${fmt(eco.hull.repair / 1.5)} MAT)</span><span class="num up">+${fmt(eco.hull.repair)}</span></li>
      </ul>
    </div>
    <div>
      <h3>Moral da colônia</h3>
      <ul class="factors">${factorList(eco.morale)}</ul>
      <h3>Confiança no Conselho</h3>
      <ul class="factors">${factorList(eco.trust)}</ul>
      <p class="hint">${pct(discontent)} dos adultos perderam a fé no Conselho. Acima de 55%, há revolta.</p>
      <h3>Produtividade média</h3>
      <p class="hint">×${fmt(eco.productivity)} (humor, aptidão e disposição de cada pessoa).</p>
    </div>
  </div>`;
}

function roomCell(state, level, slot, ui) {
  const mod = moduleAt(state, level, slot);
  const sel = ui.planSel && ui.planSel.level === level && ui.planSel.slot === slot;
  if (!mod) {
    if (!levelReachable(state, level)) return `<div class="cell rock" aria-hidden="true">rocha</div>`;
    return btn('plan-select', { level, slot }, '<span class="plus">+</span><span>Construir</span>', { cls: `cell empty ${sel ? 'is-selected' : ''}` });
  }
  const def = MODULES[mod.type];
  const slots = def.slots || 0;
  const status = mod.buildLeft > 0 ? `obra · ${mod.buildLeft}d` : slots ? `${workersOf(state, mod.id).length}/${slots}` : def.housing ? `${def.housing} leitos` : '';
  return btn('plan-select', { level, slot }, `<span class="cell-code cat-${def.category}">${esc(def.code)}</span><span class="cell-name">${esc(def.name)}</span><span class="cell-status">${status}</span>`, {
    cls: `cell built ${mod.buildLeft > 0 ? 'building' : ''} ${sel ? 'is-selected' : ''}`,
  });
}

function renderPlan(state, ui, eco) {
  const rows = [];
  for (let level = 0; level < LEVELS; level++) {
    const cells = [];
    for (let slot = 0; slot < SLOTS_PER_LEVEL; slot++) cells.push(roomCell(state, level, slot, ui));
    rows.push(`<li class="plan-row"><span class="plan-tag"><b>N${level + 1}</b> −${depthOf(level)} m · ${pressureOf(level)} atm</span><div class="plan-cells">${cells.join('')}</div></li>`);
  }
  let detail = '<p class="hint">Escolha um compartimento para ver quem trabalha nele, ou um espaço vazio para construir.</p>';
  if (ui.planSel) {
    const mod = moduleAt(state, ui.planSel.level, ui.planSel.slot);
    detail = mod ? renderModuleDetail(state, mod, ui, eco) : renderBuildMenu(state, ui.planSel.level, ui.planSel.slot);
  }
  return `<div class="cols plan">
    <div><ol class="plan-grid">${rows.join('')}</ol>
      <div class="crew-line"><span>Manutenção do casco</span>
        ${btn('maint', { delta: -1 }, '−', { cls: 'step', disabled: state.maintenance === 0, label: 'Tirar alguém da manutenção' })}
        <span class="num">${state.maintenance}</span>
        ${btn('maint', { delta: 1 }, '+', { cls: 'step', disabled: idleResidents(state).length === 0, label: 'Pôr alguém na manutenção' })}
        <span class="hint">repara ${fmt(eco.hull.repair)}/dia · ${idleResidents(state).length} sem função</span>
      </div>
    </div>
    <div class="plan-detail">${detail}</div>
  </div>`;
}

function personChip(state, r, extra = '') {
  return `<span class="person-chip"><b>${esc(displayName(r))}</b> <span class="muted">${esc(r.last)}</span>${extra}</span>`;
}

function renderModuleDetail(state, mod, ui, eco) {
  const def = MODULES[mod.type];
  const out = moduleOutput(state, mod, eco);
  const workers = workersOf(state, mod.id);
  const slots = def.slots || 0;
  const rows = [];
  if (mod.buildLeft > 0) rows.push(['Obra', `faltam ${mod.buildLeft} ${mod.buildLeft === 1 ? 'dia' : 'dias'}`]);
  if (out) rows.push(['Produção', `${signed(out.amount)} ${out.resource === 'energy' ? 'kW' : RESOURCES[out.resource].label} por dia`]);
  if (def.energyPerWorker) rows.push(['Energia', `usa ${fmt(workers.length * def.energyPerWorker)} kW`]);
  if (def.energyUse) rows.push(['Energia', `usa ${def.energyUse} kW`]);
  if (def.energyOut) rows.push(['Energia', `gera ${def.energyOut} kW`]);
  if (def.housing) rows.push(['Leitos', `${def.housing} (${living(state).filter((r) => r.home === mod.id && !r.away).length} ocupados)`]);
  if (def.storage) rows.push(['Bateria', `+${def.storage} kW`]);
  rows.push(['Desgaste do casco', `${fmt(moduleWear(mod.level) * hullFatigue(state))} por dia`]);
  const list = workers
    .map((r) => {
      const match = def.trade && r.trade === def.trade;
      return `<li>${personChip(state, r, match ? ' <span class="tag ok">aptidão</span>' : '')}${meter(r.mood, 'mini')}${btn('unassign', { id: r.id }, 'Tirar', { cls: 'ghost tiny' })}</li>`;
    })
    .join('');
  const idle = idleResidents(state);
  const picks = idle
    .slice()
    .sort((a, b) => (b.trade === def.trade) - (a.trade === def.trade))
    .slice(0, 8)
    .map((r) => btn('assign-person', { id: r.id, module: mod.id }, `${esc(displayName(r))}${r.trade === def.trade ? ' ★' : ''}`, { cls: 'ghost tiny', disabled: workers.length >= slots }))
    .join('');
  const confirming = ui.confirmDemolish === mod.id;
  return `<article class="detail">
    <h3 class="detail-title"><span class="cell-code cat-${def.category}">${esc(def.code)}</span> ${esc(def.name)}</h3>
    <p class="muted">Nível ${mod.level + 1} · −${depthOf(mod.level)} m</p>
    <p>${esc(def.desc)}</p>
    <dl class="stats">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    ${slots && mod.buildLeft === 0 ? `<h4>Equipe (${workers.length}/${slots})</h4><ul class="people-list">${list || '<li class="muted">Ninguém trabalhando aqui.</li>'}</ul>
      ${btn('assign-best', { module: mod.id }, '+ Escalar a melhor pessoa disponível', { cls: 'primary small', disabled: workers.length >= slots || idle.length === 0 })}
      ${idle.length ? `<p class="hint">Ou escolha: ${picks}</p>` : '<p class="hint">Ninguém sem função. Tire alguém de outro lugar primeiro.</p>'}` : ''}
    ${def.buildable === false ? '' : `<div class="row-actions">${btn('demolish', { id: mod.id }, confirming ? `Confirmar: desmontar (+${demolishRefund(mod)} MAT)` : `Desmontar (+${demolishRefund(mod)} MAT)`, { cls: `ghost small ${confirming ? 'danger' : ''}` })}</div>`}
  </article>`;
}

function moduleSpec(def) {
  const parts = [];
  if (def.slots) parts.push(`${def.slots} vagas`);
  if (def.produces === 'energy') parts.push(`+${def.rate} kW por pessoa`);
  else if (def.produces) parts.push(`+${def.rate} ${RESOURCES[def.produces].code} por pessoa`);
  if (def.energyPerWorker) parts.push(`${def.energyPerWorker} kW por pessoa`);
  if (def.energyUse) parts.push(`usa ${def.energyUse} kW`);
  if (def.housing) parts.push(`${def.housing} leitos`);
  if (def.storage) parts.push(`+${def.storage} kW de carga`);
  if (def.morale) parts.push('moral');
  if (def.buildCycles) parts.push(`${def.buildCycles} ${def.buildCycles === 1 ? 'dia' : 'dias'} de obra`);
  return parts.join(' · ');
}

function renderBuildMenu(state, level, slot) {
  const items = BUILD_ORDER.map((type) => {
    const def = MODULES[type];
    const check = canBuild(state, type, level, slot);
    return `<li class="build-item ${check.ok ? '' : 'is-blocked'}">
      <span class="cell-code cat-${def.category}">${esc(def.code)}</span>
      <div><div class="build-title"><b>${esc(def.name)}</b><span class="cost">${def.cost} MAT</span></div>
      <p class="spec">${esc(moduleSpec(def))}</p>${check.ok ? '' : `<p class="reason">${esc(check.error)}</p>`}</div>
      ${btn('build', { type, level, slot }, 'Construir', { cls: 'primary tiny', disabled: !check.ok })}
    </li>`;
  }).join('');
  return `<article class="detail"><h3>Construir no Nível ${level + 1}, posição ${slot + 1}</h3>
    <p class="hint">Quanto mais fundo, maior o desgaste do casco. Você tem ${fmt(state.resources.materials)} MAT.</p>
    <ul class="build-list">${items}</ul></article>`;
}

function jobOptions(state, r) {
  const opts = ['<option value="">Sem função</option>', `<option value="maintenance"${r.job === 'maintenance' ? ' selected' : ''}>Manutenção do casco</option>`];
  for (const m of state.modules) {
    const def = MODULES[m.type];
    if (!def.slots || m.buildLeft > 0) continue;
    const full = workersOf(state, m.id).length >= def.slots && r.job !== m.id;
    opts.push(`<option value="${m.id}"${r.job === m.id ? ' selected' : ''}${full ? ' disabled' : ''}>${esc(def.name)} (N${m.level + 1})${def.trade === r.trade ? ' ★' : ''}${full ? ' — cheio' : ''}</option>`);
  }
  return opts.join('');
}

function renderPeople(state, ui) {
  const filter = ui.peopleFilter || 'all';
  const people = living(state).filter((r) => (filter === 'idle' ? canWork(r) && !r.job : filter === 'work' ? canWork(r) : true));
  const rows = people
    .map((r) => {
      const select = canWork(r) && !r.role ? `<select data-action="set-job" data-id="${r.id}" aria-label="Função de ${esc(fullName(r))}">${jobOptions(state, r)}</select>` : `<span class="muted">${esc(occupationLabel(state, r))}</span>`;
      return `<tr><th scope="row">${esc(fullName(r))}<span class="muted"> · ${r.age} anos</span></th><td>${r.trade ? esc(TRADES[r.trade]) : '—'}</td><td>${meter(r.mood, 'mini')}</td><td>${select}</td></tr>`;
    })
    .join('');
  return `<div class="filters">${[
    ['all', 'Todos'],
    ['work', 'Podem trabalhar'],
    ['idle', 'Sem função'],
  ]
    .map(([k, l]) => btn('people-filter', { filter: k }, l, { cls: `chip-btn ${filter === k ? 'is-active' : ''}` }))
    .join('')}</div>
    <div class="table-wrap"><table class="people"><thead><tr><th scope="col">Nome</th><th scope="col">Aptidão</th><th scope="col">Humor</th><th scope="col">Função</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="hint">★ marca onde a pessoa tem aptidão (+15% de produção). Mudar alguém de função pelo Terminal é uma ordem; conversando, você pode pedir.</p>`;
}

function renderStatute(state) {
  return `<p class="hint">Cada mudança custa ${DECREE_CHANGE_TRUST} de confiança no fim do dia; desfazer no mesmo dia não custa nada.</p>
  <ul class="decrees">${Object.entries(DECREES)
    .map(([key, def]) => {
      const on = state.decrees[key];
      return `<li class="decree ${on ? 'is-on' : ''}"><div><b>${esc(def.name)}</b>${on !== state.decreesAtCycleStart[key] ? ' <span class="tag">alterado</span>' : ''}<p>${esc(def.desc)}</p><p class="spec">${esc(def.effects)}</p></div>
      ${btn('decree', { key }, `<span class="switch-track"><span class="switch-thumb"></span></span><span>${on ? 'Em vigor' : 'Revogado'}</span>`, { cls: 'switch', extra: ` role="switch" aria-checked="${on}"` })}</li>`;
    })
    .join('')}</ul>`;
}

function renderExpedition(state, ui) {
  if (state.expedition) {
    const names = state.expedition.members.map((id) => residentById(state, id)).filter(Boolean).map(displayName).join(', ');
    return `<p class="alert">${esc(names)} ${state.expedition.members.length > 1 ? 'estão' : 'está'} em ${esc(EXPEDITIONS[state.expedition.destination].name)}. Volta em ${state.expedition.cyclesLeft} ${state.expedition.cyclesLeft === 1 ? 'dia' : 'dias'}.</p>`;
  }
  const dest = ui.expDest || 'wreck';
  const team = ui.expTeam || 2;
  const check = canLaunchExpedition(state, dest, team);
  const supplies = expeditionSupplies(dest, team);
  const candidates = expeditionCandidates(state, team);
  return `<p class="hint">Mande uma equipe buscar materiais e, às vezes, relíquias. Você também pode sair pessoalmente pela eclusa.</p>
  <ul class="dests">${Object.entries(EXPEDITIONS)
    .map(([key, d]) => `<li>${btn('exp-dest', { key }, `<b>${esc(d.name)}</b> <span class="muted">${d.cycles} dias · risco ${pct(d.risk)} por pessoa · ${d.loot[0]}–${d.loot[1]} MAT por pessoa</span><span class="muted">${esc(d.desc)}</span>`, { cls: `dest ${dest === key ? 'is-selected' : ''}` })}</li>`)
    .join('')}</ul>
  <div class="crew-line"><span>Equipe</span>${btn('exp-team', { delta: -1 }, '−', { cls: 'step', disabled: team <= 1 })}<span class="num">${team}</span>${btn('exp-team', { delta: 1 }, '+', { cls: 'step', disabled: team >= EXPEDITION_MAX_TEAM })}
    <span class="hint">leva ${supplies.oxygen} O₂ e ${supplies.food} de comida</span></div>
  <p class="hint">Iriam: ${candidates.length ? candidates.map(displayName).join(', ') : 'ninguém disponível'}.</p>
  ${check.ok ? '' : `<p class="reason">${esc(check.error)}</p>`}
  ${btn('exp-launch', {}, 'Enviar equipe', { cls: 'primary', disabled: !check.ok })}`;
}

function renderLog(state) {
  const groups = [];
  for (const entry of state.log) {
    const last = groups[groups.length - 1];
    if (last && last.cycle === entry.cycle) last.items.push(entry);
    else groups.push({ cycle: entry.cycle, items: [entry] });
  }
  return `<div class="log">${groups
    .map((g) => `<section><h3>Dia ${g.cycle}</h3><ul>${g.items.map((e) => `<li class="tone-${e.tone}">${esc(e.text)}</li>`).join('')}</ul></section>`)
    .join('')}</div>`;
}

// Ações do terminal. Devolve { ok, error } ou null quando só muda a interface.
export function terminalAction(state, ui, action, data) {
  switch (action) {
    case 'term-tab':
      ui.termTab = data.tab;
      return null;
    case 'plan-select':
      ui.planSel = { level: Number(data.level), slot: Number(data.slot) };
      ui.confirmDemolish = null;
      return null;
    case 'maint':
      return setMaintenance(state, Number(data.delta));
    case 'unassign':
      return assignJob(state, Number(data.id), null);
    case 'assign-person':
      return assignJob(state, Number(data.id), Number(data.module));
    case 'assign-best':
      return assignWorker(state, Number(data.module), 1);
    case 'build': {
      const res = build(state, data.type, Number(data.level), Number(data.slot));
      return res;
    }
    case 'demolish': {
      const id = Number(data.id);
      if (ui.confirmDemolish !== id) {
        ui.confirmDemolish = id;
        return null;
      }
      ui.confirmDemolish = null;
      ui.planSel = null;
      return demolish(state, id);
    }
    case 'people-filter':
      ui.peopleFilter = data.filter;
      return null;
    case 'decree':
      return toggleDecree(state, data.key);
    case 'exp-dest':
      ui.expDest = data.key;
      return null;
    case 'exp-team':
      ui.expTeam = Math.max(1, Math.min(EXPEDITION_MAX_TEAM, (ui.expTeam || 2) + Number(data.delta)));
      return null;
    case 'exp-launch':
      return launchExpedition(state, ui.expDest || 'wreck', ui.expTeam || 2);
    default:
      return undefined;
  }
}

export function setJobFromSelect(state, id, value) {
  const job = value === '' ? null : value === 'maintenance' ? 'maintenance' : Number(value);
  return assignJob(state, Number(id), job);
}

