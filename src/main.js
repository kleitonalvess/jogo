// Controlador: guarda o estado, despacha as ações da interface, salva a
// partida e anima a neve marinha.

import { EXPEDITION_MAX_TEAM } from './engine/data.js';
import {
  assignWorker,
  build,
  computeEconomy,
  createGame,
  demolish,
  deserialize,
  endCycle,
  launchExpedition,
  resolveEvent,
  serialize,
  setMaintenance,
  toggleDecree,
} from './engine/game.js';
import {
  esc,
  renderActionbar,
  renderCrewbar,
  renderHud,
  renderLevels,
  renderMeta,
  renderModal,
  renderPanel,
} from './ui.js';

const SAVE_KEY = 'nadir.save.v1';
document.documentElement.lang = 'pt-BR';

const $ = (id) => document.getElementById(id);
const els = {
  app: $('app'),
  meta: $('meta'),
  hud: $('hud'),
  crewbar: $('crewbar'),
  levels: $('levels'),
  panel: $('panel'),
  actionbar: $('actionbar'),
  modal: $('modal-root'),
  toast: $('toast'),
};

let state = null;
const ui = {
  tab: 'colony',
  selected: null,
  confirmDemolish: null,
  modal: null,
  expedition: { destination: 'wreck', team: 2 },
};

// ---------------------------------------------------------------------------
// Persistência

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? deserialize(raw) : null;
  } catch {
    return null;
  }
}

function save() {
  try {
    localStorage.setItem(SAVE_KEY, serialize(state));
  } catch {
    // Sem armazenamento disponível: a partida segue só nesta aba.
  }
}

// ---------------------------------------------------------------------------
// Renderização

function render() {
  const focusKey = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.key : null;
  const eco = computeEconomy(state);
  els.meta.innerHTML = renderMeta(state);
  els.hud.innerHTML = renderHud(state, eco);
  els.crewbar.innerHTML = renderCrewbar(state, eco);
  els.levels.innerHTML = renderLevels(state, ui, eco);
  els.panel.innerHTML = renderPanel(state, ui, eco);
  els.actionbar.innerHTML = renderActionbar(state, eco);

  const modal = renderModal(state, ui);
  const hadModal = els.modal.childElementCount > 0;
  els.modal.innerHTML = modal ? `<div class="overlay">${modal}</div>` : '';
  els.app.classList.toggle('has-modal', !!modal);

  if (modal && !hadModal) {
    const first = els.modal.querySelector('button:not([disabled])');
    if (first) first.focus();
  } else if (focusKey) {
    const target = document.querySelector(`[data-key="${CSS.escape(focusKey)}"]`);
    if (target && !target.disabled) target.focus();
  }
}

let toastTimer = null;
function toast(lines, tone = '') {
  const list = Array.isArray(lines) ? lines : [lines];
  if (list.length === 0) return;
  els.toast.className = `toast ${tone}`;
  els.toast.innerHTML = list.map((l) => `<p>${esc(l)}</p>`).join('');
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.hidden = true;
  }, 5200);
}

function commit(result) {
  if (result && !result.ok) toast(result.error, 'warn');
  save();
  render();
  return result;
}

// No celular o painel fica abaixo do corte da colônia: leva o jogador até ele.
function revealPanel() {
  if (window.matchMedia('(max-width: 999px)').matches) {
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    els.panel.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
  }
}

// ---------------------------------------------------------------------------
// Ações

