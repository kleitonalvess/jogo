// Dados de balanceamento da economia. Todos os números ajustáveis ficam aqui.

export const LEVELS = 6;
export const SLOTS_PER_LEVEL = 4;
export const TOP_DEPTH_M = 160;
export const DEPTH_PER_LEVEL_M = 40;
export const SEABED_DEPTH_M = 420;

export const FRAGMENTS_TO_WIN = 5;

export const START = {
  hull: 84,
  maintenance: 2,
  resources: { oxygen: 70, water: 80, food: 90, materials: 100, energy: 30 },
  minute: 7 * 60,
};

// Consumo diário por pessoa na base (moradores e o jogador).
export const UPKEEP = { oxygen: 1, water: 1, food: 1 };

export const WORK_AGE = [14, 69];

export const HULL_WEAR_BASE = 0.5;
export const HULL_WEAR_PER_MODULE = 0.12;
export const HULL_WEAR_PER_LEVEL = 0.08;
// Fadiga do metal: o desgaste cresce com o tempo (+0,5% a cada dia).
export const HULL_FATIGUE_PER_CYCLE = 0.005;
export const REPAIR_PER_WORKER = 1.5;
export const REPAIR_PER_MATERIAL = 1.5;

export const BASE_BATTERY = 30;
export const APTITUDE_BONUS = 1.15;

export const DECREE_CHANGE_TRUST = 2;
export const BIRTH_CYCLES = 5;
export const EVENT_CHANCE = 0.4;
export const EVENT_COOLDOWN = 10;

// Revolta: quando esta fração dos adultos perde a fé no Conselho.
export const REVOLT_SHARE = 0.55;
export const REVOLT_OPINION = 20;

export const EXPEDITION_MAX_TEAM = 4;
export const EXPEDITION_SUPPLY = { oxygen: 3, food: 1 }; // por membro, por dia

export const RESOURCES = {
  oxygen: { label: 'Oxigênio', code: 'O₂' },
  water: { label: 'Água', code: 'H₂O' },
  food: { label: 'Comida', code: 'ALG' },
  materials: { label: 'Materiais', code: 'MAT' },
  energy: { label: 'Energia', code: 'kW' },
};

// category: life | energy | habitat | industry | social | care
// trade: a área de aptidão que rende bônus a quem trabalha no módulo.
export const MODULES = {
  core: {
    name: 'Núcleo do Conselho',
    code: 'NÚC',
    category: 'habitat',
    desc: 'Sede do Conselho, refeitório, arquivo e os aposentos de quem governa. Tem um reator de emergência.',
    cost: 0,
    buildCycles: 0,
    housing: 8,
    energyOut: 6,
    buildable: false,
  },
  habitat: {
    name: 'Alojamento',
    code: 'HAB',
    category: 'habitat',
    desc: 'Beliches pressurizados, cortinas de lona e o pouco de privacidade que existe aqui.',
    cost: 30,
    buildCycles: 2,
    housing: 14,
    energyUse: 1,
  },
  oxygen: {
    name: 'Eletrolisador',
    code: 'O₂',
    category: 'life',
    trade: 'vida',
    desc: 'Quebra a água do mar para produzir oxigênio. Consome muita energia.',
    cost: 35,
    buildCycles: 2,
    slots: 4,
    produces: 'oxygen',
    rate: 9,
    energyPerWorker: 2,
  },
  water: {
    name: 'Dessalinizador',
    code: 'H₂O',
    category: 'life',
    trade: 'vida',
    desc: 'Membranas de osmose reversa que tornam a água do mar potável.',
    cost: 30,
    buildCycles: 2,
    slots: 4,
    produces: 'water',
    rate: 9,
    energyPerWorker: 1,
  },
  farm: {
    name: 'Fazenda de Algas',
    code: 'ALG',
    category: 'life',
    trade: 'cultivo',
    desc: 'Tanques iluminados de algas e krill. A base da dieta da colônia.',
    cost: 30,
    buildCycles: 2,
    slots: 4,
    produces: 'food',
    rate: 6,
    energyPerWorker: 1,
  },
  workshop: {
    name: 'Oficina de Sucata',
    code: 'OFI',
    category: 'industry',
    trade: 'mecânica',
    desc: 'Recicla metal, polímeros e peças para construção e reparos.',
    cost: 25,
    buildCycles: 1,
    slots: 4,
    produces: 'materials',
    rate: 4,
    energyPerWorker: 1,
  },
  tidal: {
    name: 'Turbina de Corrente',
    code: 'COR',
    category: 'energy',
    trade: 'mecânica',
    desc: 'Aproveita as correntes oceânicas. Só funciona nos níveis rasos (1 a 3).',
    cost: 40,
    buildCycles: 2,
    slots: 2,
    produces: 'energy',
    rate: 7,
    maxLevel: 2,
  },
  geothermal: {
    name: 'Poço Geotérmico',
    code: 'GEO',
    category: 'energy',
    trade: 'mecânica',
    desc: 'Capta o calor das fontes hidrotermais. Só nos níveis profundos (4 a 6).',
    cost: 60,
    buildCycles: 3,
    slots: 2,
    produces: 'energy',
    rate: 15,
    minLevel: 3,
  },
  battery: {
    name: 'Banco de Baterias',
    code: 'BAT',
    category: 'energy',
    desc: 'Guarda o excedente de energia para dias de déficit.',
    cost: 30,
    buildCycles: 1,
    storage: 50,
  },
  commons: {
    name: 'Átrio',
    code: 'ATR',
    category: 'social',
    desc: 'Um jardim sob lâmpadas de espectro solar. Lugar para conversar e esquecer a pressão.',
    cost: 40,
    buildCycles: 2,
    morale: 0.8,
    energyUse: 2,
    max: 2,
  },
  dock: {
    name: 'Eclusa de Escafandros',
    code: 'ECL',
    category: 'industry',
    desc: 'Câmara de pressurização e elevador até o leito marinho. Por aqui saem as expedições.',
    cost: 50,
    buildCycles: 2,
    energyUse: 2,
    max: 1,
  },
  clinic: {
    name: 'Enfermaria',
    code: 'ENF',
    category: 'care',
    trade: 'cuidado',
    desc: 'Macas, um autoclave e remédios contados. Com alguém de plantão, doentes se recuperam mais rápido.',
    cost: 45,
    buildCycles: 2,
    slots: 2,
    energyUse: 2,
    max: 1,
  },
};

