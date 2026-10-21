import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import nodemailer from 'nodemailer';
import { openDatabase, bootstrap } from '../src/db.js';
import { createApp } from '../src/app.js';
import { csvCell } from '../src/import.js';

let db, app, server, base, adminCookie, operatorCookie, directory;
const deliveries = [];
let rejectMail = false;
const config = { publicUrl: 'http://localhost:3000', secureCookie: false, adminEmail: 'admin@test.local', adminPassword: 'a-secure-admin-password', operatorEmail: 'operator@test.local', operatorPassword: 'a-secure-operator-password', seedDemo: true, mailEnabled: false };
async function request(path, { method = 'GET', body, cookie = adminCookie, headers = {} } = {}) {
  const response = await fetch(`${base}${path}`, { method, headers: { 'X-Requested-With': 'eventos', ...(cookie ? { Cookie: cookie } : {}), ...(body && typeof body !== 'object' ? {} : body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? Buffer.isBuffer(body) ? body : JSON.stringify(body) : undefined });
  const data = response.headers.get('Content-Type')?.includes('application/json') ? await response.json() : await response.text();
  return { status: response.status, data, response };
}
before(async () => {
  directory = mkdtempSync(join(tmpdir(), 'eventos-tests-'));
  db = openDatabase(join(directory, 'test.sqlite')); bootstrap(db, config);
  app = createApp(db, config, { sendMail: async message => {
    if (rejectMail) throw new Error('Simulated SMTP rejection');
    const rendered = await nodemailer.createTransport({ streamTransport: true, buffer: true }).sendMail(message);
    deliveries.push({ message, mime: rendered.message.toString() });
    return { accepted: [message.to], messageId: rendered.messageId };
  } }); server = app.listen(0, '127.0.0.1');
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
  assert.equal((await request('/api/events/1/guests/1/detail', { cookie: operatorCookie })).status, 403);
  assert.equal((await request('/api/events/1/email-report.csv', { cookie: operatorCookie })).status, 403);
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
test('vista previa privada y primer correo incluyen el mismo QR, sin registro previo ni doble envío', async () => {
  const path = '/api/events/1/guests/7';
  assert.equal((await request(`${path}/invitation-preview`, { cookie: '' })).status, 401);
  assert.equal((await request(`${path}/invitation-preview`, { cookie: operatorCookie })).status, 403);
  assert.equal((await request('/api/events/999/guests/7/invitation-preview')).status, 404);
  const preview = await request(`${path}/invitation-preview`);
  assert.equal(preview.status, 200);
  assert.match(preview.data.html, /Hola, Antonia Díaz/);
  assert.match(preview.data.html, /Santiago/);
  assert.equal(preview.data.to, 'invitado7@example.com');
  const previewImage = preview.data.html.match(/src="data:image\/png;base64,([^"]+)"/)[1];
  const png = PNG.sync.read(Buffer.from(previewImage, 'base64'));
  const qr = jsQR(new Uint8ClampedArray(png.data), png.width, png.height).data;
  assert.equal(deliveries.length, 0);
  assert.equal(db.prepare('SELECT COUNT(*) total FROM email_deliveries').get().total, 0);
  assert.equal(db.prepare('SELECT invitation_status FROM guests WHERE id=7').get().invitation_status, 'pending');
  config.mailEnabled = true; config.smtp = { host: 'smtp.test.local' }; config.mailFrom = 'eventos@example.com';
  try {
    const results = await Promise.all([1,2].map(() => request(`${path}/invite`, { method: 'POST' })));
    assert.deepEqual(results.map(r => r.status).sort(), [200,409]);
    assert.equal(deliveries.length, 1);
    const { message, mime } = deliveries[0];
    assert.equal(message.subject, preview.data.subject);
    assert.match(message.html, /cid:invitacion-qr@eventos/);
    assert.match(mime, /Content-ID: <invitacion-qr@eventos>/);
    assert.match(mime, /Content-Type: text\/html/);
    assert.match(mime, /Content-Type: text\/plain/);
    const attachment = PNG.sync.read(message.attachments[0].content);
    assert.equal(jsQR(new Uint8ClampedArray(attachment.data), attachment.width, attachment.height).data, qr);
    const guest = db.prepare('SELECT * FROM guests WHERE id=7').get();
    assert.equal(guest.invitation_status, 'sent'); assert.ok(guest.sent_at); assert.equal(guest.checked_at, null);
    const detail = await request(`${path}/detail`);
    assert.equal(detail.data.deliveries.length, 1);
    assert.equal(detail.data.deliveries[0].recipient, 'invitado7@example.com');
    assert.equal(detail.data.deliveries[0].initiated_by_email, config.adminEmail);
    assert.equal(detail.data.deliveries[0].status, 'sent');
    assert.ok(detail.data.deliveries[0].message_id);
    assert.ok(detail.data.guest.created_at);
    assert.equal(detail.data.guest.token, undefined);
    assert.equal((await request('/api/events/1/checkin', { method: 'POST', cookie: operatorCookie, body: { qr } })).status, 200);
    assert.equal((await request('/api/events/1/checkin', { method: 'POST', cookie: operatorCookie, body: { qr } })).status, 409);
  } finally { config.mailEnabled = false; }
});
test('la ficha conserva destinatario histórico al editar y muestra ingreso y operador', async () => {
  const path = '/api/events/1/guests/7';
  const before = (await request(`${path}/detail`)).data;
  assert.equal((await request(path, { method: 'PATCH', body: { name: 'Antonia Actualizada', email: 'antonia-nueva@example.com', company: 'Empresa nueva' } })).status, 200);
  const { guest, deliveries: history } = (await request(`${path}/detail`)).data;
  assert.equal(guest.email, 'antonia-nueva@example.com');
  assert.equal(guest.invitation_status, 'pending'); assert.equal(guest.sent_at, null);
  assert.equal(guest.created_at, before.guest.created_at);
  assert.equal(guest.checked_at, before.guest.checked_at);
  assert.equal(guest.operator, config.operatorEmail);
  assert.equal(history[0].recipient, 'invitado7@example.com');
  assert.equal(history[0].recipient_name, 'Antonia Díaz');
  assert.equal((await request('/api/events/2/guests/7/detail')).status, 404);
});
test('historial audita error y reintento, se exporta y persiste al reabrir la base', async () => {
  config.mailEnabled = true;
  try {
    rejectMail = true;
    assert.equal((await request('/api/events/1/guests/8/invite', { method: 'POST' })).status, 502);
    let detail = (await request('/api/events/1/guests/8/detail')).data;
    assert.equal(detail.guest.invitation_status, 'failed');
    assert.equal(detail.deliveries.length, 1);
    assert.equal(detail.deliveries[0].status, 'failed');
    assert.ok(detail.deliveries[0].finished_at);
    rejectMail = false;
    assert.equal((await request('/api/events/1/guests/8/invite', { method: 'POST' })).status, 200);
    detail = (await request('/api/events/1/guests/8/detail')).data;
    assert.deepEqual(detail.deliveries.map(d => d.status), ['sent','failed']);
    assert.equal(detail.guest.invitation_status, 'sent');
    const report = await request('/api/events/1/email-report.csv');
    assert.equal(report.status, 200);
    assert.match(report.data, /invitado8@example.com/);
    assert.match(report.data, /invitado7@example.com/);
    assert.match(report.data, /admin@test.local/);
    assert.match(report.data, /failed/);
    const otherEvent = await request('/api/events/2/email-report.csv');
    assert.doesNotMatch(otherEvent.data, /invitado8@example.com/);
    const reopened = openDatabase(join(directory, 'test.sqlite'));
    assert.equal(reopened.prepare('SELECT COUNT(*) total FROM email_deliveries WHERE guest_id=8').get().total, 2);
    reopened.close();
  } finally { config.mailEnabled = false; rejectMail = false; }
});
test('el contenido personalizado del correo no interpreta HTML del invitado', async () => {
  const result = await request('/api/events/1/guests', { method: 'POST', body: { name: 'Cliente <img src=x onerror=alert(1)>', email: 'escape@example.com' } });
  const preview = await request(`/api/events/1/guests/${result.data.id}/invitation-preview`);
  assert.equal(preview.status, 200);
  assert.match(preview.data.html, /Cliente &lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(preview.data.html, /<img src=x/);
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
