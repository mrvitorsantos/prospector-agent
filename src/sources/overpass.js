import { resolverTagsOSM } from './segments.js';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const TIMEOUT_QUERY_S = 25; // limite prático do servidor público do Overpass (ver PRD seção 6)

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

  // Busca a área administrativa pelo nome exato da cidade. Limitação aceita
  // na v0.1: não desambigua cidades homônimas em estados/países diferentes
  // (ver PRD seção 6) — para esses casos, seja mais específico no nome
  // (ex: usar o nome exato como aparece no OSM/Nominatim).
  return `
    [out:json][timeout:${TIMEOUT_QUERY_S}];
    area["name"="${cidade}"]["boundary"="administrative"]->.a;
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
 * Limitação conhecida (v0.1): sem paginação/rate-limit tratado. Cidades
 * muito grandes podem estourar o timeout de 25s da query pública — para
 * essas, fatiar a busca por bairro (ver PRD seção 6).
 */
export async function buscarLeads(segmento, cidade) {
  const query = montarQuery(segmento, cidade);

  const resposta = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      // O Apache do Overpass responde 406 a requisições sem esses headers
      // (o fetch nativo do Node não os envia por padrão).
      Accept: '*/*',
      'User-Agent': 'prospector-agent/0.1',
    },
    body: query,
  });

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => '');
    throw new Error(`Overpass API respondeu ${resposta.status}: ${corpo.slice(0, 300)}`);
  }

  const dados = await resposta.json();
  const elementos = dados.elements || [];

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
