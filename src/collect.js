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
const LEAD_SOURCE_ENV = process.env.LEAD_SOURCE;
const FONTES = {
  overpass: { buscarLeads: buscarLeadsOverpass, rotulo: 'Overpass API (OSM)' },
  google_places: { buscarLeads: buscarLeadsGooglePlaces, rotulo: 'Google Places API' },
};
// `in` (e acesso direto por colchete) também casa com propriedades herdadas
// de Object.prototype (ex: LEAD_SOURCE="constructor") — hasOwnProperty evita
// esse vazamento (achado de code review).
const FONTE_VALIDA = (nome) => Object.prototype.hasOwnProperty.call(FONTES, nome);
const LEAD_SOURCE = FONTE_VALIDA(LEAD_SOURCE_ENV) ? LEAD_SOURCE_ENV : 'overpass';

// Valor desconhecido (typo, variação de caixa) cai pro padrão "overpass" sem
// erro pra não travar a automação — mas silenciosamente, então avisa alto:
// sem isso, um LEAD_SOURCE mal digitado faz a tarefa rodar de graça
// enquanto o operador acha que está gastando cota paga (achado de code review).
if (LEAD_SOURCE_ENV && !FONTE_VALIDA(LEAD_SOURCE_ENV)) {
  console.warn(
    `[collect] LEAD_SOURCE="${LEAD_SOURCE_ENV}" não reconhecido (valores válidos: ${Object.keys(FONTES)
      .map((v) => `"${v}"`)
      .join(', ')}) — usando "overpass" como padrão.`
  );
}

/**
 * Etapa 1 do pipeline: coleta estabelecimentos de um segmento numa cidade
 * (via Overpass ou Google Places, ver LEAD_SOURCE), descarta quem já tem
 * site cadastrado na fonte (fora do público-alvo — ver comentário acima do
 * filtro) e grava (ou atualiza) o restante em SQLite com status "coletado".
 */
export async function coletar(segmentoInput, cidadeInput) {
  if (!segmentoInput || !cidadeInput) {
    throw new Error('Uso: node src/collect.js "<segmento>" "<cidade>"');
  }

  const fonte = FONTES[LEAD_SOURCE];
  console.log(`[collect] Buscando "${segmentoInput}" em "${cidadeInput}" via ${fonte.rotulo}...`);
  const leadsBrutos = await fonte.buscarLeads(segmentoInput, cidadeInput);
  console.log(`[collect] ${leadsBrutos.length} estabelecimento(s) encontrado(s).`);

  // O produto é prospectar quem NÃO tem site pra oferecer criação de site ou
  // sistema de agendamento — lead que já tem site cadastrado na fonte não é
  // o público-alvo, então nem entra no banco (evita gastar qualificação da
  // Gemini com quem não vamos abordar).
  const leadsSemSite = leadsBrutos.filter((lead) => !lead.site);
  const comSiteDescartados = leadsBrutos.length - leadsSemSite.length;
  console.log(
    `[collect] ${leadsSemSite.length} sem site (alvo da prospecção), ${comSiteDescartados} descartado(s) por já ter site.`
  );

  const segmento = normalizarCampo(segmentoInput);
  const cidade = normalizarCampo(cidadeInput);

  getDb(); // garante que o schema já existe antes de gravar

  for (const lead of leadsSemSite) {
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

  console.log(`[collect] ${leadsSemSite.length} lead(s) gravado(s)/atualizado(s) em SQLite com status "coletado".`);
  return { total: leadsSemSite.length };
}

if (isMain(import.meta.url)) {
  const [segmento, cidade] = process.argv.slice(2);
  coletar(segmento, cidade).catch((erro) => {
    console.error(`[collect] Erro: ${erro.message}`);
    process.exitCode = 1;
  });
}
