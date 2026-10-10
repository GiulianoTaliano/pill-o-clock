# Auditoría UI/UX: inicio, ajustes, perfiles y accesibilidad transversal

Fecha de referencia: 9 de octubre de 2026, Argentina. Revisión del código `c820ad2`. Este documento es una subauditoría para integrar al informe general; no modifica la app.

## Alcance y nivel de evidencia

Se revisaron onboarding, navegación raíz y pestañas, todos los controles de Ajustes, perfiles, bloqueo, selección de sonido, exportación/restauración, mensajes de error y confirmación, temas, traducciones y servicios relacionados. Se inspeccionaron dos capturas históricas: `a11y-report/sprint3-om/settings.png` y `onboarding.png`. Estas capturas muestran una versión anterior — seis diapositivas y pestaña Turnos — y **no prueban el aspecto del código actual**. La evaluación visual actual se apoya en la estructura y tokens del código; los problemas de recorte, teclado, foco y lectores de pantalla requieren la prueba nativa indicada.

Clasificación: **D** = demostrable en código o cálculo; **V** = hipótesis que requiere validación en dispositivo. P0 = daño o pérdida grave e inmediata confirmada; P1 = bloqueo, fiabilidad, pérdida de datos, identidad o barrera importante; P2 = claridad, consistencia, eficiencia o pulido. No se confirma ningún P0 por ejecución en esta subauditoría. Los problemas de identidad y respaldo pueden escalar a P0 si la prueba nativa confirma pérdida irrecuperable o uso de datos de otra persona.

## Inventario de acciones y estados

### Inicio y navegación

| Acción | Comportamiento implementado y estados | Evaluación / siguiente nivel |
|---|---|---|
| Abrir por primera vez | Inicializa idioma y base, carga datos y reemplaza ruta por onboarding; splash hasta listo. `app/_layout.tsx:85` | Añadir recuperación del error de arranque y medir tiempo hasta interactivo; no dejar un texto técnico como único estado. |
| Abrir normalmente | Configura notificaciones, migra bloqueo, carga datos, registra tarea y puede emitir dos alertas de permisos. `app/_layout.tsx:111` | Un diagnóstico de recordatorios persistente permite resolver cada requisito sin competir con la navegación inicial. |
| Abrir desde alarma | Detecta URL inicial y permite datos/alarma sin onboarding; alarma exenta de bloqueo. `app/_layout.tsx:101`, `components/AppLockGate.tsx:42` | Mantener este criterio: la acción urgente debe estar disponible. Validar retorno a app bloqueada y a onboarding pendiente. |
| Cambiar de pestaña | Hoy, Historial, Medicamentos, Salud, Ajustes; Calendario y Turnos ocultos en barra. `app/(tabs)/_layout.tsx:90` | Mantener etiquetas; comprobar descubrimiento de Turnos y Calendario desde accesos secundarios. Texto de barra 11 px y ancho repartido entre cinco destinos requieren evaluación a 200% y 320 dp. |
| Detalle global de turno | Cierra modal para editar en Turnos; borrar llama store y cierra. `app/(tabs)/_layout.tsx:48` | Validar foco restaurado al origen y feedback de error al borrar; pantalla auditada en documento de Turnos. |
| Volver a foreground | Recarga registros de hoy y reprograma; errores de reprogramación ignorados. `app/_layout.tsx:186` | Un fallo debe actualizar el diagnóstico de recordatorios; la apertura de la app no basta para demostrar que están activos. |
| Fallar inicialización | Texto `String(e)` en pantalla; no botón. `app/_layout.tsx:198` | Error en lenguaje humano, reintentar y acceso a ayuda sin eliminar datos. |
| Fallar render | Fallback ES/EN, mensaje técnico, Reintentar; fondo blanco. `components/ErrorBoundary.tsx:43` | Localizar según idioma, conservar tema y distinguir recuperación posible de error persistente. |

### Onboarding: todas las acciones

| Acción / estado | Implementación | Evaluación / siguiente nivel |
|---|---|---|
| Ver bienvenida | Ilustración, título, explicación y cuatro chips; cinco diapositivas en total. `app/onboarding.tsx:39` | Reducir descripción promocional; ofrecer primer medicamento como resultado de la introducción. Los chips no son acciones, aunque se parecen visualmente a controles. |
| Siguiente | Desplazamiento horizontal animado + háptica; último cambia a Comenzar. `app/onboarding.tsx:104` | Anunciar nombre y posición del paso; no mover foco a contenido fuera de pantalla. |
| Deslizar | Paging, índice actualizado al terminar movimiento. `app/onboarding.tsx:194` | Dar alternativa ya existente con Siguiente; probar lectura secuencial de slides no visibles. |
| Tocar indicador | Destino directo, etiqueta traducida y selected, área 44 × 44. `app/onboarding.tsx:340` | Buena base; describir también título, p. ej. «Alarmas, paso 2 de 5». |
| Omitir | Pide permiso de notificaciones, guarda onboarding completo, entra a pestañas. `app/onboarding.tsx:163` | Omitir debe llevar a la app sin un diálogo inesperado; solicitar al crear primer recordatorio o mediante explicación contextual. |
| Activar notificaciones | Pendiente, concedido, denegado; al conceder comprueba requisitos Android. `app/onboarding.tsx:120` | Pending no tiene texto/carga visible; denegado no incluye botón a ajustes. Añadir «Permitir más tarde» explícito y reintento/abrir ajustes. |
| Habilitar alarmas exactas | Abre ajustes Android y deja booleano de requisito sin refrescar. `app/onboarding.tsx:289` | Comprobar permiso real al regresar, mostrar resultado verificable. |
| Habilitar pantalla completa | Abre ajustes Android, fallback a detalles de app. `app/onboarding.tsx:137` | Revalidar al volver, guiar si pantalla del sistema no está disponible. |
| Comenzar sin permiso previo | Solicita permiso y navega inmediatamente tras resolver, aunque ahora haya permisos secundarios pendientes. `app/onboarding.tsx:151` | Mostrar estado final «Recordatorios listos / falta configurar…» y permitir salida consciente. |
| Comenzar durante solicitud | CTA sigue habilitado; puede invocar solicitud simultánea. `app/onboarding.tsx:363` | Un único estado pending para salida y permisos; prevención de doble pulsación. |
| Rotar / redimensionar | Ancho leído una vez a nivel módulo. `app/onboarding.tsx:27` | Ancho reactivo y recomposición del paso; probar multitarea y ventana web. |

