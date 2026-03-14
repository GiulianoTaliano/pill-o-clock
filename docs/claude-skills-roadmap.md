# Claude Skills Roadmap — Pill O-Clock

> Source of truth para la integración de capacidades avanzadas de Claude en el
> ciclo de desarrollo de Pill O-Clock.
>
> Revisión: marzo 2026 · 9 skills identificadas · 6 completadas

---

## Leyenda

- ✅ **Completada** — Implementada y verificada
- 🔵 **En progreso** — Trabajo iniciado
- ⬚ **Pendiente** — Aún no iniciada

---

## Matriz de prioridad

| # | Skill | Impacto | Esfuerzo | Estado |
|---|-------|---------|----------|--------|
| S1 | Vision — Revisión de UI en tiempo real | Alto | Medio | ✅ |
| S2 | GitHub MCP — Del análisis a la acción | Alto | Bajo | ✅ |
| S3 | Extended Context — Auditoría de seguridad del ciclo de medicación | Alto | Bajo | ✅ |
| S4 | Generación de tests con Extended Thinking | Crítico | Bajo | ✅ |
| S5 | Agentic Refactoring — MedicationForm | Medio | Bajo | ✅ |
| S6 | Multilingüe con verificación de contexto médico | Medio | Medio | ⬚ |
| S7 | Análisis de arquitectura de notificaciones | Alto | Alto | ⬚ |
| S8 | Health Connect / Apple Health Integration | Alto | Alto | ⬚ |
| S9 | Custom Copilot Instructions | Alto | Bajo | ✅ |

---

## S1 — Vision: Revisión de UI en tiempo real

- **Estado:** ✅ Completada
- **Categoría:** Calidad de UI · Accesibilidad · QA visual
- **Dependencias:** Emulador Android corriendo o dispositivo conectado via ADB

### Descripción

Usar la capacidad de visión de Claude (Opus) para recibir screenshots de la app
en ejecución y producir auditorías visuales automatizadas. El modelo analiza
cada pantalla y genera hallazgos accionables con referencia a archivo y línea.

### Alcance

| Auditoría | Detalle |
|---|---|
| **Consistencia visual** | Spacing NativeWind, tipografía, colores entre light/dark mode |
| **Touch targets** | Detectar elementos interactivos menores a 44×44 pt (crítico para usuarios mayores) |
| **Contraste WCAG** | Verificar ratio AA (4.5:1 texto, 3:1 UI) y AAA (7:1) — especialmente relevante dado que el público objetivo incluye personas mayores |
| **Overflow / clipping** | Textos cortados, elementos fuera de bounds, scroll issues |
| **Estado vacío / error** | Verificar UX cuando no hay datos, errores de red, etc. |
| **Dark mode** | Consistencia de CSS variables (`text-text`, `bg-background`, `bg-card`) en ambos temas |

### Implementación prevista

1. **Captura automatizada** — Script ADB que recorre las pantallas principales y
   captura screenshots:
   - Home (vacío / con dosis / todas tomadas)
   - Medications list (con/sin medicamentos)
   - Calendar (con/sin citas)
   - Health (con/sin mediciones)
   - Settings
   - MedicationForm (nuevo / edición)
   - Alarm screen
   - Onboarding slides
2. **Análisis por Claude Vision** — Cada screenshot se envía al modelo con un
   prompt estructurado que pide hallazgos categorizados (severidad, archivo
   probable, descripción, fix sugerido).
3. **Generación de issues** — Via GitHub MCP (S2), crear issues directamente
   desde los hallazgos con labels `ui`, `accessibility`, `visual-bug`.

### Pantallas prioritarias

| Pantalla | Ruta | Complejidad visual | Razón de prioridad |
|---|---|---|---|
| Home / Today | `app/(tabs)/index.tsx` | Alta | Pantalla más usada; status chips + streak + PRN section + copilot tour |
| DoseCard | `components/DoseCard.tsx` | Alta | Contraste de status colors + swipe UX + actionable buttons |
| MedicationForm | `components/MedicationForm.tsx` | Alta | Formulario largo con color picker, schedule rows, date pickers |
| Alarm screen | `app/alarm.tsx` | Media | Fullscreen above lock screen — legibilidad crítica para acción urgente |
| Health charts | `app/(tabs)/health.tsx` | Media | Sparklines SVG custom — legibilidad de datos numéricos |

### Entregable

- Script de captura (`scripts/capture-screenshots.ps1`)
- Prompt template para auditoría visual
- Issues creados automáticamente en GitHub

### Implementación (marzo 2026)

Auditía de UI ejecutada por Claude Opus vía análisis de código de los 9 screens
principales. Infraestructura de captura automatizada creada para futuras
revisiones con screenshots reales.

