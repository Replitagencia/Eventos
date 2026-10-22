# Servidor exclusivo de Eventos

Destino solicitado: `https://test.registroevento.cl`, con acreditación en `/acreditacion/`.
La aplicación está instalada en una máquina nueva, separada de Bice Vida. No se modificaron sus servicios, bases, credenciales ni certificados.

## Configuración preparada

- DigitalOcean, Ubuntu 24.04, región NYC1.
- Plan aprobado y contratado `s-1vcpu-2gb`: 1 vCPU, 2 GiB RAM, 50 GiB SSD; USD 12/mes base, más impuestos si corresponden.
- Docker Compose: un proceso Node 24 y Caddy con HTTPS automático.
- Volumen persistente `eventos_data`; cuentas propias y configuración privada `.env.production`.
- Solo el proxy publica 80/443; Node y SQLite no se exponen a Internet.
- La comprobación `/healthz` no revela datos y consulta la disponibilidad de SQLite.
- Respaldo diario coherente usando la API SQLite, con comprobación de integridad y permisos restringidos.

## Instalación

1. Crear la máquina y una clave SSH exclusiva. Restringir SSH por firewall a la dirección de administración; habilitar 80 y 443. Instalar Docker desde el repositorio oficial de Ubuntu de Docker.
2. Copiar el código a `/opt/eventos` excluyendo configuración privada, bases y archivos del entorno local. Crear `.env.production` desde `deploy/production.env.example`, con dos claves aleatorias distintas. Usar permiso `600`.
3. Crear `backups/` con propietario UID/GID 1000 y permiso `700`. Ejecutar `docker compose config --quiet`, `docker compose build` y `docker compose up -d`.
4. Crear únicamente un registro DNS **A**, nombre **test**, dirigido a la IP de esta nueva máquina, TTL 300, en la zona `registroevento.cl`. No cambiar los registros de Bice Vida, correo o del dominio raíz.
5. Verificar el certificado, redirección HTTP, `/healthz`, inicio de sesión de ambos roles, aislamiento del operador y SSE por HTTPS. Probar persistencia después de recrear el contenedor de la aplicación.
6. Instalar `deploy/eventos-backup.service` y `deploy/eventos-backup.timer` en `/etc/systemd/system/`; activar el temporizador con `systemctl enable --now eventos-backup.timer`. Ejecutar un respaldo inicial y conservar una copia privada fuera del servidor.

