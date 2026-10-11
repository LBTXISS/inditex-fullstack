package com.inditex.similarproducts.application.error;

import java.util.Objects;

/**
 * Transporta un fallo tipificado entre puertos; la causa es diagnóstica y nunca se publica.
 */
public class SimilarProductsException extends RuntimeException {

    /** Categoría serializable del fallo; su causa técnica no forma parte de la respuesta HTTP. */
    private final FailureType failureType;

    /**
     * Representa un fallo contractual sin depender de excepciones de infraestructura.
     * @param failureType categoría no nula que gobierna la respuesta pública
     */
    public SimilarProductsException(FailureType failureType) {
        super(failureType.name());
        this.failureType = Objects.requireNonNull(failureType);
    }

    /**
     * Conserva la causa técnica sin convertirla en mensaje de respuesta.
     * @param failureType categoría no nula que gobierna la respuesta pública
     * @param cause causa diagnóstica interna
     */
    public SimilarProductsException(FailureType failureType, Throwable cause) {
        super(failureType.name(), cause);
        this.failureType = Objects.requireNonNull(failureType);
    }

    /**
     * Permite seleccionar el error contractual y su precedencia sin inspeccionar mensajes.
     * @return categoría estable del fallo
     */
    public FailureType failureType() {
        return failureType;
    }
}
