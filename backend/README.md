# Backend — Arranque local

Ejecutar desde esta carpeta. Puertos: **5000** (aplicación), 3001 (simulador), 8086 (InfluxDB) y 3000 (Grafana). Deben estar libres; no detener procesos ajenos para liberarlos.

## Docker

Requisitos: Docker activo en modo Linux y Compose compatible con `!override`. Este arranque compila con el JDK del Dockerfile; no requiere Java instalado en el host.

~~~powershell
docker compose --project-name inditex-evaluacion -f docker-compose.yaml -f docker-compose.app.yaml up -d --build simulado influxdb grafana yourapp
~~~

Esperar `status: UP` en http://127.0.0.1:5000/actuator/health. API: http://127.0.0.1:5000/product/1/similar. Grafana: http://127.0.0.1:3000.

El primer build descarga imágenes y dependencias. Consultar errores con:

~~~powershell
docker compose --project-name inditex-evaluacion -f docker-compose.yaml -f docker-compose.app.yaml logs --tail 100 yourapp simulado
~~~

## Alternativa: proceso Java local

Requisitos adicionales: **JDK 21 y JAVA_HOME apuntando a JDK 21**. Maven Wrapper incluido. No ejecutar simultáneamente con el contenedor `yourapp` en 5000.

~~~powershell
docker compose --project-name inditex-evaluacion -f docker-compose.yaml -f docker-compose.app.yaml up -d simulado
.\mvnw.cmd spring-boot:run
~~~

Linux/macOS: usar `./mvnw spring-boot:run` y conceder permiso de ejecución a `mvnw` si el ZIP no lo conserva. La validación de esta entrega se realizó en Windows.

## Variables de entorno

| Variable | Valor por defecto |
|---|---|
| SERVER_PORT | 5000 |
| CLIENTS_EXISTING_PRODUCTS_BASE_URL | http://localhost:3001 |
| CLIENTS_EXISTING_PRODUCTS_MAX_RESPONSE_SIZE | 256KB |
| CLIENTS_EXISTING_PRODUCTS_CONNECT_TIMEOUT | 1s |
| CLIENTS_EXISTING_PRODUCTS_SIMILAR_IDS_TIMEOUT | 1s |
| CLIENTS_EXISTING_PRODUCTS_DETAIL_TIMEOUT | 6s |
| CLIENTS_EXISTING_PRODUCTS_MAX_CONNECTIONS | 16 |
| CLIENTS_EXISTING_PRODUCTS_PENDING_ACQUIRE_MAX_COUNT | 64 |
| CLIENTS_EXISTING_PRODUCTS_PENDING_ACQUIRE_TIMEOUT | 300ms |
| AGGREGATION_DETAIL_CONCURRENCY | 8 |
| AGGREGATION_REQUEST_DEADLINE | 6500ms |
| METRICS_INFLUX_ENABLED | false |
| METRICS_INFLUX_URI | http://localhost:8086 |

El override usa `http://simulado:80` y activa exportación a Influx por DNS Docker. En Java local se mantienen los valores por defecto; por ejemplo, `$env:METRICS_INFLUX_ENABLED = 'true'` habilita métricas contra Influx local si está arrancado. No cambiar 5000 para la prueba suministrada.

## Parada

~~~powershell
docker compose --project-name inditex-evaluacion -f docker-compose.yaml -f docker-compose.app.yaml stop yourapp simulado influxdb grafana
~~~

Para el proceso Java local: Ctrl+C. La parada no borra imágenes ni volúmenes.

[Guía de tests y carga](../TESTING_Y_METRICAS.md) · [Resumen de la solución](../EVALUADOR_LEEME.md)
