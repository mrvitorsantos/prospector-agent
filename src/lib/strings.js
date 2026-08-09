/**
 * Helpers de normalização de texto usados em todo o pipeline (segmento,
 * cidade, nomes de arquivo).
 */

/** Remove acentos (usado só para comparação, ex: "Ó" -> "O"). */
export function semAcentos(texto) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Chave de comparação: sem acentos, minúscula, sem espaços nas pontas e sem
 * espaços internos duplicados (ex: "Mogi  das Cruzes" -> "mogi das cruzes")
 * — evita que um espaçamento irregular perca o match em CIDADES
 * (src/lib/cidades.js) e caia silenciosamente sem desambiguação de homônimo.
 */
export function chaveComparacao(texto) {
  return semAcentos(texto).toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Normaliza um campo para gravar no banco (segmento/cidade). Mantém acentos
 * (ex: "Arujá" continua "arujá") porque isso é só cosmético; some acentos
 * apenas na comparação com o dicionário de segmentos (ver segments.js).
 */
export function normalizarCampo(texto) {
  return texto.trim().toLowerCase();
}

/** Vira um slug seguro pra nome de arquivo (ex: "clínica odontológica" -> "clinica_odontologica"). */
export function slug(texto) {
  return chaveComparacao(texto)
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}
