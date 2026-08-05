# Plano de implementação — Prospector Agent

Baseado no PRD `../prds/PRD-prospector-agent.md`. Stack e arquitetura já
definidas no PRD (Node.js ES modules + SQLite + Overpass API + Gemini API),
sem necessidade de decisão adicional de stack.

## Fase 0 — Estrutura base (concluída nesta sessão)

- [x] `package.json` (ES modules, scripts `collect`/`qualify`/`build-queue`/`start`)
- [x] `.env.example` com `GEMINI_API_KEY`, `GEMINI_MODEL` (com aviso pra
      conferir o nome vigente), `DB_PATH`, `WA_DEFAULT_COUNTRY_CODE`
- [x] `.gitignore` (node_modules, `.env`, `data/*.db*`, `data/fila_*`)
- [x] `src/db.js` — setup do SQLite (better-sqlite3) + schema da tabela `leads`
- [x] `src/sources/overpass.js` + `src/sources/segments.js` — cliente Overpass
      e dicionário segmento → tags OSM
- [x] `src/lib/gemini.js` — cliente Gemini API + heurística de fallback
- [x] `src/lib/phone.js`, `src/lib/csv.js`, `src/lib/cli.js` — helpers
- [x] `src/collect.js`, `src/qualify.js`, `src/buildQueue.js`, `src/index.js`
      — os 4 scripts do pipeline, com lógica funcional completa
- [x] `README.md`
- [x] `git init`

Todas as funções puras (normalização, geração de link wa.me, CSV,
resolução de tags OSM) foram testadas manualmente com `node --check` e
chamadas diretas via `node -e`. As chamadas de rede reais (Overpass e
Gemini) **não foram executadas** nesta sessão — ver "Próximos passos".

## Fase 1 — Instalar dependências e validar coleta

- [ ] Rodar `npm install` (instala `better-sqlite3`, que compila um módulo
      nativo — pode precisar de build tools no Windows, ver seção de
      troubleshooting no README se falhar)
- [ ] Rodar `npm run collect -- "barbearia" "Arujá"` (ou outro segmento já
      mapeado em `src/sources/segments.js`) e validar:
  - Query Overpass retorna resultados dentro do timeout de 25s
  - Leads são gravados em `data/leads.db` com status `coletado`
  - Telefones capturados geram `wa_link` corretos

## Fase 2 — Configurar Gemini e validar qualificação

- [ ] Gerar uma chave em https://aistudio.google.com/apikey e preencher
      `GEMINI_API_KEY` no `.env`
- [ ] Conferir se `GEMINI_MODEL` (`.env.example`) ainda é um nome de modelo
      válido em https://ai.google.dev/gemini-api/docs/models — atualizar se
      necessário
- [ ] Rodar `npm run qualify -- "barbearia" "Arujá"` e validar:
  - Parsing do JSON retornado pela Gemini funciona (`score` + `mensagem`)
  - Fallback heurístico funciona se a API key for removida/inválida
  - Status dos leads avança para `qualificado`

## Fase 3 — Validar fila final

- [ ] Rodar `npm run build-queue -- "barbearia" "Arujá"`
- [ ] Abrir `data/fila_barbearia_aruja.csv` e `.json`, conferir ordenação
      por score decrescente e se os links `wa.me` abrem corretamente no
      WhatsApp (teste manual, clicando em 2–3 links)
- [ ] Rodar o pipeline completo com `npm start -- "<segmento>" "<cidade>"`
      pra validar a orquestração de ponta a ponta

## Fase 4 — Ajustes pós-validação (se necessário)

- [ ] Ampliar `SEGMENT_TAGS` em `src/sources/segments.js` com outros
      segmentos de interesse que não retornaram resultado
- [ ] Ajustar o prompt da Gemini (`src/lib/gemini.js`) se as mensagens
      geradas não estiverem no tom desejado
- [ ] Se uma cidade grande estourar o timeout do Overpass, avaliar fatiar a
      busca por bairro (mudança pontual em `src/sources/overpass.js`)

## Fase 5 — Roadmap futuro (fora do escopo desta implementação)

Ver seção 7 do PRD — só entrar aqui quando o gatilho correspondente
acontecer:

- Trocar `src/sources/overpass.js` pela Google Places API (New), mantendo
  a mesma interface `buscarLeads(segmento, cidade)`
- Migrar `src/db.js` de SQLite para Supabase, mantendo o schema de `leads`
- Avaliar WhatsApp Business API oficial se o volume de abordagem justificar
- Reescrever `src/index.js` com LangGraph para decisões dinâmicas de fluxo
