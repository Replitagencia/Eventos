import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { openDatabase } from '../src/db.js';
import { createApp } from '../src/app.js';

for (const trustProxy of [false, 1]) {
  test(`límite de acceso con proxy ${trustProxy}: no compartir cupo ni aceptar cadenas falsas`, async t => {
    const db = openDatabase(':memory:');
    const app = createApp(db, { publicUrl: 'https://test.registroevento.cl', secureCookie: true, trustProxy });
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const health = await fetch(`${base}/healthz`);
    assert.deepEqual(await health.json(), { ok: true });
    assert.equal(health.headers.get('cache-control'), 'no-store');
    const attempt = forwarded => fetch(`${base}/api/operator/login`, { method: 'POST', headers: {
      'Content-Type': 'application/json', 'X-Requested-With': 'eventos',
      ...(trustProxy ? { 'X-Forwarded-For': forwarded } : {})
    }, body: JSON.stringify({ email: 'missing@example.com', password: 'invalid' }) }).then(async r => { await r.text(); return r.status; });
    for (let i = 0; i < 20; i++) assert.equal(await attempt('198.51.100.1'), 401);
    assert.equal(await attempt('198.51.100.1'), 429);
    if (trustProxy) {
      assert.equal(await attempt('198.51.100.99, 198.51.100.1'), 429);
      assert.equal(await attempt('198.51.100.2'), 401);
    } else assert.equal(app.get('trust proxy'), false);
  });
}

test('respaldo en vivo conserva datos WAL, permisos e integridad', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'eventos-backup-'));
  const source = join(directory, 'source.sqlite');
  const destination = join(directory, 'copies');
  const db = new DatabaseSync(source);
  t.after(() => { db.close(); rmSync(directory, { recursive: true, force: true }); });
  db.exec("PRAGMA journal_mode=WAL; CREATE TABLE sample(value TEXT); INSERT INTO sample VALUES('ingreso confirmado');");
  await promisify(execFile)(process.execPath, ['scripts/backup.js'], { env: { ...process.env, DATABASE_PATH: source, BACKUP_DIRECTORY: destination } });
  const files = readdirSync(destination);
  assert.equal(files.length, 1); assert.match(files[0], /\.sqlite$/);
  const path = join(destination, files[0]);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  const copy = new DatabaseSync(path, { readOnly: true });
  try {
    assert.equal(copy.prepare('SELECT value FROM sample').get().value, 'ingreso confirmado');
    assert.equal(copy.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  } finally { copy.close(); }
});
