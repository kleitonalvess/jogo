import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createGame, endCycle } from '../src/engine/game.js';
import { residentByKey, living } from '../src/engine/people/population.js';
import { planFor } from '../src/engine/people/schedule.js';
import {
  adjustReputation,
  birth,
  couplesForBirth,
  createRumor,
  recordDeath,
  reputationTitle,
  rumorKnownShare,
  scheduleGathering,
  spreadRumors,
} from '../src/engine/people/social.js';

function fresh(seed = 11) {
  const s = createGame(seed);
  s.eventQueue = [];
  return s;
}

test('nascimento cria uma criança com o sobrenome da família e laços com os pais', () => {
  const s = fresh();
  const [a, b] = couplesForBirth(s)[0];
  const child = birth(s, [a, b]);
  assert.equal(child.last, a.last);
  assert.equal(child.age, 0);
  assert.equal(child.kin[a.id], 'parent');
  assert.equal(a.kin[child.id], 'child');
  assert.ok(a.memories.some((m) => m.kind === 'birth'));
});

test('a morte de alguém deixa luto na família e marca um velório', () => {
  const s = fresh();
  const irene = residentByKey(s, 'irene');
  const nina = residentByKey(s, 'nina');
  const moodBefore = nina.mood;
  recordDeath(s, irene, 'oxygen', { blame: 3 });
  assert.equal(irene.alive, false);
  assert.ok(nina.mood < moodBefore);
  assert.ok(nina.memories.some((m) => m.kind === 'grief' && m.about === irene.id));
  assert.ok(nina.memories[0].text.includes('a mãe'));
  assert.ok(s.gatherings.some((g) => g.kind === 'funeral' && g.about === irene.id));
});

test('segredos se espalham pelos laços e vazam ao chegar a 30% dos adultos', () => {
  const s = fresh();
  const zu = residentByKey(s, 'zuleica');
  s.secrets = 1;
  const rumor = createRumor(s, { kind: 'secret', label: 'um teste', text: 'Teste.', knownBy: [zu.id] });
  let leakedDay = null;
  for (let d = 0; d < 60 && !rumor.public; d++) {
    spreadRumors(s);
    s.cycle += 1;
    if (rumor.public) leakedDay = d;
  }
  assert.ok(rumor.public, 'o segredo acaba vazando');
  assert.ok(leakedDay >= 3, `não vaza no primeiro dia (vazou no dia ${leakedDay})`);
  assert.equal(s.stats.leaks, 1);
  assert.equal(rumorKnownShare(s, rumor), 1);
});

test('quem prometeu silêncio não repassa o segredo', () => {
  const s = fresh();
  const marta = residentByKey(s, 'marta');
  const rumor = createRumor(s, { kind: 'secret', label: 'x', text: 'x', knownBy: [marta.id] });
  rumor.silenced = [marta.id];
  for (let d = 0; d < 20; d++) spreadRumors(s);
  assert.deepEqual(rumor.knownBy, [marta.id]);
});

test('a reputação gera títulos pelos quais os moradores chamam você', () => {
  const s = fresh();
  assert.equal(reputationTitle(s), null);
  adjustReputation(s, { truth: 40, mercy: 40 });
  assert.equal(reputationTitle(s).title, 'Farol');
  adjustReputation(s, { truth: -90, mercy: -90 });
  assert.equal(reputationTitle(s).title, 'Carcereira');
  s.player.g = 'm';
  assert.equal(reputationTitle(s).title, 'Carcereiro');
});

test('rotina: de madrugada todos dormem, de manhã cada um vai para o seu lugar', () => {
  const s = fresh();
  for (const r of living(s)) {
    const plan = planFor(s, r, 3 * 60);
    assert.equal(plan.activity, 'sleep', `${r.first} dorme às 3h`);
    assert.equal(plan.place.module, r.home);
  }
  const irene = residentByKey(s, 'irene');
  assert.equal(planFor(s, irene, 9 * 60).activity, 'work');
  assert.equal(planFor(s, irene, 9 * 60).place.module, irene.job);
  assert.equal(planFor(s, residentByKey(s, 'nina'), 9 * 60).activity, 'class');
  assert.equal(planFor(s, residentByKey(s, 'teodoro'), 9 * 60).activity, 'teach');
  assert.equal(planFor(s, residentByKey(s, 'zuleica'), 10 * 60).place.kind, 'kitchen');
  assert.equal(planFor(s, residentByKey(s, 'augusto'), 15 * 60).place.kind, 'office');
});

test('reuniões mudam a rotina: um velório reúne a família', () => {
  const s = fresh();
  const irene = residentByKey(s, 'irene');
  scheduleGathering(s, { kind: 'funeral', about: irene.id, day: s.cycle, start: 18 * 60, end: 19 * 60, place: 'commons' });
  const nina = residentByKey(s, 'nina');
  assert.equal(planFor(s, nina, 18 * 60 + 30).activity, 'gather');
  assert.equal(planFor(s, nina, 17 * 60).activity === 'gather', false);
});

test('a rotina é estável: mesmo dia, mesma resposta', () => {
  const s = fresh();
  const r = living(s)[20];
  assert.deepEqual(planFor(s, r, 20 * 60), planFor(s, r, 20 * 60));
  endCycle(s);
  assert.ok(planFor(s, r, 3 * 60));
});
