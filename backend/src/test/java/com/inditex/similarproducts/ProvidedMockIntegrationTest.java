package com.inditex.similarproducts;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.testcontainers.containers.BindMode;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.nio.file.Path;
import java.time.Duration;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.influx.InfluxMeterRegistry;
import org.springframework.context.ApplicationContext;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

/** Pruebas del contrato, aislamiento de errores y liberación de recursos de esta frontera. */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@Testcontainers
class ProvidedMockIntegrationTest {

    private static final Path MOCK_DIRECTORY = Path.of("shared", "simulado").toAbsolutePath();

    @Container
    static final GenericContainer<?> SIMULATOR =
            new GenericContainer<>(DockerImageName.parse("ldabiralai/simulado:latest"))
                    .withExposedPorts(80)
                    .withFileSystemBind(MOCK_DIRECTORY.toString(), "/app", BindMode.READ_ONLY)
                    .withCommand("./bin/simulado", "-f", "/app/mocks.json")
                    .waitingFor(Wait.forHttp("/product/1/similarids").forStatusCode(200));

    @Autowired
    private WebTestClient webTestClient;

    @Autowired
    private MeterRegistry meterRegistry;

    @Autowired
    private ApplicationContext applicationContext;

    @DynamicPropertySource
    static void configureSimulator(DynamicPropertyRegistry registry) {
        registry.add("clients.existing-products.base-url",
                () -> "http://" + SIMULATOR.getHost() + ":" + SIMULATOR.getMappedPort(80));
    }

    @BeforeEach
    void allowTheContractualDeadline() {
        webTestClient = webTestClient.mutate().responseTimeout(Duration.ofSeconds(8)).build();
    }

    /** Métricas con URI plantilla evitan cardinalidad por ID y el exportador externo es opt-in. */
    @Test
    void recordsLowCardinalityHttpMetricsWithoutEnablingExternalExportByDefault() {
        // Given (Dado): dependencias y datos controlados para este escenario.
        // Then (Entonces): comprobar resultado, contrato o ausencia de trabajo residual.
        assertThat(applicationContext.getBeansOfType(InfluxMeterRegistry.class)).isEmpty();
        // When (Cuando): ejecutar la operación bajo las condiciones del escenario.
        webTestClient.get().uri("/product/1/similar").exchange()
                .expectStatus().isOk().expectBody().consumeWith(ignored -> { });
        // Observation completes after response writing, not when the controller returns.
        await().atMost(Duration.ofSeconds(2)).untilAsserted(() -> {
            var timer = meterRegistry.find("http.server.requests")
                    .tag("application", "similar-products-service")
                    .tag("uri", "/product/{productId}/similar").timer();
            assertThat(timer).isNotNull();
            assertThat(timer.count()).isPositive();
            assertThat(timer.getId().getTags()).noneMatch(tag ->
                    tag.getKey().equals("productId") || tag.getKey().equals("correlationId"));
        });
    }

    /** Los mocks normales y de 5 segundos conservan orden sin agotamiento del presupuesto. */
    @Test
    void returnsNormalAndSlowAggregatesInSimilarityOrder() {
        // Given (Dado): dependencias y datos controlados para este escenario.
        // When (Cuando): ejecutar la operación bajo las condiciones del escenario.
        webTestClient.get().uri("/product/1/similar").exchange()
                // Then (Entonces): comprobar resultado, contrato o ausencia de trabajo residual.
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$[0].id").isEqualTo("2")
                .jsonPath("$[1].id").isEqualTo("3")
                .jsonPath("$[2].id").isEqualTo("4");

        webTestClient.get().uri("/product/2/similar").exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$[0].id").isEqualTo("3")
                .jsonPath("$[1].id").isEqualTo("100")
                .jsonPath("$[2].id").isEqualTo("1000");
    }

    /** Los mocks 404/500/50 segundos producen 404/502/504, no éxitos parciales. */
    @Test
    void mapsTheProvidedFailureAndExtremeLatencyFixtures() {
        // Given (Dado): dependencias y datos controlados para este escenario.
        // When (Cuando): ejecutar la operación bajo las condiciones del escenario.
        assertProblem("/product/4/similar", 404, "RELATED_PRODUCT_NOT_FOUND");
        assertProblem("/product/5/similar", 502, "UPSTREAM_BAD_RESPONSE");
        assertProblem("/product/3/similar", 504, "UPSTREAM_TIMEOUT");
    }

    private void assertProblem(String uri, int status, String code) {
        webTestClient.get().uri(uri).exchange()
                // Then (Entonces): comprobar resultado, contrato o ausencia de trabajo residual.
                .expectStatus().isEqualTo(status)
                .expectHeader().contentType("application/problem+json")
                .expectHeader().valueEquals("Cache-Control", "no-store")
                .expectHeader().exists("X-Correlation-ID")
                .expectBody()
                .jsonPath("$.status").isEqualTo(status)
                .jsonPath("$.code").isEqualTo(code);
    }
}
