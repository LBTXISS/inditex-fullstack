import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from './client.js';

const product = { id: 'a_b-c', brand: 'Acer', model: 'Iconia', price: '', imgUrl: 'https://example.com/device.jpg' };
afterEach(() => vi.unstubAllGlobals());

describe('API boundary', () => {
  /** Caso cubierto: preserves the global receiver required by native browser fetch. */
  it('preserves the global receiver required by native browser fetch', async () => {
    // Given (Dado): fetch simulado con respuesta o fallo controlados.
    vi.stubGlobal('fetch', /** @this {typeof globalThis} */ function () {
      // When (Cuando): invocar la operación que se verifica en la aserción.
      // Then (Entonces): verificar el contrato observable y los efectos permitidos.
      expect(this).toBe(globalThis);
      return Promise.resolve(new Response(JSON.stringify([product])));
    });
    await expect(new ApiClient().getProducts()).resolves.toHaveLength(1);
  });
  /** Caso cubierto: rejects an invalid command before making a network request. */
  it('rejects an invalid command before making a network request', async () => {
    // Given (Dado): fetch simulado con respuesta o fallo controlados.
    const fetchImplementation = vi.fn();
    const client = new ApiClient({ fetchImplementation });
    // When (Cuando): invocar la operación que se verifica en la aserción.
    // Then (Entonces): verificar el contrato observable y los efectos permitidos.
    await expect(client.addToCart({ id: ' ', colorCode: NaN, storageCode: 2000 })).rejects.toMatchObject({ kind: 'contract' });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  /** Caso cubierto: validates and normalizes the list with credentials omitted. */
  it('validates and normalizes the list with credentials omitted', async () => {
    // Given (Dado): fetch simulado con respuesta o fallo controlados.
    const fetchImplementation = vi.fn().mockResolvedValue(new Response(JSON.stringify([product])));
    const client = new ApiClient({ fetchImplementation });
    // When (Cuando): invocar la operación que se verifica en la aserción.
    // Then (Entonces): verificar el contrato observable y los efectos permitidos.
    await expect(client.getProducts()).resolves.toMatchObject([{ id: 'a_b-c', price: null }]);
    expect(fetchImplementation).toHaveBeenCalledWith(expect.stringContaining('/product'), expect.objectContaining({ credentials: 'omit' }));
  });

  /** Caso cubierto: rejects an invalid %s response. */
  it.each([
    ['HTTP', () => new Response('private body', { status: 500 }), 'http'],
    ['JSON', () => new Response('{broken'), 'contract'],
    ['schema', () => new Response(JSON.stringify([{ id: 7 }])), 'contract'],
  ])('rejects an invalid %s response', async (_name, response, kind) => {
    // Given (Dado): fetch simulado con respuesta o fallo controlados.
    const client = new ApiClient({ fetchImplementation: vi.fn().mockResolvedValue(response()) });
    // When (Cuando): invocar la operación que se verifica en la aserción.
    // Then (Entonces): verificar el contrato observable y los efectos permitidos.
    await expect(client.getProducts()).rejects.toMatchObject({ kind });
  });

  /** Caso cubierto: aborts a hung request within the configured timeout. */
  it('aborts a hung request within the configured timeout', async () => {
    // Given (Dado): fetch simulado con respuesta o fallo controlados.
    const fetchImplementation = vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const client = new ApiClient({ timeoutMs: 10, fetchImplementation });
    // When (Cuando): invocar la operación que se verifica en la aserción.
    // Then (Entonces): verificar el contrato observable y los efectos permitidos.
    await expect(client.getProducts()).rejects.toMatchObject({ kind: 'timeout' });
  });

  /** Caso cubierto: encodes opaque IDs and sends the exact cart command. */
  it('encodes opaque IDs and sends the exact cart command', async () => {
    // Given (Dado): fetch simulado con respuesta o fallo controlados.
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...product, id: 'a/b?#', options: { colors: [], storages: [] } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ count: 12 })));
    const client = new ApiClient({ fetchImplementation });
    // When (Cuando): activar el comportamiento o la interacción que se evalúa.
    await client.getProductDetail('a/b?#');
    // Then (Entonces): verificar el contrato observable y los efectos permitidos.
    expect(fetchImplementation.mock.calls[0][0]).toContain('/product/a%2Fb%3F%23');
    await client.addToCart({ id: 'a_b-c', colorCode: 1000, storageCode: 2000 });
    expect(fetchImplementation.mock.calls[1][1]).toMatchObject({
      method: 'POST', body: '{"id":"a_b-c","colorCode":1000,"storageCode":2000}',
    });
  });
});
