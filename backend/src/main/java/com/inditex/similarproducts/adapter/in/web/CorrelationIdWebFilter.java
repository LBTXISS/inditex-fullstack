package com.inditex.similarproducts.adapter.in.web;

import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

import java.util.UUID;

/**
 * Propaga correlación segura para diagnóstico sin convertirla en etiqueta de métricas.
 * Una entrada no válida se sustituye por UUID; los caracteres de control no se reflejan.
 */
@Component
public class CorrelationIdWebFilter implements WebFilter {

    /**
     * Cabecera pública compartida por respuestas correctas y ProblemDetails.
     */
    public static final String HEADER_NAME = "X-Correlation-ID";

    /**
     * Asocia la misma correlación al intercambio y a la respuesta, también en errores.
     * @param exchange intercambio HTTP que recibe el contexto de correlación
     * @param chain resto de filtros reactivos
     * @return finalización del intercambio, sin suscripciones ni bloqueos adicionales
     */
    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        String correlationId = normalize(exchange.getRequest().getHeaders().getFirst(HEADER_NAME));
        exchange.getResponse().getHeaders().set(HEADER_NAME, correlationId);
        exchange.getAttributes().put(HEADER_NAME, correlationId);
        return chain.filter(exchange);
    }

    private String normalize(String candidate) {
        if (candidate != null) {
            String trimmed = candidate.trim();
            if (!trimmed.isEmpty() && trimmed.length() <= 64 && hasOnlySafeCharacters(trimmed)) {
                return trimmed;
            }
        }
        return UUID.randomUUID().toString();
    }

    private boolean hasOnlySafeCharacters(String value) {
        return value.chars().allMatch(character -> character >= 33 && character <= 126);
    }
}
