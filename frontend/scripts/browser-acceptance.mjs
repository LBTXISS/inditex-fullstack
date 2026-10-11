import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { build, preview } from 'vite';
import { detailDto } from '../src/test/productFixtures.js';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
// Una carpeta nueva por ejecución evita confundir PNG/resultados de ensayos anteriores.
const evidenceRoot = process.env.ACCEPTANCE_EVIDENCE_DIR || fileURLToPath(new URL(
  `../../Documentacion/evidencias/frontend/run-${new Date().toISOString().replace(/[:.]/g, '-')}/`, import.meta.url));
const checks = [];
const requests = { list: 0, detail: 0, post: 0 };
const errors = [];
const screenshots = [];
const expectedConsoleErrors = [];
let failingListScenario = false;
let failNextList = false;
// Hold mocked responses deterministically: exercise loading without timing-sensitive sleeps.
let releaseList;
let releaseDetail;
const listReady = new Promise((resolve) => { releaseList = resolve; });
const detailReady = new Promise((resolve) => { releaseDetail = resolve; });
let server;
let browser;
let page;
const products = Array.from({ length: 8 }, (_, index) => ({ ...detailDto, id: `device_${index + 1}`, model: `Dispositivo ${index + 1}` }));
const detail = { ...products[0], displayResolution: '7.0 inches', displaySize: '720 x 1280 pixels',
  options: { colors: [{ code: 0, name: 'Negro' }, { code: 1, name: 'Blanco' }], storages: [{ code: 2000, name: '16 GB' }] } };
const image = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="240"><rect x="45" y="10" width="110" height="220" rx="12" fill="#17202a"/><rect x="52" y="25" width="96" height="180" fill="#dfe3e6"/></svg>';

/**
 * Luminancia sRGB de estilos reales para verificar contraste; no es una auditoría WCAG completa.
 * @param {string} rgb Color RGB obtenido de computedStyle.
 * @returns {number} Luminancia normalizada.
 */
function luminance(rgb) {
  const channels = rgb.match(/\d+/g).slice(0, 3).map(Number).map((value) => value / 255).map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}
/**
 * Calcula contraste entre texto y fondo efectivamente renderizados.
 * @param {string} foreground Color RGB del texto.
 * @param {string} background Color RGB del fondo.
 * @returns {number} Relación entre 1 y 21.
 */
