# Contratos API

| Archivo | Responsabilidad |
|---|---|
| [similar-products-api-v1.yaml](openapi/similar-products-api-v1.yaml) | API pública implementada: respuesta agregada, validación y Problem Details. |
| [existing-products-consumer-v1.yaml](openapi/existing-products-consumer-v1.yaml) | Frontera del proveedor: tipos, normalización y errores HTTP. |
| [similarProducts.yaml](../similarProducts.yaml) | Contrato original suministrado, conservado sin cambios. |
| [existingApis.yaml](../existingApis.yaml) | Contrato original del proveedor, conservado sin cambios. |

La [especificación de errores y SLO](../../Documentacion/specs/backend/ERRORES_Y_SLO_V1_1.md) define la semántica vigente; coincide con la referencia `x-slo-specification` del contrato público.

La API conserva la ruta y el formato de éxito originales. Explicita validación de ID, errores, correlation ID y `Cache-Control: no-store`. El consumidor acepta IDs string o integer no negativo porque los mocks difieren del tipo declarado originalmente. Sólo el adaptador normaliza esos valores: el dominio no recibe DTOs HTTP ni tipos ambiguos.

## Validación

Desde esta carpeta, con Node 24 y npm:

~~~powershell
npm.cmd ci
npm.cmd run lint
~~~

Redocly CLI **2.59.0** fijado por lockfile. Comprueba OpenAPI, referencias, schemas, ejemplos y reglas de diseño. `redocly.yaml` mantiene reglas recomendadas, salvo la advertencia contra localhost: los puertos locales pertenecen al contrato de la prueba.

No se requiere generación de código para arrancar el servicio. Los modelos de transporte están separados del dominio. [Arquitectura](../../Documentacion/ARQUITECTURA.md) · [Suite de pruebas](../../TESTING_Y_METRICAS.md)
