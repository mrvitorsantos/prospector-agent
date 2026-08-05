import { pathToFileURL } from 'node:url';

/**
 * Detecta se o módulo atual foi executado diretamente via CLI
 * (`node src/algo.js`) em vez de importado por outro módulo (ex: index.js).
 * Usa pathToFileURL para funcionar de forma confiável também no Windows.
 */
export function isMain(moduleUrl) {
  if (!process.argv[1]) return false;
  return moduleUrl === pathToFileURL(process.argv[1]).href;
}
