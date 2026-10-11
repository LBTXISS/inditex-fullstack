/** TTL contractual absoluto: las lecturas no prolongan estos 3600 segundos. */
export const CACHE_TTL_MS = 60 * 60 * 1000;
// v2 prevents restored GET models from retaining the old, inverted display labels.
export const CACHE_NAMESPACE = 'itx:api-cache:v2';
export const CART_STORAGE_KEY = 'itx:cart:v1';

const DEFAULT_API_BASE_URL = 'https://itx-frontend-test.onrender.com/api';
const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Exige HTTPS excepto loopback de desarrollo y normaliza barras finales para claves estables.
 * @param {string | undefined} rawUrl
 */
function parseApiBaseUrl(rawUrl) {
  const value = rawUrl || DEFAULT_API_BASE_URL;
  const url = new URL(value);
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !localHttp) {
    throw new Error('VITE_API_BASE_URL must use HTTPS, except for localhost development');
  }
  return value.replace(/\/+$/, '');
}

/**
 * Rechaza timeout fraccionario, no positivo o superior a 60 segundos.
 * @param {string | undefined} rawTimeout
 */
function parseTimeout(rawTimeout) {
  if (rawTimeout === undefined || rawTimeout === '') return DEFAULT_TIMEOUT_MS;
  const timeout = Number(rawTimeout);
  if (!Number.isInteger(timeout) || timeout <= 0 || timeout > 60_000) {
    throw new Error('VITE_API_TIMEOUT_MS must be an integer between 1 and 60000');
  }
  return timeout;
}

export const runtimeConfig = Object.freeze({
  apiBaseUrl: parseApiBaseUrl(import.meta.env.VITE_API_BASE_URL),
  apiTimeoutMs: parseTimeout(import.meta.env.VITE_API_TIMEOUT_MS),
});
