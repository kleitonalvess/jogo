# Nadir

Jogo de simulação de vida e gestão de colônia em terceira pessoa. O clima tornou a superfície inabitável e a humanidade passou a viver no fundo do mar. Você é a nova Superintendente (ou o novo Superintendente) da Colônia Nadir.

No jogo você:
- anda pelos corredores;
- conversa com cada um dos 34 moradores, todos com nome, família, rotina e memória;
- governa pelo Terminal do Conselho;
- mergulha no leito marinho atrás dos documentos que o Conselho escondeu por sessenta anos.

Documentação:
- [`docs/GDD.md`](docs/GDD.md): documento de design, sistemas, números e riscos.
- [`docs/PERSONAGENS.md`](docs/PERSONAGENS.md): bíblia de personagens.

## Como jogar

Requer Node.js 18 ou superior.

```bash
npm install        # baixa o three.js
npm start          # abre em http://localhost:5173
```

Para gerar uma página única, que abre direto no navegador sem servidor nem internet:

```bash
npm run build      # gera dist/nadir.html
```

A partida é salva automaticamente no navegador.

### Controles

| Ação | Teclado e mouse | Celular |
| --- | --- | --- |
| Andar / correr | WASD ou setas / Shift | Joystick à esquerda |
| Girar a câmera / aproximar | Arrastar o mouse / roda | Arrastar à direita |
| Falar, usar, apanhar | E | Usar |
| Escolher fala | 1 a 9 ou clique | Toque |
| Nadar para cima (lá fora) | Espaço | Nadar |
| Acelerar o tempo | Segurar T | Segurar Esperar |
| Diário | J | Diário |
| Pausa | Esc | Pausa |

## Desenvolvimento

```bash
npm test           # 44 testes: motor, pessoas, histórias, layout e balanceamento
npm run simulate   # partidas automáticas com robôs e estatísticas de balanceamento
```

| Caminho | Conteúdo |
| --- | --- |
| `src/engine/data.js` | Números de balanceamento, módulos, leis, expedições e documentos |
| `src/engine/people/` | Elenco, população gerada, traços, rotinas, relações, boatos e reputação |
| `src/engine/dialogue.js`, `src/engine/quests.js` | Conversas, pedidos e histórias |
| `src/engine/events.js`, `src/engine/epilogue.js` | Eventos, desfechos e epílogo |
| `src/engine/game.js`, `src/engine/world.js` | Simulação diária (sem DOM, determinística por semente) e mundo em tempo real |
| `src/render/` | Cena 3D com three.js: colônia, leito marinho, personagens, câmera e controles |
| `src/ui/`, `src/app.js`, `src/styles.css` | Interface e ligação entre motor e cena |
| `scripts/` | Servidor local, build em arquivo único e simulador |
| `tests/` | Testes com o executor nativo do Node |
