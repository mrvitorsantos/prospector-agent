import { getLeadsPorStatus, atualizarQualificacao } from './db.js';
import { qualificarComHeuristica, qualificarLoteComGemini } from './lib/gemini.js';
import { normalizarCampo } from './lib/strings.js';
import { isMain } from './lib/cli.js';
import { aguardar } from './lib/async.js';

// Quantos leads vão em cada chamada à Gemini API — reduz o número de
// requests consumidos da quota (o que mais estoura na tier gratuita) sem
// deixar o prompt/resposta grande demais.
// Validado como inteiro positivo pra evitar loop infinito em emLotes() caso
// GEMINI_BATCH_SIZE venha zerado/negativo/inválido no .env.
const TAMANHO_LOTE_ENV = Number(process.env.GEMINI_BATCH_SIZE);
const TAMANHO_LOTE = Number.isInteger(TAMANHO_LOTE_ENV) && TAMANHO_LOTE_ENV > 0 ? TAMANHO_LOTE_ENV : 10;

// Atraso entre lotes pra não estourar o rate-limit por minuto da Gemini API.
const ATRASO_ENTRE_LOTES_MS = 1200;

function emLotes(itens, tamanho) {
  const lotes = [];
  for (let i = 0; i < itens.length; i += tamanho) {
    lotes.push(itens.slice(i, i + tamanho));
  }
  return lotes;
}

/**
 * Etapa 2 do pipeline: lê leads com status "coletado" (filtrando por
 * segmento/cidade se informados), qualifica com a Gemini API (em lotes, pra
 * economizar quota) ou heurística, e avança o status pra "qualificado".
 *
 * Leads sem telefone não têm wa_link e não são acionáveis via WhatsApp de
 * qualquer forma — pra não gastar quota da Gemini à toa, esses usam direto
 * a heurística de fallback (gratuita), sem passar pela API.
 */
export async function qualificar(segmentoInput, cidadeInput) {
  const filtro = {};
  if (segmentoInput) filtro.segmento = normalizarCampo(segmentoInput);
  if (cidadeInput) filtro.cidade = normalizarCampo(cidadeInput);

  const leads = getLeadsPorStatus('coletado', filtro);
  console.log(`[qualify] ${leads.length} lead(s) com status "coletado" para qualificar.`);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn(
      '[qualify] GEMINI_API_KEY não configurada em .env — todos os leads usarão a heurística de fallback (ver src/lib/gemini.js).'
    );
  }

  const semTelefone = leads.filter((lead) => !lead.telefone);
  const comTelefone = leads.filter((lead) => lead.telefone);

  let processados = 0;
  const total = leads.length;

  for (const lead of semTelefone) {
    const resultado = qualificarComHeuristica(lead);
    atualizarQualificacao(lead.id, { score: resultado.score, mensagem: resultado.mensagem });
    processados += 1;
    console.log(
      `[qualify] (${processados}/${total}) ${lead.nome} -> score ${resultado.score} [${resultado.origem}, sem telefone — Gemini pulada]`
    );
  }

  const lotes = emLotes(comTelefone, TAMANHO_LOTE);
  for (const [indice, lote] of lotes.entries()) {
    const resultados = await qualificarLoteComGemini(lote, apiKey);
    const resultadosPorId = new Map(resultados.map((resultado) => [resultado.id, resultado]));

    for (const lead of lote) {
      const resultado = resultadosPorId.get(lead.id) || qualificarComHeuristica(lead);
      atualizarQualificacao(lead.id, { score: resultado.score, mensagem: resultado.mensagem });
      processados += 1;
      console.log(
        `[qualify] (${processados}/${total}) ${lead.nome} -> score ${resultado.score} [${resultado.origem}]`
      );
    }

    if (apiKey && indice < lotes.length - 1) {
      await aguardar(ATRASO_ENTRE_LOTES_MS);
    }
  }

  console.log(`[qualify] ${processados} lead(s) atualizado(s) para status "qualificado".`);
  return { total: processados };
}

if (isMain(import.meta.url)) {
  const [segmento, cidade] = process.argv.slice(2);
  qualificar(segmento, cidade).catch((erro) => {
    console.error(`[qualify] Erro: ${erro.message}`);
    process.exitCode = 1;
  });
}
