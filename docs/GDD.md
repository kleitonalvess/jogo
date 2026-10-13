# Nadir · Documento de Design (v0.2)

> Título provisório. Este documento descreve o jogo que está neste repositório, os números que ele usa de verdade e as decisões que ainda estão em aberto. A bíblia de personagens está em [`PERSONAGENS.md`](PERSONAGENS.md).

## 1. Visão geral

| Item | Definição atual |
| --- | --- |
| Gênero | Simulação de vida e gestão de colônia em terceira pessoa, com narrativa ramificada |
| Premissa | As mudanças climáticas tornaram a superfície inabitável. Há sessenta anos, 214 pessoas desceram para a Colônia Nadir, a 160 m de profundidade, para "esperar uma geração" |
| Papel do jogador | O novo Superintendente (ou a nova Superintendente), escolhido depois da morte de Severino Bastos. Você anda pela colônia, conversa com cada morador, governa pelo Terminal do Conselho e mergulha no leito marinho |
| Objetivo | Manter a colônia viva, recuperar os 5 documentos da fundação e decidir o que fazer com a verdade: a superfície voltou a ser habitável e o Conselho sempre soube |
| Duração estimada | Ainda não medida com jogadores. A história principal cabe em 20 a 30 dias de jogo; cada dia dura de 10 a 15 minutos reais se o jogador não acelerar o tempo |
| Plataforma | Navegador (desktop e celular), com three.js. O build gera uma única página HTML que abre sem servidor |

### Referências e limites de propriedade intelectual

- **Silo** (Apple TV+, livros de Hugh Howey) é a referência de tom: comunidade fechada, regras rígidas e informação controlada. O jogo não usa nomes, termos nem enredo da obra. O código de leis se chama **Estatuto**, não existe "limpeza" e o controle de natalidade se chama **Licenças de Natalidade**.
- **Fable** é a referência de personagens: gente com nome, manias e reações ao que você fez, e uma reputação que vira apelido.
- **Red Dead Redemption 2** é a referência de mundo vivo: pessoas com rotina própria, que conversam entre si, lembram de você e seguem a vida sem depender do jogador.

Essas duas últimas são referências de *intenção*, não de escala. A seção 9 compara honestamente o que o Nadir entrega com o que esses jogos entregam.

## 2. Pilares de design

1. **Cada pessoa tem nome.** Os 34 moradores têm família, rotina, humor, memória e opinião sobre você. Quem morre faz falta para alguém, e esse alguém lembra.
2. **Cada respiração custa.** Ar, água e comida estão sempre perto do limite. Toda pessoa tirada de um módulo resolve um problema e abre outro.
3. **A verdade também é um recurso.** Revelar custa moral agora. Esconder cria segredos que correm de boca em boca e podem vazar. Este é o diferencial frente aos concorrentes (seção 8).

## 3. O dia

| Hora | O que acontece |
| --- | --- |
| 6h | A colônia acorda (cada um no seu horário) e chega o relatório da noite: produção, consumo, mortes, nascimentos, boatos e notícias |
| 7h–18h | Turnos de trabalho, com almoço ao meio-dia. As crianças têm aula com Teodoro no Arquivo das 7h30 às 11h30. A ronda da Guarda segue pela noite |
| 18h–20h | Jantar no refeitório, reuniões no Átrio (velórios, casamentos, leituras) e conversas |
| 20h em diante | Já dá para dormir no seu beliche. Dormir encerra o dia |
| 2h | Se não dormir, você desmaia e acorda no beliche |

- **Tempo:** 1 segundo real equivale a 2 minutos de jogo. Segurar **T** acelera 8 vezes.
- **Fim do dia:** ao dormir, o motor resolve produção, consumo, escassez, desgaste do casco, obras, expedições, nascimentos, propagação de boatos, humor e opinião de cada morador. Depois sorteia um evento.

## 4. O mundo

### 4.1 A colônia

- **Estrutura:** um anel de corredores ao redor de uma escada em espiral, com 6 níveis de 4 módulos cada (do Nível 1, a −160 m, ao Nível 6, a −360 m). Você anda por tudo em terceira pessoa.
- **Núcleo do Conselho (Nível 1):**
  - Refeitório com 16 lugares e cozinha.
  - Arquivo e sala de aula.
  - Mesa de Augusto, o cofre e o Terminal do Conselho.
  - Beliches de quem governa, inclusive o seu.
