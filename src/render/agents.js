// Moradores em tempo real: cada um segue a própria rotina, anda pelos
// corredores e pela escada até o lugar planejado, senta, deita, trabalha e
// conversa com quem estiver por perto.

import * as THREE from 'three';

import { MODULES } from '../engine/data.js';
import { CAST } from '../engine/people/cast.js';
import { displayName, gw, outfitOf, residentById } from '../engine/people/population.js';
import { planFor } from '../engine/people/schedule.js';
import { reputationTitle } from '../engine/people/social.js';
import { hash01, hashPick } from '../engine/rng.js';
import { forms } from '../engine/text.js';
import { animateCharacter, createCharacter, disposeCharacter } from './character.js';
import {
  BAY_ANGLES,
  RING_NODES,
  RING_R,
  buildNavGraph,
  expandPath,
  floorY,
  nearestNode,
  regionAt,
  roomApproach,
  roomLayout,
  roomToWorld,
  shortestPath,
} from './layout.js';

const WALK_SPEED = 1.9;
const VOICES = Object.fromEntries(CAST.map((c) => [c.key, c.voice]));

function placeKey(place) {
  if (!place) return 'none';
  return [place.kind, place.module ?? '', place.index ?? '', place.level ?? '', place.angle ?? '', place.gathering ?? ''].join(':');
}

