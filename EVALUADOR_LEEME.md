# Resumen técnico

## Solución

Dos aplicaciones independientes:

- **Backend:** Java 21 / Spring Boot WebFlux; agrega productos similares en `GET /product/{productId}/similar`, puerto **5000**.
- **Frontend:** React / JavaScript ES6+ y Vite; catálogo, búsqueda, detalle y carrito. Consume el API del enunciado frontend, no este backend.

Arranque: [backend](backend/README.md) / [frontend](frontend/README.md). Reproducción y evidencia: [testing](TESTING_Y_METRICAS.md).

## Decisiones importantes

**Esperas externas acotadas.** El mock contiene detalles de 5 y 50 segundos y respuestas 404/500. [ExistingProductsWebClientAdapter](backend/src/main/java/com/inditex/similarproducts/adapter/out/http/ExistingProductsWebClientAdapter.java) limita IDs a 1 s y detalles a 6 s. El caso lento válido sigue funcionando; la espera extrema termina con 504.

**Agregación completa y capacidad protegida.** [GetSimilarProductsService](backend/src/main/java/com/inditex/similarproducts/application/service/GetSimilarProductsService.java) conserva orden, deduplica IDs, limita concurrencia a 8 y aplica un presupuesto total de 6,5 s. Pool de 16 conexiones, cola de 64 y adquisición de 300 ms. [SingleFlightRegistry](backend/src/main/java/com/inditex/similarproducts/adapter/out/http/SingleFlightRegistry.java) comparte operaciones simultáneas, sin cachear resultados. El contrato distingue lista vacía, producto ausente, fallo externo y timeout.

**Fronteras verificables.** Arquitectura hexagonal ligera: dominio sin DTO HTTP ni Spring/Jackson; adaptadores validan JSON y traducen errores. Reactor se utiliza en los puertos de aplicación.

**JavaScript con comprobación estática y runtime.** JSDoc/checkJs estricto dan tipos sin fuentes TypeScript; Ajv valida API y Storage. La UI recibe modelos normalizados.

**Caché de una hora absoluta.** [CacheManager](frontend/src/shared/cache/cacheManager.js) exige `storedAt <= ahora < expiresAt` y `expiresAt = storedAt + 3.600.000`. Lecturas no renuevan el TTL; entradas corruptas/vencidas se invalidan. El carrito persiste por separado el contador confirmado y no reintenta POST automáticamente.

El [documento de arquitectura](Documentacion/ARQUITECTURA.md) explica alternativas, cancelación y límites.

## Calidad y evidencia

- **62 tests backend**: unitarias, HTTP real y Testcontainers; JaCoCo 95,05 % líneas / 74,53 % ramas.
- **58 tests frontend**: Vitest/Testing Library; V8 95,83 % líneas / 90,27 % ramas.
- **Seis grupos de aceptación Chrome**, con [19 capturas](Documentacion/evidencias/frontend/20261007-capturas/README.md), API/POST simulados.
- **k6:** última ejecución documentada, 12.200 checks correctos y cero HTTP 500 internos; p95 normal 111,25 ms y extremo 6.265,11 ms.

Las mediciones corresponden al entorno local del 7 de octubre de 2026, no a un SLA productivo. El repositorio incorpora un [workflow de calidad](.github/workflows/calidad.yml); sus resultados actuales se consultan en Actions y se distinguen de estas evidencias históricas. Grafana/Actuator están configurados para uso local.
