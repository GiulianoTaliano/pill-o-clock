# Unit Tests S4 — Generación de Tests

> **Revisión:** marzo 2026
> **Metodología:** Extended Thinking — generación completa de suite de tests a partir de cobertura cero
> **Estado final:** 126 tests · 5 suites · exit code 0 · todos los umbrales ≥ 70 %
> **Revisión Opus:** Correcciones aplicadas post-generación (ver [§ Revisión](#revisión-opus))

---

## Índice

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Infraestructura](#2-infraestructura)
3. [Factories](#3-factories)
4. [Suite 1 — markDose / revertDose / snoozeDose](#4-suite-1--markdose--revertdose--snoozedose)
5. [Suite 2 — medications CRUD + store-review](#5-suite-2--medications-crud--store-review)
6. [Suite 3 — closeMissedDoses + registration](#6-suite-3--closemisseddoses--registration)
7. [Suite 4 — useTodaySchedule hook](#7-suite-4--usetodayschedule-hook)
8. [Suite 5 — utils](#8-suite-5--utils)
9. [Cobertura](#9-cobertura)
10. [Revisión Opus](#10-revisión-opus)
11. [Trabajo futuro](#11-trabajo-futuro)

---

## 1. Resumen ejecutivo

Antes de S4, el proyecto contaba con un único archivo de tests
(`__tests__/utils.test.ts`) que cubría funciones puras básicas. No existía
infraestructura de mocking, factories de datos, ni cobertura sobre los flujos
críticos de salud del usuario (marcar dosis, cerrar dosis perdidas, resolver
estado del día).

S4 construyó desde cero:

- **Infraestructura global** de mocks para todos los módulos nativos
- **Factories determinísticas** para los 4 tipos de dominio principales
- **5 suites de tests** cubriendo prioridades P0, P1 y P3
- **Umbrales de cobertura** configurados y aplicados en `jest.config.js`

---

## 2. Infraestructura

### 2.1 jest.config.js

```
Ruta: jest.config.js
```

| Configuración | Valor | Razón |
|---|---|---|
| `preset` | `jest-expo` | Soporte React Native + Expo |
| `testMatch` | `["**/?(*.)+(spec\|test).[jt]s?(x)"]` | Excluir helpers como `factories.ts` del descubrimiento de tests |
| `setupFilesAfterEnv` | `["<rootDir>/jest.setup.ts"]` | Cargar mocks globales antes de cada suite |
| `collectCoverageFrom` | 4 archivos P0/P1 | Focalizar reporte de cobertura en paths críticos |
| `coverageThreshold` | `{ lines: 70 }` por archivo | Umbral mínimo obligatorio |
| `coverageReporters` | `["text", "lcov", "json-summary"]` | Texto en terminal + HTML vía lcov + JSON para CI |
| `forceExit` | `true` | Evitar hang por timers internos del scheduler de React Native |

### 2.2 jest.setup.ts

```
Ruta: jest.setup.ts
```

Mocks globales registrados (ejecutados antes de cada suite):

| Módulo | Tipo de mock | Notas |
|---|---|---|
| `@sentry/react-native` | `jest.fn()` | `captureException`, `captureMessage`, `init`, `wrap` |
| `expo-haptics` | `jest.fn().mockResolvedValue(undefined)` | Todos los métodos + enums de feedback |
| `expo-task-manager` | `jest.fn()` | `defineTask`, `isTaskRegisteredAsync`, `getRegisteredTasksAsync` |
| `expo-background-fetch` | `jest.fn()` + objetos enum | `BackgroundFetchStatus` y `BackgroundFetchResult` replicados |
| `expo-store-review` | `jest.fn()` | `isAvailableAsync` → `false` por defecto, `requestReview` |
| `expo-notifications` | `jest.fn()` | Scheduling, cancelación, permisos, listeners, handler, enums |
| `expo-alarm` | `jest.fn()` | `setAlarm`, `cancelAlarm`, `cancelAllAlarms` |
| `expo-device` | Objeto literal | `osName: "Android"`, `osVersion: "14"`, `isDevice: true` |
| `react-native-mmkv` | Delegado a `__mocks__/` | Referencia explícita `jest.mock("react-native-mmkv")` |

### 2.3 \_\_mocks\_\_/react-native-mmkv.js

```
Ruta: __mocks__/react-native-mmkv.js
```

Mock manual ubicado en la raíz para que Jest lo resuelva automáticamente para
`node_modules/react-native-mmkv`. Cada llamada a `createMMKV()` o `new MMKV()`
retorna una instancia aislada respaldada por un `Map` en memoria.

Métodos soportados: `getString`, `set`, `delete`, `contains`, `clearAll`,
`getAllKeys`.

### 2.4 package.json

Script agregado:

```json
"test:coverage": "jest --coverage"
```

---

## 3. Factories

```
Ruta: __tests__/factories.ts
```

Factories determinísticas para los 4 tipos de dominio:

| Factory | Tipo | ID por defecto | Campos clave |
|---|---|---|---|
| `makeMedication(overrides?)` | `Medication` | `med-1` | `name: "Ibuprofen"`, `dosageAmount: 400`, `dosageUnit: "mg"`, `category: "analgesico"` |
| `makeSchedule(overrides?)` | `Schedule` | `sch-1` | `medicationId: "med-1"`, `time: "08:00"`, `days: []` (daily) |
| `makeDoseLog(overrides?)` | `DoseLog` | `log-1` | `status: "taken"`, `scheduledDate: "2025-06-16"`, `takenAt: ISO` |
| `makeTodayDose(overrides?)` | `TodayDose` | — | Compone `makeMedication()` + `makeSchedule()`, `status: "pending"` |

Todas aceptan `Partial<T>` para sobreescrituras por caso de test. Los IDs
determinísticos (`med-1`, `sch-1`, `log-1`) simplifican aserciones sin depender
de `generateId()`.

---

## 4. Suite 1 — markDose / revertDose / snoozeDose

```
Ruta: __tests__/store/markDose.test.ts
Prioridad: P0
Tests: 18
```

### Estrategia

Importa directamente `createMedicationsSlice` y lo monta en un store Zustand
mínimo vía `create()`. Todos los módulos externos (DB, notifications, storage)
están mockeados. El store incluye stubs para `todayLogs`, `loadTodayLogs` y
`snoozedTimes` que la slice espera del store padre.

### Cobertura de tests

#### markDose — taken (11 tests)

| # | Test | Qué verifica |
|---|---|---|
| 1 | persists a dose log with status 'taken' | `upsertDoseLog` llamado con `status: "taken"`, IDs y fecha correctos |
| 2 | sets snoozedUntil as the scheduledTime when dose was snoozed | Dosis con `snoozedUntil: "08:30"` usa esa hora como `scheduledTime` |
| 3 | cancels the pending dose notification | `cancelDoseNotifications("sch-1", "2025-06-16")` |
| 4 | removes the dose key from snoozedTimes | Clave `"sch-1-2025-06-16"` eliminada; otras claves preservadas |
| 5 | calls loadTodayLogs after persisting | Recarga del estado post-acción |
| 6 | does NOT decrement stock when stockQuantity is undefined | `updateMedicationStock` no llamado |
| 7 | decrements stock by 1 when stockQuantity is set | `updateMedicationStock("med-1", 9)` para stock inicial 10 |
| 8 | does NOT decrement stock when stockQuantity is 0 | Edge case: stock ya agotado |
| 9 | fires stockAlert when stock drops below threshold | `scheduleStockAlert` llamado con stock actualizado |
| 10 | does NOT fire stockAlert when stock stays at or above threshold | Umbral no superado → sin alerta |

#### markDose — skipped (3 tests)

| # | Test | Qué verifica |
|---|---|---|
| 11 | persists a log with status 'skipped' and the skipReason | `status: "skipped"`, `skipReason: "forgot"`, `takenAt: undefined` |
| 12 | preserves all skipReason values | Itera `["forgot", "side_effect", "no_stock", "other"]` |
| 13 | does NOT decrement stock when skipped | Skip nunca decrementa stock |

#### revertDose (4 tests)

| # | Test | Qué verifica |
|---|---|---|
| 14 | deletes the dose log from the database | `deleteDoseLog("sch-1", "2025-06-16")` |
| 15 | calls loadTodayLogs after reverting | Recarga post-revert |
| 16 | clears the snoozedTimes key for the reverted dose | Limpieza de snooze state |
| 17 | reschedules notifications for future dates after deletion | Fake timers a 07:00 (schedule 08:00 es futuro) → `scheduleDoseChain` llamado |

#### snoozeDose (4 tests)

| # | Test | Qué verifica |
|---|---|---|
| 18 | updates snoozedTimes when dose is snoozed before its scheduled time | 08:00 + 15 min → `"08:15"` |
| 19 | updates snoozedTimes when dose is snoozed after its scheduled time | now (09:00) + 15 min → `"09:15"` |
| 20 | calls the notification snoozeDose function | `notifs.snoozeDose` invocado |
| 21 | stacks snoozes: second snooze is based on the first snoozed time | 08:15 + 15 → `"08:30"` |

> **Nota:** La numeración es continua para referencia, pero el archivo tiene 18
> tests porque los `describe` bloques agrupan lógicamente.

---

## 5. Suite 2 — medications CRUD + store-review

```
Ruta: __tests__/store/medicationsSlice.test.ts
Prioridad: P0
Tests: 22
```

### Estrategia

Mismo patrón que Suite 1 (`create()` + slice), pero el `makeTestStore` acepta
un `Record<string, unknown>` para inyectar estado inicial arbitrario
(e.g., `{ medications: [...], schedules: [...] }`).

### Cobertura de tests

#### addMedication (4 tests)

| Test | Qué verifica |
|---|---|
| inserts the medication and its schedules into the DB | `insertMedication` × 1, `insertSchedule` × 1 |
| returns the newly created medication with generated id and timestamps | `id`, `isActive = true`, `createdAt` definidos |
| handles multiple schedules | `insertSchedule` × 2 para 2 inputs |
| reloads medications and schedules after insertion | Estado del store actualizado post-insert |

#### deleteMedication (2 tests)

| Test | Qué verifica |
|---|---|
| cancels notifications and deletes from the DB | `cancelScheduleNotifications` + `deleteMedication` |
| reloads state after deletion | `getMedications` llamado |

#### updateDoseNote (1 test)

| Test | Qué verifica |
|---|---|
| updates the note in the DB and reloads logs | `updateDoseLogNotes` + `loadTodayLogs` |

#### revertSnooze (3 tests)

| Test | Qué verifica |
|---|---|
| cancels the snoozed notification and removes the key from snoozedTimes | `cancelDoseNotifications` + state cleanup |
| reschedules the notification if original time is in the future | Fake timers 07:00 → `scheduleDoseChain` llamado |
| does NOT reschedule if original time has already passed | Fake timers 10:00 → sin reschedule |

#### logPRNDose (4 tests)

| Test | Qué verifica |
|---|---|
| persists a 'taken' log for the PRN medication | `upsertDoseLog` con `status: "taken"` |
| PRN scheduleId is unique per call | Dos llamadas → IDs distintos |
| decrements PRN medication stock | `updateMedicationStock("med-1", 4)` |
| calls loadTodayLogs after logging | Recarga post-log |

#### getHistoryLogs (1 test)

| Test | Qué verifica |
|---|---|
| delegates to getDoseLogsByDateRange with the given date range | Pass-through correcto de `from` y `to` |

#### getSchedulesForMedication (2 tests)

| Test | Qué verifica |
|---|---|
| returns schedules matching the given medicationId | Filtra correctamente por `medicationId` |
| returns empty array when medication has no schedules | Array vacío, no `undefined` |

#### markDose — store-review prompt (3 tests)

| Test | Qué verifica |
|---|---|
| triggers StoreReview when all conditions are met | count ≥ 10, days ≥ 7, not prompted → `requestReview()` |
| does NOT trigger StoreReview when count < 10 | count = 6 → no review |
| does NOT trigger StoreReview when review was already prompted | `REVIEW_PROMPTED = "1"` → bypass |

---

## 6. Suite 3 — closeMissedDoses + registration

```
Ruta: __tests__/backgroundTask.test.ts
Prioridad: P0
Tests: 28
```

### Estrategia

Fake timers fijados globalmente a **Monday June 16, 2025 10:00 AM**.
Constantes derivadas:

- `YESTERDAY` = `2025-06-15`
- `CUTOFF` = `2025-05-17` (30 días atrás)
- `EXPECTED_DAYS` = 30 (de cutoff a yesterday inclusive)

DB completamente mockeada (`getMedications`, `getAllSchedules`,
`getDoseLogsByDateRange`, `insertMissedDoseLogSafe`).

### Cobertura de tests

#### Basic insertion (6 tests)

| Test | Qué verifica |
|---|---|
| inserts a missed log for every day in the 30-day window | Exactamente 30 llamadas a `insertMissedDoseLogSafe` |
| creates logs with status 'missed' | Todos los logs insertados tienen `status: "missed"` |
| creates logs with the schedule's time as scheduledTime | `scheduledTime: "14:30"` propagado |
| does NOT insert a log for today | Ningún `scheduledDate` es `"2025-06-16"` |
| does NOT insert a log for future dates | Todos los `scheduledDate ≤ today` |
| covers date range from cutoff to yesterday inclusive | Primer log: `CUTOFF`, último: `YESTERDAY` |

#### Idempotency (2 tests)

| Test | Qué verifica |
|---|---|
| does not insert when all days already have a 'missed' log | 0 llamadas cuando logs completos existen |
| only inserts logs for days that are missing | 29 llamadas (30 - 1 existente); fecha existente excluida |

#### Inactive medications and schedules (4 tests)

| Test | Qué verifica |
|---|---|
| skips days for inactive medications | `isActive: false` → 0 inserts |
| skips days for inactive schedules | `isActive: false` → 0 inserts |
| produces no calls when there are no medications | Array vacío → 0 inserts |
| produces no calls when there are no schedules | Array vacío → 0 inserts |

#### Date-bound medications (2 tests)

| Test | Qué verifica |
|---|---|
| skips days before the medication's startDate | `startDate: "2025-06-01"` → solo 15 logs (Jun 1–15) |
| skips days after the medication's endDate | `endDate: "2025-05-31"` → solo 15 logs (May 17–31) |

#### Day-of-week schedules (1 test)

| Test | Qué verifica |
|---|---|
| only inserts logs for days that match the schedule's days array | `days: [1]` (Monday) → solo lunes insertados (4–5 en el rango) |

#### registerBackgroundFetch (5 tests)

| Test | Qué verifica |
|---|---|
| registers the task when available and not yet registered | Status Available + no registrado → `registerTaskAsync` × 1 |
| does not re-register when the task is already registered | Ya registrado → 0 llamadas |
| skips registration when status is Restricted | Status 1 → 0 llamadas |
| skips registration when status is Denied | Status 2 → 0 llamadas |
| handles errors without throwing | `getStatusAsync` throws → no crash, `resolves.toBeUndefined()` |

#### unregisterBackgroundFetch (3 tests)

| Test | Qué verifica |
|---|---|
| unregisters the task when it is registered | Registrado → `unregisterTaskAsync` × 1 |
| does nothing when task is not registered | No registrado → 0 llamadas |
| handles errors without throwing | Error → no crash |

---

## 7. Suite 4 — useTodaySchedule hook

```
Ruta: __tests__/hooks/useTodaySchedule.test.tsx
Prioridad: P1
Tests: 27
```

### Estrategia

El store completo de Zustand está mockeado:

```ts
jest.mock("../../src/store", () => ({ useAppStore: jest.fn() }));
```

Un helper `mockStore(state)` configura `useAppStore` para que cualquier
selector reciba el estado provisto. Fake timers fijados a **Monday June 16,
2025 10:00 AM**. `renderHook` de `@testing-library/react-native` monta el hook
en un contexto React.

### Cobertura de tests

#### Empty state (3 tests)

| Test | Qué verifica |
|---|---|
| returns an empty array when there are no medications | Sin datos → `[]` |
| returns an empty array when the medication has no schedules | Medication sin schedule → `[]` |
| returns an empty array when all medications are inactive | `isActive: false` → `[]` |

#### Status resolution — today, no log (2 tests)

| Test | Qué verifica |
|---|---|
| assigns 'pending' status for a future scheduled time | 12:00 > now (10:00) → `"pending"` |
| assigns 'missed' status for a past scheduled time | 08:00 < now (10:00) → `"missed"` |

#### Status resolution — existing logs (3 tests)

| Test | Qué verifica |
|---|---|
| reflects 'taken' status from a log | Log taken → `status: "taken"`, `takenAt` y `doseLogId` presentes |
| reflects 'skipped' status and skipReason from a log | Log skipped → `skipReason: "forgot"` |
| reflects 'missed' status from a log | Log missed → `status: "missed"` |

#### Status resolution — non-today dates (3 tests)

| Test | Qué verifica |
|---|---|
| returns 'missed' for a past date when no log exists | Ayer sin log → `"missed"` |
| returns 'pending' for a future date when no log exists | Mañana sin log → `"pending"` |
| does NOT include snoozedUntil for non-today dates | Ayer con snoozedTimes → `snoozedUntil: undefined` |

#### snoozedUntil (2 tests)

| Test | Qué verifica |
|---|---|
| includes snoozedUntil for today's date when snoozed | `snoozedTimes` presente → `snoozedUntil: "08:30"` |
| snoozedUntil is undefined when there is no entry for the dose | Sin snooze → `undefined` |

#### Day-of-week schedule filtering (3 tests)

| Test | Qué verifica |
|---|---|
| includes doses for schedules that match Monday | `days: [1]` en lunes → 1 dosis |
| excludes doses for schedules that do not match Monday | `days: [3, 5]` en lunes → 0 dosis |
| includes doses for daily schedules (empty days array) on all days | `days: []` → 1 dosis |

#### Date-bound medication filtering (4 tests)

| Test | Qué verifica |
|---|---|
| excludes a medication that hasn't started yet | `startDate: "2025-06-20"` > today → 0 |
| excludes a medication whose course has ended | `endDate: "2025-06-14"` < today → 0 |
| includes a medication on its exact startDate boundary | `startDate: TODAY` → 1 |
| includes a medication on its exact endDate boundary | `endDate: TODAY` → 1 |

#### Multiple doses — sorting (3 tests)

| Test | Qué verifica |
|---|---|
| sorts doses ascending by scheduledTime | 3 schedules desordenados → `["08:00", "14:00", "20:00"]` |
| includes doses from multiple schedules of the same medication | 2 schedules, 1 med → 2 dosis |
| includes doses from multiple different medications | 2 meds, 2 schedules → 2 dosis |

#### Log matching (2 tests)

| Test | Qué verifica |
|---|---|
| only matches a log to the correct schedule/date combination | `sch-1` taken, `sch-2` pending (12:00 > now) |
| uses the default target date (today) when no dateStr is provided | Sin argumento → `scheduledDate: TODAY` |

---

## 8. Suite 5 — utils

```
Ruta: __tests__/utils.test.ts
Prioridad: P3
Tests: 31
```

### Estrategia

Tests directos de funciones puras exportadas por `src/utils/index.ts`. No
requieren mocks de store ni DB. Las funciones de i18n (`getDayNamesShort`,
`getCategoryLabel`, `getDosageLabel`) usan un `mockT` como `TFunction`.

Reutiliza las factories compartidas de `__tests__/factories.ts`.

### Cobertura de tests

| Función | Tests | Aspectos cubiertos |
|---|---|---|
| `generateId` | 3 | Retorna string, valores únicos (50 iteraciones), formato UUID v4 |
| `today` | 1 | Formato `YYYY-MM-DD` |
| `toDateString` | 1 | Formatea `Date` → `"2025-06-15"` |
| `toISOString` | 1 | Coincide con `Date.toISOString()` |
| `parseTime` | 3 | `"08:30"`, midnight `"00:00"`, `"23:59"` |
| `isScheduleActiveOnDate` | 12 | Active/inactive schedule+med, createdAt boundary, startDate/endDate bounds, daily, specific days (Mon/Sun/Sat), exact start/end boundaries |
| `getNextDates` | 4 | Length correcto, `n=0` → vacío, primer entry = hoy midnight, diferencia = 24h |
| `getColorConfig` (presets) | 1 | Todos los 7 colores preset verificados contra `MEDICATION_COLORS` |
| `getColorConfig` (custom hex) | 4 | `bg` = hex input, `light` contiene hex, `border` contiene hex, `text` es hex más oscuro |
| `getDayNamesShort` | 1 | Llama `t("days.short", { returnObjects: true })` |
| `getDayNamesFull` | 1 | Llama `t("days.full", { returnObjects: true })` |
| `getCategoryLabel` | 2 | Key correcto `"categories.analgesico"`, todas las 6 categorías |
| `getDosageLabel` | 2 | Units localizadas (`gotas`, `comprimidos`, `capsulas`) → traducción; no localizadas (`mg`, `ml`, `g`) → fallback al string |

---

## 9. Cobertura

Último reporte (`npx jest --coverage`):

| Archivo | Stmts | Branch | Funcs | Lines | Estado |
|---|---|---|---|---|---|
| `src/hooks/useTodaySchedule.ts` | 97.4 % | 93.8 % | 100 % | **100 %** | ✅ |
| `src/utils/index.ts` | 92 % | 88.5 % | 92.9 % | **90.9 %** | ✅ |
| `src/services/backgroundTask.ts` | 79.4 % | 77.3 % | 71.4 % | **83.3 %** | ✅ |
| `src/store/slices/medications.ts` | 75 % | 81.8 % | 69.7 % | **78.5 %** | ✅ |

Umbral configurado: **70 % lines** por archivo. Todos superados.

### Líneas sin cubrir

| Archivo | Líneas | Razón |
|---|---|---|
| `useTodaySchedule.ts` | L34 | Branch `dateStr ?? format(new Date(), ...)` — cubierto funcionalmente pero Istanbul marca el operador `??` |
| `backgroundTask.ts` | L45–53 | `TaskManager.defineTask` callback — ejecutado solo en runtime nativo (testear requeriría mock completo del lifecycle de la tarea) |
| `medications.ts` | L136, 248–254, 327 | `updateMedication`, `toggleMedicationActive`, `rescheduleOnce` — funciones no cubiertas aún |
| `utils/index.ts` | L17–20 | Branch `crypto.randomUUID` — el fallback `Math.random` se ejecuta siempre en Jest donde `crypto.randomUUID` no existe |

---

## 10. Revisión Opus

Tras la generación inicial con Sonnet, se realizó una revisión con Opus que
identificó y corrigió los siguientes problemas:

| # | Archivo | Problema | Corrección |
|---|---|---|---|
| 1 | `markDose.test.ts` | Test "attempts to re-schedule notifications after deletion" era no determinístico (sin fake timers) y su aserción (`deleteDoseLog`) duplicaba un test anterior | Renombrado a "reschedules notifications for future dates after deletion", fake timers a 07:00, aserción sobre `scheduleDoseChain` |
| 2 | `medicationsSlice.test.ts` | Variable muerta `med` creada con `undefined as any` overrides, nunca utilizada | Eliminada |
| 3 | `medicationsSlice.test.ts` | `makeTestStore([makeMedication()])` pasaba un array a parámetro `Record<string, unknown>` — al hacer spread un array se convierte en `{ "0": ... }` en vez de `{ medications: [...] }` (2 sitios) | Cambiado a `makeTestStore({ medications: [makeMedication()] })` |
| 4 | `useTodaySchedule.test.tsx` | `import React` innecesario — Expo 54 usa automatic JSX runtime y `renderHook` no usa sintaxis JSX | Eliminado |
| 5 | `utils.test.ts` | Factories locales duplicadas (`makeMedication`, `makeSchedule`) idénticas a las de `__tests__/factories.ts` (25 líneas de código redundante) | Reemplazadas por import de `./factories` |

---

## 11. Trabajo futuro

Tests no cubiertos en S4 que pueden abordarse en iteraciones futuras:

| Prioridad | Target | Notas |
|---|---|---|
| P1 | `rescheduleAllNotifications` | Verificar cap de 64 notificaciones iOS, rolling window |
| P1 | CRUD medications: `updateMedication`, `toggleMedicationActive` | 2 funciones del slice sin cobertura |
| P2 | `DoseCard` component | Snapshot + interaction tests con `@testing-library/react-native` |
| P2 | `MedicationForm` component | Pendiente hasta refactoring S5 (react-hook-form + Zod) |
| P2 | `useNotificationResponse` hook | Routing de acciones TAKEN/SNOOZE/SKIP |
| P3 | `backup.ts` round-trip | Export → Import → verificar integridad |
| P3 | `pdfReport.ts` | Generación de PDF con datos de prueba |
| — | CI integration | GitHub Actions workflow `npm test` on PR (complementa S2) |
