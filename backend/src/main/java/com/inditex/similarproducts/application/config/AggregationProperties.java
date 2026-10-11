package com.inditex.similarproducts.application.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.util.Objects;

/**
 * Presupuesto global del agregado y límite de fan-out por petición.
 * @param detailConcurrency máximo de detalles solicitados simultáneamente por agregado
 * @param requestDeadline plazo total, incluyendo consulta de identificadores y detalles
 */
@ConfigurationProperties("aggregation")
public record AggregationProperties(int detailConcurrency, Duration requestDeadline) {

    /**
     * Rechaza configuraciones que permitan concurrencia nula o esperas sin presupuesto.
     * @throws IllegalArgumentException si la concurrencia o el plazo no son positivos
     * @throws NullPointerException si no se configura el plazo
     */
    public AggregationProperties {
        if (detailConcurrency < 1) {
            throw new IllegalArgumentException("aggregation.detail-concurrency must be at least 1");
        }
        Objects.requireNonNull(requestDeadline, "aggregation.request-deadline must be configured");
        if (requestDeadline.isZero() || requestDeadline.isNegative()) {
            throw new IllegalArgumentException("aggregation.request-deadline must be positive");
        }
    }
}
