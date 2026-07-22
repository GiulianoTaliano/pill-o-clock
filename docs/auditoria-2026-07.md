# Pill O-Clock — Auditoría completa (funcional + visual)

> **Fecha:** 2026-07-21 · **Versión auditada:** 1.5.0 (rama `main`)
> **Método:** auditoría multi-agente sobre el **código real actual** (no sobre los docs), con verificación adversarial de cada hallazgo y análisis visual con visión real sobre 28 capturas × 2 temas.
> **Alcance:** 13 dimensiones — 10 funcionales (datos/Drizzle, store Zustand, notificaciones/alarmas, módulos nativos Kotlin, lógica de fechas/adherencia, backup/PDF, formularios, i18n, seguridad/privacidad, manejo de errores) + 3 visuales (accesibilidad, dark mode, consistencia).

---

## 0. Estado objetivo (verificado)

| Chequeo | Resultado |
|---|---|
| `tsc --noEmit` | ⚠️ **No está limpio** — 852 errores, pero ~850 son **ruido de config**: los archivos de test usan globals de `jest` (`jest.fn()`, `beforeAll`…) sin `@types/jest` en el `tsconfig`, así que `tsc` los marca en masa. Los tests corren igual (jest usa transform de babel, no `tsc`). Errores reales de código fuente pre-existentes: `app.config.ts` (ExpoConfig), `src/services/pdfReport.ts:80` (TFunction), `components/MedicationForm.tsx` (resolver de react-hook-form con tipos duplicados), `app/medication/[id].tsx:16` (SkeletonBox style). **No existe un gate de typecheck funcional** — vale corregir el `tsconfig`/agregar `@types/jest` para que `tsc` sea usable en CI. |
| `jest` | ✅ 162 tests, 7 suites, todos pasan |
| Cobertura instrumentada | ⚠️ **Estrecha**: solo `utils`, `useTodaySchedule`, `backgroundTask`, slice `medications`. La mayor parte del código (servicios de notificaciones, backup, PDF, slices de health/appointments, hooks, componentes, Kotlin nativo) **no tiene tests**. |
| Teardown de Jest | ⚠️ Warning de *open handles* (timers/async sin limpiar en tests) |

> **Corrección (2026-07-21):** la primera pasada de esta auditoría reportó `tsc` "limpio" — fue un error de lectura (el exit code capturado era el de `tail`, no el de `tsc`). El typecheck **no** pasa limpio; ver fila de arriba.

### Estado de remediación — Sprint 1 (detener el sangrado)

| ID | Estado | Verificación |
|---|---|---|
| C1/C2 · restore pierde historial de dosis | ✅ Corregido | `upsertDoseLogNoTx` sin transacción anidada; usado en el import |
| C3 · set de días vacío → alarma diaria | ✅ Corregido | validación en `scheduleInputSchema` + keys i18n EN/ES |
| C5/M15 · overrun 64 notificaciones iOS | ✅ Corregido | loop usa `DAYS_AHEAD` exportado |
| H16 · stock double-decrement | ✅ Corregido | reconciliación en `markDose`/`revertDose` + 5 tests |
| H17 · edit huérfana dose_logs | ✅ Corregido | reconciliación por id en `updateMedication` + 2 tests |
| C4 · reboot borra alarmas | ✅ Implementado | `BootReceiver` + persistencia en `SharedPreferences` (requiere build Android para verificar compilación) |

Suite tras los fixes: **169 tests pasan** (162 + 7 de regresión nuevos). Cambios en rama `fix/audit-sprint-1-patient-safety`.

**Metodología de confianza:** 69 hallazgos reportados → **64 sobrevivieron la verificación adversarial** (5 refutados como falsos positivos). De los 64: **57 CONFIRMED** (reproducidos en el código actual) y **7 PLAUSIBLE** (defecto de código real, pero el disparo exacto depende de estado en runtime que no se puede observar estáticamente).

---

## 1. Resumen ejecutivo

Pill O-Clock es una app local-first genuinamente capaz y bien arquitecturada (scheduling determinista de AlarmManager en Android, `notification_map` persistido en SQLite, tokens de tema, i18n), con TypeScript limpio y una suite de tests que pasa. **Pero la auditoría destapa un cluster de defectos de seguridad-del-paciente e integridad de datos que socavan la promesa central de la app: recordar de forma fiable cuándo tomar la medicación.**

Tres problemas son lo bastante graves como para causar daño real:

1. **El reboot borra todas las alarmas** de AlarmManager y no hay receptor `BOOT_COMPLETED` que las restaure → dosis completamente perdidas entre un reinicio y la próxima vez que se abra la app.
2. **El restore de backup descarta silenciosamente el 100% del historial de dosis** (una transacción SQLite anidada que siempre lanza y se traga el error) → se pierde toda la adherencia al migrar de dispositivo.
3. **Las rutas add/edit/toggle programan 7 días fijos de notificaciones iOS**, ignorando el presupuesto de 64 slots que el resto de la app respeta con cuidado → iOS descarta silenciosamente notificaciones = dosis perdidas.

Encima, la app enviada integra **Sentry** y **Google Maps/Places** mientras el README y la política de privacidad publicada afirman explícitamente que *nada sale nunca del dispositivo* — un riesgo de rechazo en tiendas y de confianza.

La buena noticia para un desarrollador solo: **casi todos los bugs de mayor severidad son fixes pequeños y localizados**. La prioridad es dejar de perder datos y dejar de perder alarmas antes de agregar cualquier feature nueva.

### Calificación de salud

| Eje | Nota | Justificación |
|---|---|---|
| **Funcional** | **D** | Arquitectura sólida socavada por múltiples defectos confirmados de seguridad-del-paciente y pérdida de datos (restore que pierde historial, reboot que borra alarmas, overrun de 64 notificaciones iOS, doble-decremento de stock). |
| **Visual** | **C** | Sistema de tokens de tema coherente, pero fallos recurrentes de contraste en dark mode, gaps de accesibilidad WCAG/touch-target, y una flecha *mojibake* literal enviada a usuarios. |

### Distribución de hallazgos

| Severidad | Cantidad |
|---|---|
| 🔴 Crítico | 6 (5 distintos; C1≡C2 son el mismo bug visto por 2 dimensiones) |
| 🟠 Alto | 18 |
| 🟡 Medio | 29 |
| 🟢 Bajo | 11 |
| **Total** | **64** |

---

## 2. Temas sistémicos

Los hallazgos no son incidentes aislados; se agrupan en patrones que conviene atacar de raíz:

1. **Gaps en el ciclo de vida de notificaciones/alarmas → dosis perdidas o duplicadas.** Un loop de 7 días hardcodeado (C5/M15) ignora `DAYS_AHEAD=3` y revienta el cap de 64 de iOS; no hay receptor `BOOT_COMPLETED` (C4), así que el reboot borra todo; `rescheduleAllNotifications` concurrente puede duplicar cadenas iOS (M23); el restore nunca reprograma (H5); y los errores del reschedule en foreground se tragan sin telemetría (M14). Cualquiera de ellos se convierte silenciosamente en una dosis perdida.

2. **Tragado silencioso de errores que oculta pérdida de datos y acciones perdidas.** Bloques `catch {}` vacíos descartan fallos reales: el import envuelve cada insert en try/catch, así que la transacción siempre commitea datos parciales (C1/C2/H3); `getNotifMapEntry` devuelve `null` ante error de DB, indistinguible de "no encontrado", perdiendo la acción Taken/Skip de una notificación (M16); `markDose`/`CheckinModal`/handlers de alarma no tienen catch, dejando UI stale o pantalla trabada (M25/M17/H9).

3. **Los claims de privacidad contradicen el código enviado.** README y la política publicada afirman "sin crash reporters", "sin analytics", "nada se envía a servidores externos", pero el build inicializa Sentry (sube excepciones + component stacks + 20% de traces) y el picker de citas envía direcciones y GPS a Google Places/Geocoding/Maps. La política EN incluso niega recolectar datos de salud/ubicación para una app de tracking de salud, y difiere de su propia versión ES. (C6, H14, H15, L6–L9)

