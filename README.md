# Prueba técnica FullStack — Inditex

Dos aplicaciones independientes: una API que agrega productos similares y una SPA para consultar dispositivos y añadirlos al carrito.

| Aplicación | Tecnologías | Funcionalidad |
|---|---|---|
| [Backend](backend/README.md) | Java 21, Spring Boot, WebFlux | `GET /product/{productId}/similar`, puerto 5000. |
| [Frontend](frontend/README.md) | React, JavaScript, Vite | Catálogo, búsqueda, detalle, opciones y contador de carrito persistente. |

El frontend consume el API externo del enunciado; el backend resuelve una prueba distinta. Ambas aplicaciones se ejecutan por separado.

## Revisar la solución

1. [Resumen técnico](EVALUADOR_LEEME.md): alcance y decisiones principales.
2. [Arquitectura](Documentacion/ARQUITECTURA.md): responsabilidades, alternativas y límites.
3. [Tests y métricas](TESTING_Y_METRICAS.md): comandos de verificación y resultados conservados.
4. [Evidencia frontend](Documentacion/evidencias/frontend/20261007-capturas/README.md): estados y capturas de aceptación.

## Ejecutar las aplicaciones

Frontend: Node 22.13+ de la rama 22 o Node 24+, npm y puerto 5173 libre.

```powershell
Set-Location frontend
npm.cmd ci
npm.cmd start -- --host 127.0.0.1 --port 5173 --strictPort
```

Backend: Docker activo en modo Linux y Compose compatible con `!override`.

```powershell
Set-Location backend
docker compose --project-name inditex-evaluacion -f docker-compose.yaml -f docker-compose.app.yaml up -d --build simulado influxdb grafana yourapp
```

Los comandos anteriores parten de la raíz del repositorio. Para ejecutar ambos, utilizar terminales independientes. En Linux/macOS, usar `npm` en lugar de `npm.cmd`. Las guías de [backend](backend/README.md) y [frontend](frontend/README.md) describen configuración, puertos y parada.

## Versión entregada

La etiqueta [`entrega-original`](https://github.com/LBTXISS/inditex-fullstack/tree/entrega-original) conserva los archivos del ZIP enviado. Los commits posteriores preparan su presentación y las comprobaciones de GitHub; el código de las aplicaciones se mantiene igual.

El manifiesto de cada versión comprueba sus archivos mediante SHA256. Desde la raíz, en PowerShell:

```powershell
.\Documentacion\scripts\Verificar-Manifiesto.ps1 -RutaRaiz .
```

Las evidencias incluidas corresponden a ejecuciones locales documentadas; los nuevos resultados deben revisarse por separado. Las dependencias instaladas y los artefactos generados se excluyen de Git.
