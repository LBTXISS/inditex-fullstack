package com.inditex.similarproducts.adapter.in.web;

import com.inditex.similarproducts.application.error.FailureType;
import com.inditex.similarproducts.application.error.SimilarProductsException;
import com.inditex.similarproducts.application.port.out.ProductCatalogPort;
import com.inditex.similarproducts.domain.ProductDetail;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.springframework.http.MediaType;
import reactor.core.publisher.Mono;

import java.math.BigDecimal;
import java.util.List;

import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Pruebas del contrato, aislamiento de errores y liberación de recursos de esta frontera. */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
class SimilarProductsControllerTest {

    @Autowired
    private WebTestClient webTestClient;

    @MockitoBean
    private ProductCatalogPort productCatalog;

    /** Respuesta completa preserva orden, no-store y correlación recibida. */
    @Test
    void returnsTheOrderedAggregateWithContractHeaders() {
        // Given (Dado): dependencias y datos controlados para este escenario.
        when(productCatalog.findSimilarProductIds("1")).thenReturn(Mono.just(List.of("2", "3", "4")));
        when(productCatalog.findProductDetail("2")).thenReturn(Mono.just(product("2", "Dress", "19.99", true)));
        when(productCatalog.findProductDetail("3")).thenReturn(Mono.just(product("3", "Blazer", "29.99", false)));
        when(productCatalog.findProductDetail("4")).thenReturn(Mono.just(product("4", "Boots", "39.99", true)));

        // When (Cuando): ejecutar la operación bajo las condiciones del escenario.
        webTestClient.get()
                .uri("/product/1/similar")
                .header(CorrelationIdWebFilter.HEADER_NAME, "test-correlation-id")
                .exchange()
                // Then (Entonces): comprobar resultado, contrato o ausencia de trabajo residual.
                .expectStatus().isOk()
                .expectHeader().contentType("application/json")
                .expectHeader().valueEquals("Cache-Control", "no-store")
                .expectHeader().valueEquals(CorrelationIdWebFilter.HEADER_NAME, "test-correlation-id")
                .expectBody()
                .jsonPath("$[0].id").isEqualTo("2")
                .jsonPath("$[1].id").isEqualTo("3")
                .jsonPath("$[2].id").isEqualTo("4")
                .jsonPath("$[2].availability").isEqualTo(true);
    }

    /** La relación vacía válida se serializa como [] sin llamadas innecesarias. */
    @Test
    void returnsAnEmptyArrayWithoutRequestingDetails() {
        // Given (Dado): dependencias y datos controlados para este escenario.
        when(productCatalog.findSimilarProductIds("empty")).thenReturn(Mono.just(List.of()));

        // When (Cuando): ejecutar la operación bajo las condiciones del escenario.
        webTestClient.get()
                .uri("/product/empty/similar")
                .exchange()
                // Then (Entonces): comprobar resultado, contrato o ausencia de trabajo residual.
                .expectStatus().isOk()
                .expectHeader().valueEquals("Cache-Control", "no-store")
                .expectHeader().exists(CorrelationIdWebFilter.HEADER_NAME)
                .expectBody().json("[]");


        verify(productCatalog, never()).findProductDetail(org.mockito.ArgumentMatchers.anyString());
    }

    /** Un relacionado inexistente mantiene 404 y correlación, en lugar de omitirse. */
    @Test
    void returnsSafeProblemDetailsForRelatedNotFound() {
        // Given (Dado): dependencias y datos controlados para este escenario.
        when(productCatalog.findSimilarProductIds("4")).thenReturn(Mono.just(List.of("5")));
        when(productCatalog.findProductDetail("5")).thenReturn(Mono.error(
                new SimilarProductsException(FailureType.RELATED_PRODUCT_NOT_FOUND)));

        // When (Cuando): ejecutar la operación bajo las condiciones del escenario.
        webTestClient.get()
                .uri("/product/4/similar")
                .header(CorrelationIdWebFilter.HEADER_NAME, "not-found-correlation")
                .exchange()
                // Then (Entonces): comprobar resultado, contrato o ausencia de trabajo residual.
                .expectStatus().isNotFound()
                .expectHeader().contentType("application/problem+json")
                .expectHeader().valueEquals("Cache-Control", "no-store")
                .expectHeader().valueEquals(CorrelationIdWebFilter.HEADER_NAME, "not-found-correlation")
                .expectBody()
                .jsonPath("$.type").isEqualTo("urn:problem-type:similar-products:related-product-not-found")
                .jsonPath("$.status").isEqualTo(404)
                .jsonPath("$.code").isEqualTo("RELATED_PRODUCT_NOT_FOUND")
                .jsonPath("$.correlationId").isEqualTo("not-found-correlation")
                .jsonPath("$.instance").isEqualTo("/product/4/similar");
    }

