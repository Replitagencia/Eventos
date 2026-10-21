# Documento maestro · Eventos

## Objetivo

Construir una aplicación web de gestión de invitados y acreditación para eventos de The Agency Labs. Debe permitir que varias personas reciban asistentes desde sus celulares, consultando un estado central y sin registrar dos ingresos para una misma invitación.

Repositorio: https://github.com/Replitagencia/Eventos

Hito inmediato: **jueves 22 de octubre de 2026**, Santiago de Chile. La primera entrega prioriza un recorrido demostrable completo.

## Personas y permisos

**Administrador:** crea eventos, agrega/edita/importa invitados, visualiza QR, envía invitaciones individuales y exporta reportes. Asigna las cuentas que pueden acreditar cada evento y observa sus ingresos en vivo.

**Operador:** entra por `/acreditacion/`, con su cuenta y sesión propias. Solo ve los eventos asignados, el escáner, una búsqueda de hasta 20 coincidencias con identificadores parcialmente ocultos y el resultado del ingreso. No accede a planificación, listados completos, fichas administrativas, correo, reportes o estadísticas. La API aplica la separación aunque se intenten consultar esas rutas directamente.

**Invitado:** recibe directamente la invitación diseñada y su QR personal en el primer correo, y lo presenta en el acceso. No hay formulario de registro ni confirmación de asistencia previa al QR. No necesita instalar una aplicación ni tener cuenta. El QR es una credencial transferible: el sistema impide repetir el ingreso, pero no verifica identidad física.

## Recorrido prioritario

1. Crear evento con nombre, fecha/hora y ubicación.
2. Cargar lista CSV/Excel y revisar invitados/duplicados.
3. Revisar la vista previa personalizada (destinatario, asunto, fecha, lugar y QR) y enviar el primer correo con el pase de ingreso incluido. El envío requiere remitente configurado; la vista previa y descarga funcionan sin correo.
4. Asignar el operario al evento desde Acceso operarios y abrir `/acreditacion/` en su celular con las credenciales de operario.
5. Escanear o buscar y registrar el ingreso.
6. Ver “ACREDITADO”; repetir el QR y ver “YA INGRESÓ”.
7. Ver el dashboard actualizado y descargar el reporte final.

## Alcance implementado para el MVP

| Área | Entrega |
| --- | --- |
| Eventos | Creación y selección de eventos |
| Invitados | Registro interno, fecha de alta, ficha individual, edición y búsqueda por nombre/correo/RUT/empresa |
| Importación | CSV y XLSX; errores por fila; duplicados omitidos |
| QR | Token aleatorio de 256 bits, ligado al evento y al invitado |
| Correo | Invitación HTML personalizada con QR integrado, vista previa, SMTP individual y registro de estado |
| Acreditación | Aplicación móvil y API independientes, cámara web, código pegado y búsqueda limitada |
| Concurrencia | Actualización condicional atómica que admite un solo ingreso |
| Panel | Totales, acreditados, pendientes, porcentaje y últimas llegadas |
| Reportes | CSV de invitados/ingresos y CSV independiente del historial de correos |
| Acceso | Roles, contraseñas con scrypt, cookies HttpOnly, protección de origen |

Campos de invitado: nombre completo y correo obligatorios; RUT y empresa opcionales. El correo se compara sin distinguir mayúsculas. El RUT se normaliza quitando puntos, guion y espacios; **no se valida su dígito verificador** en esta versión. No se almacena información sensible adicional.

## Plan hasta el jueves

**Base inicial:** código, documentación, muestra ficticia y verificaciones automatizadas.

**Miércoles 21:** seleccionar alojamiento con HTTPS y disco persistente; configurar dominio/remitente si se requiere correo real; definir cuentas individuales de operadores; probar cámaras de iPhone y Android; ensayo con dos teléfonos y luego con el equipo completo.

**Jueves 22, antes de la demo:** importar solo datos autorizados, verificar red, imprimir QR de respaldo, probar doble ingreso desde dos operadores, revisar reporte y disponer de búsqueda manual.

La hora exacta de presentación, aforo esperado y proveedor de correo todavía no están definidos. El servidor exclusivo DigitalOcean y el dominio `test.registroevento.cl` fueron publicados el 21 de octubre; ver [despliegue](docs/despliegue.md).

## Criterios de aceptación

- Crear un evento y cargar una lista con acentos, duplicados y una fila inválida.
- No insertar parcialmente una lista inválida; informar la fila con error.
- Obtener un QR legible que no contenga nombre, RUT ni correo.
- Rechazar un QR de otro evento.
- De 20 solicitudes concurrentes para el mismo invitado, aceptar exactamente una.
- Mantener la hora/operador del primer ingreso al repetir una acreditación.
- Actualizar un segundo navegador sin recargarlo manualmente.
- Conservar datos al reiniciar el servicio.
- Impedir acciones administrativas desde la cuenta de operador.
- Exportar un reporte que cuadre con los totales del panel.
- Si el correo no está configurado, comunicarlo sin simular un envío.

## Referencia de experiencia

Se toma como referencia la invitación por correo y gestión de invitados de Bice Vida. Para Eventos, la decisión confirmada es entregar el QR **directamente en el primer correo**. La persona no debe registrarse ni confirmar asistencia antes de recibirlo. La vista previa y el envío comparten la misma plantilla, con nombre del invitado, nombre del evento, fecha, lugar y pase QR. El escaneo en acceso registra la llegada, no una confirmación previa.

## Registro interno

El registro es administrativo; lo mantiene el equipo organizador. No es un formulario público que deba completar el invitado. Cada ficha muestra sus datos, fecha de alta cuando existe, estado de la invitación, historial de intentos de correo y el ingreso con fecha, método y operador. La lista permite combinar búsqueda, asistencia y estado de correo. Los correos se generan desde esa ficha y se revisan antes del envío.

El historial conserva destinatario, nombre, remitente, asunto, fecha, administrador solicitante y resultado de cada intento. Editar los datos actuales no reescribe el historial. “Enviada” significa aceptada por SMTP, no recibida ni leída; “Por revisar” indica que no se confirmó la aceptación. La vista previa no se registra como envío.

## Próxima etapa

Gestión de usuarios y recuperación de claves; envío masivo con cola y control de reintentos; estados de entrega/rebote mediante proveedor; historial de cambios e invalidación/reemisión de QR; invitación web personal; filtros y reportes XLSX; organización por cliente; PostgreSQL y distribución de cambios entre instancias si se necesita escalar.

No forman parte de este MVP: ventas/pagos, asientos, accesos múltiples, acreditación sin conexión, biometría, garantías de entrega de correo ni seguimiento de aperturas. Sin conexión no se confirma el ingreso: el servidor es la fuente de verdad.

## Separación de la operación móvil

La acreditación es una aplicación de acceso separada de la planificación, con HTML, estilos, JavaScript, inicio de sesión y API propios. Comparte únicamente el servidor y la base central para que los ingresos se reflejen en la administración. No es una aplicación nativa ni un servicio alojado en otro dominio; esas opciones se pueden evaluar después. El operario no navega el panel administrativo ni descarga su información.
