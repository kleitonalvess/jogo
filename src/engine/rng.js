// Gerador pseudoaleatório determinístico (mulberry32).
// O estado do gerador fica dentro do próprio estado do jogo, então
// salvar/carregar e reproduzir partidas a partir de uma semente funciona.

export function createSeed() {
  return Math.floor(Math.random() * 2 ** 32) >>> 0;
}

export function random(state) {
  let t = (state.rng = (state.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randInt(state, min, max) {
  return min + Math.floor(random(state) * (max - min + 1));
}

export function chance(state, p) {
  return random(state) < p;
}

export function pick(state, list) {
  return list[Math.floor(random(state) * list.length)];
}
