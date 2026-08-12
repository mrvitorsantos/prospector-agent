import { coletar } from './collect.js';
import { qualificar } from './qualify.js';
import { montarFila } from './buildQueue.js';
import { sincronizar } from './syncSupabase.js';
import { isMain } from './lib/cli.js';

/**
 * Orquestra o pipeline completo: collect -> qualify -> buildQueue ->
 * syncSupabase (se configurado), em sequência, para um segmento + cidade.
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

  // Opcional: só sincroniza se SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY
  // estiverem configuradas (ver README) — sem isso, pula em vez de quebrar
  // o pipeline pra quem não usa Supabase.
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    await sincronizar(segmento, cidade);
  } else {
    console.log('[index] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configuradas — pulando sincronização.');
  }

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
