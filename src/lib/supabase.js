import { createClient } from '@supabase/supabase-js';

let clientInstance = null;

/**
 * Cliente Supabase (singleton) usado pela sincronização (src/syncSupabase.js).
 * Usa a service_role key (não a anon/publishable) porque é um script
 * server-side de confiança total, sem usuário final na ponta — evita ter que
 * desenhar policy de RLS só pra um script que já roda localmente com acesso
 * total ao próprio SQLite. Gere a key em Project Settings > API > service_role
 * no painel do Supabase (NUNCA a mesma coisa que a anon/publishable key, e
 * nunca deve ser exposta num client de navegador).
 */
export function getSupabaseClient() {
  if (clientInstance) return clientInstance;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY não configuradas em .env (ver README, seção "Sincronização com Supabase").'
    );
  }

  clientInstance = createClient(url, key, { auth: { persistSession: false } });
  return clientInstance;
}
