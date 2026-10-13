// Ocorrências da colônia. Cada uma tem quem a traz (speaker) e, às vezes,
// quem está envolvido (subject): o evento acontece com pessoas que têm nome,
// família e memória. As escolhas descrevem seus efeitos de forma
// declarativa, para a interface mostrar as consequências antes da decisão.
//
// Chaves de efeito: oxygen, water, food, materials, energy, hull, morale,
// trust, secrets, people, victim, cause, sick, modifier, flag, ending, rep,
// speakerOpinion, subjectOpinion, secret, bond, marry, twins, item, revealOne.

import { FRAGMENTS } from './data.js';
import { couplesForBirth, discontentShare, secretRumors, rumorKnownShare } from './people/social.js';
import { canWork, displayName, fullName, gw, inBase, residentById, residentByKey } from './people/population.js';
import { hash01 } from './rng.js';

const N = (state, id) => {
  const r = residentById(state, id);
  return r ? displayName(r) : 'alguém';
};

function alive(state, key) {
  const r = residentByKey(state, key);
  return r && r.alive && !r.away ? r : null;
}

function workerOf(state, type, seed) {
  const pool = inBase(state).filter((r) => {
    if (!r.job || r.job === 'maintenance') return false;
    const mod = state.modules.find((m) => m.id === r.job);
    return mod && mod.type === type;
  });
  return pool.length ? pool[Math.floor(hash01(seed, state.cycle) * pool.length)] : null;
}

function someone(state, filter, seed) {
  const pool = inBase(state).filter(filter);
  return pool.length ? pool[Math.floor(hash01(seed, state.cycle, pool.length) * pool.length)] : null;
}

