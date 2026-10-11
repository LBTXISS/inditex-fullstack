package com.inditex.similarproducts.adapter.out.http;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.util.unit.DataSize;

import java.net.URI;
import java.time.Duration;
import java.util.Objects;

/**
 * Límites del cliente HTTP externo; evita conexiones, colas o cuerpos sin cota.
 * @param baseUrl origen del catálogo externo, configurable por entorno
 * @param maxResponseSize máximo de cuerpo almacenado en memoria por respuesta
 * @param connectTimeout presupuesto de establecimiento de conexión
 * @param similarIdsTimeout presupuesto completo de la consulta de identificadores
 * @param detailTimeout presupuesto completo de un detalle, incluida lectura del cuerpo
 * @param maxConnections máximo de conexiones activas del pool compartido
 * @param pendingAcquireMaxCount máximo de solicitantes en cola del pool
 * @param pendingAcquireTimeout plazo de espera por capacidad antes de responder sobrecarga
 */
@ConfigurationProperties("clients.existing-products")
public record ExistingProductsClientProperties(
        URI baseUrl,
        DataSize maxResponseSize,
        Duration connectTimeout,
        Duration similarIdsTimeout,
        Duration detailTimeout,
        int maxConnections,
        int pendingAcquireMaxCount,
        Duration pendingAcquireTimeout
) {

    /**
     * Falla al arrancar si falta un límite obligatorio o si se configura una cota no positiva.
     * @throws NullPointerException si falta una propiedad obligatoria
     * @throws IllegalArgumentException si algún límite no es positivo
     */
    public ExistingProductsClientProperties {
        Objects.requireNonNull(baseUrl, "clients.existing-products.base-url must be configured");
        Objects.requireNonNull(maxResponseSize, "clients.existing-products.max-response-size must be configured");
        requirePositive(connectTimeout, "clients.existing-products.connect-timeout");
        requirePositive(similarIdsTimeout, "clients.existing-products.similar-ids-timeout");
        requirePositive(detailTimeout, "clients.existing-products.detail-timeout");
        requirePositive(pendingAcquireTimeout, "clients.existing-products.pending-acquire-timeout");
        if (maxResponseSize.isNegative() || maxResponseSize.toBytes() == 0) {
            throw new IllegalArgumentException("clients.existing-products.max-response-size must be positive");
        }
        if (maxConnections < 1) {
            throw new IllegalArgumentException("clients.existing-products.max-connections must be positive");
        }
        if (pendingAcquireMaxCount < 1) {
            throw new IllegalArgumentException(
                    "clients.existing-products.pending-acquire-max-count must be positive");
        }
    }

    private static void requirePositive(Duration value, String property) {
        Objects.requireNonNull(value, property + " must be configured");
        if (value.isZero() || value.isNegative()) {
            throw new IllegalArgumentException(property + " must be positive");
        }
    }
}