function contrast(foreground, background) {
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

/**
 * Guarda píxeles reales de Chrome después de las aserciones y registra su procedencia.
 * La imagen complementa, no sustituye, el resultado ejecutable de cada comprobación.
 * @param {string} filename Nombre PNG dentro del directorio de esta ejecución.
 * @param {string[]} verifiedChecks Aserciones ya comprobadas antes de capturar.
 * @param {import('playwright-core').Page} [targetPage] Página de aplicación o informe.
 * @returns {Promise<void>}
 */
async function captureEvidence(filename, verifiedChecks, targetPage = page) {
  // Normalizar scroll, sin ocultar DOM ni cambiar foco: evita artefactos de elementos fixed.
  await targetPage.evaluate(() => window.scrollTo(0, 0));
  const bytes = await targetPage.screenshot({ path: join(evidenceRoot, filename), fullPage: true });
  screenshots.push({ filename, capturedAt: new Date().toISOString(), url: targetPage.url(),
    viewport: targetPage.viewportSize(), verifiedChecks, bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex') });
}

// Given (Dado): Chrome limpio y API completamente interceptado; ningún POST real.
try {
  await mkdir(evidenceRoot, { recursive: true });
  await build({ root: projectRoot });
  server = await preview({ root: projectRoot, preview: { host: '127.0.0.1', port: 4173, strictPort: true } });
  // Uses an existing Chrome by default; CI can explicitly supply another installed Chromium.
  browser = await chromium.launch(process.env.BROWSER_EXECUTABLE_PATH
    ? { executablePath: process.env.BROWSER_EXECUTABLE_PATH, headless: true }
    : { channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    // Sólo se admite el diagnóstico HTTP500 provocado en el escenario de error.
    if (failingListScenario && /status of 500/.test(message.text())) expectedConsoleErrors.push(message.text());
    else errors.push(message.text());
  });
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === 'http://127.0.0.1:4173') return route.continue();
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (url.pathname === '/api/product') {
      requests.list++;
      if (failNextList) {
        failNextList = false;
        return route.fulfill({ status: 500, json: { error: 'Controlled acceptance failure' }, headers });
      }
      await listReady;
      return route.fulfill({ json: products, headers });
    }
    if (url.pathname.startsWith('/api/product/')) {
      requests.detail++;
      await detailReady;
      assert.equal(decodeURIComponent(url.pathname.split('/').at(-1)), detail.id);
      return route.fulfill({ json: detail, headers });
    }
    if (url.pathname === '/api/cart') {
      requests.post++;
      assert.equal(request.method(), 'POST');
      assert.deepEqual(request.postDataJSON(), { id: detail.id, colorCode: 0, storageCode: 2000 });
      return route.fulfill({ json: { count: 12 }, headers });
    }
    if (request.resourceType() === 'image') return route.fulfill({ contentType: 'image/svg+xml', body: image });
    throw new Error(`Unexpected external request: ${url.origin}${url.pathname}`);
  });

  // Caso PLP: carga accesible, filtro sin HTTP y navegación por teclado/responsive.
  // When (Cuando): abrir el catálogo antes de liberar su respuesta sintética.
  await page.goto('http://127.0.0.1:4173/products', { waitUntil: 'domcontentloaded' });
  await page.locator('.skeleton-card').first().waitFor();
  // Then (Entonces): un solo anuncio, placeholders sin controles y reduced-motion respetado.
  assert.equal(await page.locator('main').getByRole('status').count(), 1);
  assert.equal(await page.locator('.skeleton-card').count(), 4);
  assert.equal(await page.locator('[aria-hidden="true"] a, [aria-hidden="true"] button').count(), 0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('.skeleton').first().evaluate((element) => getComputedStyle(element).animationName), 'none');
  await captureEvidence('plp-loading.png', ['4 skeletons', 'un status', 'sin controles ficticios', 'reduced-motion sin animación']);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  assert.equal(await page.locator('.skeleton').first().evaluate((element) => getComputedStyle(element).animationName), 'skeleton-pulse');
  releaseList();
  await page.getByText('Dispositivo 8', { exact: true }).waitFor();
  assert.equal(await page.locator('.product-card').count(), 8);
  const navigationToken = await page.evaluate(() => { window.__acceptanceToken = 'same-document'; return window.__acceptanceToken; });
  await page.getByRole('link', { name: 'Ir al catálogo' }).focus();
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.className), 'skip-link');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'main-content');
  await captureEvidence('plp-foco-teclado.png', ['skip-link activado con teclado', 'foco en main-content']);
  await page.getByRole('searchbox').fill('Dispositivo 1');
  assert.equal(await page.locator('.product-card').count(), 1);
  assert.equal(requests.list, 1);
  await captureEvidence('plp-filtro.png', ['búsqueda Dispositivo 1: una tarjeta', 'GET de lista sigue en 1']);
  await page.getByRole('searchbox').fill('modelo-inexistente');
  assert.equal(await page.locator('.product-card').count(), 0);
  await page.getByText('No hay productos que coincidan', { exact: false }).waitFor();
  assert.equal(requests.list, 1);
  await captureEvidence('plp-sin-resultados.png', ['mensaje de filtro vacío', 'cero tarjetas', 'sin GET adicional']);
  await page.getByRole('searchbox').fill('');
  const palette = await page.locator('.eyebrow').evaluate((element) => ({ text: getComputedStyle(element).color, background: getComputedStyle(document.documentElement).backgroundColor }));
  assert.ok(contrast(palette.text, palette.background) >= 4.5);

  for (const width of [1280, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.locator('.product-grid').evaluate((element) => ({ columns: getComputedStyle(element).gridTemplateColumns.split(' ').length, overflow: document.documentElement.scrollWidth > innerWidth }));
    assert.equal(layout.columns, width === 1280 ? 4 : width === 768 ? 3 : 1);
    assert.equal(layout.overflow, false);
    await captureEvidence(`plp-${width}.png`, [`8 productos: ${layout.columns} columnas`, 'sin overflow horizontal']);
  }
  checks.push('PLP: 8 productos, filtro sin red, skip-link/teclado, 4/3/1 columnas y sin overflow en 1280/768/390');

  // Caso PDP: navegación SPA, selección explícita y código cero válido.
  // Given (Dado): varios colores, un almacenamiento y respuesta de detalle retenida.
  // When (Cuando): navegar con teclado sin crear un documento nuevo.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('link', { name: /Acer Dispositivo 1/ }).focus();
  await page.keyboard.press('Enter');
  await page.locator('.skeleton-card').first().waitFor();
  assert.equal(await page.locator('main').getByRole('status').count(), 1);
  assert.equal(await page.locator('.skeleton-card').count(), 2);
  await captureEvidence('pdp-loading.png', ['2 skeletons', 'un status mientras el detalle sigue pendiente']);
  releaseDetail();
  await page.getByRole('heading', { name: 'Dispositivo 1' }).waitFor();
  assert.equal(await page.locator('.specifications > div').filter({ has: page.getByText('Resolución', { exact: true }) }).locator('dd').innerText(), '720 x 1280 pixels');
  assert.equal(await page.locator('.specifications > div').filter({ has: page.getByText('Tamaño de pantalla', { exact: true }) }).locator('dd').innerText(), '7.0 inches');
  assert.equal(await page.evaluate(() => window.__acceptanceToken), navigationToken);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'main-content');
  const button = page.getByRole('button', { name: 'Añadir al carrito' });
  assert.equal(await button.isDisabled(), true);
  await captureEvidence('pdp-seleccion-pendiente.png', ['submit deshabilitado sin color', 'unidades de pantalla normalizadas', 'navegación SPA sin recarga']);
  await page.getByLabel('Color', { exact: true }).focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  assert.equal(await page.getByLabel('Color', { exact: true }).inputValue(), '0');
  assert.equal(await page.getByLabel('Almacenamiento').inputValue(), '2000');
  for (const width of [1280, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.locator('.product-detail').evaluate((element) => ({ columns: getComputedStyle(element).gridTemplateColumns.split(' ').length, overflow: document.documentElement.scrollWidth > innerWidth }));
    assert.equal(layout.columns, width === 390 ? 1 : 2);
    assert.equal(layout.overflow, false);
    await captureEvidence(`pdp-${width}.png`, [`${layout.columns} columnas`, 'sin overflow', 'colorCode=0 seleccionado', 'storageCode=2000']);
  }
  // When (Cuando): confirmar un alta simulada y después recargar.
  await button.focus();
  await page.keyboard.press('Enter');
  await page.getByText('Producto añadido al carrito.', { exact: true }).waitFor();
  // Then (Entonces): POST único, contador confirmado y persistencia/caché tras recarga.
  assert.equal(requests.post, 1);
  assert.equal(await page.getByLabel('12 productos en el carrito').count(), 1);
  await captureEvidence('carrito-confirmado.png', ['POST simulado único y payload exacto', 'mensaje de éxito', 'count confirmado=12']);
  await page.reload();
  await page.getByRole('heading', { name: 'Dispositivo 1' }).waitFor();
  assert.equal(requests.detail, 1);
  assert.equal(await page.getByLabel('12 productos en el carrito').count(), 1);
  await captureEvidence('carrito-persistencia.png', ['count=12 tras recarga profunda', 'detalle servido desde caché: GET sigue en 1']);
  await page.getByRole('link', { name: 'Volver al catálogo' }).click();
  await page.getByText('Dispositivo 8', { exact: true }).waitFor();
  assert.equal(requests.list, 1);
  checks.push('PDP: ruta SPA sin recarga, main con foco, opciones/submit con teclado, POST exacto, count=12, recarga profunda con caché y persistencia');
  checks.push('Skeletons PLP/PDP con red pendiente: un status por vista, sin controles ficticios, reduced-motion sin animación');

  // Caso storage: JSON corrupto y entrada vencida deben recargar, no restaurar stale.
  // Given (Dado): identificar sólo la entrada GET de lista, sin tocar el carrito.
  const listCacheKey = await page.evaluate(() => Object.keys(localStorage).find((key) =>
    key.startsWith('itx:api-cache:v2:') && Array.isArray(JSON.parse(localStorage.getItem(key)).data)));
  assert.ok(listCacheKey);
  // When (Cuando): corromper JSON y reiniciar la página para vaciar la memoria del manager.
  await page.evaluate((key) => localStorage.setItem(key, '{invalid-json'), listCacheKey);
  await page.reload();
  await page.getByText('Dispositivo 8', { exact: true }).waitFor();
  // Then (Entonces): un nuevo GET y restauración válida, sin perder count confirmado.
  assert.equal(requests.list, 2);
  assert.equal(await page.getByLabel('12 productos en el carrito').count(), 1);
  assert.ok(await page.evaluate((key) => Array.isArray(JSON.parse(localStorage.getItem(key)).data), listCacheKey));
  await captureEvidence('cache-corrupta-recuperada.png', ['JSON corrupto invalidado', 'lista recargada: GET=2', 'carrito conserva count=12']);
  // When (Cuando): simular edad >=3600 s mediante metadatos, no esperar una hora física.
  await page.evaluate((key) => {
    const entry = JSON.parse(localStorage.getItem(key));
    entry.storedAt = Date.now() - 3_600_000;
    entry.expiresAt = entry.storedAt + 3_600_000;
    localStorage.setItem(key, JSON.stringify(entry));
  }, listCacheKey);
  await page.reload();
  await page.getByText('Dispositivo 8', { exact: true }).waitFor();
  assert.equal(requests.list, 3);
  assert.ok(await page.evaluate((key) => {
    const entry = JSON.parse(localStorage.getItem(key));
    return entry.expiresAt === entry.storedAt + 3_600_000 && Date.now() < entry.expiresAt;
  }, listCacheKey));
  await captureEvidence('cache-vencida-renovada.png', ['TTL vencido fuerza GET=3', 'nueva entrada con TTL absoluto de 3600 s']);
  checks.push('Storage: JSON corrupto y TTL vencido fuerzan GET nuevos; contador de carrito preservado');

  // Caso proveedor: fallo HTTP500 controlado, error visible y reintento explícito.
  // Given (Dado): invalidar sólo la lista y provocar exactamente una respuesta fallida.
  failingListScenario = true;
  failNextList = true;
  await page.evaluate((key) => localStorage.removeItem(key), listCacheKey);
  // When (Cuando): recargar sin caché, con API completamente interceptada.
  await page.reload();
  await page.getByRole('alert').getByText('No hemos podido cargar el catálogo.', { exact: true }).waitFor();
  // Then (Entonces): no mostrar datos viejos; reintento vuelve a una lista válida.
  assert.equal(requests.list, 4);
  assert.equal(await page.locator('.product-card').count(), 0);
  await captureEvidence('plp-error.png', ['HTTP500 simulado', 'alert visible', 'sin tarjetas stale', 'reintento disponible']);
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await page.getByText('Dispositivo 8', { exact: true }).waitFor();
  assert.equal(requests.list, 5);
  assert.equal(await page.getByLabel('12 productos en el carrito').count(), 1);
  await captureEvidence('plp-reintento.png', ['GET=5 tras reintento explícito', '8 productos restaurados', 'carrito conserva count=12']);
  failingListScenario = false;
  checks.push('HTTP500 simulado: error accesible sin stale y reintento correcto; sin POST adicionales');

  // Evidencia opcional de tests unitarios: HTML real generado por Vitest/V8, no pantalla inventada.
  let coverageSummarySha256;
  try {
    const summary = await readFile(join(projectRoot, 'coverage/coverage-summary.json'));
    coverageSummarySha256 = createHash('sha256').update(summary).digest('hex');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (coverageSummarySha256) {
    const reportContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    // El informe usa sólo archivos locales; bloquear cualquier acceso de red.
    await reportContext.route('**/*', (route) => new URL(route.request().url()).protocol === 'file:'
      ? route.continue() : route.abort());
    const reportPage = await reportContext.newPage();
    await reportPage.goto(pathToFileURL(join(projectRoot, 'coverage/index.html')).href);
    assert.equal(await reportPage.locator('h1').innerText(), 'All files');
    await captureEvidence('tests-coverage.png', ['informe HTML real de cobertura V8', 'resumen All files'], reportPage);
    await reportContext.close();
  }

  // Caso de calidad: presupuesto gzip y ausencia de errores en consola del navegador.
  const assets = await readdir(`${projectRoot}/dist/assets`);
  let jsGzip = 0;
  let cssGzip = 0;
  for (const asset of assets) {
    const size = gzipSync(await readFile(`${projectRoot}/dist/assets/${asset}`)).length;
    if (asset.endsWith('.js')) jsGzip += size;
    if (asset.endsWith('.css')) cssGzip += size;
  }
  assert.ok(jsGzip <= 150000 && cssGzip <= 5000);
  assert.deepEqual(errors, []);
  checks.push('Sin errores inesperados de consola/pageerror; contraste eyebrow >=4.5:1; JS gzip <=150 kB y CSS gzip <=5 kB');
  assert.equal(requests.post, 1);
  await writeFile(`${evidenceRoot}/resultado.json`, JSON.stringify({ status: 'PASS', executedAt: new Date().toISOString(),
    browser: browser.version(), checks, requests, jsGzip, cssGzip, errors, expectedConsoleErrors, screenshots,
    coverageSummarySha256, scope: 'Chrome local, preview producción, API/imágenes/POST simulados; TTL envejecido por metadatos; no WCAG integral ni smoke remoto' }, null, 2));
  // Índice regenerable: permite revisar las imágenes sin adivinar el escenario.
  const gallery = [
    '# Evidencia visual de tests frontend',
    `Ejecución **PASS**: ${new Date().toISOString()}. Chrome ${browser.version()}; ${screenshots.length} PNG reales capturados desde el navegador.`,
    'Aplicación compilada con Vite preview; API, imágenes y único POST completamente simulados. No se envían altas reales.',
    '[Resultado, aserciones, contadores y SHA256 de cada PNG](resultado.json). Las capturas muestran estados de UI; no sustituyen los tests ni certifican WCAG integral.',
    'La edad de caché se simula modificando sus metadatos; la frontera exacta de una hora se prueba con reloj virtual en las unitarias. Las vistas recuperadas pueden ser visualmente iguales: el nuevo GET se acredita en las aserciones.',
    'tests-coverage.png, si está presente, muestra el HTML real generado por una ejecución previa de tests con cobertura. Ejecutar esa suite antes de test:browser para mantenerlo actualizado.',
    '## Capturas y comprobaciones asociadas',
    ...screenshots.map((shot) => `### ${shot.filename}\n\n${shot.verifiedChecks.join('; ')}.\n\n![${shot.verifiedChecks[0]}](./${shot.filename})`),
  ].join('\n\n');
  await writeFile(join(evidenceRoot, 'README.md'), gallery + '\n');
  process.stdout.write(`Aceptación navegador correcta: ${checks.length} grupos de comprobaciones. Evidencias: ${evidenceRoot}\n`);
} catch (error) {
  await page?.screenshot({ path: `${evidenceRoot}/fallo.png`, fullPage: true });
  await writeFile(`${evidenceRoot}/resultado.json`, JSON.stringify({ status: 'FAIL', executedAt: new Date().toISOString(),
    checks, requests, errors, screenshots, failure: error.message }, null, 2));
  process.stderr.write(`${JSON.stringify({ requests, errors, body: await page?.locator('body').innerText() })}\n`);
  throw error;
} finally {
  releaseList();
  releaseDetail();
  await browser?.close();
  await new Promise((resolve, reject) => server ? server.httpServer.close((error) => error ? reject(error) : resolve()) : resolve());
}
