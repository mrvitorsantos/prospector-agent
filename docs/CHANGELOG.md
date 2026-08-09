# Changelog — Prospector Agent

Registro de mudanças de configuração/comportamento que não ficam óbvias só
lendo o código (parâmetro alterado, valor antigo → novo, e o motivo). Mudanças
puramente de código sem parâmetro de configuração ficam só no `git log`; aqui
é o que precisa de contexto de decisão pra não ser re-perguntado depois.

## 2026-08-09 — Correções do code review (dedup, locationRestriction, duplicação de código)

| Parâmetro | De | Para | Por quê |
|---|---|---|---|
| Filtro geográfico em `src/sources/googlePlaces.js` | `locationBias` (círculo lat/lon+raio) | `locationRestriction` (retângulo/bounding box calculado do centro+raio — a API rejeita `circle` nesse campo com 400, só aceita em `locationBias`) | Achado do code review: `locationBias` na Places API (New) é só preferência de ranking, não exclui resultado fora do círculo — os comentários/README diziam "restringe"/"desambiguação forte", mas o comportamento real deixava passar homônimo em caso de poucos matches locais fortes (o mesmo bug que essa feature existe pra evitar). `locationRestriction` exclui de fato; testado ao vivo (Mogi das Cruzes, 20 leads) após corrigir de `circle` pra `rectangle`. |
| Tabela de cidades da automação | Duplicada e desconectada: `RELATION_ID_POR_CIDADE` em `overpass.js` e `CIDADE_CENTRO` em `googlePlaces.js` | Unificada em `src/lib/cidades.js` (`CIDADES`), importada pelas duas fontes | Achado do code review: cidade nova adicionada numa tabela e esquecida na outra perderia proteção contra homônimo silenciosamente, sem nada pra avisar da divergência |
| Retry HTTP (`erroTransitorio`, loop de tentativas, `aguardar` entre elas) | Duplicado quase verbatim em `overpass.js` e `googlePlaces.js` | Extraído para `src/lib/httpRetry.js` (`fetchComRetry`), usado pelas duas fontes | Achado do code review: o próprio CHANGELOG já documentava a extração de `aguardar()` especificamente pra evitar divergência de retry entre as duas fontes, mas o loop que a chama tinha ficado duplicado mesmo assim |
| `chaveComparacao` (`src/lib/strings.js`) | Não colapsava espaços internos duplicados | `.replace(/\s+/g, ' ')` adicionado | Achado do code review: cidade com espaço duplo (ex: erro de digitação num argumento manual) não batia com `CIDADES`, caindo silenciosamente sem proteção de homônimo |
| `LEAD_SOURCE` desconhecido (`src/collect.js`) | Caía em `overpass` sem nenhum aviso | Mesma fallback, mas com `console.warn` listando os valores válidos | Achado do code review: `LEAD_SOURCE=Google_Places` (erro de digitação/caixa) rodava Overpass silenciosamente enquanto o operador achava que estava usando (e pagando por) o Google Places |
| `googlePlaces.js`: resposta HTTP 200 com corpo `null`; `place` sem `id` | `dados.places` sem guard (lançava TypeError); `place.id` usado sem checar presença (colisão em `gplaces/undefined`) | `dados?.places \|\| []`; filtro exige `place.id` antes de mapear o lead | Achado do code review: os dois casos causavam falha silenciosa ou perda de leads (sobrescrita por `ON CONFLICT(id)`) sem nenhum erro visível no log da tarefa agendada |
| Comentário de custo em `README.md` (tabela "Fonte de dados") e `docs/PRD.md` (seção 7) | Citava SKU "Pro", ~$32/1.000 chamadas | Corrigido pra SKU "Enterprise" (mesma correção já feita no comentário de `googlePlaces.js` na entrada anterior deste changelog, que não tinha sido propagada pra esses dois arquivos) | Achado do code review: doc desatualizada citando um custo mais baixo que o real |
| PRD seção 6 (limitações conhecidas) | Não mencionava | Novo bullet: as duas fontes de dados não deduplicam entre si — trocar `LEAD_SOURCE` entre execuções pro mesmo segmento+cidade pode duplicar o estabelecimento na fila | Achado do code review, maior severidade do lote: `gplaces/...` e `node/`/`way/` nunca colidem no SQLite, então nada impede o mesmo negócio aparecer duas vezes. Sem solução implementada — precisaria de matching por nome/telefone/endereço com threshold de similaridade, decisão de produto que fica pro roadmap |

Achados do review não corrigidos nesta rodada (avaliados e deixados de propósito): dedup entre fontes (ver bullet do PRD acima — mudança de escopo maior, não é bug pontual) e falta de validação de `segmento` contra `segments.js` no caminho `google_places` (essa fonte busca por texto livre, então o dicionário de tags OSM não se aplica da mesma forma — comportamento intencional, não lacuna).

## 2026-08-08 — Desambiguação de cidade no Google Places + escopo da automação

