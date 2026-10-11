# Frontend — Arranque local

Requisitos: Node **22.13+ de la rama 22 o 24+**, npm y puerto 5173 libre. Ejecutar desde esta carpeta.

~~~powershell
npm.cmd ci
npm.cmd start -- --host 127.0.0.1 --port 5173 --strictPort
~~~

Abrir http://127.0.0.1:5173. `strictPort` evita arrancar silenciosamente en otro puerto. Detener Vite con Ctrl+C. En otros shells, usar `npm` en lugar de `npm.cmd`.

Esta SPA consume el **API externo del enunciado**, no el backend de productos similares en 5000; ambas pruebas se ejecutan de forma independiente.

## Configuración

Sin configuración adicional se utilizan los valores siguientes. Para cambiarlos, copiar `.env.example` a `.env.local` y reiniciar Vite.

| Variable | Valor por defecto |
|---|---|
| VITE_API_BASE_URL | https://itx-frontend-test.onrender.com/api |
| VITE_API_TIMEOUT_MS | 20000 |

La URL exige HTTPS salvo localhost/127.0.0.1 de desarrollo. Timeout entero entre 1 y 60000 ms. Las variables `VITE_*` se incorporan al cliente: **no incluir secretos**.

## Build y hosting

~~~powershell
npm.cmd run build
~~~

Servir el contenido de `dist` con fallback de rutas a `index.html`, incluido `/product/:productId`. La compilación no publica la aplicación.

[Tests, linter, checkJs y capturas de navegador](../TESTING_Y_METRICAS.md) · [Resumen de la solución](../EVALUADOR_LEEME.md)
