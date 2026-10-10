# Auditoría UI/UX — medicamentos, dosis y alarma

Fecha de corte: 9 de octubre de 2026. Revisión estática del código del workspace; las conclusiones de funcionamiento se apoyan en caminos de código concretos. Se incorpora una comprobación auxiliar comunicada por el agente principal en un APK anterior, identificada como tal, sin asumir correspondencia entre ese APK y este código. No se modificó código de la aplicación ni se leyeron credenciales.

## Alcance y severidad

Se revisaron Inicio, Medicamentos, alta y edición, los cinco pasos del formulario, tarjetas de dosis y medicamentos, cámara/código de barras, selección de sitio, alarma completa y acciones rápidas, PRN, inventario, regímenes, duplicidad de ingredientes/alergias, servicios y persistencia relacionados.

- **P0:** daño inmediato y generalizado o bloqueo completo. No se verificó un hallazgo P0 en este alcance.
- **P1:** corregir antes de una renovación visual: una intención explícita cambia datos erróneamente, se ocultan acciones o se presentan datos esenciales contradictorios.
- **P2:** fricción, descubrimiento, jerarquía, accesibilidad o consistencia que deben entrar en el rediseño.
- **Confirmado por código:** camino determinista identificado. **Riesgo a validar:** inferencia que requiere dispositivo, lector de pantalla o prueba de uso.

Esta auditoría evalúa seguridad de la interacción —que la app haga lo que la persona quiso y muestre sus datos de forma coherente—. No valida indicaciones, eficacia, dosis, sitios de administración ni suficiencia clínica de catálogos.

## Hallazgos prioritarios

### MED-01 · P1 · «Cancelar» registra una omisión

**Confirmado por código.** En el modal de motivo de omisión, el botón etiquetado «Cancelar» cierra el modal **y ejecuta `onSkip(undefined)`**: `components/DoseCard.tsx:564–570`. Inicio lo enlaza a `markDose(..., "skipped")` (`app/(tabs)/index.tsx:465–466`); el store escribe el registro y cancela las notificaciones (`src/store/slices/medications.ts:224–225`). Cancelar produce un cambio clínico registrado y silencia el recordatorio. Cerrar con backdrop/atrás sólo cierra: tres mecanismos de cancelación tienen efectos distintos.

**Propuesta:** Cancelar nunca llama a `onSkip`; si hace falta registrar sin motivo, ofrecer una acción independiente «Omitir sin motivo». **Aceptación:** abrir Omitir y cancelar por botón, gesto, backdrop y botón Atrás mantiene estado, historial, stock y alarmas intactos. Seleccionar motivo u omitir sin motivo crea exactamente un registro.

**Comprobación auxiliar:** el agente principal reprodujo la conducta en emulador aislado con APK **1.7.0, versionCode 35, actualizado el 27 de julio**, iniciado con `-read-only -no-window`. El árbol inicial mostraba 0 tomados/4 no tomados (`settled35-today.xml`); abrió Omitir y el árbol confirmó el modal y «Cancelar» (`cancel-before.xml`); tras Cancelar pasó a 1 omitido/3 no tomados (`cancel-after.xml`). Artefactos locales bajo `screenshots/uiux-audit-2026-10-09/`, ignorados por Git. La prueba no valida un build del código actual, cuyo versionCode es distinto; sí coincide con el defecto identificado en el código revisado.

### MED-02 · P1 · «Única vez» puede guardar alarmas que la pantalla oculta

**Confirmado por código.** El paso de alarmas muestra sólo `scheduleFields.slice(0, 1)` cuando el modo es `once` (`components/MedicationForm.tsx:1192–1202`), pero guardar serializa **todos** `data.schedules` (`:479–488`). Cambiar un tratamiento con tres horarios a «Única vez» muestra uno y conserva tres.

**Propuesta:** definir si una vez significa una toma o un día de tratamiento; en el primer caso reducir y confirmar la eliminación de horarios extra, en el segundo mostrar todos los horarios y cambiar el nombre. **Aceptación:** el resumen previo al guardado y las alarmas persistidas coinciden exactamente al alternar entre Repetir, Única vez y A demanda.

### MED-03 · P1 · Archivar en Android elimina «Otro» y «Cancelar» del diálogo

**Confirmado contra la dependencia instalada.** `app/(tabs)/medications.tsx:43–53` entrega cinco botones: finalizado, indicación médica, efectos secundarios, otro y cancelar. React Native instalado usa `buttons.slice(0, 3)` y `cancelable: false` en Android (`node_modules/react-native/Libraries/Alert/Alert.js:87–100`). Por eso se descartan «Otro» y «Cancelar», y el diálogo no permite cerrarse tocando fuera.

**Propuesta:** selector de motivo en una hoja con cuatro opciones, Cancelar y confirmación «Archivar». **Aceptación:** Android e iOS exponen las cuatro razones, siempre permiten salir sin cambios, y sólo la confirmación archiva/cancela recordatorios.

**Comprobación auxiliar:** el agente principal abrió Archivar desde Medicamentos en el mismo APK **1.7.0/code 35** aislado. `archive-dialog.xml` sólo contenía título/mensaje y los botones «Efectos adversos», «Indicación médica» y «Terminé el tratamiento»; no incluía «Otro» ni «Cancelar». La evidencia está bajo `screenshots/uiux-audit-2026-10-09/`. Este resultado corresponde al APK anterior, no a una ejecución del HEAD code 36; concuerda con el recorte determinista de botones encontrado en la dependencia actual.

### MED-04 · P1 · La alarma presenta la dosis base cuando el régimen cambió de etapa

**Confirmado por código.** Inicio deriva la cantidad efectiva por fecha (`src/hooks/useTodaySchedule.ts:58`) y la notificación también (`src/services/notifications.ts:527`). La alarma usa directamente `medication` para TTS (`app/alarm.tsx:106`), cantidad principal (`:302`) y co-dosis (`:358`), sin aplicar `withEffectiveDose`.

