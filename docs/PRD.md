# PRD — Agente de Prospecção de PMEs por Segmento e Cidade

## 1. Objetivo

Dado um segmento de negócio (ex: barbearia, clínica odontológica) e uma cidade
(ex: Arujá, Guarulhos), o agente deve:

1. **Coletar** estabelecimentos desse segmento na cidade, com nome, endereço e telefone quando disponível.
2. **Qualificar** cada lead (lead = contato/empresa com potencial de virar cliente) com uma nota de 0–100 e uma mensagem de abordagem pronta.
3. **Montar uma fila de envio** (fila = lista ordenada, aqui por nota decrescente) pronta pra abordagem via WhatsApp — manual, por enquanto.

Versão atual (v0.1) prioriza **custo zero** pra validar o conceito antes de investir em fontes de dados pagas.

## 2. Arquitetura (v0.1 — implementada)

```
segmento + cidade
      │
      ▼
[1. collect.js] ──► Overpass API (motor de consulta sobre dados do
      │              OpenStreetMap, gratuito e sem necessidade de chave de API)
      ▼
  SQLite local (data/leads.db) — banco de dados embutido em arquivo,
      │                           sem servidor externo
      ▼
[2. qualify.js] ──► Gemini API (LLM — modelo de linguagem usado pra dar
      │              nota e gerar a mensagem de abordagem)
      ▼
  SQLite (mesmos registros, agora com score + mensagem)
      │
      ▼
[3. buildQueue.js] ──► data/fila_<segmento>_<cidade>.csv e .json
                        (fila final, ordenada por score, com link wa.me pronto)
```

Cada etapa roda isolada (`collect`, `qualify`, `buildQueue`) ou em sequência via
`index.js`. Isso facilita debugar cada passo separadamente e trocar peças no
futuro sem reescrever o pipeline inteiro.

**Otimização de quota em `qualify.js` (pós-v0.1).** Leads sem telefone não têm
`wa_link` e não são acionáveis via WhatsApp de qualquer forma, então pulam a
Gemini direto pra heurística de fallback (gratuita). Os leads com telefone são
agrupados em lotes (`GEMINI_BATCH_SIZE`, padrão 10) e qualificados numa única
chamada por lote, em vez de uma chamada por lead — reduz o número de requests
consumidos da quota gratuita, que é o limite que mais estoura em uso diário
(ver seção 6).

**Automação diária (pós-v0.1, revertida depois — ver abaixo).**
`scripts/run-one.ps1` + 4 tarefas no Windows Task Scheduler
(`ProspectorAgent-06h-SantaIsabel`, `-12h-Aruja`, `-18h-Guarulhos`,
`-00h-Mogi`) rodavam o pipeline completo uma cidade por vez, espaçadas ao
longo do dia (06h/12h/18h/00h) — em vez de uma tarefa única cobrindo várias
cidades de uma vez, o que concentraria o consumo de quota da Gemini num
único horário. `collect.js` só grava leads novos (não reseta status de
leads já qualificados), então repetir a coleta é segura e só consome quota
da Gemini para leads realmente novos — isso continua valendo mesmo sem
agendamento.

**Volta pra execução manual (pós-v0.1).** As 4 tarefas foram removidas — a
coleta passou a ser disparada manualmente, cidade e segmento por vez,
quando fizer sentido (ver README, seção "Execução manual (sem
automação)"). `scripts/run-one.ps1` continua existindo e sendo útil rodado
à mão (retry simples + log em arquivo), só não é mais chamado por
agendamento.

**Desambiguação de cidade por ID (pós-v0.1).** `overpass.js` busca a área
das 4 cidades acima pelo ID de relação do OSM (`RELATION_ID_POR_CIDADE`,
resolvido via Nominatim), não por nome — evita ambiguidade com cidades
homônimas em outros países, e é mais barato pro Overpass processar que
casamento por nome ou containment de área (ambos testados e descartados —
ver seção 6). Cidade fora dessa lista cai no comportamento original por
nome, sujeito à mesma ambiguidade.

