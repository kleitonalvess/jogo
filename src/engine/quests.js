// Missões: a busca pela verdade sobre a superfície e as histórias pessoais
// dos moradores. Cada missão reage a conversas, itens apanhados, objetos
// usados e à passagem dos dias. O estado de cada uma fica em state.quests.

import { FRAGMENTS } from './data.js';
import { registerQuestHooks } from './dialogue.js';
import { discoverFragment, giveItem, hasItem, takeItem, addLog } from './game.js';
import { ITEMS } from './items.js';
import { displayName, fullName, inBase, living, residentById, residentByKey } from './people/population.js';
import { adjustReputation, createRumor, recordDeath, refreshAggregates, remember, scheduleGathering, shiftMood } from './people/social.js';
import { hash01, pick } from './rng.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---------------------------------------------------------------------------
// Utilidades

export function quest(state, id) {
  return state.quests[id] || null;
}

function startQuest(state, id, stage, data = {}) {
  if (state.quests[id]) return state.quests[id];
  state.quests[id] = { stage, data, done: false, outcome: null, started: state.cycle };
  addLog(state, `Nova missão: ${QUESTS[id].title}.`, 'story');
  return state.quests[id];
}

function setStage(state, id, stage) {
  const q = state.quests[id];
  if (q) q.stage = stage;
}

function finish(state, id, outcome, text = null) {
  const q = state.quests[id];
  if (!q || q.done) return;
  q.done = true;
  q.outcome = outcome;
  q.stage = 'fim';
  addLog(state, `Missão concluída: ${QUESTS[id].title}.${text ? ' ' + text : ''}`, 'good');
}

function at(state, id, stage) {
  const q = state.quests[id];
  return !!q && !q.done && (stage === undefined || q.stage === stage);
}

function key(state, k) {
  const r = residentByKey(state, k);
  return r && r.alive ? r : null;
}

function nudge(state, k, delta, memory) {
  const r = key(state, k);
  if (!r) return;
  r.opinion = clamp(r.opinion + delta, 0, 100);
  if (memory) remember(r, { day: state.cycle, kind: 'player', text: memory, weight: delta });
  refreshAggregates(state);
}

function moodOf(state, k, delta) {
  const r = key(state, k);
  if (r) r.mood = clamp(r.mood + delta, 0, 100);
}

const P = (text) => ({ who: 'player', text });

// ---------------------------------------------------------------------------
// Definições

export const QUESTS = {
  verdade: {
    title: 'A Verdade sobre a Superfície',
    giver: 'teodoro',
    main: true,
    summary: 'Severino Bastos deixou um caderno e um pedido: "Encontre o resto." Os documentos da fundação estão espalhados pela colônia e pelo fundo do mar.',
  },
  irene: {
    title: 'O Pedido de Irene',
    giver: 'irene',
    summary: 'Irene Castellan quer subir até a superfície. Tem uma filha de nove anos e nenhum traje.',
  },
  nina: {
    title: 'Um Pedaço de Céu',
    giver: 'nina',
    summary: 'Nina coleciona relíquias e nunca viu o céu. Ela quer uma relíquia do céu de verdade.',
  },
  tinta: {
    title: 'Tinta na Parede',
    giver: 'marta',
    summary: 'Alguém pinta SUBIR nas paredes da colônia. Marta Quintal quer o culpado.',
  },
  ruth: {
    title: 'A Placa de Ruth',
    giver: 'icaro',
    summary: 'Ícaro Vale perdeu sua dupla de mergulho, Ruth Amaral, na Fenda Abissal. A placa de identificação dela ainda está lá embaixo.',
  },
  febre: {
    title: 'Remédio do Fundo',
    giver: 'helena',
    summary: 'Os remédios da Enfermaria acabaram. Helena Saraiva conhece uma alga vermelha que cresce junto às fontes termais.',
  },
  clara: {
    title: 'A Última Votação',
    giver: 'clara',
    summary: 'Clara Nogueira estava no primeiro Conselho. Ela lembra de uma votação que mudou tudo.',
  },
  rafael: {
    title: 'O Filho do Conselheiro',
    giver: 'rafael',
    summary: 'Rafael Mendonça sabe onde o pai guarda as coisas que não quer que ninguém veja.',
  },
  augusto: {
    title: 'O Guardião do Cofre',
    giver: 'augusto',
    summary: 'Augusto Mendonça sabe que você abriu o cofre do Conselho.',
  },
  zuleica: {
    title: 'Gosto de Alguma Coisa',
    giver: 'zuleica',
    summary: 'Há trinta anos Dona Zu cozinha alga com krill. O que ela daria por um tempero.',
  },
  teodoro: {
    title: 'O Que Ensinar',
    giver: 'teodoro',
    summary: 'As crianças vão perguntar ao Teodoro sobre o céu. Ele quer saber o que responder.',
  },
};

// Onde procurar cada documento (as pistas aparecem no diário depois que alguém conta).
export const FRAGMENT_HINTS = {
  founding: 'Com Teodoro Lins, no Arquivo.',
  buoy: 'Uma boia meteorológica caída no Campo de Destroços, a nordeste da eclusa.',
  zenith: 'Uma sonda antiga no fundo da Fenda Abissal, a sudoeste.',
  minutes: 'No cofre do Conselho, na mesa de Augusto. Alguém deve saber o código.',
  last: 'Na caixa de retransmissão, no alto da Coluna de Ascensão, ao sul.',
};

// ---------------------------------------------------------------------------
// Diálogos das missões

