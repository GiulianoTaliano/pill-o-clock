# Auditoría UI/UX — Salud, agenda, calendario e informes

Fecha: 9 de octubre de 2026, zona horaria de referencia America/Buenos_Aires.

## Alcance y nivel de evidencia

Inspección completa de `app/(tabs)/calendar.tsx`, `appointments.tsx`, `health.tsx`, `history.tsx`, `app/allergies.tsx`, `app/emergency.tsx`, `CheckinModal`, `AppointmentDetailModal`, `AppointmentMiniCard`, `LocationPickerModal`, `InsightsCard`, `SimpleLineChart`, `pdfReport`, `fhirExport`, `caregiverSnapshot`, sus slices y las consultas relevantes de la base de datos.

La evidencia de visuales proviene del árbol de componentes, estilos, tamaños y textos. No se afirma haber inspeccionado capturas de iOS/Android, VoiceOver/TalkBack ni un dispositivo físico. Las limitaciones demostrables por código se separan de los riesgos que requieren una prueba de interfaz. No se consultaron secretos ni datos reales de pacientes. Se modificó únicamente este documento.

Se ejecutaron los tests existentes de caregiverSnapshot y fhirExport: **2 suites, 9 tests aprobados**. También se ejecutó el núcleo real de `computeCaregiverSnapshot`, transpilado desde TypeScript en una VM con dependencias externas simuladas, con tres casos que la suite actual no cubre: medicamento vencido ayer, día de descanso de everyN y dosis tomada con hora pospuesta. En los tres devolvió una dosis de hoy como `unlogged`; resultados detallados en HA01–HA02. Esto demuestra que pasar los tests actuales no cubre la corrección de estos escenarios.

Prioridades utilizadas, alineadas con el informe principal: **P1** = defecto demostrado que impide o compromete completar una tarea con confianza y debe corregirse antes de renovar/publicar esa experiencia; **P2** = mejora de claridad, eficiencia o calidad visual. HA01–HA04 requieren atención especial por representar medicación o datos de emergencia. No se asigna P0: no se verificó un incidente real ni un bloqueo generalizado. No son diagnósticos médicos ni afirmaciones sobre daño ocurrido.

## Inventario de acciones y estados existentes

Cada fila agrupa una acción o una familia explícita de opciones que ejecutan el mismo flujo. Se incluyen salidas y efectos indirectos para que una revisión posterior pueda recorrer todos los controles.

### Calendario

| ID | Acción / superficie | Estados y comportamiento actual | Evidencia |
|---|---|---|---|
| C01 | Entrar a Calendario / volver | Mes y fecha actuales por defecto; back con `router.back`; carga al montar y al enfocar | `calendar.tsx:90–125`, `calendar.tsx:261` |
| C02 | Mes anterior | Cambia mes; selecciona día 1 o hoy si vuelve al mes actual; sin límite ni salto directo a hoy | `calendar.tsx:231–241` |
| C03 | Mes siguiente | Mismo reseteo de selección; permite explorar el futuro sin límite | `calendar.tsx:244–254` |
| C04 | Elegir día | Día seleccionado azul; hoy con borde azul; cuatro puntos de colores como máximo más punto de cita | `calendar.tsx:142–166`, `calendar.tsx:311–353` |
| C05 | Interpretar fecha / dosis / estado | Pendiente, tomada, omitida, perdida; hoy sin log pasa a perdida apenas transcurre la hora; pasado sin log se reconstruye desde horarios activos actuales | `calendar.tsx:175–216` |
| C06 | Marcar tomada | Sólo hoy, pendiente o perdida; persiste, cancela notificaciones, actualiza stock en slice, recarga todo el mes; sin indicador local, catch, deshacer ni confirmación | `calendar.tsx:224–227`, `calendar.tsx:395`, `calendar.tsx:454–461`; `medications.ts:205–261` |
| C07 | Marcar omitida | Mismo acceso; sin selector de motivo que sí existe en DoseCard | `calendar.tsx:444–450` |
| C08 | Ver día sin dosis / en carga | Skeleton sólo para grilla; contenido del día queda derivado del estado anterior; vacío dice «No hay dosis programadas» | `calendar.tsx:106–117`, `calendar.tsx:298–304`, `calendar.tsx:384–390` |
| C09 | Ver días con cita | Indicador en grilla; no existe acción que abra la cita ni listado de citas del día | `calendar.tsx:164–166`, `calendar.tsx:340–352`, `calendar.tsx:384–468` |
| C10 | Consultar dosis ya resuelta / pasada / futura | Sólo lectura; no hay abrir detalle, revertir, anotar, posponer o registrar retrospectivamente desde esta pantalla | `calendar.tsx:395–468` |

### Citas: listado y formulario

| ID | Acción / superficie | Estados y comportamiento actual | Evidencia |
|---|---|---|---|
| A01 | Entrar / recargar al enfocar | Carga citas; no hay estado loading/error explícito; vacío con ilustración | `appointments.tsx:291–295`, `appointments.tsx:522–543` |
| A02 | Próximas / anteriores | Clasificación por fecha; todas las de hoy se consideran próximas aunque su hora haya pasado | `appointments.tsx:317–320`, `appointments.tsx:511–519` |
| A03 | Crear cita | Botón + de 40×40; título vacío, fecha hoy, hora 09:00, aviso 1 h por defecto | `appointments.tsx:195–205`, `appointments.tsx:324–328`, `appointments.tsx:500–506` |
| A04 | Abrir tarjeta | Haptic; abre detalle global; etiqueta accesible contiene título y hora, omite fecha/persona | `appointments.tsx:100–105`, `appointments.tsx:528` |
| A05 | Editar en tarjeta / desde detalle | Precarga formulario; cita sin hora se convierte a 09:00 al editar; permite conservar ubicación | `appointments.tsx:208–218`, `appointments.tsx:305–315`, `appointments.tsx:330–334` |
| A06 | Borrar cita | Diálogo cancelar/eliminar; operación asíncrona sin estado de progreso/catch en caller | `appointments.tsx:389–402` |
| A07 | Escribir título | Único texto obligatorio; trim; error en Alert, no junto al campo; sin límite visible | `appointments.tsx:350–358`, `appointments.tsx:582–590` |
| A08 | Escribir profesional | Opcional, texto libre | `appointments.tsx:593–600` |
| A09 | Añadir ubicación | Abre mapa; iOS oculta el formulario y lo reabre al cerrar picker | `appointments.tsx:263–285`, `appointments.tsx:629–638`, `appointments.tsx:793–812` |
| A10 | Editar ubicación / quitar ubicación | Dos iconos pequeños en chip; quitar borra texto y coordenadas del draft sin confirmar | `appointments.tsx:608–626` |
| A11 | Seleccionar fecha | Picker nativo; spinner iOS permanece visible; admite pasado y futuro | `appointments.tsx:476–479`, `appointments.tsx:642–658` |
| A12 | Seleccionar hora | Picker nativo; hora obligatoria en UI; se muestra HH:mm sin formateador local | `appointments.tsx:481–491`, `appointments.tsx:662–676` |
| A13 | Elegir recordatorio | Ninguno / 1 h / 2 h / 1 día; chips; no aviso de antelación ya vencida | `appointments.tsx:72–77`, `appointments.tsx:679–700` |
| A14 | Escribir notas | Multilínea opcional | `appointments.tsx:703–713` |
| A15 | Adjuntar documento al editar | Sólo edición, no creación; picker acepta cualquier MIME, copiar a almacenamiento; persistencia inmediata | `appointments.tsx:406–424`, `appointments.tsx:715–731`; `appointments slice:99–124` |
| A16 | Abrir documento | Android abre visor por intent, fallback compartir; iOS abre hoja de compartir; error final genérico | `appointments.tsx:427–447`, `appointments.tsx:749–758` |
| A17 | Eliminar documento | Confirmación; borrado inmediato, fuera de transacción del formulario; no error local | `appointments.tsx:449–465`, `appointments.tsx:760–762` |
| A18 | Guardar cita | Valida título/fecha; busy y botón deshabilitado; error genérico; guarda o actualiza notificaciones y DB | `appointments.tsx:350–386`, `appointments.tsx:777–784`; `appointments slice:44–69` |
| A19 | Cancelar / tap afuera / swipe handle / back sistema | Cierra sin chequear cambios; se descarta draft al próxima apertura; no cancela cambios de adjuntos ya persistidos | `appointments.tsx:336–348`, `appointments.tsx:551`, `appointments.tsx:565–569`, `appointments.tsx:771–775` |
| A20 | Volver de mapa con aceptar / cancelar | Mantiene draft de otros campos; confirm actualiza coords y address; en iOS formulario reaparece | `appointments.tsx:793–812` |