- **Início:** a colônia começa com 12 módulos.
  - **Nível 1:** Núcleo, Turbina, Eclusa e Átrio.
  - **Nível 2:** Eletrolisador, Dessalinizador e duas Fazendas.
  - **Nível 3:** dois Alojamentos, Oficina e Enfermaria.

### 4.2 O leito marinho

Você sai pela Eclusa de escafandro. O tanque dura cerca de 3 minutos andando, menos se você corre, sobe ou chega perto das fontes termais.

| Região | O que tem |
| --- | --- |
| Campo de Destroços | Sucata, relíquias e o Registro da Boia 7 |
| Carcaça da Baleia | Relíquias e isópodes |
| Fenda Abissal | A sonda com a Transmissão de Zênite e a placa de Ruth |
| Fontes Termais | Alga vermelha (o remédio de Helena), calor que gasta ar |
| Coluna de Ascensão | O cabo que sobe 110 m até a caixa com a Última Leitura |
| Estação de Pesquisa | Ruínas com relíquias |

- **Itens:** 35 itens espalhados pelo mundo. A sucata reaparece a cada 3 dias e a alga a cada 2.
- **Estações de ar:** três estações recarregam o traje uma vez por dia.
- **Navegação:** a bússola do HUD aponta a Eclusa e os pontos de interesse.
- **Fauna:** cardumes, águas-vivas que queimam e isópodes. A sombra de uma baleia passa de vez em quando.

## 5. Sistemas

### 5.1 Recursos e economia

| Recurso | Uso |
| --- | --- |
| Oxigênio, água, comida | 1 de cada por pessoa por dia (moradores na base e você) |
| Materiais | Obras, reparos do casco e remendos de vazamento |
| Energia | Alimenta módulos e trabalhadores. O excedente carrega a bateria (30 de base + 50 por Banco de Baterias) |

| Módulo | Custo | Obra (dias) | Vagas | Produção por trabalhador | Observação |
| --- | --- | --- | --- | --- | --- |
| Núcleo do Conselho | — | — | — | 6 kW fixos | 8 leitos |
| Alojamento | 30 | 2 | — | — | 14 leitos, 1 kW |
| Eletrolisador | 35 | 2 | 4 | 9 O₂ | 2 kW por trabalhador |
| Dessalinizador | 30 | 2 | 4 | 9 água | 1 kW por trabalhador |
| Fazenda de Algas | 30 | 2 | 4 | 6 comida | 1 kW por trabalhador |
| Oficina de Sucata | 25 | 1 | 4 | 4 materiais | 1 kW por trabalhador |
| Turbina de Corrente | 40 | 2 | 2 | 7 kW | Níveis 1 a 3 |
| Poço Geotérmico | 60 | 3 | 2 | 15 kW | Níveis 4 a 6 |
| Banco de Baterias | 30 | 1 | — | — | +50 de armazenamento |
| Átrio | 40 | 2 | — | — | +0,8 de humor por dia, 2 kW, máximo 2 |
| Eclusa de Escafandros | 50 | 2 | — | — | Libera expedições e mergulho, 2 kW, máximo 1 |
| Enfermaria | 45 | 2 | 2 | — | Doentes se recuperam mais rápido, 2 kW, máximo 1 |

- **Aptidão:** quem trabalha na própria área (vida, cultivo, mecânica, cuidado) rende 15% a mais.
- **Obras:** um módulo desmontado devolve metade do custo.
- **Casco:**
  - Desgaste por dia: 0,5 de base, mais 0,12 por módulo, mais 0,08 por módulo para cada nível abaixo do primeiro.
  - Fadiga do metal: o desgaste cresce 0,5% a cada dia.
  - Cada pessoa na manutenção repara até 1,5 por dia, gastando materiais.
  - Com o casco fraco aparecem vazamentos nos corredores, que você remenda com 2 de material.

### 5.2 Moradores

- **População inicial:** 34 pessoas, sendo 11 personagens escritos à mão, 4 coadjuvantes e 19 gerados por semente.
- **O que cada um tem:**
  - nome e sobrenome;
  - idade e gênero (feminino, masculino ou neutro, com concordância em todo o texto);
  - dois traços entre 20 possíveis;
  - uma aptidão de trabalho;
  - aparência (pele, cabelo, barba, acessório);
  - leito, função, família, amizades e rixas;
  - até 10 memórias e um presente favorito.
