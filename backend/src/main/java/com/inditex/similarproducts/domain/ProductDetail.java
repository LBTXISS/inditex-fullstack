package com.inditex.similarproducts.domain;

import java.math.BigDecimal;
import java.util.Objects;

/**
 * Producto válido del catálogo externo, independiente de serialización y transporte.
 * El precio conserva precisión decimal; indisponibilidad no equivale a producto inexistente.
 * @param id identificador opaco externo, clave de consulta y de coalescencia
 * @param name nombre comercial no vacío; el contrato no impone una longitud artificial
 * @param price precio no negativo sin asumir moneda no declarada por el proveedor
 * @param availability indica disponibilidad comercial, no la existencia del registro
 */
public record ProductDetail(
        String id,
        String name,
        BigDecimal price,
        boolean availability
) {

    /**
     * Impide construir productos que incumplan las invariantes del agregado.
     * @throws IllegalArgumentException si identificador o nombre están vacíos, o el precio es negativo
     * @throws NullPointerException si falta el precio
     */
    public ProductDetail {
        if (id == null || id.isBlank()) {
            throw new IllegalArgumentException("Product id must not be blank");
        }
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("Product name must not be blank");
        }
        Objects.requireNonNull(price, "Product price must not be null");
        if (price.signum() < 0) {
            throw new IllegalArgumentException("Product price must not be negative");
        }
    }
}
