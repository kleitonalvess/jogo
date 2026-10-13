// Testes de regressão de balanceamento. Os limites são largos de propósito:
// servem para avisar quando uma mudança de números quebra o jogo, não para
// fixar uma taxa exata de sobrevivência.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runBot } from '../scripts/simulate.js';

const SEEDS = 40;
const DAYS = 60;

function play(strategy) {
  const games = [];
  for (let seed = 1; seed <= SEEDS; seed++) games.push(runBot(strategy, seed, DAYS));
  return games;
}

test('ficar parado leva a colônia à ruína', () => {
  const games = play('passive');
  const lost = games.filter((s) => s.status === 'lost').length;
  assert.ok(lost >= SEEDS * 0.9, `derrotas: ${lost}`);
});

test('uma estratégia simples e consistente mantém a colônia viva', () => {
  const games = play('steady');
  const alive = games.filter((s) => s.status === 'playing').length;
  assert.ok(alive >= SEEDS * 0.8, `sobreviventes: ${alive}`);
});