function optionsFor(state, r) {
  const out = [];
  const add = (id, label, run) => out.push({ id: `q:${id}`, label, run });
  const k = r.key;

  // Missão principal
  const v = quest(state, 'verdade');
  if (k === 'augusto' && at(state, 'verdade', 'chegada')) {
    add('verdade:inicio', 'Por onde eu começo?', (s) => {
      setStage(s, 'verdade', 'terminal');
      return {
        lines: [
          'Pelo começo, como tudo. A colônia tem trinta e quatro bocas, doze módulos e um casco que range mais a cada ano.',
          'As baterias estão caindo. A turbina de corrente não dá conta sozinha. Precisamos de um Poço Geotérmico no Nível 4, e você decide quem vai trabalhar lá.',
          'Tudo isso se faz pelo Terminal do Conselho, ali na parede. E mais uma coisa: o Teodoro quer falar com você. Assuntos do Severino. (Faz uma pausa.) Não perca tempo com papéis velhos.',
        ],
      };
    });
  }
  if (k === 'teodoro' && v && !v.done && (v.stage === 'teodoro' || v.stage === 'terminal')) {
    add('verdade:pacote', 'Augusto disse que você me procurava.', (s) => {
      setStage(s, 'verdade', 'busca');
      const t = residentByKey(s, 'teodoro');
      discoverFragment(s, 'founding', [t.id]);
      s.quests.verdade.data.hints = ['founding'];
      return {
        lines: [
          'Ah. Sim. (Tira um embrulho de lona de baixo de uma pilha de pastas.) O Severino me deixou isto, dois dias antes de morrer. Disse: "Entregue a quem vier depois de mim. Só a essa pessoa."',
          'Dentro tem um caderno. O primeiro diário da fundação, escrito por quem desceu. E um bilhete com a letra dele.',
          '(Lê em voz baixa.) "Encontre o resto. Eu não tive coragem. S. B."',
          'Eu não sei o que é "o resto". Mas sei que o Severino passou os últimos meses lendo esse caderno. Leia. Depois decida o que fazer com ele.',
        ],
        end: true,
      };
    });
  }
  if (k === 'teodoro' && at(state, 'verdade', 'busca')) {
    add('verdade:pistas', 'Onde eu procuro o resto?', (s) => {
      const q = s.quests.verdade;
      for (const id of ['buoy', 'zenith', 'last']) if (!q.data.hints.includes(id)) q.data.hints.push(id);
      return {
        lines: [
          'O Severino saía pela eclusa com o Ícaro, nos últimos meses. Ele anotava nomes no canto das páginas: "boia 7", "Fenda", "Coluna".',
          'A boia deve ser uma das velhas boias meteorológicas. Caíram no Campo de Destroços, a nordeste. A Fenda fica a sudoeste; as primeiras sondas da fundação ficaram lá. E a Coluna de Ascensão é o cabo que sobe até lá em cima, ao sul.',
          'E converse com a Clara Nogueira. Ela estava no primeiro Conselho. Ela lembra de coisas que não estão no Arquivo.',
        ],
      };
    });
  }

  // Irene
  if (k === 'irene' && at(state, 'irene', 'pedido')) {
    add('irene:ouvir', 'Você queria falar comigo?', (s) => ({
      lines: [
        '(Fecha a porta da cabine.) Eu quero subir. Pela coluna de cabos, de escafandro. Não é surto, não é capricho. Eu fiz as contas: noventa por cento de chance de eu morrer.',
        'Mas os outros dez por cento... alguém precisa ver. Alguém precisa voltar e dizer o que existe lá em cima.',
        'O Ícaro guarda os trajes. Ele só entrega com ordem do Conselho. Com a sua ordem.',
      ],
      options: ireneChoices(s),
    }));
  }
  if (k === 'irene' && at(state, 'irene', 'traje') && hasItem(state, 'traje-velho')) {
    add('irene:entregar', 'Consegui o traje.', (s) => {
      takeItem(s, 'traje-velho');
      setStage(s, 'irene', 'partida');
      s.quests.irene.data.leaveDay = s.cycle;
      nudge(s, 'irene', 25, 'Recebeu um traje para subir.');
      adjustReputation(s, { mercy: 5, truth: 3 });
      return {
        lines: [
          '(Segura o capacete como quem segura um bebê.) Você não sabe o que isso significa.',
          'Vou esta noite, depois da ronda das dez. Não conte para a Nina antes. Eu conto. (A voz falha.) A Marta vai cuidar dela. A Marta me odeia, mas ama a Nina.',
          'Se eu chegar lá em cima, eu volto. Eu prometo que volto.',
        ],
        end: true,
      };
    });
  }

  // Ícaro
  if (k === 'icaro' && at(state, 'irene', 'traje') && !hasItem(state, 'traje-velho')) {
    add('irene:icaro', 'Preciso de um traje. É para a Irene.', (s) => {
      if (r.opinion >= 45 || s.player.reputation.mercy >= 10) {
        giveItem(s, 'traje-velho');
        nudge(s, 'icaro', -3);
        return {
          lines: [
            '(Fica um tempo calado.) A Irene sempre olhou para cima. Desde pequena.',
            'Leve o traje 3. A válvula de alívio é nova. (Entrega o traje dobrado.) Diga a ela para subir devagar. Cinco metros por minuto. Nem um a mais.',
          ],
        };
      }
      return {
        lines: [
          'Não. Os trajes são para quem volta. Eu não vou entregar um caixão para ela vestir.',
          'Se você quer que eu confie no seu juízo, vai ter que me mostrar que tem algum.',
        ],
      };
    });
  }
  if (k === 'icaro' && !quest(state, 'ruth') && (state.player.known[r.id]?.about || 0) >= 2) {
    add('ruth:inicio', 'Você falou da Ruth...', (s) => {
      startQuest(s, 'ruth', 'procurar');
      return {
        lines: [
          'A placa dela. Uma plaquinha de metal com o nome, que a gente usa no pescoço. Se ela caiu na Fenda, a placa está lá, em algum lugar perto das sondas velhas.',
          'Eu nunca tive coragem de procurar. Toda vez que chego na borda, as pernas não descem.',
          'Se um dia você descer... traga a placa. Só isso.',
        ],
      };
    });
  }
  if (k === 'icaro' && at(state, 'ruth', 'procurar') && hasItem(state, 'placa-ruth')) {
    add('ruth:entregar', 'Encontrei isto na Fenda.', (s) => {
      takeItem(s, 'placa-ruth');
      s.player.suitTankMax = 160;
      nudge(s, 'icaro', 30, 'Trouxe de volta a placa de Ruth.');
      moodOf(s, 'icaro', 15);
      adjustReputation(s, { mercy: 6 });
      finish(s, 'ruth', 'devolvida', 'Ícaro ajustou o seu traje: o tanque agora dura bem mais.');
      return {
        lines: [
          '(Pega a placa. Passa o polegar no nome gravado. Muito tempo.)',
          'R. Amaral. Tipo O positivo. Ela odiava essa placa. Dizia que parecia coleira.',
          'Obrigado. (Limpa os olhos com as costas da mão.) Deixa eu ver seu traje. ...Pronto. Troquei o tanque pelo reserva da Ruth. Ela ia querer que alguém usasse.',
        ],
      };
    });
  }

  // Nina
  if (k === 'nina' && !quest(state, 'nina') && state.cycle >= 2 && r.opinion >= 30) {
    add('nina:inicio', 'O que você está fazendo, Nina?', (s) => {
      startQuest(s, 'nina', 'procurar');
      return {
        lines: [
          'Organizando minhas relíquias! Olha: parafuso dourado, pedra que brilha, o dente. O professor diz que é de tubarão. Eu acho que é de dragão.',
          'Mas eu não tenho nenhuma relíquia do céu. Nenhuma! O céu é a melhor relíquia que existe e eu não tenho.',
          'Se você achar alguma coisa do céu lá fora, me traz? Uma foto, um pedaço de nuvem, qualquer coisa?',
        ],
      };
    });
  }
  if (k === 'nina' && at(state, 'nina', 'procurar')) {
    if (hasItem(state, 'foto-ceu')) {
      add('nina:foto', 'Trouxe um pedaço do céu para você.', (s) => {
        takeItem(s, 'foto-ceu');
        nudge(s, 'nina', 30, 'Ganhou uma foto do céu.');
        moodOf(s, 'nina', 30);
        nudge(s, 'irene', 10);
        nudge(s, 'marta', 8);
        nudge(s, 'teodoro', 5);
        shiftMood(s, 2, (o) => o.age < 14);
        adjustReputation(s, { mercy: 4, truth: 2 });
        finish(s, 'nina', 'ceu', 'Nina mostrou a foto para todas as crianças da colônia.');
        return {
          lines: [
            '(Segura a foto com as duas mãos, sem piscar.) É azul. É azul MESMO. E não tem teto. Não tem teto nenhum!',
            'Essas coisas brancas são nuvens? São de água e flutuam? Eu sabia! O professor disse e ninguém acreditou!',
            'Vai para o lugar de honra. E quando eu crescer eu vou lá ver se ainda está igual.',
          ],
        };
      });
    } else {
      const toy = ['oculos-sol', 'brinquedo', 'bussola'].find((id) => hasItem(state, id));
      if (toy) {
        add('nina:outro', `Não achei o céu, mas trouxe isto: ${ITEMS[toy].name}.`, (s) => {
          takeItem(s, toy);
          nudge(s, 'nina', 12, `Ganhou ${ITEMS[toy].name}.`);
          moodOf(s, 'nina', 12);
          finish(s, 'nina', 'consolo', 'Não era o céu, mas Nina guardou com carinho.');
          return { lines: ['Não é o céu... mas é lá de cima, né? Então é quase. Obrigada! (Já está correndo para mostrar ao professor.)'] };
        });
      }
    }
  }

  // Marta e a tinta
  if (k === 'marta' && !quest(state, 'tinta') && state.cycle >= 2) {
    add('tinta:inicio', 'Algum problema nos corredores?', (s) => {
      startQuest(s, 'tinta', 'investigar');
      return {
        lines: [
          'Tem. Alguém pinta SUBIR nas paredes. No Nível 1, no 2, na porta do Refeitório. Tinta de casco, da boa. Isso não sai com sabão.',
          'Começa com tinta. Depois são válvulas soltas. Depois alguém abre uma comporta. Eu já vi esse caminho.',
          'A tinta de casco fica na Oficina, no Nível 3. Dê uma olhada. Quero o nome.',
        ],
      };
    });
  }
  if (k === 'davi' && at(state, 'tinta', 'confrontar')) {
    add('tinta:davi', 'Achei a lata de tinta. Com graxa da sua turbina.', (s) => ({
      lines: [
        '(Larga a chave inglesa. Ri sem graça.) A Marta mandou você, é? Claro que mandou.',
        'Fui eu. E não me arrependo. Alguém precisa lembrar essa gente de que existe um "lá em cima". O Conselho finge que não existe.',
        'Então? Vai me trancar no Nível 6?',
      ],
      options: daviChoices(s),
    }));
  }
  if (k === 'marta' && at(state, 'tinta', 'relatar')) {
    add('tinta:relatar', 'Sobre a tinta na parede...', (s) => {
      const q = s.quests.tinta;
      if (q.data.choice === 'preso') {
        nudge(s, 'marta', 15, 'Prendeu quem pintava as paredes.');
        finish(s, 'tinta', 'preso', 'Davi Rocha passou cinco dias confinado.');
        return { lines: ['O Davi. Eu sabia. (Não parece feliz.) Vi esse menino crescer, sabia? Obrigada, Superintendente. A ordem agradece.'] };
      }
      return {
        lines: ['E então? Quem foi?'],
        options: [
          {
            id: 'q:tinta:mentir',
            label: 'Não descobri nada.',
            run: (s2) => {
              adjustReputation(s2, { truth: -3 });
              s2.quests.tinta.data.lied = true;
              finish(s2, 'tinta', s2.quests.tinta.data.choice, 'Você protegeu Davi.');
              return { lines: ['(Olha você de cima a baixo.) Sei. Vou continuar procurando, então.'] };
            },
          },
          {
            id: 'q:tinta:contar',
            label: 'Foi o Davi. Mas eu resolvi com ele.',
            run: (s2) => {
              nudge(s2, 'marta', -6, 'Protegeu Davi depois de descobrir a tinta.');
              adjustReputation(s2, { truth: 3 });
              finish(s2, 'tinta', s2.quests.tinta.data.choice, 'Marta não gostou, mas ouviu.');
              return { lines: ['Resolveu. (Aperta os lábios.) Espero que você saiba o que está fazendo. Se ele soltar uma válvula, a culpa é sua.'] };
            },
          },
        ],
      };
    });
  }

  // Helena
  if (k === 'helena' && !quest(state, 'febre') && (state.cycle >= 5 || state.eventCooldowns.fever)) {
    add('febre:inicio', 'Como estão os remédios?', (s) => {
      startQuest(s, 'febre', 'colher');
      return {
        lines: [
          'Que remédios? (Abre um armário quase vazio.) Restam dois frascos de antibiótico e muita fé.',
          'Mas tem uma alga vermelha que cresce colada às fontes termais, lá fora. Os primeiros médicos faziam um extrato dela. Funciona para febre e para o pulmão.',
          'Se você me trouxer três ramos, eu consigo preparar remédio para um bom tempo. Cuidado: perto das fontes a água ferve.',
        ],
      };
    });
  }
  if (k === 'helena' && at(state, 'febre', 'colher') && hasItem(state, 'alga-vermelha', 3)) {
    add('febre:entregar', 'Trouxe as algas vermelhas.', (s) => {
      takeItem(s, 'alga-vermelha', 3);
      s.flags.medicine = true;
      nudge(s, 'helena', 20, 'Trouxe alga vermelha para os remédios.');
      adjustReputation(s, { mercy: 5 });
      for (const o of living(s)) if (o.status && o.status.kind === 'sick') o.status.days = 1;
      finish(s, 'febre', 'remedio', 'A Enfermaria tem remédio. A febre não vai mais matar ninguém.');
      return {
        lines: [
          '(Examina os ramos contra a luz.) Perfeitas. Você fez isso sem cozinhar dentro do traje, parabéns.',
          'Com isso eu faço extrato para meses. Quem estiver doente se levanta amanhã. E a Clara... a Clara ganha um pouco mais de tempo.',
        ],
      };
    });
  }

  // Clara
  if (k === 'clara' && !quest(state, 'clara') && ((state.player.known[r.id]?.about || 0) >= 2 || state.found.length >= 2) && r.opinion >= 40) {
    add('clara:inicio', 'Você disse que lembra de uma votação.', (s) => {
      startQuest(s, 'clara', 'contar');
      return {
        lines: [
          'Lembro. (Tira os óculos, limpa devagar.) Vinte anos depois da descida, as boias mandavam leituras toda semana. A temperatura lá em cima começou a cair.',
          'O Conselho votou. Cinco a dois. Decidiram lacrar os dados. Disseram que, se o povo soubesse, ia querer subir de uma vez, e não havia trajes, nem barcos, nem nada.',
          'Eu votei contra. O Severino também, ele era o mais novo do Conselho. Perdemos. E ele passou o resto da vida carregando isso.',
        ],
        options: [
          {
            id: 'q:clara:ata',
            label: 'Existe algum registro dessa votação?',
            run: (s2) => {
              giveItem(s2, 'codigo-cofre');
              setStage(s2, 'clara', 'cofre');
              const q = s2.quests.verdade;
              if (q && !q.data.hints.includes('minutes')) q.data.hints.push('minutes');
              return {
                lines: [
                  'A ata. Está no cofre do Conselho, na mesa onde o Augusto senta. Ninguém abre aquilo há quarenta anos.',
                  '(Escreve uns números no verso de uma receita de alga, com a mão tremendo.) O Severino me deu o código antes de morrer. Ele disse: "Se aparecer alguém com coragem, entregue." Eu acho que apareceu.',
                  'Abra à noite, querid{a|o|e}. O Augusto não dorme cedo, mas dorme.',
                ],
                end: true,
              };
            },
          },
        ],
      };
    });
  }

  // Rafael
  if (k === 'rafael' && !quest(state, 'rafael') && !state.found.includes('minutes') && !hasItem(state, 'codigo-cofre') && r.opinion >= 62) {
    add('rafael:inicio', 'Você queria me dizer alguma coisa?', (s) => {
      startQuest(s, 'rafael', 'oferta');
      return {
        lines: [
          '(Olha para os dois lados do corredor.) Meu pai guarda um cofre na mesa dele. Eu sei o código: ele usa o dia em que minha mãe morreu.',
          'Eu nunca abri. Mas acho que tem coisa lá dentro que a colônia devia saber. Você é a primeira pessoa no Conselho que parece pensar o mesmo.',
        ],
        options: [
          {
            id: 'q:rafael:aceitar',
            label: 'Me passe o código. Ninguém vai saber que foi você.',
            run: (s2) => {
              giveItem(s2, 'codigo-cofre');
              s2.quests.rafael.data.gave = true;
              const q = s2.quests.verdade;
              if (q && !q.data.hints.includes('minutes')) q.data.hints.push('minutes');
              finish(s2, 'rafael', 'codigo', 'Rafael entregou o código do cofre.');
              return { lines: ['(Escreve num pedaço de papel e enfia na sua mão.) Se ele descobrir, eu nunca mais vou ser filho dele. Talvez eu já não seja.'] };
            },
          },
          {
            id: 'q:rafael:recusar',
            label: 'Não vou pôr você contra o seu pai.',
            run: (s2) => {
              nudge(s2, 'rafael', 5, 'Recusou usar Rafael contra o pai.');
              adjustReputation(s2, { mercy: 3 });
              finish(s2, 'rafael', 'recusado');
              return { lines: ['(Respira fundo.) Obrigado. Acho. Mas a oferta continua de pé.'] };
            },
          },
        ],
      };
    });
  }

  // Augusto depois do cofre
  if (k === 'augusto' && at(state, 'augusto', 'confronto')) {
    add('augusto:conversa', 'Precisamos conversar sobre o cofre.', (s) => ({
      lines: [
        '(Não levanta os olhos dos papéis.) Você abriu. Eu sabia que alguém ia abrir. O Severino deixou a porta encostada de propósito.',
        'Antes de você me julgar, escute. Em sessenta anos, nenhuma criança morreu de fome nesta colônia. Sabe por quê? Porque ninguém saiu correndo para uma superfície que ainda podia matar.',
        'Nós mentimos para que vocês vivessem. E agora?',
      ],
      options: augustoChoices(s),
    }));
  }

  // Dona Zu
  if (k === 'zuleica' && !quest(state, 'zuleica') && state.cycle >= 2) {
    add('zuleica:inicio', 'O que tem de bom hoje?', (s) => {
      startQuest(s, 'zuleica', 'procurar');
      return {
        lines: [
          'De bom? Alga. De ruim? Alga. De sobremesa? Adivinha.',
          'Meu bem, sabe o que eu daria por um tempero? Um só. Pimenta, cebola, qualquer coisa que tenha gosto de lugar.',
          'Dizem que um dos submarinos dos destroços era de abastecimento. Se a cozinha dele ainda estiver lá... (suspira) ...eu sonho com isso.',
        ],
      };
    });
  }
  if (k === 'zuleica' && at(state, 'zuleica', 'procurar') && hasItem(state, 'pimenta')) {
    add('zuleica:entregar', 'Encontrei uma lata de pimenta nos destroços.', (s) => {
      takeItem(s, 'pimenta');
      nudge(s, 'zuleica', 25, 'Trouxe pimenta de verdade.');
      s.flags.rumorMeter = true;
      shiftMood(s, 4);
      s.resources.food = Math.max(0, s.resources.food - 8);
      scheduleGathering(s, { kind: 'feast', about: residentByKey(s, 'zuleica').id, day: s.cycle, start: 19 * 60, end: 21 * 60, place: 'commons' });
      finish(s, 'zuleica', 'banquete', 'Banquete no Átrio hoje à noite. E agora a Dona Zu conta para você tudo o que circula pelos corredores.');
      return {
        lines: [
          '(Abre a lata. Fecha os olhos. Cheira.) Ai, meu Deus. Ai, meu Deus do céu.',
          'Hoje à noite tem banquete no Átrio. Alga com pimenta! A colônia inteira vai chorar, de ardência e de alegria.',
          'E escuta: de hoje em diante, tudo que eu ouvir nos corredores, você vai saber. Pode conferir no seu diário, eu passo as contas todo dia.',
        ],
      };
    });
  }

  // Teodoro e as crianças
  if (k === 'teodoro' && !quest(state, 'teodoro') && state.found.length >= 2) {
    add('teodoro:inicio', 'Como estão as aulas?', (s) => {
      startQuest(s, 'teodoro', 'decidir');
      return {
        lines: [
          'As crianças ouvem coisas. A Nina perguntou hoje se é verdade que lá em cima está esfriando. Eu não soube o que dizer.',
          'Você agora sabe mais do que eu. Então eu pergunto: o que eu ensino a elas sobre o céu?',
        ],
        options: [
          {
            id: 'q:teodoro:verdade',
            label: 'Ensine o que os documentos dizem.',
            run: (s2) => {
              nudge(s2, 'teodoro', 10, 'Pediu que ele ensinasse a verdade às crianças.');
              adjustReputation(s2, { truth: 5 });
              createRumor(s2, { kind: 'deed', label: 'o Teodoro ensina às crianças que a superfície está esfriando', text: 'O Teodoro anda ensinando que lá em cima está esfriando. Com permissão do Conselho!', opinion: 1, align: { truth: 1 }, knownBy: [residentByKey(s2, 'teodoro').id] });
              finish(s2, 'teodoro', 'verdade');
              return { lines: ['Então vou ensinar. Com cuidado, como se ensina a nadar: um pé de cada vez.'] };
            },
          },
          {
            id: 'q:teodoro:fundadores',
            label: 'Ensine que os Fundadores sabiam o que faziam.',
            run: (s2) => {
              nudge(s2, 'teodoro', -8, 'Pediu que ele calasse a verdade às crianças.');
              adjustReputation(s2, { truth: -4 });
              finish(s2, 'teodoro', 'fundadores');
              return { lines: ['(Fecha o livro devagar.) Ensinar é a única coisa que eu sei fazer. Mentir eu vou ter que aprender.'] };
            },
          },
          {
            id: 'q:teodoro:esperanca',
            label: 'Diga a elas que um dia todos vamos subir.',
            run: (s2) => {
              nudge(s2, 'teodoro', 5, 'Pediu que ele ensinasse esperança.');
              adjustReputation(s2, { mercy: 3 });
              finish(s2, 'teodoro', 'esperanca');
              return { lines: ['Esperança. Isso eu sei ensinar. E talvez seja até verdade.'] };
            },
          },
        ],
      };
    });
  }

  // Pedidos do dia a dia
  for (const f of state.favors || []) {
    if (f.done) continue;
    if (f.residentId === r.id && f.kind !== 'recado') {
      const ready = f.kind === 'sucata' ? hasItem(state, 'sucata', f.qty) : f.kind === 'racao' ? hasItem(state, 'racao', 1) : false;
      if (ready) {
        add(`favor:${f.id}`, f.kind === 'sucata' ? `Trouxe as ${f.qty} sucatas que você pediu.` : 'Trouxe a ração extra.', (s) => {
          takeItem(s, f.kind === 'sucata' ? 'sucata' : 'racao', f.kind === 'sucata' ? f.qty : 1);
          completeFavor(s, f);
          return { lines: [pick(s, ['Você lembrou! Obrigad<a|o|e>. De verdade.', 'Nem acredito. Ninguém do Conselho nunca fez isso por mim.', 'Isso vai ajudar muito. Fico te devendo.'])] };
        });
      }
    }
    if (f.kind === 'recado' && f.targetId === r.id) {
      const from = residentById(state, f.residentId);
      if (from && from.alive) {
        add(`favor:${f.id}`, `${displayName(from)} mandou dizer que sente muito.`, (s) => {
          completeFavor(s, f);
          from.bonds[r.id] = clamp((from.bonds[r.id] || 0) + 30, -100, 100);
          r.bonds[from.id] = clamp((r.bonds[from.id] || 0) + 30, -100, 100);
          r.opinion = clamp(r.opinion + 4, 0, 100);
          return { lines: [`(Fica em silêncio um tempo.) ${displayName(from)} disse isso? ...Diga que eu também. Diga que eu também sinto.`] };
        });
      }
    }
  }
  return out;
}