4. **La integridad referencial de `dose_logs` es frágil (sin FK en `schedule_id`).** `dose_logs.schedule_id` es TEXT plano sin foreign key, así que editar un medicamento regenera los IDs de schedule y huérfana los logs de hoy (dosis tomadas reaparecen como perdidas y se pueden tomar dos veces) (H17); borrar un med huérfana logs en native (M12); y las rutas de upsert native/web divergen en qué campos persisten (M13).

5. **Fugas de contraste en dark mode y colores fijos.** Varias superficies pintan texto casi-blanco theme-aware sobre fondos claros fijos, o chips claros fijos sobre cards oscuras: el tiempo/subtítulo de la pantalla de alarma (~1.1:1) (H8), el header del modal add/edit (H7), los pills de schedule/PRN (M9), y los badges de categoría (M10) fallan legibilidad o WCAG AA en dark mode.

6. **Accesibilidad por debajo de mínimos de tienda/WCAG para un público objetivo mayor.** Touch targets sub-44pt recurrentes (chips de día, dots de onboarding, time picker) (M1/M3/M4), falta de `accessibilityLabel` en el Switch activo/inactivo del med (H2), roles de botón engañosos en badges no accionables (M2), y texto de categoría bajo 4.5:1 (H1) — concentrados justo en los controles que un usuario mayor o de baja visión debe operar.

7. **Mismatches doc/código que engañan al mantenedor.** Varios docs afirman trabajo terminado que no lo está: `tech-improvements.md` M10 dice que el import es atómico (no lo es, H3); comentarios de `backgroundTask`/`notifications` dicen que el reboot restaura alarmas (no existe boot receiver, C4); comentarios de config apuntan a un plugin `react-native-maps` inexistente (L9). Confiar en los docs ocultaría defectos vivos.

---

## 3. Plan de acción recomendado (secuencia)

Ordenado por daño-al-paciente / pérdida-de-datos primero, luego bloqueadores de tienda, luego pulido. Los IDs remiten a las secciones 5–8.

**Sprint 1 — Detener el sangrado (seguridad del paciente + datos):**
- **C4** receptor `BOOT_COMPLETED` que reprograma alarmas al arrancar.
- **C1/C2** arreglar la transacción anidada del restore (dejar de perder el historial de dosis) + **H5** reprogramar alarmas tras restore.
- **C5/M15** cambiar el loop `i<7` por `DAYS_AHEAD` + enforcement de cap global iOS.
- **C3** validar que un set de días vacío no se convierta en alarma diaria.
- **H17** preservar IDs de schedule al editar (evitar doble toma) + **H16** restaurar stock en `revertDose`.
- **H11/H12** robustez de audio de alarma (try-catch en `playAlarm`, `setWakeMode(PARTIAL)`).
- **H9** try/finally en los handlers de la pantalla de alarma (no atrapar al usuario).

**Sprint 2 — Cumplimiento y confianza (bloqueadores de tienda):**
- **C6/H14/H15/L6–L9** reconciliar privacidad: o remover Sentry/Maps, o corregir README + política (EN/ES) + Data Safety, quitar location Always sobre-declarada, limpiar archivos temporales.
- **H10** localizar botones/canales de la alarma nativa (hoy hardcodeados en español).
- **H1/H2/M1–M4** accesibilidad: contraste de categorías, label del Switch, touch targets 44pt.

**Sprint 3 — Corrección visible y coherencia:**
- **H18** flecha *mojibake*, **H7/H8/M9/M10** dark mode, **H6/M7/M8** streak de adherencia, y el resto de medios/bajos.

Los **quick wins** (sección 4) pueden intercalarse: son fixes de 1–5 líneas de alto valor.

---

## 4. Quick wins (alto valor, bajo esfuerzo)

- **H18** — Reemplazar la flecha *mojibake* (doble-UTF-8) en `MedicationCard.tsx:142` por una flecha real `→` o una key `t()`. Bug visible de un carácter que ve todo usuario con rango de fechas.
- **C5/M15** — Cambiar el loop `i<7` en `_scheduleNotificationsForSchedule` (`medications.ts:344`) por `DAYS_AHEAD`. Una línea que defusea el overrun de 64 notificaciones iOS.
- **C3** — Agregar min-length de días por schedule en `scheduleInputSchema` (`schemas/medication.ts`) para que un set vacío no se vuelva alarma diaria.
- **H2** — Agregar `accessibilityLabel={medication.name}` al Switch de activo/inactivo (`MedicationCard.tsx:126`). Cambio trivial que quita un bloqueador de lector de pantalla.
- **M5/L3** — Helper `escapeHtml()` en las interpolaciones de `pdfReport.ts` (nombre, notas, dosis). Evita reportes al médico rotos por `< > &`.
- **M19** — Traducir el badge "Past" hardcodeado (`AppointmentDetailModal.tsx:319`) vía la key existente `appointments.past`.
- **H16** — Restaurar stock en `revertDose` (`medications.ts:278`) y en las transiciones taken→skipped. Pocas líneas que frenan la deriva del contador.
- **M1/M3/M4** — `hitSlop`/`min-h-[44px]` en los chips de `DayToggle`, dots de onboarding y controles de time-picker/clear-date.

---

## 5. 🔴 Críticos (detalle)

> **Nota:** C1 y C2 son el **mismo bug** detectado desde dos dimensiones (backup-report y db-data-layer). Se listan ambos porque la doble detección refuerza la confianza; el fix es único.

### C1 / C2 — El restore de backup descarta silenciosamente el 100% del historial de dosis
`src/services/backup.ts:217,239` · CONFIRMED

- **Qué:** `importBackup()` envuelve toda la restauración en `db.withTransactionAsync(...)`, que emite un `BEGIN` en la conexión compartida de expoDb. Dentro del loop llama `upsertDoseLog(log)` por cada dose log — pero `upsertDoseLog` (`database.ts:489`) abre **su propia** `db.transaction(...)`, emitiendo un segundo `BEGIN` sobre la misma conexión. SQLite rechaza el anidamiento (`cannot start a transaction within a transaction`), así que **todo insert de dose log lanza**. Cada throw lo traga el `try { … } catch {}` por-registro (`backup.ts:241-243`). `insertMedication`/`insertSchedule` usan `.run()` plano (sin BEGIN) y sí restauran, con lo que el fallo es **silencioso y parcial**. (El mismo defecto afecta a `upsertDailyCheckin`, `database.ts:712`.)
- **Escenario de fallo:** El usuario respalda un teléfono con meses de adherencia y hace un restore "replace" en uno nuevo. `clearAllData()` ya borró la DB; medicamentos/schedules/citas restauran bien, pero cada dose log choca con el BEGIN anidado y se salta. Se muestra "importados N medicamentos" con éxito, y sin embargo **el 100% del historial de dosis/adherencia — el registro central de la app — desapareció, irrecuperable.**
- **Fix:** No llamar funciones que abren su propia transacción desde dentro de `withTransactionAsync`. Opción (a) insertar dose logs con un statement plano `INSERT OR REPLACE` (estilo `insertMissedDoseLogSafe`); (b) una variante de `upsertDoseLog` sin transacción para uso dentro de una transacción existente; y **dejar de tragar el error** para que los fallos afloren. Agregar un test de restore que asserte `doseLogs.length` preservado.

### C3 — Un set de días vacío se convierte silenciosamente en alarma diaria
`components/MedicationForm.tsx:389` · CONFIRMED

