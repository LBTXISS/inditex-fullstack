/**
 * @typedef {object} ProductSummary
 * @property {string} id
 * @property {string} brand
 * @property {string} model
 * @property {number | null} price
 * @property {string} imageUrl
 */

/**
 * Precio ausente/inválido es null, no cero; no añade moneda no declarada.
 * @param {string} rawPrice
 */
function normalizePrice(rawPrice) {
  if (rawPrice.trim() === '') return null;
  const price = Number(rawPrice);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

/**
 * Conserva el ID opaco y crea un modelo inmutable independiente del DTO externo.
 * @param {{ id: string, brand: string, model: string, price: string, imgUrl: string }} dto
 */
export function normalizeProductSummary(dto) {
  return Object.freeze({
    id: dto.id,
    brand: dto.brand.trim(),
    model: dto.model.trim(),
    price: normalizePrice(dto.price),
    imageUrl: dto.imgUrl,
  });
}

/**
 * Normaliza el payload previamente validado sin permitir mutaciones accidentales.
 * @param {Array<{ id: string, brand: string, model: string, price: string, imgUrl: string }>} payload
 */
export function normalizeProductList(payload) {
  return Object.freeze(payload.map(normalizeProductSummary));
}

/**
 * Comprueba las invariantes del modelo antes de confiar en datos persistidos.
 * @param {unknown} value @returns {value is ProductSummary}
 */
export function isProductSummary(value) {
  if (typeof value !== 'object' || value === null) return false;
  const product = /** @type {Record<string, unknown>} */ (value);
  return typeof product.id === 'string'
    && product.id.trim().length > 0
    && typeof product.brand === 'string'
    && typeof product.model === 'string'
    && (product.price === null || (typeof product.price === 'number' && Number.isFinite(product.price) && product.price >= 0))
    && typeof product.imageUrl === 'string';
}

/**
 * Una sola entrada corrupta invalida la lista completa.
 * @param {unknown} value @returns {value is readonly ProductSummary[]}
 */
export function isProductSummaryList(value) {
  return Array.isArray(value) && value.every(isProductSummary);
}

/**
 * Ignora mayúsculas y diacríticos al buscar sin cambiar los datos mostrados.
 * @param {string} value
 */
function searchable(value) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase().trim();
}

/**
 * Busca la combinación marca/modelo; consulta vacía conserva la lista original.
 * @param {readonly ProductSummary[]} products @param {string} query
 */
export function filterProducts(products, query) {
  const criterion = searchable(query);
  if (criterion === '') return products;
  return products.filter((product) => searchable(`${product.brand} ${product.model}`).includes(criterion));
}
