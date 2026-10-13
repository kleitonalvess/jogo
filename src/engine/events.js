// Eventos narrativos. Cada escolha descreve seus efeitos de forma declarativa,
// o que permite à interface mostrar as consequências antes da decisão.
//
// Chaves de efeito: oxygen, water, food, materials, energy, hull, morale,
// trust, secrets, revealed, people, modifier, flag, ending.

import { FRAGMENTS } from './data.js';

export const RANDOM_EVENTS = {
  breach: {
    title: 'Infiltração',
    when: (s) => s.hull < 60,
    text: 'Um anel de vedação cedeu em um dos níveis profundos. A água entra em jatos finos e o barulho não deixa ninguém dormir.',
    choices: [
      { label: 'Mandar a equipe de reparo', effects: { materials: -15, hull: 6 } },
      { label: 'Selar a seção e seguir em frente', effects: { hull: -6, morale: -3 } },
    ],
  },
  ascensionRequest: {
    title: 'Pedido de Ascensão',
    when: (s) => s.cycle >= 4 && s.population > 4,
    text: 'Irene, técnica do dessalinizador, pede permissão para subir pela coluna de cabos em um escafandro velho. Diz que alguém precisa ver o que existe lá em cima.',
    choices: [
      {
        label: 'Permitir a subida',
        effects: { people: -1, trust: 4, morale: -2 },
        outcome: 'Irene subiu. O rádio dela parou de responder aos 90 metros.',
      },
      { label: 'Negar o pedido', effects: { trust: -4 } },
      {
        label: 'Confinar Irene e registrar como surto',
        effects: { trust: -1, morale: -1, secrets: 1 },
        outcome: 'O registro oficial diz "crise de pressão".',
      },
    ],
  },
  relic: {
    title: 'Relíquia Proibida',
    when: (s) => s.cycle >= 3,
    text: 'Numa inspeção de rotina, um guarda encontra com um mecânico uma fotografia antiga: um céu azul, sem nenhuma água por cima.',
    choices: [
      { label: 'Confiscar e arquivar', effects: { secrets: 1, morale: -2, trust: 1 } },
      { label: 'Deixar a foto circular', effects: { morale: 5, trust: -3 } },
    ],
  },
  strike: {
    title: 'Braços Cruzados',
    when: (s) => s.morale < 45,
    text: 'Os técnicos da manutenção param o trabalho. Exigem rações extras para quem desce aos níveis profundos.',
    choices: [
      { label: 'Conceder as rações', effects: { food: -20, water: -10, morale: 6, trust: 3 } },
      { label: 'Mandar as patrulhas', effects: { trust: -8, morale: -4 } },
      { label: 'Prometer melhorias para depois', effects: { trust: -3, morale: 2 } },
    ],
  },
  algaeBlight: {
    title: 'Praga nas Algas',
    when: (s) => s.modules.some((m) => m.type === 'farm' && m.buildLeft === 0),
    text: 'Uma mancha marrom se espalha pelos tanques de algas. Os biólogos dizem que ainda dá para salvar parte da colheita.',
    choices: [
      { label: 'Esterilizar os tanques', effects: { materials: -20 } },
      {
        label: 'Colher tudo às pressas',
        effects: {
          food: 20,
          modifier: { target: 'food', mult: 0.5, cycles: 3, label: 'Praga nas algas' },
        },
      },
    ],
  },
  shoal: {
    title: 'Cardume',
    text: 'Um cardume enorme passa rente às vigias do Nível 1. Por alguns minutos, a colônia inteira para para olhar.',
    choices: [
      { label: 'Abrir as redes externas', effects: { food: 30, hull: -3 } },
      { label: 'Só observar', effects: { morale: 3 } },
    ],
  },
  quake: {
    title: 'Tremor',
    when: (s) => s.cycle >= 5,
    text: 'Um tremor percorre o leito marinho. As vigas rangem e as luzes piscam em todos os níveis.',
    choices: [
      { label: 'Reforçar as estruturas', effects: { materials: -20, hull: -4 } },
      { label: 'Aguentar firme', effects: { hull: -12, morale: -3 } },
    ],
  },
  signal: {
    title: 'Sinal de Cima',
    when: (s) => s.cycle >= 6 && !s.flags.signalBoost,
    text: 'O receptor capta um pulso regular vindo da superfície. Pode ser uma boia antiga. Pode ser alguém.',
    choices: [
      {
        label: 'Rastrear a origem do sinal',
        effects: { energy: -15, flag: 'signalBoost' },
        outcome: 'A origem foi triangulada. A próxima expedição sabe onde procurar.',
      },
      { label: 'Silenciar o receptor', effects: { secrets: 1 } },
      { label: 'Anunciar à colônia', effects: { morale: 3, trust: 2 } },
    ],
  },
  ventSurge: {
    title: 'Fonte Hidrotermal',
    when: (s) => s.modules.some((m) => m.level >= 3),
    text: 'Os sensores detectam uma nova fonte hidrotermal perto dos níveis profundos. A água ali passa dos 300 °C.',
    choices: [
      {
        label: 'Canalizar o calor',
        effects: {
          materials: -15,
          modifier: { target: 'energy', mult: 1.2, cycles: 10, label: 'Fonte hidrotermal' },
        },
      },
      { label: 'Deixar como está', effects: {} },
    ],
  },
  twins: {
    title: 'Gêmeos',
    when: (s) => s.decrees.birthLicenses,
    text: 'Nasceram gêmeos no Alojamento. São os primeiros em muitos ciclos.',
    choices: [
      { label: 'Celebrar no Átrio', effects: { people: 2, food: -10, morale: 5 } },
      { label: 'Registrar sem alarde', effects: { people: 2, morale: 1 } },
    ],
  },
  rumors: {
    title: 'Boatos',
    when: (s) => s.secrets >= 1,
    text: 'Corre pelos corredores que o Conselho guarda arquivos sobre a superfície. As perguntas ficam mais altas a cada turno.',
    choices: [
      { label: 'Desmentir publicamente', effects: { trust: -3 } },
      { label: 'Abrir um dos arquivos', effects: { secrets: -1, revealed: 1, trust: 5, morale: -4 } },
      {
        label: 'Descobrir quem espalhou',
        effects: {
          trust: -2,
          morale: -3,
          modifier: { target: 'leak', mult: 0.5, cycles: 8, label: 'Investigação interna' },
        },
      },
    ],
  },
  fever: {
    title: 'Febre de Pressão',
    when: (s) => s.cycle >= 8,
    text: 'Uma febre se espalha pelos alojamentos. O ar reciclado leva a doença de um nível para outro.',
    choices: [
      {
        label: 'Decretar quarentena',
        effects: {
          morale: -2,
          modifier: { target: 'all', mult: 0.8, cycles: 2, label: 'Quarentena' },
        },
      },
      { label: 'Usar as reservas médicas', effects: { water: -20, food: -10 } },
      { label: 'Esperar passar', effects: { people: -2, morale: -6 } },
    ],
  },
  sabotage: {
    title: 'Sabotagem',
    when: (s) => s.trust < 35,
    text: 'Alguém afrouxou as válvulas do eletrolisador durante a noite. Na parede, a palavra SUBIR pintada com graxa.',
    choices: [
      {
        label: 'Caçar os responsáveis',
        effects: {
          trust: -5,
          morale: -3,
          modifier: { target: 'oxygen', mult: 0.6, cycles: 2, label: 'Válvulas sabotadas' },
        },
      },
      {
        label: 'Ouvir as reivindicações',
        effects: {
          materials: -10,
          trust: 4,
          morale: 2,
          modifier: { target: 'oxygen', mult: 0.6, cycles: 2, label: 'Válvulas sabotadas' },
        },
      },
    ],
  },
  salvage: {
    title: 'Destroços',
    text: 'A corrente arrastou os destroços de um submarino até a encosta da base.',
    choices: [
      { label: 'Recuperar tudo', effects: { materials: 35, hull: -3 } },
      { label: 'Recuperar só o que é seguro', effects: { materials: 15 } },
    ],
  },
};