`TRUST_PROXY=1` solo se usa en esta topología: exactamente un Caddy delante del servidor, que reemplaza `X-Forwarded-For` con la IP de la conexión. No publicar el puerto 3000 ni añadir proxies sin revisar esta configuración. Así el límite de login se aplica por IP de cliente. Referencias: [Express](https://expressjs.com/en/guide/behind-proxies/) y [Caddy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).

## Operación y recuperación

Actualizar tras crear respaldo: `docker compose build && docker compose up -d`. El volumen de datos se conserva. Nunca usar `docker compose down -v`: elimina los volúmenes.

Crear un respaldo manual: `docker compose exec -T app node scripts/backup.js`. No copiar solo el archivo principal mientras SQLite esté activo. Para restaurar, detener la app, conservar antes una copia del estado actual y restaurar el archivo verificado en el volumen con propietario 1000; retirar WAL/SHM del estado anterior únicamente con el servicio detenido. Ensayar en un volumen separado.

El temporizador guarda copias en el mismo servidor. La pérdida completa de la máquina también afecta esas copias; la transferencia periódica a otro almacenamiento y su retención se deben configurar antes del uso operativo. No se contratan respaldos pagos automáticamente.

## Correo y alcance

Inicialmente `MAIL_ENABLED=false`. DigitalOcean bloquea SMTP 25, 465 y 587; para enviar invitaciones desde esta máquina habrá que integrar un proveedor por HTTPS o una alternativa autorizada. No reutilizar las credenciales ni la integración Gmail de Bice Vida. [Restricción oficial de SMTP](https://docs.digitalocean.com/support/why-is-smtp-blocked/).

Este despliegue habilita el panel y el escáner por HTTPS. No sustituye las pruebas de cámaras reales, conexión del recinto y carga concurrente.

## Publicado el 21 de octubre de 2026

- Droplet `agency-eventos-test`, ID `611313390`, NYC1, IP pública `157.230.190.154`.
- Registro DNS `A test → 157.230.190.154`, TTL 300, creado y verificado en DigitalOcean. La zona `registroevento.cl` usa `ns1.digitalocean.com`, `ns2.digitalocean.com` y `ns3.digitalocean.com`; no fue necesario modificar Namecheap ni delegar nuevamente el dominio.
- Código en `/opt/eventos`, Docker y Compose instalados desde el repositorio oficial, acceso SSH por clave exclusiva y restringido por firewall a la dirección administrativa. Si esa dirección cambia, actualizar la regla desde la consola del proveedor.
- Panel y acreditación abiertos en navegador por HTTPS. Certificado válido, acceso por ambos roles, cookies seguras, aislamiento de administración, protección de origen, SSE y cierre de sesión verificados desde fuera del servidor.
- 22 pruebas automáticas aprobadas con Node 24, incluyendo límite de login por IP detrás del proxy y respaldo coherente con WAL activo.
- Base nueva, sin invitados ni eventos ficticios; `SEED_DEMO=false` y `MAIL_ENABLED=false`. Las cuentas iniciales son identificadores de acceso, no nuevas casillas de correo. Crear el evento y asignar el operario desde el panel.
- Persistencia e integridad comprobadas tras recrear el contenedor; se conservaron los IDs y roles de usuarios y el estado de las tablas. La aplicación está saludable y el puerto 3000 no se publica.
- Respaldo inicial verificado y descargado al Mac en `.local/backups/`. Temporizador diario habilitado a las 06:00 UTC con hasta cinco minutos de variación; por ahora los respaldos diarios permanecen en el servidor. Falta configurar su transferencia periódica a un segundo destino.
- Credenciales locales privadas en `.env.production` y `.local/accesos-servidor.txt`, excluidas de Git. No se reutilizaron claves de Bice Vida ni se copiaron los datos locales de la demo.

## Actualización del 22 de octubre de 2026: escaneo continuo

La acreditación mantiene la cámara abierta y continúa automáticamente entre personas. Se conservan la validación del servidor y la auditoría atómica del primer ingreso. Respaldo previo guardado en servidor y Mac; imagen anterior retenida como `agency-eventos-app:before-continuous-20261022`. La actualización recreó solamente la aplicación y conservó su volumen de datos.

Verificación: 22 pruebas de sistema y 5 de interfaz aprobadas. Las pruebas de cámara usan detecciones simuladas con la API real de un servidor aislado en memoria; incluyen QR sostenido, personas sucesivas, duplicados, QR inválido, respuesta perdida después de guardar, cancelación durante validación, permiso de cámara tardío y revocación de acceso. Queda pendiente el ensayo físico en iPhone/Android.

## Actualización del 22 de octubre de 2026: administración ampliada

Publicados diseño por evento, categorías/notas, confirmación opcional, ficha con QR, gestión de pruebas/reenvíos/cola y reportes ampliados. Migración v4 ensayada primero sobre una copia privada de producción: conservó los dos eventos, los siete invitados, sus tokens QR y los ingresos anteriores. Se creó otro respaldo inmediatamente antes de actualizar (`eventos-2026-10-22T09-37-47-771Z.sqlite`). La imagen anterior se conserva como `agency-eventos-app:before-admin-v4-20261022` y su código en `/root/eventos-before-admin-v4-20261022.tgz`.

Verificación: 28 pruebas de servidor aprobadas y seis recorridos de interfaz comprobados. La prueba existente de escaneo sostenido tuvo un fallo de temporización en la ejecución completa y pasó al repetirse aisladamente. Verificación externa por HTTPS: salud, nuevas rutas administrativas, datos existentes, igualdad de los siete QR decodificados e ingresos previos conservados. No se acreditaron personas ni se enviaron correos como parte de esta verificación.

El usuario decidió posponer proveedor y remitente; `MAIL_ENABLED=false`. Los controles de envío permanecen deshabilitados. La futura integración HTTPS debe usar la misma auditoría y reserva de la cola. La migración v4 no es compatible con arrancar el código v3 sobre la base nueva: una recuperación debe planificarse con respaldo y conservación de cualquier dato posterior, no limitarse a cambiar la imagen.