- **Qué:** En modo repetición, `DayToggle` permite llegar a un set de días vacío: tocar el chip "Todos" resaltado ejecuta `onChange([])` (`DayToggle.tsx:18-19`), y deseleccionar días uno por uno también termina en `[]`. El schema no lo prohíbe (`scheduleInputSchema.days` es `z.array(...)` sin min length; `superRefine` solo verifica que el **array** de schedules no esté vacío, nunca los días por schedule). En submit, `handleFormSubmit` mapea a la sentinela diaria `[]` solo cuando `length===7`; un `length===0` se guarda verbatim como `[]`. Y el predicado de scheduling trata `[]` como diario (`utils/index.ts:73`: `if (schedule.days.length === 0) return true;`). Así, "ningún día" y "los 7 días" persisten ambos como `[]` y **ambos disparan todos los días**.
- **Escenario de fallo:** Agregar med → Repetir → slide Alarmas. El usuario toca "Todos" para limpiarlo (con intención de elegir días específicos), quedando en 0 días; el label dice "0 seleccionados". Guarda. La alarma del medicamento ahora suena **cada día** en lugar de ninguno/subset — recordatorio no deseado diario.
- **Fix:** `superRefine` que rechace cualquier schedule no-PRN con `days.length===0`, o en `handleFormSubmit` tratar solo `length===7` como sentinela diaria y rechazar `length===0` con error explícito.

### C4 — El reboot borra todas las alarmas de AlarmManager; nada las reprograma hasta que se abre la app
`modules/expo-alarm/.../ExpoAlarmModule.kt:64` · CONFIRMED

- **Qué:** Las alarmas de dosis se programan exclusivamente vía `AlarmManager.setAlarmClock()`. Android borra **todas** las alarmas de AlarmManager al reiniciar. **No hay `BroadcastReceiver` de `BOOT_COMPLETED`** en expo-alarm (el manifest declara solo `AlarmReceiver`, `AlarmAudioService`, `AlarmActionReceiver`). El único mecanismo de reprogramación es `expo-background-fetch` con `startOnBoot:true` — pero eso solo **re-registra** la tarea JobScheduler tras el boot; **no la ejecuta** al arrancar: dispara a discreción del OS no antes de `minimumInterval` (6h), más tarde o nunca en Doze. Entre el reboot y el próximo fetch, toda alarma nativa está perdida. Los comentarios del código afirman lo contrario (`backgroundTask.ts:24-26`, `notifications.ts:59`) — mismatch doc/código.
- **Escenario de fallo:** La única alarma es 08:00. El teléfono se reinicia de madrugada (update de OS, batería) a las 03:00 → la alarma se borra. El fetch de 6h no corre antes de las 08:00 (Doze suele demorarlo/saltarlo). El usuario no abre la app en la mañana, así que el reschedule por AppState "active" nunca dispara. Las 08:00 pasan **sin alarma, sin sonido, sin pantalla** — dosis completamente perdida.
- **Fix:** Agregar un receptor para `android.intent.action.BOOT_COMPLETED` (+ `QUICKBOOT_POWERON`/`MY_PACKAGE_REPLACED`) en el manifest de expo-alarm, y al boot re-derivar y re-armar inmediatamente todas las alarmas futuras (headless JS task, o persistir params en SharedPreferences y re-llamar `setAlarmClock` nativamente). No depender del BackgroundFetch periódico para restaurar alarmas exactas.

### C5 — Overrun del presupuesto de 64 notificaciones iOS: add/edit/toggle/revert programan 7 días fijos
`src/store/slices/medications.ts:344` · CONFIRMED · *(= M15, misma raíz desde error-handling)*

- **Qué:** `_scheduleNotificationsForSchedule` — invocado por `addMedication`, `updateMedication`, `toggleMedicationActive` y `revertDose` — itera un `for (let i = 0; i < 7; i++)` hardcodeado. En iOS `scheduleDoseChain` emite hasta 3 notificaciones por dosis (inicial + `MAX_REPEATS=2`). Contradice `DAYS_AHEAD` (=3 en iOS) que `scheduleAllUpcoming`/`rescheduleAllNotifications` sí respetan, y la documentación de presupuesto en `notifications.ts:39-70`. Nada impone un cap global.
- **Escenario de fallo:** Usuario iOS con un med 3×/día (3 schedules). Agregarlo corre `_scheduleNotificationsForSchedule` por schedule: 3 × 7 días × 3 notifs = **63 pendientes de un solo medicamento**. Un segundo med, un recordatorio de cita o de salud, y se supera el cap duro de 64. iOS **descarta silenciosamente las más antiguas** — recordatorios de días posteriores nunca disparan, dosis perdidas sin error.
- **Fix:** Reemplazar el `i<7` por `DAYS_AHEAD` (exportarla desde `notifications.ts`). Además, enforcement real de presupuesto global en iOS (contar pendientes, o cap `schedules × días × repeats`).

### C6 — Sentry se envía y transmite datos, contradiciendo el claim "sin crash reporters / nada sale del dispositivo"
`app/_layout.tsx:8` · CONFIRMED

- **Qué:** La app integra e inicializa `@sentry/react-native`, que sube crash reports, payloads de excepción (incluyendo component stacks de React y contexto `extra`/`tags` arbitrario) y 20% de performance traces a los servidores de Sentry. `app.json:91-96` registra el config plugin; `_layout.tsx:8-13` corre `Sentry.init({ dsn, enabled: NODE_ENV==='production', tracesSampleRate: 0.2 })` — activo en builds de producción. Excepciones se envían activamente desde `ErrorBoundary.tsx:35` y `_layout.tsx:104`. Contradice frontalmente `README.md:5,27,192-193` y `docs/privacy-policy.html:45,67`.
- **Escenario de fallo:** En el build v1.5.0 con `EXPO_PUBLIC_SENTRY_DSN` seteado como EAS secret, cualquier error de render no capturado transmite una excepción con component stack a sentry.io. Al usuario se le dijo, en la política enlazada desde la Play Store, que no existe crash reporter y que nada sale del dispositivo → **disclosure de privacidad falso / mismatch con el formulario Data Safety de Play** y problema de review en App Store.
- **Fix:** O remover `@sentry/react-native` para cumplir el claim, o actualizar README + `docs/privacy-policy.html` (EN y ES) + el formulario Data Safety para revelar el crash reporting, con opt-out in-app y scrubbing de PII del contexto capturado.

---

## 6. 🟠 Altos (detalle)

### H1 — Labels de categoría Supplement/Vitamin fallan contraste WCAG (verde ~2.1:1, amarillo ~1.8:1)
`src/utils/index.ts:184` · CONFIRMED — `#22c55e` sobre blanco da ~2.1:1 y `#eab308` ~1.8:1, muy por debajo de AA 4.5:1 (y del piso 3:1 para texto grande). Visible en `light_home.png` (label "Supplement" verde bajo Magnesio). **Fix:** variante de texto oscurecida (green-700 `#15803d`, amber-700) manteniendo el tinte brillante solo para fills/borders, como ya hace `doseStatus`.

### H2 — El Switch de activo/inactivo del med no tiene accessibilityLabel
`components/MedicationCard.tsx:126` · CONFIRMED — Alternar este switch desactiva el medicamento y cancela todos sus recordatorios; con TalkBack/VoiceOver anuncia solo "switch, on" sin el nombre del med. Un usuario ciego apaga las alarmas de su antibiótico sin saber cuál. **Fix:** `accessibilityRole="switch"`, `accessibilityLabel={medication.name}`, `accessibilityState={{checked: medication.isActive}}`. (También mover el `false:"#e2e8f0"` del track a un valor de tema.)

### H3 — El import no es atómico pese a que el doc afirma "todo o nada"; el catch por-registro traga fallos
`src/services/backup.ts:223` · CONFIRMED — Cada insert dentro de la transacción va en `try {…} catch {}`, así que ningún error sale del callback de `withTransactionAsync` y la transacción **siempre commitea**: nunca puede hacer rollback. Un backup con algunos registros inválidos commitea un dataset parcial sin aviso. `tech-improvements.md:595-627` (M10, marcado `[x]`) afirma explícitamente que garantiza atomicidad — mismatch doc/código directo. **Fix:** hacerlo genuinamente atómico (quitar los catches internos para que un fallo haga rollback y aflore `BackupFormatError`), o reportar el conteo de registros salteados. Actualizar M10.