export const STORY_EVENTS = {
  fragment: {
    title: (s, data) => `Fragmento ${data.index + 1}: ${FRAGMENTS[data.index].title}`,
    document: true,
    text: (s, data) => FRAGMENTS[data.index].text,
    choices: [
      {
        label: 'Revelar à colônia',
        effects: { revealed: 1, trust: 6, morale: -5 },
        archive: 'revealed',
        outcome: 'O documento foi lido em voz alta no Núcleo.',
      },
      {
        label: 'Lacrar no arquivo do Conselho',
        effects: { secrets: 1 },
        archive: 'sealed',
        outcome: 'O documento foi lacrado. Quem o trouxe jurou silêncio.',
      },
    ],
  },
  finalTruth: {
    title: 'A Superfície',
    document: true,
    text: 'Com o último fragmento, o quadro está completo: a superfície voltou a ser habitável há anos, e o Conselho sempre soube. Agora a decisão é sua.',
    choices: [
      { label: 'Abrir todos os arquivos', effects: { ending: 'truth' } },
      { label: 'Manter o Estatuto', effects: { ending: 'silence' } },
    ],
  },
};

export const ENDINGS = {
  truth: {
    title: 'A Porta Aberta',
    text: (s) =>
      s.trust >= 50
        ? 'Os arquivos são lidos no Átrio, um por um. Ninguém grita. Na manhã seguinte, a Oficina começa a costurar escafandros. A colônia deixa de ser um abrigo e passa a ser um ponto de partida.'
        : 'Os arquivos são lidos no Átrio e a sala explode. O Conselho é deposto antes do fim do turno, mas a verdade fica. Nos ciclos seguintes, a primeira equipe sobe pela coluna de cabos.',
  },
  silence: {
    title: 'O Guardião',
    text: (s) =>
      s.secrets >= 3
        ? 'Você lacra a última leitura junto com as outras. A colônia segue respirando, trabalhando e obedecendo. Lá em cima, o sol aquece uma costa vazia. Agora é você quem guarda a porta, e a pilha de segredos só cresce.'
        : 'Você lacra a última leitura. Parte da verdade já circula pelos corredores, mas sem a peça final ninguém sabe para onde ir. A ordem se mantém, por enquanto.',
  },
};

export const DEFEATS = {
  hull: {
    title: 'O Casco Cedeu',
    text: 'Um estalo seco, depois o rugido. A pressão de centenas de metros de oceano encontrou o ponto fraco da colônia.',
  },
  extinct: {
    title: 'Silêncio',
    text: 'O último registro do diário fala de ar rarefeito e luzes de emergência. Depois disso, as páginas estão em branco.',
  },
  revolt: {
    title: 'Revolta',
    text: 'Os corredores se enchem de gente e de raiva. O Conselho é deposto e o Núcleo, tomado. Seja qual for o futuro da colônia, ele não passa mais por você.',
  },
};
