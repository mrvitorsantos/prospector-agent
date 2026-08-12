import { chaveComparacao } from './strings.js';

const CATEGORIA_PADRAO = 'Outros';

/**
 * Agrupa os segmentos de src/sources/segments.js em categorias mais amplas,
 * pra facilitar navegação/filtro na tabela `leads` do Supabase (ex: ver
 * todo mundo de "Alimentação" numa cidade, independente do segmento exato).
 * Mesma convenção de chave que SEGMENT_TAGS (sem acento, minúscula) — se
 * adicionar um segmento novo em segments.js, adicione a categoria dele aqui
 * também (segmento sem categoria mapeada cai em CATEGORIA_PADRAO, não quebra
 * a sincronização).
 */
export const SEGMENTO_CATEGORIA = {
  barbearia: 'Beleza & Estética',
  barbearias: 'Beleza & Estética',
  'salao de beleza': 'Beleza & Estética',
  'clinica odontologica': 'Saúde',
  dentista: 'Saúde',
  'clinica medica': 'Saúde',
  'clinica veterinaria': 'Saúde',
  farmacia: 'Saúde',
  otica: 'Saúde',
  academia: 'Bem-estar & Fitness',
  restaurante: 'Alimentação',
  lanchonete: 'Alimentação',
  pizzaria: 'Alimentação',
  pizzarias: 'Alimentação',
  mercado: 'Alimentação',
  supermercado: 'Alimentação',
  padaria: 'Alimentação',
  'oficina mecanica': 'Serviços Automotivos',
  'auto pecas': 'Serviços Automotivos',
  imobiliaria: 'Serviços Profissionais',
  contabilidade: 'Serviços Profissionais',
  'pet shop': 'Comércio & Varejo',
  petshop: 'Comércio & Varejo',
  'loja de roupas': 'Comércio & Varejo',
  papelaria: 'Comércio & Varejo',
  floricultura: 'Comércio & Varejo',
  'material de construcao': 'Comércio & Varejo',
  lavanderia: 'Serviços Domésticos',
};

/**
 * Resolve a categoria de um segmento, com o mesmo fallback de correspondência
 * parcial de resolverTagsOSM (ver segments.js) — segmento não mapeado (novo,
 * ou busca por texto livre do Google Places) cai em CATEGORIA_PADRAO em vez
 * de travar a sincronização.
 */
export function resolverCategoria(segmento) {
  const chave = chaveComparacao(segmento);

  if (SEGMENTO_CATEGORIA[chave]) return SEGMENTO_CATEGORIA[chave];

  const correspondencia = Object.keys(SEGMENTO_CATEGORIA).find(
    (candidata) => chave.includes(candidata) || candidata.includes(chave)
  );

  return correspondencia ? SEGMENTO_CATEGORIA[correspondencia] : CATEGORIA_PADRAO;
}