## 3. Stack e por quê

| Camada | Escolha v0.1 | Motivo |
|---|---|---|
| Coleta de dados | Overpass API (OpenStreetMap) | Gratuito, sem cartão, sem limite de créditos. Cobertura de telefone menor que o Google, mas suficiente pra validar. |
| Banco | SQLite local | Zero setup, zero custo, zero dependência externa. Roda no seu PC via SSH/Tailscale sem precisar configurar nada em nuvem. |
| LLM de qualificação | Gemini | Padrão nos seus projetos (exceto o nexus-agent, que usa Claude API). |
| Runtime | Node.js (ES modules) | Consistente com seu stack (React/Node/Supabase/Vercel). |

## 4. Modelo de dados (tabela `leads`)

| Campo | Descrição |
|---|---|
| `id` | ID único vindo do OSM (`node/123` ou `way/456`) |
| `segmento`, `cidade` | Chave de busca normalizada |
| `nome`, `endereco`, `telefone`, `site` | Dados brutos coletados |
| `wa_link` | Link `wa.me` já pronto, gerado a partir do telefone |
| `score` | Nota 0–100 dada pelo Gemini (ou heurística de fallback) |
| `mensagem` | Mensagem de abordagem gerada pra esse lead |
| `status` | `coletado` → `qualificado` → (futuro: `enviado`, `respondeu`, `descartado`) |

## 5. Decisões de risco e compliance

- **Telefone ≠ WhatsApp confirmado.** O `wa_link` assume que o telefone cadastrado
  no OSM é WhatsApp — verdade na maioria dos casos no Brasil, mas não garantido.
- **Envio automatizado não foi implementado de propósito.** Bibliotecas não-oficiais
  de automação do WhatsApp Web violam os Termos de Serviço do WhatsApp e arriscam
  banir o número usado pra prospecção. A v0.1 entrega a fila pronta pra:
  - abordagem manual (clicar nos links `wa.me`), ou
  - integração futura com a WhatsApp Business API oficial, se o volume justificar o custo.
- **LGPD (Lei Geral de Proteção de Dados):** os dados coletados são de
  estabelecimentos (pessoa jurídica/PME), não de pessoas físicas — risco bem
  menor que prospecção B2C, mas ainda vale manter a abordagem personalizada e
  de baixo volume, evitando characterísticas de spam em massa.
- **Política de uso justo da Overpass API.** A instância pública usada por
  `overpass.js` (`overpass-api.de`) desaconselha uso pesado ou agendado sem
  contrapartida — tráfego automatizado recorrente é candidato a
  throttling/bloqueio por IP. Era um risco mais concreto durante a janela em
  que a automação diária (seção 2) rodava sozinha; com a coleta manual atual
  volta a ser teórico, mas vale lembrar se a automação for reativada no
  futuro — mitigação seria rodar uma instância própria do Overpass ou reduzir
  a frequência/quantidade de cidades.

## 6. Limitações conhecidas

- Cobertura de telefone no OSM é inconsistente, principalmente em cidades
  menores — muitos estabelecimentos existem no mapa mas sem contato cadastrado.
  Esses leads são qualificados só por heurística (sem chamar a Gemini — ver
  seção 2), já que não há como abordá-los via WhatsApp de qualquer forma.
- Sem paginação/rate-limit tratado no Overpass — cidades muito grandes (São
  Paulo capital inteira, por exemplo) podem estourar o timeout de 25s da query.
  Pra essas, fatiar por bairro. Ver também o risco de uso justo da Overpass na
  seção 5, agravado pela automação diária.
- Nome do modelo Gemini no `.env.example` pode estar desatualizado — confirme
  o nome vigente em https://ai.google.dev/gemini-api/docs/models antes de rodar.
- ~~As tarefas agendadas só rodam com o usuário logado no Windows e, por
  padrão, não executam se o PC estiver na bateria~~ — não se aplica mais: a
  automação via Task Scheduler foi removida, coleta agora é manual (ver
  README, seção "Execução manual (sem automação)").
