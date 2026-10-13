// Itens que o jogador carrega. Relíquias vêm do lado de fora e podem ser
// dadas de presente; itens de missão destravam conversas.

export const ITEMS = {
  sucata: {
    name: 'Sucata',
    desc: 'Metal e polímero aproveitáveis. Entregue na eclusa vira material de construção.',
    category: 'material',
    stack: true,
  },
  racao: {
    name: 'Ração extra',
    desc: 'Um tablete de alga prensada com krill. Pouca coisa, mas aqui embaixo é um presente.',
    category: 'food',
    gift: true,
    stack: true,
  },
  'foto-ceu': {
    name: 'Fotografia do céu',
    desc: 'Uma foto desbotada: céu azul, nuvens brancas, nenhuma água por cima.',
    category: 'relic',
    gift: true,
  },
  'caixa-musica': {
    name: 'Caixinha de música',
    desc: 'Ainda toca, se você girar a manivela com paciência. Uma valsa.',
    category: 'music',
    gift: true,
  },
  moeda: {
    name: 'Moeda antiga',
    desc: 'Uma moeda da superfície, verde de oxidação. Um rosto de perfil que ninguém reconhece.',
    category: 'relic',
    gift: true,
  },
  concha: {
    name: 'Concha espiral',
    desc: 'Uma concha perfeita, branca por dentro, encontrada perto da baleia.',
    category: 'relic',
    gift: true,
  },
  livro: {
    name: 'Livro inchado',
    desc: 'Um livro de poemas. A água apagou metade, mas dá para ler um sobre a chuva.',
    category: 'book',
    gift: true,
  },
  brinquedo: {
    name: 'Robô de lata',
    desc: 'Um brinquedo de corda. Uma perna não mexe, mas os olhos ainda brilham.',
    category: 'relic',
    gift: true,
  },
  'oculos-sol': {
    name: 'Óculos escuros',
    desc: 'Óculos para proteger os olhos do sol. Aqui embaixo, a coisa mais inútil do mundo.',
    category: 'relic',
    gift: true,
  },
  semente: {
    name: 'Semente de girassol',
    desc: 'Um saquinho lacrado com três sementes. A etiqueta diz "girassol gigante".',
    category: 'relic',
    gift: true,
  },
  bussola: {
    name: 'Bússola',
    desc: 'A agulha ainda aponta para o norte. Aqui embaixo, norte é só uma direção entre tantas.',
    category: 'relic',
    gift: true,
  },
  'dente-baleia': {
    name: 'Dente de baleia',
    desc: 'Do esqueleto perto dos destroços. Pesado e liso como pedra.',
    category: 'relic',
    gift: true,
  },
  pimenta: {
    name: 'Lata de pimenta',
    desc: 'Uma lata lacrada de pimenta seca. Validade vencida há décadas, cheiro intacto.',
    category: 'food',
    gift: true,
  },
  'placa-ruth': {
    name: 'Placa de identificação',
    desc: 'Uma placa de metal gravada: R. AMARAL, ESCAFANDRISTA, TIPO SANGUÍNEO O+.',
    category: 'quest',
  },
  'alga-vermelha': {
    name: 'Alga vermelha',
    desc: 'Cresce perto das fontes termais. Helena diz que dá para fazer remédio dela.',
    category: 'quest',
    stack: true,
  },
  'lata-tinta': {
    name: 'Lata de tinta de casco',
    desc: 'Tinta anticorrosiva, quase vazia. Tem graxa da turbina no fundo.',
    category: 'quest',
  },
  'codigo-cofre': {
    name: 'Código do cofre',
    desc: 'Seis números escritos com letra trêmula no verso de uma receita.',
    category: 'quest',
  },
};

export const GIFT_REACTIONS = {
  favorite: 18,
  liked: 9,
  neutral: 3,
};

export function giftValue(resident, itemId) {
  const item = ITEMS[itemId];
  if (!item || !item.gift) return 0;
  if (resident.favorite === itemId) return GIFT_REACTIONS.favorite;
  if (resident.personality.likes.includes(item.category)) return GIFT_REACTIONS.liked;
  return GIFT_REACTIONS.neutral;
}
