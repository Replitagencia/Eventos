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
6. Asignar las cuentas de operario al evento en el panel. Entrar desde los celulares a `https://<dominio>/acreditacion/`, permitir cámara y completar el guion de ensayo.

Para un túnel HTTPS de demostración, mantener el servidor en `127.0.0.1`, poner la URL del túnel en `PUBLIC_URL` y `COOKIE_SECURE=true`, reiniciar y acceder exclusivamente por la URL HTTPS. Mantener encendido el computador. La URL de localhost solo sirve en el propio equipo.

## Acceso de operarios

1. El administrador entra al panel, selecciona el evento y abre **Acceso operarios → Asignar operarios**.
2. Marca las cuentas autorizadas y guarda. Para revocar, desmarca la cuenta y guarda; las nuevas búsquedas e ingresos quedan bloqueados inmediatamente.
3. Entrega al operario la dirección `/acreditacion/` y sus credenciales. Para la cuenta inicial usa `OPERATOR_EMAIL` y `OPERATOR_PASSWORD`; no compartir las credenciales de administrador.
4. El operario inicia sesión en su aplicación móvil, selecciona uno de sus eventos asignados y escanea. Como alternativa, usa **Buscar persona** y confirma el nombre antes de acreditar.

La aplicación móvil no muestra planificación, correos, informes, totales ni fichas de administración. Cada búsqueda entrega hasta 20 coincidencias y oculta parcialmente correo y RUT. Los nombres y empresas permiten identificar al asistente; los datos completos se consultan solo desde administración.

Al actualizar de la versión anterior se cierran las sesiones de operarios y no se asignan eventos automáticamente. El administrador debe asignarlos. Solo una instalación de demostración totalmente nueva asigna su evento ficticio inicial al operario. El panel y la acreditación usan cookies distintas: cerrar la sesión de uno no cierra la del otro. No dejar una sesión de administrador abierta en un dispositivo que se entregue a un operario.

## Correo

Configurar un proveedor SMTP y remitente autorizado, incluyendo autenticación del dominio según sus instrucciones. Establecer `MAIL_ENABLED=true` y reiniciar. En Invitados → Ver invitación → Enviar invitación, la aplicación muestra nombre/destinatario antes de confirmar. La vista previa muestra destinatario, asunto y el diseño del correo. El mensaje HTML incluye nombre, evento, fecha/lugar y el QR dentro del cuerpo mediante una imagen adjunta CID; también contiene una alternativa de texto. El QR llega en el primer correo, sin formulario ni confirmación previa de asistencia. Algunos clientes pueden ocultar imágenes: el QR también forma parte del mensaje como archivo PNG. La vista previa no envía correos ni cambia el estado de la invitación.

No ejecutar envíos a los ejemplos de la semilla ni a listas reales sin instrucción del responsable. Un estado `sent` significa que SMTP aceptó el mensaje; podría rebotar después. No hay tracking de apertura. Credenciales SMTP no deben aparecer en capturas ni commits.

## Registro interno y seguimiento

En **Invitados**, usar **Ver ficha** para consultar los datos y las fechas de la persona, los intentos de correo y su ingreso. La ficha incluye el administrador que solicitó cada correo y el operador que acreditó. La lista se actualiza en vivo; una ficha abierta puede refrescarse con **Actualizar ficha**.

Los contadores y filtros de correo corresponden al estado actual de cada invitado: por enviar, en proceso, enviada o por revisar. Al cambiar su dirección, vuelve a por enviar, pero los correos anteriores mantienen su destinatario original en el historial. **Invitados CSV** exporta el estado actual de todos los invitados del evento; **Correos CSV** exporta todos sus intentos de envío, independientemente de los filtros de pantalla.

La fecha de alta se registra para nuevas personas. Los registros de la versión anterior muestran “Sin fecha histórica”; sus estados de envío conocidos se conservan, pero no se reconstruye un historial que antes no se almacenaba. La generación de la vista previa no altera el estado ni cuenta como intento de envío.

## Respaldo

Detener el servicio de forma ordenada antes de copiar la base para un respaldo sencillo. Con el servicio activo, usar la API de respaldo SQLite; copiar solo el archivo principal mientras WAL está activo puede perder cambios. Guardar respaldos fuera del repositorio, con acceso restringido, y ensayar una restauración en una instalación separada antes del evento.

No borrar la base para repetir la demo. Crear otro evento con nuevos invitados. Los QR se deben tratar como credenciales: cualquier persona que tenga una copia puede intentar usarlos.

## Limitaciones conocidas

- Dos cuentas iniciales. Para atribución individual en un evento real hace falta gestión/provisión de cuentas por operador; compartir una cuenta identifica el rol, no la persona o el dispositivo.
- No hay recuperación de contraseña ni cierre masivo de sesiones desde la interfaz. La asignación y revocación por evento sí están disponibles.
- Importaciones grandes o archivos XLSX maliciosos requieren aislamiento y límites adicionales; solo el administrador debe cargar archivos de procedencia confiable.
- SQLite/SSE en una instancia es el alcance demostrado; no hay alta disponibilidad.
- El código registra el primer ingreso, pero no verificaciones físicas de identidad, salidas o reingresos.
- Falta ensayo SMTP real, carga con los dispositivos del recinto y cámaras iOS/Android.
