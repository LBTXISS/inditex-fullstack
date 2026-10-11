# Testing y métricas

Comandos para **PowerShell**, desde la raíz de esta entrega. Requisitos: Docker en modo Linux, Compose compatible con `!override`, Node 22.13+ de la rama 22 o 24+ y npm. Para tests Maven locales: **JDK 21 y JAVA_HOME apuntando a ese JDK**. Validación realizada en Windows; no se atribuye ejecución en otras plataformas.

## 1. Backend y contratos

Docker debe estar activo para Testcontainers. La suite completa no omite la integración si falta el motor.

~~~powershell
Set-Location .\backend
.\mvnw.cmd -B -ntp clean verify
npm.cmd --prefix .\contracts ci
npm.cmd --prefix .\contracts run lint
Set-Location ..
~~~

Referencia: **62 tests, 0 fallos, 0 errores, 0 omitidos**. Reportes nuevos: `backend/target/surefire-reports` y `backend/target/site/jacoco/index.html`. [Informe JaCoCo conservado](Documentacion/evidencias/release/jacoco.xml).

Para ejecutar únicamente el caso de uso o la integración, desde `backend`:

~~~powershell
.\mvnw.cmd '-Dtest=GetSimilarProductsServiceTest' test
.\mvnw.cmd '-Dtest=ExistingProductsHttpBoundaryIntegrationTest,ProvidedMockIntegrationTest' test
~~~

En Linux/macOS, usar `./mvnw` y conceder permiso de ejecución si el ZIP no lo conserva.

## 2. Aplicación e infraestructura

Reservar **5000, 3001, 8086 y 3000**. Si están ocupados, identificar el proceso antes de continuar: no detener servicios ajenos. Usar siempre ambos archivos Compose y el mismo nombre de proyecto.

~~~powershell
Set-Location .\backend
docker compose --project-name inditex-evaluacion -f docker-compose.yaml -f docker-compose.app.yaml up -d --build simulado influxdb grafana yourapp
if ($LASTEXITCODE -ne 0) { throw 'Fallo de arranque Docker.' }

