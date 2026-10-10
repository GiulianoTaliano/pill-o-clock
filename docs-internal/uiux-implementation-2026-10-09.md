# Implementación UI/UX — 9 y 10 de octubre de 2026

Implementación de la [propuesta integral](uiux-audit-2026-10-09.md) en la aplicación existente. Se mantiene la identidad de cápsula/reloj y la navegación de cinco pestañas. El trabajo reúne cambios de interfaz con correcciones del comportamiento que esa interfaz comunica.

## Cambios por recorrido

| Recorrido | Resultado implementado |
|---|---|
| Hoy | Agenda de la persona activa, fecha, accesos con nombre a Calendario/Citas, progreso de tomas y separación entre pendientes y registros completados. PRN sigue disponible aunque no haya dosis programadas. |
| Registrar, omitir y posponer | Acción principal explícita, motivos seleccionables y confirmación de omisión. Cancelar no registra nada. Operaciones esperadas antes de cerrar; bloqueo de doble toque; errores conservan contexto. Postergaciones persistentes, incluida fecha efectiva cuando cruzan medianoche. |
| Medicamentos | Búsqueda y filtros, tarjetas simplificadas, pausa/reactivación y archivo con motivos opcionales y cancelación. Alta en tres etapas: medicamento, pauta y revisión; edición directa; validación y revisión de próximos recordatorios. |
| Historial | Detalle de cada registro, notas/motivo/sitio, filtros por medicamento/estado/día, semana/mes y deshacer. Los eventos históricos se conservan como registros y no se reconstruyen desde una pauta modificada. |
| Calendario y citas | Indicadores distintos de medicación y citas, resumen del día, accesos al detalle y creación por fecha. Fecha/hora local, cita sin hora, opción explícita sin aviso y aviso a la hora de la cita. Documentos con carga, error, alcance por cita y operaciones esperadas. |
| Salud y diario | Vista general por métrica, acceso a lecturas y tendencias, períodos, listado ampliable y edición. Números decimales completos con punto/coma; check-in precargado por fecha; selección accesible. |
| Ajustes | Seis grupos: Recordatorios, Personas y salud, Datos y compartir, Accesibilidad y apariencia, Idioma y catálogo, Información. Estado real de permisos, recuperación al volver del sistema y prueba de notificación de cinco segundos con alcance explicado. |
| Primer uso | Progreso y contenido desplazable. Omitir/continuar no pide permisos; habilitar recordatorios es una acción independiente. |
| Alergias y emergencia | Carga/error recuperables, distinción entre ausencia de datos y ausencia confirmada de alergias, persona identificada y pautas completas de tratamientos vigentes. |
| Compartir | Preparación con persona, período y contenido antes del PDF; revisión previa de resumen para cuidador y FHIR. Pautas completas, datos sin recorte de 200 registros y contenido escapado en HTML. |
| Respaldo/restauración | Formato v4 portable con fotos/documentos locales, vista previa del alcance y conflictos, mezcla/reemplazo y compatibilidad con versiones anteriores. Cancelar la contraseña no equivale a exportar sin cifrado. Perfil activo reconciliado tras restaurar. |
| Widget y alarmas | Estados explícitos de pendientes, día registrado y ausencia de planificación; persona, idioma y hora efectiva. Un dato de otro día deja de afirmar que el día actual está completado. Cantidad efectiva compartida con la alarma. |

## Sistema visual y accesibilidad

- Paleta semántica compartida en claro/oscuro: fondo, superficies, texto, bordes, estados y acción. Los enlaces claros del modo oscuro y los fondos de botones utilizan roles diferentes para conservar contraste.
- Tarjetas neutrales con jerarquía de hora, medicamento/cantidad y siguiente acción; los estados no dependen únicamente del color.
- Botones y opciones con áreas táctiles amplias, roles, selección, deshabilitado y actividad accesibles. Etiqueta breve «Medicinas» en la navegación española; destino y nombre accesible «Medicamentos».
- Navegación con etiquetas que admiten varias líneas y altura que responde al tamaño de texto del sistema.
- Mensajes de error persistentes y cerrables, cola de avisos, anuncio accesible y recuperación localizada tras errores de carga.
- Preferencia de movimiento reducido aplicada a esqueletos y transiciones de los componentes compartidos renovados.
- «Tarjetas de tomas grandes» describe su alcance real; no se presenta como un cambio de tamaño de toda la aplicación.

## Integridad y continuidad

El registro y la modificación de stock se guardan juntos. Cada toma consume una unidad de existencia; deshacer repone exactamente el cambio que ocurrió, incluso cuando el stock anterior era cero. Las operaciones de una misma medicación se serializan.

Las cargas antiguas no pueden publicar datos de otra persona ni reintroducir medicamentos después de un borrado. Cambiar de perfil limpia también citas, documentos, salud, diario y selección. El borrado global cancela alarmas nativas, notificaciones y postergaciones; la eliminación de datos es transaccional.

