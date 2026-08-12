const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 30000;

function urlGemini(modelo) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;
}

function descreverLead(lead) {
  return `- id: ${lead.id}
  Nome: ${lead.nome}
  Segmento: ${lead.segmento}
  Cidade: ${lead.cidade}
  Endereço: ${lead.endereco || 'não informado'}
  Telefone: ${lead.telefone || 'não informado'}`;
}

function montarPromptLote(leads) {
  return `Você é um especialista em prospecção B2B para pequenas e médias empresas (PMEs) no Brasil.

Todos os leads abaixo já foram filtrados por NÃO terem site cadastrado — são o público-alvo de uma oferta de criação de site institucional ou sistema de agendamento online. Analise CADA lead e responda SOMENTE com um JSON array válido (sem markdown, sem texto antes ou depois), com exatamente um objeto por lead, na mesma ordem em que os leads foram listados, no formato exato:
[{"id": "<id do lead>", "score": <número inteiro de 0 a 100>, "mensagem": "<mensagem de abordagem em português>"}, ...]

Critérios de nota (score):
- Ter telefone cadastrado facilita a abordagem: aumenta a nota.
- Nome e endereço completos e coerentes (negócio parece ativo e estabelecido): aumenta a nota.
- Segmento com fluxo de agendamento natural (ex: barbearia, clínica, salão, academia) se beneficia mais de um sistema de agendamento online: aumenta um pouco a nota.
- Falta de dados básicos (sem telefone, sem endereço): reduz a nota.

Cada mensagem de abordagem deve:
- Ser curta (até 3 frases), natural e em português do Brasil.
- Se apresentar brevemente e citar o nome do estabelecimento.
- Mencionar, de forma leve e não intrusiva, que percebeu que o estabelecimento não tem site — sem soar como crítica.
- Ser adequada para envio manual via WhatsApp (não pode parecer spam em massa).
- Apenas abrir uma conversa (perguntar como funciona o atendimento/agendamento hoje) — não empurrar venda de site/agendamento nem prometer nada que não foi pedido.

Leads:
${leads.map(descreverLead).join('\n')}`;
}

function extrairJsonDaResposta(texto) {
  const limpo = texto
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '');
  return JSON.parse(limpo);
}

/**
 * Heurística de fallback usada quando a Gemini API falha, demora demais,
 * não está configurada (sem GEMINI_API_KEY), ou quando o lead não tem
 * telefone (sem wa_link, não é acionável via WhatsApp de qualquer forma —
 * não vale a pena gastar quota da Gemini nele).
 *
 * Todo lead que chega aqui já foi filtrado em collect.js por não ter site
 * (é o público-alvo da oferta de site/agendamento online) — por isso o
 * campo `site` não entra mais nos critérios de nota.
 */
export function qualificarComHeuristica(lead) {
  let score = 40;
  if (lead.telefone) score += 30;
  if (lead.endereco) score += 15;
  score = Math.min(score, 95);

  const mensagem =
    `Olá! Vi o ${lead.nome} aqui em ${lead.cidade} e não encontrei um site ou agendamento ` +
    'online de vocês. Queria entender rapidinho como funciona o atendimento aí hoje. Tem 2 minutos pra trocar uma ideia?';

  return { score, mensagem, origem: 'heuristica' };
}

/**
 * Qualifica um lote de leads (score + mensagem, um resultado por lead) numa
 * única chamada à Gemini API — reduz o número de requests consumidos da
 * quota em comparação a uma chamada por lead. Cai para a heurística de
 * fallback em TODO o lote se `apiKey` não estiver definida ou a chamada
 * falhar/vier num formato inesperado (evita mapear resultado errado pro
 * lead errado).
 */
export async function qualificarLoteComGemini(leads, apiKey) {
  if (!apiKey) {
    return leads.map((lead) => ({ id: lead.id, ...qualificarComHeuristica(lead) }));
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const resposta = await fetch(`${urlGemini(GEMINI_MODEL)}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: montarPromptLote(leads) }] }],
        generationConfig: { temperature: 0.4 },
      }),
    });

    if (!resposta.ok) {
      const corpo = await resposta.text().catch(() => '');
      throw new Error(`Gemini API respondeu ${resposta.status}: ${corpo.slice(0, 300)}`);
    }

    const dados = await resposta.json();
    const texto = dados.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!texto) {
      throw new Error('Resposta da Gemini API sem conteúdo de texto (candidates[0].content.parts[0].text vazio).');
    }

    const itens = extrairJsonDaResposta(texto);
    if (!Array.isArray(itens) || itens.length !== leads.length) {
      throw new Error(
        `JSON retornado pela Gemini API com formato inesperado (esperava array de ${leads.length} item(ns)).`
      );
    }

    const idsEsperados = new Set(leads.map((lead) => lead.id));
    const idsVistos = new Set();

    return itens.map((item) => {
      if (
        typeof item.id !== 'string' ||
        !idsEsperados.has(item.id) ||
        idsVistos.has(item.id) ||
        typeof item.score !== 'number' ||
        typeof item.mensagem !== 'string'
      ) {
        throw new Error(
          'Item do JSON retornado pela Gemini API fora do formato esperado, com id fora do lote ou duplicado ({id, score, mensagem}).'
        );
      }
      idsVistos.add(item.id);
      return {
        id: item.id,
        score: Math.max(0, Math.min(100, Math.round(item.score))),
        mensagem: item.mensagem,
        origem: 'gemini',
      };
    });
  } catch (erro) {
    console.warn(
      `[qualify] Falha ao qualificar lote de ${leads.length} lead(s) com Gemini (${erro.message}). Usando heurística de fallback para o lote.`
    );
    return leads.map((lead) => ({ id: lead.id, ...qualificarComHeuristica(lead) }));
  } finally {
    clearTimeout(timeoutId);
  }
}
