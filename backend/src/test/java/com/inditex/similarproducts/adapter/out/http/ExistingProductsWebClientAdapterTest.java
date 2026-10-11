package com.inditex.similarproducts.adapter.out.http;

import com.inditex.similarproducts.application.error.FailureType;
import com.inditex.similarproducts.application.error.SimilarProductsException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.util.unit.DataSize;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.ExchangeFunction;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientRequestException;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.net.URI;
import java.time.Duration;

/** Pruebas del contrato, aislamiento de errores y liberación de recursos de esta frontera. */
class ExistingProductsWebClientAdapterTest {

    /** Convierte IDs enteros del fixture a cadenas sin alterar su orden. */
    @Test
    void normalizesNumericIdsFromTheProvidedMockContract() {
        // Given (Dado): dependencias y datos controlados para este escenario.
        ExistingProductsWebClientAdapter adapter = adapterReturning("[2,3,4]");

        // When (Cuando): ejecutar la operación bajo las condiciones del escenario.
        StepVerifier.create(adapter.findSimilarProductIds("1"))
                // Then (Entonces): comprobar resultado, contrato o ausencia de trabajo residual.
                .expectNext(java.util.List.of("2", "3", "4"))
                .verifyComplete();
    }

    /** Construye dominio tras comprobar ID, precio decimal y disponibilidad booleana. */
    @Test
    void mapsAValidProductDetail() {
        // Given (Dado): dependencias y datos controlados para este escenario.
        ExistingProductsWebClientAdapter adapter = adapterReturning(
                "{\"id\":\"2\",\"name\":\"Dress\",\"price\":19.99,\"availability\":true}"
        );

        // When (Cuando): ejecutar la operación bajo las condiciones del escenario.
        StepVerifier.create(adapter.findProductDetail("2"))
                // Then (Entonces): comprobar resultado, contrato o ausencia de trabajo residual.
                .assertNext(product -> {
                    org.assertj.core.api.Assertions.assertThat(product.id()).isEqualTo("2");
                    org.assertj.core.api.Assertions.assertThat(product.name()).isEqualTo("Dress");
                    org.assertj.core.api.Assertions.assertThat(product.price()).isEqualByComparingTo("19.99");
                    org.assertj.core.api.Assertions.assertThat(product.availability()).isTrue();
                })
                .verifyComplete();
    }

    /** Distingue el 404 del producto raíz del de un detalle requerido. */
    @Test
    void distinguishesRequestedAndRelatedNotFound() {
        // Given (Dado): dependencias y datos controlados para este escenario.
        ExistingProductsWebClientAdapter adapter = adapterReturning(HttpStatus.NOT_FOUND, "{}");

        // When (Cuando): ejecutar la operación bajo las condiciones del escenario.
        // Then (Entonces): el helper verifica el fallo/estado esperado y la finalización.
        assertFailure(adapter.findSimilarProductIds("missing"), FailureType.PRODUCT_NOT_FOUND);
        assertFailure(adapter.findProductDetail("missing"), FailureType.RELATED_PRODUCT_NOT_FOUND);
    }

    /** Un 500 externo produce fallo 502 sin filtrar el cuerpo privado. */
    @Test
    void mapsUpstreamServerErrorsAndInvalidPayloadsToBadResponse() {
        // Given (Dado): dependencias y datos controlados para este escenario.
        ExistingProductsWebClientAdapter failingAdapter =
                adapterReturning(HttpStatus.INTERNAL_SERVER_ERROR, "private upstream body");

        // When (Cuando): ejecutar la operación bajo las condiciones del escenario.
        // Then (Entonces): el helper verifica el fallo/estado esperado y la finalización.
        assertFailure(failingAdapter.findProductDetail("6"), FailureType.UPSTREAM_BAD_RESPONSE);
    }

