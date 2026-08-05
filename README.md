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
    segments.js         # dicionário segmento -> tag(s) OSM
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

O pipeline pode rodar sozinho todo dia via **Task Scheduler do Windows**, sem
precisar de servidor externo — `collect.js` só grava leads novos (não reseta
o status de leads já qualificados), então rodar todo dia é seguro e só
consome quota da Gemini API para leads realmente novos.

- **Script:** `scripts/run-daily.ps1` — roda `npm start` para cada combinação
  de segmento/cidade definida na variável `$combos` dentro do script (edite
  esse array para adicionar/remover cidades). Log de cada execução vai em
  `logs/run-daily_<timestamp>.log` (ignorado no git).
- **Tarefa registrada:** `ProspectorAgent-DailyRun`, diária às 6h.

Comandos úteis (PowerShell):

```powershell
# ver detalhes/status da tarefa
Get-ScheduledTask -TaskName "ProspectorAgent-DailyRun" | Format-List

# rodar manualmente agora, pra testar
Start-ScheduledTask -TaskName "ProspectorAgent-DailyRun"

# desabilitar temporariamente (sem apagar)
Disable-ScheduledTask -TaskName "ProspectorAgent-DailyRun"
Enable-ScheduledTask -TaskName "ProspectorAgent-DailyRun"

# remover de vez
Unregister-ScheduledTask -TaskName "ProspectorAgent-DailyRun" -Confirm:$false
```

**Limitações da tarefa agendada (padrão do Windows):**

- Modo "interativo apenas" — só executa se o usuário estiver logado no
  Windows no horário (tela pode estar bloqueada, mas a sessão precisa
  existir).
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
