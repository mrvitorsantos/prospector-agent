const DDI_PADRAO = process.env.WA_DEFAULT_COUNTRY_CODE || '55';

/**
 * Gera o link wa.me a partir de um telefone bruto vindo do OSM.
 *
 * IMPORTANTE (ver PRD seção 5 — decisões de risco e compliance): o telefone
 * cadastrado no OSM não é garantia de que o número tem WhatsApp. O link é
 * montado por heurística (assume DDI Brasil quando ausente) e pode
 * simplesmente não abrir uma conversa em alguns casos — normal para v0.1.
 */
export function gerarLinkWhatsApp(telefone) {
  if (!telefone) return null;

  const digitos = telefone.replace(/\D/g, '');
  if (!digitos) return null;

  const jaTemDDI = digitos.startsWith(DDI_PADRAO) && digitos.length >= 12;
  const numeroComDDI = jaTemDDI
    ? digitos
    : `${DDI_PADRAO}${digitos.replace(/^0+/, '')}`;

  return `https://wa.me/${numeroComDDI}`;
}
