import { aguardar } from '../lib/async.js';

const PLACES_URL = 'https://places.googleapis.com/v1/places:searchText';
const TIMEOUT_FETCH_MS = 30000;

// Campos "Pro" (telefone/site) — é o que determina o custo por chamada
// (ver PRD seção 7: ~$32/1.000 chamadas após a cota gratuita mensal).
// Pedir só o necessário mantém o custo no SKU mais barato disponível pra
// esse dado.
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
  'places.websiteUri',
].join(',');

// Cada página custa uma chamada faturável — 1 página (até 20 resultados) é
// suficiente pro volume de PME por segmento/cidade da v0.1 e mantém o
// consumo de cota previsível. Ajuste se precisar de mais cobertura por
// cidade grande.
const MAX_PAGINAS = 1;

// A API ocasionalmente responde 429 (rate-limit) ou 5xx sob uso automatizado
// — mesma estratégia de retry usada em src/sources/overpass.js.
const MAX_TENTATIVAS = 3;
const ESPERA_ENTRE_TENTATIVAS_MS = 5000;

function erroTransitorio(erro) {
  return erro.status === undefined || erro.status === 429 || (erro.status >= 500 && erro.status < 600);
}

async function buscarPagina(query, apiKey, pageToken) {
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      const resposta = await fetch(PLACES_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': `${FIELD_MASK},nextPageToken`,
        },
        body: JSON.stringify({ textQuery: query, pageToken }),
        signal: AbortSignal.timeout(TIMEOUT_FETCH_MS),
      });

      if (!resposta.ok) {
        const corpo = await resposta.text().catch(() => '');
        const erro = new Error(`Google Places API respondeu ${resposta.status}: ${corpo.slice(0, 300)}`);
        erro.status = resposta.status;
        throw erro;
      }

      return await resposta.json();
    } catch (erro) {
      const ultimaTentativa = tentativa === MAX_TENTATIVAS;
      if (!erroTransitorio(erro) || ultimaTentativa) {
        throw erro;
      }
      console.warn(
        `[googlePlaces] Tentativa ${tentativa}/${MAX_TENTATIVAS} falhou (${erro.message}). Tentando de novo em ${ESPERA_ENTRE_TENTATIVAS_MS}ms...`
      );
      await aguardar(ESPERA_ENTRE_TENTATIVAS_MS);
    }
  }

  // Inatingível: buscarPagina sempre retorna ou lança na última tentativa.
  throw new Error('[googlePlaces] Falha inesperada após esgotar as tentativas.');
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
 * após a cota gratuita (ver PRD seção 7).
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
  const leads = [];
  let pageToken;
  let pagina = 0;

  do {
    const dados = await buscarPagina(query, apiKey, pageToken);
    const places = dados.places || [];
    leads.push(...places.filter((place) => place.displayName?.text).map(mapearLead));

    pageToken = dados.nextPageToken;
    pagina += 1;
  } while (pageToken && pagina < MAX_PAGINAS);

  return leads;
}
