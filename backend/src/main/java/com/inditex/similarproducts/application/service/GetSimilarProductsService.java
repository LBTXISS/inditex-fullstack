package com.inditex.similarproducts.application.service;

import com.inditex.similarproducts.application.config.AggregationProperties;
import com.inditex.similarproducts.application.error.FailureType;
import com.inditex.similarproducts.application.error.SimilarProductsException;
import com.inditex.similarproducts.application.port.in.GetSimilarProductsUseCase;
import com.inditex.similarproducts.application.port.out.ProductCatalogPort;
import com.inditex.similarproducts.domain.ProductDetail;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.LinkedHashSet;
import java.util.List;
import java.time.Duration;
import java.util.Comparator;

/**
 * Orquesta la agregación completa con concurrencia acotada y orden determinista.
 * Los fallos esperados se comparan por precedencia; los fallos locales cancelan el trabajo.
 */
@Service
public class GetSimilarProductsService implements GetSimilarProductsUseCase {

    private final ProductCatalogPort productCatalog;
    private final int detailConcurrency;
    private final Duration requestDeadline;

    /**
     * Recibe el puerto de catálogo y el presupuesto; no selecciona protocolos ni DTOs.
     * @param productCatalog dependencia expresada mediante el puerto de salida
     * @param aggregationProperties concurrencia y plazo máximo del agregado
     */
    public GetSimilarProductsService(
            ProductCatalogPort productCatalog,
            AggregationProperties aggregationProperties
    ) {
        this.productCatalog = productCatalog;
        this.detailConcurrency = aggregationProperties.detailConcurrency();
        this.requestDeadline = aggregationProperties.requestDeadline();
    }

    /**
     * Elimina duplicados conservando su primera posición y publica sólo agregados completos.
     * @param productId identificador no vacío del producto de referencia
     * @return agregado ordenado o fallo tipificado, con cancelación al agotar el presupuesto
     */
    @Override
    public Mono<List<ProductDetail>> getSimilarProducts(String productId) {
        if (productId == null || productId.isBlank()) {
            return Mono.error(new SimilarProductsException(FailureType.INVALID_PRODUCT_ID));
        }

        return productCatalog.findSimilarProductIds(productId)
                .map(ids -> List.copyOf(new LinkedHashSet<>(ids)))
                .flatMapMany(Flux::fromIterable)
                // flatMapSequential subscribes concurrently but emits in similarity order.
                .flatMapSequential(this::fetchDetailOutcome, detailConcurrency)
                .collectList()
                .flatMap(this::resolveOutcomes)
                // El plazo total (6,5 s por defecto) también acota colas y varias tandas de detalles.
                .timeout(requestDeadline,
                        Mono.error(new SimilarProductsException(FailureType.UPSTREAM_TIMEOUT)));
    }

    private Mono<DetailOutcome> fetchDetailOutcome(String productId) {
        return productCatalog.findProductDetail(productId)
                .map(DetailOutcome::success)
                .onErrorResume(SimilarProductsException.class,
                        failure -> isExpectedProviderFailure(failure.failureType())
                                ? Mono.just(DetailOutcome.failure(failure))
                                : Mono.error(failure));
    }

    private boolean isExpectedProviderFailure(FailureType failureType) {
        return switch (failureType) {
            case RELATED_PRODUCT_NOT_FOUND,
                    UPSTREAM_BAD_RESPONSE,
                    UPSTREAM_UNAVAILABLE,
                    UPSTREAM_RATE_LIMITED,
                    UPSTREAM_TIMEOUT -> true;
            default -> false;
        };
    }

    private Mono<List<ProductDetail>> resolveOutcomes(List<DetailOutcome> outcomes) {
        return outcomes.stream()
                .map(DetailOutcome::failure)
                .filter(java.util.Objects::nonNull)
                .max(Comparator.comparingInt(failure -> failure.failureType().precedence()))
                .<Mono<List<ProductDetail>>>map(Mono::error)
                .orElseGet(() -> Mono.just(outcomes.stream().map(DetailOutcome::product).toList()));
    }

    /**
     * Resultado interno exclusivo: producto o fallo esperado, nunca ambos.
     * Permite comparar errores sin que el primer paquete recibido decida la respuesta.
     */
    private record DetailOutcome(ProductDetail product, SimilarProductsException failure) {

        static DetailOutcome success(ProductDetail product) {
            return new DetailOutcome(product, null);
        }

        static DetailOutcome failure(SimilarProductsException failure) {
            return new DetailOutcome(null, failure);
        }
    }
}
