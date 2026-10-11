package com.inditex.similarproducts.adapter.in.web;

import com.inditex.similarproducts.domain.ProductDetail;

import java.math.BigDecimal;

/**
 * Representación HTTP del producto; el dominio no conoce este DTO ni su serialización.
 * @param id identificador externo conservado sin reinterpretación
 * @param name nombre comercial validado
 * @param price precio decimal sin añadir una moneda no especificada
 * @param availability disponibilidad comercial del producto
 */
public record ProductDetailResponse(
        String id,
        String name,
        BigDecimal price,
        boolean availability
) {

    /**
     * Copia únicamente los campos admitidos por el contrato público.
     * @param product producto de dominio previamente validado
     * @return DTO de respuesta sin detalles de infraestructura
     */
    static ProductDetailResponse from(ProductDetail product) {
        return new ProductDetailResponse(
                product.id(),
                product.name(),
                product.price(),
                product.availability()
        );
    }
}
