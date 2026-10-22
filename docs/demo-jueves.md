# Demostración · jueves 22 de octubre de 2026

Duración sugerida: 7–10 minutos. Zona horaria: America/Santiago.

## Preparar

1. Arrancar la aplicación e ingresar como administrador con los valores de `.env`.
2. En **Acceso operarios**, asignar la cuenta al evento. Abrir otro navegador/perfil en `/acreditacion/` como operario. Para celulares reales, usar el dominio HTTPS con esa ruta.
3. Tener un QR abierto en otra pantalla o impreso; un teléfono no puede apuntar su cámara a su propia pantalla.
4. Usar invitados ficticios y no compartir contraseñas en la presentación.
5. El primer correo incluye directamente el QR; no se requiere registro ni confirmación de asistencia. Si el correo es parte de la demostración, completar SMTP y hacer antes un envío autorizado a una dirección de prueba controlada. Sin SMTP, mostrar y descargar QR.

## Recorrido

| Tiempo | Acción | Resultado esperado |
| --- | --- | --- |
| 0–1 min | Mostrar resumen del evento | Totales y últimas llegadas |
| 1–2 min | Crear un evento de ensayo | Nombre, fecha y ubicación |
| 2–3 min | Importar `public/plantilla-invitados.csv` | 2 invitados nuevos |
| 3 min | Volver a importar el archivo | 0 nuevos, 2 duplicados omitidos |
| 3–4 min | Abrir “Ver invitación” de un invitado | Correo diseñado, fecha/lugar y QR personal |
| 4–5 min | Escanear desde el operador | “ACREDITADO” y hora |
| 5 min | Volver a escanear el mismo QR | “YA INGRESÓ”; total sin duplicar |
| 5–6 min | Buscar otro invitado y confirmar manualmente | Segundo ingreso registrado |
| 6–7 min | Abrir Ver ficha y volver al panel | Datos, correo, hora de ingreso y operador |
| 7–8 min | Filtrar invitados y descargar los reportes | CSV de invitados/ingresos e historial de correos |

Activar la cámara una sola vez. Después de cada resultado, retirar el QR y presentar el siguiente: la cámara permanece encendida y el escaneo continúa automáticamente tras una pausa de 1,4 segundos. Mantener un QR frente al lente no repite la solicitud; al retirarlo al menos 1,8 segundos y volver a mostrarlo se verifica nuevamente y debe aparecer “YA INGRESÓ”. “Detener cámara” funciona incluso mientras se espera la respuesta. Si no se confirma una operación por error de red, revisar el resultado y reactivar la cámara; reintentar conserva siempre el primer ingreso.

## Ensayos antes de presentarlo

- Dos operadores escanean el mismo QR al mismo tiempo: solo uno debe acreditar.
- Un QR de otro evento se rechaza.
- El operario no ve planificación ni invitados completos. Al revocarle un evento, deja de poder buscar y acreditar en él.
- Una persona sin QR se encuentra por búsqueda manual.
- Desconectar temporalmente un dispositivo: debe mostrar reconexión y nunca confirmar un ingreso sin respuesta del servidor.
- Reiniciar la aplicación: invitados e ingresos siguen presentes.
- Probar cámara real en Safari iOS y Chrome Android. Las pruebas automatizadas de viewport móvil no sustituyen esta comprobación.
- Validar con la cantidad prevista de celulares y la red del recinto. La prueba de 20 solicitudes de ingreso verifica exclusión de duplicados; no certifica capacidad ni tiempos máximos de respuesta.

## Estado al preparar el repositorio

Flujo local, importación y acreditación continua implementados y publicados con HTTPS en `test.registroevento.cl`. Configuración de correo real, ensayo con cámaras físicas y prueba en la red del recinto pendientes. El reporte descargado es CSV, no un archivo XLSX nativo.