    /** Rechaza IDs nulos, booleanos, decimales, negativos, vacíos y JSON concatenado. */
    @ParameterizedTest
    @ValueSource(strings = {"[null]", "[true]", "[{}]", "[[1]]", "[1.5]", "[-1]", "[\"\"]", "{}", "null", "[2] [3]"})
    void rejectsEveryUnsupportedSimilarIdShape(String payload) {
        // Given (Dado): dependencias y datos controlados para este escenario.
        // When (Cuando): ejecutar la operación bajo las condiciones del escenario.
        // Then (Entonces): el helper verifica el fallo/estado esperado y la finalización.
        assertFailure(adapterReturning(payload).findSimilarProductIds("1"),
                FailureType.UPSTREAM_BAD_RESPONSE);
    }

    /** Separa el 429 externo del rechazo de conexión para diagnóstico contractual. */
    @Test
    void distinguishesRateLimitAndTransportFailures() {
        // Given (Dado): dependencias y datos controlados para este escenario.
        ExistingProductsWebClientAdapter rateLimited = adapterReturning(HttpStatus.TOO_MANY_REQUESTS, "{}");
        URI uri = URI.create("http://localhost:3001/product/1");
        WebClientRequestException connectionFailure = new WebClientRequestException(
                new java.net.ConnectException("connection refused"),
                HttpMethod.GET,
                uri,
                HttpHeaders.EMPTY
        );
        ExistingProductsWebClientAdapter unavailable = adapter(
                WebClient.builder().exchangeFunction(request -> Mono.error(connectionFailure)),
                Duration.ofSeconds(1),
                Duration.ofSeconds(6)
        );

        // When (Cuando): ejecutar la operación bajo las condiciones del escenario.
        // Then (Entonces): el helper verifica el fallo/estado esperado y la finalización.
        assertFailure(rateLimited.findProductDetail("1"), FailureType.UPSTREAM_RATE_LIMITED);
        assertFailure(unavailable.findProductDetail("1"), FailureType.UPSTREAM_UNAVAILABLE);
    }

    /** Agotamiento del pool es sobrecarga local, no caída del proveedor. */
    @Test
    void distinguishesLocalPoolSaturationFromProviderUnavailability() {
        // Given (Dado): dependencias y datos controlados para este escenario.
        URI uri = URI.create("http://localhost:3001/product/1");
        WebClientRequestException poolFailure = new WebClientRequestException(
                new PoolAcquireTimeoutException(),
                HttpMethod.GET,
                uri,
                HttpHeaders.EMPTY
        );
        ExistingProductsWebClientAdapter overloaded = adapter(
                WebClient.builder().exchangeFunction(request -> Mono.error(poolFailure)),
                Duration.ofSeconds(1),
                Duration.ofSeconds(6)
        );

        // When (Cuando): ejecutar la operación bajo las condiciones del escenario.
        // Then (Entonces): el helper verifica el fallo/estado esperado y la finalización.
        assertFailure(overloaded.findProductDetail("1"), FailureType.SERVICE_OVERLOADED);
    }

    /** Una dependencia que nunca responde agota el presupuesto de la operación. */
    @Test
    void appliesTheOperationTimeout() {
        // Given (Dado): dependencias y datos controlados para este escenario.
        ExchangeFunction neverResponds = request -> Mono.never();
        ExistingProductsWebClientAdapter adapter = adapter(
                WebClient.builder().exchangeFunction(neverResponds),
                Duration.ofMillis(25),
                Duration.ofMillis(25)
        );

        // When (Cuando): ejecutar la operación bajo las condiciones del escenario.
        // Then (Entonces): el helper verifica el fallo/estado esperado y la finalización.
        assertFailure(adapter.findSimilarProductIds("slow"), FailureType.UPSTREAM_TIMEOUT);
        assertFailure(adapter.findProductDetail("slow"), FailureType.UPSTREAM_TIMEOUT);
    }