function ireneChoices(state) {
  const opts = [
    {
      id: 'q:irene:pensar',
      label: 'Preciso pensar.',
      run: () => ({ lines: ['Pense. Mas não pense demais. Cada dia que passa, a Nina cresce mais um pouco aqui embaixo.'] }),
    },
    {
      id: 'q:irene:nao',
      label: 'Não. A Nina precisa de você aqui.',
      run: (s) => {
        nudge(s, 'irene', -15, 'Teve o pedido para subir negado.');
        adjustReputation(s, { mercy: -2 });
        setStage(s, 'irene', 'negado');
        s.quests.irene.data.deniedDay = s.cycle;
        return { lines: ['(Os olhos endurecem.) A Nina precisa de uma mãe que não esteja morrendo um pouco por dia. Mas tudo bem. O Conselho decidiu.'], end: true };
      },
    },
    {
      id: 'q:irene:traje',
      label: 'Vou conseguir um traje para você.',
      run: (s) => {
        setStage(s, 'irene', 'traje');
        nudge(s, 'irene', 8);
        return { lines: ['(Segura o seu braço.) Obrigada. O Ícaro fica na Eclusa, no Nível 1. Ele vai resistir. Ele sempre resiste.'] };
      },
    },
  ];
  if (state.found.includes('buoy') || state.found.includes('zenith')) {
    opts.splice(2, 0, {
      id: 'q:irene:provas',
      label: 'Espere. Tenho provas de que a superfície está mudando.',
      run: (s) => {
        nudge(s, 'irene', 20, 'Ouviu sobre as provas da superfície.');
        adjustReputation(s, { truth: 4 });
        finish(s, 'irene', 'aliada', 'Irene vai esperar, e ajudar a preparar uma subida de todos.');
        return {
          lines: [
            '(Lê as leituras uma vez. Duas. Três.) Está caindo. A temperatura está caindo de verdade.',
            'Então eu não preciso subir sozinha para morrer. Eu posso esperar e subir com todo mundo. Com a Nina.',
            'Conte comigo. Para o que for. Eu sei consertar qualquer coisa que tenha uma válvula.',
          ],
          end: true,
        };
      },
    });
  }
  return opts;
}