### Detalle y tarjetas compactas de cita

| ID | Acción / superficie | Estados y comportamiento actual | Evidencia |
|---|---|---|---|
| D01 | Abrir desde inicio / listado / notificación | Modal global con cita seleccionada; si no encuentra cita devuelve null | `AppointmentMiniCard.tsx:17–30`; `(tabs)/_layout.tsx:43–71`; `AppointmentDetailModal.tsx:92–110` |
| D02 | Cerrar | X, tap afuera, swipe handle y back sistema | `AppointmentDetailModal.tsx:98–103`, `AppointmentDetailModal.tsx:246–259`, `AppointmentDetailModal.tsx:324–337` |
| D03 | Ver datos | Fecha/hora, profesional, ubicación, notas, recordatorio; badge «Past» sólo pasado por fecha UTC | `AppointmentDetailModal.tsx:110`, `AppointmentDetailModal.tsx:307–319`, `AppointmentDetailModal.tsx:340–383` |
| D04 | Abrir mapa externo | Sólo si hay coords; intenta Apple Maps / geo y fallback Google web | `AppointmentDetailModal.tsx:120–134`, `AppointmentDetailModal.tsx:386–441` |
| D05 | Compartir ubicación | Sólo si hay coords; mensaje incluye título, profesional, fecha/hora, ubicación y URL de mapa; sin captura de error | `AppointmentDetailModal.tsx:136–149`, `AppointmentDetailModal.tsx:443–463` |
| D06 | Adjuntar / cancelar picker | MIME libre; copia y persiste inmediatamente; error con Alert | `AppointmentDetailModal.tsx:171–190`, `AppointmentDetailModal.tsx:476–492` |
| D07 | Abrir / eliminar documento | Visor Android/hoja compartir iOS; eliminar con confirmación; sin carga/errores de listado | `AppointmentDetailModal.tsx:192–230`, `AppointmentDetailModal.tsx:495–552` |
| D08 | Editar | Cierra detalle y navega a Citas con pendingEditAppointmentId | `AppointmentDetailModal.tsx:586–605`; `(tabs)/_layout.tsx:49–53` |
| D09 | Eliminar | Confirmación; caller cierra modal antes de esperar resultado de DB | `AppointmentDetailModal.tsx:151–167`; `(tabs)/_layout.tsx:55–58` |

### Selector de ubicación

| ID | Acción / superficie | Estados y comportamiento actual | Evidencia |
|---|---|---|---|
| L01 | Abrir nuevo / existente | Nuevo empieza en Buenos Aires; existente intenta reverse geocode; el pin siempre tiene valor confirmable | `LocationPickerModal.tsx:102–108`, `LocationPickerModal.tsx:157–183` |
| L02 | Mover mapa | Crosshair central; región final fija pin; reverse geocode a 700 ms; spinner; error mantiene texto anterior | `LocationPickerModal.tsx:363–380`, `LocationPickerModal.tsx:536–570` |
| L03 | Escribir búsqueda | 350 ms debounce, desde 2 caracteres; Places → Geocoding fallback; sin key no sugerencias; resultados vacíos y fallas se ven iguales | `LocationPickerModal.tsx:185–255` |
| L04 | Elegir sugerencia | Cambia address antes de resolver coords; coords adjuntas → Place Details → geocoder OS; si todos fallan conserva pin anterior | `LocationPickerModal.tsx:280–316` |
| L05 | Buscar con Enter | Desde 3 caracteres; geocoder OS sin API key; si no resuelve no presenta error | `LocationPickerModal.tsx:321–332`, `LocationPickerModal.tsx:479–480` |
| L06 | Seleccionar reciente | Hasta 5 al enfocar vacío / 3 al filtrar; usa coords existentes y anima mapa | `LocationPickerModal.tsx:140–145`, `LocationPickerModal.tsx:334–346`, `LocationPickerModal.tsx:589–612` |
| L07 | Limpiar búsqueda | Borra texto/address/sugerencias; no borra ni invalida pin | `LocationPickerModal.tsx:484–494` |
| L08 | Mi ubicación | Solicita permiso; spinner y disabled; GPS + reverse geocode; denegado, GPS o red fallida comparten mensaje de permiso | `LocationPickerModal.tsx:383–407`, `LocationPickerModal.tsx:637–653` |
| L09 | Confirmar | Siempre habilitado; devuelve pin y address previo o texto actual sin validar relación; cierra | `LocationPickerModal.tsx:410–415`, `LocationPickerModal.tsx:698–707` |
| L10 | Cancelar / back | No aplica modificación al draft de cita | `LocationPickerModal.tsx:424`, `LocationPickerModal.tsx:442–450` |
| L11 | Mapa falla | Boundary muestra instrucciones de configuración en inglés y mantiene botón de confirmar | `LocationPickerModal.tsx:501–517`, `LocationPickerModal.tsx:698–707` |

### Salud y mediciones

