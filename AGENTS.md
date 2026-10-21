# Trabajo en este repositorio

- Leer `PROJECT.md` y `docs/arquitectura.md` antes de ampliar el alcance.
- Mantener interfaz y documentación orientadas al usuario en español.
- Priorizar el flujo de demostración del 22 de octubre de 2026; documentar cualquier cambio de arquitectura.
- No versionar `.env`, datos de invitados, credenciales, bases SQLite ni QR reales.
- No enviar correos ni desplegar infraestructura como efecto lateral de pruebas.
- Toda acreditación debe conservar la actualización SQL condicional y la auditoría del primer ingreso. No reemplazar por una comprobación únicamente en el cliente.
- No simular envíos o ingresos exitosos si el servidor no los confirma.
- Para cambios en permisos, importación, QR o ingreso: ejecutar `npm run check`. Para cambios de interfaz: ejecutar `npm run test:ui`.
- Mantener migraciones explícitas cuando cambie el esquema después de esta versión inicial.