export class Agents {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.agents = new Map();
    this.graph = null;
    this.graphSig = '';
    this.bubbles = [];
    this.lastPlan = 0;
  }

  rebuildGraph(state) {
    const sig = state.modules.map((m) => `${m.id}${m.buildLeft > 0 ? 'b' : ''}`).join(',');
    if (sig === this.graphSig) return false;
    this.graphSig = sig;
    this.graph = buildNavGraph(state.modules);
    for (const a of this.agents.values()) {
      a.path = [];
      a.targetKey = null;
    }
    return true;
  }

  // Cria e remove personagens conforme a população muda.
  sync(state) {
    this.rebuildGraph(state);
    for (const r of state.residents) {
      let agent = this.agents.get(r.id);
      const visibleNow = r.alive && !r.away;
      const outfit = outfitOf(state, r);
      if (agent && (!visibleNow || agent.outfit !== outfit || agent.age !== r.age)) {
        this.group.remove(agent.ch.root);
        disposeCharacter(agent.ch);
        if (!visibleNow) {
          this.agents.delete(r.id);
          continue;
        }
        const fresh = this.makeCharacter(r, outfit);
        fresh.root.position.copy(agent.ch.root.position);
        fresh.root.rotation.y = agent.ch.root.rotation.y;
        agent.ch = fresh;
        agent.outfit = outfit;
        agent.age = r.age;
        this.group.add(fresh.root);
        continue;
      }
      if (!agent && visibleNow) {
        const ch = this.makeCharacter(r, outfit);
        agent = { id: r.id, ch, outfit, age: r.age, level: 0, path: [], exit: [], targetKey: null, pose: 'idle', face: 0, moving: false, bubble: null, nextChat: 2 + hash01(r.id, 'chat') * 10, talkingTo: null };
        this.agents.set(r.id, agent);
        this.group.add(ch.root);
        agent.needsPlace = true;
      }
    }
  }

  makeCharacter(r, outfit) {
    const ch = createCharacter(r.appearance, outfit, { child: r.age < 14, seed: r.id });
    ch.root.userData.residentId = r.id;
    return ch;
  }

  // Converte um lugar da rotina numa posição concreta no mundo.
  resolve(state, place, r) {
    if (!place || place.kind === 'away') return null;
    const core = state.modules.find((m) => m.type === 'core');
    const modById = (id) => state.modules.find((m) => m.id === id && m.buildLeft === 0);
    const pick = (list, i) => (list && list.length ? list[((i % list.length) + list.length) % list.length] : null);
    const inRoom = (mod, sp, extra = {}) => {
      if (!mod || !sp) return null;
      const approach = roomApproach(mod.level, mod.slot, sp);
      let final = roomToWorld(mod.level, mod.slot, sp.u, sp.v);
      // Deitado, a cabeça vai para o travesseiro (+u); a altura é a do colchão.
      if (sp.pose === 'lie') final = { ...final, y: final.y + (sp.bedLevel ? 1.56 : mod.type === 'clinic' ? 0.5 : 0.46) };
      const f = sp.pose === 'lie' ? Math.PI : sp.face ?? 0;
      const faceWorld = Math.PI / 2 - BAY_ANGLES[mod.slot] - f;
      return { node: `E:${mod.level}:${mod.slot}`, level: mod.level, approach, final, face: faceWorld, pose: sp.pose, ...extra };
    };
    switch (place.kind) {
      case 'bunk': {
        const mod = modById(place.module) || core;
        const spots = roomLayout(mod.type).spots.bunk;
        const index = mod.type === 'core' ? place.index + 1 : place.index;
        return inRoom(mod, pick(spots, index));
      }
      case 'work': {
        const mod = modById(place.module);
        if (!mod) return null;
        return inRoom(mod, pick(roomLayout(mod.type).spots.work, place.index));
      }
      case 'clinic': {
        const mod = modById(place.module);
        if (!mod) return null;
        return inRoom(mod, pick(roomLayout('clinic').spots.beds, place.index - 2));
      }
      case 'dock': {
        const mod = modById(place.module);
        return mod ? inRoom(mod, pick(roomLayout('dock').spots.work, 0)) : null;
      }
      case 'mess':
        return inRoom(core, pick(roomLayout('core').spots.mess, place.index));
      case 'kitchen':
        return inRoom(core, roomLayout('core').spots.kitchen[0]);
      case 'office':
        return inRoom(core, roomLayout('core').spots.office[0]);
      case 'archive':
        return inRoom(core, pick(roomLayout('core').spots.archive, place.index));
      case 'commons': {
        const mod = modById(place.module) || state.modules.find((m) => m.type === 'commons' && m.buildLeft === 0);
        if (!mod) return this.resolve(state, { kind: 'ring', level: 0, angle: place.index }, r);
        return inRoom(mod, pick(roomLayout('commons').spots.leisure, place.index));
      }
      case 'ring': {
        const level = Math.min(place.level, Math.max(...state.modules.map((m) => m.level)));
        const k = ((place.angle % RING_NODES) + RING_NODES) % RING_NODES;
        const a = (k / RING_NODES) * Math.PI * 2 + (hash01(r.id, 'ringoff') - 0.5) * 0.25;
        const rad = RING_R + (hash01(r.id, 'ringr') - 0.5) * 2.2;
        const p = { x: Math.cos(a) * rad, y: floorY(level), z: Math.sin(a) * rad };
        return { node: `R:${level}:${k}`, level, approach: [], final: p, face: null, pose: 'stand' };
      }
      default:
        return null;
    }
  }

  routeTo(agent, state, target) {
    const pts = [];
    for (const p of agent.exit) pts.push(p);
    const start = pts.length ? pts[pts.length - 1] : { x: agent.ch.root.position.x, z: agent.ch.root.position.z, level: agent.level };
    const startRegion = regionAt(this.graph.index, start.level, start.x, start.z, 0);
    const startSlot = startRegion && (startRegion.kind === 'room' || startRegion.kind === 'door') ? startRegion.slot : null;
    const from = nearestNode(this.graph, start.level, start.x, start.z, startSlot);
    const nodes = from && this.graph.nodes.has(target.node) ? shortestPath(this.graph, from, target.node) : null;
    if (nodes) pts.push(...expandPath(this.graph, nodes));
    for (const p of target.approach) pts.push(p);
    pts.push({ ...target.final, level: target.level, final: true });
    agent.path = pts;
    agent.exit = target.approach.length ? target.approach.slice().reverse().map((p) => ({ ...p })) : [];
  }

  teleport(agent, target) {
    const root = agent.ch.root;
    root.position.set(target.final.x, target.final.y, target.final.z);
    agent.level = target.level;
    agent.path = [];
    agent.exit = target.approach.length ? target.approach.slice().reverse().map((p) => ({ ...p })) : [];
    agent.pose = target.pose;
    if (target.face !== null) root.rotation.y = target.face;
    agent.arrived = true;
  }

  // Coloca todo mundo direto no lugar da rotina (início do dia, carregar jogo).
  placeAll(state) {
    this.sync(state);
    for (const agent of this.agents.values()) {
      const r = residentById(state, agent.id);
      const plan = planFor(state, r, state.time.minute);
      const target = plan && this.resolve(state, plan.place, r);
      agent.plan = plan;
      agent.targetKey = placeKey(plan && plan.place);
      if (target) {
        agent.target = target;
        this.teleport(agent, target);
      }
      agent.needsPlace = false;
    }
  }

  update(dt, state, player, camera) {
    const minute = state.time.minute;
    this.lastPlan -= dt;
    const replan = this.lastPlan <= 0;
    if (replan) this.lastPlan = 0.6;
    for (const agent of this.agents.values()) {
      const r = residentById(state, agent.id);
      if (!r || !r.alive || r.away) continue;
      if (agent.needsPlace) {
        const plan = planFor(state, r, minute);
        const target = plan && this.resolve(state, plan.place, r);
        if (target) this.teleport(agent, target);
        agent.plan = plan;
        agent.targetKey = placeKey(plan && plan.place);
        agent.target = target;
        agent.needsPlace = false;
      }
      if (replan && !agent.held) {
        const plan = planFor(state, r, minute);
        const keyNow = placeKey(plan && plan.place);
        if (keyNow !== agent.targetKey) {
          agent.plan = plan;
          agent.targetKey = keyNow;
          const target = plan && this.resolve(state, plan.place, r);
          agent.target = target;
          if (target) {
            this.routeTo(agent, state, target);
            agent.arrived = false;
          }
        }
      }
      this.step(agent, dt, state, player);
    }
    this.updateVisibility(player);
    this.chatter(dt, state, player);
  }

  step(agent, dt, state, player) {
    const root = agent.ch.root;
    let anim = agent.arrived ? poseAnim(agent) : 'idle';
    if (agent.held) {
      anim = agent.heldAnim || 'talk';
      if (agent.faceTarget) {
        const dx = agent.faceTarget.x - root.position.x;
        const dz = agent.faceTarget.z - root.position.z;
        root.rotation.y = turnToward(root.rotation.y, Math.atan2(dx, dz), dt * 6);
      }
    } else if (agent.path.length) {
      const next = agent.path[0];
      const dx = next.x - root.position.x;
      const dy = next.y - root.position.y;
      const dz = next.z - root.position.z;
      const dist = Math.hypot(dx, dz);
      const speed = WALK_SPEED * (agent.hurry ? 1.6 : 1);
      // Gente no caminho: diminui o passo em vez de atravessar.
      const blocked = player && player.level === agent.level && Math.hypot(player.position.x - root.position.x, player.position.z - root.position.z) < 0.55;
      if (dist < 0.08 || dist < speed * dt) {
        root.position.set(next.x, next.y, next.z);
        agent.level = next.level ?? agent.level;
        agent.path.shift();
        if (agent.path.length === 0) {
          agent.arrived = true;
          if (agent.target && agent.target.face !== null) agent.settleFace = agent.target.face;
        }
      } else if (!blocked) {
        const k = (speed * dt) / dist;
        root.position.x += dx * k;
        root.position.z += dz * k;
        root.position.y += dy * Math.min(1, (speed * dt) / Math.max(dist, 0.001));
        root.rotation.y = turnToward(root.rotation.y, Math.atan2(dx, dz), dt * 8);
        if (next.level !== undefined && !next.onStair) agent.level = next.level;
        else agent.level = Math.round(-root.position.y / 5);
      }
      anim = blocked ? 'idle' : agent.hurry ? 'run' : 'walk';
    } else if (agent.settleFace !== undefined) {
      root.rotation.y = turnToward(root.rotation.y, agent.settleFace, dt * 5);
    }
    if (agent.bubble && agent.bubble.until > performance.now() && agent.arrived && anim !== 'lie' && anim !== 'sit') anim = 'talk';
    if (root.visible) {
      animateCharacter(agent.ch, dt, anim);
      // Quem está parado acompanha o jogador com o olhar.
      if (player && anim !== 'lie' && agent.level === player.level) {
        const dx = player.position.x - root.position.x;
        const dz = player.position.z - root.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 3.2 && d > 0.3) {
          let rel = Math.atan2(dx, dz) - root.rotation.y;
          while (rel > Math.PI) rel -= Math.PI * 2;
          while (rel < -Math.PI) rel += Math.PI * 2;
          if (Math.abs(rel) < 2.0) agent.ch.head.rotation.y = Math.max(-1, Math.min(1, rel)) * 0.85;
        }
      }
    }
  }

  updateVisibility(player) {
    for (const agent of this.agents.values()) {
      const dl = Math.abs(agent.level - player.level);
      agent.ch.root.visible = dl <= 1;
    }
  }

  // Conversas espontâneas entre moradores próximos: às vezes sozinho,
  // às vezes em dupla, com pergunta e resposta.
  chatter(dt, state, player) {
    const now = performance.now();
    this.bubbles = this.bubbles.filter((b) => b.until > now);
    for (const agent of this.agents.values()) {
      if (agent.pending && agent.pending.at <= now) {
        agent.bubble = { text: agent.pending.text, until: now + 4200 };
        this.bubbles.push({ agent, text: agent.pending.text, until: now + 4200 });
        agent.pending = null;
      }
    }
    for (const agent of this.agents.values()) {
      agent.nextChat -= dt;
      if (agent.nextChat > 0 || !agent.arrived || agent.held || agent.pending) continue;
      agent.nextChat = 9 + hash01(agent.id, now) * 14;
      if (agent.level !== player.level) continue;
      const pos = agent.ch.root.position;
      const dPlayer = Math.hypot(pos.x - player.position.x, pos.z - player.position.z);
      if (dPlayer > 14 || this.bubbles.length >= 4) continue;
      const plan = agent.plan;
      if (!plan || plan.activity === 'sleep' || plan.activity === 'sick' || plan.activity === 'detained') continue;
      const r = residentById(state, agent.id);
      const partner = this.partnerFor(agent, state);
      if (partner && hash01(agent.id, partner.id, Math.floor(now / 1000)) < 0.65) {
        const o = residentById(state, partner.id);
        const pair = exchangeFor(state, r, o, now);
        if (pair) {
          this.say(agent, pair[0], now);
          partner.pending = { text: pair[1], at: now + 2300 };
          partner.nextChat = 12;
          const face = (a, b) => Math.atan2(b.ch.root.position.x - a.ch.root.position.x, b.ch.root.position.z - a.ch.root.position.z);
          if (agent.target && agent.target.pose !== 'lie') agent.settleFace = face(agent, partner);
          if (partner.target && partner.target.pose !== 'lie' && partner.target.pose !== 'sit') partner.settleFace = face(partner, agent);
          continue;
        }
      }
      const line = barkFor(state, r, plan, dPlayer < 3.5, now);
      if (line) this.say(agent, line, now);
    }
  }

  say(agent, text, now) {
    agent.bubble = { text, until: now + 4200 };
    this.bubbles.push({ agent, text, until: now + 4200 });
  }

  partnerFor(agent, state) {
    const p = agent.ch.root.position;
    let best = null;
    let bestD = 2.6;
    for (const other of this.agents.values()) {
      if (other === agent || !other.arrived || other.held || other.pending || other.level !== agent.level) continue;
      if (!other.plan || other.plan.activity === 'sleep' || other.plan.activity === 'sick') continue;
      const d = other.ch.root.position.distanceTo(p);
      if (d < bestD) {
        bestD = d;
        best = other;
      }
    }
    void state;
    return best;
  }

  // Segura um morador parado (por exemplo, numa conversa com o jogador).
  hold(id, faceTarget, anim = 'talk') {
    const agent = this.agents.get(id);
    if (!agent) return;
    agent.held = true;
    agent.heldAnim = anim;
    agent.faceTarget = faceTarget;
  }

  release(id) {
    const agent = this.agents.get(id);
    if (!agent) return;
    agent.held = false;
    agent.faceTarget = null;
    agent.targetKey = null;
  }

  // Faz um morador ir até o jogador (eventos trazidos por alguém).
  summon(id, player) {
    const agent = this.agents.get(id);
    if (!agent) return false;
    const root = agent.ch.root;
    const angle = Math.random() * Math.PI * 2;
    root.position.set(player.position.x + Math.cos(angle) * 1.4, player.position.y, player.position.z + Math.sin(angle) * 1.4);
    agent.level = player.level;
    agent.path = [];
    agent.exit = [];
    agent.arrived = true;
    return true;
  }

  nearest(position, level, maxDist = 2.2) {
    let best = null;
    let bestD = maxDist;
    for (const agent of this.agents.values()) {
      if (!agent.ch.root.visible || agent.level !== level) continue;
      const p = agent.ch.root.position;
      const d = Math.hypot(p.x - position.x, p.z - position.z) + Math.abs(p.y - position.y) * 0.5;
      if (d < bestD) {
        bestD = d;
        best = agent;
      }
    }
    return best;
  }

  get(id) {
    return this.agents.get(id) || null;
  }
}

