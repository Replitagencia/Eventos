// Migraciones aditivas: conservar invitados, QR, ingresos y estados existentes.
export function migrate(db) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const version = db.prepare('PRAGMA user_version').get().user_version;
    if (version > 3) throw new Error('La base pertenece a una versión más reciente de Eventos.');
    if (version < 2) {
      db.exec(`
        ALTER TABLE guests ADD COLUMN created_at TEXT;
        CREATE TRIGGER guests_created_at AFTER INSERT ON guests
        WHEN NEW.created_at IS NULL
        BEGIN
          UPDATE guests SET created_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id;
        END;
        CREATE TABLE email_deliveries (
          id INTEGER PRIMARY KEY,
          guest_id INTEGER NOT NULL REFERENCES guests(id),
          recipient TEXT NOT NULL,
          recipient_name TEXT NOT NULL,
          sender TEXT NOT NULL,
          subject TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('sending','sent','failed')),
          started_at TEXT NOT NULL,
          finished_at TEXT,
          initiated_by INTEGER NOT NULL REFERENCES users(id),
          message_id TEXT,
          failure_note TEXT
        );
        CREATE INDEX email_deliveries_guest ON email_deliveries(guest_id,id);
        PRAGMA user_version=2;
      `);
    }
    if (version < 3) {
      db.exec(`CREATE TABLE operator_events (
        user_id INTEGER NOT NULL REFERENCES users(id),
        event_id INTEGER NOT NULL REFERENCES events(id),
        PRIMARY KEY(user_id,event_id)
      );
      DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE role='operator');
      PRAGMA user_version=3;`);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