function daviChoices(state) {
  const opts = [
    {
      id: 'q:tinta:prender',
      label: 'Você está detido. Cinco dias no alojamento.',
      run: (s) => {
        const davi = residentByKey(s, 'davi');
        davi.override = { activity: 'detained', place: { kind: 'bunk', module: davi.home, index: 0 }, until: (s.cycle + 5) * 1440 };
        nudge(s, 'davi', -35, 'Foi detido pelo Conselho.');
        nudge(s, 'dalva', -25, 'O filho foi detido pelo Conselho.');
        nudge(s, 'bia', -20, 'O irmão foi detido pelo Conselho.');
        adjustReputation(s, { mercy: -8, truth: -2 });
        createRumor(s, { kind: 'deed', label: 'o Conselho prendeu o Davi por pintar paredes', text: 'Prenderam o Davi Rocha por causa de tinta! Tinta!', opinion: -1, align: { mercy: 1, truth: 0.5 }, knownBy: [davi.id] });
        s.quests.tinta.data.choice = 'preso';
        setStage(s, 'tinta', 'relatar');
        return { lines: ['(Levanta as mãos.) Pode me trancar. A tinta continua na parede.'], end: true };
      },
    },
    {
      id: 'q:tinta:acordo',
      label: 'Pare com isso e eu não conto para a Marta.',
      run: (s) => {
        nudge(s, 'davi', 10, 'Fez um acordo de silêncio sobre a tinta.');
        s.quests.tinta.data.choice = 'acordo';
        s.flags.noSabotage = true;
        setStage(s, 'tinta', 'relatar');
        return { lines: ['(Estreita os olhos.) Combinado. Mas a pergunta continua: por que o Conselho não fala da superfície?'] };
      },
    },
  ];
  if (state.revealed > 0 || state.player.reputation.truth >= 15) {
    opts.push({
      id: 'q:tinta:aliado',
      label: 'Você não precisa pintar paredes. Eu vou contar a verdade a todos.',
      run: (s) => {
        nudge(s, 'davi', 25, 'Ouviu do Conselho que a verdade seria contada.');
        nudge(s, 'bia', 10);
        adjustReputation(s, { truth: 5 });
        s.flags.noSabotage = true;
        s.quests.tinta.data.choice = 'aliado';
        setStage(s, 'tinta', 'relatar');
        return { lines: ['(Fica um tempo sem reação.) Você está falando sério. (Estende a mão suja de graxa.) Então os Subidores estão com você. Sem tinta, sem válvula. Por enquanto.'] };
      },
    });
  }
  return opts;
}

