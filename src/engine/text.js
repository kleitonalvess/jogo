// Utilidades de texto em português: concordância de gênero em modelos e
// formatação de listas.

// Substitui {forma f|forma m|forma n} conforme o gênero gramatical.
// Sem a terceira forma, o neutro usa a masculina.
export function forms(text, g) {
  return text.replace(/\{([^{}|]*)\|([^{}|]*)(?:\|([^{}|]*))?\}/g, (_, f, m, n) => (g === 'f' ? f : g === 'n' ? (n ?? m) : m));
}

export function listPt(items) {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

export function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export function clockLabel(minute) {
  const m = ((Math.floor(minute) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

const KIN_LABELS = {
  spouse: ['esposa', 'marido', 'companheire'],
  parent: ['mãe', 'pai', 'mãe/pai'],
  child: ['filha', 'filho', 'filhe'],
  sibling: ['irmã', 'irmão', 'irmane'],
  aunt: ['tia', 'tio', 'tie'],
  niece: ['sobrinha', 'sobrinho', 'sobrinhe'],
};

// Rótulo do parentesco de "other" do ponto de vista de quem fala.
export function kinLabel(kind, other) {
  const set = KIN_LABELS[kind];
  if (!set) return null;
  return other.g === 'f' ? set[0] : other.g === 'n' ? set[2] : set[1];
}
