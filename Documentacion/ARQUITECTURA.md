# Decisiones de arquitectura

## Alcance y contratos

El backend agrega datos de un proveedor existente; el frontend consume otro API. No hay integración artificial entre ambas pruebas ni persistencia de catálogo en el servidor.

Los contratos OpenAPI y JSON Schema describen las fronteras; las especificaciones concretan comportamiento y los tests verifican escenarios. Las decisiones siguientes corresponden al código entregado.

- [Contrato público backend](../backend/contracts/openapi/similar-products-api-v1.yaml).
- [Contrato consumidor](../backend/contracts/openapi/existing-products-consumer-v1.yaml).
- [Errores y presupuestos backend](specs/backend/ERRORES_Y_SLO_V1_1.md).
- [Estado, caché y carrito frontend](specs/frontend/CONTRATOS_FRONTEND.md).

## Backend: hexagonal ligera

El [controller](../backend/src/main/java/com/inditex/similarproducts/adapter/in/web/SimilarProductsController.java) traduce HTTP; el [caso de uso](../backend/src/main/java/com/inditex/similarproducts/application/service/GetSimilarProductsService.java) decide orden y resultado; el [puerto de catálogo](../backend/src/main/java/com/inditex/similarproducts/application/port/out/ProductCatalogPort.java) describe la dependencia; el [adaptador HTTP](../backend/src/main/java/com/inditex/similarproducts/adapter/out/http/ExistingProductsWebClientAdapter.java) conoce URLs, payloads y errores externos.

La inversión de dependencias permite probar agregación sin red y transporte con HTTP real. El dominio ProductDetail no depende de Spring/Jackson ni de DTO externos. Reactor pertenece a los puertos de aplicación: no se pretende independencia absoluta de frameworks.

Se eligió WebFlux por la agregación I/O-bound y la cancelación composable. Un cliente imperativo con límites adecuados también podría resolver el problema; no se atribuye rendimiento ilimitado a la programación reactiva.

## Backend: duración, concurrencia y fallos

| Control | Valor | Motivo |
|---|---:|---|
| Conexión / consulta de IDs | 1 s | No agotar el presupuesto antes del fan-out. |
| Cada detalle | 6 s | Admitir el fixture de 5 s y cancelar el de 50 s. |
| Agregado completo | 6,5 s | Acotar IDs, colas y varias tandas de detalles. |
| Detalles por agregado | 8 | Limitar amplificación manteniendo concurrencia. |
| Conexiones / cola del pool | 16 / 64 | Contener recursos compartidos del transporte. |
| Adquisición de conexión | 300 ms | Rechazar sobrecarga con 503 sin espera ilimitada. |
| Respuesta externa | 256 KiB | Evitar buffers sin límite. |

flatMapSequential inicia detalles concurrentemente y conserva el orden de similitud. Los IDs se deduplican por primera aparición. El resultado es completo o error; una ausencia de datos no se oculta como lista parcial.

Los fallos conocidos se materializan y comparan con precedencia estable: timeout, indisponibilidad/rate limit, respuesta inválida y relacionado ausente. Un defecto propio, cancelación o rechazo local de capacidad aborta el flujo. El 500 externo se traduce a 502; los errores públicos son Problem Details seguros, con correlación y Cache-Control: no-store.

Mono.timeout cancela la suscripción al vencer. No equivale a un Circuit Breaker ni garantiza detener trabajo interno ya iniciado en el proveedor. Un breaker compartido podría rechazar productos sanos por el fallo persistente de otro ID; uno por ID añadiría estado de cardinalidad no acotada. Para este fixture se optó por presupuestos, límites y single-flight, sin retries ni caché de datos antiguos.

[SingleFlightRegistry](../backend/src/main/java/com/inditex/similarproducts/adapter/out/http/SingleFlightRegistry.java) comparte una operación viva por tipo/ID. Elimina la clave al terminar; cancelar un consumidor no cancela a los restantes, pero cancelar el último libera el origen. No sirve resultados de operaciones ya terminadas. El pool no limita todas las solicitudes entrantes: el benchmark con pocos IDs favorece esta coalescencia y no prueba cargas de alta cardinalidad.

## Frontend: contratos y modelos

Se entrega JavaScript/JSX, siguiendo la preferencia del enunciado. JSDoc y checkJs estricto/noEmit comprueban llamadas, props y genéricos; TypeScript sólo actúa como herramienta de desarrollo. Ajv valida JSON real, porque los tipos estáticos no validan una respuesta HTTP.

La organización por funcionalidades mantiene UI, repositorio, cliente HTTP, caché y carrito con responsabilidades separadas. Los modelos normalizados e inmutables evitan propagar tipos inconsistentes. La inversión de resolución/tamaño sólo se corrige con evidencia conjunta de píxeles y unidades físicas; los datos inconcluyentes se presentan como no disponibles.

## Frontend: frescura y comandos

[CacheManager](../frontend/src/shared/cache/cacheManager.js) aplica cache-aside y TTL absoluto: sirve un GET válido o carga/valida/almacena el recurso. El timestamp empieza después de la carga correcta; leer no lo desplaza. Storage inaccesible degrada a memoria y errores no se cachean.

[useCachedResource](../frontend/src/shared/cache/useCachedResource.js) retira datos vencidos, revalida al recuperar foco y descarta actualizaciones de consumidores desmontados. Servir Stale-While-Revalidate después de la hora violaría este contrato. Los timers pueden retrasarse en una pestaña suspendida; las lecturas y la reanudación verifican fechas.

[CartStore](../frontend/src/features/cart/cartStore.js) serializa comandos y persiste el count confirmado, sin TTL GET ni incremento optimista. La pantalla protege el doble submit. No hay retry automático de POST: perder la respuesta no demuestra que el servidor no haya aplicado el alta. No se promete idempotencia ni sincronización multipestaña.

La búsqueda filtra marca/modelo en memoria y no lanza HTTP; useMemo evita recomputaciones ajenas al filtro. No se añadió debounce sin un cuello de botella demostrado.

## Observabilidad y calidad

Micrometer/Actuator exportan HTTP/JVM a Influx existente, opt-in y con etiquetas de baja cardinalidad. El exportador está fuera del dominio y no condiciona la respuesta de negocio; [caída](evidencias/observabilidad/metrics-outage.json) y [recuperación](evidencias/observabilidad/metrics-recovery.json) se comprobaron localmente. Puede perderse telemetría durante una caída.

Los tests separan reglas de negocio, transporte real y navegador. El [workflow de calidad](../.github/workflows/calidad.yml) trabaja desde la raíz del repositorio y ejecuta integridad, backend con Docker y frontend con Chromium. La etiqueta `entrega-original` conserva las plantillas por aplicación incluidas en el ZIP. La [guía de testing](../TESTING_Y_METRICAS.md) contiene comandos, evidencia y límites.
