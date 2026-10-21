import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (existsSync('.env')) {
  console.log('Ya existe .env. No se modificó la configuración.');
} else {
  const env = readFileSync('.env.example', 'utf8')
    .replace('REEMPLAZAR_POR_CLAVE_ALEATORIA', randomBytes(18).toString('base64url'))
    .replace('REEMPLAZAR_POR_OTRA_CLAVE_ALEATORIA', randomBytes(18).toString('base64url'));
  writeFileSync('.env', env, { mode: 0o600 });
  console.log('Configuración creada en .env con claves únicas. Usa ADMIN_EMAIL y ADMIN_PASSWORD para ingresar.');
}
