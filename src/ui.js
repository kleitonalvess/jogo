// Renderização da interface. Funções que recebem o estado e devolvem HTML.
// Todo elemento clicável usa data-action; o controlador (main.js) despacha.

import {
  BUILD_ORDER,
  DECREE_CHANGE_TRUST,
  DECREES,
  EXPEDITION_MAX_TEAM,
  EXPEDITIONS,
  FRAGMENTS,
  FRAGMENTS_TO_WIN,
  LEVELS,
  MODULES,
  REPAIR_PER_MATERIAL,
  RESOURCES,
  SLOTS_PER_LEVEL,
} from './engine/data.js';
import {
  batteryCapacity,
  canAfford,
  canBuild,
  canLaunchExpedition,
  currentEvent,
  demolishRefund,
  depthOf,
  eventDef,
  eventText,
  eventTitle,
  expeditionSupplies,
  fragmentChance,
  getModule,
  hullFatigue,
  idleWorkers,
  leakChance,
  moduleAt,
  moduleOutput,
  moduleWear,
  outcomeText,
  pressureOf,
  surfaceReading,
  totalPopulation,
} from './engine/game.js';

const nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

export function fmt(n) {
  return nf.format(Math.abs(n) >= 10 ? Math.round(n) : Math.round(n * 10) / 10);
}

export function signed(n) {
  if (Math.abs(n) < 0.05) return '±0';
  return (n > 0 ? '+' : '−') + fmt(Math.abs(n));
}

function pct(n) {
  return `${Math.round(n * 100)}%`;
}

export function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Botão com data-action e uma chave estável para restaurar o foco após render.
function btn(action, params, content, { cls = '', disabled = false, label = '', extra = '' } = {}) {
  const data = Object.entries(params)
    .map(([k, v]) => ` data-${k}="${esc(v)}"`)
    .join('');
  const key = [action, ...Object.values(params)].join(':');
  return `<button type="button" class="${cls}" data-action="${action}"${data} data-key="${esc(key)}"${
    disabled ? ' disabled' : ''
  }${label ? ` aria-label="${esc(label)}"` : ''}${extra}>${content}</button>`;
}

function levelLabel(level) {
  return `Nível ${level + 1} · −${depthOf(level)} m · ${pressureOf(level)} atm`;
}

function netOf(eco, key) {
  return eco.production[key] - eco.consumption[key];
}

function runway(state, eco, key) {
  const net = netOf(eco, key);
  if (net >= 0) return Infinity;
  return Math.floor(state.resources[key] / -net);
}

// ---------------------------------------------------------------------------
// Barra superior e instrumentos

export function renderMeta(state) {
  return `<span>Ciclo <b>${state.cycle}</b></span><span>Arquivo <b>${state.fragments}/${FRAGMENTS_TO_WIN}</b></span>`;
}

function tile({ code, label, value, unit = '', delta, status = '', bar = null, sub = '' }) {
  const deltaCls = delta === undefined ? '' : delta > 0.05 ? 'up' : delta < -0.05 ? 'down' : 'flat';
  return `<div class="gauge ${status}">
    <div class="gauge-head"><span class="gauge-code">${esc(code)}</span><span class="gauge-label">${esc(label)}</span></div>
    <div class="gauge-value"><span class="num">${value}</span>${unit ? `<span class="unit">${unit}</span>` : ''}${
      delta === undefined ? '' : `<span class="delta ${deltaCls}">${signed(delta)}</span>`
    }</div>
    ${bar === null ? '' : `<div class="gauge-bar" aria-hidden="true"><span style="width:${Math.max(0, Math.min(100, bar))}%"></span></div>`}
    ${sub ? `<div class="gauge-sub">${sub}</div>` : ''}
  </div>`;
}

