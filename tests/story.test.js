import { test } from 'node:test';
import assert from 'node:assert/strict';

import { chooseOption, giveGift, jobAcceptance, openConversation } from '../src/engine/dialogue.js';
import { canAfford, currentEvent, eventDef, giveItem, hasItem, resolveEvent } from '../src/engine/game.js';
import { residentByKey } from '../src/engine/people/population.js';
import { objectives } from '../src/engine/quests.js';
import { availableItems, canSleep, endDay, interact, leaksToday, patchLeak, pickUp, useAirCache, createWorld } from '../src/engine/world.js';

function world(seed = 3) {
  const s = createWorld(seed);
  s.eventQueue = [];
  return s;
}

function talk(s, key, labelStart) {
  const r = residentByKey(s, key);
  let conv = openConversation(s, r.id);
  const option = conv.options.find((o) => o.label.startsWith(labelStart));
  assert.ok(option, `opção "${labelStart}" com ${key}. Disponíveis: ${conv.options.map((o) => o.label).join(' | ')}`);
  conv = chooseOption(s, conv, option.id);
  return conv;
}

function resolveAll(s) {
  for (let guard = 0; currentEvent(s) && guard < 10; guard++) {
    const def = eventDef(currentEvent(s));
    const i = def.choices.findIndex((c) => canAfford(s, c.effects));
    if (i < 0 || !resolveEvent(s, i).ok) s.eventQueue.shift();
  }
}

function sleepThrough(s) {
  resolveAll(s);
  s.time.minute = 22 * 60;
  const result = endDay(s);
  assert.ok(result.ok, result.error);
}

test('conversa: saudação, apresentação e opções básicas', () => {
  const s = world();
  const r = residentByKey(s, 'davi');
  const conv = openConversation(s, r.id);
  assert.ok(conv.lines.length >= 2, 'saudação e apresentação no primeiro encontro');
  assert.ok(conv.lines.every((l) => !/[{}<>]/.test(l.text)), 'modelos de concordância resolvidos');
  const ids = conv.options.map((o) => o.id);
  for (const id of ['how', 'about', 'gossip', 'jobs', 'bye']) assert.ok(ids.includes(id), id);
  const next = chooseOption(s, conv, 'about');
  assert.ok(next.lines.at(-1).text.includes('turbinas'));
  assert.equal(s.player.known[r.id].about, 1);
});

test('presente favorito rende a reação escrita para o personagem', () => {
  const s = world();
  const nina = residentByKey(s, 'nina');
  giveItem(s, 'brinquedo');
  giveItem(s, 'foto-ceu');
  const before = nina.opinion;
  const res = giveGift(s, nina, 'foto-ceu');
  assert.ok(res.text.includes('CÉU'));
  assert.ok(nina.opinion > before + 15);
});

test('aceitar mudar de função depende de aptidão, opinião e teimosia', () => {
  const s = world();
  const lucas = residentByKey(s, 'lucas');
  const water = s.modules.find((m) => m.type === 'water');
  const workshop = s.modules.find((m) => m.type === 'workshop');
  assert.ok(jobAcceptance(s, lucas, water.id) >= 0);
  lucas.opinion = 95;
  const high = jobAcceptance(s, lucas, workshop.id);
  lucas.opinion = 5;
  assert.ok(jobAcceptance(s, lucas, workshop.id) < high);
});

test('missão principal: Augusto, o Terminal e o caderno de Teodoro', () => {
  const s = world();
  assert.equal(s.quests.verdade.stage, 'chegada');
  assert.ok(objectives(s)[0].text.includes('Augusto'));
  talk(s, 'augusto', 'Por onde');
  assert.equal(s.quests.verdade.stage, 'terminal');
  interact(s, 'terminal');
  assert.equal(s.quests.verdade.stage, 'teodoro');
  talk(s, 'teodoro', 'Augusto disse');
  assert.equal(s.quests.verdade.stage, 'busca');
  assert.equal(currentEvent(s).id, 'fragment');
  resolveEvent(s, 1);
  assert.equal(s.secrets, 1);
  const secret = s.rumors.find((r) => r.kind === 'secret');
  assert.ok(secret.knownBy.includes(residentByKey(s, 'teodoro').id), 'Teodoro sabe do caderno');
  talk(s, 'teodoro', 'Onde eu procuro');
  assert.ok(s.quests.verdade.data.hints.includes('zenith'));
});