- **Ambiguidade de cidade homônima (caso real).** Buscar "Santa Isabel" sem
  restrição de país/estado casou com uma cidade na Espanha (endereços em
  espanhol, telefones `+34`), não com a Santa Isabel-SP pretendida — o
  `wa_link` gerado por cima desse telefone também saiu quebrado (`phone.js`
  assume DDI 55 sempre, ver seção 5). Resolvido para as cidades em `CIDADES`
  (`src/lib/cidades.js`, fonte única usada pelas duas fontes de dados):
  Overpass busca por ID de relação do OSM em vez de nome (ver seção 2);
  Google Places restringe por `locationRestriction` (retângulo/bounding box
  calculado a partir do centro+raio — a Places API só aceita `rectangle`
  nesse campo, não `circle`; `locationBias` é que aceita círculo, mas é só
  preferência de ranking e não bloqueia resultado fora da área). Duas
  alternativas de Overpass foram
  tentadas antes e descartadas por custo: (1) containment área-em-área
  (`area[...](area.estado)`) — gerou 504 até em testes com timeout
  aumentado, muito pesado pro Overpass público; (2) bbox no cabeçalho da
  query — mais barato, mas retornou 0 resultados de forma pouco confiável
  mesmo pra área correta. Cidade fora da lista mapeada continua exposta ao
  mesmo risco, em qualquer uma das duas fontes.
- **As duas fontes de dados não deduplicam entre si.** Um lead do Overpass
  (`node/123`) e o mesmo estabelecimento coletado depois via Google Places
  (`gplaces/ChIJ...`) são registros distintos no SQLite (`ON CONFLICT(id)`
  só dedupe dentro do esquema de ID de uma fonte) — trocar `LEAD_SOURCE`
  entre execuções pro mesmo segmento+cidade pode duplicar o estabelecimento
  na fila final. Sem solução implementada ainda (exigiria matching por
  nome/telefone/endereço, com decisão de threshold de similaridade).

## 7. Roadmap de evolução (quando fizer sentido financeiro)

| Gatilho (threshold mensurável) | Mudança sugerida |
|---|---|
| ~~≥1 cliente fechado pagando pelo serviço, OU ≥30 leads qualificados/semana com taxa de resposta ≥15% no manual atual~~ | ~~Trocar `overpass.js` pela Google Places API (New)~~ — **implementado como opt-in**: `src/sources/googlePlaces.js`, ativado via `LEAD_SOURCE=google_places` no `.env` (padrão continua `overpass`). Faturado no SKU "Enterprise" (telefone/site são "Contact Data") após cota gratuita de 5.000/mês — ver README seção "Fonte de dados" pro preço atualizado. Ainda vale usar o gatilho original pra decidir *quando* migrar a automação diária de fato pra essa fonte. |
| Precisar acessar a fila de outro dispositivo além do PC local, ou 2+ pessoas usando/atualizando a mesma fila | Migrar SQLite → Supabase (Postgres gerenciado), mantendo o mesmo schema de `leads` |
| ≥50 mensagens manuais/semana enviadas de forma consistente por 4 semanas seguidas (volume que já dói fazer à mão) | Avaliar WhatsApp Business API oficial (paga, mas sem risco de ban) |
| Decisões de fluxo (retry por segmento, priorização dinâmica, lidar com falha parcial) não couberem mais em código imperativo simples | Reescrever a orquestração (`index.js`) usando LangGraph, aproveitando o que você já está estudando na trilha da Alura |

Os números acima são estimativas iniciais de corte, não metas fixas — ajustar
conforme a prospecção real for rodando e mostrando o que faz sentido no seu
caso.

## 8. Como pedir evolução no Antigravity

Ao colar este PRD no Antigravity, os pedidos mais úteis pra próxima sessão são:

- "Implemente a troca de `overpass.js` por Google Places API (New), mantendo a mesma interface de `buscarLeads()`."
- "Adicione fatiamento automático por bairro quando a cidade for grande demais pro timeout do Overpass."
- "Migre `db.js` de SQLite pra Supabase, mantendo o mesmo schema."