| ID | Acción / superficie | Estados y comportamiento actual | Evidencia |
|---|---|---|---|
| H01 | Entrar / cambiar a Mediciones o Diario | Carga al focus; sin skeleton/error; tabs se ocultan dentro de métrica seleccionada | `health.tsx:367–377`, `health.tsx:541–555` |
| H02 | Elegir Presión / Glucemia / Peso / SpO₂ / Frecuencia | Cinco tarjetas; última lectura o «sin mediciones», sparkline últimos 10 del tipo; sin fecha junto a «última» | `health.tsx:39–49`, `health.tsx:231–278`, `health.tsx:393–403`, `health.tsx:623–634` |
| H03 | Volver de métrica | Flecha pequeña cambia estado local a overview; no navega una ruta de detalle | `health.tsx:512–515` |
| H04 | Añadir medición | + sólo en detalle; abre sheet con fecha/hora actual y valores vacíos | `health.tsx:422–426`, `health.tsx:523–529` |
| H05 | Ingresar sistólica / diastólica | Dos inputs numeric; unidades no visibles junto a estos campos; parseFloat e isNaN | `health.tsx:428–446`, `health.tsx:754–777` |
| H06 | Ingresar valor simple | Un campo numeric con unidad; ejemplos distintos por tipo; sin selector de unidad | `health.tsx:447–454`, `health.tsx:779–792` |
| H07 | Elegir fecha / hora | Pickers nativos; cada cambio reemplaza measuredAt completo; no hay límite máximo en fecha | `health.tsx:459–473`, `health.tsx:796–833` |
| H08 | Escribir notas | Opcional, multilínea | `health.tsx:836–846` |
| H09 | Guardar medición | Sin busy/disabled ni catch; registra y toast dice «Guardar medición»; push Health Connect en background | `health.tsx:428–457`, `health.tsx:856–860`; `health slice:23–32` |
| H10 | Cancelar / exterior / swipe / back | Cierra sin aviso de cambios ni borrador recuperable | `health.tsx:475–480`, `health.tsx:733`, `health.tsx:739–743`, `health.tsx:850–854` |
| H11 | Consultar lista / evolución | Gráfico desde >1 dato, sin ejes/fechas/valores; lista contiene valor, timestamp, notas; sólo eliminar, no editar | `health.tsx:565–618`; `SimpleLineChart.tsx:30–114` |
| H12 | Eliminar medición | Confirmación; sin estado async/catch, no undo | `health.tsx:407–420`, `health.tsx:147–154` |
| H13 | Configurar recordatorio diario | Sólo overview; picker; cada cambio del spinner iOS agenda inmediatamente y muestra toast | `health.tsx:482–489`, `health.tsx:636–679` |
| H14 | Cancelar recordatorio | X; sin editar hora directamente en estado activo; hay que desactivar y volver a crear | `health.tsx:317–339`, `health.tsx:491–495` |
| H15 | Check-in de hoy / ver-editar | Card muestra estado completo o prompt; abre con checkin existente si lo hay | `health.tsx:280–315`, `health.tsx:688–696` |
| H16 | + en Diario | Siempre abre sin existing; guarda para hoy y puede reemplazar un checkin existente por datos vacíos/default | `health.tsx:531–537`; `CheckinModal.tsx:49–55`, `CheckinModal.tsx:67–71` |
| H17 | Consultar/edit check-in anterior | Sólo últimos 10 cargados; excluye hoy; abre mismo modal con fecha histórica aunque heading dice hoy | `health.tsx:501`, `health.tsx:698–720`; `CheckinModal.tsx:68`, `CheckinModal.tsx:110–113` |

### Check-in

| ID | Acción / superficie | Estados y comportamiento actual | Evidencia |
|---|---|---|---|
| K01 | Elegir estado general | Muy mal / Mal / Regular / Bien / Excelente; Regular preseleccionado; emoji y label de 10 px; sin estado seleccionado accesible | `CheckinModal.tsx:43`, `CheckinModal.tsx:115–133` |
| K02 | Marcar/desmarcar síntomas | Dolor de cabeza, náuseas, cansancio, mareos, estómago, dolor general, ansiedad, insomnio; multiselección; chips rojos | `CheckinModal.tsx:16–19`, `CheckinModal.tsx:57–61`, `CheckinModal.tsx:136–158` |
| K03 | Escribir notas | Texto libre, permite describir síntomas fuera de lista; sin selector «otro» explícito | `CheckinModal.tsx:160–170` |
| K04 | Guardar | Busy/disabled; upsert por perfil/fecha; éxito toast; finally sin catch de error | `CheckinModal.tsx:64–78`, `CheckinModal.tsx:180–187`; `health slice:45–57`; `database.ts:1235–1251` |
| K05 | Cancelar / tap afuera / swipe / back | Sale sin aviso de cambios; no hay eliminar check-in ni elegir fecha nueva desde formulario | `CheckinModal.tsx:80–103`, `CheckinModal.tsx:174–178` |

### Historial e insights

| ID | Acción / superficie | Estados y comportamiento actual | Evidencia |
|---|---|---|---|
| T01 | Entrar / recargar | Carga al montar y focus; skeleton stats y filas; getHistoryLogs filtra perfil por meds | `history.tsx:104–156`; `medications slice:392–397` |
| T02 | Semana / mes | Resetea offset a 0; semana ISO lunes-domingo; mes completo | `history.tsx:129–163`, `history.tsx:282–304` |
| T03 | Período anterior / siguiente | Anterior sin límite; siguiente bloqueado al actual; no «volver a hoy» directo | `history.tsx:309–327` |
| T04 | Consultar totales / adherencia | Tomadas; omitidas+perdidas en una tarjeta; adherencia excluye pendientes; sin explicación de denominador en UI | `history.tsx:194–199`, `history.tsx:330–347` |
| T05 | Ver heatmap mensual | Color según % de logs no pendientes, hoy con borde; sin interacción ni valor exacto por día; sin leyenda de vacío | `history.tsx:31–39`, `history.tsx:217–274` |
| T06 | Consultar eventos | Nombre, hora programada, dosis actual, notas/motivo truncados a 1 línea y badge; no abrir detalle, tomadaAt o sitio de inyección | `history.tsx:368–426` |
| T07 | Compartir con médico | Busy/disabled y Alert ante error; genera siempre últimos 30 días, no rango de pantalla; sin preview ni selector | `history.tsx:115–127`, `history.tsx:350–364`; `pdfReport.ts:213–228` |
| T08 | Leer insights | Siempre ventana fija de 30 días, aunque historial navegue otro rango; tarjeta sólo aparece con datos suficientes y patrones; error oculta | `InsightsCard.tsx:35–58`, `InsightsCard.tsx:62–112` |
| T09 | Interpretar horario/día/medicación/ánimo desfavorable | Filas informativas, sin acción que explique registros subyacentes o abra ajuste de horario | `InsightsCard.tsx:62–109` |
| T10 | Historial sin logs | Icono y texto; sin CTA ni explicación de rango/perfil | `history.tsx:441–451` |

### Alergias y ficha de emergencia

| ID | Acción / superficie | Estados y comportamiento actual | Evidencia |
|---|---|---|---|
| G01 | Entrar / volver de Alergias | Consulta una vez al montar; lista vacía al inicio; back 40×40; sin loading/error | `allergies.tsx:24–31`, `allergies.tsx:53–62`, `allergies.tsx:109–115` |
| G02 | Escribir ingrediente | Sugerencias locales síncronas, hasta 6 del servicio; sin spinner necesario | `allergies.tsx:68–77`; `interactions.ts:245` |
| G03 | Añadir texto libre con + | Deshabilitado vacío; inserta, limpia, recarga; puede repetirse; no catch/busy/undo | `allergies.tsx:33–41`, `allergies.tsx:79–87` |
| G04 | Elegir sugerencia | Inserta nombre + RxCUI si disponible; interfaz diferencia checkable / texto libre | `allergies.tsx:89–104`, `allergies.tsx:116–131` |
| G05 | Eliminar alergia | Borra en un toque, sin confirmación ni deshacer; label dice sólo Eliminar | `allergies.tsx:43–46`, `allergies.tsx:133–140` |
| E01 | Abrir ficha emergencia | Route exenta de lock según diseño; nombre fallback «Yo», arrays vacíos antes de leer; consulta una vez | `emergency.tsx:5–8`, `emergency.tsx:30–47` |
| E02 | Leer persona, alergias y medicación | Alergias primero; datos grandes; ningún registro de alergia muestra «Sin alergias conocidas» | `emergency.tsx:69–112` |
| E03 | Llamar contacto | Sólo si teléfono; URL tel sin verificación/catch; muestra número completo | `emergency.tsx:115–133` |
| E04 | Volver / consultar disclaimer | Back; aclaración al final del scroll | `emergency.tsx:55–62`, `emergency.tsx:136` |

### Exportaciones y efectos de servicios

