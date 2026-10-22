import nodemailer from 'nodemailer';
import QRCode from 'qrcode';
import { renderInvitation } from './invitation.js';
import { qrOptions } from './pass.js';
import { eventDesign } from './design.js';
const fail = (status, message) => Object.assign(new Error(message), { status });
export const rsvpLink = (config, guest) => `${config.publicUrl.replace(/\/$/,'')}/confirmacion/?token=${guest.rsvp_token}`;
export function createMailer(db, config, sendMail, broadcast) {
  let running = false, stopped = false, timer;
  const ready = () => {
    if (!config.mailEnabled || !config.smtp?.host || !config.mailFrom) throw fail(409, 'Correo pendiente de configuración SMTP. Puedes mostrar o descargar el QR.');
  };
  async function deliver(event, guest, userId, { resend = false, batch = false, testTo } = {}) {
    ready();
    const test = !!testTo;
    const design = eventDesign(event);
    const attachments = [];
    for (const key of ['logo','hero']) if (design[key]) {
      const [header, data] = design[key].split(',');
      attachments.push({ filename: key, content: Buffer.from(data,'base64'), contentType: header.slice(5).split(';')[0], cid: `${key}@eventos`, contentDisposition: 'inline' });
      design[key] = `cid:${key}@eventos`;
    }
    const invitation = renderInvitation({ event, guest: test ? { ...guest, name: 'Invitado de prueba' } : guest, qrSource: 'cid:invitacion-qr@eventos', designOverride: design, rsvpUrl: test ? null : rsvpLink(config,guest) });
    if (test) { invitation.subject = `[PRUEBA] ${invitation.subject}`; invitation.html = invitation.html.replace('<body ', '<body ').replace('<table role=', '<p style="text-align:center">PRUEBA · QR sin acceso válido. Sin confirmación de asistencia.</p><table role='); invitation.text = 'PRUEBA · QR sin acceso válido.\n' + invitation.text; }
    let deliveryId;
    db.exec('BEGIN IMMEDIATE');
    try {
      if (!test) {
        const allowed = batch ? ['queued'] : resend ? ['pending','failed','sent'] : ['pending','failed'];
        const claim = db.prepare(`UPDATE guests SET invitation_status='sending' WHERE id=? AND invitation_status IN (${allowed.map(()=>'?').join(',')})`).run(guest.id,...allowed);
        if (!claim.changes) throw fail(409, 'La invitación ya fue enviada o está en proceso.');
      }
      deliveryId = Number(db.prepare("INSERT INTO email_deliveries(guest_id,recipient,recipient_name,sender,subject,status,started_at,initiated_by,kind) VALUES(?,?,?,?,?,'sending',?,?,?)").run(guest.id,testTo || guest.email,test ? 'Invitado de prueba' : guest.name,config.mailFrom,invitation.subject,new Date().toISOString(),userId,test ? 'test' : 'invitation').lastInsertRowid);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    broadcast();
    let info;
    try {
      const qr = await QRCode.toBuffer(test ? 'PRUEBA-SIN-ACCESO' : `EVT:${event.id}:${guest.token}`, qrOptions(design));
      attachments.push({ filename:'invitacion-qr.png', content:qr, contentType:'image/png', cid:'invitacion-qr@eventos', contentDisposition:'inline' });
      const message = { from:config.mailFrom, to:testTo || guest.email, subject:invitation.subject, text:invitation.text, html:invitation.html, attachments };
      info = await (sendMail ? sendMail(message) : nodemailer.createTransport({ ...config.smtp, connectionTimeout:10000, greetingTimeout:10000, socketTimeout:15000 }).sendMail(message));
      if (!info.accepted?.length) throw new Error('Recipient rejected');
    } catch {
      db.exec('BEGIN IMMEDIATE');
      try {
        if (!test) db.prepare("UPDATE guests SET invitation_status='failed' WHERE id=?").run(guest.id);
        db.prepare("UPDATE email_deliveries SET status='failed',finished_at=?,failure_note=? WHERE id=?").run(new Date().toISOString(),'No se pudo confirmar la aceptación SMTP. Revisar proveedor antes de reintentar.',deliveryId);
        db.exec('COMMIT');
      } catch(error) { db.exec('ROLLBACK'); throw error; }
      broadcast(); throw fail(502, 'No se pudo confirmar el envío. Revisa SMTP antes de reintentar.');
    }
    db.exec('BEGIN IMMEDIATE');
    try {
      const now = new Date().toISOString();
      if (!test) db.prepare("UPDATE guests SET invitation_status='sent',sent_at=? WHERE id=?").run(now,guest.id);
      db.prepare("UPDATE email_deliveries SET status='sent',finished_at=?,message_id=? WHERE id=?").run(now,typeof info.messageId === 'string' ? info.messageId : null,deliveryId);
      db.exec('COMMIT');
    } catch(error) { db.exec('ROLLBACK'); throw error; }
    broadcast();
    return { ok:true };
  }
  // Un envío interrumpido nunca se reintenta automáticamente: pudo ser aceptado.
  db.prepare("UPDATE email_batch_items SET status='review' WHERE status='sending'").run();
  function finishBatches() {
    db.prepare(`UPDATE email_batches SET status=CASE WHEN EXISTS(SELECT 1 FROM email_batch_items i WHERE i.batch_id=email_batches.id AND i.status IN ('failed','review')) THEN 'review' ELSE 'completed' END WHERE NOT EXISTS(SELECT 1 FROM email_batch_items i WHERE i.batch_id=email_batches.id AND i.status IN ('queued','sending'))`).run();
  }
  async function drain() {
    if (running || stopped || !config.mailEnabled) return;
    running = true;
    try {
      while (!stopped) {
        const item = db.prepare("SELECT i.*,b.initiated_by,b.event_id FROM email_batch_items i JOIN email_batches b ON b.id=i.batch_id WHERE i.status='queued' ORDER BY b.id,i.guest_id LIMIT 1").get();
        if (!item) break;
        db.prepare("UPDATE email_batch_items SET status='sending' WHERE batch_id=? AND guest_id=?").run(item.batch_id,item.guest_id);
        db.prepare("UPDATE email_batches SET status='sending' WHERE id=?").run(item.batch_id);
        let status = 'sent';
        try {
          await deliver(db.prepare('SELECT * FROM events WHERE id=?').get(item.event_id),db.prepare('SELECT * FROM guests WHERE id=?').get(item.guest_id),item.initiated_by,{batch:true});
        } catch {
          status = db.prepare('SELECT invitation_status FROM guests WHERE id=?').get(item.guest_id).invitation_status === 'sending' ? 'review' : 'failed';
        }
        db.prepare('UPDATE email_batch_items SET status=? WHERE batch_id=? AND guest_id=?').run(status,item.batch_id,item.guest_id);
        finishBatches(); broadcast();
      }
      finishBatches();
    } finally { running = false; }
  }
  function wake() { clearTimeout(timer); if (!stopped) { timer = setTimeout(()=>drain().catch(()=>{}),50); timer.unref(); } }
  function enqueue(eventId, userId, guestIds, category) {
    ready();
    if (!Array.isArray(guestIds) || !guestIds.length || guestIds.length > 1000 || guestIds.some(id=>!Number.isInteger(id)) || new Set(guestIds).size !== guestIds.length) throw fail(400,'Selecciona entre 1 y 1.000 invitados.');
    const guests = guestIds.map(id=>db.prepare('SELECT * FROM guests WHERE id=? AND event_id=?').get(id,eventId));
    if (guests.some(g=>!g || g.invitation_status !== 'pending' || (category !== 'all' && g.category !== category))) throw fail(409,'La selección cambió. Actualiza la lista; el envío masivo incluye solo invitaciones por enviar.');
    db.exec('BEGIN IMMEDIATE');
    let id;
    try {
      id = Number(db.prepare('INSERT INTO email_batches(event_id,initiated_by,created_at,category) VALUES(?,?,?,?)').run(eventId,userId,new Date().toISOString(),category).lastInsertRowid);
      for (const guest of guests) {
        db.prepare("UPDATE guests SET invitation_status='queued' WHERE id=?").run(guest.id);
        db.prepare('INSERT INTO email_batch_items(batch_id,guest_id) VALUES(?,?)').run(id,guest.id);
      }
      db.exec('COMMIT');
    } catch(error) { db.exec('ROLLBACK'); throw error; }
    broadcast(); wake(); return { id, total:guests.length };
  }
  wake();
  return { deliver, enqueue, stop:()=>{ stopped=true; clearTimeout(timer); }, idle:async()=>{ while(running) await new Promise(resolve=>setTimeout(resolve,20)); } };
}