**Ejemplo de interfaz:** dosis base 40, etapa actual 20: Inicio/notificación muestran 20; la alarma muestra y puede leer 40.

**Propuesta:** un único modelo de dosis correspondiente a `scheduledDate` para tarjetas, alarma, TTS y grupo. **Aceptación:** para cada etapa del régimen, todos los puntos de contacto muestran la misma cantidad y unidad; validar también días históricos, cambio de etapa y alarma pospuesta.

### MED-05 · P1 · Inicio oculta todos los medicamentos PRN si no hay dosis programadas hoy

**Confirmado por código.** `doses` se construye desde horarios, nunca desde PRN (`src/hooks/useTodaySchedule.ts:33–36`). En Inicio la sección «A demanda» está dentro del `else` de `doses.length === 0` (`app/(tabs)/index.tsx:432–438`, `:525–606`). Un perfil que sólo usa PRN, o un día de descanso del régimen, muestra vacío aunque existan medicamentos activos que se pueden registrar.

**Propuesta:** sección PRN independiente del listado programado; estados vacíos distintos para «No tenés medicamentos» y «Hoy no hay dosis programadas». **Aceptación:** perfil sólo PRN y día sin dosis mantienen «Registrar toma» visible en Inicio; el resumen no invita erróneamente a agregar el primer medicamento.

### MED-06 · P1 · Pospuesta puede aparecer «No tomada» y perder sus acciones

**Confirmado por código; el instante de actualización depende de renderizados.** El estado compara `schedule.time` original con `now`, sin considerar `snoozedUntil` (`src/hooks/useTodaySchedule.ts:44–49`, `:67`). Las tarjetas `missed` no permiten posponer/reprogramar (`components/DoseCard.tsx:406–435`), y el badge sólo es accionable si `pending` (`:253–260`). Una toma de 08:00 pospuesta a 09:00 puede pasar a «No tomada» a las 08:01.

**Propuesta:** separar horario original, próximo recordatorio y estado de registro. Una toma pospuesta sigue pendiente hasta su nuevo horario; usar «Sin registrar»/«Vencida» en lugar de deducir que no se tomó. **Aceptación:** después de posponer o reprogramar, el estado y las acciones siguen siendo coherentes antes y después de ambos horarios y al volver desde segundo plano.

### MED-07 · P1 · Reactivar/restaurar puede dejar Inicio sin las dosis restauradas

**Confirmado por la composición de estado.** `loadAll` obtiene sólo horarios de medicamentos activos (`src/store/index.ts:75–82`; `src/db/database.ts:844–850`). Reactivar programa alarmas, pero sólo actualiza `medications` (`src/store/slices/medications.ts:156–171`); restaurar archivado hace lo mismo (`:193–200`). Si la app recargó mientras el medicamento estaba inactivo, su horario no está en `store.schedules`, y reactivarlo no lo devuelve a Inicio hasta una nueva carga completa.

**Propuesta:** actualizar medicamentos y horarios atómicamente al pausar, reactivar, archivar y restaurar. **Aceptación:** pausar/archivar, reiniciar y reactivar/restaurar devuelve inmediatamente las dosis a Inicio y Calendario, sin gesto de refresco y sin alarmas duplicadas.

### MED-08 · P1 · El inventario puede crecer al deshacer una toma con stock cero

**Confirmado por código.** Registrar con cantidad cero no resta (`src/store/slices/medications.ts:244`); revertir una toma suma uno incondicionalmente si se rastrea stock (`:369–375`). También pasar de tomada a omitida suma uno (`:255–258`). Secuencia: stock 0 → tomada (0) → revertir (1).

**Propuesta:** persistir el cambio real de inventario asociado al registro y revertir ese cambio; decidir cómo representar deuda/stock desconocido. **Aceptación:** stock 0 y 1, toma repetida, omitir/revertir, deshacer y retomar conservan el inventario correspondiente a las acciones reales.

### MED-09 · P1 · Guardado sin resumen y con errores finales difíciles de localizar

**Confirmado por código.** El alta exige pasar por Identidad, Frecuencia, Alarmas, Extras y Apariencia (`components/MedicationForm.tsx:1342–1344`); sólo el último paso muestra guardar (`:1414–1435`). No hay revisión de nombre/cantidad/fechas/horarios antes de confirmar. Frecuencia valida sólo `repeatMode` (`:305–310`), omitiendo campos de régimen y fechas que sí valida el schema al final (`src/schemas/medication.ts:72–108`). `handleValidationError` muestra un toast sin saltar al campo (`components/MedicationForm.tsx:508–513`).

**Propuesta:** flujo básico de identidad + pauta + revisión; extras expandibles; errores en el paso que los originó, foco/scroll al primer error. **Aceptación:** un régimen inválido no permite abandonar su paso sin información; guardar desde cualquier resumen lleva al primer campo inválido. La revisión muestra exactamente la pauta persistida y permite corregirla.

### MED-10 · P1 · Guardar puede completarse antes de mostrar un error genérico

**Confirmado por código.** Alta y edición guardan, luego consultan alergias dentro del mismo `try` (`app/medication/new.tsx:20–45`, `:65–66`; `app/medication/[id].tsx:119–149`, `:169–170`). Si falla la lectura posterior, la persona recibe «error» aunque la medicación y sus alarmas ya fueron creadas o editadas. El alta también persiste medicación antes de insertar/programar todos los horarios (`src/store/slices/medications.ts:60–84`).

**Propuesta:** diferenciar «Guardado» de «No pudimos completar la comprobación» y «Guardado con recordatorios pendientes»; usar operación consistente/idempotente y reintento de recordatorios. **Aceptación:** fallas simuladas en BD de alergias, inserción de horarios y programación indican qué quedó guardado, preservan el borrador y no generan duplicados al reintentar.

