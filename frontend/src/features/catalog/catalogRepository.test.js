import { describe, expect, it, vi } from 'vitest';
import { ApiClient } from '../../shared/api/client.js';
import { CacheManager } from '../../shared/cache/cacheManager.js';
import { createMemoryStorage } from '../../test/memoryStorage.js';
import { detailDto } from '../../test/productFixtures.js';
import { createCatalogRepository } from './catalogRepository.js';

describe('Catalog repository detail cache', () => {
  /** Caso cubierto: separates list and IDs, restores persisted detail, and expires at one hour. */
  it('separates list and IDs, restores persisted detail, and expires at one hour', async () => {
    // Given (Dado): respuestas sintéticas y almacenamiento aislado por recurso.
    let now = 1000;
    const storage = createMemoryStorage();
    const fetchImplementation = vi.fn((url) => {
      const id = String(url).split('/').at(-1);
      return Promise.resolve(new Response(JSON.stringify(id === 'product' ? [detailDto] : { ...detailDto, id })));
    });
    const client = new ApiClient({ baseUrl: 'https://example.com/api', fetchImplementation });
    const repository = createCatalogRepository(client, new CacheManager({ storage, now: () => now }));
    await repository.getProducts();
    await repository.getProductDetail('a');
    await repository.getProductDetail('b');
    // When (Cuando): invocar la operación que se verifica en la aserción.
    // Then (Entonces): verificar el contrato observable y los efectos permitidos.
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
    const restored = createCatalogRepository(client, new CacheManager({ storage, now: () => now }));
    now += 3599999;
    expect((await restored.getProductDetail('a')).id).toBe('a');
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
    now += 1;
    await restored.getProductDetail('a');
    expect(fetchImplementation).toHaveBeenCalledTimes(4);
  });

  /** Caso cubierto: rejects mismatched IDs and ambiguous detail without caching them. */
  it('rejects mismatched IDs and ambiguous detail without caching them', async () => {
    // Given (Dado): respuestas sintéticas y almacenamiento aislado por recurso.
    const fetchImplementation = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(detailDto)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...detailDto, options: { ...detailDto.options, colors: [detailDto.options.colors[0], detailDto.options.colors[0]] } })))
      .mockResolvedValueOnce(new Response(JSON.stringify(detailDto)));
    const repository = createCatalogRepository(new ApiClient({ fetchImplementation }), new CacheManager({ storage: null }));
    // When (Cuando): invocar la operación que se verifica en la aserción.
    // Then (Entonces): verificar el contrato observable y los efectos permitidos.
    await expect(repository.getProductDetail('wrong')).rejects.toMatchObject({ kind: 'contract' });
    await expect(repository.getProductDetail(detailDto.id)).rejects.toMatchObject({ kind: 'contract' });
    await expect(repository.getProductDetail(detailDto.id)).resolves.toMatchObject({ id: detailDto.id });
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
  });
});