- **Rotina:** cada morador segue uma agenda própria (dormir, comer, trabalhar, dar aula, patrulhar, ir ao Átrio, visitar a Enfermaria). Eventos e reuniões mudam a agenda.
- **Conversas entre eles:** quando se cruzam, puxam assunto conforme o contexto (escassez, luto, boatos, trabalho, família). Os diálogos aparecem em balões.
- **Humor:** volta 10% por dia em direção a um ponto de equilíbrio pessoal. Esse ponto depende de ter trabalho na própria área, de estar com a família e da personalidade.
- **Opinião sobre você (0 a 100):**
  - anda 4% por dia em direção a um alvo;
  - o alvo combina sua reputação (Verdade × Sigilo e Compaixão × Rigor) com os valores de cada pessoa;
  - o que você faz com a pessoa ou na frente dela a desloca na hora.
- **Moral e confiança:** são a média do humor e da opinião dos moradores, não números abstratos.
- **Revolta:** acontece quando 55% dos adultos estão com opinião abaixo de 20. Não existe uma barra única que zera.
- **Vida e morte:**
  - casais têm filhos quando há Licenças de Natalidade, leito, comida e moral;
  - quem morre deixa luto em quem tinha laço, e há velório no dia seguinte, às 18h, no Átrio.

### 5.3 Conversa

- **Opções com qualquer morador:**
  - perguntar como a pessoa está;
  - pedir que fale de si;
  - perguntar o que andam dizendo;
  - pedir ou ordenar troca de função;
  - dar um presente;
  - pedir silêncio sobre um segredo.
- **O que é escrito à mão:** os personagens principais têm saudações por nível de amizade, falas próprias e reações escritas ao presente favorito.
- **Troca de função:** se a pessoa aceita depende de aptidão, opinião e teimosia. Ordenar funciona sempre, mas custa opinião.
- **Presentes:** o favorito vale 18 de opinião, um item da categoria preferida vale 9 e qualquer outro vale 3.
- **Silêncio:** você pode persuadir, ameaçar ou subornar com ração. Cada caminho mexe com a reputação de um jeito.
- **Discursos:** nas reuniões do Átrio (velório, casamento, boas-vindas a bebê, banquete, leitura de documento) você pode tomar a palavra no centro do salão. O efeito varia pela reunião e por quem está ouvindo.

### 5.4 Boatos, segredos e reputação

- **Como um boato se espalha:**
  - passa entre familiares, colegas de trabalho e vizinhos de alojamento;
  - a chance por contato cresce com o traço "fofoqueiro";
  - Patrulhas de Ordem cortam a propagação pela metade.
- **Segredos:** cada documento lacrado vira um segredo, conhecido por você e por quem estava perto quando você o achou.
- **Vazamento:**
  - acontece quando 30% dos adultos já sabem do segredo;
  - todos perdem 8 + 2 × (segredos lacrados) de opinião, ajustado pelo quanto valorizam a verdade.
- **Reputação:** dois eixos, de −100 a 100: Verdade × Sigilo e Compaixão × Rigor.
- **Apelidos:** com a reputação forte você ganha um apelido: Farol, Lâmina, Pastora/Pastor, Carcereira/Carcereiro, Voz da Superfície, Guardiã/Guardião, Protetora/Protetor ou Mão de Ferro.

### 5.5 Estatuto

| Lei | Efeito |
| --- | --- |
| Racionamento | Consumo de água e comida −25%; humor −1,5 por dia |
| Turnos Dobrados | Produção +25%; humor −2 por dia; casco −0,5 por dia |
| Licenças de Natalidade | Permite nascimentos; confiança +0,3 por dia |
| Patrulhas de Ordem | Boatos se espalham pela metade; menos perda de opinião por humor baixo; humor −1 por dia |

Cada mudança custa 2 de confiança.

### 5.6 Expedições

Além de mergulhar, você pode mandar equipes de 1 a 4 pessoas pelo Terminal. Cada membro leva 3 de O₂ e 1 de comida por dia de viagem.

| Destino | Dias | Risco por pessoa | Materiais por pessoa |
| --- | --- | --- | --- |
| Campo de Destroços | 2 | 4% | 10 a 18 |
| Fenda Abissal | 3 | 10% | 14 a 24 |
| Coluna de Ascensão | 4 | 18% | 3 a 6 |

As equipes podem trazer relíquias. Os documentos da fundação só aparecem para quem vai buscá-los: esta parte é sua.