## Inventario de acciones y estados

Las acciones marcadas como «presente» existen en el código; no implica que cada ruta funcione correctamente en un build instalado.

| Pantalla / acción | Estados y resultado actual | Evidencia / evaluación |
|---|---|---|
| Inicio: ver fecha y perfil | Fecha local; selector con varios perfiles | `app/(tabs)/index.tsx:167–168,257–267`; revisar encabezado estrecho y visibilidad de perfil |
| Inicio: ir a Calendario, Citas y alta | Atajos rotulados con háptica | `:274–323`; buena descubribilidad; rótulos de 10 px |
| Inicio: ver pendientes, tomadas, omitidas, no tomadas y racha | Chips; información de racha en diálogo | `:327–362`; counts no actúan como filtros; PRN no integra el resumen |
| Inicio: actualizar | Pull to refresh sólo carga logs | `:178–183`; no actualiza medicación/citas y no tiene recuperación de error |
| Inicio: ver y cerrar consejo | Consejo sólo si pendiente y no visto; tap completo lo descarta | `:440–452`; instrucción «reprogramar» y acción «cerrar» compiten |
| Inicio: registrar/control diario y citas | Antes de dosis; cerrar prompt, ver todas, abrir cita | `:372–429`; compiten con la tarea principal |
| Inicio: registrar toma programada | Acción inmediata; pasada usa «Marcar como tomada» | `components/DoseCard.tsx:180–194,364–374,424–433`; reversible desde Completados |
| Inicio: omitir | Hoja con cuatro motivos, Cancelar, backdrop/gesto | `:530–575`; MED-01 |
| Inicio: posponer | Duraciones rápidas + rueda personalizada + cancelar | `:578–716`; buen control granular; falta hora/fecha resultante explícita |
| Inicio: reprogramar sólo hoy | Badge horario; picker nativo Android / hoja iOS | `app/(tabs)/index.tsx:138–145,232–251,612–663`; MED-06, MED-12 |
| Inicio: deshacer postergación | En pendiente pospuesta; restaura hora original | `components/DoseCard.tsx:393–403`; no siempre visible debido a MED-06 |
| Inicio: revertir tomada/omitida | Botón en completados; borra log, repone stock, programa | `:325–336`; `src/store/slices/medications.ts:363–387`; MED-08, MED-23 |
| Inicio: agregar/editar/eliminar nota | Sólo completadas; límite 200, guardar/cancelar/backdrop | `components/DoseCard.tsx:439–451,478–528`; cierre antes de persistir, sin gestión error |
| Inicio: registrar/editar sitio | Automático tras toma inyectable; chip en tomadas | `app/(tabs)/index.tsx:185–210,669–675`; `DoseCard.tsx:454–466`; MED-25 |
| Inicio: registrar PRN | Confirmación; alerta de límites con opción explícita de registrar igual | `app/(tabs)/index.tsx:525–606`; MED-05, MED-16 |
| Medicamentos: ver activos, pausados y archivados | Lista completa por secciones; tarjetas para activos/pausados | `app/(tabs)/medications.tsx:128–130,165–249`; sin búsqueda, filtros ni orden configurable |
| Medicamentos: agregar/editar | Botón + y Editar en tarjeta | `:140–147,176`; edición abre mismo wizard completo |
| Medicamentos: pausar/reactivar | Switch instantáneo cancela/recrea alarmas | `components/MedicationCard.tsx:136–145`; MED-07, MED-23 |
| Medicamentos: archivar con motivo | Conserva registro, cancela alarmas; selector Alert | `app/(tabs)/medications.tsx:42–55`; MED-03 |
| Medicamentos: restaurar archivado | Icono inmediato, pasa a activo y programa | `:232–239`; MED-07, MED-23 |
| Medicamentos: eliminar | Confirmación con nombre; cancela alarmas; sin recuperación | `:57–71`; MED-24 |
| Medicamentos: PRN | Botón «Registrar toma» también desde tarjeta | `components/MedicationCard.tsx:254–264`; mejor acceso alternativo; confirmación sin cantidad/última toma |
| Medicamentos: stock y próxima toma | Badge, días estimados, próximo horario o completado, countdown inyectable | `:169–219,266–280`; MED-13, MED-14 |
| Medicamentos: refrescar | Carga completa de datos | `app/(tabs)/medications.tsx:28–32`; sin finally/catch |
| Medicamentos: reset de desarrollo | Sólo `__DEV__`; confirmación destructiva | `:111–125,255–264`; no es acción de producción |
| Alta/edición: identificar | Nombre manual, autocomplete regional, escáner si soportado | `components/MedicationForm.tsx:599–664`; MED-20 |
| Alta/edición: definir cantidad/unidad | Cantidad decimal; carrusel de ocho unidades | `:666–713`; aclarar concentración vs cantidad de unidades |
| Alta/edición: categoría | Seis chips, «Otro» por defecto | `:715–746`; la elección después altera orden de Inicio |
| Alta/edición: frecuencia | Única vez, repetir y a demanda; cantidad de pasos dinámica | `:808–916`; MED-02 |
| Alta/edición: PRN límites | Máximo diario y horas mínimas opcionales | `:918–960`; MED-15, MED-16 |
| Alta/edición: fechas | Inicio/fin opcionales; día para única vez; seleccionar/limpiar | `:962–989`; MED-17 |
| Alta/edición: régimen | Normal, cada N, ciclo, mensual o etapas; agregar/eliminar etapa | `:991–1170`; MED-09, MED-18 |
| Alta/edición: alarmas | Hora, días, todos, agregar/quitar; no quitar último | `:104–170,1177–1235`; MED-19 |
| Alta/edición: extras | Notas, stock, umbral condicionado, inyectable, renovación | `:1238–1334`; varias tareas independientes en una sección genérica |
| Alta/edición: aspecto | Color personalizado; subir/cambiar/quitar foto, permisos galería | `:753–804`; aspecto opcional no debería retrasar guardar |
| Alta/edición: navegación/guardar | Atrás, siguiente, omitir, omitir y guardar, guardar | `:527–582,1388–1443`; MED-09, MED-21 |
| Alta/edición: duplicado de nombre | Bloquea sólo al guardar y muestra toast | `:462–466`; puede ser otro tratamiento/concentración del mismo producto |
| Alta/edición: advertencias | Alergia o ingrediente repetido después de guardar | `app/medication/new.tsx:44–62`; MED-22 |
| Escáner: permiso/leer/cancelar | Permiso concedido, pendiente o denegado; un resultado por apertura | `components/BarcodeScannerModal.tsx:30–75`; MED-20 |
| Escáner: match/no match | Prefill nombre/identidad; toast; cierre | `components/MedicationForm.tsx:1447–1461`; no prellena cantidad; debe comunicarlo |
| Sitio: escoger sugerencia/otro/omitir | Seis opciones, actual/sugerida; cerrar sin dato | `components/SitePickerModal.tsx:25–73`; MED-25 |
| Alarma: abrir recordatorio | Despierta Android; iOS desde notificación; perfil visible | `app/alarm.tsx:17–39,281–288`; diferenciación plataforma ya documentada |
| Alarma: confirmar/omitir | Detiene sonido y escribe registro; nota opcional | `:227–239`; MED-04, MED-26, MED-27 |
| Alarma: posponer/cancelar selección | Selector de opciones; elegido detiene sonido y programa | `:245–249,417–475`; MED-26, MED-28 |
| Alarma: agrupar co-dosis | Mismo horario original; confirmar/omitir individualmente | `:194–225,341–392`; MED-04, MED-29 |
| Alarma: nota | Mostrar/ocultar; 200 caracteres, se guarda al confirmar/omitir | `:309–337`; «Cancelar» oculta pero preserva borrador |
| Alarma: acciones rápidas | Ejecuta tomada/omitida/posponer sin UI; falla navega de vuelta | `:140–164`; error no visible; MED-26 |
| Alarma: volver/salir | Bloquea Atrás Android; sin salida neutral explícita | `:110–117`; MED-27 |

