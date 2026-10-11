import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useCachedResource } from './useCachedResource.js';
import { CACHE_TTL_MS } from '../config/runtimeConfig.js';

afterEach(() => { cleanup(); vi.useRealTimers(); });

/** Caso cubierto: hides expired data and revalidates while the component remains mounted. */
it('hides expired data and revalidates while the component remains mounted', async () => {
  // Given (Dado): reloj virtual y promesas controladas para el ciclo de vida.
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
  const load = vi.fn().mockResolvedValueOnce('first').mockRejectedValueOnce(new Error('offline'));
  const expiresAt = () => 1_000 + CACHE_TTL_MS;
  // When (Cuando): activar el comportamiento o la interacción que se evalúa.
  const { result } = renderHook(() => useCachedResource(load, expiresAt));
  await act(async () => { await Promise.resolve(); });
  // Then (Entonces): verificar el contrato observable y los efectos permitidos.
  expect(result.current.data).toBe('first');
  await act(async () => { await vi.advanceTimersByTimeAsync(CACHE_TTL_MS - 1); });
  expect(load).toHaveBeenCalledOnce();
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(result.current.status).toBe('error');
  expect(result.current.data).toBeNull();
  expect(load).toHaveBeenCalledTimes(2);
});

/** Caso cubierto: revalidates on resume after suspension, coalesces events and cleans listeners. */
it('revalidates on resume after suspension, coalesces events and cleans listeners', async () => {
  // Given (Dado): reloj virtual y promesas controladas para el ciclo de vida.
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  /** @type {(value: string) => void} */
  let resolve = () => {};
  const load = vi.fn().mockResolvedValueOnce('first').mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  const expiresAt = () => 1000 + CACHE_TTL_MS;
  // When (Cuando): activar el comportamiento o la interacción que se evalúa.
  const { result, unmount } = renderHook(() => useCachedResource(load, expiresAt));
  await act(async () => { await Promise.resolve(); });
  await act(async () => { window.dispatchEvent(new Event('focus')); });
  // Then (Entonces): verificar el contrato observable y los efectos permitidos.
  expect(load).toHaveBeenCalledOnce();
  vi.setSystemTime(1000 + CACHE_TTL_MS);
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(load).toHaveBeenCalledTimes(2);
  expect(result.current.data).toBeNull();
  expect(result.current.status).toBe('loading');
  unmount();
  await act(async () => { resolve('second'); window.dispatchEvent(new Event('focus')); });
  expect(load).toHaveBeenCalledTimes(2);
});

/** Caso cubierto: invalidates on focus if the wall clock moves before storedAt. */
it('invalidates on focus if the wall clock moves before storedAt', async () => {
  // Given (Dado): reloj virtual y promesas controladas para el ciclo de vida.
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  const load = vi.fn().mockResolvedValueOnce('first').mockRejectedValueOnce(new Error('offline'));
  const expiresAt = () => 1000 + CACHE_TTL_MS;
  // When (Cuando): activar el comportamiento o la interacción que se evalúa.
  const { result } = renderHook(() => useCachedResource(load, expiresAt));
  await act(async () => { await Promise.resolve(); });
  vi.setSystemTime(999);
  await act(async () => { window.dispatchEvent(new Event('focus')); });
  // Then (Entonces): verificar el contrato observable y los efectos permitidos.
  expect(load).toHaveBeenCalledTimes(2);
  expect(result.current.status).toBe('error');
  expect(result.current.data).toBeNull();
});