### 5.7 Eventos

- **Sorteio:** 40% de chance por noite, com intervalo mínimo de 10 dias para o mesmo evento.
- **Quantidade:** 17 eventos aleatórios.
  - Exemplos: rompimento, pedido de subida, greve, praga nas algas, cardume, tremor, sinal de rádio, febre, sabotagem, rixa, casamento, gêmeos e furto.
- **Quem traz o evento:** quase todos têm um morador que vem até você para contar o problema. Ele aparece no retrato da janela, e a escolha mexe com a opinião dele e da pessoa envolvida.
- **Efeitos:** toda escolha mostra os efeitos antes da decisão.

## 6. Narrativa

### 6.1 Missão principal: "A Verdade sobre a Superfície"

1. **Augusto** te recebe no Núcleo e te leva ao Terminal.
2. **Teodoro** entrega o embrulho de Severino Bastos com o Diário de Fundação.
3. **Boia 7:** o registro está no Campo de Destroços.
4. **Zênite:** a transmissão está na sonda, no fundo da Fenda Abissal.
5. **Ata do Conselho:** fica no cofre do Núcleo. O código vem de Clara (antes do dia 24) ou de Rafael (com preço na família Mendonça).
6. **Última Leitura:** está no alto da Coluna de Ascensão, 110 m de cabo acima do leito.
7. **A decisão:** abrir todos os arquivos ("A Porta Aberta") ou manter o Estatuto ("O Guardião"). O texto do desfecho muda com a confiança e com o número de segredos, e um epílogo conta o que foi feito de cada personagem principal conforme as escolhas.

**Derrotas:** "O Casco Cedeu" (casco a zero), "Silêncio" (população a zero) e "Revolta".

### 6.2 Histórias pessoais

São 10 histórias além da principal, todas com mais de um desfecho:
- O Pedido de Irene
- Um Pedaço de Céu
- Tinta na Parede
- A Placa de Ruth
- Remédio do Fundo
- A Última Votação
- O Filho do Conselheiro
- O Guardião do Cofre
- Gosto de Alguma Coisa
- O Que Ensinar

Elas se cruzam:
- o traje que você consegue para Irene muda o destino de Nina;
- o remédio de Helena dá mais dez dias a Clara;
- o banquete de Dona Zu libera o termômetro de boatos.

Os detalhes estão em [`PERSONAGENS.md`](PERSONAGENS.md).

### 6.3 Companhia

Com opinião de pelo menos 45, Ícaro aceita mergulhar com você uma vez por dia. Ele:
- fala sobre o lugar;
- avisa quando o seu ar está acabando;
- testemunha os documentos que você encontra, o que faz dele um portador do segredo.

## 7. Balanceamento medido

O script `npm run simulate` joga só a camada de gestão, sem missões nem exploração, com dois robôs. Resultado com 200 sementes e limite de 60 dias:

| Robô | Sobreviveram | Derrotas | Dia final médio | População final média | Moral final média |
| --- | --- | --- | --- | --- | --- |
| Passivo (não faz nada) | 0% | 100% (todas por revolta) | 20,2 | 19,0 | 0,1 |
| Simples e consistente | 99% | 1% (casco) | 60,6 | 27,3 | 66,9 |

**Leitura:**
- A camada de gestão pune quem a ignora e é sustentável com regras simples. A dificuldade real vem das escolhas narrativas e do tempo gasto lá fora, que os robôs não simulam.
- `tests/balance.test.js` falha se mudanças nos números tirarem os resultados dessa faixa.
- **Ainda não medido:** a taxa de conclusão e o tempo de partida de jogadores humanos.

## 8. Mercado e concorrência

Dados levantados na versão 0.1. Notas de loja mudam com o tempo.

