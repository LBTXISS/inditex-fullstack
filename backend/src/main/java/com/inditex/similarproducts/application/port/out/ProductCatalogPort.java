package com.inditex.similarproducts.application.port.out;

import com.inditex.similarproducts.domain.ProductDetail;
import reactor.core.publisher.Mono;

import java.util.List;

/**
 * Contrato externo del caso de uso, expresado mediante identificadores y objetos de dominio.
 * Reactor modela cancelación y composición; ningún tipo WebClient/Jackson atraviesa el puerto.
 */
public interface ProductCatalogPort {

    /**
     * Consulta la relación ordenada de similitud del producto de referencia.
     * @param productId identificador opaco externo
     * @return identificadores en orden del proveedor; ausencia del producto es error, no lista vacía
     */
    Mono<List<String>> findSimilarProductIds(String productId);

    /**
     * Obtiene un detalle válido y coherente con el identificador solicitado.
     * @param productId identificador opaco externo del detalle
     * @return producto de dominio o fallo tipificado, sin coerción de datos inválidos
     */
    Mono<ProductDetail> findProductDetail(String productId);
}
