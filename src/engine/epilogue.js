// Epílogo: o que aconteceu com cada personagem principal, conforme as
// escolhas feitas ao longo da partida.

import { residentByKey } from './people/population.js';

function q(state, id) {
  return state.quests[id] || null;
}

export function epilogue(state) {
  const ending = state.outcome && state.outcome.kind === 'ending' ? state.outcome.key : null;
  const truth = ending === 'truth';
  const lines = [];
  const alive = (key) => {
    const r = residentByKey(state, key);
    return r && r.alive;
  };
  const add = (key, text) => {
    const r = residentByKey(state, key);
    if (r) lines.push({ key, name: `${r.first} ${r.last}`, text });
  };

  // Irene e Nina
  const irene = q(state, 'irene');
  if (irene && irene.outcome === 'subiu') {
    add('irene', truth ? 'Quando a primeira equipe chegou à costa norte, encontrou um abrigo de lona e um diário. Irene tinha chegado. Tinha esperado por eles.' : 'Ninguém soube o que aconteceu com Irene. Nina ainda olha para cima toda noite.');
  } else if (irene && irene.outcome === 'fugiu') {
    add('irene', 'Irene subiu sozinha, sem a bênção de ninguém. O traje dela nunca voltou.');
  } else if (alive('irene')) {
    add('irene', truth ? 'Irene foi a primeira a sentir vento. Ajoelhou na areia e riu até chorar.' : 'Irene continua cuidando das membranas. Às vezes para no meio do turno e encosta a testa no vidro.');
  }
  if (alive('nina')) {
    const sky = q(state, 'nina') && q(state, 'nina').outcome === 'ceu';
    add('nina', truth ? `Nina viu o céu de verdade aos ${residentByKey(state, 'nina').age + 1} anos.${sky ? ' Comparou com a foto e disse que a foto era mais bonita. Ninguém acreditou nela.' : ''}` : sky ? 'Nina guarda a foto do céu no lugar de honra. Ela vai ser escafandrista. Ela já decidiu.' : 'Nina cresce entre canos e lâmpadas, colecionando relíquias de um mundo que nunca viu.');
  }

  // Davi e Marta
  const tinta = q(state, 'tinta');
  if (alive('davi')) {
    if (tinta && tinta.outcome === 'aliado') add('davi', truth ? 'Davi liderou os Subidores na construção das plataformas de subida. Pintou SUBIR uma última vez, no casco, por fora.' : 'Davi esperou a verdade que você prometeu. Esperou muito. Os Subidores voltaram a se reunir em segredo.');
    else if (tinta && tinta.outcome === 'preso') add('davi', 'Davi saiu da detenção mais quieto. A tinta nas paredes também sumiu, mas a palavra ficou na cabeça de todo mundo.');
    else add('davi', truth ? 'Davi desmontou a turbina que mantinha a colônia viva e a remontou num barco.' : 'Davi continua consertando turbinas e contando piadas sobre garrafas.');
  }
  if (alive('marta')) add('marta', truth ? 'Marta foi a última a subir. Conferiu cada comporta antes, duas vezes.' : 'Marta mantém a ordem nos corredores. Ninguém ousa perguntar o que há no cofre do Conselho.');

  // Ícaro, Helena, Clara, Teodoro, Zuleica
  if (alive('icaro')) {
    const ruth = q(state, 'ruth') && q(state, 'ruth').outcome === 'devolvida';
    add('icaro', ruth ? 'Ícaro usa a placa de Ruth pendurada no pescoço, ao lado da dele. Voltou a sorrir no refeitório.' : 'Ícaro ainda passa pela borda da Fenda toda semana. Ainda não desce.');
  }
  if (alive('helena')) add('helena', q(state, 'febre') && q(state, 'febre').outcome === 'remedio' ? 'Com o extrato de alga vermelha, Helena não perdeu mais ninguém para a febre.' : 'Helena continua dizendo a todos que vão ficar bem. Às vezes é verdade.');
  const clara = residentByKey(state, 'clara');
  if (clara) add('clara', clara.alive ? 'Clara viveu para ver o fim do segredo que ajudou a enterrar sessenta anos atrás.' : truth ? 'O nome de Clara Nogueira foi o primeiro gravado na placa da subida. "Votou contra", diz embaixo.' : 'Clara morreu sem ver a verdade aberta. A receita com o código do cofre ficou numa gaveta.');
  if (alive('teodoro')) {
    const t = q(state, 'teodoro');
    add('teodoro', t && t.outcome === 'verdade' ? 'Teodoro ensinou às crianças a ler as leituras da boia 7. Elas aprenderam mais rápido do que os adultos.' : 'Teodoro segue salvando palavras do mofo, uma página por dia.');
  }
  if (alive('zuleica')) add('zuleica', q(state, 'zuleica') && q(state, 'zuleica').outcome === 'banquete' ? 'Dona Zu plantou as sementes da lata de pimenta no Átrio. Hoje a colônia tem tempero.' : 'Dona Zu continua sabendo de tudo antes de todo mundo.');

  // Augusto e Rafael
  if (alive('augusto')) {
    const a = q(state, 'augusto');
    if (a && a.outcome === 'pacto') add('augusto', truth ? 'Augusto nunca perdoou você por quebrar o pacto. Ficou na colônia quando todos subiram.' : 'Augusto e você guardam o cofre juntos. Ele diz que você aprendeu o peso da cadeira.');
    else add('augusto', truth ? 'Augusto renunciou no dia da leitura dos arquivos. Foi visto chorando no Átrio, sozinho.' : 'Augusto continua no Conselho, contando cada litro de oxigênio.');
  }
  if (alive('rafael')) add('rafael', q(state, 'rafael') && q(state, 'rafael').outcome === 'codigo' ? 'Rafael deixou a Guarda e foi trabalhar na Oficina. O pai não fala com ele.' : 'Rafael continua fazendo a ronda da noite, parando no Átrio para olhar as lâmpadas.');
  return lines;
}