| Jogo | Dados verificados | O que isso nos diz |
| --- | --- | --- |
| [Aquatico](https://en.wikipedia.org/wiki/Aquatico) (Digital Reef Games / OverSeer Games) | Lançado em 12/01/2023 para Windows; OpenCritic 53 e cerca de 67% de análises positivas no Steam, segundo o agregador [gg.deals](https://gg.deals/ca/game/aquatico/) | Construtor de cidade submarina com recepção morna. Tema sozinho não basta |
| [Surviving the Abyss](https://store.steampowered.com/app/1254320/Surviving_the_Abyss) (Rocket Flair Studios / Paradox Arc) | Versão completa em 05/11/2024; análises "Mistas" no Steam (63% de 810 positivas no momento da consulta) | Concorrente mais próximo em clima: base no fundo do mar, oxigênio, energia e ameaça constante |
| Frostpunk (11 bit studios, 2018) | — | Referência de "sobrevivência + leis com custo moral" |
| Fallout Shelter (Bethesda, 2015) | — | Abrigo em corte com moradores nomeados. É a comparação mais imediata que o público fará |

**Conclusão estratégica:** o que os concorrentes não fazem é juntar as duas coisas que o Nadir junta:
- andar entre as pessoas que você governa, em terceira pessoa;
- controlar o que elas sabem.

Esse é o argumento de venda, não "viver no fundo do mar".

## 9. Análise crítica: o que é e o que não é

| Aspecto | O que o Nadir entrega | Distância das referências |
| --- | --- | --- |
| Personagens | 34 moradores com nome, rotina, memória e opinião. 11 com falas, histórias e reações escritas à mão | Fable e RDR2 têm dublagem, animação capturada e milhares de falas. Aqui é texto, e os 19 moradores gerados repetem modelos de fala |
| Mundo vivo | Rotinas, conversas entre moradores, reuniões, luto, boatos e nascimentos, que acontecem sem o jogador | RDR2 tem centenas de pessoas e um mapa enorme. O Nadir é uma colônia fechada: a escala é de vila, por escolha e por limite |
| Arte | Modelos procedurais de baixo polígono, iluminação dinâmica e névoa submarina | Sem artista, sem modelos esculpidos, sem animação feita à mão |
| Áudio | Ambiência e efeitos sintetizados no navegador | Sem trilha composta nem dublagem |
| Desempenho | Uma página só, sem instalação. Opção de qualidade baixa | Não foi medido em celulares fracos. A cena tem 34 personagens animados e luzes dinâmicas, e esse é o principal risco técnico |

## 10. Estrutura técnica

| Pasta | Conteúdo |
| --- | --- |
| `src/engine/` | Motor puro, sem DOM, determinístico por semente e testável em Node: economia, pessoas, conversa, missões, mundo |
| `src/render/` | three.js: colônia, leito marinho, personagens, jogador, câmera, controles, retratos |
| `src/ui/` | Terminal, Diário, telas de abertura, eventos e desfechos |
| `src/app.js` | Liga motor, mundo 3D e interface |
| `scripts/build.js` | Gera `dist/nadir.html`, com o three.js embutido |
| `tests/` | 44 testes: motor, pessoas, histórias, layout e balanceamento |

A separação entre motor e apresentação permite levar as regras para Godot ou Unity sem reescrever o jogo.

## 11. Riscos

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Desempenho em celulares modestos | Alto | Medir em aparelhos reais; reduzir luzes e personagens visíveis por nível; animação mais simples a distância |
| Conteúdo escrito se repete depois de algumas horas | Alto | Ampliar falas por traço e por contexto; mais histórias pessoais para os moradores gerados |
| Proximidade com Silo | Médio | Manter nomes, termos e enredo próprios; revisar todo texto novo |
| Expectativa criada pelas referências (Fable, RDR2) | Médio | Comunicar como "vila subaquática viva", não como mundo aberto |
| Jogadores não entenderem a ligação entre gestão e narrativa | Médio | Tutorial guiado pelas primeiras falas de Augusto; objetivos sempre visíveis no HUD |

## 12. Decisões em aberto

1. **Motor definitivo:** continuar na web (fácil de distribuir no itch.io e no navegador) ou migrar para Godot ou Unity (Steam e consoles).
2. **Arte:** manter o estilo procedural ou contratar arte para personagens e cenários.
3. **Dublagem:** vozes para os 11 personagens principais, pelo menos nas saudações e nos momentos de missão.
4. **Modelo de negócio:** preço único, gratuito, ou demo gratuita com versão completa.

## 13. Próximos passos sugeridos

1. Teste com 5 a 10 jogadores reais, medindo onde se perdem, quanto tempo leva cada dia e em que dia desistem.
2. Medir quadros por segundo em três celulares de faixas diferentes.
3. Histórias pessoais para moradores gerados (pedidos em cadeia, romances, rivalidades que escalam).
4. Uma segunda colônia que responde no rádio, abrindo o capítulo depois do desfecho.
5. Trilha sonora e dublagem dos personagens principais.
