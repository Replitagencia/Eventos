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
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 2);
    assert.deepEqual({ ...db.prepare('SELECT * FROM guests WHERE id=1').get() }, { ...legacy, created_at: null });
    assert.equal(db.prepare('SELECT COUNT(*) total FROM email_deliveries').get().total, 0);
    db.prepare('INSERT INTO guests(event_id,name,email,token) VALUES(?,?,?,?)').run(1,'Nuevo','new@example.com','new-qr');
    const createdAt = db.prepare('SELECT created_at FROM guests WHERE id=2').get().created_at;
    assert.ok(Number.isFinite(Date.parse(createdAt)));
    db.close(); db = openDatabase(path);
    assert.equal(db.prepare('SELECT created_at FROM guests WHERE id=2').get().created_at, createdAt);
    assert.equal(db.prepare('SELECT token FROM guests WHERE id=1').get().token, 'legacy-qr');
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
});
