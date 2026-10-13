// Ponto de entrada: monta o jogo e integra o salvamento com o visualizador.

import { App } from './app.js';
import { serialize } from './engine/game.js';

const hot = window.claude && window.claude.hot;
if (hot && hot.data && hot.data.save) {
  try {
    localStorage.setItem('nadir.save.v2', hot.data.save);
  } catch {
    // ignorado
  }
}

const app = new App(document.getElementById('app'));
window.__nadir = app;

if (hot && typeof hot.snapshot === 'function') {
  hot.snapshot(() => ({ save: app.state && app.state.status === 'playing' ? serialize(app.state) : null }));
}