export function renderHud(state, eco) {
  const tiles = [];
  for (const key of ['oxygen', 'water', 'food']) {
    const net = netOf(eco, key);
    const left = runway(state, eco, key);
    const status = eco.shortages[key] ? 'crit' : left <= 4 ? 'warn' : '';
    tiles.push(
      tile({
        code: RESOURCES[key].code,
        label: RESOURCES[key].label,
        value: fmt(state.resources[key]),
        delta: net,
        status,
        sub: left === Infinity ? 'estável' : left === 0 ? 'acaba neste ciclo' : `dura ${left} ${left === 1 ? 'ciclo' : 'ciclos'}`,
      }),
    );
  }
  tiles.push(
    tile({
      code: RESOURCES.materials.code,
      label: RESOURCES.materials.label,
      value: fmt(state.resources.materials),
      delta: netOf(eco, 'materials'),
      sub: eco.consumption.materials > 0 ? `${fmt(eco.consumption.materials)} em reparos` : 'sem reparos',
    }),
  );
  const cap = batteryCapacity(state);
  tiles.push(
    tile({
      code: RESOURCES.energy.code,
      label: 'Bateria',
      value: fmt(state.resources.energy),
      unit: `/${cap}`,
      delta: eco.energy.batteryAfter - state.resources.energy,
      status: eco.energy.blackout ? 'crit' : eco.energy.net < 0 ? 'warn' : '',
      bar: (state.resources.energy / cap) * 100,
      sub: `${fmt(eco.energy.produced)} gerados · ${fmt(eco.energy.demand)} usados`,
    }),
  );
  const meter = (code, label, value, delta, sub) =>
    tile({
      code,
      label,
      value: fmt(value),
      delta,
      status: value < 25 ? 'crit' : value < 45 ? 'warn' : '',
      bar: value,
      sub,
    });
  tiles.push(meter('CAS', 'Casco', state.hull, eco.hull.net, `desgaste ${fmt(eco.hull.wear)}/ciclo`));
  tiles.push(meter('MOR', 'Moral', state.morale, eco.moraleDelta, `produtividade ×${nf.format(eco.productivity)}`));
  tiles.push(meter('CNF', 'Confiança', state.trust, eco.trustDelta, state.secrets ? `${state.secrets} ${state.secrets === 1 ? 'segredo lacrado' : 'segredos lacrados'}` : 'sem segredos'));
  tiles.push(
    tile({
      code: 'POP',
      label: 'População',
      value: totalPopulation(state),
      status: eco.overcrowd > 0 ? 'warn' : '',
      sub: `${eco.housing} leitos${eco.overcrowd > 0 ? ` · ${eco.overcrowd} sem leito` : ''}`,
    }),
  );
  return tiles.join('');
}

// ---------------------------------------------------------------------------
// Corte da colônia

export function renderCrewbar(state, eco) {
  const idle = idleWorkers(state);
  const exp = state.expedition;
  return `
    <div class="crew-item ${idle > 0 ? 'has-idle' : ''}"><span class="crew-label">Ociosos</span><span class="num">${idle}</span></div>
    <div class="crew-item">
      <span class="crew-label">Manutenção do casco</span>
      <span class="stepper">
        ${btn('maintenance', { delta: -1 }, '−', { cls: 'step', disabled: state.maintenance === 0, label: 'Tirar uma pessoa da manutenção' })}
        <span class="num">${state.maintenance}</span>
        ${btn('maintenance', { delta: 1 }, '+', { cls: 'step', disabled: idle === 0, label: 'Pôr uma pessoa na manutenção' })}
      </span>
      <span class="crew-note">repara ${fmt(eco.hull.repair)}/ciclo</span>
    </div>
    <div class="crew-item">
      <span class="crew-label">Expedição</span>
      <span class="crew-note">${
        exp ? `${exp.members} em ${esc(EXPEDITIONS[exp.destination].name)} · volta em ${exp.cyclesLeft} ${exp.cyclesLeft === 1 ? 'ciclo' : 'ciclos'}` : 'nenhuma equipe fora'
      }</span>
    </div>`;
}

export function renderSurface(state) {
  const reading = surfaceReading(state);
  return `<div class="surface">
    <span class="surface-label">Superfície</span>
    <span class="surface-reading">${reading === null ? 'temperatura do ar: sem dados' : `última leitura conhecida: ${reading} °C`}</span>
  </div>
  <div class="column-gap"><span>0 a ${depthOf(0)} m · coluna d'água</span></div>`;
}

function roomOutput(state, mod, eco) {
  const def = MODULES[mod.type];
  const out = moduleOutput(state, mod, eco);
  if (out) return `${signed(out.amount)} ${out.resource === 'energy' ? 'kW' : RESOURCES[out.resource].code}`;
  if (def.housing) return `${def.housing} leitos${def.energyOut ? ` · +${def.energyOut} kW` : ''}`;
  if (def.storage) return `+${def.storage} kW de carga`;
  if (def.morale) return `+${nf.format(def.morale)} moral`;
  if (mod.type === 'dock') return state.expedition ? 'equipe lá fora' : 'pronta';
  return '';
}

