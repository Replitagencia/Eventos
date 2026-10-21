# Operación inicial

## Configuración

| Variable | Uso |
| --- | --- |
| `PORT`, `HOST` | Puerto y dirección de escucha; local: `3000`, `127.0.0.1` |
| `PUBLIC_URL` | Origen exacto que abrirán los navegadores; se valida en mutaciones |
| `DATABASE_PATH` | Archivo SQLite en un volumen persistente |
| `COOKIE_SECURE` | `true` con HTTPS; `false` solo para ensayo local |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Cuenta inicial administradora |
| `OPERATOR_EMAIL`, `OPERATOR_PASSWORD` | Cuenta inicial de acreditación |
| `SEED_DEMO` | Crea datos ficticios solo si no hay eventos |
| `MAIL_ENABLED` | Habilita el envío explícito de invitaciones |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | Servidor de correo; `secure=true` suele corresponder a 465 |
| `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Cuenta SMTP y remitente autorizado |

Usar contraseñas distintas de al menos 16 caracteres. `.env` se crea con permiso de lectura/escritura para el propietario. El servicio necesita lectura de ese archivo y escritura en `data/`. Al rotar contraseñas, revisar/revocar también las sesiones existentes: un cambio de clave por sí solo no las invalida en este MVP.

## Despliegue para celulares

1. Elegir alojamiento que ejecute Node 24 como proceso persistente y tenga disco persistente. No se ha contratado ni creado infraestructura desde este repositorio.
2. Instalar dependencias con `npm ci --omit=dev` y provisionar `.env` fuera de Git.
3. Establecer `NODE_ENV=production`, `HOST=0.0.0.0`, `PUBLIC_URL=https://<dominio>`, `COOKIE_SECURE=true` y ruta persistente de base de datos. Quitar la semilla al usar datos reales.
4. Poner HTTPS delante del servicio. El proxy debe preservar `Origin`, permitir SSE, desactivar buffering para `/api/live` y aceptar conexiones largas con latidos de 15 segundos.
5. Ejecutar una sola réplica. Restringir acceso directo al puerto del servicio. No habilitar proxy de confianza indiscriminadamente: actualmente el limitador observa la IP del proxy y puede compartir el cupo entre usuarios.
6. Entrar desde dos celulares usando ese mismo dominio, permitir cámara y completar el guion de ensayo.

Para un túnel HTTPS de demostración, mantener el servidor en `127.0.0.1`, poner la URL del túnel en `PUBLIC_URL` y `COOKIE_SECURE=true`, reiniciar y acceder exclusivamente por la URL HTTPS. Mantener encendido el computador. La URL de localhost solo sirve en el propio equipo.

## Correo

Configurar un proveedor SMTP y remitente autorizado, incluyendo autenticación del dominio según sus instrucciones. Establecer `MAIL_ENABLED=true` y reiniciar. En Invitados → Ver QR → Enviar invitación, la aplicación muestra nombre/destinatario antes de confirmar. El mensaje incluye nombre, evento, fecha/lugar y PNG del QR adjunto.

No ejecutar envíos a los ejemplos de la semilla ni a listas reales sin instrucción del responsable. Un estado `sent` significa que SMTP aceptó el mensaje; podría rebotar después. No hay tracking de apertura. Credenciales SMTP no deben aparecer en capturas ni commits.

## Respaldo

Detener el servicio de forma ordenada antes de copiar la base para un respaldo sencillo. Con el servicio activo, usar la API de respaldo SQLite; copiar solo el archivo principal mientras WAL está activo puede perder cambios. Guardar respaldos fuera del repositorio, con acceso restringido, y ensayar una restauración en una instalación separada antes del evento.

No borrar la base para repetir la demo. Crear otro evento con nuevos invitados. Los QR se deben tratar como credenciales: cualquier persona que tenga una copia puede intentar usarlos.

## Limitaciones conocidas

- Dos cuentas iniciales. Para atribución individual en un evento real hace falta gestión/provisión de cuentas por operador; compartir una cuenta identifica el rol, no la persona o el dispositivo.
- No hay recuperación de contraseña, cierre masivo de sesiones desde la interfaz ni asignación de eventos.
- Importaciones grandes o archivos XLSX maliciosos requieren aislamiento y límites adicionales; solo el administrador debe cargar archivos de procedencia confiable.
- SQLite/SSE en una instancia es el alcance demostrado; no hay alta disponibilidad.
- El código registra el primer ingreso, pero no verificaciones físicas de identidad, salidas o reingresos.
- Falta ensayo SMTP real, carga con los dispositivos del recinto y cámaras iOS/Android.