export const RANDOM_EVENTS = {
  breach: {
    title: 'Infiltração',
    alarm: true,
    when: (s) => s.hull < 60,
    text: 'O alarme toca em um dos níveis profundos: um anel de vedação cedeu. A água entra em jatos finos e o barulho não deixa ninguém dormir.',
    choices: [
      { label: 'Mandar a equipe de reparo', effects: { materials: -15, hull: 6 } },
      { label: 'Selar a seção e seguir em frente', effects: { hull: -6, morale: -3 } },
    ],
  },
  ascensionRequest: {
    title: 'Pedido de Ascensão',
    when: (s) => s.cycle >= 6,
    speaker: (s) => someone(s, (r) => !r.key && canWork(r) && (r.traits.includes('sonhador') || r.traits.includes('rebelde')), 'asc'),
    text: (s, d) => {
      const r = residentById(s, d.speaker);
      return `${fullName(r)} pede permissão para subir pela coluna de cabos em um escafandro velho. ${gw(r, 'Ela', 'Ele', 'Elu')} diz que alguém precisa ver o que existe lá em cima, e que prefere morrer tentando a envelhecer aqui.`;
    },
    choices: [
      {
        label: 'Permitir a subida',
        effects: { people: -1, victim: 'speaker', cause: 'ascension', trust: 2, morale: -2, rep: { truth: 3, mercy: 4 } },
        outcome: (s, d) => `${N(s, d.speaker)} subiu. O rádio parou de responder aos 90 metros.`,
      },
      { label: 'Negar o pedido', effects: { speakerOpinion: -18, trust: -2, rep: { mercy: -2 } } },
      {
        label: 'Confinar e registrar como surto',
        effects: {
          speakerOpinion: -30,
          morale: -1,
          rep: { truth: -4, mercy: -5 },
          secret: { label: 'o Conselho confinou quem pediu para subir', text: 'Dizem que quem pede para subir some no Nível 6.' },
        },
        outcome: 'O registro oficial diz "crise de pressão".',
      },
    ],
  },
  relic: {
    title: 'Relíquia Proibida',
    when: (s) => s.cycle >= 3 && !s.flags.relicSeen,
    speaker: (s) => alive(s, 'marta') || someone(s, (r) => r.role === 'guard', 'guard'),
    subject: (s) => someone(s, (r) => !r.key && canWork(r), 'relic'),
    text: (s, d) =>
      `${N(s, d.speaker)} traz ${N(s, d.subject)} pelo braço. Numa inspeção de rotina encontrou com ${gw(residentById(s, d.subject), 'ela', 'ele', 'elu')} uma fotografia antiga: um céu azul, sem nenhuma água por cima. "As regras são claras", diz a guarda.`,
    choices: [
      {
        label: 'Confiscar a foto e arquivar',
        effects: {
          subjectOpinion: -15,
          speakerOpinion: 6,
          item: 'foto-ceu',
          flag: 'relicSeen',
          rep: { truth: -3, mercy: -2 },
          secret: { label: 'o Conselho guarda fotos da superfície', text: 'Tem uma foto do céu trancada no Núcleo.' },
        },
        outcome: 'A fotografia agora está com você.',
      },
      {
        label: 'Deixar a foto circular',
        effects: { morale: 4, speakerOpinion: -10, subjectOpinion: 12, flag: 'relicSeen', rep: { truth: 4, mercy: 2 } },
        outcome: 'Até o fim do dia, metade da colônia já tinha visto o céu.',
      },
    ],
  },
  strike: {
    title: 'Braços Cruzados',
    when: (s) => s.morale < 45,
    speaker: (s) => alive(s, 'davi') || workerOf(s, 'workshop', 'strike'),
    text: (s, d) => `${N(s, d.speaker)} reúne os técnicos no corredor do Nível 3. Eles param o trabalho e exigem rações extras para quem desce aos níveis profundos.`,
    choices: [
      { label: 'Conceder as rações', effects: { food: -20, water: -10, morale: 6, trust: 3, speakerOpinion: 10, rep: { mercy: 4 } } },
      { label: 'Mandar as patrulhas', effects: { trust: -8, morale: -4, speakerOpinion: -20, rep: { mercy: -6 } } },
      { label: 'Prometer melhorias para depois', effects: { trust: -3, morale: 2, speakerOpinion: -4 } },
    ],
  },
  algaeBlight: {
    title: 'Praga nas Algas',
    when: (s) => s.modules.some((m) => m.type === 'farm' && m.buildLeft === 0),
    speaker: (s) => alive(s, 'joaquim') || workerOf(s, 'farm', 'blight'),
    text: (s, d) => `${N(s, d.speaker)} aparece com as mãos verdes até o cotovelo: uma mancha marrom se espalha pelos tanques de algas. Ainda dá para salvar parte da colheita.`,
    choices: [
      { label: 'Esterilizar os tanques', effects: { materials: -20, speakerOpinion: 4 } },
      {
        label: 'Colher tudo às pressas',
        effects: { food: 20, modifier: { target: 'food', mult: 0.5, cycles: 3, label: 'Praga nas algas' } },
      },
    ],
  },
  shoal: {
    title: 'Cardume',
    speaker: (s) => alive(s, 'nina'),
    text: (s, d) =>
      d.speaker
        ? `${N(s, d.speaker)} chega correndo, sem fôlego: "Vem ver! Vem ver!" Um cardume enorme passa rente às vigias do Nível 1, prateado como as fotos de chuva do livro do Teodoro.`
        : 'Um cardume enorme passa rente às vigias do Nível 1. Por alguns minutos, a colônia inteira para para olhar.',
    choices: [
      { label: 'Abrir as redes externas', effects: { food: 30, hull: -3, speakerOpinion: -3 } },
      { label: 'Só observar', effects: { morale: 3, speakerOpinion: 6 } },
    ],
  },
  quake: {
    title: 'Tremor',
    alarm: true,
    when: (s) => s.cycle >= 5,
    text: 'Um tremor percorre o leito marinho. As vigas rangem, as luzes piscam em todos os níveis e alguém grita no Alojamento.',
    choices: [
      { label: 'Reforçar as estruturas', effects: { materials: -20, hull: -4 } },
      { label: 'Aguentar firme', effects: { hull: -12, morale: -3 } },
    ],
  },
  signal: {
    title: 'Sinal de Cima',
    when: (s) => s.cycle >= 7 && !s.flags.signalTraced,
    speaker: (s) => alive(s, 'icaro') || alive(s, 'teodoro'),
    text: (s, d) =>
      `${d.speaker ? N(s, d.speaker) : 'A eclusa'} encontra você com o fone de rádio ainda no pescoço: o receptor capta um pulso regular vindo da superfície. Pode ser uma boia antiga. Pode ser alguém.`,
    choices: [
      {
        label: 'Rastrear a origem do sinal',
        effects: { energy: -15, flag: 'signalTraced', rep: { truth: 1 } },
        outcome: 'O pulso vem do alto da Coluna de Ascensão.',
      },
      {
        label: 'Silenciar o receptor',
        effects: {
          rep: { truth: -4 },
          speakerOpinion: -8,
          secret: { label: 'chegou um sinal da superfície e o Conselho desligou o rádio', text: 'O rádio da eclusa pegou um sinal de cima. Mandaram desligar.' },
        },
      },
      { label: 'Anunciar à colônia', effects: { morale: 3, trust: 2, rep: { truth: 4 } } },
    ],
  },
  ventSurge: {
    title: 'Fonte Hidrotermal',
    when: (s) => s.modules.some((m) => m.level >= 3),
    speaker: (s) => workerOf(s, 'geothermal', 'vent') || alive(s, 'davi'),
    text: (s, d) =>
      `${d.speaker ? N(s, d.speaker) : 'O painel de sensores'} traz a leitura: uma nova fonte hidrotermal se abriu perto dos níveis profundos. A água ali passa dos 300 °C.`,
    choices: [
      {
        label: 'Canalizar o calor',
        effects: { materials: -15, modifier: { target: 'energy', mult: 1.2, cycles: 10, label: 'Fonte hidrotermal' } },
      },
      { label: 'Deixar como está', effects: {} },
    ],
  },
  twins: {
    title: 'Gêmeos',
    when: (s) => s.decrees.birthLicenses && couplesForBirth(s).length > 0,
    speaker: (s) => {
      const couples = couplesForBirth(s);
      return couples.length ? couples[Math.floor(hash01('twins', s.cycle) * couples.length)][0] : null;
    },
    subject: (s, speaker) => {
      const id = Object.keys(speaker.kin).find((k) => speaker.kin[k] === 'spouse');
      return id ? residentById(s, Number(id)) : null;
    },
    text: (s, d) => `Helena sai da Enfermaria com um sorriso cansado: ${N(s, d.speaker)} e ${N(s, d.subject)} tiveram gêmeos. São os primeiros em muitos anos.`,
    choices: [
      { label: 'Celebrar no Átrio', effects: { twins: true, food: -10, morale: 5, speakerOpinion: 8 } },
      { label: 'Registrar sem alarde', effects: { twins: true, morale: 1 } },
    ],
  },
  rumors: {
    title: 'Boatos',
    when: (s) => secretRumors(s).some((r) => rumorKnownShare(s, r) >= 0.1),
    speaker: (s) => alive(s, 'zuleica') || someone(s, (r) => r.traits.includes('fofoqueiro'), 'gossip'),
    text: (s, d) => {
      const top = secretRumors(s).sort((a, b) => rumorKnownShare(s, b) - rumorKnownShare(s, a))[0];
      const share = top ? Math.round(rumorKnownShare(s, top) * 100) : 0;
      return `${d.speaker ? N(s, d.speaker) : 'Alguém'} baixa a voz enquanto enxuga uma panela: "Andam dizendo por aí que ${top ? top.label : 'o Conselho esconde coisas'}. Pelas minhas contas, ${share}% dos adultos já ouviram."`;
    },
    choices: [
      { label: 'Desmentir publicamente', effects: { trust: -3, rep: { truth: -4 } } },
      { label: 'Abrir um dos arquivos', effects: { revealOne: true, trust: 5, morale: -4, rep: { truth: 6 } } },
      {
        label: 'Descobrir quem espalhou',
        effects: { trust: -2, morale: -3, rep: { mercy: -4 }, modifier: { target: 'leak', mult: 0.5, cycles: 8, label: 'Investigação interna' } },
      },
    ],
  },
  fever: {
    title: 'Febre de Pressão',
    when: (s) => s.cycle >= 8,
    speaker: (s) => alive(s, 'helena') || workerOf(s, 'clinic', 'fever'),
    text: (s, d) => `${d.speaker ? N(s, d.speaker) : 'A Enfermaria'} manda chamar você. Uma febre se espalha pelos alojamentos; o ar reciclado leva a doença de um nível para outro.`,
    choices: [
      {
        label: 'Decretar quarentena',
        effects: { morale: -2, sick: 3, speakerOpinion: 6, modifier: { target: 'all', mult: 0.8, cycles: 2, label: 'Quarentena' } },
      },
      { label: 'Usar as reservas médicas', effects: { water: -20, food: -10, sick: 2, speakerOpinion: 4, rep: { mercy: 3 } } },
      { label: 'Esperar passar', effects: { people: -2, cause: 'fever', sick: 5, morale: -6, speakerOpinion: -15, rep: { mercy: -5 } } },
    ],
  },
  sabotage: {
    title: 'Sabotagem',
    when: (s) => s.trust < 38 || discontentShare(s) > 0.3,
    speaker: (s) => alive(s, 'marta') || someone(s, (r) => r.role === 'guard', 'guard2'),
    text: (s, d) => `${d.speaker ? N(s, d.speaker) : 'A guarda'} acorda você antes do turno: alguém afrouxou as válvulas do Eletrolisador durante a noite. Na parede, a palavra SUBIR pintada com graxa.`,
    choices: [
      {
        label: 'Caçar os responsáveis',
        effects: { trust: -5, morale: -3, speakerOpinion: 8, rep: { mercy: -5 }, modifier: { target: 'oxygen', mult: 0.6, cycles: 2, label: 'Válvulas sabotadas' } },
      },
      {
        label: 'Ouvir as reivindicações',
        effects: {
          materials: -10,
          trust: 4,
          morale: 2,
          speakerOpinion: -6,
          rep: { mercy: 4, truth: 2 },
          modifier: { target: 'oxygen', mult: 0.6, cycles: 2, label: 'Válvulas sabotadas' },
        },
      },
    ],
  },
  salvage: {
    title: 'Destroços',
    speaker: (s) => alive(s, 'icaro'),
    text: (s, d) => `${d.speaker ? N(s, d.speaker) + ' avisa pelo interfone da eclusa' : 'A eclusa avisa'}: a corrente arrastou os destroços de um submarino até a encosta da base.`,
    choices: [
      { label: 'Recuperar tudo', effects: { materials: 35, hull: -3 } },
      { label: 'Recuperar só o que é seguro', effects: { materials: 15, speakerOpinion: 3 } },
    ],
  },
  feud: {
    title: 'Briga no Refeitório',
    when: (s) => s.cycle >= 4 && !!feudPair(s),
    speaker: (s) => (feudPair(s) || [])[0] || null,
    subject: (s) => (feudPair(s) || [])[1] || null,
    text: (s, d) =>
      `Pratos voam no refeitório. ${N(s, d.speaker)} e ${N(s, d.subject)} brigam aos gritos por causa de uma dívida de ração, mas todo mundo sabe que a briga vem de longe. A Dona Zu olha para você esperando uma decisão.`,
    choices: [
      { label: 'Punir os dois com turno extra', effects: { speakerOpinion: -10, subjectOpinion: -10, morale: 1, rep: { mercy: -4 } } },
      {
        label: 'Sentar com os dois e mediar',
        effects: { bond: 35, speakerOpinion: 5, subjectOpinion: 5, rep: { mercy: 4 } },
        outcome: 'Depois de uma hora de conversa, os dois apertaram as mãos. Sem sorrir, mas apertaram.',
      },
      { label: 'Deixar que se entendam', effects: { bond: -15, morale: -2 } },
    ],
  },
  wedding: {
    title: 'Pedido de União',
    when: (s) => s.cycle >= 5 && !!lovers(s),
    speaker: (s) => (lovers(s) || [])[0] || null,
    subject: (s) => (lovers(s) || [])[1] || null,
    text: (s, d) =>
      `${N(s, d.speaker)} e ${N(s, d.subject)} pedem a bênção do Conselho para dividir um beliche e uma vida. É tradição que quem governa celebre a união no Átrio.`,
    choices: [
      {
        label: 'Celebrar a união',
        effects: { marry: true, morale: 4, food: -8, speakerOpinion: 12, subjectOpinion: 12, rep: { mercy: 3 } },
        outcome: 'Houve música no Átrio até a ronda das dez.',
      },
      { label: 'Negar: não há leitos sobrando', effects: { speakerOpinion: -20, subjectOpinion: -20, rep: { mercy: -4 } } },
    ],
  },
  theft: {
    title: 'Rações Desaparecidas',
    when: (s) => s.resources.food < s.residents.length * 2.5,
    speaker: (s) => alive(s, 'marta') || someone(s, (r) => r.role === 'guard', 'guard3'),
    subject: (s) => someone(s, (r) => !r.key && canWork(r) && Object.values(r.kin).includes('child'), 'thief'),
    text: (s, d) =>
      `${d.speaker ? N(s, d.speaker) : 'A guarda'} pegou ${N(s, d.subject)} saindo do depósito com tabletes de ração escondidos no macacão. "Eram para os meus filhos", diz, sem levantar os olhos.`,
    choices: [
      { label: 'Punir publicamente', effects: { subjectOpinion: -25, speakerOpinion: 8, trust: 1, rep: { mercy: -7 } } },
      { label: 'Perdoar em silêncio', effects: { food: -5, subjectOpinion: 15, speakerOpinion: -6, rep: { mercy: 4, truth: -1 } } },
      { label: 'Aumentar a ração das famílias', effects: { food: -15, morale: 2, subjectOpinion: 10, rep: { mercy: 7 } } },
    ],
  },
};

