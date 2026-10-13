// Dados de balanceamento do jogo. Todos os números ajustáveis ficam aqui.

export const LEVELS = 6;
export const SLOTS_PER_LEVEL = 3;
export const TOP_DEPTH_M = 160;
export const DEPTH_PER_LEVEL_M = 40;

export const FRAGMENTS_TO_WIN = 5;

export const START = {
  population: 20,
  maintenance: 2,
  hull: 85,
  morale: 60,
  trust: 65,
  resources: { oxygen: 45, water: 60, food: 60, materials: 80, energy: 20 },
};

// Consumo diário por pessoa na base.
export const UPKEEP = { oxygen: 1, water: 1, food: 1 };

export const HULL_WEAR_BASE = 0.5;
export const HULL_WEAR_PER_MODULE = 0.12;
export const HULL_WEAR_PER_LEVEL = 0.08;
// Fadiga do metal: o desgaste cresce com o tempo (+0,5% a cada ciclo).
export const HULL_FATIGUE_PER_CYCLE = 0.005;
export const REPAIR_PER_WORKER = 1.5;
export const REPAIR_PER_MATERIAL = 1.5;

export const BASE_BATTERY = 30;

export const DECREE_CHANGE_TRUST = 2;
export const BIRTH_CYCLES = 4;
export const EVENT_CHANCE = 0.35;
export const EVENT_COOLDOWN = 10;

export const EXPEDITION_MAX_TEAM = 4;
export const EXPEDITION_SUPPLY = { oxygen: 3, food: 1 }; // por membro, por ciclo

export const RESOURCES = {
  oxygen: { label: 'Oxigênio', code: 'O₂' },
  water: { label: 'Água', code: 'H₂O' },
  food: { label: 'Comida', code: 'ALG' },
  materials: { label: 'Materiais', code: 'MAT' },
  energy: { label: 'Energia', code: 'kW' },
};

