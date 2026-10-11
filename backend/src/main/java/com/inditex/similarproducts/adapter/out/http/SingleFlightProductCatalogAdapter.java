package com.inditex.similarproducts.adapter.out.http;

import com.inditex.similarproducts.application.port.out.ProductCatalogPort;
import com.inditex.similarproducts.domain.ProductDetail;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

import java.util.List;

/**
 * Decorador del puerto que reduce tráfico duplicado concurrente sin alterar frescura o errores.
 * Los prefijos separan identificadores y detalles para impedir colisiones de tipo por ID.
 */
@Component
@Primary
public class SingleFlightProductCatalogAdapter implements ProductCatalogPort {

    private static final String SIMILAR_IDS = "similar-ids:";
    private static final String PRODUCT_DETAIL = "product-detail:";

    private final ProductCatalogPort delegate;
    private final SingleFlightRegistry registry = new SingleFlightRegistry();

    /**
     * Envuelve el transporte concreto manteniendo el contrato del puerto de catálogo.
     * @param delegate adaptador HTTP instrumentado que realiza las operaciones externas
     */
    public SingleFlightProductCatalogAdapter(
            @Qualifier("existingProductsWebClientAdapter") ProductCatalogPort delegate
    ) {
        this.delegate = delegate;
    }

    /**
     * Comparte solicitudes concurrentes de esta operación e ID, sin reutilizar resultados terminados.
     * @param productId identificador externo opaco
     * @return publicación compartida hasta éxito, fallo o cancelación del último consumidor
     */
    @Override
    public Mono<List<String>> findSimilarProductIds(String productId) {
        return registry.execute(SIMILAR_IDS + productId,
                () -> delegate.findSimilarProductIds(productId));
    }

    /**
     * Comparte solicitudes concurrentes de esta operación e ID, sin reutilizar resultados terminados.
     * @param productId identificador externo opaco
     * @return publicación compartida hasta éxito, fallo o cancelación del último consumidor
     */
    @Override
    public Mono<ProductDetail> findProductDetail(String productId) {
        return registry.execute(PRODUCT_DETAIL + productId,
                () -> delegate.findProductDetail(productId));
    }
}