function turnToward(current, target, k) {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return current + d * Math.min(1, k);
}

function poseAnim(agent) {
  const plan = agent.plan;
  const pose = agent.target ? agent.target.pose : 'stand';
  if (pose === 'lie') return 'lie';
  if (pose === 'sit') return 'sit';
  if (!plan) return 'idle';
  if (plan.activity === 'work' || plan.activity === 'repair') return 'work';
  if (plan.activity === 'teach') return 'talk';
  return 'idle';
}

// ---------------------------------------------------------------------------
// Falas soltas pelos corredores

const COLONY_LINES = {
  lowOxygen: ['O ar está pesado hoje.', 'Você sentiu? Respirar está difícil.', 'Dizem que o eletrolisador não dá conta.'],
  lowFood: ['A porção de hoje estava menor.', 'Alga de novo, e pouca.', 'Meu estômago ronca mais alto que a turbina.'],
  hull: ['Ouviu o casco estalar de noite?', 'Tem goteira no meu beliche.', 'Se o casco ceder, a gente nem percebe.'],
  blackout: ['As luzes piscaram de novo.', 'Bateria no vermelho, ouvi dizer.'],
  good: ['Dia tranquilo.', 'A Dona Zu caprichou hoje.', 'Até que o casco está quieto.', 'Bom ver as luzes do Átrio acesas.'],
};

