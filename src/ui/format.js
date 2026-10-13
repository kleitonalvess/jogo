// Formatação e pequenos utilitários de interface.

const nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

export function fmt(n) {
  return nf.format(Math.abs(n) >= 10 ? Math.round(n) : Math.round(n * 10) / 10);
}

export function signed(n) {
  if (Math.abs(n) < 0.05) return '±0';
  return (n > 0 ? '+' : '−') + fmt(Math.abs(n));
}

export function pct(n) {
  return `${Math.round(n * 100)}%`;
}

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Botão com data-action e parâmetros em data-*.
export function btn(action, params, content, { cls = '', disabled = false, label = '', extra = '' } = {}) {
  const data = Object.entries(params)
    .map(([k, v]) => ` data-${k}="${esc(v)}"`)
    .join('');
  return `<button type="button" class="${cls}" data-action="${action}"${data}${disabled ? ' disabled' : ''}${label ? ` aria-label="${esc(label)}"` : ''}${extra}>${content}</button>`;
}

export function meter(value, cls = '') {
  const v = Math.max(0, Math.min(100, value));
  const tone = v < 25 ? 'crit' : v < 45 ? 'warn' : 'ok';
  return `<span class="meter ${cls} ${tone}" aria-hidden="true"><span style="width:${v}%"></span></span>`;
}
