package com.inditex.similarproducts.application.error;

/**
 * Taxonomía estable de errores del caso de uso y su representación pública segura.
 * La precedencia resuelve fallos de dependencias sin depender del orden de llegada.
 */
public enum FailureType {
    /** Identificador vacío: rechazar antes de consultar dependencias. */
    INVALID_PRODUCT_ID(400, "invalid-product-id", "Invalid product identifier",
            "The product identifier does not satisfy the public contract.", 0),
    /** El endpoint público sólo admite GET. */
    METHOD_NOT_ALLOWED(405, "method-not-allowed", "Method not allowed",
            "The requested HTTP method is not supported.", 0),
    /** Formato solicitado no soportado por el contrato JSON. */
    NOT_ACCEPTABLE(406, "not-acceptable", "Not acceptable",
            "The requested response media type is not supported.", 0),
    /** No existe el producto de referencia, distinto de una relación vacía. */
    PRODUCT_NOT_FOUND(404, "product-not-found", "Product not found",
            "The requested product was not found.", 1),
    /** Falta un detalle requerido; el agregado no puede ser parcial. */
    RELATED_PRODUCT_NOT_FOUND(404, "related-product-not-found", "Related product not found",
            "A product required to build the aggregate was not found.", 10),
    /** Cuerpo, esquema o estado externo no utilizable. */
    UPSTREAM_BAD_RESPONSE(502, "upstream-bad-response", "Upstream response error",
            "A dependency returned a response that cannot be used.", 20),
    /** El transporte no puede alcanzar una dependencia. */
    UPSTREAM_UNAVAILABLE(503, "upstream-unavailable", "Upstream unavailable",
            "A required dependency is temporarily unavailable.", 30),
    /** El proveedor limita tráfico; no provocar retries en cascada. */
    UPSTREAM_RATE_LIMITED(503, "upstream-rate-limited", "Upstream rate limited",
            "A required dependency is temporarily rate limited.", 30),
    /** Capacidad local agotada; rechazar antes de formar una cola ilimitada. */
    SERVICE_OVERLOADED(503, "service-overloaded", "Service overloaded",
            "The service has no local capacity available for this request.", 0),
    /** Presupuesto agotado; cancelar trabajo y devolver 504. */
    UPSTREAM_TIMEOUT(504, "upstream-timeout", "Upstream timeout",
            "A required dependency did not complete within the request budget.", 40),
    /** Fallo inesperado sin publicar información diagnóstica. */
    INTERNAL_ERROR(500, "internal-error", "Internal error",
            "An unexpected internal error occurred.", 0);

    private final int status;
    private final String problemType;
    private final String title;
    private final String detail;
    private final int precedence;

    FailureType(int status, String problemType, String title, String detail, int precedence) {
        this.status = status;
        this.problemType = problemType;
        this.title = title;
        this.detail = detail;
        this.precedence = precedence;
    }

    /**
     * Define el estado HTTP pactado, no el código bruto recibido del proveedor.
     * @return estado público del error
     */
    public int status() {
        return status;
    }

    /**
     * Identifica la categoría estable utilizada en el URI del ProblemDetail.
     * @return sufijo del tipo público
     */
    public String problemType() {
        return problemType;
    }

    /**
     * Ofrece un título público sin datos sensibles de la dependencia.
     * @return título seguro
     */
    public String title() {
        return title;
    }

    /**
     * Explica el fallo sin revelar cuerpos externos, URLs privadas ni trazas.
     * @return descripción segura
     */
    public String detail() {
        return detail;
    }

    /**
     * Ordena fallos de detalles: timeout prima sobre indisponibilidad y respuesta inválida.
     * @return prioridad; cero para errores locales que deben abortar inmediatamente
     */
    public int precedence() {
        return precedence;
    }
}