function renderRoom(state, level, slot, ui, eco) {
  const mod = moduleAt(state, level, slot);
  if (!mod) {
    const reachable = level === 0 || state.modules.some((m) => m.level === level - 1);
    const selected = ui.selected && ui.selected.kind === 'slot' && ui.selected.level === level && ui.selected.slot === slot;
    if (!reachable) return `<div class="room room-rock" aria-hidden="true"><span>rocha</span></div>`;
    return `<div class="room room-empty ${selected ? 'is-selected' : ''}">
      ${btn('select-slot', { level, slot }, '<span class="plus">+</span><span>Construir</span>', {
        cls: 'room-main',
        label: `Construir no nível ${level + 1}, posição ${slot + 1}`,
      })}
    </div>`;
  }
  const def = MODULES[mod.type];
  const selected = ui.selected && ui.selected.kind === 'module' && ui.selected.id === mod.id;
  const building = mod.buildLeft > 0;
  const slots = def.slots || 0;
  const crew =
    slots > 0 && !building
      ? `<div class="crew">
          ${btn('worker', { id: mod.id, delta: -1 }, '−', { cls: 'step', disabled: mod.workers === 0, label: `Tirar uma pessoa de ${def.name}` })}
          <span class="num">${mod.workers}/${slots}</span>
          ${btn('worker', { id: mod.id, delta: 1 }, '+', {
            cls: 'step',
            disabled: mod.workers >= slots || idleWorkers(state) === 0,
            label: `Pôr uma pessoa em ${def.name}`,
          })}
        </div>`
      : '';
  const idle = slots > 0 && !building && mod.workers === 0;
  return `<div class="room cat-${def.category} ${building ? 'is-building' : ''} ${idle ? 'is-idle' : ''} ${selected ? 'is-selected' : ''}">
    ${btn(
      'select-module',
      { id: mod.id },
      `<span class="room-code">${esc(def.code)}</span>
       <span class="room-name">${esc(def.name)}</span>
       <span class="room-out">${building ? `obra · ${mod.buildLeft} ${mod.buildLeft === 1 ? 'ciclo' : 'ciclos'}` : esc(roomOutput(state, mod, eco))}</span>`,
      { cls: 'room-main' },
    )}
    ${crew}
  </div>`;
}

export function renderLevels(state, ui, eco) {
  const rows = [];
  for (let level = 0; level < LEVELS; level++) {
    const rooms = [];
    for (let slot = 0; slot < SLOTS_PER_LEVEL; slot++) rooms.push(renderRoom(state, level, slot, ui, eco));
    rows.push(`<li class="level" style="--t:${level / (LEVELS - 1)}">
      <div class="level-tag"><b>N${level + 1}</b><span>−${depthOf(level)} m</span><span>${pressureOf(level)} atm</span></div>
      <div class="rooms">${rooms.join('')}</div>
    </li>`);
  }
  return `${renderSurface(state)}<ol class="levels">${rows.join('')}</ol>
    <div class="seabed"><span>Leito marinho · fontes hidrotermais</span></div>`;
}

// ---------------------------------------------------------------------------
// Painel lateral

const TABS = [
  ['colony', 'Colônia'],
  ['statute', 'Estatuto'],
  ['expedition', 'Expedição'],
  ['log', 'Diário'],
];

export function renderPanel(state, ui, eco) {
  const tabs = TABS.map(([key, label]) =>
    btn('tab', { tab: key }, label, {
      cls: `tab ${ui.tab === key ? 'is-active' : ''}`,
      extra: ` role="tab" aria-selected="${ui.tab === key}"`,
    }),
  ).join('');
  let body = '';
  if (ui.tab === 'colony') body = renderColonyTab(state, ui, eco);
  if (ui.tab === 'statute') body = renderStatute(state);
  if (ui.tab === 'expedition') body = renderExpedition(state, ui);
  if (ui.tab === 'log') body = renderLog(state);
  return `<div class="tabs" role="tablist">${tabs}</div><div class="panel-body" role="tabpanel">${body}</div>`;
}

function renderColonyTab(state, ui, eco) {
  if (ui.selected && ui.selected.kind === 'module') {
    const mod = getModule(state, ui.selected.id);
    if (mod) return renderModuleDetail(state, mod, ui, eco);
  }
  if (ui.selected && ui.selected.kind === 'slot' && !moduleAt(state, ui.selected.level, ui.selected.slot)) {
    return renderBuildMenu(state, ui.selected.level, ui.selected.slot);
  }
  return renderOverview(state, eco);
}

