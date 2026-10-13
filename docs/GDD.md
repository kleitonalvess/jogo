# Nadir · Documento de Design (v0.1)

> Título provisório. Este documento descreve o protótipo jogável que está neste repositório e as decisões que ainda estão em aberto.

## 1. Visão geral

| Item | Definição atual |
| --- | --- |
| Gênero | Gestão de recursos e sobrevivência por turnos, com decisões narrativas |
| Premissa | As mudanças climáticas tornaram a superfície inabitável e parte da humanidade passou a viver em colônias no fundo do mar |
| Papel do jogador | O Conselho que governa a Colônia Nadir, a 160 m de profundidade |
| Objetivo | Manter a colônia viva enquanto recupera 5 documentos da fundação e decidir o que fazer com a verdade sobre a superfície |
| Duração alvo | 40 a 70 ciclos (cerca de 45 a 90 minutos por partida) |
| Plataforma do protótipo | Navegador (HTML, CSS e JavaScript puro, sem dependências) |

### Inspiração e limites de propriedade intelectual

A referência de tom é a série **Silo** (Apple TV+, adaptação dos livros de Hugh Howey): uma comunidade fechada, regras rígidas, informação controlada e a pergunta "o que existe lá fora?". O jogo usa a inspiração temática, mas evita nomes, termos e elementos próprios da obra. Por isso o código de leis se chama **Estatuto** (e não "Pacto"), não existe "limpeza" e o controle de natalidade é chamado de **Licenças de Natalidade**. Essa separação precisa ser mantida em todo o conteúdo futuro.

## 2. Pilares de design

1. **Cada respiração custa.** Oxigênio, água, comida e energia estão sempre perto do limite. Toda pessoa realocada resolve um problema e abre outro.
2. **Profundidade é risco.** A colônia cresce para baixo. Níveis profundos dão acesso à energia geotérmica, mas desgastam mais o casco.
3. **A verdade também é um recurso.** Revelar informação custa moral agora; esconder acumula segredos que podem vazar e derrubar a confiança depois. Este é o diferencial do jogo frente aos concorrentes (seção 7).

## 3. Loop principal (um ciclo)

1. Ler a previsão do Conselho: produção, consumo e saldo de cada recurso.
2. Distribuir pessoas entre os módulos e a manutenção do casco.
3. Construir ou desmontar módulos.
4. Ajustar o Estatuto (leis).
5. Enviar ou acompanhar expedições.
6. Encerrar o ciclo. O motor resolve produção, consumo, escassez, mortes, obras, expedições, nascimentos e vazamentos, e pode disparar um evento com escolhas.

## 4. Sistemas

### 4.1 Recursos

| Recurso | Uso | Observação |
| --- | --- | --- |
| Oxigênio (O₂) | 1 por pessoa por ciclo | Faltar mata rápido: 1 morte a cada 5 unidades de déficit |
| Água | 1 por pessoa por ciclo | Mortes a partir do 2º ciclo seguido de falta |
| Comida | 1 por pessoa por ciclo | Mortes a partir do 3º ciclo seguido de falta |
| Materiais | Obras e reparos | Cada 1 de material repara 1,5 de casco |
| Energia | Alimenta os módulos | Excedente carrega a bateria (30 de base + 50 por Banco de Baterias). Sem energia nem bateria, todos os módulos rendem proporcionalmente menos |

### 4.2 Módulos

A colônia tem 6 níveis com 3 posições cada. Um nível só pode ser ocupado se o nível de cima tiver algum módulo.

| Módulo | Custo | Obra | Vagas | Efeito | Energia | Restrição |
| --- | --- | --- | --- | --- | --- | --- |
| Núcleo de Comando | inicial | — | — | 10 leitos, gera 5 kW | — | Fixo |
| Alojamento | 30 | 2 | — | 8 leitos | 1 kW | — |
| Eletrolisador | 35 | 2 | 4 | +6 O₂ por pessoa | 2 kW por pessoa | — |
| Dessalinizador | 30 | 2 | 4 | +6 água por pessoa | 1 kW por pessoa | — |
| Fazenda de Algas | 30 | 2 | 5 | +5 comida por pessoa | 1 kW por pessoa | — |
| Oficina de Sucata | 25 | 1 | 4 | +4 materiais por pessoa | 1 kW por pessoa | — |
| Turbina de Corrente | 40 | 2 | 2 | +6 kW por pessoa | — | Níveis 1 a 3 |
| Poço Geotérmico | 60 | 3 | 2 | +14 kW por pessoa | — | Níveis 4 a 6 |
| Banco de Baterias | 30 | 1 | — | +50 de capacidade | — | — |
| Átrio | 40 | 2 | — | +1,5 de moral por ciclo | 2 kW | — |
| Eclusa de Escafandros | 50 | 2 | — | Libera expedições | 2 kW | Uma por colônia |