# Ventana de 120 segundos; cada petición está también acotada.
$ready = $false
$healthWait = [Diagnostics.Stopwatch]::StartNew()
while ($healthWait.Elapsed.TotalSeconds -lt 120) {
    try {
        $ready = (Invoke-RestMethod -Uri http://127.0.0.1:5000/actuator/health -TimeoutSec 2).status -eq 'UP'
    } catch { $ready = $false }
    if ($ready) { break }
    Start-Sleep -Seconds 1
}
if (-not $ready) {
    docker compose --project-name inditex-evaluacion -f docker-compose.yaml -f docker-compose.app.yaml logs --tail 100 yourapp
    throw 'Backend no disponible dentro de la ventana de arranque.'
}
1..3 | ForEach-Object {
    Invoke-RestMethod -Uri http://127.0.0.1:5000/product/1/similar -TimeoutSec 8 | Out-Null
}
~~~

El override configura DNS interno, métricas y bindings a loopback. No arrancar además el proceso Maven en 5000. El arranque frontend es independiente: [instrucciones](frontend/README.md).

## 3. Carga k6

Desde `backend`, ejecutar **secuencialmente**. Cada comando dura varios minutos; no lanzar ambas cargas a la vez.

~~~powershell
# Perfil original, sin modificar.
docker compose --project-name inditex-evaluacion -f docker-compose.yaml -f docker-compose.app.yaml run --rm k6 run --summary-export=/evidence/k6-original-evaluacion.json /scripts/test.js
if ($LASTEXITCODE -ne 0) { throw 'Revisar la ejecución k6 original.' }

# Aceptación contractual propia: cinco escenarios, 200 VUs por caso y 11 umbrales.
docker compose --project-name inditex-evaluacion -f docker-compose.yaml -f docker-compose.app.yaml run --rm -e BASE_URL=http://yourapp:5000 k6 run --summary-export=/evidence/k6-aceptacion-evaluacion.json /scripts/test-acceptance-v1.js
if ($LASTEXITCODE -ne 0) { throw 'La aceptación k6 no cumple sus umbrales.' }
Set-Location ..
~~~

Los nuevos resúmenes se escriben en `Documentacion/evidencias/backend-contenedor`. El original llama a `host.docker.internal:5000`; la aceptación usa `yourapp:5000`. El perfil original puede interrumpir iteraciones al cerrar su ventana: conservar ese diagnóstico, no modificarlo para ocultarlo.

| Caso | Respuesta contractual | Umbral p95 propio | p95 de referencia |
|---|---|---|---|
| normal | 200; agregado completo y ordenado | < 1.000 ms | 111,25 ms |
| notFound | 404 RELATED_PRODUCT_NOT_FOUND | < 1.000 ms | 7,94 ms |
| error | 502 UPSTREAM_BAD_RESPONSE | < 1.000 ms | 8,54 ms |
| slow | 200; conserva el detalle de 5 s | < 7.000 ms | 5.013,04 ms |
| verySlow | 504 UPSTREAM_TIMEOUT; deja de esperar el detalle de 50 s | < 7.000 ms | 6.265,11 ms |

La aceptación exige **éxito semántico ≥ 99 % por caso y cero HTTP 500 internos**. Los 404/502/504 previstos no son fallos contractuales; tampoco se promete ausencia de respuestas 5xx.

Ejecución conservada del **7 de octubre de 2026**: 12.200 checks correctos y ninguna iteración interrumpida en la aceptación propia. [Resumen original](Documentacion/evidencias/backend-contenedor/k6-original-senior.json) y [aceptación](Documentacion/evidencias/backend-contenedor/k6-aceptacion-senior.json). Las latencias dependen del equipo; el fixture con pocos IDs favorece single-flight y no demuestra capacidad equivalente para miles de IDs diferentes.

## 4. Grafana y observabilidad

Seleccionar un rango que incluya la carga, por ejemplo los últimos 15 minutos:

- [Aceptación k6](http://127.0.0.1:3000/d/itx-acceptance): cuatro paneles con éxito contractual, p95 rápidos/lentos y HTTP 500 internos; verdes cuando se cumplen los umbrales.
- [HTTP/JVM](http://127.0.0.1:3000/d/itx-application): respuestas por estado e intervalo y heap JVM. La publicación Micrometer es cada 10 s; esperar unos 20 s. Un contador por intervalo no equivale a RPS instantáneo.

[Captura real de k6](assets/grafana-results.png) y [captura HTTP/JVM](assets/application-metrics.png): referencias históricas, no resultado automático de una nueva ejecución. La [caída de Influx](Documentacion/evidencias/observabilidad/metrics-outage.json) y su [recuperación](Documentacion/evidencias/observabilidad/metrics-recovery.json) se comprobaron sin caída del API; no prueban ausencia de pérdida de telemetría.

Grafana anónimo y Actuator están configurados para **uso local**, no exposición pública.

## 5. Frontend: calidad, cobertura y navegador

~~~powershell
Set-Location .\frontend
npm.cmd ci
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test -- --coverage
npm.cmd run build
# Chrome instalado; preview en 4173. API, imágenes y POST interceptados.
npm.cmd run test:browser
Set-Location ..
~~~

Referencia: **58 tests / 13 archivos**, ESLint, checkJs y build correctos; V8 **95,83 % de líneas y 90,27 % de ramas**. Reportes nuevos en `frontend/coverage`; build en `frontend/dist`.

La [galería de evidencia](Documentacion/evidencias/frontend/20261007-capturas/README.md) reúne **19 capturas reales de Chrome**: responsive, teclado, skeletons, filtro, detalle, carrito, caché, error/reintento y cobertura. Se acompañan de [aserciones y hashes](Documentacion/evidencias/frontend/20261007-capturas/resultado.json), [JUnit](Documentacion/evidencias/frontend/20261007-capturas/unit-results.xml) y [resumen V8](Documentacion/evidencias/frontend/20261007-capturas/coverage-summary.json).

La aceptación conservada se ejecutó a las 09:35:39.741 UTC del 7 de octubre de 2026: seis grupos correctos, sin errores de consola inesperados. El HTTP 500 provocado se registra aparte. No certifica WCAG completa ni disponibilidad del API externo.

Sin `ACCEPTANCE_EVIDENCE_DIR`, cada ejecución de navegador crea una carpeta `run-fecha-UTC` nueva bajo `Documentacion/evidencias/frontend`. Ejecutar antes las unitarias con cobertura: la captura abre su HTML real. La expiración se simula envejeciendo metadatos; las unitarias prueban exactamente 3.599.999/3.600.000 ms. Las aserciones de red, no la apariencia de una imagen, acreditan la invalidación.

## 6. Parada e integridad

Detener sólo el proyecto de evaluación; no borrar volúmenes ni imágenes:

~~~powershell
Set-Location .\backend
docker compose --project-name inditex-evaluacion -f docker-compose.yaml -f docker-compose.app.yaml stop yourapp simulado influxdb grafana
Set-Location ..
~~~

Comprobar la copia extraída **antes** de modificar sus fuentes o sustituir evidencias:

~~~powershell
.\Documentacion\scripts\Verificar-Manifiesto.ps1 -RutaRaiz .
~~~

El manifiesto comprueba tamaño y SHA256 de los archivos entregados. No certifica corrección funcional ni incluye los artefactos nuevos que produzcan builds o tests. Las evidencias históricas se conservan sin retoques; los resultados de cada nueva ejecución deben revisarse por separado.
