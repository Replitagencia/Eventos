import { rateLimit } from 'express-rate-limit';
import { token, passwordMatches } from './db.js';

export const loginLimiter = () => rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Demasiados intentos. Intenta en 15 minutos.' } });

export function readSession(db, cookieName) {
  return (req, _res, next) => {
    req.sessionToken = new RegExp(`(?:^|;\\s*)${cookieName}=([A-Za-z0-9_-]+)`).exec(req.get('Cookie') || '')?.[1];
    req.user = req.sessionToken && db.prepare('SELECT users.id,users.email,users.role,sessions.expires FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>?').get(req.sessionToken, Date.now());
    next();
  };
}

export function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
    if (req.user.role !== role) return res.status(403).json({ error: 'Esta cuenta no tiene acceso a esta aplicación.' });
    next();
  };
}

export function login(db, config, { role, cookieName, path }) {
  return (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
    if (password.length > 256 || !user || user.role !== role || !passwordMatches(password, user.password)) return res.status(401).json({ error: 'Correo o contraseña incorrectos para este acceso.' });
    const session = token();
    db.prepare('DELETE FROM sessions WHERE expires<? OR token=?').run(Date.now(), req.sessionToken || '');
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(session, user.id, Date.now() + 12 * 3600 * 1000);
    res.cookie(cookieName, session, { httpOnly: true, sameSite: 'strict', secure: config.secureCookie, maxAge: 12 * 3600 * 1000, path });
    res.json({ email: user.email, role: user.role });
  };
}