| ID | Acción / superficie | Estados y comportamiento actual | Evidencia |
|---|---|---|---|
| X01 | Generar y compartir informe PDF | Medicación activa, logs 30 días, hasta 60 mediciones totales y 20/tipo renderizadas, 30 check-ins; hoja compartir; limpieza best effort | `pdfReport.ts:60`, `pdfReport.ts:109`, `pdfReport.ts:131`, `pdfReport.ts:213–261`; `database.ts:1156–1166` |
| X02 | Generar y compartir FHIR | Patient, activos MedicationStatement y alergias; JSON legible por máquinas; contacto incluido; sin mediciones ni logs | `fhirExport.ts:30–110`, `fhirExport.ts:113–151` |
| X03 | Generar y compartir resumen de cuidador | Medicación regular, horarios/días, estado hoy, adherencia 7 d, stock, renovación, PRN/límites, alergias; PDF; sin identidad del perfil | `caregiverSnapshot.ts:51–100`, `caregiverSnapshot.ts:118–209`, `caregiverSnapshot.ts:214–256` |
| X04 | Programar avisos de cita | Aviso anticipado configurable + aviso exacto con hora; «ninguno» sólo desactiva anticipado; pasado se omite silenciosamente | `notifications.ts:853–899` |
| X05 | Programar aviso de salud | Un recordatorio global diario; devuelve sin programar en web; no comprueba permiso en este helper | `notifications.ts:927–964` |
| X06 | Sincronizar medición con Health Connect | Push tras guardar; error absorbido; no sincroniza borrado en slice | `health slice:23–37` |

## Hallazgos demostrados y cambios propuestos

### HA01 — P1 — El resumen para cuidador inventa dosis en días sin toma

**Demostrado:** `caregiverSnapshot.ts:63–79` filtra horarios por `isActive` y weekdays. Omite fechas de inicio/fin, creación y regímenes everyN/cycle/monthly/taper que sí resuelve `isScheduleActiveOnDate` (`utils/index.ts:60–80`). La ejecución real con un medicamento terminado el 8/10 devuelve para el 9/10 `{time:'08:00', status:'unlogged'}`; ocurre lo mismo con everyN=2 iniciado el 8/10, cuyo 9/10 es descanso. El documento es un relevo operativo y presenta ese horario como dosis de hoy.

**Cambio:** utilizar la misma función de agenda efectiva que Inicio/alarma; describir régimen y próximas fechas en la columna de horarios, en lugar de traducir todo `days:[]` como diario.

**Aceptación:** PDF de cuidador, Inicio y Calendario coinciden para medicamentos futuros, vencidos, pausas de ciclo, everyN, monthlyDay y fin de taper; un descanso dice explícitamente «Sin dosis hoy». El PDF indica perfil y momento de generación. Añadir casos con resultados esperados a las pruebas del núcleo, que hoy cubren sólo weekdays.

### HA02 — P1 — Una dosis tomada después de posponer aparece sin registrar al cuidador

**Demostrado:** el snapshot busca log por fecha y `scheduledTime === s.time` (`caregiverSnapshot.ts:75–78`); `markDose` guarda la hora pospuesta (`medications slice:216`). Con scheduleId=s1, horario original 08:00 y log tomado 08:15, el core devuelve 08:00 «unlogged». También el cambio posterior de horario rompe el cruce.

**Cambio:** identidad de dosis = scheduleId + fecha; mostrar original, pospuesta y tomadaAt como campos separados. Preservar estado registrado aunque cambie hora.

**Aceptación:** tomada tras snooze o edición de horario siempre permanece tomada en resumen; nunca aparece como pendiente/no registrada por cambiar su hora. La hora de administración real se muestra al cuidador.

### HA03 — P1 — La dosis de un tratamiento descendente cambia según la pantalla

**Demostrado:** Calendario arma `medication: med` (`calendar.tsx:204`) y muestra dosage base (`calendar.tsx:421`); Inicio usa `withEffectiveDose(med,targetDate)` (`useTodaySchedule.ts:55–58`). Resumen cuidador y FHIR usan `med.dosage` directamente (`caregiverSnapshot.ts:138`, `fhirExport.ts:62–64`), sin describir los pasos descendentes. La información de cantidad diverge en cualquier paso cuya cantidad difiera de la base.

**Cambio:** compartir el modelo efectivo por fecha entre superficies; distinguir en exportaciones cantidad para hoy y plan completo. La ficha de emergencia debería mostrar que el tratamiento tiene una pauta variable, con fecha de actualización, para no presentar la cantidad base como constante.

**Aceptación:** para una pauta de 40 → 20 → 10, la fecha de cada paso muestra la cantidad correcta en Inicio, Calendario y resumen del cuidador. Exportaciones incluyen pasos y fechas sin colapsar la pauta a una dosis fija.

### HA04 — P1 — «Sin alergias conocidas» representa también falta de información y carga

**Demostrado:** `allergies=[]` inicialmente y no existe loading/error (`emergency.tsx:30–45`); array vacío muestra «Sin alergias conocidas» (`emergency.tsx:88–89`, `es.ts:581`). No existe estado de declaración explícita de ausencia de alergias en el modelo Allergy (`types/index.ts:48–54`). Un error de lectura deja la misma afirmación visible. El nombre inicial también es «Yo».

**Cambio:** distinguir «Datos cargando», «No pudimos leer la ficha», «No se registraron alergias» y «La persona declaró no tener alergias conocidas»; este último requiere un estado explícito y fecha. No afirmar ausencia clínica a partir de una lista vacía. Mantener el acceso de emergencia según la decisión del producto.

**Aceptación:** nunca se ve «Sin alergias conocidas» durante carga, falla o falta de registro; identidad/perfil visible antes de interpretar datos; fallback de error con reintento; fecha de última actualización junto a la ficha.

### HA05 — P1 — El formulario de mediciones cambia decimales y admite entradas parciales

**Demostrado:** `parseFloat` + `isNaN` (`health.tsx:429–437`) acepta `70,5` como 70, `120abc` como 120, negativos e Infinity. Se verificaron estos resultados con Node. No hay validación posterior en `health slice:23–30` o `database.ts:1169–1179`. El teclado numeric no garantiza formato válido al pegar texto o usar separador decimal local.

**Cambio:** parser decimal local con validación de toda la cadena y `Number.isFinite`; conservar coma/punto coherentemente; explicar unidad en cada campo y aceptar sólo valores estructuralmente posibles para el tipo (ej. SpO₂ dentro de 0–100). Los valores clínicamente inusuales requieren una política de producto acordada; no inventar umbrales clínicos en la UI.

**Aceptación:** `70,5` y `70.5` se guardan como 70.5 en español/portugués; `120abc`/Infinity no se guardan; error inline asociado al campo y foco en el primero; la pantalla vuelve a mostrar exactamente el valor confirmado.

### HA06 — P1 — Guardar o borrar datos de salud tiene progreso y recuperación incompletos

**Demostrado:** guardar medición no usa saving/disabled/catch (`health.tsx:428–457`, `health.tsx:856–860`). Check-in tiene busy pero sólo finally, sin error visible (`CheckinModal.tsx:64–78`). Borrar medición, alergia, cita y documento tampoco captura rechazo en sus callers. El toast de éxito de medición usa el nombre de acción «Guardar medición», no un resultado (`health.tsx:456`, `es.ts:455`).

**Cambio:** estados por acción idle/busy/success/error; una operación por entidad; retry explícito y conservar draft; mensaje «Medición guardada». Para borrado reversible, undo con contexto de qué se eliminó.

**Aceptación:** fallo de DB mantiene formulario/datos y ofrece volver a intentar; doble toque no duplica medición; error de borrar no cierra como si hubiera funcionado; feedback de éxito describe el resultado y es anunciado por lector de pantalla.

### HA07 — P1 — El diario y las mediciones tienen recortes silenciosos que parecen pérdida de datos

