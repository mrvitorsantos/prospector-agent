/**
 * Cidades do escopo de automação diária — fonte única compartilhada pelas
 * duas fontes de dados (Overpass usa `relationId`, Google Places usa
 * `lat`/`lon`/`raioMetros`). Antes cada fonte tinha sua própria tabela
 * desconectada (achado de code review) — cidade nova adicionada num arquivo
 * e esquecida no outro perdia proteção contra homônimo silenciosamente.
 * Adicione a cidade nova aqui uma vez só (chave sem acento, minúscula).
 *
 * `relationId`: ID de relação administrativa do OSM (admin_level 8 —
 * município), resolvido via Nominatim (nominatim.openstreetmap.org/lookup).
 * `lat`/`lon`/`raioMetros`: centro e raio (metros) do bounding box
 * administrativo da cidade, mesma fonte (Nominatim/OSM) — raio calculado
 * como a distância do centro até o canto mais distante do bounding box.
 */
export const CIDADES = {
  aruja: { relationId: 297934, lat: -23.396266, lon: -46.3175449, raioMetros: 10957 },
  guarulhos: { relationId: 298165, lat: -23.4675941, lon: -46.5277704, raioMetros: 29135 },
  'mogi das cruzes': { relationId: 298415, lat: -23.5234284, lon: -46.1926671, raioMetros: 30507 },
  'santa isabel': { relationId: 298250, lat: -23.3194222, lon: -46.2271903, raioMetros: 19908 },
};
