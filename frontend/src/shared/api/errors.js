/** Distingue red, HTTP, contrato y timeout sin interpretar mensajes internos. */
export class ApiError extends Error {
  /**
   * Conserva categoría y causa interna sin exponer el cuerpo del proveedor.
   * @param {'timeout' | 'network' | 'http' | 'contract'} kind
   * @param {string} message
   * @param {{ status?: number, cause?: unknown }} [details]
   */
  constructor(kind, message, details = {}) {
    super(message, details.cause === undefined ? undefined : { cause: details.cause });
    this.name = 'ApiError';
    this.kind = kind;
    this.status = details.status;
  }
}
