package com.inditex.similarproducts.adapter.out.http;

import com.inditex.similarproducts.application.error.FailureType;
import com.inditex.similarproducts.application.error.SimilarProductsException;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.util.unit.DataSize;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.test.StepVerifier;

import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

/** Pruebas del contrato, aislamiento de errores y liberación de recursos de esta frontera. */
class ExistingProductsHttpBoundaryIntegrationTest {
    private HttpServer server;

    @AfterEach
    void stopServer() {
        if (server != null) server.stop(0);
    }

    /** HTTP real distingue 404/429/500 y JSON inválido sin depender sólo de un doble WebClient. */
    @ParameterizedTest
    @CsvSource({"500,UPSTREAM_BAD_RESPONSE", "404,RELATED_PRODUCT_NOT_FOUND",
            "429,UPSTREAM_RATE_LIMITED", "200,UPSTREAM_BAD_RESPONSE"})
    void mapsRealHttpFailuresAndMalformedBodies(int status, FailureType expected) throws Exception {
        // Given (Dado): dependencias y datos controlados para este escenario.
        // When (Cuando): ejecutar la operación bajo las condiciones del escenario.
        // Then (Entonces): el helper verifica el fallo/estado esperado y la finalización.
        verifyResponse(status, "{broken", expected);
    }

    /** HTTP real rechaza cuerpo vacío o superior a 256 KiB sin construir dominio inválido. */
    @ParameterizedTest
    @CsvSource({"0", "262145"})
    void rejectsEmptyAndOversizedBodiesOverRealHttp(int size) throws Exception {
        // Given (Dado): dependencias y datos controlados para este escenario.
        // When (Cuando): ejecutar la operación bajo las condiciones del escenario.
        verifyResponse(200, "a".repeat(size), FailureType.UPSTREAM_BAD_RESPONSE);
    }

    private void verifyResponse(int status, String body, FailureType expected) throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/product/2", exchange -> {
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(status, bytes.length == 0 ? -1 : bytes.length);
            if (bytes.length > 0) exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();
        var properties = new ExistingProductsClientProperties(
                URI.create("http://127.0.0.1:" + server.getAddress().getPort()),
                DataSize.ofKilobytes(256), Duration.ofSeconds(1), Duration.ofSeconds(1),
                Duration.ofSeconds(6), 16, 64, Duration.ofMillis(300));
        var adapter = new ExistingProductsWebClientAdapter(WebClient.builder(), properties);
        StepVerifier.create(adapter.findProductDetail("2"))
                // Then (Entonces): comprobar resultado, contrato o ausencia de trabajo residual.
                .expectErrorSatisfies(failure -> assertThat(failure)
                        .isInstanceOfSatisfying(SimilarProductsException.class,
                                known -> assertThat(known.failureType()).isEqualTo(expected)))
                .verify(Duration.ofSeconds(8));
    }
}
