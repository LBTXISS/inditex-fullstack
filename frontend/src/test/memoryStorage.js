/** Doble de Storage aislado por prueba, sin estado real del navegador. */
export function createMemoryStorage() {
  /** @type {Map<string, string>} */
  const values = new Map();
  return {
    /** @param {string} key */
    getItem: (key) => values.get(key) ?? null,
    /** @param {string} key @param {string} value */
    setItem: (key, value) => values.set(key, value),
    /** @param {string} key */
    removeItem: (key) => values.delete(key),
    /** @param {string} key */
    value: (key) => values.get(key) ?? '',
  };
}