**Demostrado:** `dailyCheckins.slice(0,10)` (`health.tsx:501`) y no hay «ver todos»/paginación; los registros anteriores no son accesibles desde Salud. Mediciones se cargan con un límite de 60 para todos los tipos juntos (`database.ts:1156–1166`, `health slice:18–20`), y luego se filtran localmente por tipo (`health.tsx:381–383`). Sesenta lecturas recientes de un solo tipo pueden hacer aparecer otro tipo como «Sin mediciones aún» aunque la DB las conserve. Diario DB sin rango además limita a 90 (`database.ts:1219–1224`).

**Cambio:** preview de recientes claramente rotulado más historial completo con rango/tipo, carga incremental y total. Consulta por tipo cuando se abre detalle; distinguir «sin registros» de «ninguno en este período».

**Aceptación:** poder recuperar el check-in 11 y la medición 61 sin exportar ni tocar datos; una métrica antigua no cambia a «sin mediciones» por registrar otra; límites aparecen explícitos cuando corresponden.

### HA08 — P1 — El + del diario sobreescribe el registro de hoy como si fuera nuevo

**Demostrado:** el + usa `setEditCheckin(undefined)` (`health.tsx:533`) aun si `todayCheckin` existe; el modal resetea mood=3, síntomas=[], notas vacías (`CheckinModal.tsx:49–55`) y guarda la misma fecha de hoy (`:68`). DB hace upsert por perfil/fecha (`database.ts:1244–1250`). «Agregar» puede reemplazar sin aviso lo que la persona ya registró. Al editar un día anterior, el heading sigue preguntando «¿Cómo te sentís hoy?» (`es.ts:494`).

**Cambio:** una entrada por día; + se vuelve «Editar registro de hoy» o precarga datos actuales; títulos con fecha explícita para edición histórica. Ofrecer navegación de fechas si registrar retrospectivamente forma parte del producto.

**Aceptación:** cuando hoy ya tiene registro, todas las entradas abren los mismos valores existentes; ninguna guarda defaults sobre datos previos sin intención visible; al editar 3/10 se muestra 3/10 y nunca «hoy».

### HA09 — P1 — Los documentos de citas no están aislados en estado de UI

**Demostrado:** `appointmentDocuments` es un único array, sustituido al resolver la carga (`appointments slice:94–96`); no se limpia al iniciar. Detalle y formulario renderizan todas las entradas sin filtrar por appointmentId (`AppointmentDetailModal.tsx:92–96`, `:495–501`; `appointments.tsx:299–301`, `:734–737`). Al abrir B tras A, el primer render puede mostrar adjuntos de A mientras carga B. Sin loading/error, tampoco se explica una lista vacía/fallida.

**Cambio:** caché por appointmentId, loading/error por cita y filtrado defensivo; no habilitar abrir/borrar adjuntos que no coincidan con la cita actual. Mostrar progreso de copia y éxito de adjuntar.

**Aceptación:** abrir A/B repetidamente jamás pinta un nombre de archivo de la otra cita; si falla cargar B, hay error y reintento dentro de B; operación de un adjunto mantiene identidad de cita en todo momento.

### HA10 — P1 — Se puede confirmar una dirección junto con coordenadas de otro lugar

**Demostrado:** elegir sugerencia cambia address antes de resolver coords (`LocationPickerModal.tsx:280–315`); si falla resolución, conserva pin. Editar texto sin resolver no invalida pin. Confirmar siempre usa `pinAddress || searchText` con pin actual (`:410–415`), y tras mover mapa, un error de reverse mantiene address anterior (`:363–378`). Puede guardarse texto de un consultorio y coords previas o del centro de Buenos Aires.

**Cambio:** estado explícito «dirección resuelta», «pin movido», «búsqueda sin resolver», «error»; al invalidar, no reutilizar address previo como confirmado. Para texto libre, ofrecer «Guardar dirección sin mapa». Botón de confirmar describe qué se guarda; permitir confirmar coords sin dirección de manera transparente.

**Aceptación:** escribir nueva dirección y confirmar sin Enter no mezcla la dirección con pin viejo; fallo de geocoder se ve y mantiene opción de dirección textual; mover pin invalida address anterior; prueba con red lenta/offline y mapa inaccesible.

### HA11 — P1 — Crear una cita con dirección depende de un mapa y el fallback habla al desarrollador

**Demostrado:** formulario no tiene TextInput para ubicación (`appointments.tsx:603–638`). El fallback del mapa dice en inglés «Google Maps API key required» y muestra rutas/configuración (`LocationPickerModal.tsx:501–514`). Confirmación sigue habilitada. Búsqueda no distingue sin resultados, falta de key y falla de red (`:191–197`, `:214–245`). GPS sin señal usa el mismo error que permiso denegado (`:402–403`).

**Cambio:** dirección de texto como camino completo, mapa opcional. Vacíos y errores en lenguaje de usuario («No encontramos esa dirección», «No pudimos cargar el mapa», «No pudimos obtener tu ubicación»), con acciones apropiadas. «Abrir ajustes» cuando permiso está bloqueado; buscar/manual siempre disponibles.

**Aceptación:** completar una cita con dirección sin permisos de ubicación, sin mapa y offline; ningún mensaje de producto muestra archivos, API keys o SDKs; error geocoder no se diagnostica como permiso.

### HA12 — P1 — «Ninguno» no significa que no habrá notificaciones

**Demostrado:** REMINDER_OPTIONS incluye ninguno=0 (`appointments.tsx:72–77`), pero `notifications.ts:883–896` programa aviso exacto siempre que hay hora. UI hace obligatoria esa hora. Además si la antelación elegida ya pasó, el aviso previo se omite silenciosamente (`notifications.ts:868`) y la tarjeta sigue mostrando la selección.

**Cambio:** explicar dos opciones separadas: aviso anticipado y aviso al momento; «Sin avisos» debe desactivar ambos. Mostrar qué se programó realmente y si no puede cumplirse el margen elegido; permitir continuar con resultado explícito.

**Aceptación:** «Sin avisos» crea cero notificaciones de esa cita; elegir 1 h para una cita dentro de 20 min informa que ese aviso previo no será programado; con permisos bloqueados no se anuncia como recordatorio activo efectivo.

### HA13 — P1 — Citas usa dos definiciones distintas de pasado y omite hora/localización

**Demostrado:** listado usa fecha local `today()` (`appointments.tsx:97`, `:317–319`), detalle usa `new Date().toISOString().slice(0,10)` UTC (`AppointmentDetailModal.tsx:110`). Desde 21:00 en Buenos Aires, una cita del mismo día puede estar en Próximas y mostrar «Past» en detalle. Badge «Past» está en inglés fijo (`:319`). Ambos consideran cualquier hora de hoy próxima. Formulario/calendar muestran HH:mm directo pese a usar formato local en otras superficies (`appointments.tsx:668`, `calendar.tsx:428`).

**Cambio:** función única que deriva futura/en curso/pasada desde fecha/hora local, con caso sin hora; i18n completo; usar formatTimeForDisplay en todas las superficies.

**Aceptación:** mismo estado y hora en card, detalle y agenda; probar 20:59/21:01 AR y cambio de día; cita 09:00 a las 16:00 no se llama futura; español/portugués no muestran «Past»; edición no añade 09:00 a cita sin hora por accidente.

### HA14 — P1 — La cita se guarda sólo después de programar una notificación

**Demostrado:** add agenda primero y persiste después (`appointments slice:50–53`); update cancela aviso previo, programa nuevo y recién después actualiza DB (`:57–64`). Si agenda falla, no se guarda la cita o queda conservado el dato antiguo con aviso previo ya cancelado. El catch del formulario sólo ofrece error genérico (`appointments.tsx:382–383`).

**Cambio:** separar «cita guardada» y «avisos configurados», con persistencia robusta y estado explícito; reintentar aviso sin forzar recrear cita; no cancelar el anterior hasta tener reemplazo coherente o representar fallo.

