import { describe, expect, it, vi } from 'vitest';
import { CART_STORAGE_KEY } from '../../shared/config/runtimeConfig.js';
import { createMemoryStorage } from '../../test/memoryStorage.js';
import { CartStore } from './cartStore.js';

describe('CartStore', () => {
  /** Caso cubierto: restores only a valid versioned count. */
  it('restores only a valid versioned count', () => {
    // Given (Dado): contador inicial y comandos controlados sin red real.
    const valid = createMemoryStorage();
    valid.setItem(CART_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, count: 7, updatedAt: 10 }));
    // When (Cuando): invocar la operación que se verifica en la aserción.
    // Then (Entonces): verificar el contrato observable y los efectos permitidos.
    expect(new CartStore({ storage: valid }).getSnapshot().count).toBe(7);

    const corrupt = createMemoryStorage();
    corrupt.setItem(CART_STORAGE_KEY, '{broken');
    expect(new CartStore({ storage: corrupt }).getSnapshot().count).toBe(0);
  });

  /** Caso cubierto: uses the authoritative server count and persists it. */
  it('uses the authoritative server count and persists it', async () => {
    // Given (Dado): contador inicial y comandos controlados sin red real.
    const storage = createMemoryStorage();
    const store = new CartStore({ storage, now: () => 99 });

    // When (Cuando): invocar la operación que se verifica en la aserción.
    // Then (Entonces): verificar el contrato observable y los efectos permitidos.
    await expect(store.enqueue(() => Promise.resolve({ count: 12 }))).resolves.toBe(12);
    expect(store.getSnapshot()).toEqual({ count: 12, sending: false });
    expect(JSON.parse(storage.value(CART_STORAGE_KEY))).toEqual({
      schemaVersion: 1, count: 12, updatedAt: 99,
    });
  });

  /** Caso cubierto: serializes additions and never applies responses out of order. */
  it('serializes additions and never applies responses out of order', async () => {
    // Given (Dado): contador inicial y comandos controlados sin red real.
    /** @type {string[]} */
    const events = [];
    const store = new CartStore({ storage: createMemoryStorage() });
    /** @type {(value: { count: number }) => void} */
    let resolveFirst = () => { throw new Error('Command has not started'); };
    const first = store.enqueue(() => new Promise((resolve) => {
      events.push('first-start');
      resolveFirst = resolve;
    }));
    const secondCommand = vi.fn(async () => {
      events.push('second-start');
      return { count: 8 };
    });
    const second = store.enqueue(secondCommand);
    // When (Cuando): invocar la operación que se verifica en la aserción.
    // Then (Entonces): verificar el contrato observable y los efectos permitidos.
    await vi.waitFor(() => expect(events).toEqual(['first-start']));
    expect(secondCommand).not.toHaveBeenCalled();

    resolveFirst({ count: 7 });
    await expect(first).resolves.toBe(7);
    await expect(second).resolves.toBe(8);
    expect(events).toEqual(['first-start', 'second-start']);
    expect(store.getSnapshot().count).toBe(8);
  });

  /** Caso cubierto: does not change count when the response contract is invalid. */
  it('does not change count when the response contract is invalid', async () => {
    // Given (Dado): contador inicial y comandos controlados sin red real.
    const store = new CartStore({ storage: createMemoryStorage() });
    // When (Cuando): invocar la operación que se verifica en la aserción.
    // Then (Entonces): verificar el contrato observable y los efectos permitidos.
    await expect(store.enqueue(() => Promise.resolve({ count: -1 }))).rejects.toThrow('Invalid cart response');
    expect(store.getSnapshot().count).toBe(0);
  });
});
