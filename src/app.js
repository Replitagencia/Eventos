import express from 'express';
import helmet from 'helmet';
import QRCode from 'qrcode';
import nodemailer from 'nodemailer';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { token } from './db.js';
import { readSession, requireRole, login, loginLimiter } from './access.js';
import { operatorRouter } from './operator.js';
import { parseImport, validateGuest, csvCell } from './import.js';
import { renderInvitation } from './invitation.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const fail = (status, message) => Object.assign(new Error(message), { status });
export function createApp(db, config, { sendMail } = {}) {
  const app = express();
  const streams = new Set();
  app.locals.closeStreams = () => { for (const stream of streams) stream.res.end(); };
  const broadcast = () => { for (const stream of streams) stream.res.write('data: refresh\n\n'); };
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: { 'img-src': ["'self'", 'data:'], 'script-src': ["'self'"], 'upgrade-insecure-requests': config.secureCookie ? [] : null } } }));
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!['GET','HEAD','OPTIONS'].includes(req.method) && (req.get('X-Requested-With') !== 'eventos' || (req.get('Origin') && req.get('Origin') !== new URL(config.publicUrl).origin))) return res.status(403).json({ error: 'Solicitud no autorizada.' });
    next();
  });
  app.use(express.json({ limit: '50kb' }));
  app.use('/api/operator', operatorRouter(db, config, broadcast));
  app.use('/api', readSession(db, 'eventos_session'));
  app.post('/api/login', loginLimiter(), login(db, config, { role: 'admin', cookieName: 'eventos_session', path: '/' }));
  app.use('/api', requireRole('admin'));
  const admin = requireRole('admin');
  app.get('/api/me', (req, res) => res.json({ email: req.user.email, role: req.user.role, mailEnabled: config.mailEnabled }));
  app.post('/api/logout', (req, res) => {
    db.prepare('DELETE FROM sessions WHERE token=?').run(req.sessionToken);
    for (const stream of streams) if (stream.session === req.sessionToken) stream.res.end();
    res.clearCookie('eventos_session', { path: '/' }).json({ ok: true });
  });
  app.get('/api/live', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders(); res.write('data: refresh\n\n');
    const stream = { res, session: req.sessionToken }; streams.add(stream);
    const timer = setInterval(() => {
      if (Date.now() >= req.user.expires) return res.end();
      res.write(': heartbeat\n\n');
    }, 15000);
    res.on('close', () => { clearInterval(timer); streams.delete(stream); });
  });
  app.get('/api/events', (_req, res) => res.json(db.prepare(`SELECT events.*, COUNT(guests.id) total, COUNT(guests.checked_at) checked FROM events LEFT JOIN guests ON guests.event_id=events.id GROUP BY events.id ORDER BY events.date DESC`).all()));
  app.post('/api/events', admin, (req, res) => {
    const { name, date, location } = req.body;
    if (typeof name !== 'string' || !name.trim() || name.length > 150 || typeof location !== 'string' || !location.trim() || location.length > 200 || typeof date !== 'string' || !/(Z|[+-]\d\d:\d\d)$/.test(date) || Number.isNaN(Date.parse(date))) throw fail(400, 'Completa nombre, lugar y una fecha con zona horaria.');
    const result = db.prepare('INSERT INTO events(name,date,location) VALUES(?,?,?)').run(name.trim(), new Date(date).toISOString(), location.trim());
    broadcast(); res.status(201).json({ id: Number(result.lastInsertRowid) });
  });
  app.use('/api/events/:eventId', (req, _res, next) => {
    req.event = db.prepare('SELECT * FROM events WHERE id=?').get(req.params.eventId);
    if (!req.event) return next(fail(404, 'Evento no encontrado.'));
    next();
  });
  app.get('/api/events/:eventId/operators', (req, res) => {
    res.json(db.prepare("SELECT users.id,users.email,EXISTS(SELECT 1 FROM operator_events WHERE user_id=users.id AND event_id=?) assigned FROM users WHERE role='operator' ORDER BY email").all(req.event.id));
  });
  app.put('/api/events/:eventId/operators', (req, res) => {
    const ids = req.body?.userIds;
    if (!Array.isArray(ids) || ids.length > 100 || ids.some(id => !Number.isInteger(id)) || new Set(ids).size !== ids.length) throw fail(400, 'Selecciona cuentas de operario válidas.');
    if (ids.some(id => !db.prepare("SELECT id FROM users WHERE id=? AND role='operator'").get(id))) throw fail(400, 'Solo puedes asignar cuentas de operario.');
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('DELETE FROM operator_events WHERE event_id=?').run(req.event.id);
      for (const id of ids) db.prepare('INSERT INTO operator_events(user_id,event_id) VALUES(?,?)').run(id,req.event.id);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    broadcast(); res.json({ ok: true });
  });
  const publicGuestColumns = 'id,name,email,rut,company,created_at,checked_at,checkin_method,invitation_status,sent_at';
  app.get('/api/events/:eventId/guests', (req, res) => {
    res.json(db.prepare(`SELECT ${publicGuestColumns} FROM guests WHERE event_id=? ORDER BY name COLLATE NOCASE`).all(req.event.id));
  });
  app.get('/api/events/:eventId/guests/:guestId/detail', admin, (req, res) => {
    const guest = db.prepare(`SELECT ${publicGuestColumns} FROM guests WHERE id=? AND event_id=?`).get(req.params.guestId, req.event.id);
    if (!guest) throw fail(404, 'Invitado no encontrado.');
    const checkin = db.prepare('SELECT users.email operator FROM guests LEFT JOIN users ON users.id=guests.checked_by WHERE guests.id=?').get(guest.id);
    const deliveries = db.prepare(`SELECT email_deliveries.*,users.email initiated_by_email FROM email_deliveries JOIN users ON users.id=email_deliveries.initiated_by WHERE guest_id=? ORDER BY email_deliveries.id DESC`).all(guest.id);
    res.json({ guest: { ...guest, operator: checkin.operator }, deliveries });
  });
  app.post('/api/events/:eventId/guests', admin, (req, res) => {
    const guest = validateGuest(req.body);
    const result = db.prepare('INSERT INTO guests(event_id,name,email,rut,company,token) VALUES(?,?,?,?,?,?)').run(req.event.id, guest.name, guest.email, guest.rut, guest.company, token());
    broadcast(); res.status(201).json({ id: Number(result.lastInsertRowid) });
  });
  app.patch('/api/events/:eventId/guests/:guestId', admin, (req, res) => {
    const guest = validateGuest(req.body);
    const current = db.prepare('SELECT * FROM guests WHERE id=? AND event_id=?').get(req.params.guestId, req.event.id);
    if (!current) throw fail(404, 'Invitado no encontrado.');
    if (current.invitation_status === 'sending') throw fail(409, 'Espera a que termine el envío.');
    db.prepare('UPDATE guests SET name=?,email=?,rut=?,company=?,invitation_status=?,sent_at=? WHERE id=?').run(guest.name, guest.email, guest.rut, guest.company, guest.email === current.email ? current.invitation_status : 'pending', guest.email === current.email ? current.sent_at : null, current.id);
    broadcast(); res.json({ ok: true });
  });
  app.post('/api/events/:eventId/import', admin, express.raw({ type: 'application/octet-stream', limit: '2mb' }), async (req, res) => {
    if (!Buffer.isBuffer(req.body)) throw fail(400, 'Selecciona un archivo CSV o Excel.');
    const guests = await parseImport(req.body, req.get('X-Filename') || '');
    let imported = 0, duplicates = 0;
    db.exec('BEGIN IMMEDIATE');
    try {
      const insert = db.prepare('INSERT INTO guests(event_id,name,email,rut,company,token) VALUES(?,?,?,?,?,?) ON CONFLICT DO NOTHING');
      for (const guest of guests) {
        const result = insert.run(req.event.id, guest.name, guest.email, guest.rut, guest.company, token());
        if (result.changes) imported++; else duplicates++;
      }
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    broadcast(); res.json({ imported, duplicates });
  });
  app.get('/api/events/:eventId/guests/:guestId/qr', admin, async (req, res) => {
    const guest = db.prepare('SELECT token FROM guests WHERE id=? AND event_id=?').get(req.params.guestId, req.event.id);
    if (!guest) throw fail(404, 'Invitado no encontrado.');
    res.type('png').send(await QRCode.toBuffer(`EVT:${req.event.id}:${guest.token}`, { width: 400, margin: 2 }));
  });
  app.get('/api/events/:eventId/guests/:guestId/invitation-preview', admin, async (req, res) => {
    const guest = db.prepare('SELECT * FROM guests WHERE id=? AND event_id=?').get(req.params.guestId, req.event.id);
    if (!guest) throw fail(404, 'Invitado no encontrado.');
    const qrSource = await QRCode.toDataURL(`EVT:${req.event.id}:${guest.token}`, { width: 400, margin: 2 });
    res.json({ to: guest.email, ...renderInvitation({ event: req.event, guest, qrSource }) });
  });
  app.get('/api/events/:eventId/report.csv', admin, (req, res) => {
    const guests = db.prepare('SELECT guests.*,users.email operator FROM guests LEFT JOIN users ON users.id=guests.checked_by WHERE event_id=? ORDER BY name').all(req.event.id);
    const rows = [['Nombre','Email','RUT','Empresa','Estado','Ingreso UTC','Operador','Método','Invitación','Registrado UTC','Invitación enviada UTC'], ...guests.map(g => [g.name,g.email,g.rut,g.company,g.checked_at ? 'Acreditado' : 'Pendiente',g.checked_at,g.operator,g.checkin_method,g.invitation_status,g.created_at,g.sent_at])];
    res.attachment(`evento-${req.event.id}-reporte.csv`).type('text/csv; charset=utf-8').send('\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n'));
  });
  app.get('/api/events/:eventId/email-report.csv', admin, (req, res) => {
    const deliveries = db.prepare(`SELECT email_deliveries.*,users.email initiated_by_email FROM email_deliveries JOIN guests ON guests.id=email_deliveries.guest_id JOIN users ON users.id=email_deliveries.initiated_by WHERE guests.event_id=? ORDER BY email_deliveries.id DESC`).all(req.event.id);
    const rows = [['Nombre al enviar','Destinatario','Remitente','Asunto','Estado','Inicio UTC','Fin UTC','Solicitado por','ID de mensaje','Observación'], ...deliveries.map(d => [d.recipient_name,d.recipient,d.sender,d.subject,d.status,d.started_at,d.finished_at,d.initiated_by_email,d.message_id,d.failure_note])];
    res.attachment(`evento-${req.event.id}-correos.csv`).type('text/csv; charset=utf-8').send('\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n'));
  });
  app.post('/api/events/:eventId/guests/:guestId/invite', admin, async (req, res) => {
    if (!config.mailEnabled || !config.smtp?.host || !config.mailFrom) throw fail(409, 'Correo pendiente de configuración SMTP. Puedes mostrar o descargar el QR.');
    const guest = db.prepare('SELECT * FROM guests WHERE id=? AND event_id=?').get(req.params.guestId, req.event.id);
    if (!guest) throw fail(404, 'Invitado no encontrado.');
    const cid = 'invitacion-qr@eventos';
    const invitation = renderInvitation({ event: req.event, guest, qrSource: `cid:${cid}` });
    let deliveryId;
    db.exec('BEGIN IMMEDIATE');
    try {
      const claim = db.prepare("UPDATE guests SET invitation_status='sending' WHERE id=? AND invitation_status IN ('pending','failed')").run(guest.id);
      if (!claim.changes) throw fail(409, 'La invitación ya fue enviada o está en proceso.');
      deliveryId = Number(db.prepare("INSERT INTO email_deliveries(guest_id,recipient,recipient_name,sender,subject,status,started_at,initiated_by) VALUES(?,?,?,?,?,'sending',?,?)").run(guest.id,guest.email,guest.name,config.mailFrom,invitation.subject,new Date().toISOString(),req.user.id).lastInsertRowid);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    broadcast();
    let info;
    try {
      const qr = await QRCode.toBuffer(`EVT:${req.event.id}:${guest.token}`, { width: 400, margin: 2 });
      const message = {
        from: config.mailFrom, to: guest.email, subject: invitation.subject,
        text: invitation.text, html: invitation.html,
        attachments: [{ filename: 'invitacion-qr.png', content: qr, contentType: 'image/png', cid, contentDisposition: 'inline' }]
      };
      info = await (sendMail
        ? sendMail(message)
        : nodemailer.createTransport({ ...config.smtp, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 }).sendMail(message));
      if (!info.accepted?.length) throw new Error('Recipient rejected');
    } catch {
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare("UPDATE guests SET invitation_status='failed' WHERE id=?").run(guest.id);
        db.prepare("UPDATE email_deliveries SET status='failed',finished_at=?,failure_note=? WHERE id=?").run(new Date().toISOString(),'No se pudo confirmar la aceptación SMTP. Revisar proveedor antes de reintentar.',deliveryId);
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      broadcast(); throw fail(502, 'No se pudo confirmar el envío. Revisa SMTP antes de reintentar.');
    }
    // Una falla al persistir después de SMTP deja el intento en revisión (sending),
    // nunca lo convierte en un rechazo que autorice repetir el envío automáticamente.
    db.exec('BEGIN IMMEDIATE');
    try {
      const finishedAt = new Date().toISOString();
      db.prepare("UPDATE guests SET invitation_status='sent',sent_at=? WHERE id=?").run(finishedAt, guest.id);
      db.prepare("UPDATE email_deliveries SET status='sent',finished_at=?,message_id=? WHERE id=?").run(finishedAt,typeof info.messageId === 'string' ? info.messageId : null,deliveryId);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    broadcast(); res.json({ ok: true });
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));
  app.get('/vendor/html5-qrcode.min.js', (_req, res) => res.sendFile(resolve(root, 'node_modules/html5-qrcode/html5-qrcode.min.js')));
  app.use(express.static(resolve(root, 'public')));
  app.use((error, _req, res, _next) => {
    const duplicate = /UNIQUE constraint failed/.test(error.message);
    const status = duplicate ? 409 : error.status || (error instanceof SyntaxError || /Fila |Nombre obligatorio|Correo electrónico|RUT o empresa|Formato permitido|Importa entre|Usa la primera hoja|Invalid Record|Invalid Closing|Quote Not Closed/.test(error.message) ? 400 : 500);
    res.status(status).json({ error: duplicate ? 'Ya existe un invitado con ese correo o RUT en el evento.' : status === 500 ? 'No se pudo completar la operación.' : error.message });
  });
  return app;
}
