# Evidencia visual de tests frontend

Ejecución **PASS**: 2026-10-07T09:35:39.741Z. Chrome 154.0.8037.98; 19 PNG reales capturados desde el navegador.

Aplicación compilada con Vite preview; API, imágenes y único POST completamente simulados. No se envían altas reales.

[Resultado, aserciones, contadores y SHA256 de cada PNG](resultado.json). Las capturas muestran estados de UI; no sustituyen los tests ni certifican WCAG integral.

[Resultados unitarios JUnit](unit-results.xml) y [resumen de cobertura V8](coverage-summary.json) asociados a esta ejecución: 58 tests, 95,83 % de líneas y 90,27 % de ramas.

La edad de caché se simula modificando sus metadatos; la frontera exacta de una hora se prueba con reloj virtual en las unitarias. Las vistas recuperadas pueden ser visualmente iguales: el nuevo GET se acredita en las aserciones.

tests-coverage.png, si está presente, muestra el HTML real generado por una ejecución previa de tests con cobertura. Ejecutar esa suite antes de test:browser para mantenerlo actualizado.

## Capturas y comprobaciones asociadas

### plp-loading.png

4 skeletons; un status; sin controles ficticios; reduced-motion sin animación.

![4 skeletons](./plp-loading.png)

### plp-foco-teclado.png

skip-link activado con teclado; foco en main-content.

![skip-link activado con teclado](./plp-foco-teclado.png)

### plp-filtro.png

búsqueda Dispositivo 1: una tarjeta; GET de lista sigue en 1.

![búsqueda Dispositivo 1: una tarjeta](./plp-filtro.png)

### plp-sin-resultados.png

mensaje de filtro vacío; cero tarjetas; sin GET adicional.

![mensaje de filtro vacío](./plp-sin-resultados.png)

### plp-1280.png

8 productos: 4 columnas; sin overflow horizontal.

![8 productos: 4 columnas](./plp-1280.png)

### plp-768.png

8 productos: 3 columnas; sin overflow horizontal.

![8 productos: 3 columnas](./plp-768.png)

### plp-390.png

8 productos: 1 columnas; sin overflow horizontal.

![8 productos: 1 columnas](./plp-390.png)

### pdp-loading.png

2 skeletons; un status mientras el detalle sigue pendiente.

![2 skeletons](./pdp-loading.png)

### pdp-seleccion-pendiente.png

submit deshabilitado sin color; unidades de pantalla normalizadas; navegación SPA sin recarga.

![submit deshabilitado sin color](./pdp-seleccion-pendiente.png)

### pdp-1280.png

2 columnas; sin overflow; colorCode=0 seleccionado; storageCode=2000.

![2 columnas](./pdp-1280.png)

### pdp-768.png

2 columnas; sin overflow; colorCode=0 seleccionado; storageCode=2000.

![2 columnas](./pdp-768.png)

### pdp-390.png

1 columnas; sin overflow; colorCode=0 seleccionado; storageCode=2000.

![1 columnas](./pdp-390.png)

### carrito-confirmado.png

POST simulado único y payload exacto; mensaje de éxito; count confirmado=12.

![POST simulado único y payload exacto](./carrito-confirmado.png)

### carrito-persistencia.png

count=12 tras recarga profunda; detalle servido desde caché: GET sigue en 1.

![count=12 tras recarga profunda](./carrito-persistencia.png)

### cache-corrupta-recuperada.png

JSON corrupto invalidado; lista recargada: GET=2; carrito conserva count=12.

![JSON corrupto invalidado](./cache-corrupta-recuperada.png)

### cache-vencida-renovada.png

TTL vencido fuerza GET=3; nueva entrada con TTL absoluto de 3600 s.

![TTL vencido fuerza GET=3](./cache-vencida-renovada.png)

### plp-error.png

HTTP500 simulado; alert visible; sin tarjetas stale; reintento disponible.

![HTTP500 simulado](./plp-error.png)

### plp-reintento.png

GET=5 tras reintento explícito; 8 productos restaurados; carrito conserva count=12.

![GET=5 tras reintento explícito](./plp-reintento.png)

### tests-coverage.png

informe HTML real de cobertura V8; resumen All files.

![informe HTML real de cobertura V8](./tests-coverage.png)