### Ajustes: todas las acciones

| Acción / estado | Implementación | Evaluación / siguiente nivel |
|---|---|---|
| Consultar permiso pantalla completa | Android: carga, concedido estático o requerido pulsable; reconsulta al volver. `app/(tabs)/settings.tsx:498` | Mostrar también notificaciones, alarmas exactas y prueba de recordatorio. No transformar error de consulta en Concedido. |
| Abrir permiso pantalla completa | Petición nativa sin catch local. `app/(tabs)/settings.tsx:325` | Fallback visible y mantener estado «No se pudo comprobar» separado de denegado. |
| Expandir/contraer sonidos | Fila con valor; expansión inline; contraer y salir detienen preview. `app/(tabs)/settings.tsx:330` | Buena limpieza de audio. Mostrar expanded y chevron acorde; título largo debe pasar a segunda línea. |
| Seleccionar sonido Android | Radio visual optimista; persiste nativo; error ignorado. `components/AlarmSoundPicker.tsx:78` | Guardar sólo tras éxito o revertir; confirmación y diagnóstico de sonido audible. |
| Reproducir/detener preview | Botón iconográfico anidado en fila, estado playing. `components/AlarmSoundPicker.tsx:173` | Etiqueta «Escuchar / Detener [sonido]», selected y separación de selección/preview. |
| Lista de sonidos cargando/vacía/error | Spinner; carga fallida queda lista vacía; módulo no disponible retorna null. `components/AlarmSoundPicker.tsx:45` | Diferenciar vacío, error y función no disponible; botón Reintentar. |
| Cambiar sonido iOS | Dos opciones, actualiza estado/preferencia antes de reprogramar; éxito/error toast. `app/(tabs)/settings.tsx:224` | Si falla, comunicar que recordatorios existentes conservan sonido anterior y permitir reintento. Ofrecer preview. |
| Elegir intervalo posponer | Opciones con selected y etiqueta; háptica, persiste, refresh de categoría ignorando error. `app/(tabs)/settings.tsx:211` | Aclarar ámbito: notificación y alarma; confirmar minutos. Separar texto blanco de amber-500 insuficiente. |
| Activar bloqueo | Comprueba credencial antes de persistir; switch desactivado si dispositivo inseguro. `app/(tabs)/settings.tsx:249` | Mantener prueba previa; añadir estado de autenticación pendiente y acceso a seguridad del teléfono. |
| Desactivar bloqueo | Exige autenticación, borra flag, toast. `app/(tabs)/settings.tsx:251` | Buena protección; desactivar interacción mientras autentica; no comunicar cancelación voluntaria como error. |
| Desbloquear app | Prompt automático + botón reintento; tras 60 s en segundo plano se vuelve a bloquear. `components/AppLockGate.tsx:70` | Copy debe describir esos 60 s; ofrecer tarjeta de emergencia desde pantalla bloqueada si esa es la intención de producto. |
| Ver/cambiar perfil | Radio en Ajustes; chip sólo en Hoy y con más de un perfil. `app/(tabs)/settings.tsx:647`, `components/ProfileChip.tsx:24` | Identidad visible y selector uniforme en todos los destinos que muestran datos personales. Anunciar selección y carga. |
| Agregar perfil | Nombre requerido, seis colores, contacto opcional; al guardar cierra, crea y cambia a nuevo. `components/ProfileModal.tsx:45`, `app/(tabs)/settings.tsx:180` | Mostrar qué se creará, guardar con pending/error dentro del modal; no cerrar antes de confirmar persistencia. |
| Editar perfil | Nombre 30, contacto 50, teléfono 30; sin validación teléfono. `components/ProfileModal.tsx:72` | Etiquetas persistentes, teclado/scroll correcto, preservar borrador y señalar campos inválidos. |
| Cambiar color | Seis círculos de 36 × 36, etiqueta en inglés y sin selected semántico. `components/ProfileModal.tsx:102` | Área 48 dp, nombre localizado y check visual además de borde; selected accesible. |
| Borrar perfil extra | Confirmación con nombre y consecuencias; default protegido. `components/ProfileModal.tsx:48` | Buena prevención; estado pending, resultado y recuperación del error. Sugerir copia antes de eliminación irreversible. |
| Cancelar / atrás perfil | Cierra y descarta cambios. `components/ProfileModal.tsx:65` | Confirmar abandono sólo si hay cambios relevantes; restaurar foco al botón de origen. |
| Abrir Alergias / Emergencia | Navega a rutas del perfil activo. `app/(tabs)/settings.tsx:690` | Nombrar a la persona en fila y destino; auditar accesos para situaciones urgentes. |
| Activar Health Connect | Toggle global optimista, solicita cinco permisos; cualquier permiso basta para éxito. `app/(tabs)/settings.tsx:278`, `src/services/healthSync.ts:41` | Elegir persona propietaria del dispositivo y mostrar tipos autorizados, pendientes y fallidos. |
| Desactivar Health Connect | Elimina flag; no revoca permisos ni elimina datos externos. `src/services/healthSync.ts:57` | Copy «Dejar de copiar nuevas mediciones» y enlace a administrar datos/permisos. |
| Exportar datos | Modal de contraseña opcional; selecciona carpeta SAF, guarda JSON; spinner/error/éxito. `app/(tabs)/settings.tsx:342` | Copia completa verificable, inclusión de adjuntos, persona/alcance, destino y fecha de última copia. |
| Cifrar copia | Mínimo 6 y confirmación; botón deshabilitado sin explicación inline. `components/PassphraseModal.tsx:34` | Indicaciones al lado de campos, revelar contraseña opcional y cancelar distinto de exportar sin protección. |
| Exportar sin contraseña | Acción secundaria devuelve null y continúa. `components/PassphraseModal.tsx:75` | Explicar alcance de archivo legible; usuario debe elegir esta acción, nunca inferirse desde Atrás. |
| Cancelar exportación | Carpeta denegada cancela; Atrás en modal contraseña también devuelve null y por tanto inicia copia sin cifrar. `components/PassphraseModal.tsx:38` | Separar cancel, plain, encrypted; el gesto Atrás debe volver a Ajustes sin crear archivo. |
| Importar fusionando/reemplazando | Decide modo antes de elegir archivo; reemplazar destructivo; carga, contraseña, formato inválido, error, éxito sólo con número medicamentos. `app/(tabs)/settings.tsx:357` | Elegir archivo, vista previa con fecha/personas/totales, detectar conflictos y confirmar alcance final. |
| Abrir copia cifrada | Contraseña requerida, cancelar cancela; fallo cierra y devuelve toast. `components/PassphraseModal.tsx:21` | Reintentar dentro del modal conservando archivo; distinguir contraseña incorrecta de archivo ilegible cuando sea posible. |
| Generar informe PDF | Usa perfil activo, 30 días de logs y getters limitados para mediciones/check-ins; comparte automáticamente. `src/services/pdfReport.ts:213` | Pantalla de alcance, nombre de persona, período, preview, exportar/compartir; no atribuir envío a compartir. |
| Resumen cuidador | Perfil activo, hoy + 7 días; HTML sin nombre del paciente; comparte. `src/services/caregiverSnapshot.ts:214` | Identidad destacada, última actualización, leyenda que registrar tomada es una declaración del usuario; no prometer una página sin paginación. |
| Exportar FHIR | Nombre/contacto de perfil activo, medicación y alergias; comparte JSON. `src/services/fhirExport.ts:114` | Nombre visible antes de compartir, destinatario y alcance; información técnica secundaria. |
| Cambiar idioma | ES/EN/PT; persiste después de cambio i18n; radios sólo visuales. `app/(tabs)/settings.tsx:464` | Aplicar a recordatorios ya programados y acciones del sistema; selected accesible. |
| Elegir catálogo | Automático/Argentina/EE.UU.; actualiza preferencia y selección. `app/(tabs)/settings.tsx:473` | Mostrar país detectado en Automático y describir qué pasa con medicamentos ya guardados. |
| Elegir tema | Sistema/Claro/Oscuro; nativo usa Appearance, web persiste pero no aplica. `src/store/index.ts:53` | Tokens únicos para texto/fondo/acciones; ocultar o implementar opciones efectivas en web. |
| Texto y botones grandes | Sólo modifica DoseCard. `src/store/index.ts:44`, `components/DoseCard.tsx:228` | Expandir modo de lectura a recorridos críticos (alta, ajustes, alarmas, formularios); mantener respeto de escala de sistema. |
| Leer alarmas en voz alta | Toggle global persistido; sólo voz al abrir pantalla alarma; idioma ES usa es-ES. `src/services/tts.ts:21` | Botón «Escuchar ejemplo», aviso de voz audible en entorno y configuración de volumen/voz si aporta. |
| Ver versión | Fila estática. `app/(tabs)/settings.tsx:874` | Añadir diagnóstico compartible sin información personal cuando ayude a soporte. |
| Abrir política privacidad | URL externa sin catch. `app/(tabs)/settings.tsx:881` | Indicar abre navegador; error de conectividad con reintento. |
| Borrar todos los datos | Dos confirmaciones; cancela alarmas, borra filas, desregistra tarea, recarga; no pending/success/error local. `app/(tabs)/settings.tsx:432` | Confirmación concreta con personas/totales, acceso a copia y estado de ejecución; realmente limpiar datos personales y perfil activo. |

