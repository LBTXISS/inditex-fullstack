import { runtimeConfig } from '../config/runtimeConfig.js';
import {
  contractErrors,
  validateCartRequest,
  validateCartResponse,
  validateProductDetailResponse,
  validateProductListResponse,
} from './contracts.js';
import { ApiError } from './errors.js';
import { normalizeProductList } from './normalizers.js';
import { normalizeProductDetail } from './detailNormalizer.js';

/** @typedef {typeof fetch} FetchImplementation */

/** Frontera HTTP con timeout de cuerpo completo, validación runtime y sin retry de comandos. */
export class ApiClient {
  /**
   * Inyecta transporte y presupuesto para pruebas; conserva el receiver del fetch nativo.
   * @param {{ baseUrl?: string, timeoutMs?: number, fetchImplementation?: FetchImplementation }} [options]
   */
  constructor(options = {}) {
    this.baseUrl = (options.baseUrl || runtimeConfig.apiBaseUrl).replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs || runtimeConfig.apiTimeoutMs;
    // Native browser fetch requires the window receiver, unlike many test doubles.
    this.fetchImplementation = options.fetchImplementation || globalThis.fetch.bind(globalThis);
  }

  /** @returns {Promise<readonly import('./normalizers.js').ProductSummary[]>} Lista normalizada sólo tras validar todas sus entradas. */
  async getProducts() {
    const payload = await this.#request('/product');
    if (!validateProductListResponse(payload)) {
      throw new ApiError('contract', `Invalid product list: ${contractErrors(validateProductListResponse)}`);
    }
    return normalizeProductList(payload);
  }

  /**
   * Codifica IDs opacos y rechaza un detalle cuyo identificador no coincida.
   * @param {string} productId
   */
  async getProductDetail(productId) {
    const payload = await this.#request(`/product/${encodeURIComponent(productId)}`);
    if (!validateProductDetailResponse(payload)) {
      throw new ApiError('contract', `Invalid product detail: ${contractErrors(validateProductDetailResponse)}`);
    }
    const dto = /** @type {import('./detailNormalizer.js').ProductDetailDto} */ (payload);
    if (dto.id !== productId) throw new ApiError('contract', 'Product detail does not match requested ID');
    try {
      return normalizeProductDetail(dto);
    } catch (cause) {
      throw new ApiError('contract', 'Invalid product detail model', { cause });
    }
  }

  /**
   * Valida antes de enviar; devuelve contador confirmado y no cachea ni reintenta el POST.
   * @param {{ id: string, colorCode: number, storageCode: number }} command
   */
  async addToCart(command) {
    if (!validateCartRequest(command)) {
      throw new ApiError('contract', 'Invalid cart command');
    }
    const payload = await this.#request('/cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    });
    if (!validateCartResponse(payload)) {
      throw new ApiError('contract', `Invalid cart response: ${contractErrors(validateCartResponse)}`);
    }
    return payload;
  }

  /**
   * AbortController sigue activo al leer JSON: cabeceras rápidas no excluyen un cuerpo bloqueado.
   * @param {string} path @param {RequestInit} [init]
   */
  async #request(path, init = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImplementation(`${this.baseUrl}${path}`, {
        ...init,
        credentials: 'omit',
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new ApiError('http', 'The product service returned an error', { status: response.status });
      }
      try {
        return await response.json();
      } catch (cause) {
        if (controller.signal.aborted) throw cause;
        throw new ApiError('contract', 'The product service returned invalid JSON', { cause });
      }
    } catch (cause) {
      if (cause instanceof ApiError) throw cause;
      if (controller.signal.aborted) {
        throw new ApiError('timeout', 'The product service took too long to respond', { cause });
      }
      throw new ApiError('network', 'The product service is unavailable', { cause });
    } finally {
      clearTimeout(timeout);
    }
  }
}