function moduleSpec(def) {
  const parts = [];
  if (def.slots) parts.push(`${def.slots} vagas`);
  if (def.produces === 'energy') parts.push(`+${def.rate} kW por pessoa`);
  else if (def.produces) parts.push(`+${def.rate} ${RESOURCES[def.produces].code} por pessoa`);
  if (def.energyPerWorker) parts.push(`usa ${def.energyPerWorker} kW por pessoa`);
  if (def.energyUse) parts.push(`usa ${def.energyUse} kW`);
  if (def.housing) parts.push(`${def.housing} leitos`);
  if (def.storage) parts.push(`+${def.storage} kW de bateria`);
  if (def.morale) parts.push(`+${nf.format(def.morale)} moral por ciclo`);
  if (def.buildCycles) parts.push(`${def.buildCycles} ${def.buildCycles === 1 ? 'ciclo' : 'ciclos'} de obra`);
  return parts.join(' · ');
}

function renderModuleDetail(state, mod, ui, eco) {
  const def = MODULES[mod.type];
  const out = moduleOutput(state, mod, eco);
  const rows = [];
  if (mod.buildLeft > 0) rows.push(['Obra', `faltam ${mod.buildLeft} ${mod.buildLeft === 1 ? 'ciclo' : 'ciclos'}`]);
  if (out) rows.push(['Produção', `${signed(out.amount)} ${out.resource === 'energy' ? 'kW' : RESOURCES[out.resource].label} por ciclo`]);
  if (def.energyPerWorker && mod.buildLeft === 0) rows.push(['Energia', `usa ${fmt(mod.workers * def.energyPerWorker)} kW`]);
  if (def.energyUse) rows.push(['Energia', `usa ${def.energyUse} kW`]);
  if (def.energyOut) rows.push(['Energia', `gera ${def.energyOut} kW`]);
  if (def.housing) rows.push(['Leitos', def.housing]);
  if (def.storage) rows.push(['Bateria', `+${def.storage} kW`]);
  if (def.morale) rows.push(['Moral', `+${nf.format(def.morale)} por ciclo`]);
  rows.push(['Desgaste do casco', `${nf.format(Math.round(moduleWear(mod.level) * hullFatigue(state) * 100) / 100)} por ciclo`]);

  const slots = def.slots || 0;
  const crew =
    slots > 0 && mod.buildLeft === 0
      ? `<div class="detail-crew">
          <span class="crew-label">Equipe</span>
          <span class="stepper big">
            ${btn('worker', { id: mod.id, delta: -1 }, '−', { cls: 'step', disabled: mod.workers === 0, label: 'Tirar uma pessoa' })}
            <span class="num">${mod.workers}/${slots}</span>
            ${btn('worker', { id: mod.id, delta: 1 }, '+', {
              cls: 'step',
              disabled: mod.workers >= slots || idleWorkers(state) === 0,
              label: 'Pôr uma pessoa',
            })}
          </span>
          <span class="crew-note">${idleWorkers(state)} ociosos</span>
        </div>`
      : '';

  let demolish = '';
  if (def.buildable !== false) {
    const confirming = ui.confirmDemolish === mod.id;
    demolish = `<div class="detail-actions">
      ${btn('demolish', { id: mod.id }, confirming ? `Confirmar: desmontar e recuperar ${demolishRefund(mod)} MAT` : `Desmontar (+${demolishRefund(mod)} MAT)`, {
        cls: `ghost ${confirming ? 'danger' : ''}`,
      })}
      ${confirming ? btn('cancel-demolish', {}, 'Cancelar', { cls: 'ghost' }) : ''}
    </div>`;
  }

  return `<article class="detail cat-${def.category}">
    <header class="detail-head">
      <span class="room-code">${esc(def.code)}</span>
      <div><h2>${esc(def.name)}</h2><p class="detail-where">${levelLabel(mod.level)}</p></div>
      ${btn('clear-selection', {}, '×', { cls: 'close', label: 'Fechar' })}
    </header>
    <p class="detail-desc">${esc(def.desc)}</p>
    ${crew}
    <dl class="stats">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    ${demolish}
  </article>`;
}

function renderBuildMenu(state, level, slot) {
  const items = BUILD_ORDER.map((type) => {
    const def = MODULES[type];
    const check = canBuild(state, type, level, slot);
    return `<li class="build-item cat-${def.category} ${check.ok ? '' : 'is-blocked'}">
      <span class="room-code">${esc(def.code)}</span>
      <div class="build-text">
        <div class="build-title"><b>${esc(def.name)}</b><span class="cost">${def.cost} MAT</span></div>
        <p>${esc(def.desc)}</p>
        <p class="spec">${esc(moduleSpec(def))}</p>
        ${check.ok ? '' : `<p class="reason">${esc(check.error)}</p>`}
      </div>
      ${btn('build', { type, level, slot }, 'Construir', { cls: 'primary small', disabled: !check.ok, label: `Construir ${def.name}` })}
    </li>`;
  }).join('');
  return `<article class="detail">
    <header class="detail-head">
      <span class="room-code">+</span>
      <div><h2>Construir</h2><p class="detail-where">${levelLabel(level)} · posição ${slot + 1}</p></div>
      ${btn('clear-selection', {}, '×', { cls: 'close', label: 'Fechar' })}
    </header>
    <p class="detail-desc">Níveis mais fundos desgastam mais o casco. Você tem ${fmt(state.resources.materials)} MAT.</p>
    <ul class="build-list">${items}</ul>
  </article>`;
}

