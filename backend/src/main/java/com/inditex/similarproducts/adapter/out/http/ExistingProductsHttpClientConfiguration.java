package com.inditex.similarproducts.adapter.out.http;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import reactor.netty.resources.ConnectionProvider;

/**
 * Gestiona un pool único para que todas las peticiones compartan el mismo límite de recursos.
 */
@Configuration(proxyBeanMethods = false)
class ExistingProductsHttpClientConfiguration {

    static final String CONNECTION_PROVIDER_BEAN = "existingProductsConnectionProvider";

    /**
     * Libera el pool al cerrar Spring; la cola acotada evita acumular espera bajo carga.
     * @param properties límites de conexiones y de espera
     * @return pool compartido con métricas de capacidad
     */
    @Bean(name = CONNECTION_PROVIDER_BEAN, destroyMethod = "dispose")
    ConnectionProvider existingProductsConnectionProvider(ExistingProductsClientProperties properties) {
        return ConnectionProvider.builder("existing-products")
                // 16 conexiones y 64 pendientes por defecto: rechazo acotado, no cola ilimitada.
                .maxConnections(properties.maxConnections())
                .pendingAcquireMaxCount(properties.pendingAcquireMaxCount())
                .pendingAcquireTimeout(properties.pendingAcquireTimeout())
                .metrics(true)
                .build();
    }
}