**Aceptación:** permiso denegado/cupo/notificación fallida permite guardar datos de cita; la UI muestra «Cita guardada; aviso pendiente de configurar» y acción de recuperación; al fallar actualización no se pierde el aviso vigente silenciosamente.

### HA15 — P1 — Cancelar edición descarta campos pero conserva cambios de documentos

**Demostrado:** adjuntar/eliminar persiste inmediatamente desde formulario (`appointments.tsx:415`, `:460`); Cancelar llama closeModal sin rollback (`:771–775`). Los mismos sheets se cierran por exterior/swipe/back sin control de dirty en Citas, Salud y Check-in. Una persona puede perder texto largo por un toque o creer que Cancelar revirtió la eliminación de un documento.

**Cambio:** definir transacción de formulario o separar claramente «Documentos guardados inmediatamente»; cambios de texto deben ser recuperables por draft o confirmación de descarte. Durante save desactivar salidas que creen ambigüedad o conservar estado de operación.

**Aceptación:** cancelar con cambios informa cuáles se descartan; cancelar nunca promete revertir un adjunto que ya se persistió; salida accidental permite volver al draft; cierre mientras se guarda no oculta un resultado que luego modifica datos sin contexto.

### HA16 — P1 — El calendario promete una agenda pero no permite consultar las citas que marca

**Demostrado:** apptDateSet y punto visual existen (`calendar.tsx:145`, `:164–166`, `:340–352`); el contenido sólo renderiza selectedDoses (`:384–468`). Un día con consulta sin medicación muestra un check y «No hay dosis programadas», sin cita. Los puntos de cita comparten forma/color con medicación y no tienen leyenda.

**Cambio:** agenda del día con secciones «Medicación» y «Citas», cantidad de eventos, distintivo de cita y tap a detalle; CTA «Agregar cita para esta fecha». Mostrar vacío completo sólo cuando no hay ningún evento.

**Aceptación:** cada punto de cita permite encontrar esa cita al seleccionar el día; día con sólo cita nunca aparece como vacío; múltiples citas se ordenan por hora y abren su propio detalle; indicadores no dependen sólo del color.

### HA17 — P1 — Calendario reconstruye el pasado desde configuración actual y borra visualmente historia

**Demostrado:** itera schedules actuales y exige medicamento/horario activo en `isScheduleActiveOnDate` antes de buscar log (`calendar.tsx:183–189`; `utils/index.ts:61`). Archivar un medicamento inactiva la entidad; sus logs pueden seguir en Historial pero desaparecen de los días de Calendario. Dosis PRN no tienen schedule en ese loop y tampoco aparecen. Editar horarios altera reconstrucción de días anteriores.

**Cambio:** pasado basado en eventos registrados e historial de pauta; futuro basado en configuración vigente. Incluir PRN con hora real y conservar nombre/cantidad del evento. Separar «planeado» y «registrado» donde no exista historial de pauta.

**Aceptación:** archivar o cambiar un tratamiento no cambia lo ocurrido ayer; una PRN tomada aparece en Calendario e Historial; no inventar omisiones pasadas por agregar un horario hoy; misma fecha produce una cronología compatible en ambas vistas.

### HA18 — P1 — Acciones sobre dosis divergen según el punto de entrada

**Demostrado:** Calendario implementa dos botones propios de tamaño reducido (`calendar.tsx:444–461`), omite snoozedUntil al construir dosis (`:202–212`), no permite motivo/notas/undo y sólo opera hoy (`:395`). Inicio usa DoseCard con más contexto y opciones. Durante snooze pendiente, Calendario puede marcar original vencida mientras Inicio muestra hora pospuesta.

**Cambio:** reutilizar la semántica de DoseCard/acciones compartidas; hora original vs pospuesta explícitas; «Registrar como tomada» y «Omitir» como verbos, con confirmación de resultado y deshacer. Mantener una vía segura para corregir un registro pasado si el producto la admite.

**Aceptación:** dosis pospuesta tiene mismo estado/hora en Inicio y Calendario; registrar desde cualquiera conserva razón/notas/sitio y stock; tomada accidental permite deshacer en la misma superficie; no desaparece la acción antes de anunciar resultado.

### HA19 — P1 — Los estados vacíos sustituyen estados de carga/error en demasiadas superficies

**Demostrado:** Alergias, Citas, Salud, adjuntos y Emergencia comienzan con arrays vacíos y carecen de loading/error propios. Calendario loadMonthLogs usa finally sin catch (`calendar.tsx:106–117`); Historial usa then/finally sin catch (`history.tsx:146–149`). Fallo puede mostrar datos anteriores, vacío o dejar promesa rechazada, sin reintentar. Insights absorbe error y se oculta (`InsightsCard.tsx:50–52`).

**Cambio:** contrato consistente: primera carga, actualización conservando datos, vacío real, filtro sin resultados, error con reintento y éxito. Para información de salud, no inferir ausencia a partir de error. Evitar skeleton completo de grilla después de marcar una dosis, sólo actualizar la tarjeta afectada.

**Aceptación:** forzar fallas de lectura/escritura produce mensaje accionable y conserva identidad/período de los datos; vacío sólo cuando consulta terminó bien; lector de pantalla recibe resultado; nunca se confunde «sin datos» con «datos no disponibles».

### HA20 — P1 — Compartir informe no hace visible perfil, rango efectivo ni recortes

El problema de identidad de paciente en documentos coincide con **SA-12** del anexo de ajustes/accesibilidad: debe contarse una sola vez en la priorización transversal. Este hallazgo añade las diferencias de rango, nombres de archivados y límites silenciosos.

**Demostrado:** Historial puede mostrar una semana/mes arbitrarios pero `generateAndShareReport()` no recibe rango (`history.tsx:120`, `pdfReport.ts:213–228`); siempre consulta desde hoy−30 inclusive. PDF no imprime persona/perfil en header (`pdfReport.ts:169–173`) ni alergias; usa sólo activos para resolver nombres de logs (`:92–95`), por lo que registros de archivados muestran IDs. Mediciones se limitan a 60 entre todos los tipos del perfil activo y luego a 20/tipo; diario a 30, sin informar truncamiento. No hay mezcla entre perfiles en esa consulta. Snapshot tampoco recibe ni renderiza nombre del perfil (`caregiverSnapshot.ts:42–48`, `:179–180`).

**Cambio:** pantalla breve de preparación: persona, período, secciones, cantidad de registros y preview; selección por defecto basada en contexto. Incluir identidad en cada documento, rango y «generado el»; nombres históricos; explicitar límites o paginar. Distinguir informe médico, resumen de cuidador y archivo de interoperabilidad en lenguaje de tareas.

**Aceptación:** compartir desde semana pasada ofrece esa semana; preview y documento tienen mismos rangos/totales/perfil; archivados mantienen nombre; dos PDFs de perfiles distintos no son indistinguibles; nombre del archivo ayuda a identificarlos sin abrir.

### HA21 — P1 — Texto de usuario se interpreta como HTML en el informe médico

**Demostrado:** nombres/notas se interpolan sin escape (`pdfReport.ts:79–82`, `:95–97`, `:114`, `:139`), a diferencia del snapshot que tiene `esc()` (`caregiverSnapshot.ts:105–107`). Texto ordinario con `<...>` puede desaparecer/cambiar layout, y markup pegado puede modificar el contenido visual del informe.

**Cambio:** escape de todo contenido dinámico y control de salto de línea; generar HTML con helper único. Mantener contenido literal, incluso símbolos usados en notas.

**Aceptación:** `<comida>`, `A&B` y markup pegado se ven como texto literal en PDF; el texto no puede introducir filas/secciones; nombres largos y notas multilínea sobreviven a paginado sin perder significado.

