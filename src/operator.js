import express from 'express';
import { readSession, requireRole, login, loginLimiter } from './access.js';

const normalize = text => String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const literalPattern = text => `%${normalize(text).replace(/[\\%_]/g, char => `\\${char}`)}%`;

export function operatorRouter(db, config, onCheckin) {
  const router = express.Router();
  const cookieName = 'eventos_operator_session';
  db.function('search_text', { deterministic: true }, normalize);
  router.use(readSession(db, cookieName));
  router.post('/login', loginLimiter(), login(db, config, { role: 'operator', cookieName, path: '/api/operator' }));
  router.use(requireRole('operator'));
  router.get('/me', (req, res) => res.json({ email: req.user.email, role: 'operator' }));
  router.post('/logout', (req, res) => {
    db.prepare('DELETE FROM sessions WHERE token=?').run(req.sessionToken);
    res.clearCookie(cookieName, { path: '/api/operator' }).json({ ok: true });
  });
  router.get('/events', (req, res) => {
    res.json(db.prepare('SELECT events.id,events.name,events.date,events.location FROM events JOIN operator_events ON operator_events.event_id=events.id WHERE operator_events.user_id=? ORDER BY events.date DESC').all(req.user.id));
  });
  router.use('/events/:eventId', (req, res, next) => {
    req.event = db.prepare('SELECT events.id FROM events JOIN operator_events ON operator_events.event_id=events.id WHERE events.id=? AND operator_events.user_id=?').get(req.params.eventId, req.user.id);
    if (!req.event) return res.status(403).json({ error: 'No tienes acceso a la acreditación de este evento.' });
    next();
  });
  router.get('/events/:eventId/search', (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (query.length < 2 || query.length > 100) return res.status(400).json({ error: 'Busca usando entre 2 y 100 caracteres.' });
    const pattern = literalPattern(query);
    const rut = query.replace(/[.\s-]/g, '');
    const rows = db.prepare(`SELECT id,name,email,rut,company,checked_at FROM guests WHERE event_id=? AND (
      search_text(name) LIKE ? ESCAPE '\\' OR search_text(email) LIKE ? ESCAPE '\\'
      OR search_text(company) LIKE ? ESCAPE '\\' OR (? != '' AND search_text(rut) LIKE ? ESCAPE '\\'))
      ORDER BY name COLLATE NOCASE LIMIT 20`).all(req.event.id, pattern, pattern, pattern, rut, literalPattern(rut));
    res.json(rows.map(guest => {
      const [local, domain] = guest.email.split('@');
      return { id: guest.id, name: guest.name, company: guest.company, email_hint: `${local.slice(0,1)}•••@${domain}`, rut_hint: guest.rut ? `•••${guest.rut.slice(-4)}` : '', checked_at: guest.checked_at };
    }));
  });
  router.post('/events/:eventId/checkin', (req, res) => {
    let guest;
    if (req.body?.qr) {
      const match = /^EVT:(\d+):([A-Za-z0-9_-]{43})$/.exec(String(req.body.qr));
      if (!match || Number(match[1]) !== req.event.id) return res.status(400).json({ error: 'QR INVÁLIDO para este evento.' });
      guest = db.prepare('SELECT id,name FROM guests WHERE event_id=? AND token=?').get(req.event.id, match[2]);
    } else if (Number.isInteger(req.body?.guestId)) {
      guest = db.prepare('SELECT id,name FROM guests WHERE event_id=? AND id=?').get(req.event.id, req.body.guestId);
    }
    if (!guest) return res.status(400).json({ error: 'QR INVÁLIDO o invitado no encontrado.' });
    const now = new Date().toISOString();
    const result = db.prepare('UPDATE guests SET checked_at=?,checked_by=?,checkin_method=? WHERE id=? AND event_id=? AND checked_at IS NULL').run(now, req.user.id, req.body.qr ? 'qr' : 'manual', guest.id, req.event.id);
    if (!result.changes) return res.status(409).json({ error: 'YA INGRESÓ', name: guest.name, checked_at: db.prepare('SELECT checked_at FROM guests WHERE id=?').get(guest.id).checked_at });
    onCheckin();
    res.json({ message: 'ACREDITADO', name: guest.name, checked_at: now });
  });
  router.use((_req, res) => res.status(404).json({ error: 'Ruta de acreditación no encontrada.' }));
  return router;
}
