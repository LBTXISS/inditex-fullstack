import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

/** Caso cubierto: rejects unsafe timeout %s. */
it.each(['0', '-1', '1.5', '60001', 'invalid'])('rejects unsafe timeout %s', async (timeout) => {
  // Given (Dado): entorno aislado para comprobar arranque seguro.
  vi.stubEnv('VITE_API_TIMEOUT_MS', timeout);
  vi.resetModules();
  // When (Cuando): invocar la operación que se verifica en la aserción.
  // Then (Entonces): verificar el contrato observable y los efectos permitidos.
  await expect(import('./runtimeConfig.js')).rejects.toThrow('VITE_API_TIMEOUT_MS');
});

/** Caso cubierto: rejects unsafe API URL %s. */
it.each(['http://example.com/api', 'ftp://localhost/api'])('rejects unsafe API URL %s', async (url) => {
  // Given (Dado): entorno aislado para comprobar arranque seguro.
  vi.stubEnv('VITE_API_BASE_URL', url);
  vi.resetModules();
  // When (Cuando): invocar la operación que se verifica en la aserción.
  // Then (Entonces): verificar el contrato observable y los efectos permitidos.
  await expect(import('./runtimeConfig.js')).rejects.toThrow('VITE_API_BASE_URL');
});

/** Caso cubierto: accepts explicit timeout and localhost development without trailing slash. */
it('accepts explicit timeout and localhost development without trailing slash', async () => {
  // Given (Dado): entorno aislado para comprobar arranque seguro.
  vi.stubEnv('VITE_API_TIMEOUT_MS', '60000');
  vi.stubEnv('VITE_API_BASE_URL', 'http://127.0.0.1:3001/api/');
  vi.resetModules();
  const { runtimeConfig } = await import('./runtimeConfig.js');
  // When (Cuando): invocar la operación que se verifica en la aserción.
  // Then (Entonces): verificar el contrato observable y los efectos permitidos.
  expect(runtimeConfig.apiTimeoutMs).toBe(60000);
  expect(runtimeConfig.apiBaseUrl).toBe('http://127.0.0.1:3001/api');
});
