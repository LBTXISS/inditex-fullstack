package com.inditex.similarproducts.application.service;

import com.inditex.similarproducts.application.config.AggregationProperties;
import com.inditex.similarproducts.application.error.FailureType;
import com.inditex.similarproducts.application.error.SimilarProductsException;
import com.inditex.similarproducts.application.port.out.ProductCatalogPort;
import com.inditex.similarproducts.domain.ProductDetail;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.IntStream;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Pruebas del contrato, aislamiento de errores y liberación de recursos de esta frontera. */
@ExtendWith(MockitoExtension.class)
class GetSimilarProductsServiceTest {

    @Mock
    private ProductCatalogPort productCatalog;

    private GetSimilarProductsService service;

    @BeforeEach
    void setUp() {
        service = new GetSimilarProductsService(
                productCatalog,
                new AggregationProperties(8, Duration.ofMillis(500))
        );
    }

    /** Los detalles terminan fuera de orden, pero se conserva el orden de similitud. */
    @Test
    void fetchesDetailsConcurrentlyAndPreservesSimilarityOrder() {
        // Given (Dado): dependencias y datos controlados para este escenario.
        when(productCatalog.findSimilarProductIds("1")).thenReturn(Mono.just(List.of("2", "3", "4")));
        when(productCatalog.findProductDetail("2")).thenReturn(delayedProduct("2", 60));
        when(productCatalog.findProductDetail("3")).thenReturn(delayedProduct("3", 30));
        when(productCatalog.findProductDetail("4")).thenReturn(delayedProduct("4", 5));

        // When (Cuando): ejecutar la operación bajo las condiciones del escenario.
        StepVerifier.create(service.getSimilarProducts("1"))
                // Then (Entonces): comprobar resultado, contrato o ausencia de trabajo residual.
                .assertNext(products -> org.assertj.core.api.Assertions.assertThat(products)
                        .extracting(ProductDetail::id)
                        .containsExactly("2", "3", "4"))
                .verifyComplete();
    }

    /** Sólo una relación vacía válida produce [] sin consultar detalles. */
    @Test
    void returnsEmptyListWithoutRequestingDetails() {
        // Given (Dado): dependencias y datos controlados para este escenario.
        when(productCatalog.findSimilarProductIds("empty")).thenReturn(Mono.just(List.of()));

        // When (Cuando): ejecutar la operación bajo las condiciones del escenario.
        StepVerifier.create(service.getSimilarProducts("empty"))
                // Then (Entonces): comprobar resultado, contrato o ausencia de trabajo residual.
                .expectNext(List.of())
                .verifyComplete();


        verify(productCatalog, never()).findProductDetail(org.mockito.ArgumentMatchers.anyString());
    }

    /** Un ID repetido se consulta una vez y conserva su primera posición. */
    @Test
    void removesDuplicateIdsWhilePreservingTheirFirstPosition() {
        // Given (Dado): dependencias y datos controlados para este escenario.
        when(productCatalog.findSimilarProductIds("duplicates"))
                .thenReturn(Mono.just(List.of("3", "2", "3", "1")));
        when(productCatalog.findProductDetail("3")).thenReturn(delayedProduct("3", 5));
        when(productCatalog.findProductDetail("2")).thenReturn(delayedProduct("2", 5));
        when(productCatalog.findProductDetail("1")).thenReturn(delayedProduct("1", 5));

        // When (Cuando): ejecutar la operación bajo las condiciones del escenario.
        StepVerifier.create(service.getSimilarProducts("duplicates"))
                // Then (Entonces): comprobar resultado, contrato o ausencia de trabajo residual.
                .assertNext(products -> org.assertj.core.api.Assertions.assertThat(products)
                        .extracting(ProductDetail::id)
                        .containsExactly("3", "2", "1"))
                .verifyComplete();


        verify(productCatalog).findProductDetail("3");
        verify(productCatalog).findProductDetail("2");
        verify(productCatalog).findProductDetail("1");
    }

    /** El fan-out nunca supera los permisos aunque existan más detalles pendientes. */
    @Test
    void neverExceedsConfiguredDetailConcurrency() {
        // Given (Dado): dependencias y datos controlados para este escenario.
        GetSimilarProductsService serviceWithTwoPermits =
                new GetSimilarProductsService(
                        productCatalog,
                        new AggregationProperties(2, Duration.ofMillis(500))
                );
        List<String> ids = IntStream.rangeClosed(1, 6).mapToObj(String::valueOf).toList();
        AtomicInteger active = new AtomicInteger();
        AtomicInteger maximumActive = new AtomicInteger();

        when(productCatalog.findSimilarProductIds("limited")).thenReturn(Mono.just(ids));
        when(productCatalog.findProductDetail(anyString())).thenAnswer(invocation -> {
            String id = invocation.getArgument(0);
            return Mono.defer(() -> {
                int current = active.incrementAndGet();
                maximumActive.accumulateAndGet(current, Math::max);
                return delayedProduct(id, 25).doOnSuccess(product -> active.decrementAndGet());
            });
        });

        // When (Cuando): ejecutar la operación bajo las condiciones del escenario.
        StepVerifier.create(serviceWithTwoPermits.getSimilarProducts("limited"))
                // Then (Entonces): comprobar resultado, contrato o ausencia de trabajo residual.
                .assertNext(products -> {
                    org.assertj.core.api.Assertions.assertThat(products)
                            .extracting(ProductDetail::id)
                            .containsExactlyElementsOf(ids);
                    org.assertj.core.api.Assertions.assertThat(maximumActive).hasValue(2);
                })
                .verifyComplete();
    }

