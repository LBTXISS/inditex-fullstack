import { validateCartResponse, validateCartStorage } from '../../shared/api/contracts.js';
import { CART_STORAGE_KEY } from '../../shared/config/runtimeConfig.js';
import { browserStorage } from '../../shared/cache/browserStorage.js';

/** @typedef {{ getItem(key: string): string | null, setItem(key: string, value: string): void }} StorageLike */

/** Contador persistente sin TTL: serializa POST y acepta el dato del servidor, incluso si disminuye. */
export class CartStore {
  /**
   * Restaura únicamente un contador versionado válido; acceso o JSON inválidos comienzan en cero.
   * @param {{ storage?: StorageLike | null, now?: () => number }} [options]
   */
  constructor(options = {}) {
    this.storage = options.storage === undefined ? browserStorage() : options.storage;
    this.now = options.now || Date.now;
    /** @type {Set<() => void>} */
    this.listeners = new Set();
    this.count = this.#restore();
    this.sending = false;
    this.snapshot = Object.freeze({ count: this.count, sending: this.sending });
    this.queue = Promise.resolve();
  }

  /** @returns {{ readonly count: number, readonly sending: boolean }} Snapshot estable hasta notificar un cambio. */
  getSnapshot = () => this.snapshot;

  /**
   * Devuelve limpieza del consumidor para no retener componentes desmontados.
   * @param {() => void} listener
   */
  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  /**
   * Ejecuta cada comando una vez, en orden, y sólo aplica una respuesta válida.
   * No hay retry: perder la respuesta no demuestra que el servidor no aplicó el POST.
   * Serializes commands so an older server response can never overwrite a newer count.
   * @param {() => Promise<unknown>} command
   */
  enqueue(command) {
    const operation = this.queue.catch(() => undefined).then(async () => {
      this.sending = true;
      this.#notify();
      try {
        const response = await command();
        if (!validateCartResponse(response)) throw new TypeError('Invalid cart response');
        this.count = response.count;
        this.#persist();
        return this.count;
      } finally {
        this.sending = false;
        this.#notify();
      }
    });
    this.queue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  /** @returns {number} Contador válido o cero ante JSON, versión o acceso inválidos; no aplica TTL GET. */
  #restore() {
    try {
      const serialized = this.storage?.getItem(CART_STORAGE_KEY);
      if (serialized === null || serialized === undefined) return 0;
      const entry = JSON.parse(serialized);
      return validateCartStorage(entry) ? entry.count : 0;
    } catch {
      return 0;
    }
  }

  /** Persiste exclusivamente el último contador confirmado por el servidor. */
  #persist() {
    try {
      this.storage?.setItem(CART_STORAGE_KEY, JSON.stringify({
        schemaVersion: 1,
        count: this.count,
        updatedAt: this.now(),
      }));
    } catch {
      // The in-memory authoritative response still updates the current UI session.
    }
  }

  /** Cambia el snapshot inmutable antes de avisar a los consumidores de React. */
  #notify() {
    this.snapshot = Object.freeze({ count: this.count, sending: this.sending });
    this.listeners.forEach((listener) => listener());
  }
}
