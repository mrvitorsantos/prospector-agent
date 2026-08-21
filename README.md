# Prospector Agent

Agente de prospecção de PMEs (pequenas e médias empresas) **sem site** por
segmento e cidade — o público-alvo é quem ainda não tem presença digital,
pra oferecer criação de site institucional ou sistema de agendamento
online. Dado um segmento (ex: `barbearia`, `clínica odontológica`) e uma
cidade (ex: `Arujá`, `Guarulhos`), o agente:

1. **Coleta** estabelecimentos desse segmento na cidade via [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API)
   (consulta sobre dados do OpenStreetMap — grátis, sem chave de API) e
   **descarta na hora quem já tem site cadastrado na fonte** — só quem não
   tem site chega a ser gravado no banco.
2. **Qualifica** cada lead com a [Gemini API](https://ai.google.dev/gemini-api/docs)
   (nota 0–100 + mensagem de abordagem pronta, já mencionando a falta de
   site), com heurística de fallback se a API não estiver configurada ou
   falhar.
3. **Monta uma fila** ordenada por score decrescente, exportada em
   `data/fila_<segmento>_<cidade>.csv` e `.json`, com link `wa.me` pronto
   para abordagem manual via WhatsApp.

> v0.1 prioriza **custo zero** para validar o conceito antes de investir em
> fontes de dados pagas. Ver o PRD completo em
> [`docs/PRD.md`](docs/PRD.md) para o racional das decisões.

## Arquitetura

```
segmento + cidade
      │
      ▼
[1. src/collect.js] ──► Overpass API (src/sources/overpass.js)
      │
      ▼
  SQLite local (data/leads.db) — status inicial "coletado"
      │
      ▼
[2. src/qualify.js] ──► Gemini API (src/lib/gemini.js)
      │
      ▼
  SQLite — status "qualificado", com score + mensagem
      │
      ▼
[3. src/buildQueue.js] ──► data/fila_<segmento>_<cidade>.csv e .json
      │
      ▼ (opcional, se Supabase configurado — ver "Sincronização com Supabase")
[4. src/syncSupabase.js] ──► tabela `leads` no Supabase (Postgres)
```

Cada etapa roda isolada (`npm run collect`, `npm run qualify`,
`npm run build-queue`, `npm run sync-supabase`) ou em sequência via
`npm start` (`src/index.js`).

## Estrutura de pastas

```
src/
  db.js              # setup do SQLite + queries (better-sqlite3)
  collect.js          # etapa 1 — coleta (CLI)
  qualify.js           # etapa 2 — qualificação com Gemini (CLI)
  buildQueue.js        # etapa 3 — monta fila CSV/JSON (CLI)
  syncSupabase.js      # etapa 4 (opcional) — espelha leads qualificados no Supabase (CLI)
  index.js             # orquestra as etapas em sequência (CLI)
  sources/
    overpass.js        # cliente Overpass API — buscarLeads(segmento, cidade)
    googlePlaces.js      # cliente Google Places API (New) — mesma interface
    segments.js         # dicionário segmento -> tag(s) OSM (só usado pelo Overpass)
  lib/
    gemini.js           # cliente Gemini API + heurística de fallback
    supabase.js          # cliente Supabase (singleton, service_role key)
    categorias.js         # segmento -> categoria (só usado na sincronização com Supabase)
    phone.js             # normalização de telefone -> link wa.me
    csv.js               # serialização CSV simples (sem dependência externa)
    cli.js               # helper pra detectar execução direta via CLI
data/
  leads.db             # banco SQLite (gerado, ignorado no git)
  fila_*.csv / .json   # filas exportadas (geradas, ignoradas no git)
```

## Requisitos

- Node.js **20.6+** (usa `--env-file` nativo e `fetch` global — sem
  dependência de `dotenv` ou `axios`/`node-fetch`).
- Chave da [Gemini API](https://aistudio.google.com/apikey) — opcional, mas
  sem ela todos os leads são qualificados pela heurística de fallback.

## Setup

```bash
npm install
cp .env.example .env
# edite o .env e preencha GEMINI_API_KEY
# confira também se GEMINI_MODEL ainda é o nome vigente em:
# https://ai.google.dev/gemini-api/docs/models
```

## Fonte de dados

`src/collect.js` escolhe a fonte via `LEAD_SOURCE` no `.env`:

| `LEAD_SOURCE` | Fonte | Custo | Cobertura de telefone |
|---|---|---|---|
| `overpass` (padrão) | Overpass API (OpenStreetMap) | Grátis, sem chave | Inconsistente, principalmente em cidades pequenas — ver [Limitações conhecidas](#limitações-conhecidas-v01) |
| `google_places` | Google Places API (New) — Text Search | Cota gratuita mensal, depois faturado — SKU "Enterprise" (telefone/site são "Contact Data", mais caro que o "Pro"; ver preço atualizado em [mapsplatform.google.com/pricing](https://mapsplatform.google.com/pricing/), não fixamos número aqui pois muda com frequência) | Bem mais completa |

Pra usar `google_places`:

1. Crie um projeto no [Google Cloud Console](https://console.cloud.google.com/), habilite billing (obrigatório mesmo pra usar só a cota gratuita) e habilite a **Places API (New)**.
2. Gere uma chave em [console.cloud.google.com/google/maps-apis/credentials](https://console.cloud.google.com/google/maps-apis/credentials) e coloque em `GOOGLE_PLACES_API_KEY` no `.env`.
3. Mude `LEAD_SOURCE=overpass` para `LEAD_SOURCE=google_places` no `.env`.

Interface de `buscarLeads(segmento, cidade)` é a mesma nas duas fontes — trocar `LEAD_SOURCE` não muda nada em `qualify.js`, `buildQueue.js` nem no schema do SQLite. IDs de lead do Google Places são prefixados com `gplaces/` (o Overpass usa `node/`/`way/`) pra não colidir caso o mesmo banco já tenha leads das duas fontes.

`src/sources/segments.js` (dicionário segmento → tag OSM) só é usado pelo Overpass — o Google Places busca por texto livre (`"<segmento> em <cidade>"`), sem precisar de mapeamento.

## Filtro: só quem não tem site

`src/collect.js` descarta, antes mesmo de gravar no banco, qualquer
estabelecimento que já tenha um site cadastrado na fonte (tag `website`/
`contact:website` no Overpass, campo `websiteUri` no Google Places) — o
log de cada execução mostra quantos foram descartados por esse motivo.
Isso é intencional: o produto é abordar quem ainda não tem presença
digital pra oferecer criação de site ou sistema de agendamento online, não
prospecção de PMEs em geral.

Efeitos práticos:

- O campo `site` na tabela `leads` fica sempre vazio pros leads gravados
  — ele continua existindo no schema só por herança da interface comum às
  duas fontes.
- Rodar `collect.js` de novo pra um segmento+cidade já coletado não revive
  um lead que passou a ter site depois (ele só deixa de aparecer nos
  resultados novos da fonte — o registro antigo no banco não é
  re-verificado nem removido automaticamente).
- Perfis em redes sociais (Instagram, Facebook) **não contam como site**
  pra esse filtro — só o campo de site/website "oficial" da fonte.

## Sincronização com Supabase

Passo opcional (etapa 4): espelha os leads já qualificados (status
`qualificado`) de um segmento+cidade do SQLite local pra uma tabela `leads`
no Supabase (Postgres gerenciado), via upsert por `id` — repetir é seguro.
O SQLite continua sendo a fonte de verdade local; o Supabase existe pra
consulta remota (fora da sua máquina) e como base pro futuro **agente de
proposta** (ver `docs/PRD.md`).

**Por quê Supabase em vez de outro serviço:** dado de lead (nome, telefone,
score, cidade) é estruturado — se resolve com SQL normal, não com busca
vetorial/RAG. RAG só faz sentido pra uma segunda tabela, `conhecimento`,
com a extensão `pgvector` (portfólio, templates de proposta, relatórios de
concorrência) que o agente de proposta vai consultar por similaridade
semântica ao montar uma abordagem — mesmo Postgres cobre os dois casos, sem
manter um serviço de vetor separado.

Setup:

1. Preencha `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` no `.env` (ver
   comentários em `.env.example` — a service_role key fica em
   *Project Settings > API > service_role secret* no painel do Supabase;
   **nunca** a mesma coisa que a anon/publishable key, e nunca deve ser
   exposta num client de navegador).
2. Rode `npm run sync-supabase -- "<segmento>" "<cidade>"` isoladamente, ou
   deixe o `npm start` sincronizar automaticamente ao final do pipeline
   (index.js pula essa etapa sem quebrar se as variáveis não estiverem
   configuradas).

Schema da tabela `leads` no Supabase espelha o SQLite (ver "Modelo de
dados" abaixo) — `src/syncSupabase.js` só envia as colunas de dado
(`id`, `segmento`, `cidade`, `nome`, `endereco`, `telefone`, `site`,
`wa_link`, `score`, `mensagem`, `status`); `criado_em`/`atualizado_em`
ficam por conta do Postgres. Duas colunas existem só no Supabase, não no
SQLite local:

- **`categoria`** — agrupamento do segmento em algo mais amplo (ex:
  `pizzaria` → `Alimentação`, `barbearia` → `Beleza & Estética`,
  `dentista` → `Saúde`), calculado em `src/lib/categorias.js`
  (`SEGMENTO_CATEGORIA`) na hora da sincronização — segmento sem categoria
  mapeada cai em `"Outros"` em vez de quebrar. Segmento novo em
  `src/sources/segments.js`? Adicione a categoria dele também em
  `categorias.js`.
- **Views por cidade** (`leads_aruja`, `leads_guarulhos`,
  `leads_mogi_das_cruzes`, `leads_santa_isabel`, `leads_sao_paulo`) — a
  tabela `leads` continua sendo uma só (fonte única, sem duplicar
  schema/índice/trigger por cidade, e sem precisar de `UNION` pra
  consultas que cruzam cidades), mas cada view filtra `WHERE cidade = '...'`
  pra navegação rápida no SQL Editor/Table Editor do Supabase, como se
  fossem tabelas separadas. Cidade nova fora dessa lista (fora do escopo
  de `CIDADES`, `src/lib/cidades.js`) ainda vai normal pra `leads` — só não
  ganha view própria até alguém criar uma:
  ```sql
  create or replace view public.leads_<slug_da_cidade> as
    select * from public.leads where cidade = '<cidade normalizada, com acento>';
  ```

A tabela `conhecimento` (com coluna `embedding vector`, extensão
`pgvector`) já existe no mesmo projeto Supabase, pronta pra quando o
agente de proposta for implementado — hoje está vazia, não é populada por
nenhum script deste pipeline.

**Segurança:** RLS está habilitada nas duas tabelas, sem nenhuma policy
ainda — na prática, a chave anon/publishable não tem acesso nenhum hoje
(só a service_role key, que ignora RLS, usada por `syncSupabase.js`). Isso
é intencional: antes de expor `leads` ou `conhecimento` a qualquer client
com a chave anon/publishable (ex: um front-end do futuro agente de
proposta), escreva as policies correspondentes primeiro.

## Como rodar

Pipeline completo (recomendado):

```bash
npm start -- "barbearia" "Arujá"
```

Ou etapa por etapa (útil pra debugar cada passo):

```bash
npm run collect -- "barbearia" "Arujá"
npm run qualify -- "barbearia" "Arujá"
npm run build-queue -- "barbearia" "Arujá"
npm run sync-supabase -- "barbearia" "Arujá"   # opcional, ver "Sincronização com Supabase"
```

Ao final, os arquivos `data/fila_barbearia_aruja.csv` e `.json` terão a
lista de leads ordenada por score, cada um com um link `wa.me` pronto pra
clicar e abordar manualmente.

## Execução manual (sem automação)

O pipeline **não roda mais sozinho** — as 4 tarefas do Windows Task
Scheduler que rodavam em dias alternados (`ProspectorAgent-06h-SantaIsabel`,
`-12h-Aruja`, `-18h-Guarulhos`, `-00h-Mogi`) foram removidas de propósito;
a coleta agora é disparada manualmente, cidade e segmento por vez, quando
fizer sentido (ex: antes de uma sessão de abordagem). `collect.js` só grava
leads novos (não reseta o status de leads já qualificados), então repetir a
execução pro mesmo segmento+cidade é seguro e só consome quota das APIs pra
leads realmente novos.

São Paulo (capital) é o único caso que merece cautela: é uma cidade grande
demais pra uma amostra de 20 resultados por chamada (ver `MAX_PAGINAS` em
`src/sources/googlePlaces.js`) representar bem a cobertura real, e gira a
cota bem mais rápido que as cidades menores.

- **Script:** `scripts/run-one.ps1 -Segmento "barbearia" -Cidade "<cidade>"`
  — continua disponível pra rodar `npm start` com retry simples (2
  tentativas) em falha. Log de cada execução vai em
  `logs/run_<cidade>_<timestamp>.log` (ignorado no git). Útil mesmo sem
  agendamento, só pra não perder uma execução por causa de uma falha
  transitória de rede.
- As 4 cidades de `CIDADES` (`src/lib/cidades.js` — Arujá, Guarulhos, Mogi
  das Cruzes, Santa Isabel) têm proteção contra ambiguidade de cidade
  homônima em outros países (ver PRD seção 6, o caso real que motivou isso:
  "Santa Isabel" também existe na Espanha), usada pelas duas fontes:
  - `LEAD_SOURCE=overpass` busca a área pelo **ID de relação do OSM** (não
    por nome).
  - `LEAD_SOURCE=google_places` restringe a busca com **`locationRestriction`**
    (retângulo/bounding box calculado a partir do centro+raio de `CIDADES`
    — a Places API só aceita `rectangle` em `locationRestriction`, não
    `circle`) — diferente de `locationBias`, que é só preferência de
    ranking e não bloqueia resultado fora da área, `locationRestriction`
    exclui de fato.

  Cidade fora de `CIDADES` cai no comportamento sem proteção de cada fonte
  (casamento por nome no Overpass, texto livre no Google Places), sujeita à
  mesma ambiguidade.
  **Atenção:** as duas fontes não deduplicam entre si — trocar `LEAD_SOURCE`
  entre execuções pro mesmo segmento+cidade pode gravar o mesmo
  estabelecimento duas vezes na fila (um lead `node/`/`way/` do Overpass e
  outro `gplaces/...` do Google Places).

## Modelo de dados (tabela `leads`)

| Campo | Descrição |
|---|---|
| `id` | ID único vindo do OSM (`node/123` ou `way/456`) |
| `segmento`, `cidade` | Chave de busca normalizada (minúsculo) |
| `nome`, `endereco`, `telefone`, `site` | Dados brutos coletados — `site` é sempre vazio/nulo por construção: `collect.js` descarta quem já tem site (ver "Filtro: só quem não tem site") |
| `wa_link` | Link `wa.me` gerado a partir do telefone |
| `score` | Nota 0–100 dada pelo Gemini (ou heurística de fallback) |
| `mensagem` | Mensagem de abordagem gerada pra esse lead |
| `status` | `coletado` → `qualificado` → (futuro: `enviado`, `respondeu`, `descartado`) |

## Decisões de risco e compliance

- **Telefone ≠ WhatsApp confirmado.** O `wa_link` assume que o telefone
  cadastrado no OSM é WhatsApp — verdade na maioria dos casos no Brasil, mas
  não garantido.
- **Envio automatizado não foi implementado de propósito.** Bibliotecas
  não-oficiais de automação do WhatsApp Web violam os Termos de Serviço do
  WhatsApp e arriscam banir o número usado pra prospecção. Esta v0.1 só
  gera a fila para abordagem manual (clicar nos links `wa.me`).
- **LGPD:** os dados coletados são de estabelecimentos (pessoa jurídica),
  não de pessoas físicas — ainda assim, mantenha a abordagem personalizada
  e de baixo volume.

## Limitações conhecidas (v0.1)

- Cobertura de telefone no OSM é inconsistente, principalmente em cidades
  menores.
- Sem paginação/rate-limit tratado no Overpass — cidades muito grandes
  podem estourar o timeout de 25s da query pública. Para essas, fatiar a
  busca por bairro.
- O nome do modelo Gemini em `.env.example` pode estar desatualizado —
  confira o nome vigente antes de rodar em
  https://ai.google.dev/gemini-api/docs/models.
- `resolverTagsOSM` (em `src/sources/segments.js`) cobre um conjunto inicial
  de segmentos comuns — segmentos não mapeados retornam erro pedindo pra
  adicionar uma entrada nova.

## Roadmap (quando fizer sentido financeiro)

Ver seção 7 do PRD original (`../prds/PRD-prospector-agent.md`): WhatsApp
Business API oficial, orquestração via LangGraph. Troca do Overpass pela
Google Places API já implementada (`LEAD_SOURCE`, ver "Fonte de dados");
sincronização com Supabase já implementada como espelho opcional (ver
"Sincronização com Supabase") — SQLite continua sendo a fonte de verdade
local, uma migração completa (aposentar o SQLite) fica pra quando o agente
de proposta precisar rodar fora da máquina local.
