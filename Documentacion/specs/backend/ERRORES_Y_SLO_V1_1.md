# Backend v1.1: comportamiento y aceptación

Ámbito: `GET /product/{productId}/similar`. Contrato [OpenAPI](../../../backend/contracts/openapi/similar-products-api-v1.yaml); [decisiones](../../ARQUITECTURA.md). Esta especificación describe la implementación entregada y sus criterios locales de aceptación.

## Éxito y frontera externa

Una respuesta 200 es un array completo de productos válidos con id, name, price y availability. Conserva el orden de similitud y deduplica IDs por primera aparición. Lista externa vacía produce 200 [] sin consultar detalles. Un detalle fallido nunca se omite silenciosamente.

productId es un identificador string no blanco. Los IDs similares externos pueden ser strings no blancos o integers no negativos, convertidos a string decimal. Se rechazan null, booleanos, negativos, decimales y estructuras inesperadas. No se impone un máximo artificial de productos: el buffer, la concurrencia y el plazo acotan el trabajo.

El detalle exige ID coincidente, nombre no blanco, precio numérico no negativo y disponibilidad booleana. La lectura JSON rechaza coerción escalar, claves duplicadas y tokens sobrantes; BigDecimal conserva el precio. Payload vacío, discordante, mal formado o excesivo produce 502. Propiedades adicionales compatibles del proveedor no se convierten en datos de dominio.

## Errores públicos

| Condición | HTTP | Código |
|---|---:|---|
| Identificador inválido | 400 | INVALID_PRODUCT_ID |
| Referencia solicitada ausente | 404 | PRODUCT_NOT_FOUND |
| Detalle relacionado ausente | 404 | RELATED_PRODUCT_NOT_FOUND |
| Estado inesperado o payload externo inválido | 502 | UPSTREAM_BAD_RESPONSE |
| Red/conexión o rate limit externo | 503 | UPSTREAM_UNAVAILABLE / UPSTREAM_RATE_LIMITED |
| Capacidad del pool agotada | 503 | SERVICE_OVERLOADED |
| Timeout individual o global | 504 | UPSTREAM_TIMEOUT |
| Defecto interno inesperado | 500 | INTERNAL_ERROR |

Problem Details no expone cuerpo remoto, trazas ni URLs internas. Respuestas incluyen correlación y Cache-Control: no-store. Esta taxonomía concreta situaciones no detalladas exhaustivamente por el enunciado original.

Si varios detalles fallan dentro del presupuesto, prevalece 504 sobre 503, 502 y 404. No decide el primer paquete de red. Errores locales no recuperables y cancelación del consumidor abortan el trabajo pendiente.

## Presupuestos configurados

| Control | Valor |
|---|---:|
| Conexión / IDs | 1 s |
| Detalle | 6 s |
| Agregado, desde suscripción | 6,5 s |
| Concurrencia por agregado | 8 |
| Pool / cola pendiente | 16 / 64 |
| Espera de adquisición | 300 ms |
| Buffer por respuesta externa | 256 KiB |

El presupuesto global incluye obtener IDs y esperar conexiones; no se añade al final de los detalles. Single-flight comparte operaciones en curso por tipo/ID y libera estado al terminar. Sin caché positiva, retries internos ni Circuit Breaker.

## Aceptación con el fixture

| Referencia | Respuesta |
|---|---|
| 1 | 200; IDs 2,3,4 en ese orden |
| 2 | 200; IDs 3,100,1000, incluido el detalle de 5 s |
| 3 | 504; el detalle de 50 s excede el presupuesto |
| 4 | 404 RELATED_PRODUCT_NOT_FOUND |
| 5 | 502 UPSTREAM_BAD_RESPONSE |

La suite propia de k6 exige resultado semántico >=99 % por caso, p95 <1 s en normal/notFound/error y <7 s en slow/verySlow, cero HTTP500 internos y ausencia de interrupciones al cerrar sus escenarios. El script original se conserva como referencia independiente y puede interrumpir iteraciones por su gracefulStop.

Son umbrales del fixture local, no un SLA productivo ni una prueba de rendimiento con IDs arbitrarios. Cancelar transporte no garantiza que el proveedor detenga su ejecución interna. [Comandos y resultados](../../../TESTING_Y_METRICAS.md).
