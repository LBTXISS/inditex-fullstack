package com.inditex.similarproducts.adapter.out.http;

import reactor.core.publisher.Mono;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;

/**
 * Coalesce operaciones en curso por clave; nunca conserva resultados finalizados.
 * La baja del último suscriptor cancela el transporte sin perjudicar a otros consumidores.
 */
final class SingleFlightRegistry {

    private final ConcurrentMap<String, Mono<?>> inFlight = new ConcurrentHashMap<>();

    /**
     * Comparte exclusivamente la operación ganadora y retira su clave antes del terminal.
     * @param key clave estable que incluye operación e identificador
     * @param operation creación diferida del trabajo, invocada sólo para el ganador
     * @param <T> resultado de la operación identificada por la clave
     * @return publicación compartida mientras haya suscriptores activos
     */
    <T> Mono<T> execute(String key, Supplier<Mono<T>> operation) {
        return Mono.defer(() -> {
            Mono<?> current = inFlight.get(key);
            if (current != null) {
                return cast(current);
            }

            AtomicReference<Mono<T>> reference = new AtomicReference<>();
            Mono<T> candidate = Mono.defer(operation)
                    // Cleanup precedes terminal signal propagation, so this never becomes a result cache.
                    .doOnSuccess(ignored -> remove(key, reference.get()))
                    .doOnError(ignored -> remove(key, reference.get()))
                    // share() only cancels its source when the last downstream subscriber cancels.
                    .doOnCancel(() -> remove(key, reference.get()))
                    .share();
            reference.set(candidate);

            Mono<?> winner = inFlight.putIfAbsent(key, candidate);
            return winner == null ? candidate : cast(winner);
        });
    }

    /**
     * Expone el número de operaciones pendientes para verificar liberación, no datos cacheados.
     * @return operaciones actualmente registradas
     */
    int size() {
        return inFlight.size();
    }

    private void remove(String key, Mono<?> operation) {
        inFlight.remove(key, operation);
    }

    @SuppressWarnings("unchecked")
    private static <T> Mono<T> cast(Mono<?> operation) {
        return (Mono<T>) operation;
    }
}
