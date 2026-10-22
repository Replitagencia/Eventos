# Eventos · The Agency Labs

Aplicación web de invitaciones y acreditación QR. MVP preparado para la demostración del **jueves 22 de octubre de 2026**, hora de Santiago de Chile.

Servidor de pruebas publicado: [Administración](https://test.registroevento.cl/) · [Acreditación móvil](https://test.registroevento.cl/acreditacion/). Base independiente, acceso privado y correo aún desactivado. Ver [estado del despliegue](docs/despliegue.md).

## Inicio local

Requiere Node.js 24 LTS y npm.

```sh
npm ci
npm run setup
npm start
```

Abre **http://localhost:3000** para administrar y **http://localhost:3000/acreditacion/** para el operario móvil. `npm run setup` crea `.env` con contraseñas aleatorias: usa `ADMIN_EMAIL` + `ADMIN_PASSWORD` para administrar y `OPERATOR_EMAIL` + `OPERATOR_PASSWORD` para acreditar. No publica las claves. Si `.env` existe, no lo reemplaza.

Con `SEED_DEMO=true`, el primer inicio crea un evento y 12 invitados **ficticios**, y asigna ese evento de ejemplo a la cuenta de operario. En instalaciones existentes o eventos nuevos, asignar el acceso desde **Acceso operarios → Asignar operarios**. La información se conserva en `data/eventos.sqlite`; reiniciar no borra ingresos. No hay botón de reinicio destructivo. Para otro ensayo, crea un nuevo evento e importa la plantilla.

## Qué funciona

- Dos aplicaciones con sesiones separadas: planificación para el administrador y acreditación móvil para el operario.
- Asignación y revocación de acceso de operarios por evento desde el panel.
- Crear eventos con fecha y lugar; seleccionar entre distintos eventos.
- Registro interno con ficha por invitado: datos, fecha de alta, correos e ingreso. Agregar, editar y buscar por nombre, correo, RUT o empresa.
- Filtrar por asistencia y estado de correo; consultar intentos enviados o por revisar, con destinatario y administrador solicitante.
- Importar `.csv` o `.xlsx`, hasta 1.000 filas / 2 MB. Valida antes de insertar y omite duplicados por correo o RUT dentro del evento.
- Generar, visualizar y descargar un QR único por invitado/evento.
- Escanear continuamente desde la aplicación móvil: activar la cámara una vez y presentar los QR uno tras otro, sin botones entre personas. También permite buscar asistentes y acreditar manualmente con confirmación. La búsqueda devuelve hasta 20 coincidencias, con correo y RUT parcialmente ocultos.
- Registrar un único ingreso con fecha, método y operador; rechazar QR inválido o de otro evento.
- Actualizar el panel administrador en vivo mediante SSE. La aplicación de acceso consulta permisos y búsquedas activas cada 15 segundos; cada acreditación se valida inmediatamente en el servidor.
- Exportar un CSV de invitados/ingresos y otro del historial de correos. Excel puede abrirlos.
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
- [Servidor exclusivo y publicación en test.registroevento.cl](docs/despliegue.md)
- [Plantilla CSV de invitados](public/plantilla-invitados.csv)

## Estructura

```text
src/                  API, sesiones, datos, importación y correo
public/               Panel administrador y plantilla CSV
public/acreditacion/   Aplicación móvil exclusiva de operarios
scripts/setup.js       Configuración local con claves únicas
tests/                Pruebas de API e interfaz
docs/                 Arquitectura, operación y demostración
data/                 Base local persistente (excluida de Git)
.github/workflows/     Verificación automatizada
```

## Administración de invitaciones

En **Diseño de invitación**, personaliza el correo por evento: asunto, textos, colores, logo e imagen (PNG/JPG/WebP, máximo 350 KB cada una). Revisa la vista previa con QR y guarda el diseño.

En **Invitados**, agrega categorías (general, VIP, prensa, equipo y proveedores) y notas internas. La ficha incluye QR, confirmación, historial de correo y datos del ingreso. CSV/XLSX acepta también `categoria` y `notas`; ambas son opcionales. Los reportes CSV incluyen estos campos y la confirmación.

En **Correos**, envía una prueba a tu dirección o prepara un lote por categoría. Antes de confirmar se muestra la lista de destinatarios. Los lotes incluyen solo invitaciones por enviar; los reenvíos se solicitan individualmente desde **Ver invitación**. La cola persiste y continúa si cierras el navegador. Los fallos o envíos interrumpidos requieren revisión; no se reintentan automáticamente. Una prueba lleva un QR sin acceso válido y no cambia el estado de ningún invitado.

El correo incluye **Asistiré / No podré asistir**. El invitado confirma su elección en una página móvil; abrir el enlace no registra la respuesta. No necesita cuenta. Confirmación e ingreso son independientes y el QR se entrega desde el primer correo.

El envío real permanece deshabilitado hasta configurar el proveedor y remitente. En el servidor DigitalOcean se requiere una futura integración por HTTPS; no basta con habilitar SMTP. Ver [despliegue](docs/despliegue.md).

### Pase QR con marca

En **Diseño de invitación → Diseño del pase QR**, elige el estilo, texto y color del QR. Usa **Vista previa del pase QR** y guarda. En la ficha o invitación de cada persona, abre **Ver pase con diseño → Descargar pase PNG**. Incluye logo, evento, nombre, categoría, fecha y lugar; mantiene el mismo acceso individual. Los colores claros del QR se oscurecen automáticamente y el logo queda fuera del código para conservar su lectura.
