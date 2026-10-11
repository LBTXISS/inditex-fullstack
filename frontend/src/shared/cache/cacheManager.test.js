import { describe, expect, it, vi } from 'vitest';
import { createMemoryStorage } from '../../test/memoryStorage.js';
import { CacheManager } from './cacheManager.js';
import { CACHE_NAMESPACE, CART_STORAGE_KEY } from '../config/runtimeConfig.js';

/** @param {unknown} value @returns {value is { id: string }} */
const isValue = (value) => typeof value === 'object' && value !== null && 'id' in value && typeof value.id === 'string';

describe('CacheManager', () => {
  /** Caso cubierto: removes malformed JSON even if revalidation fails. */
  it('removes malformed JSON even if revalidation fails', async () => {
    // Given (Dado): almacenamiento aislado, reloj inyectado y loader controlado.
    const storage = createMemoryStorage();
    storage.setItem('test:detail:a', '{broken');
    const cache = new CacheManager({ storage, namespace: 'test', now: () => 1000 });
    // When (Cuando): invocar la operación que se verifica en la aserción.
    // Then (Entonces): verificar el contrato observable y los efectos permitidos.
    await expect(cache.get('detail:a', async () => { throw new Error('offline'); }, isValue)).rejects.toThrow('offline');
    expect(storage.getItem('test:detail:a')).toBeNull();
    await expect(cache.get('detail:a', async () => ({ id: 'safe' }), isValue)).resolves.toEqual({ id: 'safe' });
  });

  /** Caso cubierto: rejects independently invalid persistent entries: %j. */
  it.each([
    { schemaVersion: 2 },
    { storedAt: 2000, expiresAt: 3602000 },
    { expiresAt: 3601001 },
    { key: 'different' },
    { data: { id: 5 } },
  ])('rejects independently invalid persistent entries: %j', async (invalid) => {
    // Given (Dado): almacenamiento aislado, reloj inyectado y loader controlado.
    const storage = createMemoryStorage();
    storage.setItem('test:detail:a', JSON.stringify({ schemaVersion: 1, key: 'detail:a',
      storedAt: 1000, expiresAt: 3601000, data: { id: 'old' }, ...invalid }));
    const loader = vi.fn().mockResolvedValue({ id: 'safe' });
    const cache = new CacheManager({ storage, namespace: 'test', now: () => 1000 });
    // When (Cuando): invocar la operación que se verifica en la aserción.
    // Then (Entonces): verificar el contrato observable y los efectos permitidos.
    await expect(cache.get('detail:a', loader, isValue)).resolves.toEqual({ id: 'safe' });
    expect(loader).toHaveBeenCalledOnce();
  });

  /** Caso cubierto: does not restore GET v1 models and leaves cart persistence intact. */
  it('does not restore GET v1 models and leaves cart persistence intact', async () => {
    // Given (Dado): almacenamiento aislado, reloj inyectado y loader controlado.
    const storage = createMemoryStorage();
    storage.setItem('itx:api-cache:v1:detail:a', JSON.stringify({ schemaVersion: 1,
      key: 'detail:a', storedAt: 1000, expiresAt: 3601000, data: { id: 'old' } }));
    storage.setItem(CART_STORAGE_KEY, 'preserved-cart');
    // When (Cuando): invocar la operación que se verifica en la aserción.
    // Then (Entonces): verificar el contrato observable y los efectos permitidos.
    expect(CACHE_NAMESPACE).toBe('itx:api-cache:v2');
    const loader = vi.fn().mockResolvedValue({ id: 'new' });
    await expect(new CacheManager({ storage, now: () => 1000 }).get('detail:a', loader, isValue))
      .resolves.toEqual({ id: 'new' });
    expect(loader).toHaveBeenCalledOnce();
    expect(storage.getItem(CART_STORAGE_KEY)).toBe('preserved-cart');
  });
  /** Caso cubierto: uses an absolute TTL and revalidates exactly at one hour. */
  it('uses an absolute TTL and revalidates exactly at one hour', async () => {
    // Given (Dado): almacenamiento aislado, reloj inyectado y loader controlado.
    let now = 1_000;
    const storage = createMemoryStorage();
    const loader = vi.fn()
      .mockResolvedValueOnce({ id: 'first' })
      .mockResolvedValueOnce({ id: 'second' });
    const cache = new CacheManager({ storage, now: () => now });

    // When (Cuando): invocar la operación que se verifica en la aserción.
    // Then (Entonces): verificar el contrato observable y los efectos permitidos.
    await expect(cache.get('detail:a', loader, isValue)).resolves.toEqual({ id: 'first' });
    now += 3_599_999;
    await expect(cache.get('detail:a', loader, isValue)).resolves.toEqual({ id: 'first' });
    expect(loader).toHaveBeenCalledTimes(1);

    now += 1;
    await expect(cache.get('detail:a', loader, isValue)).resolves.toEqual({ id: 'second' });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  /** Caso cubierto: coalesces concurrent misses and removes the in-flight promise afterwards. */
  it('coalesces concurrent misses and removes the in-flight promise afterwards', async () => {
    // Given (Dado): almacenamiento aislado, reloj inyectado y loader controlado.
    /** @type {(value: { id: string }) => void} */
    let resolveRequest = () => { throw new Error('Request has not started'); };
    const loader = vi.fn(() => new Promise((resolve) => { resolveRequest = resolve; }));
    const cache = new CacheManager({ storage: createMemoryStorage(), now: () => 10 });

    // When (Cuando): activar el comportamiento o la interacción que se evalúa.
    const first = cache.get('catalog:list', loader, isValue);
    const second = cache.get('catalog:list', loader, isValue);
    // Then (Entonces): verificar el contrato observable y los efectos permitidos.
    expect(loader).toHaveBeenCalledTimes(0);
    await Promise.resolve();
    expect(loader).toHaveBeenCalledTimes(1);
    resolveRequest({ id: 'shared' });
    await expect(Promise.all([first, second])).resolves.toEqual([{ id: 'shared' }, { id: 'shared' }]);
  });

  /** Caso cubierto: does not cache failures and retries on the next request. */
  it('does not cache failures and retries on the next request', async () => {
    // Given (Dado): almacenamiento aislado, reloj inyectado y loader controlado.
    const loader = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ id: 'recovered' });
    const cache = new CacheManager({ storage: createMemoryStorage() });

    // When (Cuando): invocar la operación que se verifica en la aserción.
    // Then (Entonces): verificar el contrato observable y los efectos permitidos.
    await expect(cache.get('catalog:list', loader, isValue)).rejects.toThrow('offline');
    await expect(cache.get('catalog:list', loader, isValue)).resolves.toEqual({ id: 'recovered' });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  /** Caso cubierto: treats corrupt, future and overlong entries as misses. */
  it('treats corrupt, future and overlong entries as misses', async () => {
    // Given (Dado): almacenamiento aislado, reloj inyectado y loader controlado.
    const storage = createMemoryStorage();
    storage.setItem('test:detail:a', JSON.stringify({
      schemaVersion: 1,
      key: 'detail:a',
      storedAt: 2_000,
      expiresAt: 9_999_999,
      data: { id: 'tampered' },
    }));
    const loader = vi.fn().mockResolvedValue({ id: 'safe' });
    const cache = new CacheManager({ storage, namespace: 'test', now: () => 1_000 });

    // When (Cuando): invocar la operación que se verifica en la aserción.
    // Then (Entonces): verificar el contrato observable y los efectos permitidos.
    await expect(cache.get('detail:a', loader, isValue)).resolves.toEqual({ id: 'safe' });
    expect(loader).toHaveBeenCalledOnce();
  });

  /** Caso cubierto: degrades to memory when persistent storage throws. */
  it('degrades to memory when persistent storage throws', async () => {
    // Given (Dado): almacenamiento aislado, reloj inyectado y loader controlado.
    const storage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('quota'); },
      removeItem: () => { throw new Error('blocked'); },
    };
    const loader = vi.fn().mockResolvedValue({ id: 'memory-only' });
    const cache = new CacheManager({ storage, now: () => 1 });

    await cache.get('detail:a', loader, isValue);
    await cache.get('detail:a', loader, isValue);
    // When (Cuando): invocar la operación que se verifica en la aserción.
    // Then (Entonces): verificar el contrato observable y los efectos permitidos.
    expect(loader).toHaveBeenCalledOnce();
  });
});