const ACTIVITY_LINES = {
  eat: ['Passa o sal. Ah, é. Não tem sal.', 'Esse krill está mais crocante hoje.', 'Quem fez a escala da limpeza?', 'Dona Zu, tem mais?'],
  work: ['Mais uma válvula, mais um dia.', 'Me passa a chave catorze.', 'Esse painel não para de piscar.', 'Quem mexeu na minha caixa de ferramentas?'],
  leisure: ['Viu o cardume ontem?', 'Joga uma de dominó?', 'Sonhei com chuva de novo.', 'Meu filho perguntou o que é vento.'],
  play: ['Pega-pega! Tá com você!', 'Eu vi um peixe-lanterna!', 'Aposto que chego na escada primeiro!'],
  class: ['Professor, a luz é líquida?', 'Por que a gente não pode subir?'],
  patrol: ['Tudo em ordem por aqui.', 'Circulando, pessoal.'],
  gather: ['Que pena. Era uma pessoa boa.', 'Que dia.', 'Vem gente lá de baixo também.'],
};

const EXCHANGES = [
  ['Viu o cardume ontem?', 'Vi! Parecia chuva de prata.'],
  ['Você acha que o casco aguenta mais dez anos?', 'Tem que aguentar. Não tem outro.'],
  ['O que tem de janta hoje?', 'Adivinha. Começa com "al" e termina com "ga".'],
  ['Dizem que a turbina vai parar de novo.', 'Dizem muita coisa. Ela gira desde antes de eu nascer.'],
  ['Sonhei com o céu de novo.', 'E como era dessa vez?'],
  ['Minha filha perguntou o que é vento.', 'E o que você respondeu?'],
  ['Quanto tempo você acha que a gente ainda fica aqui?', 'A vida inteira. A minha, pelo menos.'],
  ['Me empresta a chave catorze?', 'De novo? Você nunca devolve.'],
  ['A Dona Zu tá de bom humor hoje.', 'Então hoje tem krill com casca.'],
  ['Você conhecia o Bastos?', 'Todo mundo conhecia. Era teimoso feito válvula emperrada.'],
  ['Ouvi dizer que tem uma baleia morta lá fora.', 'O Ícaro diz que os bichos comem ela faz meses.'],
  ['Vai no Átrio mais tarde?', 'Se a Marta não inventar ronda.'],
  ['Você acredita nos Fundadores?', 'Acredito que eles estavam com medo. Como a gente.'],
  ['Tá sentindo esse cheiro de óleo?', 'É o cheiro de casa.'],
  ['Me ensina a jogar dominó direito?', 'Primeiro aprende a perder.'],
  ['Você já pensou em sair pela eclusa?', 'Todo dia. E todo dia eu fico.'],
];

