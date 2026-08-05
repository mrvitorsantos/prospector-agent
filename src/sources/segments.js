import { chaveComparacao } from '../lib/strings.js';

/**
 * Mapeia um segmento de negócio (em português, sem acento) para a(s) tag(s)
 * OSM (OpenStreetMap) correspondentes usadas na query Overpass.
 *
 * Referência de tags: https://wiki.openstreetmap.org/wiki/Map_features
 *
 * Isso NÃO é uma lista exaustiva — é o ponto de partida da v0.1. Se buscar
 * um segmento que não está aqui, adicione uma entrada nova (chave sem
 * acento, minúscula) com a(s) tag(s) "chave=valor" do OSM.
 */
export const SEGMENT_TAGS = {
  'barbearia': ['shop=hairdresser', 'shop=barber'],
  'barbearias': ['shop=hairdresser', 'shop=barber'],
  'salao de beleza': ['shop=beauty', 'shop=hairdresser'],
  'clinica odontologica': ['amenity=dentist'],
  'dentista': ['amenity=dentist'],
  'clinica medica': ['amenity=clinic'],
  'clinica veterinaria': ['amenity=veterinary'],
  'academia': ['leisure=fitness_centre'],
  'pet shop': ['shop=pet'],
  'petshop': ['shop=pet'],
  'restaurante': ['amenity=restaurant'],
  'lanchonete': ['amenity=fast_food'],
  'farmacia': ['amenity=pharmacy'],
  'mercado': ['shop=supermarket', 'shop=convenience'],
  'supermercado': ['shop=supermarket'],
  'padaria': ['shop=bakery'],
  'oficina mecanica': ['shop=car_repair'],
  'auto pecas': ['shop=car_parts'],
  'imobiliaria': ['office=estate_agent'],
  'contabilidade': ['office=accountant'],
  'otica': ['shop=optician'],
  'loja de roupas': ['shop=clothes'],
  'papelaria': ['shop=stationery'],
  'lavanderia': ['shop=laundry'],
  'floricultura': ['shop=florist'],
  'material de construcao': ['shop=hardware', 'shop=doityourself'],
};

/**
 * Resolve as tags OSM para um segmento informado pelo usuário. Tenta
 * correspondência exata primeiro e, se não achar, tenta correspondência
 * parcial (ex.: "barbearia em SP" -> "barbearia").
 *
 * Retorna `null` se nenhum mapeamento for encontrado — quem chamar deve
 * tratar isso avisando o usuário a adicionar uma entrada nova.
 */
export function resolverTagsOSM(segmento) {
  const chave = chaveComparacao(segmento);

  if (SEGMENT_TAGS[chave]) return SEGMENT_TAGS[chave];

  const correspondencia = Object.keys(SEGMENT_TAGS).find(
    (candidata) => chave.includes(candidata) || candidata.includes(chave)
  );

  return correspondencia ? SEGMENT_TAGS[correspondencia] : null;
}
