// Traços de personalidade. Cada morador tem dois. Os números alimentam a
// simulação social; os rótulos e as falas dão voz a cada combinação.
//
// truth: quanto a pessoa valoriza transparência (positivo) ou ordem e sigilo (negativo).
// mercy: quanto valoriza compaixão (positivo) ou rigor (negativo).
// gossip: chance de repassar boatos. social: vontade de estar com gente.
// mood: deslocamento do humor de base. sensitivity: quanto o humor reage ao que acontece.
// diligence: produtividade. stubborn: resistência a mudar de função.

export const TRAITS = {
  curioso: {
    label: 'Curioso',
    desc: 'Faz perguntas demais e guarda tudo o que acha.',
    truth: 0.45,
    social: 0.1,
    likes: ['relic', 'book'],
  },
  leal: {
    label: 'Leal',
    desc: 'Confia no Conselho e nas regras que mantêm todos vivos.',
    truth: -0.35,
    mercy: -0.05,
    opinion: 6,
  },
  rebelde: {
    label: 'Rebelde',
    desc: 'Desconfia de quem manda e diz isso em voz alta.',
    truth: 0.55,
    opinion: -8,
    stubborn: 0.3,
  },
  ansioso: {
    label: 'Ansioso',
    desc: 'Ouve cada rangido do casco. Dorme mal.',
    sensitivity: 0.4,
    mood: -4,
  },
  gentil: {
    label: 'Gentil',
    desc: 'Divide a ração com quem precisa.',
    mercy: 0.55,
    social: 0.1,
  },
  rabugento: {
    label: 'Rabugento',
    desc: 'Reclama de tudo, mas aparece para trabalhar.',
    mood: -8,
    sensitivity: -0.1,
  },
  fofoqueiro: {
    label: 'Fofoqueiro',
    desc: 'Sabe de tudo antes de todo mundo.',
    gossip: 0.45,
    social: 0.25,
  },
  devoto: {
    label: 'Devoto dos Fundadores',
    desc: 'Acredita que os Fundadores sabiam o que faziam.',
    truth: -0.45,
    opinion: 4,
    likes: ['book'],
  },
  ambicioso: {
    label: 'Ambicioso',
    desc: 'Quer mais responsabilidade e não esconde isso.',
    diligence: 0.08,
    stubborn: 0.15,
  },
  melancolico: {
    label: 'Melancólico',
    desc: 'Sente falta de coisas que nunca viu.',
    mood: -6,
    truth: 0.2,
    likes: ['music', 'relic'],
  },
  brincalhao: {
    label: 'Brincalhão',
    desc: 'Uma piada para cada desgraça.',
    mood: 8,
    social: 0.2,
  },
  teimoso: {
    label: 'Teimoso',
    desc: 'Quando decide uma coisa, ninguém muda.',
    stubborn: 0.45,
  },
  trabalhador: {
    label: 'Trabalhador',
    desc: 'Chega antes e sai depois.',
    diligence: 0.12,
  },
  preguicoso: {
    label: 'Preguiçoso',
    desc: 'Faz o mínimo e defende o próprio descanso.',
    diligence: -0.12,
    mood: 3,
  },
  sonhador: {
    label: 'Sonhador',
    desc: 'Vive falando da superfície como se já tivesse estado lá.',
    truth: 0.35,
    mood: 3,
    likes: ['relic', 'music'],
  },
  pragmatico: {
    label: 'Pragmático',
    desc: 'O que importa é o oxigênio de amanhã.',
    truth: -0.15,
    mercy: -0.25,
  },
  solitario: {
    label: 'Solitário',
    desc: 'Prefere o barulho das máquinas ao das pessoas.',
    social: -0.45,
    gossip: -0.2,
  },
  protetor: {
    label: 'Protetor',
    desc: 'A família vem antes de qualquer coisa.',
    mercy: 0.25,
    sensitivity: 0.15,
  },
  generoso: {
    label: 'Generoso',
    desc: 'Lembra o nome de todo mundo e o que cada um gosta de comer.',
    mercy: 0.35,
    social: 0.15,
    likes: ['food'],
  },
  desconfiado: {
    label: 'Desconfiado',
    desc: 'Acha que todo favor tem um preço.',
    opinion: -5,
    gossip: 0.1,
  },
};

export const TRADES = {
  vida: 'Suporte de vida',
  cultivo: 'Cultivo',
  mecânica: 'Mecânica',
  cuidado: 'Cuidado',
};

// Combinações que não fazem sentido juntas.
export const TRAIT_CONFLICTS = [
  ['leal', 'rebelde'],
  ['trabalhador', 'preguicoso'],
  ['brincalhao', 'melancolico'],
  ['solitario', 'fofoqueiro'],
  ['devoto', 'rebelde'],
  ['gentil', 'desconfiado'],
  ['brincalhao', 'rabugento'],
];

// Converte os traços em números usados pela simulação.
export function personalityFrom(traits) {
  const p = {
    truth: 0,
    mercy: 0,
    gossip: 0.2,
    social: 0.5,
    mood: 55,
    sensitivity: 1,
    diligence: 1,
    stubborn: 0.2,
    opinionBias: 0,
    likes: ['food'],
  };
  for (const key of traits) {
    const t = TRAITS[key];
    if (!t) continue;
    p.truth += t.truth || 0;
    p.mercy += t.mercy || 0;
    p.gossip += t.gossip || 0;
    p.social += t.social || 0;
    p.mood += t.mood || 0;
    p.sensitivity += t.sensitivity || 0;
    p.diligence += t.diligence || 0;
    p.stubborn += t.stubborn || 0;
    p.opinionBias += t.opinion || 0;
    for (const like of t.likes || []) if (!p.likes.includes(like)) p.likes.push(like);
  }
  p.truth = clamp(p.truth, -1, 1);
  p.mercy = clamp(p.mercy, -1, 1);
  p.gossip = clamp(p.gossip, 0, 1);
  p.social = clamp(p.social, 0, 1);
  p.sensitivity = clamp(p.sensitivity, 0.5, 1.6);
  p.stubborn = clamp(p.stubborn, 0, 1);
  return p;
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}
