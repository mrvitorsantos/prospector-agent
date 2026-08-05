import { buscarLeads } from './sources/overpass.js';
import { upsertLeadColetado, getDb } from './db.js';
import { gerarLinkWhatsApp } from './lib/phone.js';
import { normalizarCampo } from './lib/strings.js';
import { isMain } from './lib/cli.js';

/**
 * Etapa 1 do pipeline: coleta estabelecimentos de um segmento numa cidade
 * via Overpass API e grava (ou atualiza) cada um em SQLite com status
 * "coletado".
 */
export async function coletar(segmentoInput, cidadeInput) {
  if (!segmentoInput || !cidadeInput) {
    throw new Error('Uso: node src/collect.js "<segmento>" "<cidade>"');
  }

  console.log(`[collect] Buscando "${segmentoInput}" em "${cidadeInput}" via Overpass API...`);
  const leadsBrutos = await buscarLeads(segmentoInput, cidadeInput);
  console.log(`[collect] ${leadsBrutos.length} estabelecimento(s) encontrado(s) no OSM.`);

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