Los avisos de guardado parcial diferencian el registro persistido de un recordatorio que necesita revisión. Una operación secundaria fallida no invita a duplicar la toma o el tratamiento.

Health Connect sólo recibe mediciones cuya pertenencia al perfil principal está explícitamente establecida. La ausencia de propietario en datos antiguos no se considera autorización para atribuirlos a esa persona.

## Validación

| Comprobación | Resultado |
|---|---|
| TypeScript `npx tsc --noEmit` | Correcto |
| Lint del proyecto `npm run lint` | Correcto, sin errores ni advertencias |
| Jest completo `npx jest --runInBand --forceExit` | 45 suites, 478 pruebas correctas |
| Compilación Android | `assembleDebug`, módulos Kotlin de alarmas/widget y arquitectura x86_64 correctos |
| Bundle Android de producción | Exportación Hermes local correcta; sin publicación |

Las pruebas cubren, entre otros casos, cancelación de omisión, doble toque, error y reintento, navegación después de guardar, pautas/fechas/stock, postergación nocturna, cambio de persona durante cargas, borrado durante una carga, recuperación de datos, selección de permisos y alcance de exportaciones. El informe prueba 301 mediciones y preservación del historial archivado.

La comprobación manual utiliza un Pixel 9 emulado en una instancia temporal del AVD, con datos ficticios. Se verificaron primer uso sin permiso automático, cambio de idioma, alta de tres pasos, edición/guardado, omisión cancelada, temas claro/oscuro, persistencia tras arranque en frío, guardado de una medición con coma decimal y registro/deshacer desde Historial. Se revisaron Inicio y el formulario con la escala de texto del sistema al 200% tras reiniciar la app; el campo numérico de dosis se amplió para conservar espacio de lectura.

[Inicio real en modo claro](uiux-implementation-2026-10-09-home-light.png) · [Modo oscuro](uiux-implementation-2026-10-09-home-dark.png) · [Inicio al 200%](uiux-implementation-2026-10-09-text200.png) · [Formulario al 200%](uiux-implementation-2026-10-09-form-text200.png). Las capturas locales adicionales están en `screenshots/uiux-implementation-2026-10-09/`.

## Límites y seguimiento

La implementación y las pruebas automatizadas no sustituyen un estudio de usabilidad. Quedan por validar en dispositivos físicos iOS/Android las alarmas con app cerrada, bloqueo y restricciones de batería, la lectura completa con VoiceOver/TalkBack, el refresco prolongado del widget y las hojas externas de compartir/restaurar. La escala al 200% se comprobó tras un arranque: cambiarla con el proceso abierto produjo una redistribución transitoria incorrecta en el entorno de desarrollo, que se recuperó al reiniciar; este cambio en caliente requiere comprobación en una build de distribución. La prueba de cinco segundos es una notificación y no acredita por sí sola una alarma de pantalla completa.

La protección de cambios pendientes y la conservación del formulario ante errores están implementadas. Los borradores persistentes que sobreviven a terminar el proceso quedan como evolución posterior. El widget invalida información de otro día y se actualiza desde el estado de la app; no se afirma que Android ejecute refrescos con puntualidad exacta.

No se realizaron envíos a contactos, llamadas, commits ni despliegues.

## Revisión previa al release 1.8.0 (10 de octubre)

Antes de publicar se revisó el cambio completo por áreas (datos, alarmas/estado, pantallas, componentes/i18n). Se corrigió:

- La alarma cerrada con «Cerrar recordatorio», gesto atrás o desmontaje sin registrar ya no la silencia del todo: usa `dismissAlarm()` (mismo camino que deslizar la notificación: aviso silencioso y re-recordatorio). El botón atrás vuelve a estar bloqueado en la pantalla de alarma.
- Repetir el mismo estado sobre una toma ya registrada vuelve a cancelar los recordatorios que hubieran quedado armados.
- Omitir/continuar el primer uso prepara canales y tarea en segundo plano en esa misma sesión, sin pedir permiso; el permiso se solicita al guardar el primer medicamento con horario si el sistema nunca lo preguntó.
- Las transacciones asíncronas de SQLite se encolan para que no se superpongan sobre la conexión compartida.
- Respaldo: un adjunto ilegible ya no impide exportar (se informa cuántos quedaron afuera), la mezcla no revive horarios eliminados de un medicamento existente y el reemplazo acepta alergias que sólo difieren en mayúsculas.
- Historial pide confirmación antes de deshacer un registro; la vista previa del color personalizado muestra el color elegido; claves únicas en Calendario para tomas pospuestas más allá de medianoche; el selector de ubicación no confirma mientras localiza; el widget conserva una línea por texto y admite cambio de alto.

Quedan para seguimiento, por ser previos a este cambio o de menor alcance: reprogramación al editar/reactivar que ignora tomas registradas y postergaciones, re-armado al deshacer una toma vencida, mensajes de error que quedan detrás de hojas modales, alergias omitidas del PDF al excluir medicamentos y la clase `bg-primary/10` sin definir.