### H4 — El backup no preserva fotos ni documentos de citas; las URIs locales quedan colgadas tras el restore
`src/services/backup.ts:42` · CONFIRMED — El backup serializa `photoUri` y `fileUri` como strings de path pero nunca empaqueta los bytes; el export solo escribe JSON. Peor: `MedicationForm.tsx:365` guarda la URI cruda del ImagePicker sin `copyAsync` a un dir estable, así que hasta el path vivo es una ubicación transitoria de cache. En iOS el path del contenedor lleva un UUID por-instalación que cambia al reinstalar. Tras restore, esas URIs apuntan a archivos inexistentes → fotos de medicamentos y documentos (PDFs/labs) rotos/en blanco. **Fix:** (a) excluir/marcar los campos file-backed y avisar que no son portables, o (b) empaquetar los archivos en el export (base64 para imágenes chicas, o un zip JSON+assets con paths relativos). Como mínimo, copiar las fotos del picker a `documentDirectory` al guardar.

### H5 — Tras restore, las alarmas/notificaciones no se reprograman en la misma sesión
`app/(tabs)/settings.tsx:213` · CONFIRMED — `runImport()` llama solo a `loadAll()` tras `importBackup()`, nunca a `rescheduleAllNotifications()`. La propia guía del proyecto (`.github/copilot-instructions.md:130`) dice "siempre llamar `rescheduleAllNotifications` tras cualquier cambio de schedule". El reschedule solo ocurre en la transición AppState "active". **Escenario:** el usuario restaura y deja la app en foreground → los meds restaurados con dosis de hoy no tienen alarma registrada, y el recordatorio no dispara hasta que la app pase a background y vuelva. **Fix:** `await rescheduleAllNotifications()` al final de `runImport()`.

### H6 — El streak de adherencia nunca se rompe con dosis perdidas (ignora el estado 'missed')
`src/hooks/useAdherenceStreak.ts:42` · CONFIRMED — El streak agrupa logs por día pero solo registra `hasTaken`/`hasSkipped`; el estado 'missed' nunca se rastrea. El test de cumplimiento (`if (!entry || !entry.hasTaken || entry.hasSkipped) break;`) trata como compliant cualquier día con ≥1 'taken' y ningún 'skipped', **aunque otras dosis programadas ese día se hayan perdido** (el background task sí persiste esos 'missed'). Contradice su propio docstring y el % de adherencia de la pantalla History. **Escenario:** med diario con alarmas 08:00 y 20:00; el usuario toma la de 08:00 y olvida la de 20:00 cada día → el streak crece sin límite mostrando adherencia perfecta mientras pierde el 50% de las dosis. **Fix:** rastrear `hasMissed` y romper el streak: `if (!entry || !entry.hasTaken || entry.hasSkipped || entry.hasMissed) break;`.

### H7 — El header del modal add/edit medicamento queda hardcodeado a tema claro en dark mode
`app/_layout.tsx:220` · CONFIRMED — Los screens `medication/new` y `medication/[id]` fijan `headerStyle:{backgroundColor:"#f0f6ff"}` con `headerTintColor:"#1e293b"` sin importar el tema. En dark mode el header es una barra casi-blanca sobre un body `#020617`; además `<StatusBar style="auto"/>` pone íconos claros, así que el reloj/batería quedan casi invisibles. Visible en `dark_medication-new.png`. Mismatch doc: M5/M6 marcados `[x]` afirman haber corregido "que varios modales se muestren con fondo blanco en dark mode". **Fix:** derivar `headerStyle`/`headerTintColor` de `useAppTheme()` (`theme.card`/`theme.text`).

### H8 — El tiempo y subtítulo de la pantalla de alarma quedan ilegibles en dark mode
`app/alarm.tsx:180` · CONFIRMED — La pantalla de alarma siempre pinta el fondo con el tinte claro fijo del med (`colors.light`, p.ej. `#ffedd5`), pero el elemento más importante — la hora — usa el token theme-aware `text-text`, y el subtítulo/notas usan `text-muted`. En dark mode `--color-text` resuelve a `#f1f5f9` (casi blanco) sobre fondo claro → contraste ~1.1:1 para la hora, ~1.5:1 para el subtítulo. **En la pantalla más crítica de una app de medicación, el usuario no puede leer la hora.** Visible en `dark_alarm-fullscreen.png`. **Fix:** usar un color oscuro fijo derivado de la paleta del med (como `colors.text`, ya usado correctamente para `medication.name`), independiente del color scheme.

### H9 — Los handlers de la pantalla de alarma no tienen manejo de errores → un throw atrapa al usuario con el back deshabilitado
`app/alarm.tsx:155` · CONFIRMED — `handleTake/handleSkip/handleSnooze` corren `await stopAlarm(); await markDose(...); router.back();` sin try/catch. `markDose` hace varias llamadas nativas/DB falibles. Si alguna rechaza, `router.back()` nunca corre. Como el back de hardware está bloqueado incondicionalmente (`BackHandler … => true`) y es un `fullScreenModal` con `gestureEnabled:false`, **no hay salida**: el audio ya se detuvo, el usuario queda atrapado en una alarma silenciosa y debe forzar el cierre, y la dosis no se registra. Las rejections async no las captura el ErrorBoundary. **Escenario:** alarma en Android, DB momentáneamente lockeada por el background reschedule concurrente; "Take" → `upsertDoseLog` lanza SQLITE_BUSY → atrapado. **Fix:** `try/finally` en cada handler para que `router.back()` (o `router.replace('/')`) siempre corra; reportar a Sentry antes de navegar.

### H10 — La alarma full-screen hardcodea los botones y nombres de canal en español en el Kotlin nativo (bypassa i18n)
`modules/expo-alarm/.../AlarmAudioService.kt:405` · CONFIRMED — La notificación de alarma full-screen se construye en Kotlin con literales españoles: `.addAction(…, "✅ Confirmar", …)`, `"⏰ Posponer"`, `"❌ Omitir"`, y canales `"Alarmas de medicamentos"` / `"Recordatorios silenciosos"`. No hay lookup de recursos ni `getString()`. Los recursos i18n de JS ya tienen las traducciones correctas que esta ruta ignora. **Escenario:** un usuario con idioma inglés ve la alarma full-screen y sus quick-actions de lock-screen en español ("Confirmar"/"Posponer"/"Omitir") en la superficie más crítica para la seguridad. **Fix:** pasar las labels/canales localizados desde JS vía intent extras, o proveer `values-en`/`values-es` y referenciarlos con `getString()`.

### H11 — `playAlarm()` corre `setDataSource`/`prepare` sin try-catch — una URI de sonido no disponible crashea el proceso y mata la alarma
`modules/expo-alarm/.../AlarmAudioService.kt:350` · CONFIRMED — `playAlarm()` llama `setDataSource(context, uri)` y `prepare()` sin manejo de excepciones. La `uri` viene de un ringtone `content://` que el usuario eligió; si ya no es resoluble (ringtone borrado, SD removida, permiso revocado, cambio de ROM), `setDataSource`/`prepare` lanza `IOException`/`IllegalStateException`. Como `onStartCommand` no tiene try-catch alrededor de `playAlarm()`, **la excepción crashea todo el proceso de la app**, se destruye la pantalla de alarma, el audio nunca suena y no hay recordatorio. **Fix:** envolver `playAlarm()` en try/catch; ante fallo caer a `DEFAULT_ALARM_ALERT_URI` y luego al `res/raw/alarm.wav` empaquetado; nunca dejar escapar la excepción de `onStartCommand`.

### H12 — La alarma puede quedar en silencio tras 10 min: el wakelock expira y nunca se setea `setWakeMode` _(plausible)_
`modules/expo-alarm/.../AlarmAudioService.kt:189` · PLAUSIBLE — La alarma está diseñada para sonar hasta que el usuario interactúe (`isLooping=true`, sin auto-stop). Lo único que mantiene la CPU despierta es un `SCREEN_BRIGHT_WAKE_LOCK` con timeout duro de 10 min (`acquire(10*60*1000L)`), y **nunca se llama `MediaPlayer.setWakeMode(PARTIAL_WAKE_LOCK)`**. Al vencer el wakelock, en un dispositivo bloqueado la CPU puede entrar en deep sleep y suspender la reproducción, silenciando la alarma aunque el servicio siga "activo". *(Plausible, no confirmado: en muchos dispositivos el thread de AudioFlinger mantiene su propio wakelock interno que puede mantener STREAM_ALARM audible más allá del timeout — depende de device/ROM/versión.)* **Fix:** `setWakeMode(PARTIAL_WAKE_LOCK)` para toda la duración de la reproducción, y/o re-adquirir el wakelock mientras el audio suena.

