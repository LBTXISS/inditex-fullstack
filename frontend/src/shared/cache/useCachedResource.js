import { useCallback, useEffect, useState } from 'react';
import { CACHE_TTL_MS } from '../config/runtimeConfig.js';

/**
 * Retira datos vencidos antes de revalidar: nunca sirve stale después de una hora.
 * @template T
 * @param {() => Promise<T>} load
 * @param {() => number | undefined} [expiresAt]
 * @returns {{ status: 'loading' | 'success' | 'error', data: T | null, error: unknown, retry: () => void }}
 */
export function useCachedResource(load, expiresAt) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState(/** @type {{ status: 'loading' | 'success' | 'error', data: T | null, error: unknown }} */ ({
    status: 'loading', data: null, error: null,
  }));

  useEffect(() => {
    let active = true;
    let pending = false;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer;
    /** Coalesce eventos y descarta completados tras desmontaje o cambio de recurso. */
    const refresh = () => {
      if (pending || !active) return;
      pending = true;
      clearTimeout(timer);
      load().then(
        (data) => {
          pending = false;
          if (!active) return;
          setState({ status: 'success', data, error: null });
          const expiry = expiresAt?.();
          if (expiry !== undefined) {
            // Al vencer se oculta el dato antes del GET; servir stale violaría el TTL estricto.
            timer = setTimeout(() => {
              if (!active) return;
              setState({ status: 'loading', data: null, error: null });
              refresh();
            }, Math.max(0, expiry - Date.now()));
          }
        },
        (error) => {
          pending = false;
          if (active) setState({ status: 'error', data: null, error });
        },
      );
    };
    /** Revisa vencimiento y retroceso de reloj al recuperar una pestaña suspendida. */
    const resume = () => {
      if (document.visibilityState === 'hidden' || pending || !active) return;
      const expiry = expiresAt?.();
      const now = Date.now();
      if (expiry !== undefined && (now >= expiry || now < expiry - CACHE_TTL_MS)) {
        setState({ status: 'loading', data: null, error: null });
        refresh();
      }
    };
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    refresh();
    return () => {
      // Aislar este consumidor sin cancelar una carga del manager compartida por otros.
      active = false;
      clearTimeout(timer);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [load, expiresAt, attempt]);

  /** Reintento explícito de lectura, nunca de un comando de carrito no idempotente. */
  const retry = useCallback(() => {
    setState({ status: 'loading', data: null, error: null });
    setAttempt((value) => value + 1);
  }, []);
  return { ...state, retry };
}
