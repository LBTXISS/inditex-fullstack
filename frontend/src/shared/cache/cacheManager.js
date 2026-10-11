import { validateCacheEntry } from '../api/contracts.js';
import { CACHE_NAMESPACE, CACHE_TTL_MS } from '../config/runtimeConfig.js';
import { browserStorage } from './browserStorage.js';

/** @typedef {{ schemaVersion: 1, key: string, storedAt: number, expiresAt: number, data: unknown }} CacheEntry */
/** @typedef {{ getItem(key: string): string | null, setItem(key: string, value: string): void, removeItem(key: string): void }} StorageLike */

/** Caché GET de TTL absoluto (3600 s), validación runtime y single-flight por clave. */
export class CacheManager {
  /**
   * Permite Storage nulo y reloj inyectado; cada entrada debe respetar el mismo TTL fijo.
   * @param {{ storage?: StorageLike | null, now?: () => number, namespace?: string }} [options]
   */
  constructor(options = {}) {
    this.storage = options.storage === undefined ? browserStorage() : options.storage;
    this.now = options.now || Date.now;
    this.ttlMs = CACHE_TTL_MS;
    this.namespace = options.namespace || CACHE_NAMESPACE;
    /** @type {Map<string, CacheEntry>} */
    this.memory = new Map();
    /** @type {Map<string, Promise<unknown>>} */
    this.inFlight = new Map();
  }

  /**
   * Sirve un dato fresco o comparte una carga validada; jamás almacena errores.
   * @template T
   * @param {string} key
   * @param {() => Promise<T>} loader
   * @param {(data: unknown) => data is T} validateData
   * @returns {Promise<T>}
   */
  get(key, loader, validateData) {
    if (key.trim() === '') return Promise.reject(new TypeError('Cache key must not be blank'));

    // 1. Buscar memoria/persistencia y verificar timestamp antes de servir datos.
    const cached = this.#readFresh(key, validateData);
    if (cached !== undefined) return Promise.resolve(cached);

    // 2. Tras miss o invalidación, compartir la carga pendiente de esta clave.
    const current = this.inFlight.get(key);
    if (current !== undefined) return /** @type {Promise<T>} */ (current);

    const request = Promise.resolve()
      .then(loader)
      .then((data) => {
        if (!validateData(data)) throw new TypeError('Loader returned data outside the cache contract');
        // 3. El TTL empieza tras cargar y validar, no al iniciar HTTP ni al leer la caché.
        const storedAt = this.now();
        const entry = /** @type {CacheEntry} */ ({
          schemaVersion: 1,
          key,
          storedAt,
          // 3600 segundos = 3 600 000 ms: vencimiento absoluto, no deslizante.
          expiresAt: storedAt + this.ttlMs,
          data,
        });
        this.memory.set(key, entry);
        this.#persist(key, entry);
        return data;
      })
      .finally(() => {
        if (this.inFlight.get(key) === request) this.inFlight.delete(key);
      });

    this.inFlight.set(key, request);
    return request;
  }

  /**
   * Permite retirar el dato visible sin prolongar el TTL por cada lectura.
   * @param {string} key
   */
  expiresAt(key) {
    return this.memory.get(key)?.expiresAt;
  }

  /**
   * Rechaza reloj atrasado, TTL manipulado, clave incorrecta y modelo inválido.
   * @template T @param {string} key @param {(data: unknown) => data is T} validateData @returns {T | undefined}
   */
  #readFresh(key, validateData) {
    const entry = this.memory.get(key) || this.#readPersistent(key);
    if (entry === undefined) return undefined;

    // 4. Rechazar fechas futuras y comprobar expiresAt === storedAt + una hora.
    const now = this.now();
    const coherent = validateCacheEntry(entry)
      && entry.key === key
      && entry.storedAt <= now
      && entry.expiresAt === entry.storedAt + this.ttlMs
      // En el instante exacto del segundo 3600 la entrada ya no es válida.
      && now < entry.expiresAt
      && validateData(entry.data);
    // 5. Invalidar memoria y persistencia antes de solicitar de nuevo; no servir stale.
    if (!coherent) {
      this.memory.delete(key);
      this.#removePersistent(key);
      return undefined;
    }
    this.memory.set(key, entry);
    return /** @type {T} */ (entry.data);
  }

  /**
   * Elimina JSON/esquema corruptos inmediatamente, aunque la recarga de red falle.
   * @param {string} key
   */
  #readPersistent(key) {
    try {
      const serialized = this.storage?.getItem(this.#storageKey(key));
      if (serialized === null || serialized === undefined) return undefined;
      const parsed = JSON.parse(serialized);
      if (validateCacheEntry(parsed)) return /** @type {CacheEntry} */ (parsed);
      this.#removePersistent(key);
      return undefined;
    } catch {
      this.#removePersistent(key);
      return undefined;
    }
  }

  /**
   * Persistencia best-effort: cuota o bloqueo no invalidan el dato correcto de esta sesión.
   * @param {string} key @param {CacheEntry} entry
   */
  #persist(key, entry) {
    try {
      this.storage?.setItem(this.#storageKey(key), JSON.stringify(entry));
    } catch {
      // Persistence is an optimization; the validated memory entry remains usable.
    }
  }

  /**
   * Retira sólo la entrada GET afectada; no borra el carrito ni todo localStorage.
   * @param {string} key
   */
  #removePersistent(key) {
    try {
      this.storage?.removeItem(this.#storageKey(key));
    } catch {
      // A blocked storage must not break the resource flow.
    }
  }

  /**
   * Aísla versiones del modelo GET para no restaurar normalizaciones antiguas.
   * @param {string} key
   */
  #storageKey(key) {
    return `${this.namespace}:${key}`;
  }
}
