package com.inditex.similarproducts.adapter.in.web;

import com.inditex.similarproducts.application.port.in.GetSimilarProductsUseCase;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

import java.util.List;

/**
 * Adaptador HTTP de entrada: convierte el dominio a DTOs sólo en la frontera pública.
 */
@RestController
@RequestMapping("/product")
public class SimilarProductsController {

    private final GetSimilarProductsUseCase getSimilarProducts;

    /**
     * Inyecta el caso de uso, sin acoplar el controlador al cliente HTTP externo.
     * @param getSimilarProducts puerto de entrada de la agregación
     */
    public SimilarProductsController(GetSimilarProductsUseCase getSimilarProducts) {
        this.getSimilarProducts = getSimilarProducts;
    }

    /**
     * Entrega el agregado completo con no-store para no ocultar cambios o errores del proveedor.
     * @param productId identificador externo recibido en la ruta
     * @return respuesta JSON ordenada; los fallos se traducen centralmente a ProblemDetail
     */
    @GetMapping(value = "/{productId}/similar", produces = MediaType.APPLICATION_JSON_VALUE)
    public Mono<ResponseEntity<List<ProductDetailResponse>>> getSimilarProducts(
            @PathVariable String productId
    ) {
        return getSimilarProducts.getSimilarProducts(productId)
                .map(products -> products.stream().map(ProductDetailResponse::from).toList())
                .map(body -> ResponseEntity.ok()
                        .cacheControl(CacheControl.noStore())
                        .body(body));
    }
}
