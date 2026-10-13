// Testes de regressão de balanceamento. Os limites são largos de propósito:
// servem para avisar quando uma mudança de números quebra o jogo, não para
// fixar uma taxa exata de vitória.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runBot } from '../scripts/simulate.js';

const SEEDS = 100;

function play(strategy) {
  const games = [];
  for (let seed = 1; seed <= SEEDS; seed++) games.push(runBot(strategy, seed, 80));
  return games;
}

test('ficar parado não vence e quase sempre perde', () => {
  const games = play('passive');
  assert.equal(games.filter((s) => s.status === 'won').length, 0);
  assert.ok(games.filter((s) => s.status === 'lost').length >= SEEDS * 0.7);
});

test('uma estratégia simples e consistente consegue vencer', () => {
  const games = play('steady');
  const won = games.filter((s) => s.status === 'won').length;
  const lost = games.filter((s) => s.status === 'lost').length;
  assert.ok(won >= SEEDS * 0.4, `vitórias: ${won}`);
  assert.ok(lost <= SEEDS * 0.2, `derrotas: ${lost}`);
});