function exchangeFor(state, a, b, salt) {
  const contextual = [];
  if (state.resources.oxygen < 40) contextual.push(['O ar está pesado, não está?', 'Respira devagar. Ajuda.']);
  if (state.resources.food < 40) contextual.push(['Mais um dia de meia porção.', 'Meu estômago já desistiu de reclamar.']);
  if (state.hull < 50) contextual.push(['Ouviu o estalo de madrugada?', 'Ouvi. Não dormi mais.']);
  const griefB = b.memories.find((m) => m.kind === 'grief' && state.cycle - m.day <= 5);
  if (griefB) {
    const lost = residentById(state, griefB.about);
    if (lost) contextual.push([`Sinto muito ${lost.g === 'f' ? 'pela' : 'pelo'} ${displayName(lost)}.`, 'Obrigad' + gw(b, 'a', 'o', 'e') + '. Ainda não caiu a ficha.']);
  }
  if (state.rumors.some((x) => x.kind === 'secret' && !x.public && x.knownBy.includes(a.id))) contextual.push(['Você ouviu o que dizem do Conselho?', '(Olha em volta.) Fala baixo.']);
  if ((a.bonds[b.id] || 0) <= -30) contextual.push(['(Resmunga alguma coisa.)', 'O que foi que você disse?']);
  if (a.kin[b.id] === 'child') contextual.push(['Já comeu direito hoje?', 'Já! Duas vezes!']);
  const title = reputationTitle(state);
  if (title) contextual.push([`Viu como chamam o novo Superintendente? "${title.title}".`, 'Combina, não combina?']);
  const pool = contextual.length && hash01(a.id, b.id, salt) < 0.6 ? contextual : EXCHANGES;
  return hashPick(pool, a.id, b.id, Math.floor(salt / 5000));
}

