import { isProductSummary, normalizeProductSummary } from './normalizers.js';

/** @typedef {{ code: number, name: string }} ProductOption */
/** @typedef {{ label: string, value: string }} Specification */
/** @typedef {import('./normalizers.js').ProductSummary & { specifications: readonly Specification[], colors: readonly ProductOption[], storages: readonly ProductOption[] }} ProductDetail */
/** @typedef {import('./contracts.js').ProductDto & Record<string, unknown> & { options: { colors: ProductOption[], storages: ProductOption[] } }} ProductDetailDto */

/**
 * Convierte sólo texto, números finitos y arrays; nunca renderiza objetos externos.
 * @param {unknown} value @returns {string}
 */
function text(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(' / ');
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

/**
 * Rechaza códigos duplicados/no finitos y nombres vacíos; código cero sí es válido.
 * @param {unknown} value @returns {value is readonly ProductOption[]}
 */
function isOptions(value) {
  if (!Array.isArray(value)) return false;
  const codes = new Set();
  return value.every((option) => {
    if (typeof option !== 'object' || option === null
      || typeof option.code !== 'number' || !Number.isFinite(option.code)
      || typeof option.name !== 'string' || option.name.trim() === '' || codes.has(option.code)) return false;
    codes.add(option.code);
    return true;
  });
}

/**
 * Corrige una inversión sólo si ambas unidades la prueban; no adivina valores ausentes.
 * @param {ProductDetailDto} dto
 */
function displayFields(dto) {
  const resolution = text(dto.displayResolution);
  const size = text(dto.displaySize);
  /** @param {string} value */
  const pixels = (value) => /\b\d+\s*[x×]\s*\d+\b/i.test(value);
  /** @param {string} value */
  const physicalSize = (value) => /\b(?:inches|inch|pulgadas|cm|mm)\b/i.test(value);
  // Only swap when both units prove the provider inversion; never guess missing data.
  if (physicalSize(resolution) && pixels(size)) return { resolution: size, size: resolution };
  return {
    resolution: physicalSize(resolution) ? '' : resolution,
    size: pixels(size) ? '' : size,
  };
}

/**
 * Modelo inmutable con aliases observados y diez especificaciones, sin inventar datos.
 * @param {ProductDetailDto} dto @returns {ProductDetail}
 */
export function normalizeProductDetail(dto) {
  if (!isOptions(dto.options.colors) || !isOptions(dto.options.storages)) {
    throw new TypeError('Invalid or ambiguous product options');
  }
  const display = displayFields(dto);
  const fields = [
    ['CPU', dto.cpu], ['RAM', dto.ram], ['Sistema operativo', dto.os],
    ['Resolución', display.resolution], ['Tamaño de pantalla', display.size],
    ['Batería', dto.battery], ['Cámara principal', dto.primaryCamera],
    ['Cámara secundaria', text(dto.secondaryCamera) || dto.secondaryCmera],
    ['Dimensiones', text(dto.dimensions) || dto.dimentions], ['Peso', dto.weight],
  ];
  return Object.freeze({
    ...normalizeProductSummary(dto),
    specifications: Object.freeze(fields.map(([label, value]) => Object.freeze({ label: String(label), value: text(value) || 'No disponible' }))),
    colors: Object.freeze(dto.options.colors.map((option) => Object.freeze({ code: option.code, name: option.name.trim() }))),
    storages: Object.freeze(dto.options.storages.map((option) => Object.freeze({ code: option.code, name: option.name.trim() }))),
  });
}

/**
 * Valida modelos restaurados antes de reutilizar opciones o especificaciones persistidas.
 * @param {unknown} value @returns {value is ProductDetail}
 */
export function isProductDetail(value) {
  if (!isProductSummary(value)) return false;
  const detail = /** @type {Record<string, unknown>} */ (value);
  return isOptions(detail.colors) && isOptions(detail.storages)
    && Array.isArray(detail.specifications) && detail.specifications.length === 10
    && detail.specifications.every((item) => typeof item === 'object' && item !== null
      && typeof item.label === 'string' && item.label.trim() !== '' && typeof item.value === 'string');
}
