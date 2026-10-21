import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { openDatabase, bootstrap } from '../src/db.js';
import { createApp } from '../src/app.js';
import { csvCell } from '../src/import.js';

let db, app, server, base, adminCookie, operatorCookie, directory;
const config = { publicUrl: 'http://localhost:3000', secureCookie: false, adminEmail: 'admin@test.local', adminPassword: 'a-secure-admin-password', operatorEmail: 'operator@test.local', operatorPassword: 'a-secure-operator-password', seedDemo: true, mailEnabled: false };
async function request(path, { method = 'GET', body, cookie = adminCookie, headers = {} } = {}) {
  const response = await fetch(`${base}${path}`, { method, headers: { 'X-Requested-With': 'eventos', ...(cookie ? { Cookie: cookie } : {}), ...(body && typeof body !== 'object' ? {} : body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? Buffer.isBuffer(body) ? body : JSON.stringify(body) : undefined });
  const data = response.headers.get('Content-Type')?.includes('application/json') ? await response.json() : await response.text();
  return { status: response.status, data, response };
}
before(async () => {
  directory = mkdtempSync(join(tmpdir(), 'eventos-tests-'));
  db = openDatabase(join(directory, 'test.sqlite')); bootstrap(db, config);
  app = createApp(db, config); server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); }); base = `http://127.0.0.1:${server.address().port}`;
  for (const role of ['admin','operator']) {
    const result = await request('/api/login', { method: 'POST', cookie: '', body: { email: config[`${role}Email`], password: config[`${role}Password`] } });
    assert.equal(result.status, 200); const cookie = result.response.headers.get('set-cookie').split(';')[0];
    if (role === 'admin') adminCookie = cookie; else operatorCookie = cookie;
  }
});
after(async () => { app.locals.closeStreams(); await new Promise(resolve => server.close(resolve)); db.close(); rmSync(directory, { recursive: true, force: true }); });

