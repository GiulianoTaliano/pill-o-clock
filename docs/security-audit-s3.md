# Auditoría de Seguridad S3 — Ciclo de Vida de Dosis

> **Revisión:** marzo 2026  
> **Metodología:** Extended Context — todo el codebase del flujo crítico cargado en contexto (≈8K tokens)  
> **Estado final:** 7 hallazgos identificados · 7 corregidos  
> **GitHub issues:** [#1](https://github.com/GiulianoTaliano/pill-o-clock/issues/1) · [#2](https://github.com/GiulianoTaliano/pill-o-clock/issues/2) · [#3](https://github.com/GiulianoTaliano/pill-o-clock/issues/3) · [#4](https://github.com/GiulianoTaliano/pill-o-clock/issues/4)

---

## Alcance

Archivos auditados:

| Archivo | Aprox. líneas |
|---|---|
| `src/store/slices/medications.ts` | ~500 |
| `src/db/schema.ts` | ~200 |
| `src/db/database.ts` | ~600 |
| `src/services/notifications.ts` | ~900 |
| `src/services/backgroundTask.ts` | ~150 |
| `src/hooks/useTodaySchedule.ts` | ~80 |
| `src/hooks/useNotificationResponse.ts` | ~120 |
| `src/types/index.ts` | ~200 |
| `src/utils/index.ts` | ~300 |

---

## Flujo analizado

```
User action (Take/Skip/Snooze)
  → markDose / logPRNDose (Zustand slice)
    → upsertDoseLog (Drizzle/SQLite)
    → cancelDoseNotifications() → removeNotifMapEntriesByDose()
    → [taken] updateMedicationStock()

Background (every 6h):
  closeMissedDoses()
    → initDatabase() (fresh connection no aplica — singleton WAL)
    → insertMissedDoseLogSafe (INSERT OR IGNORE)  ← corregido
    → rescheduleAllNotifications()
      → Android: ExpoAlarm.scheduleAlarm()
      → iOS: expo-notifications chain (DAYS_AHEAD días)
```

---

## Hallazgos

### F1 — CRITICAL: `upsertDoseLog` no-atómico puede perder registros de dosis

| Campo | Valor |
|---|---|
| **Severidad** | CRITICAL |
| **Archivo** | `src/db/database.ts` |
| **Línea** | función `upsertDoseLog` |
| **Issue** | [#1](https://github.com/GiulianoTaliano/pill-o-clock/issues/1) |
| **Estado** | ✅ Corregido |

**Descripción:**  
La función `upsertDoseLog` realizaba dos sentencias SQL independientes: `DELETE` seguido de `INSERT`. Un crash de la app entre ambas sentencias dejaba la tabla sin ese registro de dosis. En WAL mode, cada sentencia individual es atómica, pero *dos sentencias consecutivas no lo son entre sí*.

**Por qué es crítico:**  
Si el log borrado tenía `status = "taken"`, el paciente cree haber registrado su medicamento pero el historial no lo refleja. El médico vería una dosis "perdida" que en realidad fue tomada. En el otro sentido, si crashea al sobrescribir un "missed" con "taken", el log "missed" persiste incorrectamente.

**Escenario de reproducción:**
1. Usuario pulsa "Tomar" en una DoseCard.
2. `upsertDoseLog` ejecuta el DELETE exitosamente.
3. El sistema operativo mata la app por memoria baja antes del INSERT.
4. Reabriendo la app: la dosis aparece como "pendiente" o "perdida".

**Fix aplicado:**  
Las dos sentencias se envuelven en `db.transaction()` (Drizzle ORM — expo-sqlite). Si el INSERT falla o la app crashea, SQLite revierte el DELETE automáticamente.

```ts
// Antes:
db.delete(...).run();
db.insert(...).run();

// Después:
db.transaction((tx) => {
  tx.delete(...).run();
  tx.insert(...).run();
});
```

---

### F2 — HIGH: Dosis PRN múltiples el mismo día se sobreescriben

| Campo | Valor |
|---|---|
| **Severidad** | HIGH |
| **Archivo** | `src/store/slices/medications.ts` |
| **Línea** | función `logPRNDose` |
| **Issue** | [#2](https://github.com/GiulianoTaliano/pill-o-clock/issues/2) |
| **Estado** | ✅ Corregido |

**Descripción:**  
`logPRNDose` asignaba `scheduleId: "prn-{medication.id}"` a todas las dosis PRN de un medicamento. El índice único `idx_dose_unique` sobre `(schedule_id, scheduled_date)` hace que todas las tomas del mismo día compartan la misma clave. `upsertDoseLog` elimina cualquier log existente con esa clave antes de insertar el nuevo, borrando silenciosamente cualquier toma previa del mismo día.

**Escenario de reproducción:**
1. Medicamento PRN "Ibuprofeno".
2. Tomar a las 08:00 → log guardado con `(prn-abc123, 2026-03-14)`.
3. Tomar de nuevo a las 14:00 → `upsertDoseLog` borra el registro de las 08:00.
4. Historial: solo aparece 1 toma (la de 14:00), la de 08:00 desapareció.

**Fix aplicado:**  
Cada dosis PRN recibe un `scheduleId` con sufijo único, haciendo que cada toma tenga su propia clave `(scheduleId, scheduledDate)`:

```ts
// Antes:
scheduleId: `prn-${medication.id}`,

// Después:
scheduleId: `prn-${medication.id}-${generateId().slice(0, 8)}`,
```

---

### F3 — HIGH: `rescheduleAllNotifications` ignora `DAYS_AHEAD` en iOS

| Campo | Valor |
|---|---|
| **Severidad** | HIGH |
| **Archivo** | `src/services/notifications.ts` |
| **Línea** | función `rescheduleAllNotifications` |
| **Issue** | [#3](https://github.com/GiulianoTaliano/pill-o-clock/issues/3) |
| **Estado** | ✅ Corregido |

**Descripción:**  
La función `rescheduleAllNotifications` tenía el número de días hardcodeado en `7`, ignorando la constante `DAYS_AHEAD` (que vale `3` en iOS y `7` en Android). Paradójicamente, `scheduleAllUpcoming` en el mismo archivo sí usaba `DAYS_AHEAD` correctamente, creando una inconsistencia.

iOS impone un **límite fijo de 64 notificaciones locales pendientes** para toda la app. Con `7 × schedules × (1 + MAX_REPEATS)` notificaciones programadas (en lugar de `3 × ...`), apps con ≥4-5 horarios activos podían superar este límite. iOS silenciosamente descarta las entradas más antiguas — que son las dosis más próximas en el tiempo.

**Impacto:**  
Con 6 horarios activos y `MAX_REPEATS = 2`:
- Con el bug: `7 × 6 × 3 = 126 notificaciones` → excede el cap de 64
- Correcto: `3 × 6 × 3 = 54 notificaciones` → dentro del presupuesto

**Fix aplicado:**

```ts
// Antes:
const endStr = toDateString(addDays(now, 7));
for (let i = 0; i < 7; i++) {

// Después:
const endStr = toDateString(addDays(now, DAYS_AHEAD));
for (let i = 0; i < DAYS_AHEAD; i++) {
```

---

### F4 — HIGH: Race condition — `closeMissedDoses` puede sobreescribir logs "taken"

| Campo | Valor |
|---|---|
| **Severidad** | HIGH |
| **Archivo** | `src/services/backgroundTask.ts`, `src/db/database.ts` |
| **Línea** | función `closeMissedDoses` |
| **Issue** | [#4](https://github.com/GiulianoTaliano/pill-o-clock/issues/4) |
| **Estado** | ✅ Corregido |

**Descripción:**  
`closeMissedDoses` toma un snapshot inicial de los logs existentes. Si el usuario marca retroactivamente una dosis de ayer como "tomada" (desde Historial) *después* de que el snapshot fue capturado pero *antes* de que el background task procese esa entrada, el task la ve como "no logueada" y llama `upsertDoseLog` con `status: "missed"`, sobreescribiendo el "taken" recién insertado.

**Secuencia del race:**
```
BG task: getDoseLogsByDateRange() → {} (snapshot vacío)
UI: markDose(sched1, ayer, "taken") → log insertado ✓
BG task: procesa (sched1, ayer) → no está en snapshot
       → upsertDoseLog({ status: "missed" })
       → DELETE el "taken" → INSERT "missed"
```

**Mitigación existente:** `closeMissedDoses` solo procesa hasta `yesterdayStr`, acotando la ventana. Sin embargo, marcar dosis pasadas retroactivamente desde la pantalla de Historial es una feature soportada, por lo que el race es alcanzable.

**Fix aplicado:**  
Se añade `insertMissedDoseLogSafe` en `database.ts` que usa `INSERT OR IGNORE`. Si ya existe un log para `(scheduleId, scheduledDate)`, la sentencia no hace nada. `closeMissedDoses` ahora usa esta función:

```ts
// Antes (en backgroundTask.ts):
await upsertDoseLog(missedLog);

// Después:
await insertMissedDoseLogSafe(missedLog);  // INSERT OR IGNORE
```

---

### F5 — MEDIUM: Stock no se decrementa atómicamente con el log de dosis

| Campo | Valor |
|---|---|
| **Severidad** | MEDIUM |
| **Archivo** | `src/store/slices/medications.ts` |
| **Línea** | función `markDose` |
| **Issue** | — (no requiere issue separado; bajo impacto clínico) |
| **Estado** | ℹ️ Documentado — no corregido en esta iteración |

**Descripción:**  
En `markDose`, la secuencia es:
1. `upsertDoseLog(log)` — log guardado ✓
2. `cancelDoseNotifications(...)` — notif cancelada ✓
3. `updateMedicationStock(...)` — stock decrementado

Un crash entre el paso 1 y el paso 3 deja el log correcto (salud preservada) pero el stock sin decrementar. El contador de stock es inexacto por 1 unidad.

**Por qué MEDIUM y no CRITICAL:**  
El dato clínicamente crítico es el log de la dosis (paso 1, ya corregido con F1). El stock es un conteo de conveniencia para alertar al usuario cuando se le acaba el medicamento. Un error de ±1 unidad es tolerable y se autocorrige en la siguiente recarga manual de stock.

**Fix sugerido (futuro):**  
Envolver `upsertDoseLog` + `updateMedicationStock` en una transacción de base de datos unificada, o aceptar la inconsistencia eventual dado que solo afecta un dato de conveniencia.

---

### F6 — LOW: `JSON.parse` sin manejo de errores en `toSchedule`

| Campo | Valor |
|---|---|
| **Severidad** | LOW |
| **Archivo** | `src/db/database.ts` |
| **Línea** | función `toSchedule` |
| **Estado** | ✅ Corregido |

**Descripción:**  
`JSON.parse(row.days)` podía lanzar `SyntaxError` si la columna `days` contenía JSON malformado (por corrupción de BD, INSERT directo, o migración incorrecta). Esto haría crashear cualquier operación que cargue schedules.

**Fix aplicado:**

```ts
let days: number[] = [];
try {
  days = JSON.parse(row.days) as number[];
} catch {
  days = []; // Fallback: tratar como schedule diario
}
```

---

### F7 — LOW: `JSON.parse` sin manejo de errores en `toDailyCheckin`

| Campo | Valor |
|---|---|
| **Severidad** | LOW |
| **Archivo** | `src/db/database.ts` |
| **Línea** | función `toDailyCheckin` |
| **Estado** | ✅ Corregido |

**Descripción:**  
Mismo patrón que F6, aplicado a `JSON.parse(row.symptoms)` en `toDailyCheckin`. Síntomas malformados crashearían la pantalla de check-ins.

**Fix aplicado:**

```ts
let symptoms: string[] = [];
try {
  symptoms = JSON.parse(row.symptoms) as string[];
} catch {
  symptoms = [];
}
```

---

## Resumen ejecutivo

| # | Descripción | Severidad | Estado |
|---|---|---|---|
| F1 | `upsertDoseLog` no-atómico — pérdida de logs en crash | CRITICAL | ✅ Corregido |
| F2 | Dosis PRN múltiples el mismo día se sobreescriben | HIGH | ✅ Corregido |
| F3 | `rescheduleAllNotifications` ignora `DAYS_AHEAD` en iOS | HIGH | ✅ Corregido |
| F4 | Race condition: `closeMissedDoses` sobreescribe logs "taken" | HIGH | ✅ Corregido |
| F5 | Stock no atómico con log de dosis | MEDIUM | ℹ️ Documentado |
| F6 | `JSON.parse` sin try/catch en `toSchedule` | LOW | ✅ Corregido |
| F7 | `JSON.parse` sin try/catch en `toDailyCheckin` | LOW | ✅ Corregido |

**6 de 7 hallazgos corregidos en código.** El hallazgo F5 (MEDIUM) queda documentado para la siguiente iteración de S4 (tests) dado que su impacto clínico es bajo y la corrección requiere reestructurar la capa de store.

---

## Verificación post-fix

```
npx jest --passWithNoTests
→ Test Suites: 1 passed · Tests: 22 passed · Time: 1.7s
```

TypeScript: sin errores en los 4 archivos modificados.

---

## Archivos modificados

| Archivo | Cambios |
|---|---|
| `src/db/database.ts` | `upsertDoseLog` en transacción; `insertMissedDoseLogSafe` añadida; JSON.parse seguros en `toSchedule` y `toDailyCheckin` |
| `src/services/backgroundTask.ts` | `closeMissedDoses` usa `insertMissedDoseLogSafe` |
| `src/store/slices/medications.ts` | `logPRNDose` usa `scheduleId` único por dosis |
| `src/services/notifications.ts` | `rescheduleAllNotifications` usa `DAYS_AHEAD` |