function factorList(items) {
  if (items.length === 0) return '<li><span>Sem variação</span><span class="num">±0</span></li>';
  return items
    .map(([label, v]) => `<li><span>${esc(label)}</span><span class="num ${v > 0 ? 'up' : v < 0 ? 'down' : ''}">${signed(v)}</span></li>`)
    .join('');
}

function renderOverview(state, eco) {
  const rows = ['oxygen', 'water', 'food', 'materials']
    .map((key) => {
      const net = netOf(eco, key);
      return `<tr class="${eco.shortages[key] ? 'crit' : ''}">
        <th scope="row">${RESOURCES[key].label}</th>
        <td>+${fmt(eco.production[key])}</td>
        <td>−${fmt(eco.consumption[key])}</td>
        <td class="${net > 0.05 ? 'up' : net < -0.05 ? 'down' : ''}">${signed(net)}</td>
        <td>${fmt(Math.max(0, eco.after[key]))}</td>
      </tr>`;
    })
    .join('');
  const deaths = eco.deaths.oxygen + eco.deaths.water + eco.deaths.food;
  const fatigue = hullFatigue(state) - 1;
  return `<article class="report">
    <h2>Relatório do Conselho</h2>
    <p class="hint">Toque em um módulo para ajustar a equipe ou em um espaço vazio para construir. Quando estiver pronto, encerre o ciclo.</p>
    ${deaths > 0 ? `<p class="alert crit">Se o ciclo terminar assim, ${deaths} ${deaths === 1 ? 'pessoa vai morrer' : 'pessoas vão morrer'}.</p>` : ''}
    <h3>Previsão do próximo ciclo</h3>
    <div class="table-wrap"><table class="forecast">
      <thead><tr><th scope="col">Recurso</th><th scope="col">Produz</th><th scope="col">Gasta</th><th scope="col">Saldo</th><th scope="col">Fica</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <h3>Energia</h3>
    <ul class="factors">
      <li><span>Gerada</span><span class="num">${fmt(eco.energy.produced)} kW</span></li>
      <li><span>Consumida</span><span class="num">${fmt(eco.energy.demand)} kW</span></li>
      <li><span>Bateria após o ciclo</span><span class="num">${fmt(eco.energy.batteryAfter)}/${eco.energy.capacity}</span></li>
      <li><span>Eficiência dos módulos</span><span class="num ${eco.energy.blackout ? 'down' : ''}">${pct(eco.energy.efficiency)}</span></li>
    </ul>
    <h3>Casco</h3>
    <ul class="factors">
      <li><span>Desgaste${fatigue > 0.004 ? ` (fadiga do metal +${pct(fatigue)})` : ''}</span><span class="num down">−${fmt(eco.hull.wear)}</span></li>
      <li><span>Reparo (${fmt(eco.hull.repair / REPAIR_PER_MATERIAL)} MAT)</span><span class="num up">+${fmt(eco.hull.repair)}</span></li>
    </ul>
    <h3>Moral</h3>
    <ul class="factors">${factorList(eco.morale)}</ul>
    <h3>Confiança</h3>
    <ul class="factors">${factorList(eco.trust)}</ul>
    ${state.secrets > 0 ? `<p class="hint">Chance de vazamento neste ciclo: ${pct(leakChance(state))}.</p>` : ''}
  </article>`;
}

