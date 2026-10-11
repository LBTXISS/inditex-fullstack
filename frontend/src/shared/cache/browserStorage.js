/** Obtiene Storage si el navegador lo permite; privacidad o bloqueo degradan a memoria.
 * @returns {Storage | null} */
export function browserStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}