function augustoChoices(state) {
  return [
    {
      id: 'q:augusto:confrontar',
      label: 'Vocês mentiram por sessenta anos.',
      run: (s) => {
        nudge(s, 'augusto', -20, 'Foi confrontado sobre a ata do Conselho.');
        adjustReputation(s, { truth: 4 });
        finish(s, 'augusto', 'confronto');
        return { lines: ['Mentimos. E faria de novo. (Levanta, enfim.) Se você vai contar a todos, conte direito: conte também quantos estariam vivos se tivessem subido antes da hora. Nenhum.'] };
      },
    },
    {
      id: 'q:augusto:pacto',
      label: 'Eu entendo. Isso fica entre nós.',
      run: (s) => {
        nudge(s, 'augusto', 30, 'Selou um pacto de silêncio sobre a ata.');
        adjustReputation(s, { truth: -10 });
        finish(s, 'augusto', 'pacto');
        return { lines: ['(Pela primeira vez, um sorriso.) Agora você entende o peso dessa cadeira. Bem-vind{a|o|e} ao Conselho de verdade.'] };
      },
    },
    {
      id: 'q:augusto:decidir',
      label: 'Eu entendo o medo. Mas a decisão agora é minha.',
      run: (s) => {
        nudge(s, 'augusto', 5, 'Ouviu que a decisão agora é do novo Superintendente.');
        finish(s, 'augusto', 'neutro');
        return { lines: ['É. É sua. (Senta de novo.) Que os Fundadores tenham piedade de nós dois.'] };
      },
    },
  ];
}