### HA22 — P1 — «Evolución» visualiza secuencia, no tiempo ni magnitud interpretable

**Demostrado:** chart recibe sólo arrays de valores (`health.tsx:385–389`, `:572–579`), distribuye puntos por índice y escala auto min/max (`SimpleLineChart.tsx:36–55`). No hay eje, fecha, unidad, mínimos/máximos, tooltip o resumen accesible; un intervalo de meses ocupa igual espacio que un día. Orden de store tras nueva medición es prepend, no measuredAt (`health slice:30`); registro retroactivo se convierte inmediatamente en «latest» (`health.tsx:394`) y extremo de tendencia hasta recargar.

**Cambio:** ordenar siempre por measuredAt; chart con puntos `{timestamp,value}` y rango visible, unidad, ejes mínimos y selección de lectura. Sparkline sólo decorativa con resumen textual de cambio y fecha; para presión, leyenda sistólica/diastólica permanente.

**Aceptación:** registrar un dato viejo no cambia la última medición; rangos espaciados de forma temporal; cualquier punto revela fecha/hora/valor/unidad; opción de tabla accesible; una variación mínima no parece alarma por falta de escala. No añadir interpretación diagnóstica sin requisitos validados.

### HA23 — P1 — Estado seleccionado y acciones pequeñas no son suficientemente explícitos para accesibilidad

**Demostrado:** subtabs, moods y síntomas carecen de `accessibilityState` (`appointments.tsx:44–66`, `health.tsx:205–227`, `CheckinModal.tsx:119–155`). Numerosos iconos carecen de label/role: add/back Salud, ubicación editar/quitar, close mapa, close detalle y trash adjuntos. Edit/delete cita miden ~31 px (icon 15 + padding 8×2; `appointments.tsx:164–174`), chips ubicación ~24 px y back Salud sólo icon 22 px. Día Calendario tiene min-height 44 pero ancho flexible puede ser menor; no hay nombre completo de fecha/estado/cantidad accesible. SVG carece de descripción equivalente.

**Cambio:** primitivas accesibles comunes para botones, tabs, radio/multiselección; áreas efectivas generosas mediante min-size/hitSlop, estados selected/checked/disabled/busy, labels contextualizados con entidad/fecha; gráficos con alternativa textual. Anunciar éxito/error y foco coherente al abrir/cerrar modal.

**Aceptación:** VoiceOver/TalkBack puede recorrer y ejecutar todos los controles con nombres únicos; anuncia seleccionados y progreso; objetivo de producto ≥44×44 pt iOS y ≥48×48 dp Android; sin depender de color para selección/estado. La prueba en dispositivos debe confirmar estos objetivos, no se da por realizada en esta auditoría.

### HA24 — P1 — Borrar una alergia es más fácil que borrar una medición

**Demostrado:** remove se ejecuta al primer toque (`allergies.tsx:136`), sin confirmación/undo; la etiqueta accesible es sólo «Eliminar» (`:135`). Se admiten entradas duplicadas y no hay editar/normalizar la asociación desde texto libre. «Agregar» con + y elegir una sugerencia producen registros de capacidades distintas con copy de subtítulo que promete chequeo para ambos (`es.ts:568–573`).

**Cambio:** deshacer visible al eliminar o confirmación contextual según persistencia; evitar duplicados por ingrediente; explicación previa de «Elegir ingrediente para activar avisos» vs «Guardar sólo como nota». Ofrecer reconocer/editar una alergia ya guardada. No usar «garantiza/asegura» como promesa absoluta de detección.

**Aceptación:** eliminación errónea recuperable desde la misma pantalla; label «Eliminar alergia a X»; mismo ingrediente no se duplica por doble toque; toda entrada expone su alcance de chequeo con lenguaje comprensible antes y después de guardar.

### HA25 — P2 — Historial es un resumen sin camino para entender un evento

**Demostrado:** notes y skipReason se recortan a una línea (`history.tsx:394–411`) en una View sin tap; tomadaAt e injectionSite no se muestran. Heatmap es una View no interactiva y sólo color (`:239–255`); gris agrupa futuro, sin dosis, sin registros y pendientes (`dayAdherenceColor`). Stats suman omitidas+perdidas en una única categoría. Insights no cambia con rango, aunque el título de tarjeta sí indica 30 días.

**Cambio:** tap en evento abre detalle con hora real/programada, nota completa, motivo/sitio y corrección; tap en día filtra lista y muestra numerador/denominador. Distinguir visualmente sin pauta/sin registro/futuro; explicar la ventana fija de insights y dar «Ver registros».

**Aceptación:** ninguna nota guardada queda inaccesible; cada % se puede descomponer en tomas/total y período; heatmap tiene valor exacto textual; comparar semanas no hace pensar que insights corresponde a la seleccionada.

### HA26 — P2 — Jerarquía visual consistente pero demasiado homogénea

**Demostrado por estilos:** tarjetas con el mismo borde, radio y peso; títulos font-black, números font-black, múltiples iconos de color, notas 10–12 px, botones redondeados similares. Todas las métricas tienen el mismo rango visual, incluidas vacías. Pasadas en Citas pierden opacidad completa (`appointments.tsx:105`), reduciendo también contraste de información útil. Header de Salud puede acomodar un título largo, back y + en una sola fila (`health.tsx:510–538`).

**Cambio:** jerarquía por tarea y contenido: próxima acción > contexto > lectura histórica; reducir bordes/decoración repetidos; tamaños legibles para instrucciones y datos auxiliares; los pasados con badge/fecha en vez de opacity global. Salud: última medición con fecha, contenido expandible y CTA textual; diferenciar vacíos sin darles el mismo peso que datos.

**Aceptación:** la tarea principal se identifica sin leer toda la pantalla; títulos largos en ES/PT y fuentes al 200% conservan botones visibles; listados densos no usan texto de 10 px para decisiones; validar contraste calculado y capturas reales de modo claro/oscuro.

### HA27 — P2 — Recordatorio de salud requiere borrar para cambiar y agenda cada tick del spinner

**Demostrado:** activo sólo ofrece X (`health.tsx:317–339`); no hay editar. iOS mantiene spinner visible y `handleReminderChange` llama schedule y toast en cada evento (`:482–489`). Web helper hace return sin persistir/programar (`notifications.ts:932`) pero la UI igual muestra éxito/activo en memoria.

**Cambio:** fila «Todos los días, 09:00 · Cambiar» con switch independiente; sheet/picker con Guardar/Cancelar; diferenciar habilitado/programado/permiso bloqueado/no compatible. No guardar antes de confirmar intención.

**Aceptación:** editar no obliga a eliminar; mover rueda no agenda múltiples operaciones/toasts; Cancelar conserva valor anterior; entorno sin soporte no dice recordatorio guardado efectivo.

### HA28 — P2 — Un PDF y un FHIR no representan de igual forma el mismo tratamiento

**Demostrado:** FHIR conserva sólo `timings` de horarios activos (`fhirExport.ts:49`), omitiendo weekdays/regimen en texto (`:62–64`) y límites PRN; PDF médico omite horarios, alergias y reglas PRN; cuidador incluye límites pero no última PRN/toma real. Ninguna exportación ofrece revisión previa. El nombre «Exportar para tu médico (FHIR)» no explica que es un archivo JSON ni qué no contiene (`es.ts:545–547`). No se afirma aquí invalidez de FHIR R4: esta observación es sobre pérdida de significado de datos del propio producto, sin haber realizado validación con un receptor clínico externo.

