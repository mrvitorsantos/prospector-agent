import { resolverTagsOSM } from './segments.js';
import { chaveComparacao } from '../lib/strings.js';
import { fetchComRetry } from '../lib/httpRetry.js';
import { CIDADES } from '../lib/cidades.js';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const TIMEOUT_QUERY_S = 25; // limite prático do servidor público do Overpass (ver PRD seção 6)
const TIMEOUT_FETCH_MS = 30000; // margem sobre TIMEOUT_QUERY_S pra cobrir conexão que trava sem resposta

// Buscar a área da cidade por ID de relação do OSM (ver CIDADES em
// ../lib/cidades.js) em vez de por nome elimina qualquer ambiguidade com
// cidades homônimas em outros países/estados — foi o que aconteceu com
// "Santa Isabel", que também existe na Espanha, e o Overpass casou com a
// errada. É também a consulta mais barata que existe pro Overpass processar
// (sem casamento de nome nem containment de área — chegou a gerar 504 nas
// duas tentativas). Cidade fora de CIDADES cai no fallback por nome (ver
// montarQuery), sujeito à mesma ambiguidade da v0.1 original (ver PRD seção 6).
function areaOSMPorRelationId(relationId) {
  // Convenção do Overpass: id de área de uma relação = 3.6 bilhões + id da
  // relação (ver https://wiki.openstreetmap.org/wiki/Overpass_API/Areas).
  return 3600000000 + relationId;
}

function montarFiltrosTag(tags) {
  return tags
    .map((tag) => {
      const [chave, valor] = tag.split('=');
      return `  node["${chave}"="${valor}"](area.a);\n  way["${chave}"="${valor}"](area.a);`;
    })
    .join('\n');
}

function montarQuery(segmento, cidade) {
  const tags = resolverTagsOSM(segmento);
  if (!tags) {
    throw new Error(
      `Segmento "${segmento}" não está mapeado em src/sources/segments.js. ` +
        'Adicione uma entrada com a(s) tag(s) OSM correspondente(s) (ex: "amenity=dentist") e tente de novo.'
    );
  }

  const relationId = CIDADES[chaveComparacao(cidade)]?.relationId;

  // Cidade mapeada: busca a área direto pelo ID da relação (sem ambiguidade,
  // sem casamento de nome). Cidade fora do mapa: cai no comportamento
  // original da v0.1 — casa pelo nome exato, sujeito a homônimos em outros
  // países/estados (ver PRD seção 6).
  const areaStatement = relationId
    ? `area(id:${areaOSMPorRelationId(relationId)})->.a;`
    : `area["name"="${cidade}"]["boundary"="administrative"]->.a;`;

  return `
    [out:json][timeout:${TIMEOUT_QUERY_S}];
    ${areaStatement}
    (
${montarFiltrosTag(tags)}
    );
    out center tags;
  `;
}

function extrairTelefone(tags = {}) {
  return tags.phone || tags['contact:phone'] || tags['contact:mobile'] || null;
}

function extrairSite(tags = {}) {
  return tags.website || tags['contact:website'] || null;
}

function montarEndereco(tags = {}) {
  const partes = [
    tags['addr:street'],
    tags['addr:housenumber'],
    tags['addr:suburb'],
    tags['addr:city'],
  ].filter(Boolean);
  return partes.length ? partes.join(', ') : null;
}

/**
 * Consulta a Overpass API (dados do OpenStreetMap, gratuita e sem chave) e
 * retorna os estabelecimentos brutos encontrados para o segmento + cidade
 * informados.
 *
 * Interface estável de propósito: `(segmento, cidade) => Promise<lead[]>`.
 * Trocar essa implementação por outra fonte (ex: Google Places API, ver PRD
 * seção 8) não deve exigir mudanças em collect.js — só trocar o import.
 *
 * Limitação conhecida (v0.1): sem paginação tratada. Cidades muito grandes
 * podem estourar o timeout de 25s da query pública — para essas, fatiar a
 * busca por bairro (ver PRD seção 6). Erros transitórios (5xx, falha de
 * rede) são tentados de novo automaticamente antes de desistir.
 *
 * Ambiguidade de nome (ex: cidades homônimas em outros países): resolvida
 * para as cidades em CIDADES (../lib/cidades.js) via busca por ID; qualquer
 * outra cidade cai no casamento por nome exato, ainda sujeito ao problema.
 */
export async function buscarLeads(segmento, cidade) {
  const query = montarQuery(segmento, cidade);

  const dados = await fetchComRetry(
    OVERPASS_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        // O Apache do Overpass responde 406 a requisições sem esses headers
        // (o fetch nativo do Node não os envia por padrão).
        Accept: '*/*',
        'User-Agent': 'prospector-agent/0.1',
      },
      body: query,
    },
    {
      apiLabel: 'Overpass API',
      logTag: '[overpass]',
      // [timeout:${TIMEOUT_QUERY_S}] na query só limita a execução no
      // servidor — não fecha a conexão se o servidor aceitar e nunca
      // responder. Sem isso, uma tentativa pode travar indefinidamente
      // numa execução agendada.
      timeoutMs: TIMEOUT_FETCH_MS,
    }
  );

  const elementos = dados?.elements || [];

  return elementos
    .filter((elemento) => elemento.tags?.name) // ignora elementos sem nome (pouco úteis pra prospecção)
    .map((elemento) => ({
      id: `${elemento.type}/${elemento.id}`,
      nome: elemento.tags.name,
      endereco: montarEndereco(elemento.tags),
      telefone: extrairTelefone(elemento.tags),
      site: extrairSite(elemento.tags),
    }));
}
