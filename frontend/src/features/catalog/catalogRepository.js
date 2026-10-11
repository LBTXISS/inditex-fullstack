import { ApiClient } from '../../shared/api/client.js';
import { isProductSummaryList } from '../../shared/api/normalizers.js';
import { CacheManager } from '../../shared/cache/cacheManager.js';
import { isProductDetail } from '../../shared/api/detailNormalizer.js';

/**
 * Separa GET cacheables y POST no cacheables; las claves incluyen origen, operación e ID.
 * @param {ApiClient} [apiClient] @param {CacheManager} [cache]
 */
export function createCatalogRepository(apiClient = new ApiClient(), cache = new CacheManager()) {
  return Object.freeze({
    /** Lee la lista validada desde caché; un miss realiza un único GET compartido. */
    getProducts: () => cache.get(`GET ${apiClient.baseUrl}/product`, () => apiClient.getProducts(), isProductSummaryList),
    /** @returns {number | undefined} Vencimiento absoluto del catálogo cargado. */
    expiresAt: () => cache.expiresAt(`GET ${apiClient.baseUrl}/product`),
    /**
     * Mantiene un recurso independiente por ID y exige coherencia al restaurarlo.
     * @param {string} id Identificador opaco externo, sin interpretación numérica.
     */
    getProductDetail: (id) => cache.get(
      `GET ${apiClient.baseUrl}/product/${encodeURIComponent(id)}`,
      () => apiClient.getProductDetail(id),
      /** @returns {data is import('../../shared/api/detailNormalizer.js').ProductDetail} */
      (data) => isProductDetail(data) && data.id === id,
    ),
    /** @param {string} id Identificador cuyo vencimiento consulta el hook de detalle. */
    detailExpiresAt: (id) => cache.expiresAt(`GET ${apiClient.baseUrl}/product/${encodeURIComponent(id)}`),
    /** @param {{ id: string, colorCode: number, storageCode: number }} command Alta explícita, nunca cacheada ni reintentada automáticamente. */
    addToCart: (command) => apiClient.addToCart(command),
  });
}

export const catalogRepository = createCatalogRepository();
