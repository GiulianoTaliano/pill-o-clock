# Pill O-Clock — Auditoría de usabilidad funcional (uso real)

> **Fecha:** 2026-07-22 · **Método:** operación real de la app en dispositivo (deep links + taps + lectura del árbol de accesibilidad) + análisis con 4 lentes de usuario (usuario nuevo/mayor · arquitectura/descubribilidad · densidad de explicación · fricción de flujos) cruzado con capturas y código.
> **Pregunta guía:** ¿es la app, hoy, simple de usar para cualquier público (incluidos adultos mayores y cuidadores)? — **No es sobre estética.**

---

## Veredicto: **Todavía no. Nota de simplicidad: D+**

Está **cerca** en la tarea central ("recordame y dejame confirmar que la tomé"), pero **dos problemas estructurales** la vuelven difícil de usar sin ayuda para alguien no técnico o mayor:

1. **Esconde su valor estrella** — el historial de adherencia y el calendario — detrás de dos íconos sin label en el header de Home (`href:null`, sin tab). Lo único que los explica es un tour de una sola vez que se descarta y se olvida.
2. **El acto cotidiano de *registrar* está roto** donde la gente busca: un medicamento "a demanda" en la pestaña Medicamentos es un callejón sin salida (solo Editar/Borrar; el botón real está al fondo del Home), y una dosis perdida solo se confirma con un ambiguo "Taken late".

Sumado a un **setup sobrecargado** (6 slides + tour de 6 pasos + selector de 15 sonidos crípticos antes de agregar nada) y un **bloqueo en el paso 1** del alta si no se pone una dosis numérica — contradiciendo su propio "todo es opcional". Las bases son buenas: **casi todos los fixes son re-etiquetar y re-ubicar, no reconstruir.** Como está hoy, un usuario mayor probablemente agregará un medicamento, pero **no encontrará su historial, no podrá registrar una dosis a demanda, y se trabará durante la configuración.**

**30 hallazgos** (3 críticos, 13 altos, 13 medios, 1 bajo) en 4 lentes; alta convergencia entre lentes (ver Apéndice).

---

## Plan de remediación (implementación incremental)

| ID | Punto | Cubre | Estado |
|---|---|---|---|
| **I1** | Labels de texto bajo los íconos de Home (Calendario / Historial) | U1,U3,U4,U13,U22 | ✅ Hecho |
| **I2** | Botón "Registrar toma" en la card del med PRN (pestaña Medicamentos) + confirmación/undo | U2,U6,U8,U15 | ✅ Hecho |
| **I3** | Sacar el selector de sonidos del onboarding (queda en Settings) | U5,U11,U23,U30 | ✅ Hecho |
| **I4** | Paso 1 del alta: no bloquear por dosis numérica (hint "1 comprimido" válido) | U17 | ✅ Hecho |
| **I5** | Renombrar "Taken late" a un verbo claro ("Marcar como tomada") | U20,U29 | ✅ Hecho |
| **I6** | Snooze con presets grandes (10/15/30) + "Más" para la rueda | U16 | ✅ Hecho |
| **I7** | Acción "Compartir con tu médico" (PDF) en Historial (además de Settings) | U7,U14,U19,U25 | ✅ Hecho |
| **I8** | Diario: síntomas renderizan keys i18n crudas (M29) + descubribilidad del check-in | U9 | ✅ Hecho |
| **I9** | Nota inline: elegir PRN desactiva TODAS las alarmas | U27 | ✅ Hecho |
| **I10** | Explicar el streak 🔥 y la leyenda del heatmap | U24 | ✅ Hecho |
| **I11** | Aviso local-first: "tus datos viven solo en este teléfono — hacé un backup" | U21 | ✅ Hecho |
| **I12** | Promover Historial al tab bar / reasignar slots (decisión de producto) | U10 | 🔶 A decidir |
| **I13** | Reordenar el paso cosmético (color/foto) del wizard | U18,U28 | 🔶 Opcional |

---

## Fricción principal (rankeada, deduplicada)

1. **🔴 Historial y Calendario solo por íconos sin label en Home.** Son la promesa de la app (+ los datos del reporte al médico). → Label + (idealmente) tab o card "Ver mi adherencia".
2. **🔴 No se puede registrar una dosis PRN desde donde vive el med, y no hay undo.** Callejón en Medicamentos; el único botón está al fondo del Home y dispara instantáneo (toque accidental = dosis permanente + descuenta stock). → Botón en la card PRN + confirmación/undo.
3. **🟠 Setup sobrecargado:** ~12 taps (6 slides + tour + selector de 15 sonidos crípticos) antes de la primera tarea. → Sacar el selector, cortar slides, tour re-invocable.
4. **🟠 Paso 1 bloquea sin dosis numérica** — contradice "todo es opcional". → Dosis opcional / hint "1".
5. **🟠 "Taken late" es la única forma de confirmar una dosis perdida** — ambiguo. → "Marcar como tomada", la app calcula la demora.
6. **🟠 Snooze fuerza una rueda** en vez de presets — control fino difícil para mayores. → Botones 10/15/30 + "Más".
7. **🟠 El PDF al médico está 3 niveles abajo en Settings.** → "Compartir con tu médico" en Historial y detalle de cita.
8. **🟡 Slots del tab invertidos:** Citas (a menudo vacío) tiene tab; la adherencia no.
9. **🟡 Check-in escondido en Health→Diary + síntomas ilegibles** (keys i18n crudas, = M29).