const actions = {
  'select-module': ({ id }) => {
    ui.selected = { kind: 'module', id: Number(id) };
    ui.tab = 'colony';
    ui.confirmDemolish = null;
  },
  'select-slot': ({ level, slot }) => {
    ui.selected = { kind: 'slot', level: Number(level), slot: Number(slot) };
    ui.tab = 'colony';
  },
  'clear-selection': () => {
    ui.selected = null;
    ui.confirmDemolish = null;
  },
  worker: ({ id, delta }) => assignWorker(state, Number(id), Number(delta)),
  maintenance: ({ delta }) => setMaintenance(state, Number(delta)),
  build: ({ type, level, slot }) => {
    const result = build(state, type, Number(level), Number(slot));
    if (result.ok) ui.selected = { kind: 'module', id: result.module.id };
    return result;
  },
  demolish: ({ id }) => {
    const moduleId = Number(id);
    if (ui.confirmDemolish !== moduleId) {
      ui.confirmDemolish = moduleId;
      return null;
    }
    ui.confirmDemolish = null;
    const result = demolish(state, moduleId);
    if (result.ok) ui.selected = null;
    return result;
  },
  'cancel-demolish': () => {
    ui.confirmDemolish = null;
  },
  tab: ({ tab }) => {
    ui.tab = tab;
  },
  decree: ({ key }) => toggleDecree(state, key),
  'exp-dest': ({ key }) => {
    ui.expedition.destination = key;
  },
  'exp-team': ({ delta }) => {
    ui.expedition.team = Math.max(1, Math.min(EXPEDITION_MAX_TEAM, ui.expedition.team + Number(delta)));
  },
  'exp-launch': () => launchExpedition(state, ui.expedition.destination, ui.expedition.team),
  choice: ({ index }) => {
    const result = resolveEvent(state, Number(index));
    if (result.ok && state.status !== 'playing') ui.modal = 'outcome';
    return result;
  },
  'end-cycle': () => {
    const before = state.log.length ? state.log[0] : null;
    const result = endCycle(state);
    if (!result.ok) return result;
    const fresh = [];
    for (const entry of state.log) {
      if (entry === before) break;
      fresh.push(entry);
    }
    const tone = fresh.some((e) => e.tone === 'crit') ? 'crit' : fresh.some((e) => e.tone === 'warn') ? 'warn' : '';
    toast([`Ciclo ${result.report.cycle} encerrado.`, ...fresh.reverse().slice(0, 3).map((e) => e.text)], tone);
    if (state.status !== 'playing') ui.modal = 'outcome';
    return result;
  },
  help: () => {
    ui.modal = 'help';
  },
  'new-game': () => {
    ui.modal = 'confirm-new';
  },
  'confirm-new': () => {
    state = createGame();
    ui.selected = null;
    ui.modal = null;
    ui.tab = 'colony';
  },
  'show-outcome': () => {
    ui.modal = 'outcome';
  },
  'close-modal': () => {
    ui.modal = null;
  },
};

els.app.addEventListener('click', (event) => {
  const el = event.target.closest('[data-action]');
  if (!el || el.disabled || !state) return;
  const handler = actions[el.dataset.action];
  if (!handler) return;
  commit(handler(el.dataset));
  if (el.dataset.action === 'select-module' || el.dataset.action === 'select-slot') revealPanel();
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !state) return;
  if (ui.modal === 'help' || ui.modal === 'confirm-new') ui.modal = null;
  else if (ui.selected) ui.selected = null;
  else return;
  render();
});

// ---------------------------------------------------------------------------
// Neve marinha: partículas orgânicas que caem devagar pela coluna d'água.

function startMarineSnow(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let width = 0;
  let height = 0;
  let flakes = [];

  const spawn = (anywhere) => ({
    x: Math.random() * width,
    y: anywhere ? Math.random() * height : -4,
    r: 0.4 + Math.random() * 1.3,
    vy: 0.08 + Math.random() * 0.22,
    phase: Math.random() * Math.PI * 2,
    alpha: 0.15 + Math.random() * 0.35,
  });

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    width = rect.width;
    height = rect.height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    flakes = Array.from({ length: Math.round((width * height) / 7000) }, () => spawn(true));
    draw();
  };

  const color = getComputedStyle(document.documentElement).getPropertyValue('--snow').trim() || '#cfe3df';

  function draw() {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = color;
    for (const f of flakes) {
      ctx.globalAlpha = f.alpha;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function step(t) {
    for (const f of flakes) {
      f.y += f.vy;
      f.x += Math.sin(t / 2400 + f.phase) * 0.12;
      if (f.y > height + 4) Object.assign(f, spawn(false));
    }
    draw();
    if (!document.hidden) requestAnimationFrame(step);
  }

  new ResizeObserver(resize).observe(canvas);
  resize();
  if (!reduceMotion) {
    requestAnimationFrame(step);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) requestAnimationFrame(step);
    });
  }
}

// ---------------------------------------------------------------------------
// Início

function start(data) {
  let restored = null;
  if (data && data.save) {
    try {
      restored = deserialize(data.save);
    } catch {
      restored = null;
    }
  }
  state = restored || loadSave() || createGame();
  if (state.status !== 'playing') ui.modal = 'outcome';
  else if (!restored && state.cycle === 1 && state.log.length <= 1) ui.modal = 'help';
  save();
  render();
  startMarineSnow($('snow'));
}

const hot = window.claude && window.claude.hot;
if (hot && typeof hot.snapshot === 'function') hot.snapshot(() => ({ save: state ? serialize(state) : null }));
if (hot && typeof hot.ready === 'function') hot.ready(start);
else start(hot && hot.data ? hot.data : {});
