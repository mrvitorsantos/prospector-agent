const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 30000;

function urlGemini(modelo) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;
}

function montarPrompt(lead) {
  return `Você é um especialista em prospecção B2B para pequenas e médias empresas (PMEs) no Brasil.

Analise o lead abaixo e responda SOMENTE com um JSON válido (sem markdown, sem texto antes ou depois), no formato exato:
{"score": <número inteiro de 0 a 100>, "mensagem": "<mensagem de abordagem em português>"}

Critérios de nota (score):
- Ter telefone cadastrado facilita a abordagem: aumenta a nota.
- Ter site indica um negócio mais estruturado: aumenta um pouco a nota.
- Nome e endereço completos e coerentes: aumenta a nota.
- Falta de dados básicos (sem telefone, sem endereço): reduz a nota.

A mensagem de abordagem deve:
- Ser curta (até 3 frases), natural e em português do Brasil.
- Se apresentar brevemente e citar o nome do estabelecimento.
- Ser adequada para envio manual via WhatsApp (não pode parecer spam em massa).
- Apenas abrir uma conversa — não prometer nada que não foi pedido.

Dados do lead:
- Nome: ${lead.nome}
- Segmento: ${lead.segmento}
- Cidade: ${lead.cidade}
- Endereço: ${lead.endereco || 'não informado'}
- Telefone: ${lead.telefone || 'não informado'}
- Site: ${lead.site || 'não informado'}`;
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
 * Heurística de fallback usada quando a Gemini API falha, demora demais ou
 * não está configurada (sem GEMINI_API_KEY) — mantém o pipeline funcional
 * mesmo sem LLM disponível, com uma nota mais conservadora.
 */
export function qualificarComHeuristica(lead) {
  let score = 40;
  if (lead.telefone) score += 30;
  if (lead.site) score += 15;
  if (lead.endereco) score += 10;
  score = Math.min(score, 95);

  const mensagem =
    `Olá! Vi o ${lead.nome} aqui em ${lead.cidade} e queria entender rapidinho ` +
    'como vocês cuidam da parte de [assunto] hoje. Tem 2 minutos pra trocar uma ideia?';

  return { score, mensagem, origem: 'heuristica' };
}

/**
 * Qualifica um lead usando a Gemini API (nota 0-100 + mensagem de
 * abordagem). Cai para a heurística de fallback (qualificarComHeuristica)
 * se `apiKey` não estiver definida ou se a chamada falhar por qualquer
 * motivo (rede, timeout, resposta fora do formato esperado, etc).
 */
export async function qualificarComGemini(lead, apiKey) {
  if (!apiKey) {
    return qualificarComHeuristica(lead);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const resposta = await fetch(`${urlGemini(GEMINI_MODEL)}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: montarPrompt(lead) }] }],
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

    const { score, mensagem } = extrairJsonDaResposta(texto);
    if (typeof score !== 'number' || typeof mensagem !== 'string') {
      throw new Error('JSON retornado pela Gemini API fora do formato esperado ({score, mensagem}).');
    }

    return {
      score: Math.max(0, Math.min(100, Math.round(score))),
      mensagem,
      origem: 'gemini',
    };
  } catch (erro) {
    console.warn(
      `[qualify] Falha ao qualificar "${lead.nome}" com Gemini (${erro.message}). Usando heurística de fallback.`
    );
    return qualificarComHeuristica(lead);
  } finally {
    clearTimeout(timeoutId);
  }
}
