# Documento maestro · Eventos

## Objetivo

Construir una aplicación web de gestión de invitados y acreditación para eventos de The Agency Labs. Debe permitir que varias personas reciban asistentes desde sus celulares, consultando un estado central y sin registrar dos ingresos para una misma invitación.

Repositorio: https://github.com/Replitagencia/Eventos

Hito inmediato: **jueves 22 de octubre de 2026**, Santiago de Chile. La primera entrega prioriza un recorrido demostrable completo.

## Personas y permisos

**Administrador:** crea eventos, agrega/edita/importa invitados, visualiza QR, envía invitaciones individuales y exporta reportes. También puede acreditar.

**Operador:** consulta eventos e invitados, busca asistentes y acredita por QR o búsqueda manual. No importa, edita, exporta ni envía correo. En el MVP, todos los operadores acceden a todos los eventos de esta instalación; la asignación de eventos por operador queda pendiente.

**Invitado:** recibe un QR por correo o por entrega del administrador y lo presenta en el acceso. No necesita instalar una aplicación ni tener cuenta. El QR es una credencial transferible: el sistema impide repetir el ingreso, pero no verifica identidad física.

## Recorrido prioritario

1. Crear evento con nombre, fecha/hora y ubicación.
2. Cargar lista CSV/Excel y revisar invitados/duplicados.
3. Mostrar o descargar QR; enviar correo individual si el remitente está configurado.
4. Iniciar sesión de operador en otro navegador o celular.
5. Escanear o buscar y registrar el ingreso.
6. Ver “ACREDITADO”; repetir el QR y ver “YA INGRESÓ”.
7. Ver el dashboard actualizado y descargar el reporte final.

## Alcance implementado para el MVP

| Área | Entrega |
| --- | --- |
| Eventos | Creación y selección de eventos |
| Invitados | Alta, edición, búsqueda por nombre/correo/RUT/empresa |
| Importación | CSV y XLSX; errores por fila; duplicados omitidos |
| QR | Token aleatorio de 256 bits, ligado al evento y al invitado |
| Correo | Adaptador SMTP, envío individual confirmado y registro de estado |
| Acreditación | Cámara web, código pegado y búsqueda manual |
| Concurrencia | Actualización condicional atómica que admite un solo ingreso |
| Panel | Totales, acreditados, pendientes, porcentaje y últimas llegadas |
| Reportes | CSV con ingreso UTC, operador y método |
| Acceso | Roles, contraseñas con scrypt, cookies HttpOnly, protección de origen |

Campos de invitado: nombre completo y correo obligatorios; RUT y empresa opcionales. El correo se compara sin distinguir mayúsculas. El RUT se normaliza quitando puntos, guion y espacios; **no se valida su dígito verificador** en esta versión. No se almacena información sensible adicional.

## Plan hasta el jueves

**Base inicial:** código, documentación, muestra ficticia y verificaciones automatizadas.

**Miércoles 21:** seleccionar alojamiento con HTTPS y disco persistente; configurar dominio/remitente si se requiere correo real; definir cuentas individuales de operadores; probar cámaras de iPhone y Android; ensayo con dos teléfonos y luego con el equipo completo.

**Jueves 22, antes de la demo:** importar solo datos autorizados, verificar red, imprimir QR de respaldo, probar doble ingreso desde dos operadores, revisar reporte y disponer de búsqueda manual.

La hora exacta de presentación, aforo esperado, alojamiento, dominio y proveedor de correo todavía no están definidos.

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

## Próxima etapa

Gestión de usuarios y recuperación de claves; permisos por evento; envío masivo con cola y control de reintentos; estados de entrega/rebote mediante proveedor; historial de cambios e invalidación/reemisión de QR; invitación web personal; filtros y reportes XLSX; organización por cliente; PostgreSQL y distribución de cambios entre instancias si se necesita escalar.

No forman parte de este MVP: ventas/pagos, asientos, accesos múltiples, acreditación sin conexión, biometría, garantías de entrega de correo ni seguimiento de aperturas. Sin conexión no se confirma el ingreso: el servidor es la fuente de verdad.