## Resto de hallazgos de comportamiento

### MED-11 · P1 · Stock en «unidades» consume siempre una por toma

**Confirmado por código; el significado correcto de una unidad requiere decisión de producto.** La UI pide cantidad y stock en «unidades» (`components/MedicationForm.tsx:1273–1298`; `src/i18n/es.ts:203`), mientras cada toma resta 1 (`src/store/slices/medications.ts:245,438`), incluso si la dosis dice 2 comprimidos, 0,5 comprimido o 5 ml. El modelo permite cantidad de dosis en mg junto a stock sin equivalencia de concentración.

**Propuesta:** nombrar unidad de inventario y consumo por toma por separado; si inventario son «tomas disponibles», decirlo; si son comprimidos/ml, consumir cantidad correspondiente y admitir fracciones. **Aceptación:** tres ejemplos configurados (dos comprimidos, medio comprimido, volumen) muestran una previsión y un decremento comprensibles; no inferir conversión mg→comprimidos sin datos del producto.

### MED-12 · P1 · Reprogramar acepta una hora pasada sin explicar el resultado

**Confirmado por código.** El picker es sólo hora y no restringe futuro (`app/(tabs)/index.tsx:232–251,630–635`); `rescheduleOnce` siempre compone hoy con esa hora y cancela/reprograma (`src/store/slices/medications.ts:332–339`). La UI anuncia éxito sin esperar. Una hora de hoy ya pasada no tiene una intención clara y puede cancelar el recordatorio anterior.

**Propuesta:** mostrar fecha+hora y limitar a futuro o pedir explícitamente «Mañana a…»; permitir cambiar sólo el próximo recordatorio mediante una semántica consistente. **Aceptación:** a las 18:00, elegir 10:00 no produce éxito ambiguo; el próximo disparo se explica antes de confirmar y aparece con fecha.

### MED-13 · P1 · Estimación de stock ignora el régimen

**Confirmado por código.** Los regímenes limpian días a `[]` (`components/MedicationForm.tsx:480–486`); `estimateDaysOfSupply` interpreta cada `[]` como siete dosis por semana e ignora `regimen`, fechas y cantidades (`src/utils/index.ts:242–258`). Ejemplo: cada siete días, un horario, stock 4: indica 4 días en lugar de un horizonte de aproximadamente cuatro aplicaciones.

**Propuesta:** simular próximas dosis por calendario y consumo real; mostrar fecha estimada de agotamiento y «Estimación»; no estimar si faltan datos. **Aceptación:** diaria, semanal, 21/7, mensual, descenso y tratamiento que termina no comparten indebidamente la misma fórmula.

### MED-14 · P2 · «Próxima» y «Completado hoy» no respetan omisiones ni postergaciones

**Confirmado por código.** `MedicationCard` descuenta sólo logs `taken` (`components/MedicationCard.tsx:63–74`), ignora `skipped` y `snoozedTimes`, y no busca próxima fecha si no hay toma hoy (`:60–61`). La persona puede ver en Inicio una dosis omitida/completada y en Medicamentos «Próxima» con su horario anterior. Countdown inyectable empieza siempre mañana (`src/services/injectionSites.ts:60`), aunque la aplicación pendiente sea hoy.

**Propuesta:** compartir con Inicio el modelo de próxima dosis; mostrar «Hoy completado», «Próxima mañana», fecha de siguiente ciclo o «Sin próximas dosis». **Aceptación:** tomar, omitir, posponer, día de descanso y última etapa dan mensajes consistentes en todas las pantallas.

### MED-15 · P1 · Campos numéricos opcionales no se validan y pueden transformarse silenciosamente

