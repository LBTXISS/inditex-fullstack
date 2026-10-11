import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const expectedResultRate = new Rate('expected_result_rate');
const internalServerErrorRate = new Rate('internal_server_error_rate');
const scenarioDuration = new Trend('scenario_duration_ms', true);

const baseUrl = (__ENV.BASE_URL || 'http://host.docker.internal:5000').replace(/\/+$/, '');

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  scenarios: {
    normal: {
      executor: 'constant-vus',
      vus: 200,
      duration: '10s',
      exec: 'normal',
      gracefulStop: '2s',
    },
    notFound: {
      executor: 'constant-vus',
      vus: 200,
      duration: '10s',
      exec: 'notFound',
      gracefulStop: '2s',
      startTime: '10s',
    },
    error: {
      executor: 'constant-vus',
      vus: 200,
      duration: '10s',
      exec: 'error',
      gracefulStop: '2s',
      startTime: '20s',
    },
    slow: {
      executor: 'constant-vus',
      vus: 200,
      duration: '10s',
      exec: 'slow',
      gracefulStop: '10s',
      startTime: '30s',
    },
    verySlow: {
      executor: 'constant-vus',
      vus: 200,
      duration: '10s',
      exec: 'verySlow',
      gracefulStop: '30s',
      startTime: '50s',
    },
  },
  thresholds: {
    'expected_result_rate{case:normal}': ['rate>=0.99'],
    'expected_result_rate{case:notFound}': ['rate>=0.99'],
    'expected_result_rate{case:error}': ['rate>=0.99'],
    'expected_result_rate{case:slow}': ['rate>=0.99'],
    'expected_result_rate{case:verySlow}': ['rate>=0.99'],
    'scenario_duration_ms{case:normal}': ['p(95)<1000'],
    'scenario_duration_ms{case:notFound}': ['p(95)<1000'],
    'scenario_duration_ms{case:error}': ['p(95)<1000'],
    'scenario_duration_ms{case:slow}': ['p(95)<7000'],
    'scenario_duration_ms{case:verySlow}': ['p(95)<7000'],
    internal_server_error_rate: ['rate==0'],
  },
};

/**
 * Convierte JSON inválido en fallo de check, sin interrumpir el escenario.
 * @param {object} response Respuesta k6 de la petición.
 * @returns {unknown} Payload JSON o null si no se puede leer.
 */
function parseJson(response) {
  try {
    return response.json();
  } catch (_error) {
    return null;
  }
}

/**
 * Lee cabeceras sin depender de su capitalización en el transporte.
 * @param {object} response Respuesta k6 con cabeceras.
 * @param {string} name Nombre contractual.
 * @returns {string} Valor o cadena vacía.
 */
function getHeader(response, name) {
  const expectedName = name.toLowerCase();
  const headerNames = Object.keys(response.headers);
  for (let index = 0; index < headerNames.length; index += 1) {
    if (headerNames[index].toLowerCase() === expectedName) {
      return response.headers[headerNames[index]];
    }
  }
  return '';
}

/**
 * Admite parámetros MIME como charset sin aceptar otro tipo base.
 * @param {object} response Respuesta HTTP.
 * @param {string} expected Tipo MIME requerido.
 * @returns {boolean}
 */
function hasContentType(response, expected) {
  const contentType = getHeader(response, 'Content-Type');
  return contentType.toLowerCase().indexOf(expected) === 0;
}

/**
 * Exige correlación y no-store también en errores de dependencia.
 * @param {object} response Respuesta HTTP.
 * @returns {boolean}
 */
function hasCommonHeaders(response) {
  const correlationId = getHeader(response, 'X-Correlation-ID');
  const cacheControl = getHeader(response, 'Cache-Control');
  return correlationId.length > 0 && cacheControl.toLowerCase() === 'no-store';
}

/**
 * Valida tipos públicos sin coerción ni suponer moneda.
 * @param {object} product Producto JSON recibido.
 * @returns {boolean}
 */
function hasValidProduct(product) {
  return product !== null
    && typeof product === 'object'
    && typeof product.id === 'string'
    && product.id.length > 0
    && typeof product.name === 'string'
    && product.name.length > 0
    && typeof product.price === 'number'
    && product.price >= 0
    && typeof product.availability === 'boolean';
}

/**
 * Exige un agregado completo y ordenado; un 200 parcial no es un resultado válido.
 * @param {string} caseName Escenario usado como etiqueta acotada.
 * @param {object} response Respuesta HTTP.
 * @param {string[]} expectedIds Orden contractual de todos los detalles.
 */
function validateSuccess(caseName, response, expectedIds) {
  const body = parseJson(response);
  const valid = response.status === 200
    && hasContentType(response, 'application/json')
    && hasCommonHeaders(response)
    && Array.isArray(body)
    && body.length === expectedIds.length
    && body.every((product, index) => hasValidProduct(product) && product.id === expectedIds[index]);

  check(response, {
    'expected successful aggregate': () => valid,
  }, { case: caseName });

  recordMetrics(caseName, response, valid);
}