Desmontar devolve metade do custo.

### 4.3 Casco

- Desgaste por ciclo: 0,5 de base + 0,12 por módulo + 0,08 por módulo para cada nível abaixo do primeiro (um módulo no nível 6 desgasta 0,52).
- Fadiga do metal: o desgaste cresce 0,5% a cada ciclo, o que impede uma colônia estável de ficar parada para sempre.
- Turnos Dobrados somam 0,5 de desgaste por ciclo.
- Cada pessoa na manutenção repara até 1,5 por ciclo, consumindo materiais.

### 4.4 Pessoas, moral e confiança

- **Moral (0 a 100)** muda a produtividade: ≥ 75 dá ×1,1; 45 a 74 dá ×1,0; 25 a 44 dá ×0,85; abaixo de 25 dá ×0,7.
- Moral sobe com necessidades atendidas e Átrios; cai com superlotação, escassez, apagões, mortes e leis duras.
- **Confiança (0 a 100)** mede o apoio ao Conselho. Cai com moral baixa, escassez, mortes, mudanças no Estatuto e vazamentos. Em zero, há revolta e a partida termina.
- Nascimentos só acontecem com as Licenças de Natalidade em vigor, leito livre, comida em estoque e moral ≥ 50 (um a cada 4 ciclos nessas condições).

### 4.5 Estatuto

| Lei | Efeito |
| --- | --- |
| Racionamento | Consumo de água e comida −25%; moral −1,5 por ciclo |
| Turnos Dobrados | Produção +25%; moral −2 por ciclo; casco −0,5 por ciclo |
| Licenças de Natalidade | Permite nascimentos; confiança +0,3 por ciclo |
| Patrulhas de Ordem | Chance de vazamento −50%; perda de confiança por moral baixa −50%; moral −1 por ciclo |

Cada mudança custa 2 de confiança no fim do ciclo. Desfazer no mesmo ciclo não custa nada.

### 4.6 Expedições e o Arquivo

| Destino | Ciclos | Risco por pessoa | Materiais por pessoa | Chance de fragmento |
| --- | --- | --- | --- | --- |
| Campo de Destroços | 2 | 4% | 10 a 18 | 8% |
| Fenda Abissal | 3 | 10% | 14 a 24 | 35% |
| Coluna de Ascensão | 4 | 18% | 3 a 6 | 70% |

- Equipes de 1 a 4 pessoas ociosas; levam 3 de O₂ e 1 de comida por pessoa por ciclo de viagem.
- Cada fragmento encontrado abre uma escolha: **revelar** (confiança +6, moral −5) ou **lacrar** (+1 segredo).
- Cada segredo lacrado dá 5% de chance de vazamento por ciclo (máximo de 40%). Um vazamento custa 8 + 2 × segredos de confiança.
- A temperatura da superfície aparece no topo do corte da colônia conforme os fragmentos são lidos.

### 4.7 Eventos

14 eventos aleatórios (35% de chance por ciclo a partir do ciclo 3, cada um com intervalo mínimo de 10 ciclos) e 2 eventos de história. Toda escolha mostra seus efeitos antes da decisão. Os eventos estão em `src/engine/events.js` em formato declarativo, para facilitar a escrita de novos.

### 4.8 Fim de jogo

- **Vitória:** com os 5 fragmentos, o jogador escolhe entre abrir os arquivos ("A Porta Aberta") ou manter o Estatuto ("O Guardião"). O texto final muda conforme a confiança e o número de segredos.
- **Derrota:** casco a 0% ("O Casco Cedeu"), confiança a 0 ("Revolta") ou população a 0 ("Silêncio").

## 5. Balanceamento atual

O script `npm run simulate` joga partidas automáticas com duas estratégias. Resultado com 300 sementes e limite de 80 ciclos:

| Estratégia | Vitórias | Derrotas | Vivas no limite | Ciclo final médio |
| --- | --- | --- | --- | --- |
| Passiva (não faz nada) | 0% | 85% (quase todas por revolta) | 15% | 45,8 |
| Simples e consistente | 66% | 6% (casco) | 28% | 66,8 |