**Confirmado por código.** Stock/umbral y límites PRN son strings sin reglas numéricas (`src/schemas/medication.ts:22–27`). Al guardar usa `parseInt`, `parseFloat` y clamp (`components/MedicationForm.tsx:489–501`). «0» en máximo PRN se convierte en 1; fracciones se truncan; texto pegado puede llegar a `NaN`. La cantidad base acepta prefijos numéricos (`parseFloat`, schema `:41–47`), no el valor íntegro.

**Propuesta:** validación completa, finita y con límites explícitos; unidades/decimales permitidos por campo; mensajes junto al input; no corregir silenciosamente límites elegidos por la persona. **Aceptación:** vacíos opcionales, 0, negativos, coma/punto, letras pegadas y valores extremos producen un valor exacto entendido o un error visible antes de guardar.

### MED-16 · P1 · Límites PRN y recuperación del registro necesitan un modelo completo

**Confirmado por código.** El intervalo mínimo no tiene máximo, pero la consulta sólo busca ayer+hoy (`src/store/slices/medications.ts:413–420`). Un intervalo configurado de más de 48 horas puede no incluir la última toma. Cada PRN crea un identificador único y una toma «ahora» (`:423–434`); Inicio sólo muestra contador (`app/(tabs)/index.tsx:536–557`), sin hora anterior ni acceso a deshacer/corregir. Historial no ofrece acciones de modificación en el componente revisado.

**Propuesta:** obtener la última toma real o consultar ventana según intervalo; pantalla de registro con cantidad, hora y nota; mostrar última toma y límites definidos por la persona, permitir corrección auditada y deshacer inmediato. Mantener registro de tomas reales aunque excedan un límite; «Registrar igual» no debe interpretarse como recomendación de tomar.

**Aceptación:** 6 h, 24 h y 72 h funcionan cruzando medianoche; toma accidental se puede corregir con stock reconciliado; se distingue «Registrar que ya la tomé» de «Tomar ahora». El texto «permitida» de `src/i18n/es.ts:693–694` cambia a «según el límite que configuraste».

### MED-17 · P2 · Abrir y cancelar un selector puede completar la fecha

**Confirmado por código.** `DateRow.handleOpen` asigna hoy o mínimo antes de que haya selección (`components/MedicationForm.tsx:190–195`). Cancelar el picker puede dejar esa fecha. En «Única vez», el botón de limpiar se ofrece pero el callback ignora `undefined` (`:965`), por lo que no limpia.

**Propuesta:** separar borrador y valor confirmado; no mutar al abrir; ocultar limpiar donde la fecha es obligatoria; confirmar explícitamente en iOS. **Aceptación:** abrir/cancelar inicio, fin y renovación conserva el valor original; seleccionar/limpiar tiene efecto visible y consistente.

### MED-18 · P1 · La fecha de anclaje del régimen puede contradecir el texto

**Confirmado por código.** La ayuda dice «desde hoy si no definiste una» (`src/i18n/es.ts:226`), pero el cálculo usa fecha de creación (`src/services/regimen.ts:71–74`). Añadir un régimen a un medicamento antiguo puede iniciar desde un día anterior; un descenso puede quedar terminado antes de comenzar en UI. El mensaje «Al terminar las etapas» se muestra para todo régimen (`components/MedicationForm.tsx:1166–1167`), incluso ciclos/mensual sin etapas. Mensual ajusta día 31 al último del mes (`regimen.ts:97–102`) y la UI no explicita esa regla.

**Propuesta:** fecha inicial explícita y visible, próximos 3–5 eventos/etapas con cantidades, ayuda por tipo; elegir cómo manejar meses cortos de forma comprensible. **Aceptación:** editar medicamento creado hace 60 días informa y usa el anclaje elegido; el preview coincide con el calendario y con cada etapa; día 31 informa qué pasa en febrero.

### MED-19 · P1 · Se pueden crear horarios duplicados sin advertencia

**Confirmado por código.** Toda alarma nueva nace a las 08:00 con todos los días (`components/MedicationForm.tsx:287–292,1211`); el schema valida formato y presencia, sin comprobar solapamiento (`src/schemas/medication.ts:3–7,50–69`). Dos filas idénticas tienen IDs diferentes, generan dos dosis y pueden consumir inventario dos veces.

**Propuesta:** detectar solapamiento del mismo tratamiento por hora/día antes de guardar; próximo horario sugerido distinto y revisión agrupada. **Aceptación:** dos horarios idénticos no se guardan inadvertidamente; horarios que coinciden sólo algunos días explican el conflicto preciso.

### MED-20 · P2 · Escaneo y autocomplete requieren confirmación de identidad y recuperación visible

**Confirmado por código.** El escáner asigna sólo nombre/identidad y cierra con toast (`components/MedicationForm.tsx:1451–1460`); resultados muestran concentraciones como texto secundario pero elegir no cambia cantidad/unidad (`:645–655`). Permiso denegado explica Ajustes sin botón para abrirlos (`components/BarcodeScannerModal.tsx:66–72`), ni retry visible. El efecto pide permiso sólo al cambiar `visible`; si el objeto de permiso aún no llegó, debe verificarse ese primer uso (`:31–43`).

**Propuesta:** resultado persistente «Envase encontrado: revisá nombre, presentación y cantidad por toma»; concentración del envase separada de cantidad a tomar; botones ingresar manualmente, abrir Ajustes/reintentar; guía de encuadre y ayuda en poca luz si se valida necesidad.

**Aceptación:** match, código desconocido, primer permiso, denegación temporal/permanente y cancelación siempre dejan una salida clara y preservan borrador. Escaneo no implica que la dosis indicada esté verificada.

### MED-21 · P2 · Edición obliga a recorrer el alta y puede perder borradores

