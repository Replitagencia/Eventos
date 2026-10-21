import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, chmodSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';

const source = process.env.DATABASE_PATH || './data/eventos.sqlite';
const directory = resolve(process.env.BACKUP_DIRECTORY || './backups');
mkdirSync(directory, { recursive: true, mode: 0o700 });
process.umask(0o077);
const destination = join(directory, `eventos-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
const temporary = `${destination}.partial`;
const db = new DatabaseSync(source, { readOnly: true });
try {
  await backup(db, temporary);
  const copy = new DatabaseSync(temporary);
  try {
    // La copia debe viajar como un solo archivo, sin depender de WAL/SHM.
    copy.exec('PRAGMA journal_mode=DELETE');
    if (copy.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('El respaldo no supera la verificación de integridad.');
  } finally { copy.close(); }
  chmodSync(temporary, 0o600);
  renameSync(temporary, destination);
  console.log(destination);
} finally { db.close(); }
