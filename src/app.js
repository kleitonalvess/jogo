// Controlador do jogo: junta o motor (estado do mundo), a renderização 3D,
// os moradores, o jogador, a interface e o som. Cuida dos modos de jogo
// (título, criação, conversa, terminal, diário, eventos, relatório, pausa,
// desfecho) e das saídas pela eclusa.

import * as THREE from 'three';

import { Audio } from './audio.js';
import { MODULES } from './engine/data.js';
import { chooseOption, openConversation } from './engine/dialogue.js';
import { canAfford, currentEvent, deserialize, eventDef, eventSpeaker, resolveEvent, serialize } from './engine/game.js';
import { displayName, fullName, residentById, residentByKey } from './engine/people/population.js';
import { objectives } from './engine/quests.js';
import { EXTERIOR, SUIT, availableItems, canSleep, clock, createWorld, depositScrap, endDay, interact, leaksToday, patchLeak, pickUp, tick, useAirCache } from './engine/world.js';
import { Agents } from './render/agents.js';
import { useLightMaterials } from './render/geometry.js';
import { ColonyView } from './render/colony.js';
import { BOUNDS, ExteriorView, groundHeight } from './render/exterior.js';
import { Input } from './render/input.js';
import { RING_OUT, floorY, indexModules, regionAt, roomToWorld } from './render/layout.js';
import { Overlays } from './render/overlays.js';
import { Player, colonyInside } from './render/player.js';
import { Portraits } from './render/portraits.js';
import { esc, fmt } from './ui/format.js';
import { journalAction, renderJournal } from './ui/journal.js';
import { INTRO_CARDS, renderCreation, renderDialogue, renderEnding, renderEvent, renderHelp, renderIntro, renderPause, renderReport, renderTitle } from './ui/screens.js';
import { renderTerminal, setJobFromSelect, terminalAction } from './ui/terminal.js';

const SAVE_KEY = 'nadir.save.v2';
const SETTINGS_KEY = 'nadir.settings.v1';
const LIGHT_POOL = 8;

function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Sem armazenamento: a partida segue só nesta aba.
  }
}

function storageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignorado
  }
}