**Confirmado por código para navegación; riesgo de teclado a validar.** Editar usa el wizard de cinco pasos desde Identidad (`app/medication/[id].tsx:176–183`; `components/MedicationForm.tsx:348,1342–1344`) aunque se quiera cambiar sólo stock o foto. El footer final muestra a la vez «Omitir y guardar» y guardar: ambos ejecutan el mismo submit (`:574–581,1414–1435`). No hay guardia de salida sucia, borrador ni resumen navegable. Formulario y modal de nota no contienen `KeyboardAvoidingView` ni configuraciones de taps de teclado.

**Propuesta:** detalle de medicamento con secciones editables y guardar accesible; alta breve; aviso sólo si se descartan cambios; una única acción final. **Aceptación:** cambiar stock o una hora no requiere atravesar cuatro pantallas; volver no borra cambios inadvertidamente; teclado y tipografía grande no ocultan error/acción ni requieren un toque extra en autocomplete.

### MED-22 · P1 · Advertencias se muestran después de activar y sólo una vez

**Confirmado por código.** Alta/edición programan y guardan antes de comprobar alergia/duplicidad; si hay alergia hacen `return` y no muestran duplicidad (`app/medication/new.tsx:44–62`; `[id].tsx:148–166`). Los únicos botones dicen OK y salen, sin revisar pauta ni volver a corregir. Reactivar/restaurar no ejecuta las comprobaciones (`src/store/slices/medications.ts:156–200`). La cobertura real son ingredientes compartidos y coincidencias exactas normalizadas de alergia; no pares farmacológicos (`src/services/interactions.ts:15–21,129–147,289–303`). Nombres que no resuelve el catálogo se omiten (`:126–127`).

**Propuesta:** revisión informativa previa, todas las observaciones juntas, «Revisar» y «Guardar de todos modos», advertencia persistente consultable. Informar alcance/cobertura y desconocidos, sin afirmar «sin interacciones». No bloquear el registro de tratamiento indicado ni inventar bases médicas.

**Aceptación:** alergia+ingrediente repetido se muestran ambas; activar/restaurar expone observaciones existentes; medicamento manual sin cobertura figura «No pudimos comprobar ingredientes», no como libre de riesgos. Comprobar ingredientes no se presenta como autorización de uso.

### MED-23 · P1 · Acciones asíncronas informan éxito antes de persistir y permiten repetición

**Confirmado por código para feedback; concurrencia a validar con demora/falla.** Inicio no espera `markDose`, `snoozeDose`, `rescheduleOnce`, revertir ni nota (`app/(tabs)/index.tsx:185–189,213–250`). Posponer/reprogramar muestran toast de éxito inmediatamente; `DoseCard` hace háptica de éxito al tocar (`:180–183`) y cierra nota al llamar callback (`:515–518`). Switch, archivar, borrar y restaurar tampoco muestran progreso/falla (`app/(tabs)/medications.tsx:34–35,50,66–68,235`). No hay bloqueo de interacción durante la escritura.

**Propuesta:** estado por acción «Guardando…», actualización optimista con rollback fiable o confirmación posterior, deshabilitar repetición, error específico/reintento. **Aceptación:** con 2 s de demora y fallo de BD/notificaciones no aparecen éxitos falsos; diez taps no duplican log/stock/alarma; tras fallo la persona ve qué se guardó y puede reintentar sin perder borrador.

### MED-24 · P1 · Eliminar no explica qué pasa con el historial

**Confirmado por código.** La confirmación sólo menciona cancelar alarmas (`src/i18n/es.ts:107`), pero borrar medicación hace desaparecer sus registros del historial de la app: `getHistoryLogs` filtra por IDs de medicaciones existentes (`src/store/slices/medications.ts:392–396`). Los logs no tienen FK y no se borran junto al medicamento (`src/db/schema.ts:80–96`; `src/db/database.ts:830–831`): quedan sin referencia para la UI. Editar/archivar/eliminar aparecen con similar peso en toda tarjeta (`components/MedicationCard.tsx:283–314`).

**Propuesta:** archivar como retirada normal; eliminar en menú secundario con alcance claro de datos y recuperación cuando sea posible; conservar identidad histórica si se mantiene registro. **Aceptación:** advertencia y resultado coinciden para alarmas, medicamento, historial e informes; cerrar tratamiento conserva historial y no se confunde con borrarlo.

### MED-25 · P2 · Sitios inyectables se sugieren sin contexto y no se ofrecen en alarma/PRN

**Confirmado por código.** Sugerencia usa últimas 90 jornadas del medicamento (`app/(tabs)/index.tsx:193–198`) y siempre el sitio no usado o menos reciente (`src/services/injectionSites.ts:28–45`). UI sólo dice «Sugerido» (`components/SitePickerModal.tsx:57–60`), sin fecha usada ni aclaración del criterio. La alarma y PRN registran sin este flujo. Modal sin nombre del medicamento/perfil; el cierre no lleva rol/label (`:67`).

**Propuesta:** «Menos reciente en tu registro» con última fecha, medicamento/perfil visibles; distinguir registro de sitio de indicación de sitio; mostrar sólo sitios configurados según pauta/producto validado, sin ampliar recomendaciones médicas. Ofrecer captura posterior desde cualquier origen y permitir limpiar/corregir el dato.

**Aceptación:** toma registrada desde Inicio, alarma o PRN se puede completar/corregir después; sugerencia explica de qué historial deriva, no se guarda por omisión ni se anuncia como instrucción clínica universal.

### MED-26 · P1 · Fallos de alarma pueden silenciar sin confirmar el registro

**Confirmado por código.** Confirmar/omitir/posponer detienen audio antes de esperar escritura/programación, sin catch visible (`app/alarm.tsx:227–249`). En co-dosis se muestra handled antes de persistir (`:212–224`). Acciones rápidas atrapan el error y salen silenciosamente (`:159–162`).