### Sub-explicado (la gente adivina)
- **Elegir "PRN" desactiva TODAS las alarmas** — nunca se avisa *(seguridad)*.
- El **streak** 🔥 no explica qué lo mantiene/rompe. El **heatmap** no tiene leyenda.
- Que la app es **local-first** (datos se pierden con el teléfono sin backup) nunca se dice.
- Que "1 comprimido" es una dosis válida en el paso 1.

### Sobre-explicado
- Onboarding + tour = ~12 pasos que entrenan a *descartar* overlays (justo donde vive la explicación de Calendario/Historial).
- Selector de 15 sonidos con nombres crípticos (Argon, Barium, Cesium, Helium…) forzado mid-onboarding.
- 3 pantallas de permisos apiladas al final del onboarding.
- El paso 2 del wizard (color+foto) metido entre "qué es" y "cada cuánto".

### Fortalezas a conservar
- Alta bien defaulteada (8am diario pre-cargado, "todo opcional", Skip-and-save — se completa con Next×4 + Guardar).
- Recordatorios sin abrir la app (alarma full-screen + acciones en la notificación).
- Confirmación donde importa (motivo de omisión, doble confirmación de borrado, micro-animación de "tomada").
- Home escaneable (chips de resumen + dosis agrupadas por estado).
- Categorías, unidades y stock opcional dan estructura sin forzar.

---

## Apéndice — 30 hallazgos por lente (convergencia)

> Alta redundancia = alta confianza: varios lentes independientes encontraron los mismos problemas. Deduplicados arriba.

| # | Sev | Categoría | Hallazgo |
|---|---|---|---|
| U1 | C | hidden-feature | Adherence History and Calendar — the app's core "prove you're taking your meds" value — are hidden behind two unlabeled icon buttons on Home, with no tab and no text label |
| U2 | C | dead-end | No way to log an as-needed (PRN) dose from the Medications tab — the natural place users look |
| U3 | C | discoverability | Adherence History and dose Calendar are hidden behind two unlabeled icons in the Home header |
| U4 | H | discoverability | The adherence History (and Calendar) — the app's headline 'prove you took your pills' value — is reachable only through an unlabeled icon in the Home header |
| U5 | H | friction | Onboarding is 6 slides and forces a meaningless configuration decision — a 15-item alarm-sound picker with cryptic names — before the user has done anything |
| U6 | H | hidden-feature | Logging an as-needed (PRN) dose is hidden: the natural spot does nothing, and the only button lives at the very bottom of the Home screen |
| U7 | H | hidden-feature | The doctor PDF report is buried three levels deep in Settings, despite being pitched as a headline feature for caregivers |
| U8 | H | dead-end | You cannot log an as-needed dose from where the as-needed medication lives — the Medications tab is a dead end for PRN, logging is only at the bottom of Home |
| U9 | H | hidden-feature | The daily wellbeing check-in is hidden on the second (non-default) sub-tab of Health, so users only ever find it via a conditional prompt that may not appear |
| U10 | H | discoverability | The five bottom-tab slots are mis-allocated: Appointments gets a permanent tab (often empty) while core adherence History/Calendar get none |
| U11 | H | over-explained | Onboarding forces a full alarm-sound picker (15 cryptic ringtone names) before the user has added anything |
| U12 | H | cognitive-load | Two back-to-back tutorials on first run (6-slide carousel + 6-step spotlight tour) cause tutorial fatigue |
| U13 | H | discoverability | Calendar and adherence History are reachable only through two unlabeled header icons |
| U14 | H | discoverability | The doctor PDF report — pitched as a headline feature — is buried three levels deep in Settings |
| U15 | H | friction | Logging an as-needed (PRN) dose is buried at the bottom of Home, absent from the Medications tab, and cannot be undone |
| U16 | H | friction | Snooze forces a scrolling wheel-picker instead of quick preset buttons |
| U17 | M | friction | Add-medication hard-blocks at step 1 unless a numeric dose is entered, contradicting the app's 'everything is optional' promise |
| U18 | M | cognitive-load | The 5-step add wizard spends a whole step on cosmetic color/photo, placed between 'what is it' and 'how often' — lengthening the core task |
| U19 | M | discoverability | The doctor PDF report — pitched as a headline feature in onboarding — is buried three levels down as the third row of Settings › Your data |
| U20 | M | under-explained | For a missed dose, the only positive action is a button labeled 'Taken late' — ambiguous as both a past-tense state and a present action, with no plain 'I took it' |
| U21 | M | hidden-feature | Backup/Export/Import is buried in Settings, so users of a local-first app are never told their data isn't backed up anywhere |
| U22 | M | discoverability | Home's three top-right controls are icon-only (calendar, chart, +) with no text labels, and the + (add medication) is visually indistinguishable from the two navigation icons |
| U23 | M | over-explained | Onboarding over-surfaces a full alarm-sound picker with cryptic ringtone names, forcing a config decision during setup while core features stay under-explained |
| U24 | M | under-explained | Streak flame and adherence heatmap are shown with no explanation of what they mean |
| U25 | M | discoverability | The doctor PDF report — pitched in onboarding — is buried three levels deep in Settings |
| U26 | M | cognitive-load | Final onboarding slide stacks three separate Android permission requests with technical hints |
| U27 | M | under-explained | Choosing PRN silently removes the entire reminder step without warning the med will never alert |
| U28 | M | friction | The Appearance step (color + photo) interrupts the add flow between identity and scheduling with cosmetic-only choices |
| U29 | M | cognitive-load | Missed doses render at the top of Home with a large green 'Taken late' button, competing with the day's real tasks |
| U30 | L | over-explained | Onboarding embeds a full 15-item alarm-sound picker with cryptic names mid-first-run |