test('acceso autenticado, roles y protección de origen', async () => {
  assert.equal((await request('/api/events', { cookie: '' })).status, 401);
  assert.equal((await request('/api/events', { method: 'POST', cookie: operatorCookie, body: { name: 'No autorizado' } })).status, 403);
  assert.equal((await request('/api/events/1/report.csv', { cookie: operatorCookie })).status, 403);
  assert.equal((await request('/api/events/1/guests/1/qr', { cookie: operatorCookie })).status, 403);
  assert.equal((await request('/api/events/1/checkin', { method: 'POST', headers: { Origin: 'https://otro.example' }, body: { guestId: 1 } })).status, 403);
  assert.equal((await request('/api/events/1/checkin', { method: 'POST', headers: { 'X-Requested-With': '' }, body: { guestId: 1 } })).status, 403);
});
test('20 solicitudes concurrentes producen exactamente un ingreso y conservan su auditoría', async () => {
  const guest = db.prepare('SELECT * FROM guests WHERE id=1').get();
  const results = await Promise.all(Array.from({ length: 20 }, () => request('/api/events/1/checkin', { method: 'POST', cookie: operatorCookie, body: { qr: `EVT:1:${guest.token}` } })));
  assert.equal(results.filter(r => r.status === 200).length, 1);
  assert.equal(results.filter(r => r.status === 409).length, 19);
  const saved = db.prepare('SELECT * FROM guests WHERE id=1').get();
  assert.equal(saved.checkin_method, 'qr');
  assert.equal(saved.checked_by, db.prepare("SELECT id FROM users WHERE role='operator'").get().id);
  const anotherConnection = openDatabase(join(directory, 'test.sqlite'));
  assert.equal(anotherConnection.prepare('SELECT checked_at FROM guests WHERE id=1').get().checked_at, saved.checked_at);
  anotherConnection.close();
});
test('el QR generado se decodifica y no expone nombre, RUT o correo', async () => {
  const response = await fetch(`${base}/api/events/1/guests/2/qr`, { headers: { Cookie: adminCookie } });
  assert.equal(response.status, 200);
  const png = PNG.sync.read(Buffer.from(await response.arrayBuffer()));
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  assert.match(decoded.data, /^EVT:1:[A-Za-z0-9_-]{43}$/);
  const result = await request('/api/events/1/checkin', { method: 'POST', cookie: operatorCookie, body: { qr: decoded.data } });
  assert.equal(result.status, 200);
});
test('rechaza QR inventado y QR válido de otro evento', async () => {
  const created = await request('/api/events', { method: 'POST', body: { name: 'Segundo evento', date: '2026-10-22T19:00:00-03:00', location: 'Santiago' } });
  const guest = db.prepare('SELECT token FROM guests WHERE id=3').get();
  assert.equal((await request(`/api/events/${created.data.id}/checkin`, { method: 'POST', body: { qr: `EVT:1:${guest.token}` } })).status, 400);
  assert.equal((await request('/api/events/1/checkin', { method: 'POST', body: { qr: 'inventado' } })).status, 400);
  assert.equal(db.prepare('SELECT checked_at FROM guests WHERE id=3').get().checked_at, null);
});
test('acreditación manual se audita y no permite repetir', async () => {
  assert.equal((await request('/api/events/1/checkin', { method: 'POST', cookie: operatorCookie, body: { guestId: 3 } })).status, 200);
  assert.equal((await request('/api/events/1/checkin', { method: 'POST', body: { guestId: 3 } })).status, 409);
  assert.equal(db.prepare('SELECT checkin_method FROM guests WHERE id=3').get().checkin_method, 'manual');
});
test('importa CSV con BOM, acentos, duplicados por correo/RUT y validación atómica', async () => {
  const importFile = text => request('/api/events/1/import', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': 'invitados.csv' }, body: Buffer.from(text) });
  let result = await importFile('\uFEFFnombre;email;rut;empresa\nMaría;MARIA@example.com;12.345.678-9;Agencia\nMaría; maria@example.com;;Agencia\nOtra;otra@example.com;123456789;Agencia');
  assert.equal(result.status, 200); assert.deepEqual(result.data, { imported: 1, duplicates: 2 });
  const before = db.prepare('SELECT COUNT(*) count FROM guests').get().count;
  result = await importFile('nombre,email\nCorrecto,nuevo@example.com\nIncorrecto,sin-correo');
  assert.equal(result.status, 400); assert.match(result.data.error, /Fila 3/);
  assert.equal(db.prepare('SELECT COUNT(*) count FROM guests').get().count, before);
});
test('importa Excel .xlsx y omite duplicados en una segunda carga', async () => {
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Invitados');
  sheet.addRow(['nombre','email','rut','empresa']); sheet.addRow(['José Excel','jose@example.com','','Excel Demo']);
  const body = Buffer.from(await workbook.xlsx.writeBuffer());
  const options = { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': 'invitados.xlsx' }, body };
  assert.deepEqual((await request('/api/events/1/import', options)).data, { imported: 1, duplicates: 0 });
  assert.deepEqual((await request('/api/events/1/import', options)).data, { imported: 0, duplicates: 1 });
});
test('editar invitado valida duplicados y preserva el QR', async () => {
  const guest = db.prepare('SELECT * FROM guests WHERE id=4').get();
  assert.equal((await request('/api/events/1/guests/4', { method: 'PATCH', body: { name: 'Nombre editado', email: guest.email, company: 'Nueva empresa' } })).status, 200);
  assert.equal(db.prepare('SELECT token FROM guests WHERE id=4').get().token, guest.token);
  assert.equal((await request('/api/events/1/guests/4', { method: 'PATCH', body: { name: 'Duplicado', email: 'invitado1@example.com' } })).status, 409);
});
test('reporte incluye hora, operador y neutraliza fórmulas de Excel', async () => {
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('  +1'), '"\'  +1"');
  const result = await request('/api/events/1/report.csv');
  assert.equal(result.status, 200); assert.match(result.data, /Ingreso UTC/); assert.match(result.data, /operator@test.local/);
  assert.match(result.data, /Acreditado/);
});
test('correo deshabilitado no marca invitaciones como enviadas', async () => {
  assert.equal((await request('/api/events/1/guests/5/invite', { method: 'POST' })).status, 409);
  assert.equal(db.prepare('SELECT invitation_status FROM guests WHERE id=5').get().invitation_status, 'pending');
});
test('los operadores reciben cambios en vivo y logout revoca la sesión', async () => {
  const controller = new AbortController();
  const response = await fetch(`${base}/api/live`, { headers: { Cookie: operatorCookie }, signal: controller.signal });
  const reader = response.body.getReader();
  assert.match(new TextDecoder().decode((await reader.read()).value), /data: refresh/);
  await request('/api/events/1/checkin', { method: 'POST', body: { guestId: 6 } });
  assert.match(new TextDecoder().decode((await reader.read()).value), /data: refresh/);
  controller.abort();
  assert.equal((await request('/api/logout', { method: 'POST', cookie: operatorCookie })).status, 200);
  assert.equal((await request('/api/events', { cookie: operatorCookie })).status, 401);
});