Leitura: o jogo pune quem não age e é vencível com regras simples. Os testes em `tests/balance.test.js` falham se uma mudança de números sair dessa faixa. A taxa de vitória de um jogador humano ainda não foi medida; é o próximo dado a coletar.

## 6. Estrutura técnica

- `src/engine/` contém o motor puro (sem DOM), determinístico por semente, testável em Node.
- `src/ui.js` e `src/main.js` contêm a interface e o controlador.
- `scripts/build.js` gera `dist/nadir.html`, uma página única que abre direto no navegador.
- `scripts/simulate.js` contém os bots de balanceamento.

A separação entre motor e interface permite trocar a camada visual (por exemplo, migrar para Godot ou Unity) reaproveitando as regras e os números já validados.

## 7. Mercado e concorrência

O nicho de "colônia submarina com gestão de recursos" já tem jogos lançados, e nenhum deles se consolidou como referência:

| Jogo | Dados verificados | O que isso nos diz |
| --- | --- | --- |
| [Aquatico](https://en.wikipedia.org/wiki/Aquatico) (Digital Reef Games / OverSeer Games) | Lançado em 12/01/2023 para Windows; OpenCritic 53 e cerca de 67% de análises positivas no Steam, segundo o agregador [gg.deals](https://gg.deals/ca/game/aquatico/) (número sujeito a mudança) | Construtor de cidade submarina com recepção morna. Tema sozinho não basta |
| [Surviving the Abyss](https://store.steampowered.com/app/1254320/Surviving_the_Abyss) (Rocket Flair Studios / Paradox Arc) | Versão completa em 05/11/2024; análises "Mistas" no Steam (63% de 810 positivas no momento da consulta) | Concorrente mais próximo em clima: base no fundo do mar, oxigênio, energia e ameaça constante |
| Frostpunk (11 bit studios, 2018) | — | Referência de "sobrevivência + leis com custo moral". Nosso Estatuto se aproxima desse território; o diferencial precisa vir dos segredos |
| Fallout Shelter (Bethesda, 2015) | — | Corte transversal de abrigo com salas e trabalhadores. É a comparação visual mais imediata que o público fará |

**Conclusão estratégica:** o diferencial defensável não é "viver no fundo do mar", e sim o pilar 3, **controle da informação** (segredos, vazamentos, confiança, verdade sobre a superfície), que é justamente o núcleo de Silo e não é o centro de nenhum dos concorrentes acima. As próximas iterações devem aprofundar esse sistema antes de ampliar a quantidade de módulos.

## 8. Riscos

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Ser percebido como "mais um" construtor submarino | Alto | Colocar a mecânica de segredos no centro do marketing e do tutorial |
| Proximidade excessiva com Silo | Médio | Manter nomes, termos e enredo próprios; revisar todo texto novo |
| Escopo de conteúdo (eventos, arte, áudio) | Alto | Motor de eventos declarativo; validar diversão com o protótipo antes de investir em arte |
| Balanceamento frágil | Médio | Simulador com bots e testes de regressão de balanceamento |
| Rejogabilidade baixa (história linear de 5 fragmentos) | Médio | Ordem e conteúdo de fragmentos variáveis; mapas de leito marinho diferentes por semente |

## 9. Decisões em aberto

1. **Motor definitivo:** continuar na web (distribuição fácil, itch.io e navegador) ou migrar para Godot/Unity (Steam e consoles).
2. **Direção de arte:** manter a interface de "painel de instrumentos" ou investir em um corte transversal ilustrado com personagens.
3. **Personagens nomeados:** dar nome e história a moradores (ex.: Irene) aumenta o peso das decisões, mas multiplica o conteúdo a escrever.
4. **Modelo de negócio:** prêmio único, gratuito ou demo gratuita + versão completa.

## 10. Próximos passos sugeridos

1. Teste com 5 a 10 jogadores reais usando o protótipo, medindo em que ciclo desistem e por quê.
2. Aprofundar o sistema de segredos: facções internas que reagem à informação, interrogatórios, documentos falsificados.
3. Eventos encadeados (consequências que voltam ciclos depois).
4. Mais destinos de expedição e mapa do leito marinho.
5. Áudio ambiente (sonar, casco rangendo), que pesa muito na atmosfera do tema.
