import { coletar } from './collect.js';
import { qualificar } from './qualify.js';
import { montarFila } from './buildQueue.js';
import { isMain } from './lib/cli.js';

/**
 * Orquestra o pipeline completo: collect -> qualify -> buildQueue, em
 * sequência, para um segmento + cidade.
 */
export async function executarPipeline(segmento, cidade) {
  if (!segmento || !cidade) {
    throw new Error(
      'Uso: node src/index.js "<segmento>" "<cidade>"\nExemplo: node src/index.js "barbearia" "Arujá"'
    );
  }

  console.log(`\n=== Prospector Agent — ${segmento} em ${cidade} ===\n`);

  await coletar(segmento, cidade);
  await qualificar(segmento, cidade);
  const resultado = await montarFila(segmento, cidade);

  console.log('\n=== Pipeline concluído ===\n');
  return resultado;
}

if (isMain(import.meta.url)) {
  const [segmento, cidade] = process.argv.slice(2);
  executarPipeline(segmento, cidade).catch((erro) => {
    console.error(`[index] Erro no pipeline: ${erro.message}`);
    process.exitCode = 1;
  });
}