    /** Un fallo temprano de menor precedencia no oculta un fallo posterior más grave. */
    @Test
    void appliesFailurePrecedenceInsteadOfNetworkCompletionOrder() {
        // Given (Dado): dependencias y datos controlados para este escenario.
        when(productCatalog.findSimilarProductIds("precedence"))
                .thenReturn(Mono.just(List.of("missing", "broken")));
        when(productCatalog.findProductDetail("missing"))
                .thenReturn(Mono.delay(Duration.ofMillis(5))
                        .then(Mono.error(new SimilarProductsException(
                                FailureType.RELATED_PRODUCT_NOT_FOUND))));
        when(productCatalog.findProductDetail("broken"))
                .thenReturn(Mono.delay(Duration.ofMillis(25))
                        .then(Mono.error(new SimilarProductsException(
                                FailureType.UPSTREAM_BAD_RESPONSE))));

        // When (Cuando): ejecutar la operación bajo las condiciones del escenario.
        StepVerifier.create(service.getSimilarProducts("precedence"))
                // Then (Entonces): comprobar resultado, contrato o ausencia de trabajo residual.
                .expectErrorSatisfies(error -> org.assertj.core.api.Assertions.assertThat(error)
                        .isInstanceOfSatisfying(SimilarProductsException.class,
                                failure -> org.assertj.core.api.Assertions
                                        .assertThat(failure.failureType())
                                        .isEqualTo(FailureType.UPSTREAM_BAD_RESPONSE)))
                .verify();
    }

    /** El plazo global cancela el detalle pendiente y propaga timeout tipificado. */
    @Test
    void totalDeadlineCancelsPendingDetailWork() {
        // Given (Dado): dependencias y datos controlados para este escenario.
        AtomicBoolean cancelled = new AtomicBoolean();
        GetSimilarProductsService shortDeadlineService = new GetSimilarProductsService(
                productCatalog,
                new AggregationProperties(1, Duration.ofMillis(40))
        );
        when(productCatalog.findSimilarProductIds("timeout")).thenReturn(Mono.just(List.of("slow")));
        when(productCatalog.findProductDetail("slow"))
                .thenReturn(Mono.<ProductDetail>never().doOnCancel(() -> cancelled.set(true)));

        // When (Cuando): ejecutar la operación bajo las condiciones del escenario.
        StepVerifier.create(shortDeadlineService.getSimilarProducts("timeout"))
                // Then (Entonces): comprobar resultado, contrato o ausencia de trabajo residual.
                .expectErrorSatisfies(error -> org.assertj.core.api.Assertions.assertThat(error)
                        .isInstanceOfSatisfying(SimilarProductsException.class,
                                failure -> org.assertj.core.api.Assertions
                                        .assertThat(failure.failureType())
                                        .isEqualTo(FailureType.UPSTREAM_TIMEOUT)))
                .verify();


        org.assertj.core.api.Assertions.assertThat(cancelled).isTrue();
    }

    /** Un fallo interno aborta inmediatamente sin esperar un detalle que nunca termina. */
    @Test
    void internalFailureCancelsPendingWorkImmediately() {
        // Given (Dado): dependencias y datos controlados para este escenario.
        AtomicBoolean cancelled = new AtomicBoolean();
        when(productCatalog.findSimilarProductIds("internal"))
                .thenReturn(Mono.just(List.of("pending", "broken")));
        when(productCatalog.findProductDetail("pending"))
                .thenReturn(Mono.<ProductDetail>never().doOnCancel(() -> cancelled.set(true)));
        when(productCatalog.findProductDetail("broken"))
                .thenReturn(Mono.error(new SimilarProductsException(FailureType.INTERNAL_ERROR)));

        // When (Cuando): ejecutar la operación bajo las condiciones del escenario.
        StepVerifier.create(service.getSimilarProducts("internal"))
                // Then (Entonces): comprobar resultado, contrato o ausencia de trabajo residual.
                .expectErrorSatisfies(error -> org.assertj.core.api.Assertions.assertThat(error)
                        .isInstanceOfSatisfying(SimilarProductsException.class,
                                failure -> org.assertj.core.api.Assertions
                                        .assertThat(failure.failureType())
                                        .isEqualTo(FailureType.INTERNAL_ERROR)))
                .verify();


        org.assertj.core.api.Assertions.assertThat(cancelled).isTrue();
    }

    private Mono<ProductDetail> delayedProduct(String id, long delayMillis) {
        ProductDetail product = new ProductDetail(
                id,
                "Product " + id,
                new BigDecimal("9.99"),
                true
        );
        return Mono.delay(Duration.ofMillis(delayMillis)).thenReturn(product);
    }
}