## Hallazgos demostrables priorizados

### SA-01 · P1 · El centro de permisos no verifica si los recordatorios están operativos (D)

**Evidencia:** `app/(tabs)/settings.tsx:498` sólo expone pantalla completa; `app/_layout.tsx:114` descarta `granted` de `setupNotifications`; `src/services/notifications.ts:288` calcula necesidad de alarma exacta por versión, sin leer concesión real. El permiso fullscreen que falla al consultar se convierte en `true` en `settings.tsx:301`. El usuario puede leer Concedido aunque falle la comprobación, o ver la app normal con notificaciones rechazadas y ninguna ruta directa de reparación.

**Solución:** agrupar «Estado de recordatorios» con notificaciones, permiso exacto si corresponde, pantalla completa y sonido. Mostrar listo, falta configurar, comprobando y no se pudo comprobar como estados distintos. Revalidar al volver y ofrecer una prueba controlada. **Aceptación:** denegar/revocar cada permiso produce estado visible con acción de reparación; fallo de API nunca aparece como concedido; conceder y volver actualiza la fila sin reiniciar.

### SA-02 · P1 · Comenzar y Omitir saltan el estado final de preparación (D)

**Evidencia:** `app/onboarding.tsx:151` solicita permiso si no fue pedido y navega directamente, aunque `handleRequestPermission` recién active las filas de alarmas exactas/fullscreen (`:125`). Omitir también solicita permiso (`:168`). Las filas no reconsultan al volver de sistema. `Comenzar` no se deshabilita durante solicitud (`:363`).

