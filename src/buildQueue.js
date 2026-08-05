import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { getLeadsQualificadosOrdenados } from './db.js';
import { paraCsv } from './lib/csv.js';
import { normalizarCampo, slug } from './lib/strings.js';
import { isMain } from './lib/cli.js';

const COLUNAS_CSV = [
  'id',
  'nome',
  'segmento',
  'cidade',
  'endereco',
  'telefone',
  'wa_link',
  'site',
  'score',
  'mensagem',
  'status',
];

/**
 * Etapa 3 do pipeline: lê leads qualificados de um segmento+cidade, ordena
 * por score decrescente e exporta a fila final em CSV e JSON, pronta para
 * abordagem manual via WhatsApp (clicar no wa_link de cada lead).
 */
export async function montarFila(segmentoInput, cidadeInput) {
  if (!segmentoInput || !cidadeInput) {
    throw new Error('Uso: node src/buildQueue.js "<segmento>" "<cidade>"');
  }

  const segmento = normalizarCampo(segmentoInput);
  const cidade = normalizarCampo(cidadeInput);

  const leads = getLeadsQualificadosOrdenados(segmento, cidade);
  console.log(`[buildQueue] ${leads.length} lead(s) qualificado(s) para "${segmento}" em "${cidade}".`);

  const caminhoBase = `data/fila_${slug(segmento)}_${slug(cidade)}`;
  mkdirSync(dirname(caminhoBase), { recursive: true });

  writeFileSync(`${caminhoBase}.json`, JSON.stringify(leads, null, 2), 'utf-8');
  writeFileSync(`${caminhoBase}.csv`, paraCsv(leads, COLUNAS_CSV), 'utf-8');

  console.log(`[buildQueue] Fila exportada em ${caminhoBase}.csv e ${caminhoBase}.json`);
  return { total: leads.length, caminhoBase };
}

if (isMain(import.meta.url)) {
  const [segmento, cidade] = process.argv.slice(2);
  montarFila(segmento, cidade).catch((erro) => {
    console.error(`[buildQueue] Erro: ${erro.message}`);
    process.exitCode = 1;
  });
}