// Saudações especiais de missão (substituem a saudação comum).
function greetingFor(state, r) {
  if (r.key === 'augusto' && at(state, 'verdade', 'chegada')) {
    return 'Superintendente. Bem-vind{a|o|e} à cadeira que ninguém quer. (Aperta sua mão com força.) O Severino gostava de você, sabia? Eu ainda não decidi se gosto.';
  }
  if (r.key === 'teodoro' && (at(state, 'verdade', 'teodoro') || at(state, 'verdade', 'terminal'))) {
    return 'Até que enfim! Entre, entre. Tenho uma coisa que é sua.';
  }
  if (r.key === 'irene' && at(state, 'irene', 'pedido') && !state.quests.irene.data.heard) {
    state.quests.irene.data.heard = true;
    return 'Superintendente. Posso falar com você? (Baixa a voz.) Em particular.';
  }
  if (r.key === 'augusto' && at(state, 'augusto', 'confronto')) return '(Fecha a pasta devagar.) Sente-se.';
  return null;
}

// ---------------------------------------------------------------------------
// Objetos e itens do mundo

export function onInteract(state, objectId) {
  if (objectId === 'terminal' && at(state, 'verdade', 'terminal')) setStage(state, 'verdade', 'teodoro');
  if (objectId === 'cofre') {
    if (state.found.includes('minutes')) return { ok: false, text: 'O cofre está vazio agora.' };
    if (!hasItem(state, 'codigo-cofre')) return { ok: false, text: 'Um cofre de aço com teclado de seis dígitos. Você não sabe o código.' };
    const augusto = key(state, 'augusto');
    const witnesses = [];
    const clara = key(state, 'clara');
    if (at(state, 'clara', 'cofre') && clara) witnesses.push(clara.id);
    const rafael = key(state, 'rafael');
    if (quest(state, 'rafael') && quest(state, 'rafael').data.gave && rafael) witnesses.push(rafael.id);
    const minute = state.time.minute % 1440;
    const augustoAtDesk = augusto && minute >= 7 * 60 && minute < 18 * 60 && !augusto.away;
    if (augustoAtDesk) {
      witnesses.push(augusto.id);
      nudge(state, 'augusto', -15, 'Viu o cofre ser aberto na frente dele.');
    }
    takeItem(state, 'codigo-cofre');
    discoverFragment(state, 'minutes', witnesses);
    if (at(state, 'clara', 'cofre')) finish(state, 'clara', 'ata', 'A ata da votação está com você.');
    if (augusto) startQuest(state, 'augusto', 'confronto');
    if (rafael && quest(state, 'rafael') && quest(state, 'rafael').data.gave && augusto) {
      createRumor(state, { kind: 'deed', label: 'o Rafael passou o código do cofre do pai', text: 'Dizem que foi o próprio filho do Augusto quem entregou o código do cofre.', opinion: 0, knownBy: [rafael.id] });
    }
    return { ok: true, text: augustoAtDesk ? 'O cofre se abre com um estalo. Augusto, na mesa ao lado, observa em silêncio.' : 'O cofre se abre com um estalo. Dentro, uma pasta amarelada.' };
  }
  return null;
}