**Propuesta:** progreso y estado fiable tras silenciar; si falla, «No se registró»/«No se pudo programar» con reintento y acceso a Inicio. Co-dosis sólo muestra éxito persistido o rollback. **Aceptación:** fallo simulado no deja la pantalla aparentemente completada ni una confirmación fantasma; se puede corregir sin volver a activar sonido inesperadamente.

### MED-27 · P1 · La alarma necesita salida neutral y navegación segura en arranque frío

**Riesgo a validar en dispositivo; ausencia confirmada.** Back Android siempre se bloquea (`app/alarm.tsx:110–117`); las únicas salidas visibles toman, omiten o posponen. Handlers interactivos usan `router.back()` sin fallback (`:231,238,249`), mientras acciones rápidas sí comprueban `canGoBack` (`:153–157`). Si la app se abrió directamente puede faltar pantalla previa. Una notificación antigua puede abrir una dosis que ya está registrada: la principal se arma `pending` sin comprobar log (`:130–138,186–192`).

**Propuesta:** «Cerrar recordatorio» separado de «Omitir dosis», explicar recordatorio vs registro; resolver estado actual de la dosis y fallback seguro a Inicio. **Aceptación:** abrir en arranque frío, con stack existente, recordatorio obsoleto y dosis ya tomada no obliga a falsificar un estado ni deja al usuario atrapado; repetir notificación no vuelve a registrar la toma inadvertidamente.

### MED-28 · P1 · Alarma sin scroll arriesga ocultar controles esenciales

**Riesgo visual a validar; estructura confirmada.** Alarma usa `SafeAreaView` con `justify-between`, icono 128, tiempo 60 px, centro con textos/notas, grupo ilimitado y selector con todas las opciones (`app/alarm.tsx:253–255,262,273,326–337,343–390,435–463`), sin ScrollView ni manejo de teclado. En pantalla pequeña, fuente grande, varias co-dosis o nota abierta, la suma puede exceder altura.

**Propuesta:** cabecera compacta, contenido desplazable, acciones principales siempre alcanzables, postergar en hoja propia; respetar reducción de movimiento para pulso infinito (`:168–174`). **Aceptación:** 320 dp de ancho, bajo alto útil, escala de fuente 200 %, teclado, 10 co-dosis y selector abierto conservan nombre completo, cantidad y todas las acciones accesibles.

### MED-29 · P1 · Co-dosis agrupa por hora original, no por recordatorio vigente

**Confirmado por código; impacto requiere escenario de postergación.** El grupo compara `s2.time === schedule.time` (`app/alarm.tsx:196–197`) e ignora `time` del deep link y `snoozedTimes`. Una toma de 08:00 movida a 10:00 puede presentar como «También a esta hora» otra de 08:00 aunque la persona la hubiera pospuesto a 12:00. Cada acción cancela las alarmas de esa co-dosis (`:214–224`).

**Propuesta:** definir «mismo horario efectivo» por dosis/fecha/perfil, mostrar original si difiere y agrupar sólo pendientes válidas. **Aceptación:** dos dosis originalmente coincidentes que se reprograman distinto no se agrupan; dos originalmente distintas movidas al mismo momento se presentan con criterio explícito; las confirmaciones conservan horario correcto.

## Hallazgos de jerarquía visual, contenido y accesibilidad

### MED-30 · P2 · Inicio no prioriza la próxima acción por tiempo

**Confirmado por estructura.** Primero se muestran check-in, próximas citas y consejo (`app/(tabs)/index.tsx:372–452`), y dentro de pendientes/no tomadas se ordena por categoría antes que hora (`:152–162`; prioridad fija en `src/utils/index.ts:226–231`). Un antibiótico a las 22:00 puede quedar por encima de una toma de 08:00. No se informa ese criterio.

**Propuesta:** primer bloque «Ahora / Próxima toma» con tiempo efectivo y perfil; restantes por cronología, completados compactados; bienestar/citas como contexto secundario. No traducir categoría a prioridad clínica sin evidencia. **Aceptación:** en mezcla de categorías siempre es fácil identificar la toma pendiente más cercana; si existe una prioridad elegida, se explica y no se disfraza de pauta médica.

### MED-31 · P2 · Tarjetas con demasiados colores y acciones equivalentes

**Confirmado por estilos; percepción a validar.** La tarjeta de dosis combina estado de fondo, color personal del medicamento, color de categoría y tres botones rojo/ámbar/verde del mismo ancho (`components/DoseCard.tsx:205–207,220–245,341–374`). La tarjeta de medicamento suma borde, círculo, categoría, horarios, stock, countdown y tres botones (`components/MedicationCard.tsx:83–84,111–130,169–237,283–314`). La jerarquía de estado, identidad y acción queda diluida.

**Propuesta:** mantener identidad del medicamento como acento discreto; reservar semánticos para estado; una acción principal «Registrar tomada», secundaria «Posponer» y menú/hoja para resto. Nombre+cantidad+hora efectivos como bloque reconocible; gestión en detalle, no tres acciones grandes permanentes.

**Aceptación:** una persona distingue identidad, estado y acción en una mirada y sin color; medir tiempo/errores en tarea. El rediseño mantiene función reversible y no oculta opciones necesarias.

### MED-32 · P2 · Textos y controles pierden contexto en lector de pantalla y tamaños grandes

**Confirmado por código para semántica; resultados de AT a validar.** `DoseCard` y `MedicationCard` truncan el nombre en una línea (`DoseCard.tsx:228`; `MedicationCard.tsx:105–109`). Cantidad/categoría también se limitan (`DoseCard.tsx:229–245`). Botones de toma dicen sólo «Tomar» y sitio sólo título (`:368,:458`); múltiples tarjetas requieren recordar contexto. Unidades/categorías/modos y footer carecen de `accessibilityRole`/selección (`MedicationForm.tsx:693–709,721–742,817–911,1392–1442`). Progreso son sólo círculos (`:60–84`) pese a existir traducción «Paso X de Y» (`src/i18n/es.ts:270`). Restaurar/eliminar archivado son sólo iconos con p-2 y etiquetas genéricas (`medications.tsx:232–246`). SeniorMode sólo amplía parte de DoseCard (`:90–91,228,347–373`), sin ampliar formularios, PRN, historial o alarma.

