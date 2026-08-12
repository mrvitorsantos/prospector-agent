import { chaveComparacao } from '../lib/strings.js';
import { fetchComRetry } from '../lib/httpRetry.js';
import { CIDADES } from '../lib/cidades.js';

const PLACES_URL = 'https://places.googleapis.com/v1/places:searchText';
const TIMEOUT_FETCH_MS = 30000;

// nationalPhoneNumber e websiteUri são "Contact Data" — caem no SKU
// "Enterprise" da Places API (New), mais caro que o "Pro" (ver preços
// atualizados em https://mapsplatform.google.com/pricing/, não fixar um
// número aqui pois muda com frequência — ver PRD seção 7). Pedir só os
// campos necessários evita subir pro SKU "Enterprise + Atmosphere" (que
// adiciona rating/reviews, sem uso aqui).
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
  'places.websiteUri',
].join(',');

const MAX_PAGINAS = 1;

// Metros por grau de latitude (~constante); metros por grau de longitude
// varia com a latitude (encolhe perto dos polos) — daí dividir por cos(lat).
const METROS_POR_GRAU_LATITUDE = 111320;

// `SearchTextRequest.LocationRestriction` só aceita `rectangle` (não
// `circle`, que é exclusivo de `locationBias` — a Places API rejeita com
// 400 "Unknown name 'circle' at 'location_restriction'" se tentar). Convertemos
// o centro+raio de CIDADES (../lib/cidades.js, compartilhado com o
// Overpass) num bounding box aproximado em graus.
function locationRestrictionPara(cidade) {
  const centro = CIDADES[chaveComparacao(cidade)];
  if (!centro) return undefined;

  // `raioMetros` é a distância do centro até o CANTO mais distante do
  // bounding box (ver cidades.js), ou seja, a meia-diagonal do retângulo —
  // não a meia-largura/meia-altura. Usá-lo direto como deltaLat/deltaLon
  // infla o retângulo em ~1.41x (sqrt(2)), estourando o boundary real da
  // cidade (achado de code review). Dividir por sqrt(2) faz a meia-diagonal
  // resultante bater com raioMetros de novo.
  const meioLadoMetros = centro.raioMetros / Math.SQRT2;
  const deltaLat = meioLadoMetros / METROS_POR_GRAU_LATITUDE;
  const deltaLon =
    meioLadoMetros / (METROS_POR_GRAU_LATITUDE * Math.cos((centro.lat * Math.PI) / 180));

  // `locationRestriction` (diferente de `locationBias`, que é só preferência
  // de ranking) exclui de fato resultado fora do retângulo — é o que
  // garante a desambiguação de cidade homônima. Cidade fora desse mapa cai
  // no texto livre, sujeita à mesma ambiguidade que o Overpass tem pra
  // cidade não mapeada em CIDADES.
  return {
    rectangle: {
      low: { latitude: centro.lat - deltaLat, longitude: centro.lon - deltaLon },
      high: { latitude: centro.lat + deltaLat, longitude: centro.lon + deltaLon },
    },
  };
}

async function buscarPagina(query, apiKey, pageToken, locationRestriction) {
  return await fetchComRetry(
    PLACES_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': `${FIELD_MASK},nextPageToken`,
      },
      // regionCode "BR" é só um viés geral (todo o app é focado em PMEs no
      // Brasil); locationRestriction é a desambiguação forte pras cidades
      // mapeadas em CIDADES.
      body: JSON.stringify({ textQuery: query, pageToken, regionCode: 'BR', locationRestriction }),
    },
    { apiLabel: 'Google Places API', logTag: '[googlePlaces]', timeoutMs: TIMEOUT_FETCH_MS }
  );
}

function mapearLead(place) {
  return {
    // Prefixo evita colisão com IDs do Overpass (`node/123`, `way/456`) caso
    // o mesmo banco já tenha leads coletados pela fonte antiga.
    id: `gplaces/${place.id}`,
    nome: place.displayName?.text || null,
    endereco: place.formattedAddress || null,
    telefone: place.nationalPhoneNumber || null,
    site: place.websiteUri || null,
  };
}

/**
 * Consulta a Google Places API (New) — Text Search — e retorna os
 * estabelecimentos encontrados para o segmento + cidade informados.
 *
 * Interface estável, mesma de src/sources/overpass.js:
 * `(segmento, cidade) => Promise<lead[]>`. collect.js escolhe qual das duas
 * usar via a env var LEAD_SOURCE (ver README, seção "Fonte de dados").
 *
 * Exige GOOGLE_PLACES_API_KEY configurada (com billing habilitado no Google
 * Cloud — a cota gratuita mensal não dispensa cartão cadastrado). Cobertura
 * de telefone é bem mais completa que o OSM, mas cada chamada é faturável
 * após a cota gratuita (ver PRD seção 7 — SKU "Enterprise", ver comentário
 * de FIELD_MASK acima).
 *
 * Desambiguação de cidade homônima (ex: "Santa Isabel" também existe na
 * Espanha — ver PRD seção 6): aplicada via `locationRestriction`
 * (retângulo/bounding box, ver locationRestrictionPara) só pras cidades em
 * CIDADES (../lib/cidades.js); cidade fora desse mapa cai no texto livre,
 * sujeita ao mesmo risco que o Overpass tem pra cidade não mapeada.
 *
 * Nota: esta fonte e a do Overpass não deduplicam entre si — o mesmo
 * estabelecimento coletado pelas duas (IDs `gplaces/...` vs `node/`/`way/`)
 * vira dois leads distintos na fila se `LEAD_SOURCE` for trocado entre
 * execuções pro mesmo segmento+cidade (ver PRD seção 6).
 */
export async function buscarLeads(segmento, cidade) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GOOGLE_PLACES_API_KEY não configurada em .env. Gere uma chave (com billing habilitado) em ' +
        'https://console.cloud.google.com/google/maps-apis/credentials e habilite a "Places API (New)".'
    );
  }

  const query = `${segmento} em ${cidade}`;
  const locationRestriction = locationRestrictionPara(cidade);
  const leads = [];
  let pageToken;
  let pagina = 0;

  do {
    const dados = await buscarPagina(query, apiKey, pageToken, locationRestriction);
    const places = dados?.places || [];
    leads.push(
      ...places
        // sem `id` não há como montar uma chave estável no banco (ver
        // mapearLead); sem `displayName` não é um lead acionável.
        .filter((place) => place.id && place.displayName?.text)
        .map(mapearLead)
    );

    pageToken = dados?.nextPageToken;
    pagina += 1;
  } while (pageToken && pagina < MAX_PAGINAS);

  return leads;
}