test('documentos lá fora: apanhar abre a decisão de revelar ou lacrar', () => {
  const s = world();
  const res = pickUp(s, 'buoy');
  assert.ok(res.ok);
  assert.equal(res.fragment, 'buoy');
  assert.equal(currentEvent(s).id, 'fragment');
  assert.equal(pickUp(s, 'buoy').ok, false);
});

test('sucata reaparece depois de alguns dias; estações de ar recarregam uma vez por dia', () => {
  const s = world();
  assert.ok(pickUp(s, 'sucata-0').ok);
  assert.equal(s.player.inventory.sucata, 2);
  assert.ok(!availableItems(s, 'exterior').some((w) => w.id === 'sucata-0'));
  for (let i = 0; i < 3; i++) sleepThrough(s);
  assert.ok(availableItems(s, 'exterior').some((w) => w.id === 'sucata-0'));
  s.player.suitTank = 10;
  assert.ok(useAirCache(s, 'air-wreck').ok);
  assert.equal(s.player.suitTank, s.player.suitTankMax);
  assert.equal(useAirCache(s, 'air-wreck').ok, false);
});

test('O Pedido de Irene: traje de Ícaro, partida à noite e Nina com a tia', () => {
  const s = world();
  for (let i = 0; i < 2; i++) sleepThrough(s);
  assert.equal(s.quests.irene.stage, 'pedido');
  const conv = talk(s, 'irene', 'Você queria');
  const choice = conv.options.find((o) => o.label.startsWith('Vou conseguir'));
  chooseOption(s, conv, choice.id);
  assert.equal(s.quests.irene.stage, 'traje');
  residentByKey(s, 'icaro').opinion = 60;
  talk(s, 'icaro', 'Preciso de um traje');
  assert.ok(hasItem(s, 'traje-velho'));
  talk(s, 'irene', 'Consegui o traje');
  sleepThrough(s);
  const irene = residentByKey(s, 'irene');
  assert.equal(irene.alive, false);
  assert.equal(irene.deathCause, 'ascension');
  assert.equal(s.quests.irene.outcome, 'subiu');
  assert.equal(residentByKey(s, 'nina').home, residentByKey(s, 'marta').home);
});

test('o cofre do Conselho: com o código, a ata; sem, nada', () => {
  const s = world();
  assert.equal(interact(s, 'cofre').ok, false);
  giveItem(s, 'codigo-cofre');
  s.time.minute = 23 * 60;
  const res = interact(s, 'cofre');
  assert.ok(res.ok);
  assert.ok(s.found.includes('minutes'));
  assert.equal(s.quests.augusto.stage, 'confronto');
});

test('Clara morre de velhice no dia 24, ou dez dias depois com o remédio de Helena', () => {
  const a = world();
  const b = world();
  b.flags.medicine = true;
  for (let i = 0; i < 23; i++) {
    sleepThrough(a);
    sleepThrough(b);
    if (a.status !== 'playing' || b.status !== 'playing') return;
  }
  assert.equal(residentByKey(a, 'clara').alive, false);
  assert.equal(residentByKey(b, 'clara').alive, true);
});

test('dormir só à noite; vazamentos aparecem com o casco fraco e custam material', () => {
  const s = world();
  s.time.minute = 10 * 60;
  assert.equal(canSleep(s).ok, false);
  s.time.minute = 21 * 60;
  assert.ok(canSleep(s).ok);
  s.hull = 50;
  const leaks = leaksToday(s);
  assert.ok(leaks.length >= 2);
  const mats = s.resources.materials;
  assert.ok(patchLeak(s, leaks[0].id).ok);
  assert.equal(s.resources.materials, mats - 2);
  assert.equal(leaksToday(s).length, leaks.length - 1);
});