/**
 * Un error previsto cumple la prueba sólo con estado y ProblemDetail correctos.
 * @param {string} caseName Escenario de fallo.
 * @param {object} response Respuesta HTTP.
 * @param {number} expectedStatus Estado público requerido.
 * @param {string} expectedCode Categoría pública, sin excepción interna.
 */
function validateProblem(caseName, response, expectedStatus, expectedCode) {
  const body = parseJson(response);
  const valid = response.status === expectedStatus
    && hasContentType(response, 'application/problem+json')
    && hasCommonHeaders(response)
    && body !== null
    && body.status === expectedStatus
    && body.code === expectedCode
    && typeof body.type === 'string'
    && body.type.length > 0
    && typeof body.title === 'string'
    && body.title.length > 0
    && typeof body.detail === 'string'
    && body.detail.length > 0
    && typeof body.instance === 'string'
    && body.instance.length > 0
    && typeof body.correlationId === 'string'
    && body.correlationId.length > 0;

  check(response, {
    'expected safe problem response': () => valid,
  }, { case: caseName });

  recordMetrics(caseName, response, valid);
}

/**
 * Separa errores previstos de 500 inesperados; no etiqueta por ID o correlación.
 * @param {string} caseName Uno de los cinco escenarios.
 * @param {object} response Respuesta medida.
 * @param {boolean} valid Cumplimiento semántico del contrato.
 */
function recordMetrics(caseName, response, valid) {
  const tags = { case: caseName };
  expectedResultRate.add(valid, tags);
  internalServerErrorRate.add(response.status === 500, tags);
  scenarioDuration.add(response.timings.duration, tags);
}

/**
 * Presupuesto del cliente superior al plazo de 6,5 s para medir el 504 de la aplicación.
 * @param {string} productId ID del fixture.
 * @param {string} caseName Escenario con etiqueta estable.
 * @returns {object} Respuesta k6.
 */
function request(productId, caseName) {
  return http.get(`${baseUrl}/product/${productId}/similar`, {
    // k6 0.28.0 (the supplied image) expects this request timeout in milliseconds.
    timeout: 8000,
    tags: { case: caseName },
  });
}

/**
 * Fixture normal: confirma orden y campos sin errores inesperados.
 */
export function normal() {
  // Given (Dado): el fixture original permanece intacto y el escenario usa 200 VUs.
  // When (Cuando): enviar GET al agregado con presupuesto acotado.
  // Then (Entonces): validar contrato y registrar latencia/resultado en las métricas del caso.
  validateSuccess('normal', request('1', 'normal'), ['2', '3', '4']);
  sleep(0.5);
}

/**
 * Un detalle relacionado 404 invalida el agregado, no se omite.
 */
export function notFound() {
  // Given (Dado): el fixture original permanece intacto y el escenario usa 200 VUs.
  // When (Cuando): enviar GET al agregado con presupuesto acotado.
  // Then (Entonces): validar contrato y registrar latencia/resultado en las métricas del caso.
  validateProblem('notFound', request('4', 'notFound'), 404, 'RELATED_PRODUCT_NOT_FOUND');
  sleep(0.5);
}

/**
 * Un 500 externo se aísla como 502 público, no como 500 interno.
 */
export function error() {
  // Given (Dado): el fixture original permanece intacto y el escenario usa 200 VUs.
  // When (Cuando): enviar GET al agregado con presupuesto acotado.
  // Then (Entonces): validar contrato y registrar latencia/resultado en las métricas del caso.
  validateProblem('error', request('5', 'error'), 502, 'UPSTREAM_BAD_RESPONSE');
  sleep(0.5);
}

/**
 * El detalle de 5 s debe completar dentro del plazo contractual.
 */
export function slow() {
  // Given (Dado): el fixture original permanece intacto y el escenario usa 200 VUs.
  // When (Cuando): enviar GET al agregado con presupuesto acotado.
  // Then (Entonces): validar contrato y registrar latencia/resultado en las métricas del caso.
  validateSuccess('slow', request('2', 'slow'), ['3', '100', '1000']);
  sleep(0.5);
}

/**
 * El detalle 10000 de 50 s debe cancelarse y devolver 504 en menos de 7 s.
 */
export function verySlow() {
  // Given (Dado): el fixture original permanece intacto y el escenario usa 200 VUs.
  // When (Cuando): enviar GET al agregado con presupuesto acotado.
  // Then (Entonces): validar contrato y registrar latencia/resultado en las métricas del caso.
  validateProblem('verySlow', request('3', 'verySlow'), 504, 'UPSTREAM_TIMEOUT');
  sleep(0.5);
}