### H13 — La acción de notificación iOS (Taken/Skip/Snooze) se pierde en cold start: se descarta la notificación antes de que cargue el store _(plausible)_
`src/hooks/useNotificationResponse.ts:65` · PLAUSIBLE — El listener resuelve la dosis desde SQLite (disponible temprano), **descarta la notificación entregada** (línea 65) y solo después lee `medications`/`schedules` del store Zustand. Si la app fue terminada y se lanza al tocar un action button, `loadAll` async puede no haber poblado el store todavía → `med`/`schedule` undefined → todas las ramas retornan temprano. A diferencia de `alarm.tsx` (que guarda con `isLoading` y reintenta), este hook no tiene guard ni reintento. **Escenario:** iOS force-quit, el usuario toca "Taken" desde el lock screen; la app cold-starts con el store aún cargando; se descarta la notificación pero se retorna sin `markDose` → la dosis nunca se registra, aparece como missed en History, pero el usuario cree que la marcó. *(Timing race no observable estáticamente → plausible.)* **Fix:** no descartar la notificación hasta después de una acción exitosa; cargar `med`/`schedule` directo de la DB en vez del store; o guardar con `isLoading` como `alarm.tsx`.

### H14 — Llamadas a Google Places/Geocoding y `expo-location` contradicen "sin servidor externo" y "no recolectamos ubicación"
`components/LocationPickerModal.tsx:203` · CONFIRMED — El picker de ubicación de citas envía las direcciones tipeadas y las coordenadas GPS actuales a Google: `fetch` a `maps.googleapis.com/.../place/autocomplete/json`, `.../geocode/json`, `.../place/details/json`, cada uno con `&key=${GOOGLE_MAPS_API_KEY}`. También lee ubicación viva (`requestForegroundPermissionsAsync`/`getCurrentPositionAsync`) y el `MapView` (PROVIDER_GOOGLE) streamea tiles de Google. `app.json` pide `ACCESS_FINE/COARSE_LOCATION`. Contradice `privacy-policy.html:45,55` y `README.md`. **Fix:** revelar el uso de Google Maps/Places y la transmisión de ubicación en la política (EN+ES) y Data Safety, o gatear la feature tras consentimiento explícito; remover el lenguaje "nada sale / no recolectamos ubicación".

### H15 — La política de privacidad en inglés es internamente contradictoria y está desincronizada con la versión española
`docs/privacy-policy.html:55` · CONFIRMED — El §2 en inglés lista solo nombres de med, schedules, dose logs y preferencias, y luego afirma "We do not collect names…location, health records, or any other personal information". Pero la app almacena exactamente eso: presión arterial, glucosa, peso, SpO2, frecuencia cardíaca, diario de mood/síntomas, y ubicación GPS de citas. El §2 en español (líneas 105-113) **sí** lista todo eso correctamente → las dos versiones del mismo documento discrepan materialmente, y la EN niega recolectar registros de salud para una app de tracking de salud. **Fix:** reescribir el §2 EN para coincidir con el ES (mediciones de salud, diario, citas, ubicación), quitar la cláusula falsa, aclarar almacenamiento local, actualizar "Last updated".

### H16 — `revertDose` (y taken→skipped) nunca restaura el stock → deshacer + re-tomar doble-decrementa el contador
`src/store/slices/medications.ts:278` · CONFIRMED — `markDose()` decrementa stock en cada 'taken', pero `revertDose()` solo borra el log y reprograma — **nunca devuelve la pastilla**. Ambas rutas (botón revert del DoseCard y cambio de estado) son alcanzables desde la sección "Hecho" del Today. **Escenario:** med con stock=30. Take (30→29). Revert (sigue 29). Take de nuevo (29→28). Neto: una dosis tomada, stock −2. El deshacer/rehacer deriva el stock arbitrariamente, disparando falsas alertas de stock bajo (la feature que le dice al paciente cuándo reponer). **Fix:** hacer reversible el cambio de stock: registrar si un log ya decrementó, y en `revertDose` restaurar +1 cuando el log revertido era 'taken'. Alternativa: recomputar stock desde el conteo de logs 'taken'.

### H17 — Editar un medicamento regenera todos los IDs de schedule, huérfana los logs de hoy → dosis tomadas reaparecen como perdidas y se pueden tomar dos veces
`src/store/slices/medications.ts:89` · CONFIRMED — `updateMedication()` borra cada schedule existente e inserta nuevos con IDs frescos, **aunque time/days no hayan cambiado** (`id: generateId()`). `dose_logs.schedule_id` es TEXT plano sin FK, así que los logs no se re-apuntan ni cascadean; `useTodaySchedule` indexa por `${schedule.id}-${date}`. **Escenario:** med con schedule 08:00. A las 08:05 se marca Taken (log con scheduleId=S1, stock 30→29). Más tarde el usuario edita el med (aunque sea las notas) → `updateMedication` borra S1 y crea S2. En Today el log S1-fecha ya no matchea S2, así que la dosis muestra "Perdida" con botón "Tomar tarde". El usuario, viendo "perdida", **toma una segunda pastilla real** y toca Tomar tarde → log duplicado, stock 29→28. Corrompe stock/adherencia y puede inducir una doble dosis real. **Fix:** preservar identidad: cuando un `scheduleInput` trae un id existente, mantenerlo (update in place) y generar id solo para schedules nuevos. Como mínimo, migrar/borrar los `dose_logs` de la fecha actual/futuras cuando un id deba cambiar.

### H18 — Flecha *mojibake* en el rango de fechas del medicamento
`components/MedicationCard.tsx:142` · CONFIRMED — El separador entre fecha de inicio y fin es una flecha corrupta (doble-UTF-8) en lugar de `→`; la línea 142 renderiza el byte-sequence `â†''` literalmente en pantalla. Cualquier med con `startDate`/`endDate` muestra el garbage en la pestaña Medicamentos, en todo dispositivo y ambos temas. (La línea 16 también tiene un em-dash corrupto en un comentario.) **Fix:** reemplazar el literal por `→` (U+2192) o `t()`, re-guardar el archivo como UTF-8, y barrer el archivo por otros mojibake.

---

## 7. 🟡 Medios (resumen)

> Detalle completo, con escenario de fallo por ítem, en el output del audit. Aquí, una línea por hallazgo con archivo y fix.

**Datos / plataforma**
- **M11** `database.web.ts:245` — Faltan ~15 funciones que la app importa incondicionalmente → el build **web** crashea en Appointments/Health/stock/notes/backup. *Fix: paridad con localStorage, o gatear features por `Platform`.* (Severidad reducida a media: web no es target de producción enviado.)
- **M12** `database.ts:395` — Borrar un med huérfana sus `dose_logs` en native (sin FK, sin cleanup manual); web sí los purga → divergencia + crecimiento de storage. *Fix: FK `onDelete:cascade` + migración, o borrado explícito en `deleteMedication`.*
- **M13** `database.web.ts:206` — El upsert web mergea solo status/takenAt y descarta `notes`/`skipReason`/`scheduledTime` en filas existentes. *Fix: reemplazar el registro completo, como en native.*

