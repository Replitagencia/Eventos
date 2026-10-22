import { createApp } from './app.js';
import { openDatabase, bootstrap } from './db.js';
const env = process.env;
if (env.TRUST_PROXY && !['0', '1'].includes(env.TRUST_PROXY)) throw new Error('TRUST_PROXY debe ser 0 o 1; 1 requiere un único proxy y ningún puerto público para la aplicación.');
const config = {
  publicUrl: env.PUBLIC_URL || 'http://localhost:3000', secureCookie: env.COOKIE_SECURE === 'true',
  trustProxy: env.TRUST_PROXY === '1' ? 1 : false,
  adminEmail: env.ADMIN_EMAIL, adminPassword: env.ADMIN_PASSWORD,
  operatorEmail: env.OPERATOR_EMAIL, operatorPassword: env.OPERATOR_PASSWORD,
  seedDemo: env.SEED_DEMO === 'true', mailEnabled: env.MAIL_ENABLED === 'true',
  smtp: { host: env.SMTP_HOST, port: Number(env.SMTP_PORT || 587), secure: env.SMTP_SECURE === 'true', auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } },
  mailFrom: env.MAIL_FROM
};
if (env.NODE_ENV === 'production' && (!config.secureCookie || !config.publicUrl.startsWith('https://'))) throw new Error('Producción requiere HTTPS y COOKIE_SECURE=true.');
const db = openDatabase(env.DATABASE_PATH || './data/eventos.sqlite');
bootstrap(db, config);
const app = createApp(db, config);
const server = app.listen(Number(env.PORT || 3000), env.HOST || '127.0.0.1', () => console.log(`Eventos disponible en ${config.publicUrl}`));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => {
  app.locals.closeStreams();
  server.close(async () => { await app.locals.mailer.idle(); db.close(); process.exit(0); });
});
