package com.inditex.similarproducts.adapter.out.http;

import org.junit.jupiter.api.Test;
import reactor.core.Disposable;
import reactor.core.publisher.Mono;
import reactor.core.publisher.Sinks;
import reactor.test.StepVerifier;

import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/** Pruebas del contrato, aislamiento de errores y liberación de recursos de esta frontera. */
class SingleFlightRegistryTest {

    /** Solicitudes simultáneas comparten trabajo, pero una consulta posterior obtiene dato nuevo. */
    @Test
    void sharesConcurrentWorkAndDoesNotCacheTheCompletedResult() {
        // Given (Dado): dependencias y datos controlados para este escenario.
        SingleFlightRegistry registry = new SingleFlightRegistry();
        AtomicInteger subscriptions = new AtomicInteger();
        Sinks.One<String> result = Sinks.one();

        Mono<String> first = registry.execute("detail:2",
                () -> Mono.defer(() -> {
                    subscriptions.incrementAndGet();
                    return result.asMono();
                }));
        Mono<String> second = registry.execute("detail:2",
                () -> Mono.error(new AssertionError("A concurrent duplicate must use the winner")));

        // When (Cuando): ejecutar la operación bajo las condiciones del escenario.
        StepVerifier.create(Mono.zip(first, second))
                .then(() -> {
                    // Then (Entonces): comprobar resultado, contrato o ausencia de trabajo residual.
                    assertThat(subscriptions).hasValue(1);
                    assertThat(registry.size()).isOne();
                    result.emitValue("product", Sinks.EmitFailureHandler.FAIL_FAST);
                })
                .expectNextMatches(tuple -> tuple.getT1().equals("product")
                        && tuple.getT2().equals("product"))
                .verifyComplete();


        assertThat(registry.size()).isZero();
        StepVerifier.create(registry.execute("detail:2",
                        () -> Mono.fromSupplier(() -> {
                            subscriptions.incrementAndGet();
                            return "fresh-product";
                        })))
                .expectNext("fresh-product")
                .verifyComplete();
        assertThat(subscriptions).hasValue(2);
    }

    /** Un fallo libera la clave antes de propagarse y permite una nueva operación. */
    @Test
    void removesAnErroredOperationBeforePropagatingTheFailure() {
        // Given (Dado): dependencias y datos controlados para este escenario.
        SingleFlightRegistry registry = new SingleFlightRegistry();
        AtomicInteger subscriptions = new AtomicInteger();

        // When (Cuando): ejecutar la operación bajo las condiciones del escenario.
        StepVerifier.create(registry.execute("similar-ids:5",
                        () -> Mono.defer(() -> {
                            subscriptions.incrementAndGet();
                            return Mono.error(new IllegalStateException("upstream failure"));
                        })))
                // Then (Entonces): comprobar resultado, contrato o ausencia de trabajo residual.
                .expectErrorMessage("upstream failure")
                .verify();


        assertThat(registry.size()).isZero();
        StepVerifier.create(registry.execute("similar-ids:5",
                        () -> Mono.fromSupplier(() -> {
                            subscriptions.incrementAndGet();
                            return "new attempt";
                        })))
                .expectNext("new attempt")
                .verifyComplete();
        assertThat(subscriptions).hasValue(2);
    }

    /** Cancelar un consumidor no aborta a otro; el último sí cancela y libera la clave. */
    @Test
    void keepsSharedWorkUntilTheLastSubscriberCancelsAndThenRemovesIt() {
        // Given (Dado): dependencias y datos controlados para este escenario.
        SingleFlightRegistry registry = new SingleFlightRegistry();
        AtomicInteger subscriptions = new AtomicInteger();
        AtomicInteger cancellations = new AtomicInteger();

        java.util.function.Supplier<Mono<String>> operation = () -> Mono.<String>never()
                .doOnSubscribe(ignored -> subscriptions.incrementAndGet())
                .doOnCancel(cancellations::incrementAndGet);

        Disposable first = registry.execute("detail:3", operation).subscribe();
        Disposable second = registry.execute("detail:3", operation).subscribe();

        // When (Cuando): invocar la operación que se verifica en la aserción.
        // Then (Entonces): comprobar resultado, contrato o ausencia de trabajo residual.

        assertThat(subscriptions).hasValue(1);
        assertThat(registry.size()).isOne();
        first.dispose();
        assertThat(cancellations).hasValue(0);
        assertThat(registry.size()).isOne();

        second.dispose();
        assertThat(cancellations).hasValue(1);
        assertThat(registry.size()).isZero();

        Disposable later = registry.execute("detail:3", operation).subscribe();
        assertThat(subscriptions).hasValue(2);
        later.dispose();
    }
}