function barkFor(state, r, plan, nearPlayer, salt) {
  const voice = r.key ? VOICES[r.key] : null;
  const roll = hash01(r.id, salt);
  if (nearPlayer && roll < 0.35) {
    const title = reputationTitle(state);
    const name = title && hash01(r.id, 'tt') < 0.5 ? title.title : 'Superintendente';
    if (r.opinion >= 70) return hashPick([`Olá, ${name}!`, `Bom te ver, ${name}.`, 'Precisando de alguma coisa?'], r.id, salt);
    if (r.opinion < 30) return hashPick(['(Desvia o olhar.)', 'Hm.', `Lá vem ${forms('{a|o|e}', state.player.g)} ${name}...`], r.id, salt);
    return hashPick(['Superintendente.', '(Acena com a cabeça.)', `Bom dia, ${name}.`], r.id, salt);
  }
  if (voice && voice.barks && roll < 0.6) return hashPick(voice.barks, r.id, salt, 'b');
  const grief = r.memories.find((m) => m.kind === 'grief' && state.cycle - m.day <= 3);
  if (grief && roll < 0.8) {
    const who = residentById(state, grief.about);
    return who ? `Não consigo parar de pensar ${who.g === 'f' ? 'na' : 'no'} ${displayName(who)}.` : 'Que semana difícil.';
  }
  if (state.resources.oxygen < 40 && roll < 0.7) return hashPick(COLONY_LINES.lowOxygen, r.id, salt);
  if (state.resources.food < 40 && roll < 0.7) return hashPick(COLONY_LINES.lowFood, r.id, salt);
  if (state.hull < 50 && roll < 0.7) return hashPick(COLONY_LINES.hull, r.id, salt);
  const known = state.rumors.filter((x) => x.knownBy.includes(r.id) && x.kind !== 'secret');
  if (known.length && roll < 0.5 && r.personality.gossip > 0.3) return hashPick(known, r.id, salt).text;
  const act = ACTIVITY_LINES[plan.activity];
  if (act) return hashPick(act, r.id, salt);
  if (r.mood < 30) return hashPick(['Não aguento mais esse lugar.', 'Tanto faz.', `Estou cansad${gw(r, 'a', 'o', 'e')}.`], r.id, salt);
  return hashPick(COLONY_LINES.good, r.id, salt);
}

export function moduleLabel(type) {
  return MODULES[type].name;
}