#### Archivos creados

| Archivo | Propósito |
|---|---|
| `scripts/capture-screenshots.ps1` | Captura automatizada via ADB (9 pantallas × 2 temas) |
| `scripts/run-vision-review.ps1` | Orquestador end-to-end: captura → audit manual o automático |
| `scripts/vision-review.mjs` | Pipeline automático: GitHub Models API → análisis IA → issues → reporte |
| `.github/agents/vision-reviewer.agent.md` | Custom agent para auditorías interactivas manuales |
| `docs/vision-review-s1.md` | Documentación completa de hallazgos y proceso |

#### Pipeline automatizado (S1d — marzo 2026)

Pipeline Node.js sin intervención humana que usa la API de GitHub Models
(incluida en Copilot subscription) para analizar screenshots con visión de IA.

```powershell
# Captura + análisis + creación de issues (zero intervención manual)
.\scripts\run-vision-review.ps1 -Auto

# Solo análisis, sin crear issues
.\scripts\run-vision-review.ps1 -Auto -DryRun

# Modelo específico (por defecto: openai/gpt-4.1)
.\scripts\run-vision-review.ps1 -Auto -Model "openai/gpt-5-mini"
```

**Requisitos:** Variable de entorno `GITHUB_TOKEN` con scopes `models:read` + `repo`.

**Flujo:** Carga screenshots → analiza por pantalla (1 request por screen, 2 imágenes light+dark) →
agrupa hallazgos similares → deduplica contra issues existentes → crea issues CRITICAL/HIGH →
genera reporte markdown.

#### Resultado

**43 hallazgos (7 CRITICAL · 12 HIGH · 14 MEDIUM · 10 LOW) · 5 issues creados en GitHub**

