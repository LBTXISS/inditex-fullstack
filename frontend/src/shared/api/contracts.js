import Ajv2020 from 'ajv/dist/2020.js';
import productListSchema from '../../../contracts/schemas/product-list-response.schema.json';
import productDetailSchema from '../../../contracts/schemas/product-detail-response.schema.json';
import cartResponseSchema from '../../../contracts/schemas/cart-response.schema.json';
import cartRequestSchema from '../../../contracts/schemas/cart-request.schema.json';
import cacheEntrySchema from '../../../contracts/schemas/cache-entry.schema.json';
import cartStorageSchema from '../../../contracts/schemas/cart-storage.schema.json';

const ajv = new Ajv2020({ allErrors: true, strict: true });

/** @typedef {{ id: string, brand: string, model: string, price: string, imgUrl: string }} ProductDto */
export const validateProductListResponse = ajv.compile(/** @type {import('ajv').JSONSchemaType<ProductDto[]>} */ (productListSchema));
export const validateProductDetailResponse = ajv.compile(productDetailSchema);
export const validateCartResponse = ajv.compile(/** @type {import('ajv').JSONSchemaType<{ count: number }>} */ (cartResponseSchema));
export const validateCartRequest = ajv.compile(cartRequestSchema);
export const validateCacheEntry = ajv.compile(cacheEntrySchema);
export const validateCartStorage = ajv.compile(/** @type {import('ajv').JSONSchemaType<{ schemaVersion: number, count: number, updatedAt: number }>} */ (cartStorageSchema));

/**
 * Expone el diagnóstico del esquema sin convertir ni aceptar implícitamente un payload inválido.
 * @param {import('ajv').ValidateFunction} validator
 */
export function contractErrors(validator) {
  return ajv.errorsText(validator.errors, { separator: '; ' });
}
