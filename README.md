# Nadir

Jogo de gestão de recursos por turnos. O clima tornou a superfície inabitável e a humanidade passou a viver no fundo do mar. Você comanda o Conselho da Colônia Nadir: distribui pessoas, constrói módulos, cria leis e decide o que a população pode saber sobre a superfície.

O documento de design completo está em [`docs/GDD.md`](docs/GDD.md).

## Como jogar

Requer Node.js 18 ou superior. Não há dependências para instalar.

```bash
npm start          # abre em http://localhost:5173
```

Para gerar uma versão em arquivo único, que abre direto no navegador sem servidor:

```bash
npm run build      # gera dist/nadir.html
```

A partida é salva automaticamente no navegador.

## Desenvolvimento

```bash
npm test           # testes do motor e de balanceamento
npm run simulate   # joga partidas automáticas e mostra estatísticas de balanceamento
```

| Caminho | Conteúdo |
| --- | --- |
| `src/engine/data.js` | Todos os números de balanceamento, módulos, leis, expedições e fragmentos |
| `src/engine/events.js` | Eventos narrativos e finais |
| `src/engine/game.js` | Motor da simulação (sem DOM, determinístico por semente) |
| `src/ui.js`, `src/main.js`, `src/style.css` | Interface |
| `scripts/` | Servidor local, build em arquivo único e simulador de balanceamento |
| `tests/` | Testes com o executor nativo do Node |
