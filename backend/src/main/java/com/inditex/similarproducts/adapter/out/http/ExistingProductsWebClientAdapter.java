package com.inditex.similarproducts.adapter.out.http;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.ObjectReader;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.inditex.similarproducts.application.error.FailureType;
import com.inditex.similarproducts.application.error.SimilarProductsException;
import com.inditex.similarproducts.application.port.out.ProductCatalogPort;
import com.inditex.similarproducts.domain.ProductDetail;
import io.netty.channel.ChannelOption;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientRequestException;
import reactor.netty.http.client.HttpClient;
import reactor.netty.resources.ConnectionProvider;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

/**
 * Anticorruption layer del catálogo HTTP: valida JSON original antes de crear dominio.
 * Los presupuestos cancelan llamadas lentas; no hay caché de resultados ni fallback de éxito.
 */
@Component("existingProductsWebClientAdapter")
public class ExistingProductsWebClientAdapter implements ProductCatalogPort {

    private final WebClient webClient;
    private final Duration similarIdsTimeout;
    private final Duration detailTimeout;
    // Validate original JSON types without losing decimal precision or accepting concatenated JSON.
    private final ObjectReader payloadReader = new ObjectMapper()
            .enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS)
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
            .enable(DeserializationFeature.FAIL_ON_READING_DUP_TREE_KEY)
            .readerFor(JsonNode.class);

    /**
     * Configura el cliente con el pool gestionado, límite de cuerpo y timeout de conexión.
     * @param webClientBuilder builder de Spring que conserva instrumentación de observaciones
     * @param properties límites del transporte y de cada operación
     * @param connectionProvider pool compartido y liberado por el contexto Spring
     */
    @Autowired
    public ExistingProductsWebClientAdapter(
            WebClient.Builder webClientBuilder,
            ExistingProductsClientProperties properties,
            @Qualifier(ExistingProductsHttpClientConfiguration.CONNECTION_PROVIDER_BEAN)
            ConnectionProvider connectionProvider
    ) {
        this(webClientBuilder, properties, HttpClient.create(connectionProvider));
    }

    ExistingProductsWebClientAdapter(
            WebClient.Builder webClientBuilder,
            ExistingProductsClientProperties properties
    ) {
        this(webClientBuilder, properties, HttpClient.create());
    }

    private ExistingProductsWebClientAdapter(
            WebClient.Builder webClientBuilder,
            ExistingProductsClientProperties properties,
            HttpClient httpClient
    ) {
        int maxResponseBytes = Math.toIntExact(properties.maxResponseSize().toBytes());
        HttpClient configuredHttpClient = httpClient.option(ChannelOption.CONNECT_TIMEOUT_MILLIS,
                Math.toIntExact(properties.connectTimeout().toMillis()));
        this.webClient = webClientBuilder
                .baseUrl(properties.baseUrl().toString())
                .clientConnector(new ReactorClientHttpConnector(configuredHttpClient))
                .codecs(codecs -> codecs.defaultCodecs().maxInMemorySize(maxResponseBytes))
                .build();
        this.similarIdsTimeout = properties.similarIdsTimeout();
        this.detailTimeout = properties.detailTimeout();
    }

    /**
     * Distingue un producto de referencia inexistente de una lista de similares vacía.
     * @param productId identificador externo codificado mediante la plantilla URI
     * @return publicación de datos validados o error tipificado; la expiración cancela el transporte
     */
    @Override
    public Mono<List<String>> findSimilarProductIds(String productId) {
        return webClient.get()
                .uri("/product/{productId}/similarids", productId)
                .retrieve()
                .onStatus(status -> status.value() == 404,
                        response -> failure(response, FailureType.PRODUCT_NOT_FOUND))
                .onStatus(status -> status.value() == 429,
                        response -> failure(response, FailureType.UPSTREAM_RATE_LIMITED))
                .onStatus(HttpStatusCode::isError,
                        response -> failure(response, FailureType.UPSTREAM_BAD_RESPONSE))
                .bodyToMono(String.class)
                .switchIfEmpty(Mono.error(new SimilarProductsException(FailureType.UPSTREAM_BAD_RESPONSE)))
                .map(this::readPayload)
                .map(this::normalizeProductIds)
                // 1 s por defecto: la relación de similares no puede consumir el presupuesto del agregado.
                .timeout(similarIdsTimeout,
                        Mono.error(new SimilarProductsException(FailureType.UPSTREAM_TIMEOUT)))
                .onErrorMap(this::mapClientFailure);
    }

    /**
     * Exige un detalle completo cuyo ID coincida; un relacionado inexistente no se omite.
     * @param productId identificador externo codificado mediante la plantilla URI
     * @return publicación de datos validados o error tipificado; la expiración cancela el transporte
     */
    @Override
    public Mono<ProductDetail> findProductDetail(String productId) {
        return webClient.get()
                .uri("/product/{productId}", productId)
                .retrieve()
                .onStatus(status -> status.value() == 404,
                        response -> failure(response, FailureType.RELATED_PRODUCT_NOT_FOUND))
                .onStatus(status -> status.value() == 429,
                        response -> failure(response, FailureType.UPSTREAM_RATE_LIMITED))
                .onStatus(HttpStatusCode::isError,
                        response -> failure(response, FailureType.UPSTREAM_BAD_RESPONSE))
                .bodyToMono(String.class)
                .switchIfEmpty(Mono.error(new SimilarProductsException(FailureType.UPSTREAM_BAD_RESPONSE)))
                .map(this::readPayload)
                .map(payload -> toDomain(productId, payload))
                // 6 s por defecto: admite el mock de 5 s, pero cancela el producto 10000 de 50 s.
                // El fallback es un error 504 tipificado, nunca datos antiguos ni un agregado parcial.
                .timeout(detailTimeout,
                        Mono.error(new SimilarProductsException(FailureType.UPSTREAM_TIMEOUT)))
                .onErrorMap(this::mapClientFailure);
    }

    private List<String> normalizeProductIds(JsonNode payload) {
        if (!payload.isArray()) {
            throw new SimilarProductsException(FailureType.UPSTREAM_BAD_RESPONSE);
        }

        List<String> normalizedIds = new ArrayList<>(payload.size());
        for (JsonNode rawId : payload) {
            if (rawId.isIntegralNumber() && rawId.canConvertToLong() && rawId.longValue() >= 0) {
                normalizedIds.add(rawId.asText());
            } else if (rawId.isTextual() && !rawId.textValue().isBlank()) {
                normalizedIds.add(rawId.textValue());
            } else {
                throw new SimilarProductsException(FailureType.UPSTREAM_BAD_RESPONSE);
            }
        }
        return List.copyOf(normalizedIds);
    }

    private JsonNode readPayload(String body) {
        try {
            return payloadReader.readValue(body);
        } catch (JsonProcessingException failure) {
            throw new SimilarProductsException(FailureType.UPSTREAM_BAD_RESPONSE, failure);
        }
    }

    private ProductDetail toDomain(String requestedId, JsonNode payload) {
        if (payload == null || !payload.isObject()) {
            throw new SimilarProductsException(FailureType.UPSTREAM_BAD_RESPONSE);
        }
        JsonNode id = payload.path("id");
        JsonNode name = payload.path("name");
        JsonNode price = payload.path("price");
        JsonNode availability = payload.path("availability");
        if (!id.isTextual() || !requestedId.equals(id.textValue())
                || !name.isTextual() || name.textValue().isBlank()
                || !price.isNumber() || price.decimalValue().signum() < 0
                || !availability.isBoolean()) {
            throw new SimilarProductsException(FailureType.UPSTREAM_BAD_RESPONSE);
        }
        return new ProductDetail(id.textValue(), name.textValue(), price.decimalValue(),
                availability.booleanValue());
    }

    private Mono<? extends Throwable> failure(ClientResponse response, FailureType failureType) {
        // Consumir/liberar el cuerpo de error devuelve recursos al pool incluso ante 404/500.
        return response.releaseBody().thenReturn(new SimilarProductsException(failureType));
    }

    private Throwable mapClientFailure(Throwable failure) {
        if (failure instanceof SimilarProductsException) {
            return failure;
        }
        if (isPoolCapacityFailure(failure)) {
            return new SimilarProductsException(FailureType.SERVICE_OVERLOADED, failure);
        }
        if (failure instanceof WebClientRequestException) {
            return new SimilarProductsException(FailureType.UPSTREAM_UNAVAILABLE, failure);
        }
        return new SimilarProductsException(FailureType.UPSTREAM_BAD_RESPONSE, failure);
    }

    private boolean isPoolCapacityFailure(Throwable failure) {
        Throwable current = failure;
        while (current != null) {
            String type = current.getClass().getSimpleName();
            if ("PoolAcquireTimeoutException".equals(type)
                    || "PoolAcquirePendingLimitException".equals(type)) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }

}
