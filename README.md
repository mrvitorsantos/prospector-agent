# Prospector Agent

Agente de prospecção de PMEs (pequenas e médias empresas) por segmento e
cidade. Dado um segmento (ex: `barbearia`, `clínica odontológica`) e uma
cidade (ex: `Arujá`, `Guarulhos`), o agente:

1. **Coleta** estabelecimentos desse segmento na cidade via [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API)
   (consulta sobre dados do OpenStreetMap — grátis, sem chave de API).
2. **Qualifica** cada lead com a [Gemini API](https://ai.google.dev/gemini-api/docs)
   (nota 0–100 + mensagem de abordagem pronta), com heurística de fallback
   se a API não estiver configurada ou falhar.
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
```

Cada etapa roda isolada (`npm run collect`, `npm run qualify`,
`npm run build-queue`) ou em sequência via `npm start` (`src/index.js`).

## Estrutura de pastas

```
src/
  db.js              # setup do SQLite + queries (better-sqlite3)
  collect.js          # etapa 1 — coleta (CLI)
  qualify.js           # etapa 2 — qualificação com Gemini (CLI)
  buildQueue.js        # etapa 3 — monta fila CSV/JSON (CLI)
  index.js             # orquestra as 3 etapas em sequência (CLI)
  sources/
    overpass.js        # cliente Overpass API — buscarLeads(segmento, cidade)
    googlePlaces.js      # cliente Google Places API (New) — mesma interface
    segments.js         # dicionário segmento -> tag(s) OSM (só usado pelo Overpass)
  lib/
    gemini.js           # cliente Gemini API + heurística de fallback
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
| `google_places` | Google Places API (New) — Text Search | Cota gratuita mensal, depois faturado (~$32/1.000 chamadas na tier "Pro" — ver PRD seção 7) | Bem mais completa |

Pra usar `google_places`:

1. Crie um projeto no [Google Cloud Console](https://console.cloud.google.com/), habilite billing (obrigatório mesmo pra usar só a cota gratuita) e habilite a **Places API (New)**.
2. Gere uma chave em [console.cloud.google.com/google/maps-apis/credentials](https://console.cloud.google.com/google/maps-apis/credentials) e coloque em `GOOGLE_PLACES_API_KEY` no `.env`.
3. Mude `LEAD_SOURCE=overpass` para `LEAD_SOURCE=google_places` no `.env`.

Interface de `buscarLeads(segmento, cidade)` é a mesma nas duas fontes — trocar `LEAD_SOURCE` não muda nada em `qualify.js`, `buildQueue.js` nem no schema do SQLite. IDs de lead do Google Places são prefixados com `gplaces/` (o Overpass usa `node/`/`way/`) pra não colidir caso o mesmo banco já tenha leads das duas fontes.

`src/sources/segments.js` (dicionário segmento → tag OSM) só é usado pelo Overpass — o Google Places busca por texto livre (`"<segmento> em <cidade>"`), sem precisar de mapeamento.

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
```

Ao final, os arquivos `data/fila_barbearia_aruja.csv` e `.json` terão a
lista de leads ordenada por score, cada um com um link `wa.me` pronto pra
clicar e abordar manualmente.

## Automação diária

O pipeline roda sozinho via **Task Scheduler do Windows**, sem precisar de
servidor externo — `collect.js` só grava leads novos (não reseta o status de
leads já qualificados), então rodar todo dia é seguro e só consome quota da
Gemini API para leads realmente novos.

Em vez de uma tarefa só cobrindo várias cidades de uma vez, são **4 tarefas
separadas, uma cidade cada, espaçadas ao longo do dia** — isso espalha o
consumo de quota da Gemini em vez de concentrar tudo num único horário:

| Tarefa | Horário | Cidade |
|---|---|---|
| `ProspectorAgent-06h-SantaIsabel` | 06:00 | Santa Isabel |
| `ProspectorAgent-12h-Aruja` | 12:00 | Arujá |
| `ProspectorAgent-18h-Guarulhos` | 18:00 | Guarulhos |
| `ProspectorAgent-00h-Mogi` | 00:00 | Mogi das Cruzes |

- **Script:** `scripts/run-one.ps1 -Segmento "barbearia" -Cidade "<cidade>"`
  — roda `npm start` pra uma cidade, com retry simples (2 tentativas) em
  falha. Log de cada execução vai em `logs/run_<cidade>_<timestamp>.log`
  (ignorado no git).
- As 4 cidades acima usam busca por **ID de área do OSM** (não por nome —
  ver `RELATION_ID_POR_CIDADE` em `src/sources/overpass.js`), o que evita
  ambiguidade com cidades homônimas em outros países (ver PRD seção 6,
  o caso real que motivou isso: "Santa Isabel" também existe na Espanha).
  Cidade fora dessa lista cai no casamento por nome, sujeito à mesma
  ambiguidade.

Comandos úteis (PowerShell) — troque `<nome-da-tarefa>` por uma da tabela:

```powershell
# ver detalhes/status de uma tarefa
Get-ScheduledTask -TaskName "<nome-da-tarefa>" | Format-List

# rodar manualmente agora, pra testar
Start-ScheduledTask -TaskName "<nome-da-tarefa>"

# desabilitar temporariamente (sem apagar)
Disable-ScheduledTask -TaskName "<nome-da-tarefa>"
Enable-ScheduledTask -TaskName "<nome-da-tarefa>"

# remover de vez
Unregister-ScheduledTask -TaskName "<nome-da-tarefa>" -Confirm:$false

# listar as 4 tarefas do Prospector de uma vez
Get-ScheduledTask | Where-Object { $_.TaskName -like "ProspectorAgent-*" }
```

**Limitações das tarefas agendadas (padrão do Windows):**

- Modo "interativo apenas" — só executam se o usuário estiver logado no
  Windows no horário (tela pode estar bloqueada, mas a sessão precisa
  existir). A tarefa das 00:00 é a mais sensível a isso.
- Por padrão, o Task Scheduler não inicia a tarefa se o notebook estiver na
  bateria. Ajuste em `Set-ScheduledTask` ou pelas configurações de energia da
  tarefa na GUI (`taskschd.msc`) se isso for um problema.

## Modelo de dados (tabela `leads`)

| Campo | Descrição |
|---|---|
| `id` | ID único vindo do OSM (`node/123` ou `way/456`) |
| `segmento`, `cidade` | Chave de busca normalizada (minúsculo) |
| `nome`, `endereco`, `telefone`, `site` | Dados brutos coletados |
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

Ver seção 7 do PRD original (`../prds/PRD-prospector-agent.md`):
troca do Overpass pela Google Places API, migração SQLite → Supabase,
WhatsApp Business API oficial, orquestração via LangGraph.