export class App {
  constructor(root) {
    this.root = root;
    this.els = {
      canvas: root.querySelector('#view'),
      worldUi: root.querySelector('#world-ui'),
      hud: root.querySelector('#hud'),
      prompt: root.querySelector('#prompt'),
      panel: root.querySelector('#panel'),
      toast: root.querySelector('#toast'),
      fade: root.querySelector('#fade'),
      touch: root.querySelector('#touch'),
    };
    this.settings = this.loadSettings();
    if (this.settings.quality !== 'high') useLightMaterials();
    this.renderer = new THREE.WebGLRenderer({ canvas: this.els.canvas, antialias: this.settings.quality === 'high', powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.05, 420);
    this.resize();
    addEventListener('resize', () => this.resize());

    this.colonyScene = new THREE.Scene();
    this.colonyScene.background = new THREE.Color('#071419');
    this.colonyScene.fog = new THREE.FogExp2('#0a1a20', 0.028);
    this.colonyScene.add(new THREE.AmbientLight('#4a6670', 1.35));
    this.colonyScene.add(new THREE.HemisphereLight('#a7c7cf', '#251c14', 0.9));
    this.lights = [];
    for (let i = 0; i < LIGHT_POOL; i++) {
      const l = new THREE.PointLight('#ffd29a', 0, 13, 1.5);
      this.colonyScene.add(l);
      this.lights.push(l);
    }
    this.playerLamp = new THREE.PointLight('#ffe2b8', 6, 7, 1.6);
    this.colonyScene.add(this.playerLamp);
    this.colony = new ColonyView(this.colonyScene);
    this.agents = new Agents(this.colonyScene);
    this.exterior = null;
    this.leakGroup = new THREE.Group();
    this.colonyScene.add(this.leakGroup);
    this.propGroup = new THREE.Group();
    this.colonyScene.add(this.propGroup);

    this.input = new Input(this.els.canvas, this.els.touch);
    this.overlays = new Overlays(this.els.worldUi);
    this.portraits = new Portraits(this.renderer);
    this.audio = new Audio();
    this.audio.enabled = this.settings.sound;

    this.state = null;
    this.player = null;
    this.zone = 'colony';
    this.mode = 'title';
    this.ui = { termTab: 'report', journalTab: 'quests', planSel: null, introIndex: 0 };
    this.creation = { name: 'Sena', g: 'f', appearance: { skin: 3, hair: 'curto', hairColor: 1, height: 1, build: 1, beard: 'nenhuma', extra: 'nenhum' } };
    this.conv = null;
    this.report = null;
    this.target = null;
    this.climbing = null;
    this.hudTimer = 0;
    this.time = 0;
    this.lightTimer = 0;
    this.stingCooldown = 0;
    this.toastTimer = null;
    this.lastFrame = performance.now();

    this.bindUi();
    this.setupTitleBackdrop();
    this.renderPanel();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------------------------------------------------------------------------
  // Configurações e salvamento

  loadSettings() {
    const defaults = { sound: true, quality: matchMedia('(pointer: coarse)').matches ? 'low' : 'high' };
    try {
      return { ...defaults, ...JSON.parse(storageGet(SETTINGS_KEY) || '{}') };
    } catch {
      return defaults;
    }
  }

  saveSettings() {
    storageSet(SETTINGS_KEY, JSON.stringify(this.settings));
  }

  save() {
    if (!this.state || this.state.status !== 'playing') return;
    storageSet(SAVE_KEY, serialize(this.state));
  }

  loadSave() {
    const raw = storageGet(SAVE_KEY);
    if (!raw) return null;
    try {
      return deserialize(raw);
    } catch {
      return null;
    }
  }

  resize() {
    const w = this.root.clientWidth || innerWidth;
    const h = this.root.clientHeight || innerHeight;
    const ratio = Math.min(devicePixelRatio || 1, this.settings && this.settings.quality === 'high' ? 1.75 : 1);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.width = w;
    this.height = h;
  }

  // ---------------------------------------------------------------------------
  // Título: a colônia viva ao fundo, com a câmera girando devagar.

  setupTitleBackdrop() {
    this.backdrop = createWorld(20240611);
    this.backdrop.time.minute = 19 * 60;
    this.colony.sync(this.backdrop);
    this.agents.sync(this.backdrop);
    this.agents.placeAll(this.backdrop);
  }

  // ---------------------------------------------------------------------------
  // Interface

  bindUi() {
    this.root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el || el.disabled || el.tagName === 'SELECT') return;
      this.audio.ensure();
      this.audio.click();
      this.handle(el.dataset.action, el.dataset);
    });
    this.root.addEventListener('change', (e) => {
      const el = e.target;
      if (el.dataset && el.dataset.action === 'set-job') {
        const res = setJobFromSelect(this.state, el.dataset.id, el.value);
        if (res && !res.ok) this.toast([res.error], 'warn');
        this.afterStateChange();
        this.renderPanel();
      }
    });
    this.root.addEventListener('input', (e) => {
      if (e.target.id === 'create-name') this.creation.name = e.target.value.slice(0, 24);
    });
    addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName === 'INPUT') return;
      this.audio.ensure();
      const k = e.key;
      if (this.mode === 'dialogue' && /^[1-9]$/.test(k) && this.conv) {
        const opt = this.conv.options[Number(k) - 1];
        if (opt) this.talk(opt.id);
        else if (this.conv.ended) this.endTalk();
      } else if (this.mode === 'event' && /^[1-9]$/.test(k)) {
        this.choose(Number(k) - 1);
      } else if (k === 'Escape') {
        if (['terminal', 'journal', 'help'].includes(this.mode)) this.closePanel();
        else if (this.mode === 'dialogue') this.endTalk();
        else if (this.mode === 'pause') this.setMode('play');
        else if (this.mode === 'play') this.setMode('pause');
      } else if ((k === 'j' || k === 'J') && (this.mode === 'play' || this.mode === 'journal')) {
        if (this.mode === 'journal') this.closePanel();
        else this.setMode('journal');
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'play') {
        this.save();
        this.setMode('pause');
      }
    });
  }

  setMode(mode) {
    this.mode = mode;
    this.input.enabled = mode === 'play';
    this.root.classList.toggle('playing', mode === 'play');
    this.root.classList.toggle('in-menu', mode !== 'play');
    this.renderPanel();
  }

  closePanel() {
    if (this.mode === 'help' && !this.state) return this.setMode('title');
    if (this.mode === 'help' && this.helpReturn) return this.setMode(this.helpReturn);
    this.setMode('play');
  }

  portrait = (r) => {
    try {
      return this.portraits.get(this.state || this.backdrop, r);
    } catch {
      return '';
    }
  };

  renderPanel() {
    const s = this.state;
    let html = '';
    switch (this.mode) {
      case 'title':
        html = renderTitle(!!storageGet(SAVE_KEY));
        break;
      case 'creation':
        html = renderCreation(this.creation);
        break;
      case 'intro':
        html = renderIntro(this.ui.introIndex);
        break;
      case 'dialogue':
        html = this.conv ? renderDialogue(s, this.conv, this.portrait) : '';
        break;
      case 'terminal':
        html = renderTerminal(s, this.ui);
        break;
      case 'journal':
        html = renderJournal(s, this.ui, this.portrait);
        break;
      case 'event':
        html = currentEvent(s) ? `<div class="overlay">${renderEvent(s, currentEvent(s), this.portrait)}</div>` : '';
        break;
      case 'report':
        html = `<div class="overlay">${renderReport(s, this.report)}</div>`;
        break;
      case 'pause':
        html = `<div class="overlay">${renderPause(this.settings)}</div>`;
        break;
      case 'help':
        html = `<div class="overlay">${renderHelp()}</div>`;
        break;
      case 'ending':
        html = renderEnding(s, this.portrait);
        break;
      default:
        html = '';
    }
    this.els.panel.innerHTML = html;
    this.els.panel.dataset.mode = this.mode;
    if (this.mode === 'dialogue') {
      const lines = this.els.panel.querySelector('#dialogue-lines');
      if (lines) lines.scrollTop = lines.scrollHeight;
    }
    const first = this.els.panel.querySelector('.primary:not([disabled]), .option, .choice:not([disabled])');
    if (first && this.mode !== 'creation' && this.mode !== 'play') first.focus({ preventScroll: true });
    this.renderHud(true);
  }

  toast(lines, tone = '') {
    const list = Array.isArray(lines) ? lines : [lines];
    if (!list.length) return;
    this.els.toast.className = `toast ${tone}`;
    this.els.toast.innerHTML = list.map((l) => `<p>${esc(l)}</p>`).join('');
    this.els.toast.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.els.toast.hidden = true;
    }, 4200);
  }

  handle(action, data) {
    const s = this.state;
    switch (action) {
      case 'new-game':
        this.setMode('creation');
        this.previewCharacter();
        return;
      case 'continue':
        return this.continueGame();
      case 'show-help':
        this.helpReturn = this.mode;
        return this.setMode('help');
      case 'close-help':
        return this.closePanel();
      case 'back-title':
        this.clearPreview();
        return this.setMode('title');
      case 'create-set': {
        const value = ['skin', 'hairColor'].includes(data.field) ? Number(data.value) : data.value;
        if (data.field === 'g') this.creation.g = value;
        else this.creation.appearance[data.field] = value;
        this.previewCharacter();
        this.renderPanel();
        return;
      }
      case 'start-game':
        return this.newGame();
      case 'intro-next':
        if (this.ui.introIndex < INTRO_CARDS.length - 1) {
          this.ui.introIndex += 1;
          return this.renderPanel();
        }
        return this.beginPlay();
      case 'intro-skip':
        return this.beginPlay();
      case 'talk':
        return this.talk(data.option);
      case 'end-talk':
        return this.endTalk();
      case 'choice':
        return this.choose(Number(data.index));
      case 'start-day':
        this.report = null;
        this.setMode('play');
        this.checkEvents();
        return;
      case 'close-panel':
        return this.closePanel();
      case 'resume':
        return this.setMode('play');
      case 'toggle-sound':
        this.settings.sound = !this.settings.sound;
        this.audio.setEnabled(this.settings.sound);
        this.saveSettings();
        return this.renderPanel();
      case 'toggle-quality':
        this.settings.quality = this.settings.quality === 'high' ? 'low' : 'high';
        this.saveSettings();
        this.resize();
        this.toast(['A suavização de bordas muda na próxima vez que o jogo abrir.']);
        return this.renderPanel();
      case 'save-now':
        this.save();
        this.toast(['Partida salva.']);
        return;
      case 'to-title':
        if (s && s.status === 'playing') this.save();
        else storageRemove(SAVE_KEY);
        return this.toTitle();
      case 'hud-journal':
        return this.setMode(this.mode === 'journal' ? 'play' : 'journal');
      case 'hud-pause':
        return this.setMode('pause');
      default: {
        if (this.mode === 'terminal') {
          const res = terminalAction(s, this.ui, action, data);
          if (res === undefined) return;
          if (res && !res.ok) this.toast([res.error], 'warn');
          this.afterStateChange();
          this.renderPanel();
          return;
        }
        if (this.mode === 'journal') {
          if (journalAction(this.ui, action, data) !== undefined) this.renderPanel();
        }
      }
    }
  }

  afterStateChange() {
    if (!this.state) return;
    this.colony.sync(this.state);
    this.agents.sync(this.state);
  }

  // ---------------------------------------------------------------------------
  // Início de partida

  previewCharacter() {
    this.clearPreview();
    this.preview = new Player(this.colonyScene, this.creation.appearance);
    const a = 0.2;
    this.preview.placeAt(Math.cos(a) * 4.9, 0, Math.sin(a) * 4.9, 0, -Math.PI / 2 - a);
  }

  clearPreview() {
    if (this.preview) {
      this.colonyScene.remove(this.preview.ch.root);
      this.preview = null;
    }
  }

  newGame() {
    const name = (this.creation.name || '').trim() || 'Sena';
    this.clearPreview();
    storageRemove(SAVE_KEY);
    const seed = Math.floor(Math.random() * 2 ** 31);
    this.state = createWorld(seed, { name, g: this.creation.g, appearance: { ...this.creation.appearance } });
    this.portraits.clear();
    this.startState();
    this.ui.introIndex = 0;
    this.setMode('intro');
  }

  continueGame() {
    const saved = this.loadSave();
    if (!saved) {
      this.toast(['Não foi possível carregar a partida salva.'], 'warn');
      return;
    }
    this.state = saved;
    this.portraits.clear();
    this.startState();
    this.beginPlay(false);
  }

  startState() {
    const s = this.state;
    // Recomeça a cena da colônia do zero.
    for (const a of [...this.agents.agents.values()]) this.agents.group.remove(a.ch.root);
    this.agents.agents.clear();
    this.agents.graphSig = '';
    this.colony.sync(s);
    this.agents.sync(s);
    this.agents.placeAll(s);
    if (this.player) this.player.scene.remove(this.player.ch.root);
    this.player = new Player(this.colonyScene, s.player.appearance);
    this.placePlayerAtBed();
    this.zone = 'colony';
    this.audio.setZone('colony');
  }

  // Acorda ao lado do beliche, de frente para o meio do Núcleo.
  placePlayerAtBed() {
    const bed = this.colony.interactables.find((i) => i.id === 'bed');
    const core = this.state.modules.find((m) => m.type === 'core');
    const center = roomToWorld(core.level, core.slot, 6, 0);
    const facing = Math.atan2(center.x - bed.x, center.z - bed.z);
    this.player.placeAt(bed.x, floorY(core.level), bed.z, core.level, facing);
    this.player.camPos.set(0, 0, 0);
  }

  beginPlay(fresh = true) {
    this.setMode('play');
    this.renderHud(true);
    if (fresh) this.toast(['Você acorda no Núcleo do Conselho, no Nível 1.', 'Fale com Augusto Mendonça. Use E para conversar.']);
    this.checkEvents();
  }

  toTitle() {
    this.state = null;
    this.conv = null;
    if (this.player) {
      this.player.scene.remove(this.player.ch.root);
      this.player = null;
    }
    if (this.zone === 'exterior') this.zone = 'colony';
    this.audio.setZone('colony');
    for (const a of [...this.agents.agents.values()]) this.agents.group.remove(a.ch.root);
    this.agents.agents.clear();
    this.agents.graphSig = '';
    this.colony.sync(this.backdrop);
    this.agents.sync(this.backdrop);
    this.agents.placeAll(this.backdrop);
    this.setMode('title');
  }

  // ---------------------------------------------------------------------------
  // Conversas e eventos

  startTalk(agent) {
    const r = residentById(this.state, agent.id);
    if (!r) return;
    this.conv = openConversation(this.state, r.id);
    if (!this.conv) return;
    this.agents.hold(agent.id, this.player.position, 'talk');
    this.talkingTo = agent.id;
    // O jogador vira para quem fala.
    const p = agent.ch.root.position;
    this.player.ch.root.rotation.y = Math.atan2(p.x - this.player.position.x, p.z - this.player.position.z);
    this.setMode('dialogue');
  }

  talk(optionId) {
    if (!this.conv) return;
    chooseOption(this.state, this.conv, optionId);
    this.afterStateChange();
    if (currentEvent(this.state)) {
      this.endTalk(false);
      this.checkEvents();
      return;
    }
    this.renderPanel();
  }

  endTalk(resume = true) {
    if (this.talkingTo !== undefined && this.talkingTo !== null) this.agents.release(this.talkingTo);
    this.talkingTo = null;
    this.conv = null;
    if (resume) {
      this.setMode('play');
      this.checkEvents();
    }
    if (this.state && this.state.status !== 'playing') this.showEnding();
  }

  checkEvents() {
    const s = this.state;
    if (!s) return;
    if (s.status !== 'playing') return this.showEnding();
    const entry = currentEvent(s);
    if (!entry) return;
    const def = eventDef(entry);
    const speaker = eventSpeaker(s, entry);
    if (speaker && this.zone === 'colony' && this.agents.get(speaker.id)) {
      this.agents.summon(speaker.id, this.player);
      this.agents.hold(speaker.id, this.player.position, 'talk');
      this.eventSpeakerId = speaker.id;
    }
    if (def.alarm) this.audio.alarm();
    else if (def.document) this.audio.doc();
    this.setMode('event');
  }

  choose(index) {
    const s = this.state;
    const entry = currentEvent(s);
    if (!entry) return;
    const def = eventDef(entry);
    if (!def.choices[index] || !canAfford(s, def.choices[index].effects)) return;
    const res = resolveEvent(s, index);
    if (!res.ok) {
      this.toast([res.error], 'warn');
      return;
    }
    if (this.eventSpeakerId) {
      this.agents.release(this.eventSpeakerId);
      this.eventSpeakerId = null;
    }
    this.afterStateChange();
    if (res.outcome) this.toast([res.outcome]);
    if (s.status !== 'playing') return this.showEnding();
    if (currentEvent(s)) return this.checkEvents();
    this.setMode('play');
  }

  showEnding() {
    storageRemove(SAVE_KEY);
    this.setMode('ending');
  }

  // ---------------------------------------------------------------------------
  // Dormir e o dia seguinte

  sleep(passedOut = false) {
    const s = this.state;
    if (currentEvent(s)) return this.checkEvents();
    this.fadeOut(() => {
      if (this.zone === 'exterior') this.enterColony(true);
      const result = endDay(s, { passedOut });
      if (!result.ok) {
        this.fadeIn();
        this.toast([result.error], 'warn');
        return;
      }
      this.report = result.report;
      this.afterStateChange();
      this.agents.placeAll(s);
      this.placePlayerAtBed();
      this.save();
      if (s.status !== 'playing') {
        this.fadeIn();
        return this.showEnding();
      }
      this.setMode('report');
      this.fadeIn();
    });
  }

  fadeOut(then) {
    this.els.fade.classList.add('on');
    setTimeout(then, 650);
  }

  fadeIn() {
    setTimeout(() => this.els.fade.classList.remove('on'), 80);
  }

  // ---------------------------------------------------------------------------
  // Eclusa: sair e voltar

  enterExterior() {
    if (!this.exterior) {
      this.exterior = new ExteriorView();
      // Lanterna do capacete e uma luz fraca em volta do traje.
      this.headlamp = new THREE.SpotLight('#e8f4ff', 90, 48, 0.62, 0.55, 1.2);
      this.exterior.scene.add(this.headlamp, this.headlamp.target);
      this.suitLight = new THREE.PointLight('#ffd9a8', 7, 10, 1.4);
      this.exterior.scene.add(this.suitLight);
    }
    this.fadeOut(() => {
      this.zone = 'exterior';
      this.player.moveTo(this.exterior.scene);
      this.player.setSuit(true, this.exterior.scene);
      const a = EXTERIOR.airlock;
      this.player.placeAt(a.x, groundHeight(a.x, a.z), a.z, 0, Math.PI);
      this.player.camPos.set(0, 0, 0);
      this.player.pitch = 0.25;
      this.state.player.suitTank = this.state.player.suitTankMax;
      this.exterior.syncItems(availableItems(this.state, 'exterior'));
      this.audio.setZone('exterior');
      this.toast(['Leito marinho, 380 metros. O tanque do traje dura alguns minutos.', 'Espaço nada para cima. Volte pela eclusa antes do ar acabar.']);
      this.fadeIn();
    });
  }

  enterColony(silent = false) {
    const doIt = () => {
      this.zone = 'colony';
      this.climbing = null;
      this.player.moveTo(this.colonyScene);
      this.player.setSuit(false, this.colonyScene);
      const dock = this.colony.interactables.find((i) => i.id === 'airlock');
      if (dock) this.player.placeAt(dock.x, floorY(dock.level), dock.z, dock.level, 0);
      this.player.camPos.set(0, 0, 0);
      const gained = depositScrap(this.state);
      this.audio.setZone('colony');
      if (!silent) this.toast(gained ? [`Sucata entregue: +${gained} de materiais.`] : ['De volta à colônia.']);
      if (!silent) this.fadeIn();
      this.checkEvents();
    };
    if (silent) doIt();
    else this.fadeOut(doIt);
  }

  faint() {
    const s = this.state;
    this.fadeOut(() => {
      s.player.inventory.sucata = 0;
      delete s.player.inventory.sucata;
      s.time.minute += 180;
      const icaro = residentByKey(s, 'icaro');
      this.enterColony(true);
      const clinic = s.modules.find((m) => m.type === 'clinic');
      this.toast([
        icaro && icaro.alive ? 'Você apagou lá fora. Ícaro te trouxe de volta, arrastando o traje pela areia.' : 'Você apagou lá fora. Alguém da eclusa te puxou de volta.',
        clinic ? 'Acordou na Enfermaria, três horas depois.' : 'Acordou na eclusa, três horas depois.',
      ], 'warn');
      if (icaro && icaro.alive) icaro.opinion = Math.max(0, icaro.opinion - 4);
      this.fadeIn();
    });
  }

  // Avança a simulação sem esperar quadros (usado nos testes automatizados).
  debugStep(seconds, dt = 1 / 30) {
    for (let t = 0; t < seconds; t += dt) {
      if (this.state && this.mode === 'play') this.updatePlay(dt);
      else this.updateIdle(dt);
      this.input.endFrame();
    }
    this.renderHud(true);
  }

  // ---------------------------------------------------------------------------
  // Quadro a quadro

  frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.time += dt;
    if (this.state && this.mode === 'play') this.updatePlay(dt);
    else this.updateIdle(dt);
    this.renderer.render(this.zone === 'exterior' && this.exterior ? this.exterior.scene : this.colonyScene, this.camera);
    this.renderOverlays();
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.renderHud();
      this.hudTimer = 0.25;
    }
    this.input.endFrame();
  }

  updateIdle(dt) {
    const s = this.state || this.backdrop;
    if (this.mode === 'title' || this.mode === 'intro' || (this.mode === 'help' && !this.state)) {
      // Câmera lenta em volta do anel do Nível 1.
      const a = this.time * 0.06;
      this.camera.position.set(Math.cos(a) * 4.7, 1.7 + Math.sin(this.time * 0.2) * 0.2, Math.sin(a) * 4.7);
      this.camera.lookAt(Math.cos(a + 0.9) * 4.2, 1.2, Math.sin(a + 0.9) * 4.2);
      s.time.minute = Math.min(s.time.minute + dt * 0.5, 21 * 60);
      this.agents.update(dt, s, { position: this.camera.position, level: 0 }, this.camera);
      this.colony.update(dt);
      this.updateLights(true);
      return;
    }
    if (this.mode === 'creation' && this.preview) {
      const p = this.preview.position;
      const a = this.time * 0.35;
      this.camera.position.set(p.x - Math.cos(0.2) * 2.6 + Math.sin(a) * 0.4, 1.3, p.z - Math.sin(0.2) * 2.6 + Math.cos(a) * 0.4);
      this.camera.lookAt(p.x, 1.05, p.z);
      this.preview.animate(dt, 'idle');
      this.agents.update(dt, this.backdrop, { position: p, level: 0 }, this.camera);
      this.updateLights(true);
      return;
    }
    if (this.state && this.player) {
      // Menus e conversas: o mundo continua animado, o relógio para.
      if (this.zone === 'colony') {
        this.agents.update(dt, this.state, this.player, this.camera);
        this.colony.update(dt);
        this.updateLights();
      } else if (this.exterior) {
        this.exterior.update(dt, this.time, this.player.position);
      }
      this.player.animate(dt, this.mode === 'dialogue' ? 'idle' : null);
      const inside = this.zone === 'colony' ? colonyInside(indexModules(this.state.modules), this.colony.deepest) : () => true;
      this.player.updateCamera(this.camera, this.input, dt, inside);
    }
  }

  updatePlay(dt) {
    const s = this.state;
    const fast = this.input.keys.has('t') || this.input.keys.has('wait');
    const scale = fast ? 8 : 1;
    const ticked = tick(s, dt * scale);
    if (ticked.passOut) {
      this.toast(['Duas da manhã. Você não aguenta mais ficar de pé.'], 'warn');
      return this.sleep(true);
    }
    if (this.zone === 'colony') this.updateColony(dt, scale);
    else this.updateExterior(dt, scale);
    this.audio.update(dt, { moving: this.player.anim === 'walk' || this.player.anim === 'run', running: this.player.anim === 'run' });
    if (this.input.take('j')) return this.setMode('journal');
    if (this.input.take('e') || this.input.take('use')) this.useTarget();
  }

  updateColony(dt, scale) {
    const s = this.state;
    const index = indexModules(s.modules);
    this.player.updateColony(dt, this.input, index, this.colony.deepest);
    this.player.animate(dt);
    this.agents.update(dt * scale, s, this.player, this.camera);
    this.colony.update(dt);
    this.updateLights();
    this.updateLeaks();
    this.updateColonyProps();
    this.player.updateCamera(this.camera, this.input, dt, colonyInside(index, this.colony.deepest));
    this.playerLamp.position.set(this.player.position.x, this.player.position.y + 2.2, this.player.position.z);
    this.target = this.findColonyTarget();
  }

  updateExterior(dt, scale) {
    const s = this.state;
    const ex = this.exterior;
    const pos = this.player.position;
    if (this.climbing) {
      const up = (this.input.keys.has('w') || this.input.keys.has('arrowup') || this.input.move.y > 0.3 ? 1 : 0) - (this.input.keys.has('s') || this.input.keys.has('arrowdown') || this.input.move.y < -0.3 ? 1 : 0);
      const base = groundHeight(EXTERIOR.regions.cable.x, EXTERIOR.regions.cable.z);
      pos.y = Math.max(base, Math.min(base + EXTERIOR.cableHeight, pos.y + up * 2.4 * dt));
      this.player.anim = up ? 'swim' : 'idle';
      this.player.animate(dt);
      s.player.suitTank -= SUIT.climbDrain * dt;
    } else {
      this.player.updateExterior(dt, this.input, groundHeight, ex.obstacles, BOUNDS, 1);
      this.player.animate(dt);
      const sprint = this.input.running() && this.player.anim === 'run';
      s.player.suitTank -= (sprint ? SUIT.sprintDrain : SUIT.drainPerSecond) * dt;
    }
    // Calor das fontes termais e águas-vivas.
    const hot = ex.vents.some((v) => Math.hypot(v.x - pos.x, v.z - pos.z) < 3 && pos.y < v.y + 2);
    if (hot) {
      s.player.suitTank -= SUIT.ventDrain * dt;
      if (!this.hotWarned) {
        this.toast(['Calor! A água aqui ferve. O traje está perdendo ar.'], 'crit');
        this.hotWarned = true;
      }
    } else this.hotWarned = false;
    this.stingCooldown -= dt;
    if (this.stingCooldown <= 0 && ex.fauna.stingAt(new THREE.Vector3(pos.x, pos.y + 1.4, pos.z))) {
      s.player.suitTank -= 8;
      this.stingCooldown = 3;
      this.toast(['Uma água-viva roçou no traje. A válvula assobiou.'], 'warn');
    }
    if (s.player.suitTank <= 0) {
      s.player.suitTank = 0;
      return this.faint();
    }
    ex.update(dt, this.time, pos);
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    this.headlamp.position.set(pos.x + fwd.x * 0.3, pos.y + 1.7, pos.z + fwd.z * 0.3);
    this.headlamp.target.position.set(pos.x + fwd.x * 12, pos.y + 1.2 + fwd.y * 12, pos.z + fwd.z * 12);
    // Luz de preenchimento junto da câmera, para o traje não virar silhueta.
    this.suitLight.position.copy(this.camera.position);
    this.player.updateCamera(this.camera, this.input, dt, (x, y, z) => y > groundHeight(x, z) + 0.4 && Math.hypot(x, z) > EXTERIOR.tower.radius + 0.3);
    this.target = this.findExteriorTarget();
    void scale;
  }

  // Luzes mais próximas do jogador recebem as fontes de luz disponíveis.
  updateLights(force = false) {
    this.lightTimer -= 1 / 60;
    if (this.lightTimer > 0 && !force) return;
    this.lightTimer = 0.25;
    const ref = this.player && this.state ? this.player.position : this.camera.position;
    const level = this.player && this.state ? this.player.level : 0;
    const lamps = this.colony.lamps
      .filter((l) => Math.abs(l.level - level) <= 1)
      .map((l) => ({ l, d: Math.hypot(l.x - ref.x, (l.y - ref.y) * 2, l.z - ref.z) }))
      .sort((a, b) => a.d - b.d);
    for (let i = 0; i < this.lights.length; i++) {
      const item = lamps[i];
      const light = this.lights[i];
      if (!item) {
        light.intensity = 0;
        continue;
      }
      light.position.set(item.l.x, item.l.y, item.l.z);
      light.color.set(item.l.color);
      light.intensity = 22 * (item.l.intensity || 1);
    }
  }

  // Vazamentos do dia: jatos de água nas paredes do corredor.
  updateLeaks() {
    const leaks = leaksToday(this.state);
    const ids = leaks.map((l) => l.id).join(',');
    if (ids !== this.leakIds) {
      this.leakIds = ids;
      this.leakGroup.clear();
      this.leaks = leaks.map((l) => {
        const a = (l.angle / 16) * Math.PI * 2 + 0.2;
        const x = Math.cos(a) * (RING_OUT - 0.25);
        const z = Math.sin(a) * (RING_OUT - 0.25);
        const y = floorY(l.level) + 1.5 + (l.angle % 3) * 0.4;
        const jet = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.3, 6), new THREE.MeshBasicMaterial({ color: '#bfe8f0', transparent: true, opacity: 0.55 }));
        jet.position.set(x - Math.cos(a) * 0.6, y - 0.2, z - Math.sin(a) * 0.6);
        jet.rotation.z = Math.PI / 2;
        jet.rotation.y = -a;
        this.leakGroup.add(jet);
        const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.9, 16), new THREE.MeshBasicMaterial({ color: '#2a5a66', transparent: true, opacity: 0.5 }));
        puddle.rotation.x = -Math.PI / 2;
        puddle.position.set(x - Math.cos(a) * 0.9, floorY(l.level) + 0.02, z - Math.sin(a) * 0.9);
        this.leakGroup.add(puddle);
        return { ...l, x: x - Math.cos(a) * 0.9, z: z - Math.sin(a) * 0.9, y: floorY(l.level), jet };
      });
    }
    for (const l of this.leaks || []) l.jet.scale.y = 0.9 + Math.sin(this.time * 30 + l.angle) * 0.15;
  }

  // Lata de tinta na Oficina, quando a missão pede.
  updateColonyProps() {
    const available = availableItems(this.state, 'colony');
    const paint = available.find((w) => w.id === 'lata-tinta') && this.colony.paintSpot;
    if (paint && !this.paintMesh) {
      this.paintMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.3, 10), new THREE.MeshStandardMaterial({ color: '#c94a3a', roughness: 0.6 }));
      this.propGroup.add(this.paintMesh);
    }
    if (!paint && this.paintMesh) {
      this.propGroup.remove(this.paintMesh);
      this.paintMesh = null;
    }
    if (this.paintMesh) this.paintMesh.position.set(paint.x, paint.y + 0.15, paint.z);
  }

  findColonyTarget() {
    const p = this.player.position;
    const level = this.player.level;
    const cands = [];
    const facing = this.player.ch.root.rotation.y;
    const inFront = (x, z) => {
      const dx = x - p.x;
      const dz = z - p.z;
      const d = Math.hypot(dx, dz) || 1;
      return (dx / d) * Math.sin(facing) + (dz / d) * Math.cos(facing);
    };
    const agent = this.agents.nearest(p, level, 2.3);
    if (agent) {
      const r = residentById(this.state, agent.id);
      const ap = agent.ch.root.position;
      const d = Math.hypot(ap.x - p.x, ap.z - p.z);
      cands.push({ kind: 'npc', id: agent.id, d: d - Math.max(0, inFront(ap.x, ap.z)) * 0.6, label: `Falar com ${fullName(r)}`, pos: ap });
    }
    if (!this.player.onStair) {
      for (const it of this.colony.interactables) {
        if (it.level !== level) continue;
        const d = Math.hypot(it.x - p.x, it.z - p.z);
        if (d < 1.7) {
          const label = it.nightOnly && this.state.time.minute < 20 * 60 ? 'Seu beliche (dá para dormir a partir das 20h)' : it.label;
          cands.push({ kind: 'object', id: it.id, d, label, pos: it });
        }
      }
      for (const l of this.leaks || []) {
        if (l.level !== level) continue;
        const d = Math.hypot(l.x - p.x, l.z - p.z);
        if (d < 1.9) cands.push({ kind: 'leak', id: l.id, d, label: 'Remendar o vazamento (2 MAT)', pos: l });
      }
      if (this.paintMesh) {
        const pp = this.paintMesh.position;
        const d = Math.hypot(pp.x - p.x, pp.z - p.z);
        if (d < 1.6 && Math.abs(pp.y - p.y) < 2) cands.push({ kind: 'item', id: 'lata-tinta', d, label: 'Apanhar a lata de tinta', pos: pp });
      }
    }
    cands.sort((a, b) => a.d - b.d);
    return cands[0] || null;
  }

  findExteriorTarget() {
    const p = this.player.position;
    const cands = [];
    if (this.climbing) {
      const base = groundHeight(EXTERIOR.regions.cable.x, EXTERIOR.regions.cable.z);
      if (p.y >= base + EXTERIOR.cableHeight - 1.5 && availableItems(this.state, 'exterior').some((w) => w.id === 'relay')) {
        cands.push({ kind: 'item', id: 'relay', d: 0, label: 'Abrir a caixa de retransmissão', pos: { x: p.x, y: p.y, z: p.z } });
      }
      cands.push({ kind: 'unclimb', d: 1, label: 'Soltar do cabo e descer' });
      return cands[0];
    }
    for (const [id, obj] of this.exterior.items) {
      const w = obj.position;
      if (id === 'relay') continue;
      const d = Math.hypot(w.x - p.x, w.z - p.z);
      if (d < 2.2 && Math.abs(w.y - p.y) < 3) cands.push({ kind: 'item', id, d, label: this.itemLabel(id), pos: w });
    }
    for (const c of EXTERIOR.airCaches) {
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d < 2.4) cands.push({ kind: 'air', id: c.id, d, label: 'Recarregar o tanque do traje', pos: { x: c.x, y: groundHeight(c.x, c.z), z: c.z } });
    }
    const a = EXTERIOR.airlock;
    const da = Math.hypot(a.x - p.x, a.z - p.z);
    if (da < 4) cands.push({ kind: 'airlock', d: da, label: 'Voltar para dentro pela eclusa', pos: { x: a.x, y: groundHeight(a.x, a.z), z: a.z } });
    const c = EXTERIOR.regions.cable;
    const dc = Math.hypot(c.x - p.x, c.z - p.z);
    if (dc < 3.4) cands.push({ kind: 'climb', d: dc, label: 'Subir pelo cabo da Coluna de Ascensão', pos: { x: c.x, y: groundHeight(c.x, c.z), z: c.z } });
    cands.sort((x, y) => x.d - y.d);
    return cands[0] || null;
  }

  itemLabel(id) {
    const w = this.exterior.items.get(id).userData.worldItem;
    const def = availableItems(this.state, 'exterior').find((x) => x.id === w);
    return def ? `Apanhar: ${def.label}` : 'Apanhar';
  }

  useTarget() {
    const t = this.target;
    const s = this.state;
    if (!t) return;
    this.audio.ensure();
    switch (t.kind) {
      case 'npc':
        return this.startTalk(this.agents.get(t.id));
      case 'object':
        return this.useObject(t.id);
      case 'leak': {
        const res = patchLeak(s, t.id);
        this.toast([res.text], res.ok ? '' : 'warn');
        if (res.ok) this.leakIds = null;
        return;
      }
      case 'item': {
        const witnesses = [];
        if (this.zone === 'exterior') {
          const icaro = residentByKey(s, 'icaro');
          if (icaro && this.icaroWith) witnesses.push(icaro.id);
        }
        const res = pickUp(s, t.id, witnesses);
        if (res.ok) this.audio.pickup();
        this.toast([res.text], res.ok ? 'good' : 'warn');
        if (this.exterior) this.exterior.syncItems(availableItems(s, 'exterior'));
        if (res.fragment) this.checkEvents();
        return;
      }
      case 'air': {
        const res = useAirCache(s, t.id);
        this.toast([res.text], res.ok ? 'good' : 'warn');
        return;
      }
      case 'airlock':
        return this.enterColony();
      case 'climb': {
        const c = EXTERIOR.regions.cable;
        this.climbing = true;
        this.player.position.set(c.x + 0.65, groundHeight(c.x, c.z) + 0.5, c.z);
        this.toast(['W/S ou o joystick sobem e descem pelo cabo. Subir gasta mais ar.']);
        return;
      }
      case 'unclimb': {
        this.climbing = null;
        const c = EXTERIOR.regions.cable;
        this.player.position.set(c.x + 2.6, Math.max(groundHeight(c.x + 2.6, c.z), this.player.position.y), c.z);
        return;
      }
      default:
    }
  }

  useObject(id) {
    const s = this.state;
    if (id === 'terminal') {
      interact(s, 'terminal');
      this.ui.termTab = this.ui.termTab || 'report';
      return this.setMode('terminal');
    }
    if (id === 'bed') {
      const check = canSleep(s);
      if (!check.ok) return this.toast([check.text], 'warn');
      return this.sleep();
    }
    if (id === 'airlock') return this.enterExterior();
    const res = interact(s, id);
    if (res && res.text) this.toast([res.text], res.ok ? 'good' : 'warn');
    this.afterStateChange();
    this.checkEvents();
  }

  // ---------------------------------------------------------------------------
  // HUD e sobreposições

  locationLabel() {
    if (!this.state || !this.player) return '';
    const p = this.player.position;
    if (this.zone === 'exterior') {
      if (this.climbing) return `Coluna de Ascensão · −${Math.round(380 - (p.y - groundHeight(EXTERIOR.regions.cable.x, EXTERIOR.regions.cable.z)))} m`;
      let name = 'Leito marinho';
      for (const reg of Object.values(EXTERIOR.regions)) if (Math.hypot(reg.x - p.x, reg.z - p.z) < reg.r) name = reg.name;
      return `${name} · −${Math.round(380 - p.y)} m`;
    }
    if (this.player.onStair) return `Escada central · −${Math.round(160 - p.y * 8)} m`;
    const region = regionAt(indexModules(this.state.modules), this.player.level, p.x, p.z, 0);
    const lv = `Nível ${this.player.level + 1}`;
    if (region && (region.kind === 'room' || region.kind === 'door')) return `${lv} · ${MODULES[region.module.type].name}`;
    return `${lv} · Corredor`;
  }

  renderHud(force = false) {
    const s = this.state;
    const hud = this.els.hud;
    if (!s || !this.player || ['title', 'creation', 'intro', 'ending'].includes(this.mode)) {
      if (hud.innerHTML) hud.innerHTML = '';
      this.els.prompt.hidden = true;
      return;
    }
    const obj = objectives(s).slice(0, 2);
    const night = s.time.minute >= 20 * 60;
    const suit = this.zone === 'exterior' ? Math.max(0, Math.round((s.player.suitTank / s.player.suitTankMax) * 100)) : null;
    const vital = (code, value, warn) => `<span class="mini ${warn ? 'warn' : ''}"><b>${code}</b>${value}</span>`;
    const html = `<div class="hud-tl">
        <div class="clock"><b>Dia ${s.cycle}</b> <span>${clock(s)}</span>${night ? ' <span class="night">noite · pode dormir</span>' : ''}</div>
        <div class="place">${esc(this.locationLabel())}</div>
        ${suit !== null ? `<div class="suit ${suit < 30 ? 'crit' : ''}"><span>Ar do traje</span><span class="meter"><span style="width:${suit}%"></span></span><b>${suit}%</b></div>` : ''}
      </div>
      <div class="hud-tr">${obj.map((o) => `<p class="${o.main ? 'main' : ''}">${esc(o.text)}</p>`).join('')}</div>
      ${this.zone === 'exterior' ? this.compassHtml() : ''}
      <div class="hud-bl">
        ${vital('O₂', fmt(s.resources.oxygen), s.resources.oxygen < 40)}${vital('H₂O', fmt(s.resources.water), s.resources.water < 40)}${vital('ALG', fmt(s.resources.food), s.resources.food < 40)}${vital('MAT', fmt(s.resources.materials), false)}${vital('CAS', `${fmt(s.hull)}%`, s.hull < 45)}${vital('MOR', fmt(s.morale), s.morale < 40)}${vital('CNF', fmt(s.trust), s.trust < 40)}
      </div>
      <div class="hud-br">
        <button type="button" class="ghost small" data-action="hud-journal">Diário <kbd>J</kbd></button>
        <button type="button" class="ghost small" data-action="hud-pause">Pausa <kbd>Esc</kbd></button>
      </div>`;
    if (force || hud.dataset.html !== html) {
      hud.innerHTML = html;
      hud.dataset.html = html;
    }
    const prompt = this.mode === 'play' && this.target ? this.target.label : '';
    this.els.prompt.hidden = !prompt;
    if (prompt) {
      const text = `<kbd>E</kbd> ${esc(prompt)}`;
      if (this.els.prompt.dataset.html !== text) {
        this.els.prompt.innerHTML = text;
        this.els.prompt.dataset.html = text;
      }
    }
  }

  // Bússola: pontos cardeais, a eclusa e os marcos que você já conhece.
  compassHtml() {
    const p = this.player.position;
    const heading = -this.player.yaw;
    const marks = [
      { label: 'N', a: 0, cls: 'card' },
      { label: 'L', a: Math.PI / 2, cls: 'card' },
      { label: 'S', a: Math.PI, cls: 'card' },
      { label: 'O', a: -Math.PI / 2, cls: 'card' },
      { label: 'Eclusa', a: Math.atan2(EXTERIOR.airlock.x - p.x, -(EXTERIOR.airlock.z - p.z)), cls: 'home', d: Math.hypot(EXTERIOR.airlock.x - p.x, EXTERIOR.airlock.z - p.z) },
    ];
    for (const [key, reg] of Object.entries(EXTERIOR.regions)) {
      if (key === 'vents') continue;
      const d = Math.hypot(reg.x - p.x, reg.z - p.z);
      if (d < reg.r) continue;
      marks.push({ label: reg.name, a: Math.atan2(reg.x - p.x, -(reg.z - p.z)), cls: 'place', d });
    }
    const items = marks
      .map((m) => {
        let rel = m.a - heading;
        while (rel > Math.PI) rel -= Math.PI * 2;
        while (rel < -Math.PI) rel += Math.PI * 2;
        if (Math.abs(rel) > 1.6) return '';
        const x = 50 + (rel / 1.6) * 50;
        return `<span class="cmark ${m.cls}" style="left:${x.toFixed(1)}%">${esc(m.label)}${m.d ? `<small>${Math.round(m.d)} m</small>` : ''}</span>`;
      })
      .join('');
    return `<div class="compass" aria-hidden="true"><div class="compass-strip">${items}<span class="cneedle"></span></div></div>`;
  }

  renderOverlays() {
    const ov = this.overlays;
    ov.begin();
    const s = this.state;
    if (s && this.player && this.zone === 'colony' && ['play', 'dialogue', 'event'].includes(this.mode)) {
      const targets = new Set(objectives(s).map((o) => o.target).filter(Boolean));
      const p = this.player.position;
      for (const agent of this.agents.agents.values()) {
        const root = agent.ch.root;
        if (!root.visible || agent.level !== this.player.level) continue;
        const d = Math.hypot(root.position.x - p.x, root.position.z - p.z);
        const r = residentById(s, agent.id);
        if (!r) continue;
        const h = 1.95 * root.scale.y;
        if (agent.bubble && agent.bubble.until > performance.now() && d < 14) {
          ov.tag(this.camera, root.position, esc(agent.bubble.text), 'bubble', this.width, this.height, h + 0.25);
        } else if (d < 6.5 && this.mode === 'play') {
          ov.tag(this.camera, root.position, `<b>${esc(displayName(r))}</b>`, 'nametag', this.width, this.height, h + 0.05);
        }
        if (r.key && targets.has(r.key) && this.mode === 'play') ov.tag(this.camera, root.position, '▼', 'marker', this.width, this.height, h + 0.7);
      }
    }
    if (s && this.player && this.zone === 'exterior' && this.mode === 'play' && this.exterior) {
      const p = this.player.position;
      for (const [, obj] of this.exterior.items) {
        const d = obj.position.distanceTo(p);
        if (d < 9 && obj.userData.worldItem) {
          const w = availableItems(s, 'exterior').find((x) => x.id === obj.userData.worldItem);
          if (w && w.kind !== 'scrap' && w.kind !== 'algae') ov.tag(this.camera, obj.position, esc(w.label), 'nametag item', this.width, this.height, 1.1);
        }
      }
    }
    ov.end();
  }
}
