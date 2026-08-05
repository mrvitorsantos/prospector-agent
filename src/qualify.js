import { getLeadsPorStatus, atualizarQualificacao } from './db.js';
import { qualificarComGemini } from './lib/gemini.js';
import { normalizarCampo } from './lib/strings.js';
import { isMain } from './lib/cli.js';

// Pequeno atraso entre chamadas pra não estourar o rate-limit da Gemini API
// (principalmente relevante na tier gratuita).
const ATRASO_ENTRE_CHAMADAS_MS = 1200;

function aguardar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Etapa 2 do pipeline: lê leads com status "coletado" (filtrando por
 * segmento/cidade se informados), chama a Gemini API pra gerar score +
 * mensagem de abordagem, e avança o status pra "qualificado".
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

  let processados = 0;
  for (const lead of leads) {
    const resultado = await qualificarComGemini(lead, apiKey);
    atualizarQualificacao(lead.id, { score: resultado.score, mensagem: resultado.mensagem });
    processados += 1;
    console.log(
      `[qualify] (${processados}/${leads.length}) ${lead.nome} -> score ${resultado.score} [${resultado.origem}]`
    );

    if (apiKey && processados < leads.length) {
      await aguardar(ATRASO_ENTRE_CHAMADAS_MS);
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
