function escaparCampo(valor) {
  if (valor === null || valor === undefined) return '';
  const texto = String(valor);
  if (/[",\n;]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

/**
 * Serializa um array de objetos em CSV simples (sem dependências externas).
 * Suficiente pro volume de linhas esperado em v0.1 (dezenas/centenas de leads).
 */
export function paraCsv(linhas, colunas) {
  const cabecalho = colunas.join(',');
  const corpo = linhas
    .map((linha) => colunas.map((coluna) => escaparCampo(linha[coluna])).join(','))
    .join('\n');
  return corpo.length ? `${cabecalho}\n${corpo}\n` : `${cabecalho}\n`;
}
