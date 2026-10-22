import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../src/db.js';

test('migración v1 conserva datos, QR y fechas reales; nuevos invitados obtienen fecha de registro', () => {
  const directory = mkdtempSync(join(tmpdir(), 'eventos-migration-'));
  const path = join(directory, 'v1.sqlite');
  let db = new DatabaseSync(path);
  try {
    db.exec(`CREATE TABLE guests (
      id INTEGER PRIMARY KEY, event_id INTEGER NOT NULL,
      name TEXT NOT NULL,email TEXT NOT NULL,rut TEXT NOT NULL DEFAULT '',company TEXT NOT NULL DEFAULT '',
      token TEXT UNIQUE NOT NULL,checked_at TEXT,checked_by INTEGER,checkin_method TEXT,
      invitation_status TEXT NOT NULL DEFAULT 'pending',sent_at TEXT,UNIQUE(event_id,email));
      INSERT INTO guests(event_id,name,email,token,checked_at,checked_by,checkin_method,invitation_status,sent_at)
        VALUES(1,'Invitado histórico','legacy@example.com','legacy-qr','2026-10-20T12:00:00Z',1,'qr','sent','2026-10-19T12:00:00Z');
      PRAGMA user_version=1;`);
    const legacy = { ...db.prepare('SELECT * FROM guests WHERE id=1').get() };
    db.close(); db = openDatabase(path);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 4);
    const migrated = db.prepare('SELECT * FROM guests WHERE id=1').get();
    for (const [key,value] of Object.entries(legacy)) assert.equal(migrated[key],value);
    assert.equal(migrated.created_at,null);
    assert.equal(migrated.category,'general');
    assert.equal(migrated.rsvp_status,'pending');
    assert.match(migrated.rsvp_token,/^[a-f0-9]{64}$/);
    assert.notEqual(migrated.rsvp_token,migrated.token);
    assert.equal(db.prepare('SELECT COUNT(*) total FROM email_deliveries').get().total, 0);
    assert.equal(db.prepare('SELECT COUNT(*) total FROM operator_events').get().total, 0);
    db.prepare('INSERT INTO guests(event_id,name,email,token) VALUES(?,?,?,?)').run(1,'Nuevo','new@example.com','new-qr');
    const createdAt = db.prepare('SELECT created_at FROM guests WHERE id=2').get().created_at;
    assert.ok(Number.isFinite(Date.parse(createdAt)));
    db.close(); db = openDatabase(path);
    assert.equal(db.prepare('SELECT created_at FROM guests WHERE id=2').get().created_at, createdAt);
    assert.equal(db.prepare('SELECT token FROM guests WHERE id=1').get().token, 'legacy-qr');
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('migración v2 revoca sesiones antiguas de operarios y conserva administración e historial', () => {
  const directory = mkdtempSync(join(tmpdir(), 'eventos-access-migration-'));
  const path = join(directory, 'v2.sqlite');
  let db = openDatabase(path);
  try {
    db.exec(`INSERT INTO users VALUES(1,'admin@example.com','test','admin');
      INSERT INTO users VALUES(2,'operator@example.com','test','operator');
      INSERT INTO sessions VALUES('admin-session',1,9999999999999);
      INSERT INTO sessions VALUES('old-operator-session',2,9999999999999);
      INSERT INTO events(id,name,date,location) VALUES(1,'Evento','2026-10-22T19:00:00Z','Santiago');
      INSERT INTO guests(id,event_id,name,email,token) VALUES(1,1,'Invitado','guest@example.com','keep-this-token');
      INSERT INTO email_deliveries(guest_id,recipient,recipient_name,sender,subject,status,started_at,initiated_by)
      VALUES(1,'guest@example.com','Invitado','sender@example.com','Invitación','sent','2026-10-20T19:00:00Z',1);
      DROP TABLE email_batch_items;
      DROP TABLE email_batches;
      DROP TRIGGER guest_rsvp_token;
      DROP INDEX guest_rsvp_token;
      ALTER TABLE guests DROP COLUMN rsvp_token;
      ALTER TABLE guests DROP COLUMN rsvp_at;
      ALTER TABLE guests DROP COLUMN rsvp_status;
      ALTER TABLE guests DROP COLUMN notes;
      ALTER TABLE guests DROP COLUMN category;
      ALTER TABLE events DROP COLUMN invitation;
      ALTER TABLE email_deliveries DROP COLUMN kind;
      DROP TABLE operator_events;
      PRAGMA user_version=2;`);
    db.close(); db = openDatabase(path);
    assert.equal(db.prepare('SELECT COUNT(*) total FROM sessions').get().total, 1);
    assert.ok(db.prepare("SELECT token FROM sessions WHERE token='admin-session'").get());
    assert.equal(db.prepare('SELECT COUNT(*) total FROM operator_events').get().total, 0);
    assert.equal(db.prepare('SELECT COUNT(*) total FROM email_deliveries').get().total, 1);
    assert.equal(db.prepare('SELECT token FROM guests WHERE id=1').get().token, 'keep-this-token');
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
});