**Propuesta:** lectura «Registrar tomada: [medicamento], [cantidad], [hora], [perfil]»; grupos semánticos, estado seleccionado y progreso anunciado; nombre completo en tareas de confirmación, 44/48 dp según plataforma; escalado tipográfico integral. Permitir multiline cuando el nombre/presentación lo exige.

**Aceptación:** VoiceOver/TalkBack permiten completar alta, toma, cancelación, posposición y restauración sin depender de posición/color; nombres similares largos se distinguen; escala 200 % sin perder cantidad ni acciones; modo de mayor legibilidad funciona a lo largo del flujo completo.

### MED-33 · P2 · Vocabulario mezcla registrar una toma con instruir a tomar

**Confirmado por textos.** Inicio dice «Tomar», pasada «Marcar como tomada», alarma «Confirmar», PRN «Registrar dosis»/«Registrar toma»; todos escriben un registro (`src/i18n/es.ts:85,279,293–294,319–322`). Estados «No tomado» se derivan simplemente del reloj, y límites PRN dicen «permitidas»/«próxima permitida» (`:78–79,693–694`).

**Propuesta:** vocabulario único de registro: «Ya la tomé»/«Registrar tomada», «Omitir esta dosis», «Posponer recordatorio», «Sin registrar» y «Deshacer registro». Explicar que límites provienen de configuración. Mantener la opción de registrar un hecho real, con advertencia informativa y nunca como permiso clínico.

**Aceptación:** en pruebas se entiende qué se registra, qué modifica la pauta y qué sólo mueve un recordatorio. El éxito usa el mismo verbo que la acción y muestra hora/cantidad reales.

### MED-34 · P2 · Vacíos, carga y error no distinguen causas

**Confirmado por código.** Inicio usa «sin medicamentos» cuando sólo falta una dosis programada (`app/(tabs)/index.tsx:432–437`). Medicamentos vacío no lleva CTA dentro del EmptyState (`medications.tsx:157–162`). Editar muestra skeleton indefinido si falta medicamento (`app/medication/[id].tsx:86–87`); su lectura no tiene catch (`:80–82`). Ambos refrescos carecen de finally/catch (`index.tsx:178–183`; `medications.tsx:28–32`).

**Propuesta:** estados «Sin medicamentos», «Hoy libre», «Sólo a demanda», «Todo registrado», «No se pudo cargar» y «Medicamento ya no disponible», cada uno con siguiente paso concreto. **Aceptación:** cada causa tiene mensaje/CTA pertinente; fallo de refresco termina spinner y conserva datos visibles; ID inexistente ofrece volver o reintentar en lugar de carga permanente.

## Dirección de diseño para estos flujos

1. **Inicio orientado al momento:** perfil y fecha visibles, próximo recordatorio efectivo como ancla, lista cronológica de pendientes, PRN siempre disponible y completados compactos con deshacer.
2. **Medicamento como detalle editable:** lista más compacta con nombre completo al abrir, estado de tratamiento, próxima dosis y abastecimiento; pauta legible en lenguaje natural y preview; archivar/borrar en gestión secundaria.
3. **Alta con revisión:** identidad y cantidad, pauta y vista previa, confirmación con observaciones informativas; extras opcionales dentro de contexto, personalización después de guardar.
4. **Alarma funcional bajo estrés:** mostrar quién, qué, cuánto y cuándo; confirmar registro, posponer recordatorio y cerrar sin falsificar datos; grupos y notas no desplazan controles esenciales.
5. **Sistema visual semántico:** un acento de identidad, colores de estado reservados, superficies consistentes y menos bordes/badges; tipografía legible y acciones con verbos precisos.

## Matriz mínima de verificación tras corregir

| Área | Escenarios que deben ejecutarse |
|---|---|
| Cambio de intención | Cancelar omisión por cuatro vías; cancelar picker; cambiar repetir↔única↔PRN; volver con borrador |
| Reloj/fecha | Hora futura/pasada; medianoche; posponer cruzando día; reprogramar; cambio de zona y vuelta a primer plano |
| Regímenes | Cada N, ciclo descanso/activo, cada etapa, etapa terminada, mensual 29/30/31, editar anclaje de medicamento antiguo |
| PRN | Sólo PRN, día sin programadas, límite diario, intervalo cruzando día/72 h, registrar igualmente y corregir accidental |
| Inventario | 0/1/varios, cantidad 0,5/2, múltiples tomas, doble tap, deshacer, tomada→omitida, reposición |
| Estado de tratamiento | Pausar/archivar, reiniciar, restaurar, revisar próxima dosis y alarmas, eliminar y comprobar historial |
| Alarma | Arranque frío/caliente, acción rápida, obsoleta/ya registrada, multi-perfil, co-dosis movidas, datos ausentes |
| Resiliencia | Demora/falla en BD, permisos, programación, comprobación posterior; reintento sin duplicación |
| Accesibilidad | TalkBack/VoiceOver, 200 % fuente, 320 dp, alto reducido, teclado, poca visión, reducción de movimiento |
| Catálogo/advertencias | Match/no match, manual desconocido, alergia+ingrediente repetido, sin cobertura, activar/restaurar |

## Elementos actuales valiosos a conservar

Identidad por foto/color; diferencia activa/pausada/archivada; archivo con motivo y conservación de historial; comprobación de ingredientes offline con alcance acotado; PRN con confirmación y override explícito; pasos opcionales; háptica; notas de dosis; deshacer dosis programadas; selector de duración con confirmación; etiquetas de navegación; atribución de perfil en alarma. Estas capacidades deben integrarse en una jerarquía más clara y un contrato de interacción consistente.