function renderStatute(state) {
  const items = Object.entries(DECREES)
    .map(([key, def]) => {
      const on = state.decrees[key];
      const changed = on !== state.decreesAtCycleStart[key];
      return `<li class="decree ${on ? 'is-on' : ''}">
        <div class="decree-text">
          <div class="decree-title"><b>${esc(def.name)}</b>${changed ? '<span class="tag">alterado</span>' : ''}</div>
          <p>${esc(def.desc)}</p>
          <p class="spec">${esc(def.effects)}</p>
        </div>
        ${btn('decree', { key }, `<span class="switch-track"><span class="switch-thumb"></span></span><span class="switch-text">${on ? 'Em vigor' : 'Revogado'}</span>`, {
          cls: 'switch',
          extra: ` role="switch" aria-checked="${on}" aria-label="${esc(def.name)}"`,
        })}
      </li>`;
    })
    .join('');
  return `<article class="report">
    <h2>Estatuto da Colônia</h2>
    <p class="hint">As leis que mantêm a ordem a ${depthOf(0)} metros. Cada mudança custa ${DECREE_CHANGE_TRUST} de confiança no fim do ciclo; desfazer no mesmo ciclo não custa nada.</p>
    <ul class="decrees">${items}</ul>
  </article>`;
}

function renderExpedition(state, ui) {
  const hasDock = state.modules.some((m) => m.type === 'dock' && m.buildLeft === 0);
  let body = '';
  if (!hasDock) {
    body = `<p class="alert">Sem uma ${esc(MODULES.dock.name)} pronta ninguém sai da colônia. Construa uma por ${MODULES.dock.cost} MAT em qualquer espaço livre.</p>`;
  } else if (state.expedition) {
    const exp = state.expedition;
    body = `<p class="alert">Equipe de ${exp.members} em ${esc(EXPEDITIONS[exp.destination].name)}. Volta em ${exp.cyclesLeft} ${
      exp.cyclesLeft === 1 ? 'ciclo' : 'ciclos'
    }.</p>`;
  } else {
    const dests = Object.entries(EXPEDITIONS)
      .map(([key, d]) => {
        const sel = ui.expedition.destination === key;
        return `<li>${btn(
          'exp-dest',
          { key },
          `<span class="dest-title"><b>${esc(d.name)}</b><span>${d.cycles} ciclos</span></span>
           <span class="dest-desc">${esc(d.desc)}</span>
           <span class="dest-stats">
             <span>Risco ${pct(d.risk)} por pessoa</span>
             <span>${d.loot[0]}–${d.loot[1]} MAT por pessoa</span>
             <span>Fragmento ${pct(fragmentChance(state, key))}</span>
           </span>`,
          { cls: `dest ${sel ? 'is-selected' : ''}`, extra: ` aria-pressed="${sel}"` },
        )}</li>`;
      })
      .join('');
    const team = ui.expedition.team;
    const supplies = expeditionSupplies(ui.expedition.destination, team);
    const check = canLaunchExpedition(state, ui.expedition.destination, team);
    body = `<ul class="dests">${dests}</ul>
      <div class="detail-crew">
        <span class="crew-label">Equipe</span>
        <span class="stepper big">
          ${btn('exp-team', { delta: -1 }, '−', { cls: 'step', disabled: team <= 1, label: 'Diminuir equipe' })}
          <span class="num">${team}</span>
          ${btn('exp-team', { delta: 1 }, '+', { cls: 'step', disabled: team >= EXPEDITION_MAX_TEAM, label: 'Aumentar equipe' })}
        </span>
        <span class="crew-note">leva ${supplies.oxygen} O₂ e ${supplies.food} de comida</span>
      </div>
      ${check.ok ? '' : `<p class="reason">${esc(check.error)}</p>`}
      ${btn('exp-launch', {}, 'Enviar equipe', { cls: 'primary', disabled: !check.ok })}`;
  }
  const archive =
    state.archive.length === 0
      ? '<p class="hint">Nenhum documento da fundação foi recuperado ainda.</p>'
      : `<ol class="archive">${state.archive
          .map((a) => {
            const f = FRAGMENTS[a.index];
            const tag = { revealed: 'revelado', sealed: 'lacrado', leaked: 'vazou' }[a.status];
            return `<li class="doc-card"><div class="doc-head"><b>${esc(f.title)}</b><span class="tag ${a.status}">${tag}</span></div><p class="doc-text">${esc(f.text)}</p></li>`;
          })
          .join('')}</ol>`;
  return `<article class="report">
    <h2>Expedições</h2>
    <p class="hint">As equipes trazem materiais e, com sorte, documentos da fundação. Reúna os ${FRAGMENTS_TO_WIN} fragmentos para descobrir a verdade sobre a superfície.</p>
    ${body}
    <h3>Arquivo do Conselho · ${state.fragments}/${FRAGMENTS_TO_WIN}</h3>
    ${archive}
  </article>`;
}