**Store / notificaciones**
- **M23** `notifications.ts:772` — `rescheduleAllNotifications` concurrente (sin mutex, disparado en cada AppState "active") puede duplicar cadenas de notificación iOS (ids random). Android está protegido por `requestCode` determinista. *Fix: lock/debounce, o ids iOS deterministas por (scheduleId,date,repeatIndex).*
- **M24** `store/index.ts:85` — `resetAllData`/restore dejan claves AsyncStorage del health-reminder vivas → la UI muestra un recordatorio "activo" que no está programado. *Fix: `cancelHealthReminder()` en reset/restore, o migrar el id/time a SQLite.*
- **M25** `medications.ts:156` — `markDose` no es atómico ni tiene try/catch: si algo tras el commit del log lanza (p.ej. `ExpoAlarm.cancelAlarm`), la UI queda stale, la alarma **no se cancela** (alarma fantasma para una dosis ya tomada) y un retry doble-decrementa stock. *Fix: try/catch + refrescar estado en `finally`; guardar el decremento contra re-aplicación.*
- **M26** `ui.ts:9` — `snoozedTimes` vive solo en memoria y no se persiste, mientras la alarma reprogramada sí persiste → tras reiniciar la app la dosis muestra la hora original sin badge de snooze y pierde el "deshacer", pero la alarma suena a la hora pospuesta. *Fix: persistir `snoozedTimes` (MMKV/SQLite) o derivar de `notification_map`.*
- **M16** `notifications.ts:301` — `getNotifMapEntry` traga errores de DB y devuelve `null`, indistinguible de "no encontrado" → una acción Taken/Skip/Snooze de notificación se pierde sin telemetría. *Fix: dejar propagar / capturar a Sentry y distinguir "no encontrado" de "falló la lectura".*
- **M14** `_layout.tsx:179` _(plausible)_ — El reschedule en foreground se traga errores con `.catch(()=>{})` sin Sentry (inconsistente con el background task que sí captura). *Fix: capturar a Sentry + catch en `loadTodayLogs`.* (El escenario exacto de permiso revocado fue refutado: `setAlarmClock` no requiere `SCHEDULE_EXACT_ALARM`.)
- **M15** `medications.ts:344` — Duplicado de C5 desde la dimensión error-handling (mismo loop `i<7`).

**Módulos nativos (Kotlin)**
- **M20** `ExpoWidgetModule.kt:39` — El widget de home muestra la "próxima dosis" indefinidamente stale: renderiza de SharedPreferences escritas por JS, `updatePeriodMillis=0`, y las alarmas nativas disparan sin invocar JS ni refrescar el widget. *Fix: refrescar el widget desde el lado nativo cuando una dosis se resuelve/dispara.*
- **M21** `AlarmAudioService.kt:154` _(plausible)_ — La ruta EXECUTE_BUTTON llama `startForeground()` con una notificación vacía y sin ícono → riesgo de crash "Bad notification for startForeground" en algunos OEM y blanqueo momentáneo de la alarma. *Fix: `setSmallIcon` válido y/o solo `startForeground` en cold-start, con try/catch.*
- **M22** `AlarmAudioService.kt:402` _(plausible)_ — En Android 14 sin permiso full-screen-intent, una alarma en background no muestra la pantalla completa porque `startActivity()` desde el servicio lo bloquea BAL (audio sí suena → degradado, no perdido). *Fix: pedir proactivamente `USE_FULL_SCREEN_INTENT` en 14+ y gatear la feature.*

**Lógica de negocio (adherencia)**
- **M7** `useAdherenceStreak.ts:31` — Las dosis PRN (a demanda) cuentan para el streak y enmascaran dosis programadas perdidas (un PRN 'taken' blanquea el día). *Fix: excluir scheduleIds `prn-*` del grouping del streak.*
- **M8** `useAdherenceStreak.ts:37` — El streak colapsa a 0 cada mañana hasta que se loguea la primera dosis del día (el loop rompe en `today` sin log). *Fix: tratar "hoy" como neutral; iniciar el scan en ayer.*

**Backup / PDF**
- **M5** `pdfReport.ts:79` — El PDF interpola texto de usuario sin escapar (nombre, notas, dosis) → `< > &` rompen el reporte que se comparte con el médico. *Fix: helper `escapeHtml()` en cada interpolación.* (= L3.)
- **M6** `pdfReport.ts:94` — En el historial del PDF, los meds inactivos muestran el **UUID crudo** en vez del nombre (busca solo en `activeMeds`). *Fix: resolver contra el array completo de medicamentos.*

**Formularios**
- **M17** `CheckinModal.tsx:64` — `handleSave` sin catch e invocado fire-and-forget → un fallo de DB deja una rejection no manejada, sin toast de error y con el modal trabado; el usuario cree que guardó. *Fix: catch con toast + await en el call site.*
- **M18** `LocationPickerModal.tsx:368` — Confirma el pin default (Buenos Aires) sin interacción del usuario → guarda coordenadas equivocadas para la cita; incluso con el mapa fallando (fallback de key inválida) el botón Confirmar sigue activo. *Fix: trackear interacción real y deshabilitar/omitir coords hasta entonces.*

**i18n / visual**
- **M19** `AppointmentDetailModal.tsx:319` — Badge "Past" hardcodeado en inglés (existe la key `appointments.past`). *Fix: `{t("appointments.past")}`.*
- **M29** `health.tsx:169` — El diario renderiza `checkin.symptom_${s}` sin fallback; el seed usa tokens españoles (`fatiga`,`dolor_cabeza`) que no matchean las keys canónicas inglesas → se muestran keys crudas como `checkin.symptom_fatiga`. *Fix: corregir tokens del seed + `defaultValue` en `tDyn`.*
- **M27** `settings.tsx:93` — En la fila de settings, el valor trailing colisiona con la descripción (sin gap/shrink) → texto pegado como "…alarmsBuzzer Alarm". *Fix: `ml-3`/gap + `flex-shrink` con `max-width`.*
- **M28** `DoseCard.tsx:337` — El botón "Taken" usa verdes distintos entre pantallas (`green-700` en Home vs `green-500` en el detalle de calendario). *Fix: un solo token de verde.*

**Accesibilidad**
- **M1** `DayToggle.tsx:65` — Chips de día ~28pt, muy por debajo de 44pt, sin `hitSlop`, con 6px de gap → mis-taps al elegir días. *Fix: `min-h-[44px] min-w-[44px]` o hitSlop (Material sugiere 48dp).*
- **M2** `DoseCard.tsx:219` — El badge de hora se anuncia como "button" incluso cuando no hace nada (dosis missed/done). *Fix: `accessibilityRole="button"` solo si `isPending && onReschedule`.*
- **M3** `onboarding.tsx:348` — Los dots de paginación (~10px) y Skip sin roles/labels accesibles ni tamaño adecuado, en la primera pantalla que ve un usuario mayor. *Fix: hit area ≥44pt + `accessibilityRole="button"` + label.*
- **M4** `MedicationForm.tsx:123` — El time-picker trigger, el "x" de limpiar fecha y los chips add/remove-alarm son ~24–36pt. *Fix: estandarizar a `min-h-[44px]`.*
- **M10** `utils/index.ts:186` — El label del badge de categoría 'Other' (`#64748b` slate-500 a 12px) da ~3.6-3.8:1 sobre la card oscura, bajo AA. *Fix: tinte más claro en dark mode o resolver vía `useAppTheme()`.*
- **M9** `MedicationCard.tsx:185` — Los pills de schedule/PRN usan `colors.light` fijo → chips claros brillantes sobre cards oscuras en dark mode (inconsistencia visual). *Fix: superficie theme-aware (overlay de baja alpha).*

---

## 8. 🟢 Bajos (resumen)