export function onPickup(state, itemId) {
  if (itemId === 'lata-tinta' && at(state, 'tinta', 'investigar')) setStage(state, 'tinta', 'confrontar');
}

export function worldItemVisible(state, item) {
  if (item.requires === 'tinta') return at(state, 'tinta', 'investigar');
  return true;
}

// ---------------------------------------------------------------------------
// Passagem dos dias

const FAVOR_KINDS = ['sucata', 'racao', 'recado'];

function completeFavor(state, f) {
  f.done = true;
  const r = residentById(state, f.residentId);
  if (r) {
    r.opinion = clamp(r.opinion + 10, 0, 100);
    r.mood = clamp(r.mood + 6, 0, 100);
    remember(r, { day: state.cycle, kind: 'player', text: 'Teve um pedido atendido pelo Conselho.', weight: 10 });
    for (const id of Object.keys(r.kin)) {
      const o = residentById(state, Number(id));
      if (o && o.alive) o.opinion = clamp(o.opinion + 3, 0, 100);
    }
  }
  adjustReputation(state, { mercy: 1 });
  refreshAggregates(state);
  addLog(state, `Pedido atendido: ${f.text}`, 'good', f.residentId);
}

export function favorText(state, f) {
  const r = residentById(state, f.residentId);
  const name = r ? fullName(r) : 'Alguém';
  if (f.kind === 'sucata') return `${name} precisa de ${f.qty} sucatas para consertar o beliche.`;
  if (f.kind === 'racao') return `${name} pede uma ração extra para a família.`;
  const t = residentById(state, f.targetId);
  return `${name} quer que você diga a ${t ? fullName(t) : 'alguém'} que sente muito.`;
}

function newFavors(state) {
  state.favors = (state.favors || []).filter((f) => !f.done && state.cycle - f.day < 4);
  if (state.favors.length >= 3) return;
  const candidates = inBase(state).filter((r) => !r.key && r.age >= 16 && r.opinion >= 30 && !state.favors.some((f) => f.residentId === r.id));
  if (candidates.length === 0 || hash01('favor', state.cycle, state.seed) > 0.75) return;
  const r = candidates[Math.floor(hash01('favor-who', state.cycle, state.seed) * candidates.length)];
  let kind = FAVOR_KINDS[Math.floor(hash01('favor-kind', state.cycle, r.id) * FAVOR_KINDS.length)];
  let targetId = null;
  if (kind === 'recado') {
    const rival = Object.entries(r.bonds).find(([id, v]) => v < -20 && residentById(state, Number(id))?.alive);
    if (rival) targetId = Number(rival[0]);
    else kind = 'sucata';
  }
  const f = { id: state.nextFavorId++, residentId: r.id, kind, qty: kind === 'sucata' ? 3 : 1, targetId, day: state.cycle, done: false };
  f.text = favorText(state, f);
  state.favors.push(f);
}