// category: life | energy | habitat | industry | social
export const MODULES = {
  core: {
    name: 'Núcleo de Comando',
    code: 'NÚC',
    category: 'habitat',
    desc: 'Sede do Conselho e primeiro abrigo da colônia. Tem um reator de emergência.',
    cost: 0,
    buildCycles: 0,
    housing: 10,
    energyOut: 5,
    buildable: false,
  },
  habitat: {
    name: 'Alojamento',
    code: 'HAB',
    category: 'habitat',
    desc: 'Beliches pressurizados. Sem leitos suficientes a moral cai.',
    cost: 30,
    buildCycles: 2,
    housing: 8,
    energyUse: 1,
  },
  oxygen: {
    name: 'Eletrolisador',
    code: 'O₂',
    category: 'life',
    desc: 'Quebra a água do mar para produzir oxigênio. Consome muita energia.',
    cost: 35,
    buildCycles: 2,
    slots: 4,
    produces: 'oxygen',
    rate: 6,
    energyPerWorker: 2,
  },
  water: {
    name: 'Dessalinizador',
    code: 'H₂O',
    category: 'life',
    desc: 'Membranas de osmose reversa que tornam a água do mar potável.',
    cost: 30,
    buildCycles: 2,
    slots: 4,
    produces: 'water',
    rate: 6,
    energyPerWorker: 1,
  },
  farm: {
    name: 'Fazenda de Algas',
    code: 'ALG',
    category: 'life',
    desc: 'Tanques iluminados de algas e krill. A base da dieta da colônia.',
    cost: 30,
    buildCycles: 2,
    slots: 5,
    produces: 'food',
    rate: 5,
    energyPerWorker: 1,
  },
  workshop: {
    name: 'Oficina de Sucata',
    code: 'OFI',
    category: 'industry',
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
    desc: 'Aproveita as correntes oceânicas. Só funciona nos níveis rasos (1 a 3).',
    cost: 40,
    buildCycles: 2,
    slots: 2,
    produces: 'energy',
    rate: 6,
    maxLevel: 2,
  },
  geothermal: {
    name: 'Poço Geotérmico',
    code: 'GEO',
    category: 'energy',
    desc: 'Capta o calor das fontes hidrotermais. Só nos níveis profundos (4 a 6).',
    cost: 60,
    buildCycles: 3,
    slots: 2,
    produces: 'energy',
    rate: 14,
    minLevel: 3,
  },
  battery: {
    name: 'Banco de Baterias',
    code: 'BAT',
    category: 'energy',
    desc: 'Guarda o excedente de energia para ciclos de déficit.',
    cost: 30,
    buildCycles: 1,
    storage: 50,
  },
  commons: {
    name: 'Átrio',
    code: 'ATR',
    category: 'social',
    desc: 'Um jardim sob luz artificial. Lugar para respirar, conversar e esquecer a pressão.',
    cost: 40,
    buildCycles: 2,
    morale: 1.5,
    energyUse: 2,
  },
  dock: {
    name: 'Eclusa de Escafandros',
    code: 'ECL',
    category: 'industry',
    desc: 'Permite enviar equipes para fora da colônia. Apenas uma por base.',
    cost: 50,
    buildCycles: 2,
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
  'dock',
];

// Disposição inicial da colônia: [tipo, nível, posição, trabalhadores]
export const START_LAYOUT = [
  ['core', 0, 0, 0],
  ['habitat', 0, 1, 0],
  ['tidal', 0, 2, 2],
  ['oxygen', 1, 0, 3],
  ['water', 1, 1, 3],
  ['farm', 1, 2, 4],
];

export const DECREES = {
  rationing: {
    name: 'Racionamento',
    desc: 'As rações de água e comida são cortadas em um quarto.',
    effects: 'Consumo de água e comida −25% · Moral −1,5 por ciclo',
  },
  doubleShift: {
    name: 'Turnos Dobrados',
    desc: 'Todos trabalham dois turnos seguidos. As máquinas também.',
    effects: 'Produção +25% · Moral −2 por ciclo · Desgaste do casco +0,5 por ciclo',
  },
  birthLicenses: {
    name: 'Licenças de Natalidade',
    desc: 'O Conselho autoriza novos nascimentos quando houver leitos e comida.',
    effects: 'Nascimentos possíveis com leito livre, comida e moral ≥ 50 · Confiança +0,3 por ciclo',
  },
  patrols: {
    name: 'Patrulhas de Ordem',
    desc: 'Guardas circulam pelos corredores e ouvem as conversas.',
    effects: 'Chance de vazamento −50% · Perda de confiança por moral baixa −50% · Moral −1 por ciclo',
  },
};

export const EXPEDITIONS = {
  wreck: {
    name: 'Campo de Destroços',
    desc: 'Restos de embarcações a poucos metros da base. Seguro, mas já bastante saqueado.',
    cycles: 2,
    risk: 0.04,
    loot: [10, 18],
    fragmentChance: 0.08,
  },
  rift: {
    name: 'Fenda Abissal',
    desc: 'Uma fenda escura onde ficaram as primeiras sondas da fundação.',
    cycles: 3,
    risk: 0.1,
    loot: [14, 24],
    fragmentChance: 0.35,
  },
  ascent: {
    name: 'Coluna de Ascensão',
    desc: 'O antigo cabo de comunicação que sobe até a superfície. Ninguém volta igual.',
    cycles: 4,
    risk: 0.18,
    loot: [3, 6],
    fragmentChance: 0.7,
  },
};

// Os fragmentos contam, em ordem, o que o Conselho escondeu.
export const FRAGMENTS = [
  {
    title: 'Diário de Fundação',
    surface: null,
    text:
      'Ciclo 1. Descemos 214 pessoas. O plano é simples: esperar o mar esfriar o mundo lá em cima e subir em uma geração. Uma geração, no máximo. Ninguém deve se acostumar com este lugar.',
  },
  {
    title: 'Registro da Boia 7',
    surface: 47,
    text:
      'Leituras da boia meteorológica 7, uma por década: 61 °C. 54 °C. 47 °C. Alguém circulou os números a lápis e escreveu na margem: "está caindo".',
  },
  {
    title: 'Transmissão de Zênite',
    surface: 41,
    text:
      'Gravação antiga, muito chiado: "...aqui é a Colônia Zênite. Subimos. O ar queima, mas à sombra dá para respirar. Repito: dá para respirar..." Depois disso, silêncio.',
  },
  {
    title: 'Ata do Conselho',
    surface: 41,
    text:
      'Votação: cinco a dois. Os dados da superfície ficam lacrados. Se souberem, todos vão querer subir, e não há escafandros para todos. A ordem vem antes da verdade.',
  },
  {
    title: 'Última Leitura',
    surface: 31,
    text:
      'Boia 7, leitura desta semana: 31 °C. Umidade estável. Vegetação detectada na costa norte. A data no topo da folha é de três anos atrás.',
  },
];
