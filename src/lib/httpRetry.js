import { aguardar } from './async.js';

const MAX_TENTATIVAS_PADRAO = 3;
const ESPERA_ENTRE_TENTATIVAS_MS_PADRAO = 5000;

/**
 * Erro transitório (falha de rede/timeout, 429 rate-limit, ou 5xx) — vale
 * tentar de novo. O resto dos 4xx (query malformada, chave inválida, etc)
 * não adianta tentar de novo.
 */
export function erroTransitorio(erro) {
  return erro.status === undefined || erro.status === 429 || (erro.status >= 500 && erro.status < 600);
}

/**
 * fetch(url, options) com retry automático em erro transitório —
 * compartilhado entre overpass.js e googlePlaces.js pra evitar que a
 * política de retry das duas fontes divirja (achado de code review: o loop
 * de retry estava copiado quase igual nos dois arquivos).
 */
export async function fetchComRetry(
  url,
  options,
  { apiLabel, logTag, maxTentativas = MAX_TENTATIVAS_PADRAO, esperaMs = ESPERA_ENTRE_TENTATIVAS_MS_PADRAO }
) {
  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    try {
      const resposta = await fetch(url, options);

      if (!resposta.ok) {
        const corpo = await resposta.text().catch(() => '');
        const erro = new Error(`${apiLabel} respondeu ${resposta.status}: ${corpo.slice(0, 300)}`);
        erro.status = resposta.status;
        throw erro;
      }

      return resposta;
    } catch (erro) {
      const ultimaTentativa = tentativa === maxTentativas;
      if (!erroTransitorio(erro) || ultimaTentativa) {
        throw erro;
      }
      console.warn(
        `${logTag} Tentativa ${tentativa}/${maxTentativas} falhou (${erro.message}). Tentando de novo em ${esperaMs}ms...`
      );
      await aguardar(esperaMs);
    }
  }

  throw new Error(`${logTag} Falha inesperada após esgotar as tentativas.`);
}
