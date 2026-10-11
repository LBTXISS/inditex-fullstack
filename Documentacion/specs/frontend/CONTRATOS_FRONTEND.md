# Frontend: contratos, estado y aceptación

SPA React / JavaScript ES6+ con dos vistas principales y carrito compartido. Consume `https://itx-frontend-test.onrender.com/api`, independiente del backend de productos similares. [Arquitectura](../../ARQUITECTURA.md) y [schemas ejecutables](../../../frontend/contracts/schemas).

## API y modelos

| Operación | Regla |
|---|---|
| GET /product | Validar array y DTO; normalizar modelo de catálogo. |
| GET /product/:id | ID coincidente y opciones válidas; normalizar atributos de detalle. |
| POST /cart | Payload exacto id/colorCode/storageCode; aceptar count entero seguro no negativo. |

IDs opacos se codifican con encodeURIComponent. Ajv valida sin coerción; modelos normalizados se congelan y no exponen DTO arbitrarios a la UI. JSDoc/checkJs comprueban JavaScript, sin fuentes TS emitidas.

El precio se presenta como número no negativo o no disponible, sin inventar moneda. Se normalizan aliases conocidos y campos escalares/arrays admitidos. Resolución/tamaño se intercambian sólo cuando ambos valores prueban unidades invertidas; si no hay evidencia suficiente, no se inventa el atributo. Opciones requieren códigos únicos y pertenencia al detalle vigente; código cero es válido.

Timeout HTTP por defecto: 20.000 ms, incluida lectura del cuerpo. HTTPS excepto loopback de desarrollo; configuración válida entre 1 y 60.000 ms. Credenciales omitidas. Errores HTTP, red, timeout y contrato se presentan con mensajes seguros.

## Caché GET de una hora

Namespace `itx:api-cache:v2`; claves por método/API base/recurso/ID. Lista y cada detalle tienen entradas independientes.

1. Consultar memoria o persistencia y validar versión, clave, timestamps y modelo.
2. Sólo aceptar `storedAt <= ahora < expiresAt` y `expiresAt = storedAt + 3.600.000`.
3. Invalidar inmediatamente entradas corruptas/vencidas antes de cargar. No servir stale si falla la red.
4. Compartir una promesa en vuelo por clave; eliminarla tras éxito o error.
5. Tras GET correcto y modelo válido, medir storedAt, guardar memoria y persistir best-effort. Leer no renueva el TTL.

En 3.599.999 ms hay hit; en 3.600.000 ms hay miss. Errores y POST no se cachean. Storage bloqueado/cuota no rompen la sesión; si guardar falla, no se promete persistencia tras recarga.

El hook retira datos vencidos, pasa a loading y revalida. Foco/visibility revisan vencimiento y retroceso de reloj; cleanup retira timers/listeners y evita respuestas tardías sobre una ruta nueva. Suspensión puede retrasar timers: la garantía es validación temporal al leer/reanudar, no ejecución física al milisegundo ni reloj anti-manipulación.

## Carrito y selección

Registro separado `itx:cart:v1`, sin TTL GET. Un registro válido restaura count; corrupción recupera cero sin eliminar el catálogo. El count confirmado puede disminuir: no se interpreta como incremento local.

Selectores: una opción se preselecciona; varias requieren elección; cero bloquea alta y explica indisponibilidad. Formulario idle → sending → success/error, con bloqueo síncrono del doble submit y snapshot de ID/opciones al enviar.

CartStore serializa comandos y sólo persiste count tras respuesta válida. Error conserva count y selección. Un comando terminado después de navegar puede actualizar el contador global, no mensajes de otra ficha. No hay retry ni abort automático de POST: el servidor puede haber aplicado una solicitud cuya respuesta se perdió. Sin endpoint de consulta/idempotency key no se puede resolver esa incertidumbre ni garantizar exactamente una vez.

No hay sincronización multipestaña ni almacenamiento de secretos.

## Vistas y estados

- / redirige a /products; router, breadcrumb y header con contador compartido.
- Catálogo: loading/success/error; distinguir lista vacía de filtro sin coincidencias. Búsqueda local por marca/modelo, ignorando mayúsculas y diacríticos, sin GET adicional.
- Detalle: ruta por ID, imagen/atributos/opciones y vuelta al catálogo. Cambio de ID descarta respuestas anteriores y reinicia formulario; revalidación reinicia opciones.
- Skeletons anuncian carga una vez y no crean controles ficticios; reduced-motion desactiva animación.
- Skip-link, tarjetas, selectores y submit funcionan con teclado; cambio de ruta enfoca main. Imagen fallida muestra fallback. ErrorBoundary cubre render, no errores de eventos/promesas.

## Aceptación entregada

58 unitarias/componente verifican contratos, normalización, TTL exacto, Storage, concurrencia, count y UI. Seis grupos Chrome comprueban SPA/teclado/responsive, detalle/carrito, skeletons, corrupción/vencimiento, error/reintento y consola/contraste/bundle. API e imágenes están interceptadas; el POST es simulado.

La [galería](../../evidencias/frontend/20261007-capturas/README.md) conserva 19 PNG y sus aserciones. La edad vencida en navegador se introduce por metadatos; la frontera exacta usa reloj virtual en unitarias. No equivale a auditoría WCAG completa, hosting productivo ni disponibilidad del API externo.
