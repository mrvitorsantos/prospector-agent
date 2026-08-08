import { buscarLeads as buscarLeadsOverpass } from './sources/overpass.js';
import { buscarLeads as buscarLeadsGooglePlaces } from './sources/googlePlaces.js';
import { upsertLeadColetado, getDb } from './db.js';
import { gerarLinkWhatsApp } from './lib/phone.js';
import { normalizarCampo } from './lib/strings.js';
import { isMain } from './lib/cli.js';

// Fonte de dados usada pra coleta — "overpass" (OSM, grátis) é o padrão da
// v0.1. "google_places" tem cobertura de telefone bem melhor mas é faturado
// após a cota gratuita mensal (ver README, seção "Fonte de dados", e PRD
// seção 7) — só ative depois de configurar GOOGLE_PLACES_API_KEY com
// billing habilitado.
const LEAD_SOURCE = process.env.LEAD_SOURCE === 'google_places' ? 'google_places' : 'overpass';
const FONTES = {
  overpass: { buscarLeads: buscarLeadsOverpass, rotulo: 'Overpass API (OSM)' },
  google_places: { buscarLeads: buscarLeadsGooglePlaces, rotulo: 'Google Places API' },
};

/**
 * Etapa 1 do pipeline: coleta estabelecimentos de um segmento numa cidade
 * (via Overpass ou Google Places, ver LEAD_SOURCE) e grava (ou atualiza)
 * cada um em SQLite com status "coletado".
 */
export async function coletar(segmentoInput, cidadeInput) {
  if (!segmentoInput || !cidadeInput) {
    throw new Error('Uso: node src/collect.js "<segmento>" "<cidade>"');
  }

  const fonte = FONTES[LEAD_SOURCE];
  console.log(`[collect] Buscando "${segmentoInput}" em "${cidadeInput}" via ${fonte.rotulo}...`);
  const leadsBrutos = await fonte.buscarLeads(segmentoInput, cidadeInput);
  console.log(`[collect] ${leadsBrutos.length} estabelecimento(s) encontrado(s).`);

  const segmento = normalizarCampo(segmentoInput);
  const cidade = normalizarCampo(cidadeInput);

  getDb(); // garante que o schema já existe antes de gravar

  for (const lead of leadsBrutos) {
    upsertLeadColetado({
      id: lead.id,
      segmento,
      cidade,
      nome: lead.nome,
      endereco: lead.endereco,
      telefone: lead.telefone,
      site: lead.site,
      wa_link: gerarLinkWhatsApp(lead.telefone),
    });
  }

  console.log(`[collect] ${leadsBrutos.length} lead(s) gravado(s)/atualizado(s) em SQLite com status "coletado".`);
  return { total: leadsBrutos.length };
}

if (isMain(import.meta.url)) {
  const [segmento, cidade] = process.argv.slice(2);
  coletar(segmento, cidade).catch((erro) => {
    console.error(`[collect] Erro: ${erro.message}`);
    process.exitCode = 1;
  });
}