| Issue | Título | Severidad |
|---|---|---|
| [#5](https://github.com/GiulianoTaliano/pill-o-clock/issues/5) | Touch targets below 44×44 pt minimum | CRITICAL |
| [#6](https://github.com/GiulianoTaliano/pill-o-clock/issues/6) | Hardcoded colors break dark mode / WCAG contrast | CRITICAL |
| [#7](https://github.com/GiulianoTaliano/pill-o-clock/issues/7) | Missing empty states on Home, Health, History | CRITICAL |
| [#8](https://github.com/GiulianoTaliano/pill-o-clock/issues/8) | Medication name truncation/overflow | CRITICAL |
| [#9](https://github.com/GiulianoTaliano/pill-o-clock/issues/9) | Button spacing, badge contrast, icon sizes | HIGH |

Labels creados: `ui`, `accessibility`, `visual-bug`

#### S1b — Re-Auditoría con Screenshots Reales (marzo 2026)

Captura verificada (18 PNGs, Pixel 9 1080×2424) + análisis programático WCAG.
Reconciliación de los 43 hallazgos contra código actual (post-S5).

> Nota: `scripts/analyze-screenshots.ps1` fue eliminado en S1c — superseded
> por el agente `@vision-reviewer` que analiza los screenshots directamente.

**Resultado de re-auditoría:** 9 findings FIXED · 9 STILL VALID · 1 issue cerrado (#7) · 1 issue nuevo (#10)

| Issue | Título | Acción |
|---|---|---|
| [#7](https://github.com/GiulianoTaliano/pill-o-clock/issues/7) | Missing empty states | **CERRADO** — resuelto |
| [#10](https://github.com/GiulianoTaliano/pill-o-clock/issues/10) | Muted text WCAG FAIL (2.36:1) | **NUEVO** — confirmado programáticamente |
| #5, #6, #8, #9 | Issues existentes | Actualizados con estado actual |

#### S1c — Auditoría Visual Directa con Claude Vision (marzo 2026)

18 screenshots adjuntados directamente a Copilot Chat para análisis visual por
Claude Opus. Primera auditoría con percepción real de los píxeles renderizados.

**Resultado:** 22 hallazgos (3 CRITICAL · 7 HIGH · 8 MEDIUM · 4 LOW) · 2 issues nuevos · 1 issue actualizado

| Issue | Título | Acción |
|---|---|---|
| [#11](https://github.com/GiulianoTaliano/pill-o-clock/issues/11) | Low contrast: secondary text, chevrons, radio buttons | **NUEVO** |
| [#12](https://github.com/GiulianoTaliano/pill-o-clock/issues/12) | Small targets: onboarding Skip, calendar headers, color picker | **NUEVO** |
| [#9](https://github.com/GiulianoTaliano/pill-o-clock/issues/9) | Dosage scroller sin affordance | **ACTUALIZADO** — elevado a CRITICAL |

**Método vs resultados:** Code (S1a) = 43 hallazgos, Programático (S1b) = validación objetiva,
Vision (S1c) = 22 hallazgos nuevos que solo un ojo humano (o IA visual) detecta. Los tres son complementarios.

### Referencia

→ [docs/vision-review-s1.md](vision-review-s1.md)

---

## S2 — GitHub MCP: Del análisis a la acción

- **Estado:** ✅ Completada
- **Categoría:** DevOps · Productividad · Automatización

### Descripción

Integración del GitHub MCP Server oficial (v0.32.0) con VS Code Copilot Chat,
permitiendo que Claude ejecute acciones sobre el repositorio
`giulianotaliano/pill-o-clock` directamente desde el editor.

### Componentes implementados

| Componente | Ubicación |
|---|---|
| Binary `github-mcp-server` v0.32.0 | `%LOCALAPPDATA%\github-mcp-server\` |
| Configuración MCP | `.vscode/mcp.json` |
| Documentación | `docs/github-mcp-setup.md` |

### Toolsets activos

`default` (repos, issues, PRs, users, copilot context), `actions`,
`code_security`, `labels`, `notifications`

### Capacidades habilitadas

- Crear/leer/buscar issues y PRs
- Crear branches
- Leer archivos del repo remoto
- Gestionar labels
- Ver estado de GitHub Actions
- Revisar alertas de seguridad (Dependabot, code scanning)
- Leer notificaciones de GitHub

### Referencia

→ [docs/github-mcp-setup.md](github-mcp-setup.md)

---

## S3 — Extended Context: Auditoría de seguridad del ciclo de medicación

- **Estado:** ✅ Completada
- **Categoría:** Seguridad · Integridad de datos · Salud del usuario
- **Dependencias:** Ninguna (solo requiere un prompt cuidadosamente diseñado)

### Descripción

Aprovechar la ventana de contexto de 200K tokens de Claude Opus para cargar
**todo el codebase** del proyecto y realizar una auditoría holística del flujo
más crítico de la app: el ciclo de vida de una dosis.

### Por qué es crítico

Una dosis marcada como "tomada" que no se persiste correctamente en la BD (por
race condition, crash durante write, o falla silenciosa del background task)
puede tener **consecuencias reales de salud**: el usuario cree que ya tomó su
medicamento cuando no fue registrado, o no recibe el recordatorio de la
siguiente dosis.

### Flujo a auditar

```
User action (Take/Skip/Snooze)
  → markDoseTaken / markDoseSkipped / snoozeDose (Zustand slice)
    → upsert dose_log (Drizzle/SQLite)
    → update notification_map (SQLite)
    → rescheduleAllNotifications()
      → Android: ExpoAlarm.setAlarm() (AlarmManager)
      → iOS: expo-notifications chain
    → updateWidget()

Background (every 6h):
  closeMissedDoses()
    → initDatabase() (fresh connection)
    → upsert missed dose_logs (30 days back)
    → rescheduleAllNotifications()
```

### Puntos de análisis

| Área | Pregunta clave |
|---|---|
| **Race conditions** | ¿Puede `closeMissedDoses` ejecutarse simultáneamente con `markDoseTaken` y sobreescribir un log? |
| **Transaccionalidad** | ¿El upsert de `dose_log` + `notification_map` + reschedule son atómicos? ¿Qué pasa si la app crashea entre el log y el reschedule? |
| **Idempotencia** | ¿`closeMissedDoses` es idempotente? ¿Qué pasa si corre dos veces en la misma ventana? |
| **Unique constraints** | ¿El `uniqueIndex` en `dose_logs(schedule_id, scheduled_date)` cubre todos los edge cases? ¿Qué pasa con dosis PRN? |
| **Fresh DB connection** | ¿El background task realmente usa una conexión nueva o puede reutilizar un handle stale? |
| **Notification map consistency** | Si una notificación se dispara pero el usuario la descarta sin actuar, ¿el map queda inconsistente? |
| **Stock tracking** | ¿`markDoseTaken` decrementa stock atómicamente con el log? |

### Archivos involucrados (para cargar en contexto)

```
src/store/slices/medications.ts    (~500 lines)
src/db/schema.ts                   (~200 lines)
src/db/database.ts                 (~300 lines)
src/services/notifications.ts      (~600 lines)
src/services/backgroundTask.ts     (~150 lines)
src/hooks/useTodaySchedule.ts      (~150 lines)
src/hooks/useNotificationResponse.ts (~100 lines)
src/types/index.ts                 (~200 lines)
src/utils/index.ts                 (~300 lines)
modules/expo-alarm/src/            (~100 lines)
```

Total estimado: ~2,600 líneas ≈ 8K tokens — muy dentro de los 200K disponibles.

### Entregable

- Documento de hallazgos con severidad (Critical / High / Medium / Low) → [docs/security-audit-s3.md](security-audit-s3.md)
- Para cada hallazgo: descripción, archivo + línea, escenario de reproducción, fix propuesto
- Issues creados via GitHub MCP (S2) para cada hallazgo Critical/High → [#1](https://github.com/GiulianoTaliano/pill-o-clock/issues/1) [#2](https://github.com/GiulianoTaliano/pill-o-clock/issues/2) [#3](https://github.com/GiulianoTaliano/pill-o-clock/issues/3) [#4](https://github.com/GiulianoTaliano/pill-o-clock/issues/4)
- **Resultado:** 7 hallazgos (1 CRITICAL · 3 HIGH · 1 MEDIUM · 2 LOW) · 6 corregidos en código · 22/22 tests verdes

---

## S4 — Generación de tests con Extended Thinking

- **Estado:** ✅ Completada
- **Categoría:** Testing · Deuda técnica · Confiabilidad
- **Dependencias:** S3 recomendada primero (los hallazgos informan qué testear)

### Descripción

Usar Claude con extended thinking para generar una suite completa de tests,
partiendo de la cobertura actual (prácticamente cero — solo
`__tests__/utils.test.ts` con tests de utilidades básicas).

### Prioridad de cobertura

| Prioridad | Target | Framework | Razón |
|---|---|---|---|
| 🔴 **P0** | Zustand slices (`markDoseTaken`, `markDoseSkipped`, `snoozeDose`, `revertDose`) | Jest + mock store | Flujo crítico de salud — cada action path debe estar cubierto |
| 🔴 **P0** | `closeMissedDoses` (background task) | Jest + mock DB | Debe ser idempotente y manejar edge cases de fechas |
| 🟡 **P1** | `useTodaySchedule` hook | `@testing-library/react-native` | Lógica compleja de agrupación pending/missed/done + sorting |
| 🟡 **P1** | `rescheduleAllNotifications` | Jest + mock notification API | Verificar que no excede el cap de 64 notificaciones en iOS |
| 🟡 **P1** | CRUD operations (medications, appointments, health) | Jest + mock DB | Validar integridad referencial con schedules y logs |
| 🟢 **P2** | `DoseCard` component | Snapshot + interaction tests | Verificar status rendering + action handlers |
| 🟢 **P2** | `MedicationForm` component | `@testing-library/react-native` | Validación de campos, schedule creation, edit mode |
| 🟢 **P2** | `useNotificationResponse` hook | Jest + mock | Verificar routing correcto de TAKEN/SNOOZE/SKIP actions |
| 🟢 **P3** | Backup/restore (`backup.ts`) | Jest | Round-trip: export → import → verify data integrity |
| 🟢 **P3** | Utility functions | Jest | Expandir `utils.test.ts` con edge cases de `isScheduleActiveOnDate`, `getNextDates` |

### Infraestructura de testing a configurar

- [x] Configurar mocks globales para `expo-sqlite`, `expo-notifications`,
      `expo-haptics`, `react-native-mmkv`
- [x] Crear factory helpers para generar datos de test (medications, schedules,
      dose_logs) con UUIDs determinísticos
- [x] Configurar coverage reporting (`jest --coverage`) y threshold mínimo
- [x] Agregar script `test:coverage` en `package.json`

### Entregable

- Suite de tests organizados en `__tests__/` con estructura mirror del `src/`
- Mocks compartidos en `__mocks__/` (root) y `jest.setup.ts`
- Coverage report con threshold ≥ 70% en paths críticos (P0)
- CI integration via GitHub Actions (complementa S2)
- Documentación detallada → [docs/unit-tests-s4.md](unit-tests-s4.md)

### Resultado

**126 tests · 5 suites · exit code 0 · todos los umbrales ≥ 70% superados**

| Archivo | Cobertura de líneas | Estado |
|---|---|---|
| `src/hooks/useTodaySchedule.ts` | **100 %** | ✅ |
| `src/utils/index.ts` | **90.9 %** | ✅ |
| `src/services/backgroundTask.ts` | **83.3 %** | ✅ |
| `src/store/slices/medications.ts` | **78.5 %** | ✅ |

#### Infraestructura implementada

| Archivo | Propósito |
|---|---|
| `__mocks__/react-native-mmkv.js` | Mock automático para MMKV (in-memory Map por instancia) |
| `jest.setup.ts` | Mocks globales: Sentry, haptics, TaskManager, BackgroundFetch, StoreReview, expo-notifications, expo-alarm |
| `jest.config.js` | `testMatch` para `*.test.*`, `setupFilesAfterEnv`, coverage config, `forceExit` |
| `package.json` | Script `test:coverage` |

#### Tests por suite

| Suite | Archivo | Tests | Prioridad |
|---|---|---|---|
| `markDose / revertDose / snoozeDose` | `__tests__/store/markDose.test.ts` | 18 | P0 |
| `medications CRUD + review` | `__tests__/store/medicationsSlice.test.ts` | 22 | P0 |
| `closeMissedDoses + registration` | `__tests__/backgroundTask.test.ts` | 28 | P0 |
| `useTodaySchedule hook` | `__tests__/hooks/useTodaySchedule.test.tsx` | 27 | P1 |
| `utils edge cases` | `__tests__/utils.test.ts` (ampliado) | 31 | P3 |

#### Puntos cubiertos de los hallazgos de S3

- ✅ `markDoseTaken` / `markDoseSkipped` — todos los path de stock y skipReason
- ✅ `revertDose` — eliminación de log + re-schedule de notificación
- ✅ `snoozeDose` — acumulación de snooze antes y después de la hora original
- ✅ `closeMissedDoses` — idempotencia, bounds de fecha, meds/schedules inactivos
- ✅ `isScheduleActiveOnDate` — todos los edge cases incluyendo startDate/endDate boundaries
- ✅ `registerBackgroundFetch` / `unregisterBackgroundFetch` — status Restricted/Denied, ya registrado, error handling

#### Revisión Opus

Post-generación (Sonnet), revisión con Opus corrigió 5 problemas:

1. Test no-determinístico en `revertDose` (faltaban fake timers + aserción duplicada)
2. Variable muerta con `undefined as any` overrides
3. `makeTestStore` recibía array en vez de `Record` — spread incorrecto (2 sitios)
4. `import React` innecesario (automatic JSX runtime en Expo 54)
5. Factories duplicadas en `utils.test.ts` — reemplazadas por import compartido

Detalle completo → [docs/unit-tests-s4.md § Revisión Opus](unit-tests-s4.md#10-revisión-opus)

### Referencia

→ [docs/unit-tests-s4.md](unit-tests-s4.md)

---

## S5 — Agentic Refactoring: MedicationForm

- **Estado:** ✅ Completada
- **Categoría:** Deuda técnica · DX · Mantenibilidad
- **Dependencias:** S4 recomendada primero (tener tests antes de refactorizar)

### Descripción

`MedicationForm.tsx` es el componente más complejo de la app. Actualmente usa
`useState` manual + validación imperativa, a pesar de que `react-hook-form` v7
y `zod` v4 **ya están instalados** en el proyecto (aparecen en `package.json`).

Claude en modo agente puede realizar este refactor de principio a fin sin
supervisión, dado que es una transformación mecánica con reglas claras.

### Estado actual del componente

| Aspecto | Actual | Target |
|---|---|---|
| State management | ~20 `useState` individuales | `useForm<MedicationFormData>()` con un solo objeto |
| Validación | Imperativa en `handleSave` con `Alert.alert` | Schema Zod declarativo + errores inline |
| Error display | Alertas nativas (bloqueantes, mala UX) | Mensajes inline bajo cada campo |
| Schedule management | Array manual con `push`/`splice` | `useFieldArray` de react-hook-form |
| Type safety | Props tipadas pero state suelto | Schema Zod infiere tipos automáticamente |
| Testabilidad | Muy difícil (state distribuido) | Fácil (schema Zod testeable en aislamiento) |

### Plan de refactoring

1. **Definir Zod schema** — Crear `src/types/medicationFormSchema.ts` con:
   - Campos base (name, dosage, unit, category, color, notes, photo)
   - Schedule array (times + weekdays o daily)
   - Condicionales (PRN no require schedules; stock fields opcionales)
   - Custom refinements (al menos 1 schedule si no es PRN, hora válida, etc.)

2. **Migrar a `useForm`** — Reemplazar los ~20 `useState` con:
   ```ts
   const form = useForm<MedicationFormData>({
     resolver: zodResolver(medicationFormSchema),
     defaultValues: existingMedication ?? defaults,
   });
   ```

3. **Migrar schedules a `useFieldArray`** — Reemplazar manipulación manual del
   array de schedules:
   ```ts
   const { fields, append, remove } = useFieldArray({
     control: form.control,
     name: "schedules",
   });
   ```

4. **Errores inline** — Reemplazar `Alert.alert` con `<Text>` de error bajo
   cada campo, usando `form.formState.errors`.

5. **Preservar UX** — Mantener exactamente la misma apariencia visual
   (NativeWind classes, color picker, day toggles). Solo cambia el wiring
   interno.

### Archivos afectados

| Archivo | Cambio |
|---|---|
| `components/MedicationForm.tsx` | Refactor principal |
| `src/types/medicationFormSchema.ts` | Nuevo — Zod schema |
| `app/medication/new.tsx` | Ajustar props si cambian |
| `app/medication/[id].tsx` | Ajustar props si cambian |

### Entregable

- `MedicationForm` migrado a `react-hook-form` + Zod
- Zero regresiones visuales (verificado manualmente + tests S4)
- Reducción del ~40% en líneas de código del componente

### Implementación (marzo 2026)

Refactor ejecutado por Claude en modo agente. El componente ya tenía una
migración parcial (`useForm` + `Controller` + Zod schema). Se completó:

1. **`useFieldArray`** — Schedules migrado de `watch`/`setValue` manual a
   `useFieldArray({ control, name: "schedules" })` con `append`/`remove`.
   Eliminadas las funciones que manipulaban el array por índice.

2. **Inline errors** — Componente `FieldError` que renderiza `<Text>` rojo
   bajo los campos name, dosageAmount y endDate usando
   `formState.errors`. El toast de primer error se mantiene como fallback
   de visibilidad.

3. **Zod schema tests** — 22 tests unitarios en
   `__tests__/schemas/medicationSchema.test.ts` cubriendo:
   - Happy path (repeat, once, PRN)
   - Validaciones de name, dosage, schedules, date range
   - Enums inválidos (dosageUnit, category, repeatMode)
   - Campos opcionales y defaults

4. **Zero regresiones** — 148/148 tests pasan (6 suites).

#### Archivos modificados

| Archivo | Cambio |
|---|---|
| `components/MedicationForm.tsx` | `useFieldArray` + `FieldError` inline |
| `src/schemas/medication.ts` | Sin cambios (ya existía) |
| `__tests__/schemas/medicationSchema.test.ts` | Nuevo — 22 tests |
| `app/medication/new.tsx` | Sin cambios (interfaz `MedicationFormValues` no cambió) |
| `app/medication/[id].tsx` | Sin cambios |

---

## S6 — Multilingüe con verificación de contexto médico

- **Estado:** ⬚ Pendiente
- **Categoría:** i18n · UX · Correctitud médica
- **Dependencias:** Ninguna

### Descripción

Usar Claude para expandir el soporte multilingüe y auditar la terminología
médica existente en español e inglés. La app maneja términos farmacéuticos
que deben ser precisos — un error de traducción en una app de medicación puede
tener consecuencias reales.

### Alcance

#### Fase 1 — Auditoría de traducciones existentes

| Verificación | Detalle |
|---|---|
| **Terminología médica** | ¿"antibiótico", "analgésico", "antihipertensivo" son los términos correctos y completos en ambos idiomas? |
| **Consistencia** | ¿Se usa el mismo término para el mismo concepto en toda la app? (e.g., "dosis" vs "toma" vs "pastilla") |
| **Strings hardcodeados** | Buscar textos que no pasen por `i18n` (grep por strings literales en componentes) |
| **Pluralización** | Verificar manejo correcto de plurales en ambos idiomas |
| **Formato de fechas/horas** | ¿Se respeta el locale del usuario? |

#### Fase 2 — Nuevos idiomas

| Idioma | Prioridad | Razón |
|---|---|---|
| Portugués (PT-BR) | Alta | Mercado grande, proximidad lingüística con ES |
| Francés | Media | Amplia base de usuarios mayores en países francófonos |
| Alemán | Media | Mercado farmacéutico fuerte en DACH |
| Italiano | Baja | Comunidad más pequeña pero relevante |

#### Fase 3 — Validación de contexto médico

Para cada idioma, Claude verifica:
- Nombres genéricos de categorías de medicamentos
- Unidades de medida (mg, ml, gotas, etc.)
- Instrucciones de dosificación
- Terminología de mediciones de salud (presión arterial, glucosa, SpO₂)
- Razones de skip ("olvidé", "efecto secundario", "sin stock")

### Estructura i18n actual

```
src/i18n/
  es.ts    → Fuente (defines TranslationShape)
  en.ts    → Traducción (implements TranslationShape)
  index.ts → Configuración i18next
```

Para nuevos idiomas se creará:
```
src/i18n/
  pt.ts    → Portugués
  fr.ts    → Francés
  de.ts    → Alemán
```

### Entregable

- Reporte de auditoría de traducciones ES/EN
- Fix de inconsistencias encontradas
- Al menos 1 nuevo idioma (PT-BR) completamente traducido y verificado
- Tests de snapshot para cada locale (complementa S4)

---

## S7 — Análisis de arquitectura de notificaciones (Extended Thinking)

- **Estado:** ⬚ Pendiente
- **Categoría:** Arquitectura · Confiabilidad · iOS parity
- **Dependencias:** S3 (los hallazgos de seguridad informan el rediseño)

### Descripción

El sistema de notificaciones dual (Android: AlarmManager, iOS: chained
expo-notifications) es la pieza más compleja del proyecto. Claude con extended
thinking puede modelar todos los edge cases y diseñar las mejoras necesarias
para alcanzar paridad iOS y robustez total.

### Estado actual

| Aspecto | Android | iOS |
|---|---|---|
| Alarma persistente | ✅ AlarmManager.setAlarmClock | ❌ Solo banner |
| Quick actions (Take/Snooze/Skip) | ✅ Desde notificación | ❌ No implementado |
| Above lock screen | ✅ AlarmActivity fullscreen | ❌ No posible sin Critical Alerts |
| Horizonte de scheduling | 7 días | 3 días (cap de 64 notificaciones) |
| Background reschedule | ✅ BackgroundFetch cada 6h | ⚠️ Unreliable (iOS throttle) |
| Reschedule on foreground | ✅ AppState listener | ✅ AppState listener (primary mechanism) |
| Sonido repetitivo | ✅ Cada 5 min hasta respuesta | ❌ Sonido único |

### Análisis requerido

1. **Modelar edge cases de ambas plataformas:**
   - App killed por el OS → ¿se pierden notificaciones?
   - Dispositivo reiniciado → ¿AlarmManager re-registra? ¿iOS?
   - Modo avión → ¿afecta el scheduling?
   - Low battery / Doze mode → ¿latencia de entrega?
   - Cambio de timezone → ¿las dosis se adaptan?

2. **Diseñar quick actions para iOS:**
   - Definir `UNNotificationCategory` con actions Take/Snooze/Skip
   - Manejar la respuesta via `expo-notifications` response listener
   - Diseñar el fallback para cuando el usuario no interactúa

3. **Planificar Critical Alerts (iOS):**
   - Documentación para solicitud a Apple (justificación médica)
   - Diseño de la UX de alarma sin fullscreen (iOS no permite AlarmActivity)
   - Fallback si Apple deniega el entitlement

4. **Optimizar scheduling iOS:**
   - Estrategia para mantenerse bajo el cap de 64 notificaciones
   - Priorización: ¿qué dosis se schedulean primero si hay más de 64?
   - Rolling window vs fixed window

### Entregable

- Documento de arquitectura de notificaciones v2
- Diagrama de flujo para cada plataforma (Mermaid)
- Spec de implementación de quick actions iOS
- Borrador de solicitud de Critical Alerts para Apple
- Issues desglosados en GitHub (via S2)

---

## S8 — Health Connect / Apple Health Integration

- **Estado:** ⬚ Pendiente
- **Categoría:** Feature · Interoperabilidad · Roadmap v1.4
- **Dependencias:** S3 y S4 recomendadas primero

### Descripción

Conectar los datos de salud de Pill O-Clock con las plataformas de salud
nativas: **Health Connect** (Android) y **HealthKit** (iOS). Esto permite
que los datos de mediciones (presión arterial, glucosa, peso, SpO₂, frecuencia
cardíaca) fluyan bidireccionalmente.

### Mapeo de datos

| Tipo en Pill O-Clock | Health Connect (Android) | HealthKit (iOS) |
|---|---|---|
| `blood_pressure` | `BloodPressureRecord` | `HKQuantityType.bloodPressureSystolic/Diastolic` |
| `glucose` | `BloodGlucoseRecord` | `HKQuantityType.bloodGlucose` |
| `weight` | `WeightRecord` | `HKQuantityType.bodyMass` |
| `oxygen` (SpO₂) | `OxygenSaturationRecord` | `HKQuantityType.oxygenSaturation` |
| `heart_rate` | `HeartRateRecord` | `HKQuantityType.heartRate` |
| Medication adherence | `PlannedDose` / `DrugOrderRecord` (si disponible) | `HKCategoryType.medicationRecord` (iOS 16+) |

### Plan de implementación

#### Fase 1 — Lectura (import)

1. **Solicitar permisos** de lectura al usuario (opt-in explícito)
2. **Leer mediciones** de Health Connect / HealthKit
3. **Importar** a la tabla `health_measurements` existente, deduplicando por
   timestamp + tipo
4. **UI:** Botón "Sincronizar desde [Health Connect/Salud]" en la pantalla Health

#### Fase 2 — Escritura (export)

1. **Solicitar permisos** de escritura
2. **Exportar mediciones** registradas en Pill O-Clock a la plataforma nativa
3. **Exportar adherencia** de medicación (cuando la API lo soporte)
4. **UI:** Toggle "Auto-sync" en Settings

#### Fase 3 — Sync continuo

1. **Observer/listener** para cambios en Health Connect / HealthKit
2. **Background sync** integrado con el BackgroundFetch existente
3. **Resolución de conflictos** por timestamp (último gana)

### Librerías candidatas

| Librería | Plataforma | Notas |
|---|---|---|
| `react-native-health-connect` | Android | API moderna (Android 14+), reemplaza Google Fit |
| `react-native-health` | iOS | Wrapper maduro para HealthKit |
| `expo-health` | Ambas | En desarrollo — monitorear si Expo lo publica oficialmente |

### Consideraciones de privacidad

- **Opt-in explícito** — Nunca solicitar permisos sin que el usuario lo pida
- **Granularidad** — Permitir elegir qué tipos de datos sincronizar
- **Sin cloud** — Los datos fluyen device-local entre Pill O-Clock y la
  plataforma de salud. No hay servidor intermedio
- **Revocable** — El usuario puede desconectar en cualquier momento desde Settings

### Entregable

- Módulo de integración Health Connect (Android)
- Módulo de integración HealthKit (iOS)
- UI de configuración en Settings
- Tests de integración por plataforma

---

## S9 — Custom Copilot Instructions

- **Estado:** ✅ Completada
- **Categoría:** DX · Productividad · Consistencia de código

### Descripción

Archivo `.github/copilot-instructions.md` que provee contexto específico del
proyecto a Copilot en cada interacción, mejorando la precisión de las respuestas
y asegurando que el código generado siga las convenciones del proyecto.

### Contenido implementado

| Sección | Qué cubre |
|---|---|
| Project overview | Stack, filosofía privacy-first, audiencia |
| File naming | Convenciones PascalCase/camelCase por tipo |
| Components | Function exports, props typing, hooks order, handlers |
| NativeWind | `className` vs `style`, semantic tokens, dark mode |
| Zustand store | Slice pattern, `StateCreator` typing, selector rules |
| Database | Drizzle conventions, column naming, UUID PKs, booleans, dates |
| Types | `interface` vs `type`, union literals, Omit patterns |
| i18n | Key structure, ES source → EN translation |
| Import order | React → third-party → internal → siblings → type-only |
| Error handling | try/catch + cleanup, no custom error classes |
| Architecture | Directory map, module structure |
| Critical paths | Dose lifecycle, notifications, background task, migrations |

### Referencia

→ `.github/copilot-instructions.md`

---

## Orden de ejecución recomendado

```
S9 ✅  Custom Copilot Instructions
 │
S2 ✅  GitHub MCP
 │
S3 ✅  Auditoría de seguridad ────────→ informa hallazgos para S4 y S7
 │
S4 ✅  Generación de tests ────────→ cobertura mínima antes de refactorizar
 │
S5 ⬚   Refactoring MedicationForm
 │
S1 ✅  Vision UI review ─────────→ puede ejecutarse en paralelo con S6
 │
S6 ⬚   Multilingüe + médico
 │
S7 ⬚   Arquitectura de notificaciones ──→ requiere hallazgos de S3
 │
S8 ⬚   Health Connect / Apple Health ───→ feature grande, al final
```

### Justificación del orden

1. **S9 → S2** (completadas): Infraestructura base — todas las demás skills se
   benefician de copilot instructions precisas y la capacidad de crear
   issues/PRs automáticamente.

2. **S3 (auditoría de seguridad)**: Antes de escribir tests o refactorizar,
   necesitamos saber qué bugs existen en el flujo crítico. Los hallazgos de
   esta auditoría alimentan directamente S4 (qué testear) y S7 (qué rediseñar).

3. **S4 (tests)**: La mayor deuda técnica del proyecto. Sin tests, cualquier
   cambio posterior (S5, S7, S8) es riesgoso. Esta skill crea la red de
   seguridad necesaria.

4. **S5 (MedicationForm)**: Refactoring aislado a un solo componente. Con los
   tests de S4 ya en su lugar, podemos refactorizar con confianza.

5. **S1 (Vision)** y **S6 (Multilingüe)**: Pueden ejecutarse en paralelo ya
   que son independientes entre sí. Ambas mejoran la calidad del producto sin
   afectar la arquitectura.

6. **S7 (Notificaciones)**: Requiere los hallazgos de S3 y es un cambio
   arquitectónico profundo. Mejor hacerlo con tests ya existentes.

7. **S8 (Health Connect)**: Feature nueva más grande y con dependencias
   externas (APIs de plataforma). Se ejecuta al final cuando la app está
   estable y bien testeada.

---

## Changelog

| Fecha | Cambio |
|---|---|
| 2026-03-14 | Documento creado con 9 skills. S2 y S9 marcadas como completadas. |
| 2026-03-14 | S1 Vision UI Review completada. 43 hallazgos, 5 issues, 3 scripts, 3 labels. |