    /** Producto raíz inexistente y relacionado inexistente tienen categorías distintas. */
    @Test
    void distinguishesTheRequestedProductNotFound() {
        // Given (Dado): dependencias y datos controlados para este escenario.
        when(productCatalog.findSimilarProductIds("unknown")).thenReturn(Mono.error(
                new SimilarProductsException(FailureType.PRODUCT_NOT_FOUND)));

        // When (Cuando): ejecutar la operación bajo las condiciones del escenario.
        webTestClient.get()
                .uri("/product/unknown/similar")
                .exchange()
                // Then (Entonces): comprobar resultado, contrato o ausencia de trabajo residual.
                .expectStatus().isNotFound()
                .expectHeader().contentType("application/problem+json")
                .expectBody()
                .jsonPath("$.type").isEqualTo("urn:problem-type:similar-products:product-not-found")
                .jsonPath("$.code").isEqualTo("PRODUCT_NOT_FOUND")
                .jsonPath("$.detail").isEqualTo("The requested product was not found.");
    }

    /** Error externo no expone cuerpos privados, mensajes internos ni trazas. */
    @Test
    void returnsSafeProblemDetailsForBadUpstreamResponse() {
        // Given (Dado): dependencias y datos controlados para este escenario.
        when(productCatalog.findSimilarProductIds("5")).thenReturn(Mono.just(List.of("6")));
        when(productCatalog.findProductDetail("6")).thenReturn(Mono.error(
                new SimilarProductsException(
                        FailureType.UPSTREAM_BAD_RESPONSE,
                        new IllegalStateException("private upstream body and URL"))));

        // When (Cuando): ejecutar la operación bajo las condiciones del escenario.
        webTestClient.get()
                .uri("/product/5/similar")
                .exchange()
                // Then (Entonces): comprobar resultado, contrato o ausencia de trabajo residual.
                .expectStatus().isEqualTo(502)
                .expectHeader().contentType("application/problem+json")
                .expectHeader().valueEquals("Cache-Control", "no-store")
                .expectBody()
                .jsonPath("$.code").isEqualTo("UPSTREAM_BAD_RESPONSE")
                .jsonPath("$.detail").isEqualTo("A dependency returned a response that cannot be used.")
                .jsonPath("$.correlationId").isNotEmpty()
                .jsonPath("$.message").doesNotExist()
                .jsonPath("$.exception").doesNotExist()
                .jsonPath("$.trace").doesNotExist();
    }

    /** El detalle 10000 agotado produce ProblemDetail 504 sin fallback de éxito. */
    @Test
    void returnsGatewayTimeoutProblemDetails() {
        // Given (Dado): dependencias y datos controlados para este escenario.
        when(productCatalog.findSimilarProductIds("3")).thenReturn(Mono.just(List.of("10000")));
        when(productCatalog.findProductDetail("10000")).thenReturn(Mono.error(
                new SimilarProductsException(FailureType.UPSTREAM_TIMEOUT)));

        // When (Cuando): ejecutar la operación bajo las condiciones del escenario.
        webTestClient.get()
                .uri("/product/3/similar")
                .exchange()
                // Then (Entonces): comprobar resultado, contrato o ausencia de trabajo residual.
                .expectStatus().isEqualTo(504)
                .expectHeader().contentType("application/problem+json")
                .expectHeader().valueEquals("Cache-Control", "no-store")
                .expectBody()
                .jsonPath("$.type").isEqualTo("urn:problem-type:similar-products:upstream-timeout")
                .jsonPath("$.code").isEqualTo("UPSTREAM_TIMEOUT")
                .jsonPath("$.status").isEqualTo(504);
    }

