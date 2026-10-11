package com.inditex.similarproducts.adapter.in.web;

import com.inditex.similarproducts.application.error.FailureType;
import com.inditex.similarproducts.application.error.SimilarProductsException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.HttpMethod;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.MethodNotAllowedException;
import org.springframework.web.server.NotAcceptableStatusException;

import java.net.URI;

/**
 * Traduce fallos a ProblemDetails seguros y no cacheables, conservando correlación.
 * Las causas internas permanecen fuera de la respuesta y los mensajes de log.
 */
@RestControllerAdvice
public class ApiErrorHandler {

    private static final Logger LOGGER = LoggerFactory.getLogger(ApiErrorHandler.class);
    private static final String PROBLEM_TYPE_PREFIX = "urn:problem-type:similar-products:";

    /**
     * Publica la categoría pactada sin filtrar la causa técnica.
     */
    @ExceptionHandler(SimilarProductsException.class)
    ResponseEntity<ProblemDetail> handleKnownFailure(
            SimilarProductsException exception,
            ServerWebExchange exchange
    ) {
        return response(exception.failureType(), exchange);
    }

    /**
     * Registra sólo clase, ruta y correlación; no publica estado interno.
     */
    @ExceptionHandler(Throwable.class)
    ResponseEntity<ProblemDetail> handleUnexpectedFailure(
            Throwable exception,
            ServerWebExchange exchange
    ) {
        String correlationId = correlationId(exchange);
        LOGGER.error("Unexpected error processing path={} correlationId={} errorType={}",
                exchange.getRequest().getPath().value(),
                correlationId,
                exception.getClass().getName());
        return response(FailureType.INTERNAL_ERROR, exchange);
    }

    /**
     * Mantiene el contrato 405 y la cabecera Allow: GET.
     */
    @ExceptionHandler(MethodNotAllowedException.class)
    ResponseEntity<ProblemDetail> handleMethodNotAllowed(
            MethodNotAllowedException exception,
            ServerWebExchange exchange
    ) {
        return response(FailureType.METHOD_NOT_ALLOWED, exchange);
    }

    /**
     * Mantiene el contrato 406 aunque se solicite un formato no soportado.
     */
    @ExceptionHandler(NotAcceptableStatusException.class)
    ResponseEntity<ProblemDetail> handleNotAcceptable(
            NotAcceptableStatusException exception,
            ServerWebExchange exchange
    ) {
        return response(FailureType.NOT_ACCEPTABLE, exchange);
    }

    private ResponseEntity<ProblemDetail> response(FailureType failureType, ServerWebExchange exchange) {
        String correlationId = correlationId(exchange);
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatusCode.valueOf(failureType.status()), failureType.detail());
        problem.setType(URI.create(PROBLEM_TYPE_PREFIX + failureType.problemType()));
        problem.setTitle(failureType.title());
        problem.setInstance(URI.create(exchange.getRequest().getURI().getRawPath()));
        problem.setProperty("code", failureType.name());
        problem.setProperty("correlationId", correlationId);

        ResponseEntity.BodyBuilder builder = ResponseEntity.status(failureType.status())
                .contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .cacheControl(CacheControl.noStore())
                .header(CorrelationIdWebFilter.HEADER_NAME, correlationId);
        if (failureType == FailureType.METHOD_NOT_ALLOWED) {
            builder.allow(HttpMethod.GET);
        }
        return builder.body(problem);
    }

    private String correlationId(ServerWebExchange exchange) {
        return exchange.getAttributeOrDefault(CorrelationIdWebFilter.HEADER_NAME, "unknown");
    }
}
