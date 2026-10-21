const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

// La vista previa y el correo usan el mismo contenido. Solo cambia el origen de la imagen QR.
export function renderInvitation({ event, guest, qrSource }) {
  const date = new Date(event.date).toLocaleString('es-CL', {
    timeZone: 'America/Santiago', dateStyle: 'long', timeStyle: 'short'
  });
  const subject = `Estás invitado/a · ${event.name}`;
  const preheader = `${guest.name}, te esperamos. Tu invitación incluye el QR para ingresar al evento.`;
  const text = `Hola ${guest.name},\n\nTe invitamos a ${event.name}.\n\nFecha: ${date} (hora de Santiago)\nLugar: ${event.location}\n\nTu QR personal está incluido en este correo. Muéstralo desde tu celular o impreso al llegar; nuestro equipo lo escaneará para registrar tu ingreso.\n\nEs válido para un único ingreso. No lo compartas con otras personas.\n\n¡Te esperamos!`;
  const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f3eb;color:#243d32;font-family:Arial,Helvetica,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f1f3eb">
    <tr><td align="center" style="padding:24px 12px">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:560px;background:#ffffff">
        <tr><td align="center" style="background:#23483d;padding:36px 24px;color:#ffffff">
          <p style="margin:0 0 22px;font-size:11px;letter-spacing:3px;color:#d9eea2">TU INVITACIÓN PERSONAL</p>
          <h1 style="margin:0;font-family:Georgia,serif;font-size:36px;line-height:1.2;font-weight:normal">Nos encontramos<br>muy pronto.</h1>
          <p style="margin:20px 0 0;font-size:17px;line-height:1.5;color:#e1ebd9">${escapeHtml(event.name)}</p>
        </td></tr>
        <tr><td style="padding:30px 24px 20px">
          <h2 style="margin:0 0 14px;font-size:23px;line-height:1.3;font-weight:normal">Hola, ${escapeHtml(guest.name)}.</h2>
          <p style="margin:0;font-size:16px;line-height:1.7;color:#627365">Queremos contar contigo en este encuentro. Guarda esta invitación y presenta tu código QR al llegar.</p>
        </td></tr>
        <tr><td style="padding:0 24px 24px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f6ee">
            <tr><td style="padding:22px">
              <p style="margin:0 0 8px;font-size:10px;letter-spacing:2px;color:#7e916d">CUÁNDO</p>
              <p style="margin:0 0 6px;font-size:17px;line-height:1.5">${escapeHtml(date)}</p>
              <p style="margin:0 0 22px;font-size:12px;color:#7e8877">Hora de Santiago de Chile</p>
              <p style="margin:0 0 8px;font-size:10px;letter-spacing:2px;color:#7e916d">DÓNDE</p>
              <p style="margin:0;font-size:17px;line-height:1.5">${escapeHtml(event.location)}</p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding:0 24px 28px">
          <p style="margin:0 0 12px;font-size:11px;letter-spacing:2px;color:#7e916d">TU PASE DE INGRESO</p>
          <img src="${escapeHtml(qrSource)}" width="240" height="240" alt="QR personal de ingreso de ${escapeHtml(guest.name)}" style="display:block;width:240px;max-width:100%;height:auto;border:0;margin:0 auto">
          <p style="margin:15px 0 8px;font-size:15px;font-weight:bold">Muéstralo al llegar.</p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#7e8877">Puedes llevarlo en tu celular o impreso.<br>Personal y válido para un único ingreso.</p>
        </td></tr>
        <tr><td align="center" style="border-top:1px solid #e5e9df;padding:24px">
          <p style="margin:0 0 8px;font-family:Georgia,serif;font-size:25px">¡Te esperamos!</p>
          <p style="margin:0;font-size:11px;line-height:1.6;color:#87927d">Conserva tu QR y evita compartirlo con otras personas.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  return { subject, preheader, text, html };
}