function renderLog(state) {
  if (state.log.length === 0) return '<p class="hint">O diário está vazio.</p>';
  const groups = [];
  for (const entry of state.log) {
    const last = groups[groups.length - 1];
    if (last && last.cycle === entry.cycle) last.items.push(entry);
    else groups.push({ cycle: entry.cycle, items: [entry] });
  }
  return `<article class="report log">
    <h2>Diário do Conselho</h2>
    ${groups
      .map(
        (g) => `<section><h3>Ciclo ${g.cycle}</h3><ul>${g.items
          .map((e) => `<li class="tone-${e.tone}">${esc(e.text)}</li>`)
          .join('')}</ul></section>`,
      )
      .join('')}
  </article>`;
}

// ---------------------------------------------------------------------------
// Barra de ação

export function renderActionbar(state, eco) {
  if (state.status !== 'playing') {
    return `<div class="warnings"><span class="chip">Partida encerrada após ${state.cycle - 1} ciclos</span></div>
      <div class="actions">${btn('show-outcome', {}, 'Ver desfecho', { cls: 'ghost' })}${btn('new-game', {}, 'Nova colônia', { cls: 'primary' })}</div>`;
  }
  const warnings = [];
  for (const key of ['oxygen', 'water', 'food']) {
    const left = runway(state, eco, key);
    if (eco.shortages[key]) warnings.push(`<span class="chip crit">Sem ${RESOURCES[key].label.toLowerCase()} neste ciclo</span>`);
    else if (left <= 4) warnings.push(`<span class="chip warn">${RESOURCES[key].label}: ${left} ${left === 1 ? 'ciclo' : 'ciclos'}</span>`);
  }
  if (eco.energy.blackout) warnings.push('<span class="chip crit">Apagão</span>');
  if (state.hull < 30) warnings.push('<span class="chip crit">Casco crítico</span>');
  if (state.trust < 25) warnings.push('<span class="chip crit">Risco de revolta</span>');
  if (eco.overcrowd > 0) warnings.push(`<span class="chip warn">${eco.overcrowd} sem leito</span>`);
  if (idleWorkers(state) > 0) warnings.push(`<span class="chip">${idleWorkers(state)} ociosos</span>`);
  const pending = currentEvent(state);
  return `<div class="warnings">${warnings.join('') || '<span class="chip ok">Tudo sob controle</span>'}</div>
    <div class="actions">${btn('end-cycle', {}, `Encerrar ciclo ${state.cycle}`, { cls: 'primary big', disabled: !!pending })}</div>`;
}

// ---------------------------------------------------------------------------
// Janelas

const EFFECT_LABELS = {
  oxygen: 'O₂',
  water: 'Água',
  food: 'Comida',
  materials: 'MAT',
  energy: 'kW',
  hull: 'Casco',
  morale: 'Moral',
  trust: 'Confiança',
  people: 'Pessoas',
};

const MODIFIER_TARGETS = {
  oxygen: 'Produção de O₂',
  water: 'Produção de água',
  food: 'Produção de comida',
  materials: 'Produção de materiais',
  energy: 'Geração de energia',
  all: 'Toda a produção',
  leak: 'Chance de vazamento',
};

function effectChips(effects) {
  const chips = [];
  for (const [key, label] of Object.entries(EFFECT_LABELS)) {
    const v = effects[key];
    if (!v) continue;
    chips.push(`<span class="fx ${v > 0 ? 'good' : 'bad'}">${signed(v)} ${label}</span>`);
  }
  if (effects.secrets > 0) chips.push(`<span class="fx bad">+${effects.secrets} segredo</span>`);
  if (effects.secrets < 0) chips.push(`<span class="fx good">−${-effects.secrets} segredo</span>`);
  if (effects.modifier) {
    const m = effects.modifier;
    const change = Math.round((m.mult - 1) * 100);
    const good = m.target === 'leak' ? change < 0 : change > 0;
    chips.push(`<span class="fx ${good ? 'good' : 'bad'}">${MODIFIER_TARGETS[m.target]} ${change > 0 ? '+' : '−'}${Math.abs(change)}% por ${m.cycles} ciclos</span>`);
  }
  if (effects.flag === 'signalBoost') chips.push('<span class="fx good">Próxima expedição: +25% de chance de fragmento</span>');
  if (chips.length === 0 && !effects.ending) chips.push('<span class="fx">Sem efeito imediato</span>');
  return chips.join('');
}