**Solución:** solicitud contextual con «Configurar recordatorios» y «Continuar por ahora»; reconsultar permisos reales y mantener una única operación pending. Llevar al primer medicamento al finalizar. **Aceptación:** Omitir no dispara diálogo imprevisto; pulsaciones repetidas producen un único permiso/navegación; denegado permite entrada consciente y deja aviso reparable.

### SA-03 · P1 · Texto blanco sobre primario oscuro y avisos positivos pierde contraste (D)

**Evidencia:** `global.css:27` fija `#4f9cff` oscuro, y `useAppTheme.ts:25` `#60a5fa`. Ambos se usan como fondo con texto blanco (`onboarding.tsx:270`, `ProfileModal.tsx:143`, `AppLockGate.tsx:123`). Cálculo sRGB: blanco/#4f9cff = **2,788:1**, blanco/#60a5fa = **2,542:1**. Toast success blanco/#16a34a = **3,296:1** y posponer blanco/#f59e0b = **2,148:1** (`ToastContext.tsx:43`, `settings.tsx:591`). Primario claro #2563eb con blanco = 5,169:1 y sí supera 4,5:1.

**Solución:** separar `primaryText`, `primaryFill`, `onPrimary`, `successFill`, `onSuccess`; usar tinta oscura sobre azul claro o fondo más oscuro con blanco. **Aceptación:** pares reales de tokens alcanzan 4,5:1 para texto normal y 3:1 para texto grande; revisar estado presionado/disabled sin exigir contraste de texto incidental a controles inactivos. Fuente: [W3C contraste mínimo](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

### SA-04 · P1 · Los controles genéricos no expresan rol ni selección accesible (D; impacto auditivo V)

**Evidencia:** `SettingRow` retorna `TouchableOpacity` sin `accessibilityRole`, `accessibilityState` o hint (`settings.tsx:128`). Esto se reutiliza en idiomas, tema, región, sonidos y exportaciones. Los radios se expresan con icono, no estado. `ProfileChip.tsx:57` y `settings.tsx:653` tampoco declaran selected. `AlarmSoundPicker.tsx:174` preview sólo tiene icono sin label.

**Solución:** contrato único para filas de botón, enlace, radio, switch y valor estático; radios con checked/selected y grupos etiquetados. Preview «Escuchar [nombre] / Detener [nombre]»; editar «Editar perfil de [persona]». **Aceptación:** TalkBack/VoiceOver anuncian nombre, rol, valor y estado; no se requiere interpretar un icono o recorrer todos los hijos para entender la acción. Referencia: [accesibilidad React Native](https://reactnative.dev/docs/accessibility).

### SA-05 · P1 · Dos toasts se superponen y los resultados no se anuncian (D)

**Evidencia:** `ToastContext.tsx:104` permite dos entradas pero cada `ToastItem` usa `position:absolute; bottom:0` (`:125`) con igual margen; se montan una encima de otra. Duración 3 s, tres líneas máximo (`:39`, `:85`), sin live region/announcement, reintento o descarte. El área inferior puede coincidir con pestañas.

**Solución:** cola de una notificación o contenedor con posiciones reales; éxito breve no intrusivo, error persistente cercano a la acción y anuncio accesible. Considerar tiempo recomendado de lectura y preferencia de animación reducida. **Aceptación:** dos eventos seguidos se leen completos en orden, nunca tapan mutuamente; TalkBack/VoiceOver anuncian cada resultado; los errores reparables mantienen una acción. Referencia: [W3C mensajes de estado](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html).

### SA-06 · P1 · Atrás en contraseña exporta sin protección en lugar de cancelar (D)

**Evidencia:** `PassphraseModal.tsx:38` ejecuta `onDone(null)` en cierre de sistema; `:75` hace lo mismo para «Sin contraseña»; `settings.tsx:347` interpreta null como exportar plain. Falta un resultado cancel distinto de plain.

**Solución:** resultado discriminado cancel/plain/encrypted, botón Cancelar separado y «Guardar sin contraseña» explícito. **Aceptación:** Atrás/cerrar no abre selector ni genera archivo; sólo Sin contraseña crea copia legible; entrada cifrada sigue exigiendo contraseña.

### SA-07 · P1 · La copia de seguridad presentada como total omite información (D)

**Evidencia:** `backup.ts:193` exporta como máximo 9.999 mediciones y `:194` llama `getDailyCheckins()`; este getter limita a **90 registros globales** (`database.ts:1201`), repartidos entre todas las personas. Fotos y documentos se serializan sólo mediante `photoUri` y `fileUri` (`backup.ts:55`, `:135`, `:203`), sin bytes/copia de archivos. El esquema admite `injectionSite` (`backup.ts:108`), pero el método usado para restaurar dosis omite ese campo al insertar (`database.ts:952`), perdiendo el sitio de inyección registrado.

**Solución:** recorrido completo de tablas sin paginación de UI, archivo empaquetado con adjuntos o limitación explícita antes de exportar, manifiesto con totales y verificación tras escribir; paridad de campos entre exportación y restauración. **Aceptación:** ida y vuelta con 120 check-ins de dos personas, >9.999 mediciones, sitios de inyección y adjuntos en otro dispositivo conserva todos los datos anunciados y abre los archivos. Si se mantienen exclusiones, deben aparecer antes de que el usuario confíe en la copia.

### SA-08 · P1 · Reemplazar o borrar puede dejar seleccionado un perfil inexistente (D)

**Evidencia:** `database.ts:1022` elimina perfiles extra. `store/index.ts:96` no restablece `activeProfileId` ni su almacenamiento; import replace tampoco lo reconcilia (`backup.ts:304`). Getters de UI filtran por ese ID (`database.ts:749`, `:1037`, `:1160`). Las altas sin profileId heredan el ID actual (`database.ts:783`, `:1178`) y el schema lo trata como texto sin referencia a perfiles (`schema.ts:22`).

**Solución:** después de restaurar/resetear, comprobar persona activa contra perfiles existentes y seleccionar una válida de forma atómica; limpiar caches del perfil anterior. **Aceptación:** con «Mamá» seleccionada, borrar todo o reemplazar por copia sin Mamá deja «Yo» visible y todas las altas pertenecen a un perfil existente; ningún dato aparece bajo un ID huérfano.

### SA-09 · P1 · Borrar todo conserva datos personales y restaurar omite el perfil principal (D)

**Evidencia:** `clearAllData` mantiene la fila default completa (`database.ts:1021`), incluidos nombre y contacto de emergencia. Importación intenta insertar perfiles y ante duplicate default los ignora (`backup.ts:309`). Una restauración en otro teléfono no aplica nombre/contacto del principal y un borrado no elimina esos datos.

**Solución:** resetear atributos personales del default al borrar; restaurar explícitamente esos atributos según modo y resolver conflictos de perfiles con vista previa. **Aceptación:** borrar deja default sin nombre/contacto; una copia de «Yo» renombrado con teléfono se restaura fielmente en instalación nueva y en reemplazo.

### SA-10 · P1 · Fusionar y éxito de importación comunican un resultado inexacto (D)

**Evidencia:** copy «mantendrá los existentes y agregará los nuevos» (`es.ts:717`); medicamentos duplicados se omiten (`backup.ts:325`), registros de dosis y check-ins se upsertean (`:349`, `:384`), y cada fallo se ignora. La función retorna medicamentos **del archivo**, no realmente insertados (`:425`); UI dice importados correctamente (`settings.tsx:381`). No hay resumen de qué cambió, se preservó o falló.

**Solución:** vista previa de conflictos, política explícita de mantener/actualizar, no sobrescribir una toma reciente con backup antiguo sin decisión, resumen de insertados/actualizados/omitidos/fallidos. Reprogramación debe formar parte del resultado verificable. **Aceptación:** importar dos veces el mismo archivo no informa N nuevos medicamentos; copia vieja no cambia silenciosamente tomada→omitida; error parcial aparece con detalle accionable.

### SA-11 · P1 · Health Connect mezcla personas bajo un único permiso global (D; resultado en HC V)

**Evidencia:** flag global `healthSync.ts:25`; toda alta de medición llama sincronización (`store/slices/health.ts:32`). `buildHealthConnectRecord` no comprueba perfil propietario ni incorpora identidad (`healthSync.ts:65`); basta un permiso concedido para mostrar activada (`:49`). Desactivar sólo borra flag (`:57`), sin revocar ni retirar datos previos.

**Solución:** asociar Health Connect exclusivamente al perfil del propietario del teléfono, pedir esa elección y bloquear envío de otras personas. Mostrar permisos por tipo y «Dejar de copiar nuevas mediciones», con acceso a gestionar datos externos. **Aceptación:** activar en Yo y guardar presión para Mamá nunca inserta esa medición en salud de Yo; concesión parcial muestra tipos autorizados; revocar fuera de app cambia diagnóstico.

### SA-12 · P1 · El paciente no se identifica en los PDF para compartir (D)

**Evidencia:** `pdfReport.ts:218` y `caregiverSnapshot.ts:219` obtienen datos de perfil activo pero no cargan nombre de perfil; encabezados `pdfReport.ts:169` y `caregiverSnapshot.ts:179` no lo incluyen. El nombre de archivo sólo contiene fecha. El resumen promete una página (`es.ts:761`) sin control de paginación para muchos fármacos.

**Solución:** nombre visible en preview, encabezado y cada página; fecha/hora y período; alcance medido; nombre de archivo con persona y fecha. Validar paginación real, sin reducción ilegible. **Aceptación:** imprimir informes de dos perfiles el mismo día identifica sin ambigüedad a cada persona y sus páginas; 20 medicamentos siguen legibles y no se promete una página si salen varias.

### SA-13 · P1 · El contexto de persona no acompaña todos los recorridos (D; confusión V)

**Evidencia:** chip se documenta para Today y se oculta con un perfil (`ProfileChip.tsx:24`); Ajustes muestra selección en sección Perfiles pero exportar/allergias/emergencia viven separados. Todos los getters filtran por perfil activo. Cambiar perfil desde chip cierra antes de cargar (`:59`) y no tiene pending/error ni anuncio de cambio; el store cambia activeProfileId antes de terminar recarga (`profiles.ts:66`).

**Solución:** selector/identidad persistente compartido en encabezados de pantallas personales, formularios y exportación; al cambiar, mostrar persona destino y carga, evitar datos previos bajo identidad nueva. **Aceptación:** iniciar una alta, consultar historial, generar informe y abrir alergias muestra siempre de quién son; cambio lento/fallido no enseña datos de persona anterior con etiqueta nueva.

### SA-14 · P1 · La persistencia de perfiles y borrado no tiene recuperación local (D)

**Evidencia:** `settings.tsx:182` cierra modal antes de `addProfile/renameProfile/switchProfile`; `:195` hace lo mismo al borrar. Handlers carecen de try/catch, pending y preservación de borrador. El borrado general await en `:452` tampoco tiene feedback de resultado/fallo. ErrorBoundary no captura excepciones asíncronas de eventos.

**Solución:** esperar persistencia antes de cerrar, bloquear guardado duplicado, errores dentro del modal y borrador conservado; borrar con estado de ejecución y confirmación de alcance cumplido. **Aceptación:** simular fallo DB muestra mensaje recuperable y conserva texto; doble toque crea un único perfil; cancelar no pierde datos ya guardados.

### SA-15 · P1 · El sonido seleccionado puede diferir del persistido (D)

**Evidencia:** `AlarmSoundPicker.tsx:81` selecciona optimistamente y `:86` ignora fallo; el comentario reconoce que UI conserva selección. No hay vacío/error en carga (`:59`). iOS guarda antes de `rebuildDoseNotifications` (`settings.tsx:227`), luego muestra sólo common.error al fallar.

**Solución:** confirmar tras persistencia o revertir, mostrar error y reintento; distinguir preferencia futura de recordatorios que no pudieron actualizarse. **Aceptación:** fallo de guardado mantiene opción anterior; fallo de reprogramación informa alcance y permite reparar; preview tiene nombre, estado y parada verificables.

### SA-16 · P1 · Error de arranque sin salida, fallback sin idioma/tema (D)

**Evidencia:** `app/_layout.tsx:198` presenta error bruto sin reintentar. `ErrorBoundary.tsx:48` fija ES/EN aunque existe PT; `:69` blanco; reintento sólo resetea state (`:39`). Los errores de reportes exponen `e.message` sin interpretación (`settings.tsx:401`).

**Solución:** componentes de error comunes con idioma/tema, explicación breve, reintento válido y detalles técnicos bajo acción secundaria. No proponer borrar datos como salida inicial. **Aceptación:** DB temporalmente inaccesible permite reintentar conservando datos; portugués y oscuro muestran copy/tema adecuados; reporte fallido dice qué hacer.

### SA-17 · P2 · Lenguaje cambia en pantalla pero puede permanecer anterior en recordatorios (D)

**Evidencia:** `settings.tsx:466` sólo llama changeLanguage; `i18n/index.ts:60` cambia idioma y almacenamiento. Etiquetas nativas se construyen en `notifications.ts:226` y notificaciones existentes se generan en programación. No hay refresh/rebuild vinculado a idioma.

**Solución:** refrescar categorías y contenido pendiente tras cambiar idioma, con deduplicación; preservar horario. **Aceptación:** ES→PT cambia botones de próximo recordatorio y sus textos sin reiniciar ni duplicar alarmas; fechas/idioma de PDF permanecen consistentes.

### SA-18 · P2 · La escala visual y semántica cambia según componente (D)

**Evidencia:** tokens CSS primario oscuro #4f9cff vs hook #60a5fa (`global.css:27`, `useAppTheme.ts:25`); settings títulos uppercase 12 px con tracking (`settings.tsx:50`), subtítulos 12 px, barra 11 px, avisos 11 px. AppPressable sólo unifica ripple/opacity, sin tamaño/roles/foco/pending (`components/AppPressable.tsx:21`). Switches tienen diseño distinto de SettingRow, y controles siguen usando TouchableOpacity fuera de DoseCard/alarm.

**Solución:** contrato de componentes con semántica, estados y tokens; una escala tipográfica con tamaños de lectura cómodos, filas según tipo, no un bloque idéntico para cada ajuste. **Aceptación:** mismo rol usa mismo patrón visual/táctil y accesible; primario no cambia entre icono, CSS y botón; 320–430 dp y escala de texto elevada mantienen lectura.

### SA-19 · P2 · Preferencia de texto grande sólo cubre tarjetas de dosis (D)

**Evidencia:** usos de `seniorMode` limitados a `DoseCard.tsx`; el subtítulo lo aclara (`es.ts:780`) pero el título general «Texto y botones grandes» sugiere efecto global. Ajustes, alta, selección de perfiles, alarmas y permisos no consumen esa preferencia.

**Solución:** renombrar alcance inmediato «Tarjetas de dosis grandes» o extender preferencia a recorridos clave. Respetar escala nativa y probarla como criterio principal, no usar un toggle como sustituto. **Aceptación:** usuario que activa modo puede añadir/editar/confirmar medicamento y reparar recordatorios sin barreras de tamaño; el título expresa el alcance real.

### SA-20 · P2 · La arquitectura de Ajustes obliga a recorrer demasiadas opciones visibles (D; coste V)

**Evidencia:** pantalla única `settings.tsx:490` contiene permisos, sonido, posponer, bloqueo, perfiles, alergias, emergencia, Health Connect, cinco exportaciones/importación, tres idiomas, tres regiones, tres temas, dos toggles, información y borrado. En Android son más de 25 acciones; regiones/idioma/tema ocupan tres filas cada uno. Se repite icono grande, tarjeta redondeada y cabecera uppercase.

**Solución:** primera capa «Recordatorios», «Personas y salud», «Datos y compartir», «Accesibilidad y apariencia», «Idioma y catálogo», «Información»; cada fila muestra valor/resumen actual. Recordatorios y Persona activa arriba; borrar dentro de Datos con distancia semántica respecto de exportar. No añadir búsqueda antes de probar la agrupación. **Aceptación:** usuarios encuentran cambiar sonido, restaurar y activar texto grande sin recorrer toda la pantalla; las tareas frecuentes requieren como máximo dos decisiones desde Ajustes.

### SA-21 · P2 · Los estados vacíos no ofrecen una acción propia (D)

**Evidencia:** `EmptyState.tsx:6` sólo admite ilustración/icono, título y subtítulo; no CTA ni variantes para filtro sin resultados/error/éxito. Incluye padding vertical 64 por lado que puede consumir pantallas pequeñas.

**Solución:** acción primaria contextual, secundaria opcional y variantes semánticas; diferenciar primera visita, sin resultados de filtro, ningún dato hoy y carga fallida. **Aceptación:** cada estado orienta el siguiente paso útil en una frase y una acción, sin añadir medicamentos cuando lo apropiado es limpiar un filtro; no desplaza CTA fuera de viewport.

## Riesgos que requieren validación nativa

| ID / prioridad | Hipótesis y evidencia de riesgo | Prueba y criterio de aceptación |
|---|---|---|
| SA-V01 · P1 | Teclado tapa controles en modales: ProfileModal/PassphraseModal usan View centrada, autofocus, sin KeyboardAvoidingView/ScrollView (`ProfileModal.tsx:65`, `PassphraseModal.tsx:38`). | Android/iOS 320 dp, paisaje, teclado abierto, texto 200%. Nombre, teléfono, contraseña, Cancelar y Guardar alcanzables sin ocultar foco. |
| SA-V02 · P1 | Selector de perfiles puede desbordar con muchas personas: contenedor centrado sin scroll (`ProfileChip.tsx:50`). | 12 perfiles con nombres de 30 caracteres: todas las filas y cierre accesibles, seleccionado visible. |
| SA-V03 · P1 | Overlay de bloqueo puede dejar datos subyacentes accesibles a TalkBack Android; sólo `accessibilityViewIsModal` en overlay y children siempre montados (`AppLockGate.tsx:102`). | Recorrer hacia adelante/atrás con lector y teclado: sólo desbloqueo y emergencia deliberadamente expuesta; `importantForAccessibility`/ocultamiento equivalente sobre children. No afirmar filtración sin esta prueba. |
| SA-V04 · P1 | Tarjeta emergencia se exceptúa de bloqueo (`AppLockGate.tsx:45`) pero overlay no tiene entrada visible (`:111`). | Persona no autorizada debe acceder a tarjeta si el objetivo es asistencia por terceros, sin acceder al resto; definir política de identidad/perfil y mostrarla al activar bloqueo. |
| SA-V05 · P1 | Rotación/redimensionamiento desalineará onboarding por `SCREEN_WIDTH` constante (`onboarding.tsx:27`) y contenido no verticalmente scrollable (`:204`). | Rotar en pasos 1/5 y 5/5, pantalla partida, zoom: contenido completo, indicadores coherentes, CTA disponible, sin slides parciales. |
| SA-V06 · P1 | La app invita a exportar en iOS pero exportBackup usa exclusivamente StorageAccessFramework (`backup.ts:215`), API de acceso a directorios Android. | Dispositivo iOS: exportar copia cifrada/plain debe guardar y reimportar; implementar compartir/Files nativo. Fuente de plataforma: [Expo FileSystem legacy](https://docs.expo.dev/versions/latest/sdk/filesystem-legacy/). |
| SA-V07 · P2 | Objetivos pequeños y cercanos: colores 36 dp, lápiz 34 dp, papelera ~38 dp, snooze ~36 dp (`ProfileModal.tsx:109`, `settings.tsx:674`, `settings.tsx:589`). | Medir bounds con inspector a escala 1; estándar de producto 48 dp Android / 44 pt iOS; áreas no solapadas. hitSlop ayuda táctil pero no sustituye bounds/foco visual. |
| SA-V08 · P2 | Onboarding renderiza todos los slides y no oculta accesibilidad de los no visibles (`onboarding.tsx:203`); puede leer contenido de varias pantallas. | Lector anuncia sólo paso activo, título/posición; foco estable al Siguiente y al regresar de ajustes de sistema. |
| SA-V09 · P2 | Animaciones no respetan preferencia explícita: carrusel siempre animated, Toast Animated, Copilot animated (`onboarding.tsx:100`, `ToastContext.tsx:58`, `_layout.tsx:211`). | Reducir movimiento activo evita desplazamientos innecesarios; conserva feedback de acción sin pérdida de información. |
| SA-V10 · P2 | Preview, TTS, alarmas, haptics y lector pueden competir por audio. TTS sólo empieza al abrir alarm route, y no tiene test en Ajustes (`tts.ts:32`). | Dispositivo con TalkBack/VoiceOver, auriculares y volumen bajo: mensaje de dosis entendible, prueba y detención alcanzables; voz no interrumpe instrucciones esenciales. |
| SA-V11 · P2 | Navegación a Turnos/Calendario pierde descubrimiento al ocultar pestañas (`tabs/_layout.tsx:129`). | Prueba de tarea «agendar consulta» desde primera visita; usuarios identifican acceso secundario sin tour obligatorio. |
| SA-V12 · P2 | Valores largos compiten con títulos en SettingRow; value sin maxWidth/flexShrink (`settings.tsx:118`). | Sonido del sistema con nombre largo, traducción portuguesa, fuente 200%, ancho 320: título/subtítulo/valor íntegros o expansion accesible; no desplazar botón fuera. |

## Dirección visual propuesta

La personalidad puede surgir de un sistema de cuidado claro y tranquilo: azul estable para la acción principal; verde reservado a registro confirmado; ámbar a pendiente/requiere atención; rojo a consecuencia destructiva. Los colores de personas identifican a personas y no deben competir con estados clínicos. Evitar que seis iconos multicolor signifiquen seis jerarquías cuando todas las opciones tienen el mismo peso.

Primero resolver semántica de color: tinta azul para enlaces/textos, azul de botón con `onPrimary` verificable y superficies suaves diferentes de estado. Mantener tipografía de sistema como ventaja de accesibilidad; definir escala de 12 (metadato secundario puntual), 14–16 (lectura), 18–20 (sección), 26–30 (título), con interlineados y crecimiento nativo probados. No sumar familias por estética si empeora lectura en tamaños pequeños.

En Ajustes, una lista compacta de categorías con valor actual sería más útil que otra sucesión de tarjetas con sombra. Secciones en sentence case, sin tracking que reduzca legibilidad. Radios y switches deben parecer y comportarse como radios/switches; las opciones que navegan sí llevan chevron. Las tarjetas grandes se reservan al estado operativo de recordatorios, a la persona activa y a decisiones de seguridad o datos.

En onboarding, cada paso debería completar una intención: «Qué necesitás recordar», «Cómo te avisamos», «Tu primer medicamento». La introducción existente enumera funciones y puede abreviarse; la decisión exacta depende de probar descubrimiento, evitando un tour obligatorio largo antes de obtener valor. Conservar un recorrido detallado opcional para quien lo necesite.

## Verificación recomendada antes de implementar y cerrar

1. **Recordatorios:** instalación limpia, permiso denegado, revocado después, alarma exacta concedida/denegada, fullscreen concedido/denegado, vuelta desde sistema, fallo al consultar. Android 12 y 14+ reales; iOS al menos un dispositivo. No afirmar que una comprobación de permiso garantiza disparo: verificar una alarma de prueba.
2. **Personas:** default renombrado, contacto de emergencia, 2 y 12 perfiles, cambio lento/fallido, alta y reporte en cada persona, borrar perfil seleccionado y borrar todo. Confirmar que Health Connect no recibe mediciones ajenas.
3. **Datos:** backup plain/cifrado, Atrás/cancelación en cada paso, clave errónea, archivo inválido/viejo, merge duplicado/conflictivo, replace desde perfil extra, copia con >90 check-ins y adjuntos en otro teléfono. Comparar totales y contenido, no sólo toast.
4. **Accesibilidad:** TalkBack/VoiceOver completos; foco de modales y retorno; selección radios; mensajes de estado; acciones iconográficas; bloqueo sin lectura de fondo; teclado/hardware y switch access donde corresponda. Escala de texto 100/150/200%, landscape, 320/360/430 dp, temas, tres idiomas, reduce motion.
5. **Diseño visual:** capturas actuales con datos realistas, nombres largos, estados vacíos/error/carga, teclado, modales y listas extensas; revisar pantallas a tamaño real. Capturas históricas sirven de referencia, no de aceptación.

## Referencias técnicas consultadas

- [W3C: contraste mínimo](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), usado para el cálculo de pares de color; no es una certificación de toda la app.
- [W3C: mensajes de estado](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html), como criterio de comunicación de resultados sin cambio de foco.
- [React Native: accesibilidad](https://reactnative.dev/docs/accessibility), para roles, estado, live region y diferencias por plataforma.
- [Expo: FileSystem legacy / StorageAccessFramework](https://docs.expo.dev/versions/latest/sdk/filesystem-legacy/), para validar la ruta de guardado por plataforma.

Las recomendaciones de producto y los riesgos no reproducidos son juicios de diseño y se distinguen arriba de las observaciones demostrables. No se inspeccionaron archivos de credenciales ni datos de usuarios. No se ejecutaron pruebas que cambien información persistida.