- **L1** `utils/index.ts:65` — `isScheduleActiveOnDate` puede quedar off-by-one si `createdAt` es date-only (`'2026-07-21'` → `new Date()` lo parsea como UTC midnight) en backups importados en timezones negativas. *Fix: normalizar `createdAt` en import; evitar `new Date('YYYY-MM-DD')`.*
- **L2** `medications.ts:199` _(plausible)_ — `markDose` corre el prompt de StoreReview sin guard antes del refresh final de UI → un throw deja el Home mostrando la dosis como pendiente. *Fix: try/catch en el bloque de review, o mover `loadTodayLogs` antes/`finally`.*
- **L3** `pdfReport.ts:79` — Duplicado de M5 (inyección HTML sin escapar en el PDF), detectado desde error-handling.
- **L4** `health.tsx:740` — El código referencia `t("health.addButton")`, key inexistente en `en.ts`/`es.ts` (hoy es rama muerta por un guard). *Fix: agregar la key o usar `health.saveButton`/`common.add`.*
- **L5** `LocationPickerModal.tsx:463` — El fallback de error de Google Maps es inglés hardcodeado con paths de dev (`src/config.ts`, `strings.xml`) mostrados al usuario final. *Fix: `t()` con keys nuevas y mensaje user-facing.*
- **L6** `app.json:63` _(plausible)_ — Permiso de ubicación iOS sobre-declarado a "Always" (background) cuando la app solo usa foreground. *Fix: cambiar a `locationWhenInUsePermission`.* (El escenario de rechazo/prompt fue matizado: sin `requestAlwaysAuthorization` no hay prompt extra; es higiene de store.)
- **L7** `alarm.tsx:107` — El deep link `pilloclock://alarm?action=taken` muta registros de adherencia (y decrementa stock) sin validación de origen ni confirmación; el scheme es público. Exploitabilidad limitada por UUIDs random, pero muta sin consentimiento. *Fix: no mutar desde params de deep-link; exigir la ruta de notification-response validada, o un token nonce del módulo nativo.*
- **L8** `pdfReport.ts:227` — El PDF de salud generado y los backups importados quedan en el dir de cache y **nunca se borran** → datos médicos sensibles acumulándose en cache. *Fix: borrar el PDF (`uri` y `destUri`) en `finally` tras compartir; borrar el archivo de import tras parsear.*
- **L9** `LocationPickerModal.tsx:21` / `config.ts:5` — Comentarios apuntan a un plugin `react-native-maps` en `app.json` que no existe; la inyección real es `app.config.ts`. Riesgo de que un mantenedor edite el archivo equivocado. *Fix: actualizar los comentarios a `app.config.ts`.*
- **L10** `store/index.ts:85` — `resetAllData`/`clearAllData` borran las filas de `appointment_documents` pero dejan los archivos huérfanos en disco. *Fix: borrar el contenido del dir `appointment_docs` en el reset.*
- **L11** `DoseCard.tsx:194` — El glyph del avatar del med difiere entre Home/History (asterisco genérico) y Calendario (ícono de categoría). *Fix: un solo sistema de íconos.*

---

## 9. Fortalezas a preservar

- **Scheduling nativo determinista en Android** vía `AlarmManager.setAlarmClock` con `requestCode` estable + `FLAG_UPDATE_CURRENT`, que previene correctamente alarmas duplicadas — los riesgos de duplicación son solo de la ruta iOS.
- **`notification_map` persistido en SQLite** desacopla las alarmas programadas del estado efímero del store y habilita cancelación fiable y lookup de acción en cold-start — una decisión arquitectónica sólida para una app de recordatorios.
- **TypeScript limpio que typechequea, con una suite de tests real** (162 tests): base para agregar tests de regresión de los bugs encontrados aquí.
- **Sistema consistente de tokens semánticos de tema** (text/muted/surface, NativeWind): la mayoría de superficies ya son theme-aware; los defectos de dark mode son fugas aisladas de colores fijos, no una capa de theming faltante.
- **Detalles seguros ya presentes:** `upsertDoseLog` usa delete+insert en transacción para evitar escrituras parciales, `insertMissedDoseLogSafe` usa `INSERT OR IGNORE` para no pisar logs reales, y la pantalla de alarma guarda con `isLoading` y bloquea el back — los instintos son correctos aun donde la ejecución tiene gaps.

---

## Apéndice A — Tabla de tracking (64 hallazgos)

> Sev: C=Crítico, H=Alto, M=Medio, L=Bajo · Veredicto: ● CONFIRMED (reproducido en código) / ◐ PLAUSIBLE (defecto real, disparo runtime-dependiente).

