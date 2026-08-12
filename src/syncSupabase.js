import { getLeadsQualificadosOrdenados } from './db.js';
import { getSupabaseClient } from './lib/supabase.js';
import { normalizarCampo } from './lib/strings.js';
import { resolverCategoria } from './lib/categorias.js';
import { isMain } from './lib/cli.js';

const COLUNAS_SUPABASE = [
  'id',
  'segmento',
  'cidade',
  'nome',
  'endereco',
  'telefone',
  'site',
  'wa_link',
  'score',
  'mensagem',
  'status',
];

/**
 * Mantém só as colunas que existem na tabela `leads` do Supabase (descarta
 * criado_em/atualizado_em locais — o Postgres tem os seus próprios) e
 * adiciona `categoria`, que não existe no SQLite local — é derivada do
 * segmento só na hora de sincronizar (ver src/lib/categorias.js), pra
 * facilitar navegação/filtro no Supabase (ex: "todo mundo de Alimentação
 * em Arujá").
 */
function paraLinhaSupabase(lead) {
  const linha = {};
  for (const coluna of COLUNAS_SUPABASE) linha[coluna] = lead[coluna];
  linha.categoria = resolverCategoria(lead.segmento);
  return linha;
}

/**
 * Etapa 4 (opcional) do pipeline: espelha os leads qualificados de um
 * segmento+cidade do SQLite local pra tabela `leads` no Supabase, via
 * upsert por `id` — repetir a sincronização é seguro e idempotente.
 *
 * Só roda se SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY estiverem configuradas
 * (ver README, seção "Sincronização com Supabase") — sem isso, index.js pula
 * essa etapa em vez de quebrar o pipeline pra quem não configurou Supabase.
 */
export async function sincronizar(segmentoInput, cidadeInput) {
  if (!segmentoInput || !cidadeInput) {
    throw new Error('Uso: node src/syncSupabase.js "<segmento>" "<cidade>"');
  }

  const segmento = normalizarCampo(segmentoInput);
  const cidade = normalizarCampo(cidadeInput);

  const leads = getLeadsQualificadosOrdenados(segmento, cidade);
  console.log(`[syncSupabase] ${leads.length} lead(s) qualificado(s) para "${segmento}" em "${cidade}" a sincronizar.`);

  if (leads.length === 0) {
    return { total: 0 };
  }

  const supabase = getSupabaseClient();
  const linhas = leads.map(paraLinhaSupabase);

  const { error } = await supabase.from('leads').upsert(linhas, { onConflict: 'id' });
  if (error) {
    throw new Error(`Falha ao sincronizar com Supabase: ${error.message}`);
  }

  console.log(`[syncSupabase] ${linhas.length} lead(s) sincronizado(s) com Supabase.`);
  return { total: linhas.length };
}

if (isMain(import.meta.url)) {
  const [segmento, cidade] = process.argv.slice(2);
  sincronizar(segmento, cidade).catch((erro) => {
    console.error(`[syncSupabase] Erro: ${erro.message}`);
    process.exitCode = 1;
  });
}