function feudPair(s) {
  const people = inBase(s).sort((a, b) => (a.key ? 1 : 0) - (b.key ? 1 : 0));
  for (const r of people) {
    if (r.age < 16) continue;
    for (const [id, v] of Object.entries(r.bonds)) {
      const o = residentById(s, Number(id));
      if (v <= -30 && o && o.alive && !o.away && o.age >= 16) return [r, o];
    }
  }
  return null;
}

function lovers(s) {
  for (const r of inBase(s)) {
    if (r.age < 20 || Object.values(r.kin).includes('spouse')) continue;
    for (const [id, v] of Object.entries(r.bonds)) {
      const o = residentById(s, Number(id));
      if (
        v >= 55 &&
        o &&
        o.alive &&
        !o.away &&
        o.age >= 20 &&
        !r.kin[o.id] &&
        !Object.values(o.kin).includes('spouse') &&
        Math.abs(o.age - r.age) < 15
      ) {
        return [r, o];
      }
    }
  }
  return null;
}

export const STORY_EVENTS = {
  fragment: {
    title: (s, d) => `Fragmento ${s.found.length}: ${FRAGMENTS[d.index].title}`,
    document: true,
    text: (s, d) => FRAGMENTS[d.index].text,
    choices: [
      {
        label: 'Revelar à colônia',
        effects: { trust: 6, morale: -5, rep: { truth: 10 } },
        archive: 'revealed',
        outcome: 'O documento será lido em voz alta no Átrio, ao fim do dia.',
      },
      {
        label: 'Lacrar no arquivo do Conselho',
        effects: { secrets: 1, rep: { truth: -8 } },
        archive: 'sealed',
        outcome: (s, d) =>
          d.witnesses && d.witnesses.length
            ? `O documento foi lacrado. ${d.witnesses.map((id) => N(s, id)).join(' e ')} também ${d.witnesses.length > 1 ? 'sabem' : 'sabe'} dele.`
            : 'O documento foi lacrado. Só você sabe que ele existe.',
      },
    ],
  },
  finalTruth: {
    title: 'A Superfície',
    document: true,
    text: 'Com o último fragmento, o quadro está completo: a superfície voltou a ser habitável há anos, e o Conselho sempre soube. Agora a decisão é sua.',
    choices: [
      { label: 'Abrir todos os arquivos', effects: { ending: 'truth', rep: { truth: 20 } } },
      { label: 'Manter o Estatuto', effects: { ending: 'silence', rep: { truth: -20 } } },
    ],
  },
};

export const ENDINGS = {
  truth: {
    title: 'A Porta Aberta',
    text: (s) =>
      s.trust >= 50
        ? 'Os arquivos são lidos no Átrio, um por um. Ninguém grita. Na manhã seguinte a Oficina começa a costurar escafandros, e pela primeira vez em sessenta anos a colônia faz planos para depois.'
        : 'Os arquivos são lidos no Átrio e a sala explode. O Conselho cai antes do fim do turno, mas a verdade fica. Nos dias seguintes, a primeira equipe sobe pela coluna de cabos.',
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