    /** Tipos originales inválidos, IDs ajenos y JSON duplicado/concatenado se rechazan sin coerción. */
    @ParameterizedTest
    @ValueSource(strings = {
            "{\"id\":2,\"name\":\"Dress\",\"price\":19.99,\"availability\":true}",
            "{\"id\":\"2\",\"name\":42,\"price\":19.99,\"availability\":true}",
            "{\"id\":\"2\",\"name\":\"Dress\",\"price\":\"19.99\",\"availability\":true}",
            "{\"id\":\"2\",\"name\":\"Dress\",\"price\":19.99,\"availability\":\"true\"}",
            "{\"id\":\"2\",\"name\":\"Dress\",\"price\":-1,\"availability\":true}",
            "{\"id\":\"3\",\"name\":\"Dress\",\"price\":19.99,\"availability\":true}",
            "{\"id\":\"2\",\"name\":\"Dress\",\"price\":19.99,\"availability\":null}",
            "{\"id\":\"2\",\"name\":\"Dress\",\"price\":19.99}",
            "{\"id\":\"2\",\"name\":\"Dress\",\"price\":19.99,\"availability\":true} {}",
            "{\"id\":\"2\",\"id\":\"2\",\"name\":\"Dress\",\"price\":19.99,\"availability\":true}",
            "{broken", "null", "[]", ""
    })
    void rejectsInvalidDetailsWithoutImplicitCoercion(String payload) {
        // Given (Dado): dependencias y datos controlados para este escenario.
        // When (Cuando): ejecutar la operación bajo las condiciones del escenario.
        // Then (Entonces): el helper verifica el fallo/estado esperado y la finalización.
        assertFailure(adapterReturning(payload).findProductDetail("2"), FailureType.UPSTREAM_BAD_RESPONSE);
    }

    /** El precio conserva decimales y no se inventa un límite de longitud del nombre. */
    @Test
    void preservesDecimalPrecisionAndDoesNotInventANameLengthLimit() {
        // Given (Dado): dependencias y datos controlados para este escenario.
        String name = "a".repeat(256);
        String payload = "{\"id\":\"2\",\"name\":\"" + name
                + "\",\"price\":19.990000000000000003,\"availability\":true}";
        // When (Cuando): ejecutar la operación bajo las condiciones del escenario.
        StepVerifier.create(adapterReturning(payload).findProductDetail("2"))
                // Then (Entonces): comprobar resultado, contrato o ausencia de trabajo residual.
                .assertNext(product -> {
                    org.assertj.core.api.Assertions.assertThat(product.price())
                            .isEqualByComparingTo("19.990000000000000003");
                    org.assertj.core.api.Assertions.assertThat(product.name()).isEqualTo(name);
                }).verifyComplete();
    }

    private ExistingProductsWebClientAdapter adapterReturning(String jsonBody) {
        return adapterReturning(HttpStatus.OK, jsonBody);
    }

    private ExistingProductsWebClientAdapter adapterReturning(HttpStatus status, String jsonBody) {
        ExchangeFunction exchangeFunction = request -> Mono.just(ClientResponse
                .create(status)
                .header(HttpHeaders.CONTENT_TYPE, "application/json")
                .body(jsonBody)
                .build());
        return adapter(WebClient.builder().exchangeFunction(exchangeFunction),
                Duration.ofSeconds(1), Duration.ofSeconds(6));
    }

    private ExistingProductsWebClientAdapter adapter(
            WebClient.Builder builder,
            Duration similarIdsTimeout,
            Duration detailTimeout
    ) {
        ExistingProductsClientProperties properties = new ExistingProductsClientProperties(
                URI.create("http://localhost:3001"),
                DataSize.ofKilobytes(256),
                Duration.ofSeconds(1),
                similarIdsTimeout,
                detailTimeout,
                64,
                256,
                Duration.ofMillis(300)
        );
        return new ExistingProductsWebClientAdapter(builder, properties);
    }

    private void assertFailure(Mono<?> result, FailureType expectedType) {
        StepVerifier.create(result)
                .expectErrorSatisfies(error -> org.assertj.core.api.Assertions.assertThat(error)
                        .isInstanceOfSatisfying(SimilarProductsException.class,
                                failure -> org.assertj.core.api.Assertions
                                        .assertThat(failure.failureType())
                                        .isEqualTo(expectedType)))
                .verify();
    }

    /** Doble con el nombre de excepción que Reactor Netty utiliza para capacidad agotada. */
    private static final class PoolAcquireTimeoutException extends RuntimeException {
    }
}
