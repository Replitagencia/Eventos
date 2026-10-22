import { test, expect } from '@playwright/test';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';

const headers = { 'X-Requested-With': 'eventos' };
async function setup({ page, request }, label) {
  await request.post('/api/login', { headers, data: { email: 'admin@test.local', password: 'admin-ui-test-password' } });
  const event = await (await request.post('/api/events', { headers, data: { name: `Escaneo continuo ${label}`, date: '2026-10-22T19:00:00-03:00', location: 'Prueba aislada' } })).json();
  const operators = await (await request.get(`/api/events/${event.id}/operators`)).json();
  await request.put(`/api/events/${event.id}/operators`, { headers, data: { userIds: operators.map(o => o.id) } });
  const qrs = [];
  for (const name of ['Persona Uno', 'Persona Dos']) {
    const guest = await (await request.post(`/api/events/${event.id}/guests`, { headers, data: { name, email: `${name.replaceAll(' ', '').toLowerCase()}@example.com` } })).json();
    const response = await request.get(`/api/events/${event.id}/guests/${guest.id}/qr`);
    const png = PNG.sync.read(await response.body());
    qrs.push(jsQR(new Uint8ClampedArray(png.data), png.width, png.height).data);
  }
  // Solo sustituimos la cámara física. Login, permisos y check-in usan la API real
  // del servidor de pruebas con base en memoria; nunca se toca el sitio publicado.
  await page.route('**/vendor/html5-qrcode.min.js', route => route.fulfill({ contentType: 'application/javascript', body: `
    window.cameraProbe = { starts: 0, stops: 0, holdStart: false };
    window.Html5Qrcode = class {
      async start(config, options, onRead) {
        cameraProbe.starts++;
        cameraProbe.emit = qr => { if (this.isScanning) void onRead(qr); };
        if (cameraProbe.holdStart) await new Promise(resolve => cameraProbe.releaseStart = resolve);
        this.isScanning = true;
        document.querySelector('#reader').textContent = 'Cámara de prueba activa';
      }
      async stop() { cameraProbe.stops++; this.isScanning = false; document.querySelector('#reader').textContent = ''; }
    };
  ` }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/acreditacion/');
  await page.getByLabel('Correo del operario').fill('operator@test.local');
  await page.getByLabel('Contraseña', { exact: true }).fill('operator-ui-test-password');
  await page.getByRole('button', { name: 'Entrar a acreditación' }).click();
  await expect(page.locator('#access-view')).toBeVisible();
  await page.locator('#event-select').selectOption(String(event.id));
  return { event, qrs, path: `/api/operator/events/${event.id}/checkin` };
}
async function emit(page, qr) { await page.evaluate(value => window.cameraProbe.emit(value), qr); }
async function ready(page) { await expect(page.locator('#scan-status')).toContainText('Presenta el siguiente QR'); }

test('dos personas seguidas, QR sostenido, duplicado e inválido sin reiniciar cámara', async ({ page, request }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const { event, qrs, path } = await setup({ page, request }, 'normal');
  let calls = 0, release;
  const pending = new Promise(resolve => release = resolve);
  await page.route(`**${path}`, async route => { if (++calls === 1) await pending; await route.continue(); });
  await page.getByRole('button', { name: 'Activar cámara', exact: true }).click();
  await expect(page.locator('#scan-status')).toContainText('Escaneo automático activo');
  await emit(page, qrs[0]);
  await expect(page.locator('#checkin-result')).toContainText('Validando');
  await expect(page.locator('#checkin-result')).not.toContainText('ACREDITADO');
  await expect(page.getByRole('button', { name: 'Detener cámara' })).toBeEnabled();
  await page.evaluate(([a,b]) => { for(let i=0;i<10;i++) { cameraProbe.emit(a); cameraProbe.emit(b); } }, qrs);
  expect(calls).toBe(1);
  // Mantener el mismo QR delante del lente más allá del tiempo de presentación.
  await page.evaluate(qr => { window.heldQr = setInterval(() => cameraProbe.emit(qr), 80); }, qrs[0]);
  release();
  await expect(page.locator('#checkin-result')).toContainText('ACREDITADO');
  await ready(page);
  await page.waitForTimeout(1900);
  expect(calls).toBe(1);
  await page.evaluate(() => clearInterval(window.heldQr));
  await emit(page, qrs[1]);
  await expect(page.locator('#checkin-result')).toContainText('Persona Dos');
  await expect(page.locator('#checkin-result')).toContainText('ACREDITADO');
  await page.screenshot({ path: 'test-results/escaneo-continuo.png', fullPage: true });
  await ready(page);
  // El mismo QR retirado y presentado de nuevo sí consulta el servidor.
  await page.waitForTimeout(1900);
  await emit(page, qrs[1]);
  await expect(page.locator('#checkin-result')).toContainText('YA INGRESÓ');
  await ready(page);
  await emit(page, 'qr-invalido');
  await expect(page.locator('#checkin-result')).toContainText('QR INVÁLIDO');
  await ready(page);
  expect(await page.evaluate(() => ({ starts: cameraProbe.starts, stops: cameraProbe.stops }))).toEqual({ starts: 1, stops: 0 });
  const events = await (await request.get('/api/events')).json();
  expect(events.find(e => e.id === event.id).checked).toBe(2);
  await page.getByRole('button', { name: 'Detener cámara' }).click();
  await expect(page.locator('#scan-status')).toBeHidden();
  expect(await page.evaluate(() => cameraProbe.stops)).toBe(1);
  expect(errors).toEqual([]);
});

test('respuesta perdida detiene cámara; reintentar conserva el primer ingreso', async ({ page, request }) => {
  const { event, qrs, path } = await setup({ page, request }, 'red');
  await page.route(`**${path}`, async route => { await route.fetch(); await route.abort(); });
  await page.getByRole('button', { name: 'Activar cámara' }).click();
  await emit(page, qrs[0]);
  await expect(page.locator('#checkin-result')).toContainText('INGRESO NO CONFIRMADO');
  await expect(page.getByRole('button', { name: 'Activar cámara' })).toBeVisible();
  expect(await page.evaluate(() => cameraProbe.stops)).toBe(1);
  const before = await (await request.get(`/api/events/${event.id}/guests`)).json();
  await page.unroute(`**${path}`);
  await page.getByRole('button', { name: 'Activar cámara' }).click();
  await emit(page, qrs[0]);
  await expect(page.locator('#checkin-result')).toContainText('YA INGRESÓ');
  const after = await (await request.get(`/api/events/${event.id}/guests`)).json();
  expect(after).toEqual(before);
  await page.getByRole('tab', { name: 'Buscar persona' }).click();
  await page.waitForTimeout(1600);
  expect(await page.evaluate(() => cameraProbe.stops)).toBe(2);
  await expect(page.locator('#scan-status')).toBeHidden();
});

test('detener durante validación y cancelar permiso pendiente no reabren la cámara', async ({ page, request }) => {
  const { qrs, path } = await setup({ page, request }, 'cancelación');
  let release;
  const pending = new Promise(resolve => release = resolve);
  await page.route(`**${path}`, async route => { await pending; await route.continue(); });
  await page.getByRole('button', { name: 'Activar cámara' }).click();
  await emit(page, qrs[0]);
  await expect(page.locator('#checkin-result')).toContainText('Validando');
  await page.getByRole('button', { name: 'Detener cámara' }).click();
  release();
  await expect(page.locator('#checkin-result')).toContainText('ACREDITADO');
  await page.waitForTimeout(1600);
  expect(await page.evaluate(() => ({ starts: cameraProbe.starts, stops: cameraProbe.stops }))).toEqual({ starts: 1, stops: 1 });
  await page.evaluate(() => cameraProbe.holdStart = true);
  await page.getByRole('button', { name: 'Activar cámara' }).click();
  await page.getByRole('tab', { name: 'Buscar persona' }).click();
  await page.evaluate(() => cameraProbe.releaseStart());
  await expect.poll(() => page.evaluate(() => cameraProbe.stops)).toBe(2);
  await expect(page.locator('#scan-status')).toBeHidden();
});

test('revocar permiso o perder conexión apaga la cámara sin registrar ingreso', async ({ page, request }) => {
  const { event, qrs } = await setup({ page, request }, 'permisos');
  await page.getByRole('button', { name: 'Activar cámara' }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.getByRole('button', { name: 'Activar cámara' })).toBeVisible();
  expect(await page.evaluate(() => cameraProbe.stops)).toBe(1);
  await page.getByRole('button', { name: 'Activar cámara' }).click();
  await request.put(`/api/events/${event.id}/operators`, { headers, data: { userIds: [] } });
  await emit(page, qrs[0]);
  await expect(page.locator('#checkin-result')).toContainText('INGRESO NO CONFIRMADO');
  expect(await page.evaluate(() => cameraProbe.stops)).toBe(2);
  const events = await (await request.get('/api/events')).json();
  expect(events.find(e => e.id === event.id).checked).toBe(0);
});