function renderEventModal(state) {
  const entry = currentEvent(state);
  const def = eventDef(entry);
  const choices = def.choices
    .map((c, i) => {
      const ok = canAfford(state, c.effects);
      return btn('choice', { index: i }, `<span class="choice-label">${esc(c.label)}</span><span class="choice-fx">${effectChips(c.effects)}</span>${ok ? '' : '<span class="reason">Recursos insuficientes</span>'}`, {
        cls: 'choice',
        disabled: !ok,
      });
    })
    .join('');
  const eyebrow = def.document ? `Arquivo da fundação · Ciclo ${state.cycle}` : `Ocorrência · Ciclo ${state.cycle}`;
  return `<div class="modal ${def.document ? 'is-document' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <p class="eyebrow">${eyebrow}</p>
    <h2 id="modal-title">${esc(eventTitle(state, entry))}</h2>
    <p class="event-text">${esc(eventText(state, entry))}</p>
    <div class="choices">${choices}</div>
  </div>`;
}

function renderOutcomeModal(state) {
  const out = outcomeText(state);
  const won = state.status === 'won';
  const stats = [
    ['Ciclos completos', state.cycle - 1],
    ['População final', totalPopulation(state)],
    ['Perdas', state.stats.deaths],
    ['Nascimentos', state.stats.births],
    ['Expedições', state.stats.expeditions],
    ['Fragmentos', `${state.fragments}/${FRAGMENTS_TO_WIN}`],
    ['Segredos lacrados', state.secrets],
    ['Vazamentos', state.stats.leaks],
  ];
  return `<div class="modal ${won ? 'is-document' : 'is-defeat'}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <p class="eyebrow">${won ? 'Desfecho' : 'Fim da colônia'}</p>
    <h2 id="modal-title">${esc(out.title)}</h2>
    <p class="event-text">${esc(out.text)}</p>
    <dl class="stats outcome-stats">${stats.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    <div class="modal-actions">${btn('close-modal', {}, 'Ver a colônia', { cls: 'ghost' })}${btn('confirm-new', {}, 'Começar nova colônia', { cls: 'primary' })}</div>
  </div>`;
}

function renderHelpModal() {
  return `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <p class="eyebrow">Manual do Conselho</p>
    <h2 id="modal-title">Como jogar</h2>
    <div class="help">
      <p>O clima tornou a superfície inabitável e a humanidade desceu para o fundo do mar. Você comanda o Conselho da Colônia Nadir, a ${depthOf(0)} metros de profundidade.</p>
      <h3>Objetivo</h3>
      <p>Recupere os ${FRAGMENTS_TO_WIN} fragmentos da fundação com expedições e decida o que fazer com a verdade sobre a superfície.</p>
      <h3>Você perde se</h3>
      <ul><li>o casco chegar a 0%;</li><li>a confiança no Conselho chegar a 0 (revolta);</li><li>não sobrar ninguém.</li></ul>
      <h3>Cada ciclo</h3>
      <ul>
        <li>Cada pessoa consome 1 de O₂, 1 de água e 1 de comida.</li>
        <li>Distribua as pessoas entre os módulos com − e +. Quem fica ocioso não produz.</li>
        <li>Construa em espaços vazios. Um nível só abre se o de cima tiver algum módulo.</li>
        <li>Energia alimenta os módulos. Sem energia nem bateria, tudo rende menos.</li>
        <li>Turbinas de corrente funcionam nos níveis 1 a 3; poços geotérmicos, nos níveis 4 a 6. Quanto mais fundo, maior o desgaste do casco.</li>
        <li>A equipe de manutenção repara o casco gastando materiais.</li>
      </ul>
      <h3>Pessoas</h3>
      <ul>
        <li>Moral alta aumenta a produtividade; moral baixa corrói a confiança.</li>
        <li>Segredos lacrados evitam choques imediatos, mas podem vazar. Cada vazamento derruba a confiança.</li>
      </ul>
      <p class="hint">A partida é salva automaticamente neste navegador.</p>
    </div>
    <div class="modal-actions">${btn('close-modal', {}, 'Entendi', { cls: 'primary' })}</div>
  </div>`;
}

function renderConfirmNew() {
  return `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <p class="eyebrow">Nova colônia</p>
    <h2 id="modal-title">Abandonar a partida atual?</h2>
    <p class="event-text">A colônia atual será apagada deste navegador e uma nova começará do ciclo 1.</p>
    <div class="modal-actions">${btn('close-modal', {}, 'Continuar jogando', { cls: 'ghost' })}${btn('confirm-new', {}, 'Começar do zero', { cls: 'primary danger' })}</div>
  </div>`;
}

export function renderModal(state, ui) {
  if (state.status === 'playing' && currentEvent(state)) return renderEventModal(state);
  if (ui.modal === 'outcome' && state.status !== 'playing') return renderOutcomeModal(state);
  if (ui.modal === 'help') return renderHelpModal();
  if (ui.modal === 'confirm-new') return renderConfirmNew();
  return '';
}