| Parâmetro | De | Para | Por quê |
|---|---|---|---|
| `src/sources/googlePlaces.js` — desambiguação de cidade | Busca só por texto livre (`"<segmento> em <cidade>"`), sem viés geográfico | `locationBias` (círculo lat/lon + raio) pras 4 cidades em `CIDADE_CENTRO` (mesmas de `RELATION_ID_POR_CIDADE` no Overpass); `regionCode: "BR"` sempre | Achado do code review: sem isso, a busca podia desambiguar errado pra cidade homônima em outro país — mesmo risco real que já tinha acontecido no Overpass com "Santa Isabel" (também existe na Espanha, ver PRD seção 6). Coordenadas/raio calculados a partir do bounding box administrativo real de cada cidade (fonte: Nominatim/OSM, mesmo dataset do `RELATION_ID_POR_CIDADE`) |
| Comentário sobre custo em `src/sources/googlePlaces.js` (`FIELD_MASK`) | Dizia SKU "Pro", ~$32/1.000 chamadas | Corrigido pra SKU "Enterprise" (telefone/site são "Contact Data", mais caro que "Pro"); removido o número fixo do comentário, aponta pra página de preços do Google | Achado do code review: o número documentado estava associado ao SKU errado — o comentário/README/PRD citavam um custo mais baixo do que o real depois de estourar a cota gratuita |
| Tarefas agendadas (Task Scheduler) — `ProspectorAgent-06h-SantaIsabel`, `-12h-Aruja`, `-18h-Guarulhos`, `-00h-Mogi` | `DaysInterval=1` (todo dia) | `DaysInterval=2` (dia sim, dia não) | Pedido explícito do usuário: reduzir pela metade o consumo mensal de cota (Gemini + Google Places) mantendo fluxo constante de leads novos, sem esgotar a cota gratuita de nenhuma das duas APIs |
| Escopo de cidades da automação | Testado manualmente também em São Paulo (capital) | São Paulo excluído — leads e filas apagados do banco; documentado no README como fora de escopo de propósito | Cidade grande demais pra uma amostra de 20 resultados (`MAX_PAGINAS=1`) representar cobertura real, e giraria cota bem mais rápido que as 4 cidades menores já automatizadas |
| Taxa de resultados por cidade (`MAX_PAGINAS` em `googlePlaces.js`) | — | Confirmado em `1` (até 20 resultados/chamada) | Já estava assim desde a implementação inicial do Google Places; só formalizado como parâmetro intencional (não acidental) nesta rodada, a pedido do usuário |

Arquivos tocados: `src/sources/googlePlaces.js`, `README.md` (seção
"Automação (dia sim, dia não)"), 4 tarefas do Windows Task Scheduler
(fora do repo — estado do sistema local).

## 2026-08-08 — Google Places API (New) como fonte de dados (opt-in)

| Parâmetro | De | Para | Por quê |
|---|---|---|---|
| Fonte de dados da coleta (`src/collect.js`) | Só Overpass API (OSM) | `LEAD_SOURCE` no `.env`: `overpass` (padrão) ou `google_places` | Overpass/OSM tem cobertura de estabelecimento inconsistente em cidade pequena — teste real em Santa Isabel: 0 barbearias via Overpass (área correta, confirmada), 20 via Google Places |
| Novo arquivo `src/sources/googlePlaces.js` | — | Cliente Google Places (New) — Text Search, mesma interface `buscarLeads(segmento, cidade)` do Overpass | Trocar de fonte não deve exigir mudança em `qualify.js`/`buildQueue.js`/schema do SQLite |
| `.env` — `GOOGLE_PLACES_API_KEY`, `LEAD_SOURCE` | Não existiam | Adicionadas em `.env.example`, documentadas no README | Necessário pra ativar `google_places`; exige billing habilitado no Google Cloud mesmo pra usar só a cota gratuita (5.000 chamadas/mês) |
| IDs de lead do Google Places | — | Prefixados com `gplaces/` (Overpass usa `node/`/`way/`) | Evitar colisão de `id` (chave primária) caso o mesmo banco tenha leads das duas fontes |

Commit: `cb56b1b`.

## 2026-08-08 — Overpass: busca por ID de área + retry em erro transitório

| Parâmetro | De | Para | Por quê |
|---|---|---|---|
| Busca de área no Overpass (`montarQuery` em `src/sources/overpass.js`), 4 cidades da automação | `area["name"="<cidade>"]["boundary"="administrative"]` (casamento por nome) | `area(id:<RELATION_ID_POR_CIDADE>)` (busca por ID de relação OSM) | Nome ambíguo entre países — "Santa Isabel" também existe na Espanha; Overpass já tinha casado com a errada numa execução real (ver PRD seção 6) |
| Retry em `buscarLeads()` (Overpass) | Nenhum — falha na primeira tentativa | Até 3 tentativas, 5s de espera, pra erros `undefined` (rede), 5xx **e 429** | Automação diária roda sem supervisão; 429 (rate-limit) é o modo de falha mais provável sob uso automatizado e não estava coberto na primeira versão do retry (achado de code review) |
| Timeout de rede em `buscarLeads()` (Overpass e Google Places) | Nenhum — só o `[timeout:25]` da query, que não fecha a conexão TCP | `AbortSignal.timeout(30000)` no `fetch` | `[timeout:25]` só limita execução no servidor; sem timeout no cliente, uma conexão travada podia pendurar a execução agendada indefinidamente (achado de code review) |
| Função `aguardar(ms)` | Duplicada em `qualify.js` e `overpass.js` | Extraída pra `src/lib/async.js`, importada nos dois (+ `googlePlaces.js`) | Evitar que os dois sleeps divirjam se um for ajustado (achado de code review) |
| Script de automação | `scripts/run-daily.ps1` (todas as cidades numa tarefa só) | `scripts/run-one.ps1 -Segmento -Cidade` (uma cidade por tarefa) | Espalhar consumo de quota da Gemini ao longo do dia em vez de concentrar tudo num horário |

Commits: `909e81f`, `d27807a`.
