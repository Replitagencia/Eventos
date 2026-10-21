# Demostración · jueves 22 de octubre de 2026

Duración sugerida: 7–10 minutos. Zona horaria: America/Santiago.

## Preparar

1. Arrancar la aplicación e ingresar como administrador con los valores de `.env`.
2. Abrir otro navegador/perfil como operador. Para celulares reales, usar la misma dirección HTTPS en ambos dispositivos.
3. Tener un QR abierto en otra pantalla o impreso; un teléfono no puede apuntar su cámara a su propia pantalla.
4. Usar invitados ficticios y no compartir contraseñas en la presentación.
5. Si el correo es parte de la demostración, completar SMTP y hacer antes un envío autorizado a una dirección de prueba controlada. Sin SMTP, mostrar y descargar QR.

## Recorrido

| Tiempo | Acción | Resultado esperado |
| --- | --- | --- |
| 0–1 min | Mostrar resumen del evento | Totales y últimas llegadas |
| 1–2 min | Crear un evento de ensayo | Nombre, fecha y ubicación |
| 2–3 min | Importar `public/plantilla-invitados.csv` | 2 invitados nuevos |
| 3 min | Volver a importar el archivo | 0 nuevos, 2 duplicados omitidos |
| 3–4 min | Abrir “Ver QR” de un invitado | QR descargable y nombre |
| 4–5 min | Escanear desde el operador | “ACREDITADO” y hora |
| 5 min | Volver a escanear el mismo QR | “YA INGRESÓ”; total sin duplicar |
| 5–6 min | Buscar otro invitado y confirmar manualmente | Segundo ingreso registrado |
| 6–7 min | Volver al panel y descargar reporte | Totales, hora, operador y método |

La cámara se detiene tras leer un QR para permitir revisar el resultado; pulsar “Activar cámara” para el siguiente invitado.

## Ensayos antes de presentarlo

- Dos operadores escanean el mismo QR al mismo tiempo: solo uno debe acreditar.
- Un QR de otro evento se rechaza.
- Una persona sin QR se encuentra por búsqueda manual.
- Desconectar temporalmente un dispositivo: debe mostrar reconexión y nunca confirmar un ingreso sin respuesta del servidor.
- Reiniciar la aplicación: invitados e ingresos siguen presentes.
- Probar cámara real en Safari iOS y Chrome Android. Las pruebas automatizadas de viewport móvil no sustituyen esta comprobación.
- Validar con la cantidad prevista de celulares y la red del recinto. La prueba de 20 solicitudes de ingreso verifica exclusión de duplicados; no certifica capacidad ni tiempos máximos de respuesta.

## Estado al preparar el repositorio

Flujo local, importación y acreditación implementados. Configuración SMTP real, alojamiento HTTPS, ensayo con cámaras físicas y prueba en la red del recinto pendientes. El reporte descargado es CSV, no un archivo XLSX nativo.
