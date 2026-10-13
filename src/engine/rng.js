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

export function shuffle(state, list) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random(state) * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function weightedPick(state, items, weightOf) {
  const total = items.reduce((sum, it) => sum + Math.max(0, weightOf(it)), 0);
  if (total <= 0) return items[0];
  let roll = random(state) * total;
  for (const it of items) {
    roll -= Math.max(0, weightOf(it));
    if (roll <= 0) return it;
  }
  return items[items.length - 1];
}

// Valor estável em [0, 1) a partir de números inteiros, sem consumir o
// gerador principal. Serve para variações que precisam ser recalculadas
// (rotina diária, aparência, escolha de frases) sem alterar o estado.
export function hash01(...values) {
  let h = 0x811c9dc5;
  for (const v of values) {
    let n = typeof v === 'number' ? Math.floor(v) : stringHash(String(v));
    for (let i = 0; i < 4; i++) {
      h ^= n & 0xff;
      h = Math.imul(h, 0x01000193);
      n >>>= 8;
    }
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export function hashPick(list, ...values) {
  return list[Math.floor(hash01(...values) * list.length)];
}

function stringHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h >>> 0;
}