export function onDayStart(state) {
  // Irene parte na noite seguinte à entrega do traje.
  const irene = quest(state, 'irene');
  if (irene && !irene.done && irene.stage === 'partida' && state.cycle > irene.data.leaveDay) {
    const r = key(state, 'irene');
    if (r) {
      recordDeath(state, r, 'ascension', { silent: true });
      addLog(state, 'Irene Castellan subiu pela Coluna de Ascensão durante a noite. A Nina dormia.', 'story', r.id);
      reassignNina(state);
    }
    finish(state, 'irene', 'subiu');
  }
  // Irene, negada e sem esperança, vai embora sozinha.
  if (irene && !irene.done && irene.stage === 'negado' && state.cycle - irene.data.deniedDay >= 6) {
    const r = key(state, 'irene');
    if (r && r.opinion < 30) {
      recordDeath(state, r, 'ascension', { silent: true });
      addLog(state, 'Irene Castellan sumiu durante a noite. Um traje desapareceu da eclusa.', 'crit', r.id);
      reassignNina(state);
      createRumor(state, { kind: 'deed', label: 'a Irene fugiu porque o Conselho negou', text: 'A Irene pediu para subir, o Conselho negou e ela foi assim mesmo. Deixou a filha.', opinion: -4, align: { mercy: 1 }, knownBy: [residentByKey(state, 'marta')?.id].filter(Boolean) });
      finish(state, 'irene', 'fugiu');
    } else if (r) {
      finish(state, 'irene', 'ficou', 'Irene ficou. Ainda olha para cima, mas ficou.');
    }
  }
  // Irene pede para falar com você a partir do terceiro dia.
  if (!quest(state, 'irene') && state.cycle >= 3) {
    const r = key(state, 'irene');
    if (r && r.opinion >= 30) startQuest(state, 'irene', 'pedido');
  }
  // Davi sai da detenção.
  const davi = key(state, 'davi');
  if (davi && davi.override && davi.override.until <= state.cycle * 1440) davi.override = null;

  // Clara está no fim da vida. O remédio de Helena dá mais tempo a ela.
  const clara = key(state, 'clara');
  const lastDay = state.flags.medicine ? 34 : 24;
  if (clara && state.cycle >= lastDay) {
    recordDeath(state, clara, 'age');
    addLog(state, 'Clara Nogueira, uma das fundadoras, morreu dormindo. Tinha 84 anos.', 'story', clara.id);
    if (at(state, 'clara', 'contar')) finish(state, 'clara', 'tarde', 'Clara morreu antes de contar tudo.');
  }

  newFavors(state);
}

function reassignNina(state) {
  const nina = key(state, 'nina');
  const marta = key(state, 'marta');
  if (nina) {
    nina.mood = clamp(nina.mood - 35, 0, 100);
    nina.opinion = clamp(nina.opinion - 15, 0, 100);
    remember(nina, { day: state.cycle, kind: 'grief', text: 'A mãe subiu e não voltou.', weight: -35 });
    if (marta) nina.home = marta.home;
  }
}

// ---------------------------------------------------------------------------
// Diário: objetivos ativos

export function objectives(state) {
  const out = [];
  const v = quest(state, 'verdade');
  if (v && !v.done) {
    const text = {
      chegada: 'Fale com Augusto Mendonça, no Núcleo (Nível 1).',
      terminal: 'Use o Terminal do Conselho, no Núcleo.',
      teodoro: 'Procure Teodoro Lins no Arquivo do Núcleo.',
      busca: `Encontre os documentos da fundação (${state.found.length}/5).`,
    }[v.stage];
    if (text) out.push({ quest: 'verdade', text, main: true, target: v.stage === 'chegada' ? 'augusto' : v.stage === 'teodoro' ? 'teodoro' : null });
  }
  const add = (id, text, target = null, exterior = null) => {
    const q = quest(state, id);
    if (q && !q.done) out.push({ quest: id, text, target, exterior });
  };
  const irene = quest(state, 'irene');
  if (irene && !irene.done) {
    if (irene.stage === 'pedido') add('irene', 'Irene Castellan quer falar com você em particular.', 'irene');
    if (irene.stage === 'traje') add('irene', hasItem(state, 'traje-velho') ? 'Leve o traje para Irene.' : 'Peça um traje a Ícaro Vale, na Eclusa.', hasItem(state, 'traje-velho') ? 'irene' : 'icaro');
    if (irene.stage === 'partida') add('irene', 'Irene vai subir esta noite.');
  }
  add('nina', hasItem(state, 'foto-ceu') ? 'Leve a fotografia do céu para Nina.' : 'Encontre uma relíquia do céu para Nina. Talvez nos destroços.', hasItem(state, 'foto-ceu') ? 'nina' : null, hasItem(state, 'foto-ceu') ? null : 'wreck');
  const tinta = quest(state, 'tinta');
  if (tinta && !tinta.done) {
    if (tinta.stage === 'investigar') add('tinta', 'Procure pistas da tinta na Oficina de Sucata (Nível 3).');
    if (tinta.stage === 'confrontar') add('tinta', 'Confronte Davi Rocha.', 'davi');
    if (tinta.stage === 'relatar') add('tinta', 'Volte a falar com Marta Quintal.', 'marta');
  }
  add('ruth', hasItem(state, 'placa-ruth') ? 'Devolva a placa a Ícaro Vale.' : 'Encontre a placa de Ruth no fundo da Fenda Abissal.', hasItem(state, 'placa-ruth') ? 'icaro' : null, hasItem(state, 'placa-ruth') ? null : 'rift');
  const algae = state.player.inventory['alga-vermelha'] || 0;
  add('febre', algae >= 3 ? 'Leve as algas vermelhas para Helena.' : `Colha algas vermelhas junto às fontes termais (${algae}/3).`, algae >= 3 ? 'helena' : null, algae >= 3 ? null : 'vents');
  const clara = quest(state, 'clara');
  if (clara && !clara.done) add('clara', clara.stage === 'cofre' ? 'Abra o cofre do Conselho, na mesa de Augusto. De preferência à noite.' : 'Ouça o que Clara Nogueira tem a dizer.', clara.stage === 'cofre' ? null : 'clara');
  add('augusto', 'Augusto Mendonça quer conversar.', 'augusto');
  add('zuleica', hasItem(state, 'pimenta') ? 'Leve a pimenta para Dona Zu.' : 'Procure um tempero na cozinha de um submarino dos destroços.', hasItem(state, 'pimenta') ? 'zuleica' : null, hasItem(state, 'pimenta') ? null : 'wreck');
  for (const f of state.favors || []) if (!f.done) out.push({ quest: 'favor', text: f.text, target: null, favor: true });
  return out;
}

export function fragmentHints(state) {
  const v = quest(state, 'verdade');
  if (!v) return [];
  return FRAGMENTS.map((f) => ({ id: f.id, title: f.title, found: state.found.includes(f.id), hint: (v.data.hints || []).includes(f.id) ? FRAGMENT_HINTS[f.id] : null }));
}

export function initQuests(state) {
  if (!state.quests.verdade) startQuest(state, 'verdade', 'chegada', { hints: [] });
  if (!state.favors) state.favors = [];
  if (!state.nextFavorId) state.nextFavorId = 1;
}

registerQuestHooks({ options: optionsFor, greeting: greetingFor });