**Cambio:** modelo de presentación del plan compartido y contratos de alcance explícitos para cada exportación. En interfaz: «Informe legible (PDF)», «Plan para cuidador (PDF)», «Archivo para sistemas de salud (FHIR JSON)» con vista previa de perfil, contenido y fecha. Para PRN operativo, agregar últimas tomas y momento mínimo según reglas configuradas.

**Aceptación:** weekdays/regímenes/límites no se convierten en toma diaria fija al exportar; archivo explica su alcance; mismo tratamiento mantiene cantidad/horario coherente; validar formato con esquema oficial/receptor como actividad separada antes de prometer interoperabilidad.

## Hipótesis y pruebas visuales pendientes

Estos puntos tienen señales en implementación pero requieren reproducción/render real para evaluar impacto y prevalencia. No se presentan como fallas observadas en dispositivo.

| Riesgo a probar | Señal | Prueba concreta |
|---|---|---|
| Race de cambios de mes/período o búsqueda | Calendar/History y autocomplete carecen de token de request/AbortController; mounted sólo evita updates tras unmount | Introducir latencia invertida A/B; navegar rápido; comprobar que encabezado, resultados y acciones conservan identidad del último request |
| Focus y transición de dos modales en iOS | Formulario se oculta antes de mapa y reaparece en onClose sin esperar onDismiss del picker | Crear/editar, abrir/cerrar mapa 10 veces, cancelar/confirmar y minimizar app; conservar draft y foco; verificar que no aparezca modal en blanco |
| Listas grandes en ScrollView | Salud anida FlashList dentro de ScrollView vertical (`health.tsx:558`, `:603`, `:706`) | 500 mediciones y 90 check-ins; medir scroll, memoria, altura, último elemento y comportamiento del teclado |
| Layout a 200%, pantallas angostas y safe area | Moods en fila de 5, tamaños 10 px, títulos largos; mapa usa padding top fijo 48/56 y bottom 20/36 (`LocationPickerModal.tsx:431`, `:679`) | 320/360 px, notch, landscape, gestos, teclado abierto, font scaling 200%; sin solapamiento ni pérdida de controles |
| Mapa embebido al cambiar de cita sin desmontar | `initialRegion` se utiliza en MapView del detalle y marcador cambia por props | Abrir dos citas muy lejanas de forma consecutiva; confirmar centro y marker coherentes; fallback sin conexión |
| Llamar/abrir mapa/compartir en sistemas sin handler | Emergency tel no catch; Share/Linking con fallback incompleto | Tablet sin teléfono, maps desinstalado, share cancelado, provider falla; salida recuperable y sin falso éxito |
| Confusión de perfil en encabezados | Estas pantallas no incluyen ProfileChip; exportaciones PDF no incluyen nombre | Prueba con persona que administra 2–3 perfiles; pedir identificar de quién es cada registro sin volver a Inicio |
| Contraste y códigos rojo/verde | Celdas coloreadas con texto blanco y alpha cc; pasado opacity60; colores de métricas hardcoded | Medir contraste de temas reales; simulación de deficiencia cromática; distinguir estado con icono/texto |
| Eliminación física de adjuntos que no están cargados | deleteAppointment sólo recorre array global de docs (`appointments slice:78`), no consulta todos | Eliminar cita con adjuntos nunca abiertos en la sesión; revisar que no queden archivos huérfanos y UI no prometa otra cosa |
| Push de Health Connect y borrado local | Guarda fire-and-forget y delete sólo local (`health slice:31–37`) | Desconectar permisos, guardar y borrar; verificar explicación de estado de sincronización y alcance de eliminación |
| Exportaciones paginadas y fuentes/emoji | HTML inline sin page-break controls ni render visual de QA en esta tarea | PDF de 50 medicamentos, nombres largos y muchas notas; revisar tablas, saltos, encabezados repetidos y caracteres en iOS/Android |

## Dirección de experiencia propuesta por pantalla

**Calendario:** encabezado con mes + Hoy + selector mes/año; grilla compacta con eventos distinguibles por forma/contador; agenda del día ordenada por hora que incluye dosis, PRN y citas. El día seleccionado debe tener resumen «3 dosis · 1 cita». Reutilizar misma tarjeta de dosis y acciones que Inicio; evitar una segunda implementación de estado/horario/cantidad.

**Citas:** próxima cita destacada con fecha, tiempo restante, profesional y dirección; lista cronológica agrupada por día y búsqueda para histórico. Alta con título, fecha/hora y profesional; ubicación manual primero con mapa opcional; recordatorios transparentes. Documentos accesibles desde creación o paso posterior explícito, con progreso y alcance de Guardar/Cancelar claro. Una acción secundaria visible «Reprogramar» puede precargar fecha/hora sin obligar a recorrer todo el formulario.

**Salud:** última lectura siempre junto a cuándo se midió. Métricas habituales primero o personalizables, sin llenar la pantalla de tarjetas vacías. Agregar lectura como acción inmediata desde overview y tipo; detalle con rango 7 d/30 d/90 d/Todo, gráfico interpretable y tabla; editar lectura errónea sin borrar/recrear. Recordatorio como fila editable.

**Diario:** hoy como acción principal, historial completo debajo con fechas. Edición histórica inequívoca y un registro por día. Cambiar rojo genérico de todos los síntomas por selección neutral; reservar color de riesgo para significado explícito. Presentar «Sin síntomas» como elección intencional si se necesita diferenciar no respondido.

**Historial:** separar «adherencia» de «registro cronológico» dentro de la misma pantalla; período claro, denominator explicable, detalle de cada día/evento, filtros por medicamento y estado. El CTA de compartir prepara un documento de esa persona/período. Insights con ventana visible y vínculo a registros o ajuste de rutina, sin interpretaciones diagnósticas.

**Alergias:** ficha de ingredientes con capacidades de aviso explícitas y edición; lista con estado de registro de ausencia/desconocido definido por producto. Agregar con búsqueda debe hacer comprensible cuándo es una coincidencia reconocida. Eliminar recuperable y nombre de alergia en confirmación/undo.

**Emergencia:** identidad y actualización arriba; «sin datos registrados» diferente de ausencia declarada; alergias y contacto legibles sin desplazamientos extensos; un CTA para llamar que sobreviva fallos del handler. Mantener contexto de persona en todas las secciones y señal de datos cargados por la persona. No asumir que el usuario estableció una ficha sólo por entrar a la ruta.

**Exportaciones:** una experiencia de preparación común para las tres salidas, que adapta secciones a la finalidad. Mostrar primero perfil, período y vista previa, luego compartir. Evitar reducir un plan complejo a una pauta diaria simple; una mejora estética de estos documentos debe venir después de resolver los contratos de datos.

## Orden de implementación y aceptación transversal

1. **Corregir representación:** HA01–HA04, HA05, HA10, HA17; unificar identidad de dosis, fecha local, cantidad efectiva y estados desconocidos.
2. **Cerrar acciones:** HA06–HA09, HA11–HA15, HA18–HA20, HA24; cada acción con contexto, progreso, error recuperable y resultado.
3. **Hacer comprensibles datos y documentos:** HA21–HA22, HA25, HA27–HA28; rango, cantidad, fecha, persona, lectura completa.
4. **Pulir visual y accesibilidad:** HA23 y HA26 sobre componentes compartidos; validar con personas y dispositivos las hipótesis de layout, contraste y navegación.

Un flujo está listo cuando puede completarse desde vacío y con datos existentes, operar sin red donde los datos son locales, recuperarse de permiso denegado y error de persistencia, soportar salida accidental, explicitar perfil/fecha y ejecutarse íntegramente con lector de pantalla. El criterio central de calidad aquí es que la misma dosis, persona o cita conserve significado al cambiar de pantalla o salir en un documento.