    /** El 429 externo se traduce a indisponibilidad contractual 503. */
    @Test
    void returnsServiceUnavailableProblemDetailsForRateLimit() {
        // Given (Dado): dependencias y datos controlados para este escenario.
        when(productCatalog.findSimilarProductIds("limited")).thenReturn(Mono.error(
                new SimilarProductsException(FailureType.UPSTREAM_RATE_LIMITED)));

        // When (Cuando): ejecutar la operación bajo las condiciones del escenario.
        webTestClient.get()
                .uri("/product/limited/similar")
                .exchange()
                // Then (Entonces): comprobar resultado, contrato o ausencia de trabajo residual.
                .expectStatus().isEqualTo(503)
                .expectHeader().contentType("application/problem+json")
                .expectHeader().valueEquals("Cache-Control", "no-store")
                .expectBody()
                .jsonPath("$.type").isEqualTo("urn:problem-type:similar-products:upstream-rate-limited")
                .jsonPath("$.code").isEqualTo("UPSTREAM_RATE_LIMITED")
                .jsonPath("$.status").isEqualTo(503);
    }

    /** Un ID vacío se rechaza con 400 antes de consultar el puerto. */
    @Test
    void returnsInvalidProductIdProblemDetails() {
        // Given (Dado): dependencias y datos controlados para este escenario.
        // When (Cuando): ejecutar la operación bajo las condiciones del escenario.
        webTestClient.get()
                .uri(builder -> builder.path("/product/{productId}/similar").build(" "))
                .exchange()
                // Then (Entonces): comprobar resultado, contrato o ausencia de trabajo residual.
                .expectStatus().isBadRequest()
                .expectHeader().contentType("application/problem+json")
                .expectBody()
                .jsonPath("$.code").isEqualTo("INVALID_PRODUCT_ID")
                .jsonPath("$.status").isEqualTo(400);


        verify(productCatalog, never()).findSimilarProductIds(org.mockito.ArgumentMatchers.anyString());
    }

    /** POST en endpoint GET devuelve 405 con Allow: GET. */
    @Test
    void returnsContractualMethodNotAllowedProblemDetails() {
        // Given (Dado): dependencias y datos controlados para este escenario.
        // When (Cuando): ejecutar la operación bajo las condiciones del escenario.
        webTestClient.post()
                .uri("/product/1/similar")
                .exchange()
                // Then (Entonces): comprobar resultado, contrato o ausencia de trabajo residual.
                .expectStatus().isEqualTo(405)
                .expectHeader().contentType("application/problem+json")
                .expectHeader().valueEquals("Allow", "GET")
                .expectHeader().valueEquals("Cache-Control", "no-store")
                .expectBody()
                .jsonPath("$.code").isEqualTo("METHOD_NOT_ALLOWED");
    }

    /** Una petición XML mantiene ProblemDetail 406 según contrato. */
    @Test
    void returnsContractualNotAcceptableProblemDetails() {
        // Given (Dado): dependencias y datos controlados para este escenario.
        // When (Cuando): ejecutar la operación bajo las condiciones del escenario.
        webTestClient.get()
                .uri("/product/1/similar")
                .accept(MediaType.APPLICATION_XML)
                .exchange()
                // Then (Entonces): comprobar resultado, contrato o ausencia de trabajo residual.
                .expectStatus().isEqualTo(406)
                .expectHeader().contentType("application/problem+json")
                .expectHeader().valueEquals("Cache-Control", "no-store")
                .expectBody()
                .jsonPath("$.code").isEqualTo("NOT_ACCEPTABLE");
    }

    /** Una excepción inesperada produce 500 seguro sin filtrar estado interno. */
    @Test
    void hidesUnexpectedInternalFailureDetails() {
        // Given (Dado): dependencias y datos controlados para este escenario.
        when(productCatalog.findSimilarProductIds("broken"))
                .thenReturn(Mono.error(new IllegalStateException("secret internal state")));

        // When (Cuando): ejecutar la operación bajo las condiciones del escenario.
        webTestClient.get()
                .uri("/product/broken/similar")
                .exchange()
                // Then (Entonces): comprobar resultado, contrato o ausencia de trabajo residual.
                .expectStatus().isEqualTo(500)
                .expectHeader().contentType("application/problem+json")
                .expectHeader().valueEquals("Cache-Control", "no-store")
                .expectBody()
                .jsonPath("$.code").isEqualTo("INTERNAL_ERROR")
                .jsonPath("$.detail").isEqualTo("An unexpected internal error occurred.")
                .jsonPath("$.message").doesNotExist()
                .jsonPath("$.trace").doesNotExist();
    }

    private ProductDetail product(String id, String name, String price, boolean availability) {
        return new ProductDetail(id, name, new BigDecimal(price), availability);
    }
}
