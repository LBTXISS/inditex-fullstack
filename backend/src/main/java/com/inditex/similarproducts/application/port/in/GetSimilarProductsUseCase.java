package com.inditex.similarproducts.application.port.in;

import com.inditex.similarproducts.domain.ProductDetail;
import reactor.core.publisher.Mono;

import java.util.List;

/**
 * Puerto de entrada del agregado de productos similares; no expone DTOs HTTP.
 */
public interface GetSimilarProductsUseCase {

    /**
     * Construye un agregado completo en el orden de similitud del catálogo externo.
     * Sólo una lista de identificadores vacía produce una lista vacía; un 404 sigue siendo error.
     * @param productId identificador externo no vacío del producto de referencia
     * @return publicación diferida del agregado completo o un fallo tipificado; nunca resultado parcial
     */
    Mono<List<ProductDetail>> getSimilarProducts(String productId);
}
