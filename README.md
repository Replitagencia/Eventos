# Eventos · The Agency Labs

Aplicación web de invitaciones y acreditación QR. MVP preparado para la demostración del **jueves 22 de octubre de 2026**, hora de Santiago de Chile.

## Inicio local

Requiere Node.js 24 LTS y npm.

```sh
npm ci
npm run setup
npm start
```

Abre **http://localhost:3000**. `npm run setup` crea `.env` con contraseñas aleatorias: usa `ADMIN_EMAIL` + `ADMIN_PASSWORD` para administrar y `OPERATOR_EMAIL` + `OPERATOR_PASSWORD` para acreditar. No publica las claves. Si `.env` existe, no lo reemplaza.

Con `SEED_DEMO=true`, el primer inicio crea un evento y 12 invitados **ficticios**. La información se conserva en `data/eventos.sqlite`; reiniciar no borra ingresos. No hay botón de reinicio destructivo. Para otro ensayo, crea un nuevo evento e importa la plantilla.

## Qué funciona

- Acceso con contraseña, sesión privada de 12 horas y roles administrador/operador.
- Crear eventos con fecha y lugar; seleccionar entre distintos eventos.
- Agregar y editar invitados; buscar nombre, correo, RUT o empresa.
- Importar `.csv` o `.xlsx`, hasta 1.000 filas / 2 MB. Valida antes de insertar y omite duplicados por correo o RUT dentro del evento.
- Generar, visualizar y descargar un QR único por invitado/evento.
- Escanear desde la cámara del navegador o acreditar manualmente con confirmación.
- Registrar un único ingreso con fecha, método y operador; rechazar QR inválido o de otro evento.
- Actualizar paneles y listas de operadores conectados mediante eventos del servidor (SSE).
- Exportar reporte CSV con estado, fecha UTC y operador. Excel puede abrirlo.
- Revisar y enviar una invitación HTML personalizada con el QR integrado en el primer correo cuando se configura SMTP. El invitado no necesita registrarse ni confirmar antes. El envío está desactivado por defecto.

## Configuración y alcance

La plantilla de configuración está en [`.env.example`](.env.example). No subir `.env`, bases de datos ni listas reales al repositorio: **el repositorio GitHub es público**.

El MVP utiliza un servidor Node/Express y una base SQLite compartida por todos los dispositivos. Para la prueba móvil se necesita desplegar **una sola instancia con disco persistente y HTTPS**, o un túnel HTTPS controlado que apunte a esa instancia. La URL local en este computador no es una URL de acceso desde otros teléfonos. Ver [despliegue y correo](docs/operacion.md).

La cámara requiere permiso del usuario y HTTPS, salvo localhost. Hay alternativa manual si el dispositivo no permite escanear. Compatibilidad real de iOS/Android, red del recinto y capacidad con 10 teléfonos deben ensayarse antes del evento.

El adaptador de correo está implementado, pero no se ha configurado ni enviado correo real. “Enviada” indica aceptación SMTP; no confirma entrega, lectura ni apertura. No se implementan envío masivo, seguimiento de aperturas ni reenvío de invitaciones ya aceptadas.

## Verificación

```sh
npm run check
npx playwright install chromium
npm run test:ui
```

`npm run check` valida sintaxis y ejecuta pruebas de autenticación, roles, concurrencia de ingreso, QR generado/decodificado, importación CSV/Excel, persistencia, exportación y actualizaciones en vivo. La prueba de interfaz usa una base en memoria y simula administrador de escritorio y operador móvil. No envía correos ni altera los datos locales.

En equipos con Chrome instalado se puede usar `PLAYWRIGHT_CHROME=1 npm run test:ui`. GitHub Actions ejecuta ambas verificaciones en Node 24.

## Documentos del proyecto

- [Documento maestro y prioridades](PROJECT.md)
- [Arquitectura y decisiones técnicas](docs/arquitectura.md)
- [Guion de demostración y aceptación](docs/demo-jueves.md)
- [Operación, despliegue y correo](docs/operacion.md)
- [Plantilla CSV de invitados](public/plantilla-invitados.csv)

## Estructura

```text
src/                  API, sesiones, datos, importación y correo
public/               Panel web responsive y plantilla CSV
scripts/setup.js       Configuración local con claves únicas
tests/                Pruebas de API e interfaz
docs/                 Arquitectura, operación y demostración
data/                 Base local persistente (excluida de Git)
.github/workflows/     Verificación automatizada
```