export const BUILD_ORDER = [
  'habitat',
  'oxygen',
  'water',
  'farm',
  'workshop',
  'tidal',
  'geothermal',
  'battery',
  'commons',
  'clinic',
  'dock',
];

// Disposição inicial da colônia: [tipo, nível, posição]
export const START_LAYOUT = [
  ['core', 0, 0],
  ['tidal', 0, 1],
  ['dock', 0, 2],
  ['commons', 0, 3],
  ['oxygen', 1, 0],
  ['water', 1, 1],
  ['farm', 1, 2],
  ['farm', 1, 3],
  ['habitat', 2, 0],
  ['habitat', 2, 1],
  ['workshop', 2, 2],
  ['clinic', 2, 3],
];

// Funções fora da economia de produção (não ocupam vagas de módulos).
export const ROLES = {
  council: { label: 'Conselho' },
  guard: { label: 'Guarda' },
  cook: { label: 'Cozinha' },
  archive: { label: 'Arquivo e escola' },
  diver: { label: 'Escafandria' },
};

export const DECREES = {
  rationing: {
    name: 'Racionamento',
    desc: 'As rações de água e comida são cortadas em um quarto.',
    effects: 'Consumo de água e comida −25% · Moral −1,5 por dia',
  },
  doubleShift: {
    name: 'Turnos Dobrados',
    desc: 'Todos trabalham dois turnos seguidos. As máquinas também.',
    effects: 'Produção +25% · Moral −2 por dia · Desgaste do casco +0,5 por dia',
  },
  birthLicenses: {
    name: 'Licenças de Natalidade',
    desc: 'O Conselho autoriza novos nascimentos quando houver leitos e comida.',
    effects: 'Nascimentos possíveis com leito livre, comida e moral ≥ 50 · Confiança +0,3 por dia',
  },
  patrols: {
    name: 'Patrulhas de Ordem',
    desc: 'Guardas circulam pelos corredores e ouvem as conversas.',
    effects: 'Boatos e segredos se espalham pela metade · Perda de confiança por moral baixa −50% · Moral −1 por dia',
  },
};

export const EXPEDITIONS = {
  wreck: {
    name: 'Campo de Destroços',
    desc: 'Restos de embarcações a poucas centenas de metros da base. Seguro, mas já bastante saqueado.',
    cycles: 2,
    risk: 0.04,
    loot: [10, 18],
  },
  rift: {
    name: 'Fenda Abissal',
    desc: 'Uma fenda escura onde ficaram as primeiras sondas da fundação.',
    cycles: 3,
    risk: 0.1,
    loot: [14, 24],
  },
  ascent: {
    name: 'Coluna de Ascensão',
    desc: 'O antigo cabo de comunicação que sobe até a superfície. Ninguém volta igual.',
    cycles: 4,
    risk: 0.18,
    loot: [3, 6],
  },
};

// Os fragmentos contam, em ordem, o que o Conselho escondeu. "source" diz
// onde cada um é encontrado no mundo.
export const FRAGMENTS = [
  {
    id: 'founding',
    title: 'Diário de Fundação',
    source: 'Entregue por Teodoro Lins, a pedido do antigo Superintendente.',
    surface: null,
    text:
      'Dia 1. Descemos 214 pessoas. O plano é simples: esperar o mar esfriar o mundo lá em cima e subir em uma geração. Uma geração, no máximo. Ninguém deve se acostumar com este lugar.',
  },
  {
    id: 'buoy',
    title: 'Registro da Boia 7',
    source: 'Gravador de uma boia meteorológica caída no Campo de Destroços.',
    surface: 47,
    text:
      'Leituras da boia meteorológica 7, uma por década: 61 °C. 54 °C. 47 °C. Alguém circulou os números a lápis e escreveu na margem: "está caindo".',
  },
  {
    id: 'zenith',
    title: 'Transmissão de Zênite',
    source: 'Sonda de comunicação no fundo da Fenda Abissal.',
    surface: 41,
    text:
      'Gravação antiga, muito chiado: "...aqui é a Colônia Zênite. Subimos. O ar queima, mas à sombra dá para respirar. Repito: dá para respirar..." Depois disso, silêncio.',
  },
  {
    id: 'minutes',
    title: 'Ata do Conselho',
    source: 'Cofre do Conselho, no Núcleo.',
    surface: 41,
    text:
      'Votação: cinco a dois. Os dados da superfície ficam lacrados. Se souberem, todos vão querer subir, e não há escafandros para todos. A ordem vem antes da verdade. Votaram contra: Clara Nogueira e Severino Bastos.',
  },
  {
    id: 'last',
    title: 'Última Leitura',
    source: 'Caixa de retransmissão no alto da Coluna de Ascensão.',
    surface: 31,
    text:
      'Boia 7, leitura desta semana: 31 °C. Umidade estável. Vegetação detectada na costa norte. A data no topo da folha é de três anos atrás.',
  },
];
