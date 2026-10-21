import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const token = () => randomBytes(32).toString('base64url');
export function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function passwordMatches(password, hash) {
  const [salt, key] = hash.split(':');
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(key, 'hex'));
}
export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','operator')));
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, date TEXT NOT NULL, location TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS guests (
      id INTEGER PRIMARY KEY, event_id INTEGER NOT NULL REFERENCES events(id),
      name TEXT NOT NULL, email TEXT NOT NULL, rut TEXT NOT NULL DEFAULT '', company TEXT NOT NULL DEFAULT '',
      token TEXT UNIQUE NOT NULL, checked_at TEXT, checked_by INTEGER REFERENCES users(id),
      checkin_method TEXT, invitation_status TEXT NOT NULL DEFAULT 'pending', sent_at TEXT,
      UNIQUE(event_id,email));
    CREATE UNIQUE INDEX IF NOT EXISTS guest_rut ON guests(event_id,rut) WHERE rut != '';
    CREATE INDEX IF NOT EXISTS guests_event ON guests(event_id);
    PRAGMA user_version=1;`);
  return db;
}
export function bootstrap(db, config) {
  for (const [email, password, role] of [
    [config.adminEmail, config.adminPassword, 'admin'], [config.operatorEmail, config.operatorPassword, 'operator']
  ]) {
    if (!email || !password || password.length < 16 || password.startsWith('REEMPLAZAR')) throw new Error('Configura claves distintas de al menos 16 caracteres en .env.');
    db.prepare('INSERT INTO users(email,password,role) VALUES(?,?,?) ON CONFLICT(email) DO UPDATE SET password=excluded.password,role=excluded.role')
      .run(email.toLowerCase(), passwordHash(password), role);
  }
  if (config.adminEmail.toLowerCase() === config.operatorEmail.toLowerCase() || config.adminPassword === config.operatorPassword) throw new Error('Administrador y operador deben tener cuentas y claves distintas.');
  if (config.seedDemo && !db.prepare('SELECT id FROM events LIMIT 1').get()) {
    const event = db.prepare('INSERT INTO events(name,date,location) VALUES(?,?,?)').run('Encuentro Agency 2026', '2026-10-22T18:30:00-03:00', 'Santiago · Espacio de eventos');
    const names = ['Sofía Muñoz', 'Benjamín Soto', 'Valentina Rojas', 'Mateo Silva', 'Isidora Torres', 'Vicente Castro', 'Antonia Díaz', 'Joaquín Pérez', 'Florencia Vega', 'Agustín Reyes', 'Emilia López', 'Tomás Fuentes'];
    names.forEach((name, i) => db.prepare('INSERT INTO guests(event_id,name,email,company,token) VALUES(?,?,?,?,?)').run(Number(event.lastInsertRowid), name, `invitado${i + 1}@example.com`, ['Agency Labs', 'Estudio Norte', 'Independiente'][i % 3], token()));
  }
}