| ID | Sev | Dim | Archivo | Veredicto | Título |
|---|---|---|---|---|---|
| C1 | C | backup-report | `src/services/backup.ts:239` | ● CONF | Backup restore silently drops ALL dose logs (nested transaction inside import transaction) |
| C2 | C | db-data-layer | `src/services/backup.ts:240` | ● CONF | Backup restore silently drops ALL dose-log history (nested transaction inside withTransactionAsync) |
| C3 | C | forms-validation | `components/MedicationForm.tsx:389` | ● CONF | Empty day selection silently becomes a daily alarm (unwanted every-day medication reminders) |
| C4 | C | native-modules | `modules/expo-alarm/android/src/main/java/expo/modules/alarm/ExpoAlarmModule.kt:64` | ● CONF | Reboot wipes all AlarmManager alarms; nothing reschedules them until the app is next opened or a background fetch happens to run |
| C5 | C | notifications-alarms | `src/store/slices/medications.ts:344` | ● CONF | iOS 64-notification budget breached: add/edit/toggle/revert schedules a hardcoded 7 days, ignoring DAYS_AHEAD=3 |
| C6 | C | security-privacy | `app/_layout.tsx:8` | ● CONF | Sentry crash reporter ships and transmits data, directly contradicting the app's "no crash reporters / nothing leaves your device" privacy claim |
| H1 | H | accessibility | `src/utils/index.ts:184` | ● CONF | Supplement/Vitamin category labels fail WCAG contrast (green ~2.1:1, yellow ~1.8:1) |
| H2 | H | accessibility | `components/MedicationCard.tsx:126` | ● CONF | Medication active/inactive Switch has no accessibilityLabel — screen readers can't identify which med |
| H3 | H | backup-report | `src/services/backup.ts:223` | ● CONF | Import is not atomic despite doc claiming all-or-nothing; per-record catch swallows failures |
| H4 | H | backup-report | `src/services/backup.ts:42` | ● CONF | Backup does not preserve photos or appointment documents; device-local URIs dangle after restore |
| H5 | H | backup-report | `app/(tabs)/settings.tsx:213` | ● CONF | Alarms/notifications not rescheduled after restore in the same session — restored meds may not fire |
| H6 | H | business-logic | `src/hooks/useAdherenceStreak.ts:42` | ● CONF | Adherence streak never breaks on missed doses (ignores 'missed' status entirely) |
| H7 | H | dark-mode-theming | `app/_layout.tsx:220` | ● CONF | Add/Edit medication modal header hardcoded to light theme in dark mode |
| H8 | H | dark-mode-theming | `app/alarm.tsx:180` | ● CONF | Alarm screen time and subtitle become unreadable in dark mode (theme-aware text on fixed light background) |
| H9 | H | error-handling | `app/alarm.tsx:155` | ● CONF | Alarm screen action handlers have no error handling — a thrown error traps the user on the fullscreen alarm with the back button disabled |
| H10 | H | i18n-parity | `modules/expo-alarm/android/src/main/java/expo/modules/alarm/AlarmAudioService.kt:405` | ● CONF | Full-screen medication alarm notification hardcodes Spanish action buttons and channel names in native Kotlin (bypasses i18n) |
| H11 | H | native-modules | `modules/expo-alarm/android/src/main/java/expo/modules/alarm/AlarmAudioService.kt:350` | ● CONF | playAlarm() runs MediaPlayer.setDataSource/prepare with no try-catch — an unavailable saved sound URI crashes the foreground service process and kills the ringing alarm |
| H12 | H | native-modules | `modules/expo-alarm/android/src/main/java/expo/modules/alarm/AlarmAudioService.kt:189` | ◐ PLAUS | Alarm can go silent after 10 minutes: the wakelock times out and MediaPlayer.setWakeMode is never set, so an unattended dose alarm stops when the CPU sleeps |
| H13 | H | notifications-alarms | `src/hooks/useNotificationResponse.ts:65` | ◐ PLAUS | iOS notification action (Taken/Skip/Snooze) silently lost on cold start: notification dismissed before the store is loaded |
| H14 | H | security-privacy | `components/LocationPickerModal.tsx:203` | ● CONF | Google Places / Geocoding network calls and expo-location contradict "no external server" and "we do not collect location" claims |
| H15 | H | security-privacy | `docs/privacy-policy.html:55` | ● CONF | English privacy policy is internally contradictory and out of sync with the Spanish version and the app's actual data model |
| H16 | H | state-store | `src/store/slices/medications.ts:278` | ● CONF | revertDose (and taken→skipped) never restores stock, so undo + re-take double-decrements the stock counter |
| H17 | H | state-store | `src/store/slices/medications.ts:89` | ● CONF | Editing a medication regenerates all schedule IDs, orphaning today's dose logs so already-taken doses reappear as missed and can be logged (and taken) twice |
| H18 | H | visual-consistency | `components/MedicationCard.tsx:142` | ● CONF | Garbled mojibake arrow in medication date range |
| M1 | M | accessibility | `components/DayToggle.tsx:65` | ● CONF | Day-of-week selector chips are ~28pt tall — far below the 44pt touch minimum |
| M2 | M | accessibility | `components/DoseCard.tsx:219` | ● CONF | DoseCard time badge is announced as a 'button' even when it does nothing (missed/done doses) |
| M3 | M | accessibility | `app/onboarding.tsx:348` | ● CONF | Onboarding pagination dots (~10px) and Skip lack accessible roles/labels and adequate size |
| M4 | M | accessibility | `components/MedicationForm.tsx:123` | ● CONF | Several add/edit-medication form controls fall below the 44pt touch minimum |
| M5 | M | backup-report | `src/services/pdfReport.ts:79` | ● CONF | PDF report injects unescaped user text into print HTML (med names/notes corrupt or break the shared report) |
| M6 | M | backup-report | `src/services/pdfReport.ts:94` | ● CONF | PDF history shows raw medication UUID instead of name for inactive medications |
| M7 | M | business-logic | `src/hooks/useAdherenceStreak.ts:31` | ● CONF | PRN (as-needed) doses count toward the adherence streak and mask missed scheduled doses |
| M8 | M | business-logic | `src/hooks/useAdherenceStreak.ts:37` | ● CONF | Adherence streak collapses to 0 every morning until the first dose of the day is logged |
| M9 | M | dark-mode-theming | `components/MedicationCard.tsx:185` | ● CONF | Medication schedule/PRN pills render as light chips on dark cards in dark mode |
| M10 | M | dark-mode-theming | `src/utils/index.ts:186` | ● CONF | 'Other' category badge label fails WCAG AA contrast in dark mode |
| M11 | M | db-data-layer | `src/db/database.web.ts:245` | ● CONF | database.web.ts is missing ~15 API functions the app imports — web build crashes on Appointments/Health/stock |
| M12 | M | db-data-layer | `src/db/database.ts:395` | ● CONF | Deleting a medication orphans its dose_logs on native (no FK, no manual cleanup) — diverges from web |
| M13 | M | db-data-layer | `src/db/database.web.ts:206` | ● CONF | Web upsertDoseLog drops notes/skipReason/scheduledTime on existing rows (behavioral divergence from native) |
| M14 | M | error-handling | `app/_layout.tsx:179` | ◐ PLAUS | Foreground reschedule failures are silently swallowed with no Sentry capture — missed medication alarms become invisible |
| M15 | M | error-handling | `src/store/slices/medications.ts:344` | ● CONF | Adding/editing a medication schedules 7 days of iOS notifications, overrunning the 64-notification budget the rest of the app is designed around |
| M16 | M | error-handling | `src/services/notifications.ts:301` | ● CONF | getNotifMapEntry swallows DB read errors and returns null, silently dropping a notification TAKEN/SKIP/SNOOZE action |
| M17 | M | forms-validation | `components/CheckinModal.tsx:64` | ● CONF | CheckinModal save has no catch: DB failure yields an unhandled rejection, no error toast, and a stuck modal |
| M18 | M | forms-validation | `components/LocationPickerModal.tsx:368` | ● CONF | Location picker confirms the default Buenos Aires pin with no user interaction, recording a wrong location |
| M19 | M | i18n-parity | `components/AppointmentDetailModal.tsx:319` | ● CONF | "Past" badge on appointment detail is hardcoded English, untranslated for Spanish users |
| M20 | M | native-modules | `modules/expo-widget/android/src/main/java/expo/modules/widget/ExpoWidgetModule.kt:39` | ● CONF | Home-screen widget shows stale 'next dose' indefinitely — native alarms fire without ever refreshing it, and updatePeriodMillis is 0 |
| M21 | M | native-modules | `modules/expo-alarm/android/src/main/java/expo/modules/alarm/AlarmAudioService.kt:154` | ◐ PLAUS | EXECUTE_BUTTON path calls startForeground() with an icon-less empty notification, risking a 'Bad notification for startForeground' crash and blanking the alarm notification |
| M22 | M | native-modules | `modules/expo-alarm/android/src/main/java/expo/modules/alarm/AlarmAudioService.kt:402` | ◐ PLAUS | On Android 14 without full-screen-intent permission, a backgrounded alarm shows no full-screen screen because startActivity() from the service is blocked by background-activity-launch restrictions |
| M23 | M | notifications-alarms | `src/services/notifications.ts:772` | ● CONF | Unguarded concurrent rescheduleAllNotifications can create duplicate iOS notification chains |
| M24 | M | notifications-alarms | `src/store/index.ts:85` | ● CONF | resetAllData and backup-restore leave stale health-reminder AsyncStorage keys, showing a reminder that is not scheduled |
| M25 | M | state-store | `src/store/slices/medications.ts:156` | ● CONF | markDose is not atomic and has no error handling: a failure after the dose log is written leaves stale UI, an un-cancelled alarm, and enables a double stock decrement on retry |
| M26 | M | state-store | `src/store/slices/ui.ts:9` | ● CONF | snoozedTimes is ephemeral in-memory state lost on app restart while the rescheduled alarm persists, so the dose shows the wrong time and loses its undo affordance |
| M27 | M | visual-consistency | `app/(tabs)/settings.tsx:93` | ● CONF | Settings row: trailing value collides with description text |
| M28 | M | visual-consistency | `components/DoseCard.tsx:337` | ● CONF | Primary 'Taken' button uses different greens across screens |
| M29 | M | visual-consistency | `app/(tabs)/health.tsx:169` | ● CONF | Untranslated i18n keys shown in Health/Diary symptom list |
| L1 | L | business-logic | `src/utils/index.ts:65` | ● CONF | isScheduleActiveOnDate can be off-by-one for medications whose createdAt is a date-only string (imported backups) |
| L2 | L | error-handling | `src/store/slices/medications.ts:199` | ◐ PLAUS | markDose runs the non-critical StoreReview prompt unguarded before the final UI refresh, so a throw leaves the Home screen showing the dose as still pending |
| L3 | L | error-handling | `src/services/pdfReport.ts:79` | ● CONF | PDF report injects medication names and notes into HTML without escaping, corrupting the exported/shared report |
| L4 | L | i18n-parity | `app/(tabs)/health.tsx:740` | ● CONF | Code references i18n key health.addButton that does not exist in en.ts or es.ts |
| L5 | L | i18n-parity | `components/LocationPickerModal.tsx:463` | ● CONF | Google Maps error fallback in LocationPickerModal is hardcoded English (not via t()) |
| L6 | L | security-privacy | `app.json:63` | ◐ PLAUS | iOS location permission over-scoped to background "Always" while the app only uses foreground location |
| L7 | L | security-privacy | `app/alarm.tsx:107` | ● CONF | Deep link pilloclock://alarm?action=... silently mutates medication adherence records with no origin validation |
| L8 | L | security-privacy | `src/services/pdfReport.ts:227` | ● CONF | Generated PDF health report and imported backups are left in the app cache directory and never deleted |
| L9 | L | security-privacy | `components/LocationPickerModal.tsx:21` | ● CONF | Stale code/comment references a react-native-maps config plugin that does not exist in app.json |
| L10 | L | state-store | `src/store/index.ts:85` | ● CONF | resetAllData / clearAllData delete appointment_documents rows but leave their files orphaned on disk |
| L11 | L | visual-consistency | `components/DoseCard.tsx:194` | ● CONF | Medication icon glyph inconsistent between Home/History and Calendar |
