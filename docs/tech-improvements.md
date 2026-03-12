# Pill O-Clock — Mejoras técnicas y buenas prácticas

> Revisión: marzo 2026 · Generado tras auditoría completa del codebase v1.3.0
>
> Usa este documento para trackear el progreso. Marca cada ítem con `[x]` cuando esté completo.

---

## Leyenda de prioridades

- 🔴 **Alta** — Afecta requisitos de tiendas, fiabilidad crítica o experiencia degradada notoriamente
- 🟡 **Media** — Deuda técnica con impacto real en mantenibilidad, rendimiento o correctitud
- 🟢 **Baja** — Mejoras de calidad y buenas prácticas, sin urgencia operativa

---

## 🔴 Prioridad Alta

---

### A1 — Accesibilidad: VoiceOver / TalkBack

- **Estado:** `[x] Completo`
- **Archivos afectados:** Todos los componentes y pantallas (impacta globalmente)
- **Categoría:** Directrices de plataforma · Requisito de tiendas

**Problema:**
No existe un solo `accessibilityLabel`, `accessibilityRole` ni `accessibilityHint` en la base de código de producción. Esto hace la app completamente inutilizable con VoiceOver (iOS) y TalkBack (Android).

Esto no es solo una mejora: la **App Store Review Guideline 5.1.4** requiere que las apps sean accesibles para usuarios con discapacidades. Las **Google Play Accessibility Best Practices** tienen el mismo requisito. Para apps de salud (categoría en la que compite Pill O-Clock), la revisión de accesibilidad es más estricta.

**Casos críticos a resolver primero:**
- Botón `+` de agregar medicamento (solo ícono, sin texto)
- Íconos de trash en DoseCard, MedicationCard, health measurements
- Botones de acción en DoseCard: "Tomar", "Omitir", "Posponer"
- Botones de acción en la pantalla de alarma
- Selectores de día de la semana (`DayToggle`)

**Patrón mínimo viable para botones icónicos:**
```tsx
<TouchableOpacity
  accessibilityRole="button"
  accessibilityLabel={t('medications.addNew')}
  accessibilityHint={t('medications.addNewHint')}
  onPress={...}
>
  <Ionicons name="add" size={24} />
</TouchableOpacity>
```

**Para elementos con estado (ej. dosis tomada/pendiente):**
```tsx
<TouchableOpacity
  accessibilityRole="button"
  accessibilityLabel={`${med.name} — ${t(`doseStatus.${status}`)}`}
  accessibilityState={{ checked: status === 'taken' }}
  onPress={...}
>
```

**Alcance estimado:** ~25–35 elementos interactivos en total. Hacerlo por pantalla iterativamente.

---

### A2 — `predictiveBackGestureEnabled: false` global en app.json

- **Estado:** `[x] Completo`
- **Archivos afectados:** [app.json](../app.json)
- **Categoría:** Directrices de plataforma Android

**Problema:**
En `app.json`, la propiedad `predictiveBackGestureEnabled: false` está configurada a nivel de app completa:

```json
"android": {
  "predictiveBackGestureEnabled": false
}
```

Esto desactiva el Predictive Back Gesture de Android 14+ (API 34) para **todas las pantallas**, degradando la experiencia en el 100% de los usuarios de Android moderno. La intención original era evitar que el gesto de back dismissee la pantalla de alarma mientras está activa.

**Solución:**
1. Eliminar `predictiveBackGestureEnabled: false` del `app.json` (rehabilitar globalmente).
2. Manejar la excepción en la `AlarmActivity` nativa desde el módulo `expo-alarm`, usando el event `OnBackInvokedCallback` de Android 14:

```kotlin
// En AlarmActivity.kt (dentro de expo-alarm/android)
if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
    onBackInvokedDispatcher.registerOnBackInvokedCallback(
        OnBackInvokedDispatcher.PRIORITY_DEFAULT
    ) {
        // No hacer nada: bloquear el back mientras la alarma está activa
    }
}
```

---

### A3 — Mapa de notificaciones en AsyncStorage: frágil, puede perderse

- **Estado:** `[x] Completo`
- **Archivos afectados:** [src/services/notifications.ts](../src/services/notifications.ts)
- **Categoría:** Fiabilidad crítica

**Problema:**
El mapa `notifId → { scheduleId, scheduledDate, ... }` se almacena en AsyncStorage bajo la clave `@pilloclock/notif_map`. AsyncStorage es **volátil**: puede ser limpiado por el OS bajo presión de almacenamiento, por el usuario desde Ajustes → Almacenamiento, o corromperse en condiciones de reinicio inesperado.

Si este mapa se pierde, la app no puede cancelar notificaciones ya programadas. En Android esto significa que alarmas de dosis antiguas o ya tomadas pueden sonar indefinidamente.

**Solución:**
Mover el notification map a una tabla de SQLite con garantías ACID:

```sql
-- Agregar en initDatabase() como migración v8
CREATE TABLE IF NOT EXISTS notification_map (
  notif_id        TEXT PRIMARY KEY,
  schedule_id     TEXT NOT NULL,
  scheduled_date  TEXT NOT NULL,
  scheduled_time  TEXT NOT NULL,
  medication_id   TEXT NOT NULL,
  is_repeat       INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_notif_map_dose
  ON notification_map(schedule_id, scheduled_date);
```

Reemplazar `loadNotifMap()`, `saveNotifMap()`, `addNotifMapEntries()` y `removeNotifMapEntriesByDose()` con operaciones directas a esta tabla.

**Beneficio adicional:** Las operaciones pueden envolverse en la misma transacción que el `upsertDoseLog` correspondiente, garantizando atomicidad (si falla el log, tampoco queda la notificación registrada como cancelada).

---

## 🟡 Prioridad Media

---

### M1 — Reemplazar AsyncStorage por react-native-mmkv para preferencias

- **Estado:** `[ ] Pendiente`
- **Archivos afectados:** [src/store/index.ts](../src/store/index.ts), [src/i18n/index.ts](../src/i18n/index.ts), [app/_layout.tsx](../app/_layout.tsx), [app/(tabs)/index.tsx](../app/(tabs)/index.tsx)
- **Categoría:** Rendimiento · Arquitectura

**Problema:**
AsyncStorage se usa en 8+ lugares para guardar preferencias pequeñas que se leen en rutas críticas (arranque de app, primer render de pantallas):

| Clave | Usado en | Impacto |
|---|---|---|
| `@pilloclock/theme_mode` | store/index.ts | Leído en arranque → flash de tema |
| `@pilloclock/language` | i18n/index.ts | Leído en arranque → flash de idioma |
| `@pilloclock/notif_map` | notifications.ts | Ver A3 |
| `@pilloclock/onboarding_done` | _layout.tsx | Leído en arranque |
| `@pilloclock/tour_done` | (tabs)/index.tsx | Leído al enfocar pantalla |
| `@pilloclock/tip_reschedule_seen` | (tabs)/index.tsx | Leído al enfocar pantalla |
| `@pilloclock/checkin_dismissed_date` | (tabs)/index.tsx | Leído al enfocar pantalla |

AsyncStorage es **async I/O** al disco en cada lectura. Cada uno de esos `await AsyncStorage.getItem(...)` es una espera visible antes de renderizar.

**Solución:**
[react-native-mmkv](https://github.com/mrousavy/react-native-mmkv) — key-value store nativo (Tencent), ~30× más rápido que AsyncStorage, **síncrono**.

```bash
npx expo install react-native-mmkv
```

```ts
// src/storage.ts — instancia compartida
import { MMKV } from 'react-native-mmkv'
export const storage = new MMKV({ id: 'pilloclock' })
```

Con el middleware `persist` de Zustand, la persistencia del store se vuelve automática y síncrona:

```ts
import { persist, createJSONStorage } from 'zustand/middleware'
import { storage } from '../storage'

const mmkvStorage = {
  getItem: (key: string) => storage.getString(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
}

export const usePrefsStore = create(
  persist(
    (set) => ({
      themeMode: 'system' as ThemeMode,
      language: 'es' as SupportedLanguage,
      onboardingDone: false,
      tourDone: false,
      tipRescheduleSeen: false,
      checkinDismissedDate: null as string | null,
      // setters...
    }),
    {
      name: 'pilloclock-prefs',
      storage: createJSONStorage(() => mmkvStorage),
    }
  )
)
```

Esto elimina toda la lógica manual de `loadThemeMode`/`setThemeMode`/`THEME_KEY` del store actual, y los `AsyncStorage.getItem` dispersos en componentes.

**Nota:** Para `notif_map` ver A3 — va a SQLite, no a MMKV.

---

### M2 — Drizzle ORM para expo-sqlite

- **Estado:** `[ ] Pendiente`
- **Archivos afectados:** [src/db/database.ts](../src/db/database.ts), [src/store/index.ts](../src/store/index.ts)
- **Categoría:** Arquitectura · Mantenibilidad · Seguridad de tipos

**Problema:**
La capa de base de datos usa raw SQL con castings manuales inseguros:

```ts
// Ejemplo del problema — casting sin verificación de tipos
function rowToMedication(row: Record<string, unknown>): Medication {
  return {
    id: row.id as string,          // ¿Y si es null?
    dosageAmount: (row.dosage_amount as number | undefined) ?? 1,
    // ... 15 campos más
  }
}
```

Esto ya tiene 7 versiones de migración manual gestionadas a mano con `PRAGMA user_version` y `try/catch` individuales por cada `ALTER TABLE`. Cada nueva feature requiere recordar actualizar `rowToMedication`, los queries Y la migración manualmente.

**Solución:**
[Drizzle ORM](https://orm.drizzle.team/docs/get-started/expo-new) es el estándar actual para React Native + expo-sqlite. Compatible con expo-sqlite `~16` que ya se usa.

```bash
npx expo install drizzle-orm
npm install -D drizzle-kit
```

```ts
// src/db/schema.ts
import { sqliteTable, text, real, integer } from 'drizzle-orm/sqlite-core'

export const medications = sqliteTable('medications', {
  id:                   text('id').primaryKey(),
  name:                 text('name').notNull(),
  dosageAmount:         real('dosage_amount').notNull().default(1),
  dosageUnit:           text('dosage_unit').notNull().default('comprimidos'),
  category:             text('category').notNull().default('otro'),
  color:                text('color').notNull().default('blue'),
  isActive:             integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt:            text('created_at').notNull(),
  stockQuantity:        integer('stock_quantity'),
  stockAlertThreshold:  integer('stock_alert_threshold'),
  photoUri:             text('photo_uri'),
  isPRN:                integer('is_prn', { mode: 'boolean' }).notNull().default(false),
  // ...
})
```

```ts
// src/db/database.ts — query type-safe, sin castings
import { drizzle } from 'drizzle-orm/expo-sqlite'
import * as schema from './schema'

const expo = SQLite.openDatabaseSync('pilloclock.db', { enableChangeListener: true })
export const db = drizzle(expo, { schema })

export async function getMedications() {
  return db.select().from(schema.medications).orderBy(desc(schema.medications.createdAt))
  // retorna Medication[] — tipado completo, sin castings
}
```

Las migraciones se generan con `drizzle-kit generate` y se aplican automáticamente con `useMigrations()` hook de Drizzle:

```tsx
// app/_layout.tsx
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator'
import migrations from '../src/db/migrations'

const { success, error } = useMigrations(db, migrations)
```

Esto reemplaza el sistema manual de `PRAGMA user_version` + `ALTER TABLE` con try/catch.

---

### M3 — Zustand: separar en slices y sacar estado de UI del store

- **Estado:** `[ ] Pendiente`
- **Archivos afectados:** [src/store/index.ts](../src/store/index.ts)
- **Categoría:** Arquitectura · Mantenibilidad

**Problema:**
El store tiene ~150 líneas de interfaz y mezcla tres responsabilidades distintas:
1. **Datos persistibles** (medications, schedules, appointments, health, check-ins)
2. **Estado de UI efímero** (`selectedAppointmentId`, `pendingEditAppointmentId`, `snoozedTimes`)
3. **Preferencias de usuario** (themeMode — ver M1)

El estado de UI efímero no debería estar en el store global de datos. Si el usuario navega afuera, `selectedAppointmentId` queda "colgado" en el store aunque no haya nadie observándolo.

**Solución:**
Aplicar el patrón de [slices de Zustand v5](https://zustand.docs.pmnd.rs/guides/slices-pattern):

```ts
// src/store/slices/medications.ts
import type { StateCreator } from 'zustand'
import type { AppState } from '../types'

export const createMedicationsSlice: StateCreator<AppState, [], [], MedicationsSlice> = (set, get) => ({
  medications: [],
  schedules: [],
  addMedication: async (...) => { ... },
  // ...
})

// src/store/slices/ui.ts — estado de navegación/UI efímero
export const createUISlice: StateCreator<AppState, [], [], UISlice> = (set) => ({
  selectedAppointmentId: null,
  setSelectedAppointmentId: (id) => set({ selectedAppointmentId: id }),
  pendingEditAppointmentId: null,
  setPendingEditAppointmentId: (id) => set({ pendingEditAppointmentId: id }),
  snoozedTimes: {},
})

// src/store/index.ts
export const useAppStore = create<AppState>()((...a) => ({
  ...createMedicationsSlice(...a),
  ...createAppointmentsSlice(...a),
  ...createHealthSlice(...a),
  ...createUISlice(...a),
}))
```

---

### M4 — `LayoutAnimation.configureNext()` dentro del store

- **Estado:** `[ ] Pendiente`
- **Archivos afectados:** [src/store/index.ts](../src/store/index.ts)
- **Categoría:** Arquitectura · Separación de responsabilidades

**Problema:**
El store llama directamente a `LayoutAnimation.configureNext()` en varias acciones:

```ts
// src/store/index.ts
async deleteMedication(id) {
  // ...
  if (Platform.OS !== "web") LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  set({ medications: allMeds });
}
```

El store no debería saber que existe una UI, y menos llamar a APIs visuales. Si el componente no está montado cuando la acción se ejecuta (ej. desde un background task), la llamada a `LayoutAnimation` puede producir comportamientos inesperados o warnings.

**Solución:**
Eliminar todas las llamadas a `LayoutAnimation` del store. Moverlas a los componentes que consumen el estado, usando `useEffect` que reacciona al cambio:

```tsx
// En el componente que muestra la lista de medicamentos
const medications = useAppStore((s) => s.medications)
const prevCountRef = useRef(medications.length)

useEffect(() => {
  if (medications.length !== prevCountRef.current) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    prevCountRef.current = medications.length
  }
}, [medications.length])
```

O, dado que ya usan `react-native-reanimated` v4, reemplazar `LayoutAnimation` con `useAnimatedStyle` o `FadeIn`/`FadeOut` de Reanimated, que son más controlables y compatibles con la New Architecture:

```tsx
import { FadeIn, FadeOut, Layout } from 'react-native-reanimated'

<Animated.View entering={FadeIn} exiting={FadeOut} layout={Layout.springify()}>
  <MedicationCard ... />
</Animated.View>
```

---

### M5 — CSS variables en NativeWind v4 para dark mode semántico

- **Estado:** `[ ] Pendiente`
- **Archivos afectados:** [tailwind.config.js](../tailwind.config.js), [global.css](../global.css), múltiples componentes
- **Categoría:** Directrices de plataforma · Dark mode

**Problema:**
Los tokens semánticos en `tailwind.config.js` están definidos como colores estáticos (solo light mode):

```js
colors: {
  background: "#f0f6ff",  // ← siempre light mode
  card: "#ffffff",
  text: "#1e293b",
  // ...
}
```

El dark mode de estos tokens requiere poner `dark:bg-[#0f172a]` explícitamente en cada uso. Como consecuencia, el hook `useAppTheme()` existe para compensar esta limitación, y hay valores hexadecimales hardcodeados dispersos.

**Solución correcta con NativeWind v4:**

```css
/* global.css */
:root {
  --color-background: #f0f6ff;
  --color-card: #ffffff;
  --color-text: #1e293b;
  --color-muted: #94a3b8;
  --color-border: #e2e8f0;
}

.dark {
  --color-background: #0f172a;
  --color-card: #1e293b;
  --color-card-alt: #0f172a;
  --color-text: #f8fafc;
  --color-muted: #64748b;
  --color-border: #334155;
}
```

```js
// tailwind.config.js
colors: {
  background: 'var(--color-background)',
  card:       'var(--color-card)',
  text:       'var(--color-text)',
  muted:      'var(--color-muted)',
  border:     'var(--color-border)',
}
```

Con esto, `className="bg-background"` respeta automáticamente el dark mode sin prefijo `dark:`. El hook `useAppTheme()` quedaría reservado solo para los pocos casos donde se necesita el valor como string en un `style={}` (ej. `StatusBar`, configuración del `TabBar`).

**Impacto adicional:** Esto también corrige que el tab bar y varios modales se muestren con fondo blanco en dark mode (ver M6).

---

### M6 — Colores hardcodeados en el tab bar sin respetar dark mode

- **Estado:** `[ ] Pendiente`
- **Archivos afectados:** [app/(tabs)/_layout.tsx](../app/(tabs)/_layout.tsx)
- **Categoría:** Dark mode · Directrices de plataforma

**Problema:**
Los colores del tab bar están hardcodeados para light mode:

```tsx
tabBarStyle: {
  backgroundColor: "#ffffff",   // ← blanco siempre
  borderTopColor: "#e2e8f0",    // ← siempre light
  height: 65,
  paddingBottom: 8,
},
tabBarActiveTintColor: "#4f9cff",
tabBarInactiveTintColor: "#94a3b8",
```

En dark mode, el tab bar aparece blanco mientras el resto de la app es oscura.

**Solución:**
```tsx
const theme = useAppTheme()

tabBarStyle: {
  backgroundColor: theme.card,
  borderTopColor: theme.isDark ? '#1e293b' : '#e2e8f0',
  height: 65,
  paddingBottom: 8,
},
```

O idealmente, después de implementar M5, usar directamente los tokens de CSS.

---

### M7 — `TouchableOpacity` → `Pressable` con ripple de Material 3

- **Estado:** `[ ] Pendiente`
- **Archivos afectados:** Todos los componentes y pantallas
- **Categoría:** Directrices de plataforma Android

**Problema:**
La app usa `TouchableOpacity` en la gran mayoría de sus elementos interactivos. En React Native 0.81 (versión actual), `Pressable` es el componente recomendado. La diferencia clave en Android es el ripple de Material Design 3, que es el indicador de feedback táctil esperado según las Human Interface Guidelines de Android:

```tsx
// ❌ TouchableOpacity — solo fade de opacidad
<TouchableOpacity onPress={...}>

// ✅ Pressable — ripple nativo de Material 3 en Android, fade en iOS
<Pressable
  onPress={...}
  android_ripple={{ color: '#4f9cff22' }}
  style={({ pressed }) => [styles.btn, pressed && { opacity: 0.8 }]}
>
```

**Estrategia de migración:** No hace falta cambiar todo de una. Crear un componente wrapper `AppButton` / `AppPressable` con la configuración correcta y migrar progresivamente. Los casos más visibles son los botones de acción en DoseCard y la pantalla de alarma.

---

### M8 — `setInterval` para verificar permiso en Settings → usar `AppState`

- **Estado:** `[ ] Pendiente`
- **Archivos afectados:** [app/(tabs)/settings.tsx](../app/(tabs)/settings.tsx#L128)
- **Categoría:** Buenas prácticas de plataforma · Rendimiento

**Problema:**
La pantalla de Settings verifica el permiso `Full Screen Intent` con un `setInterval` de 2 segundos:

```ts
// app/(tabs)/settings.tsx
useEffect(() => {
  if (Platform.OS !== "android" || hasFullScreenPerm === null) return;
  const id = setInterval(() => {
    checkFullScreenIntentPermission().then(setHasFullScreenPerm).catch(() => {});
  }, 2000);
  return () => clearInterval(id);
}, [hasFullScreenPerm]);
```

Esto hace polling a una API nativa cada 2 segundos, incluso mientras el usuario está quieto en la pantalla sin haber hecho nada. Es un anti-pattern que consume ciclos de CPU y puede impactar la batería.

**El único caso de uso real** es detectar que el usuario acaba de conceder el permiso en el panel de ajustes del sistema y volvió a la app.

**Solución correcta:**
```ts
useFocusEffect(
  useCallback(() => {
    if (Platform.OS !== 'android') return

    // Verificar al montar/enfocar la pantalla
    checkFullScreenIntentPermission().then(setHasFullScreenPerm).catch(() => {})

    // Re-verificar cada vez que el usuario vuelve a la app (desde Settings del sistema)
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        checkFullScreenIntentPermission().then(setHasFullScreenPerm).catch(() => {})
      }
    })

    return () => sub.remove()
  }, [])
)
```

---

### M9 — SQLite: habilitar WAL mode y agregar índices faltantes

- **Estado:** `[ ] Pendiente`
- **Archivos afectados:** [src/db/database.ts](../src/db/database.ts)
- **Categoría:** Rendimiento

**Problema:**
`getDb()` solo habilita `PRAGMA foreign_keys = ON` pero no activa WAL mode. SQLite en modo de journal por defecto (`DELETE` journal) bloquea la base de datos entera durante escrituras. WAL (Write-Ahead Logging) permite lecturas concurrentes no bloqueantes y mejora el throughput de escritura.

Además, faltan índices en columnas frecuentemente consultadas:

```sql
-- idx_dose_unique ya existe (bien)
-- Faltan:
CREATE INDEX IF NOT EXISTS idx_dose_logs_medication_id
  ON dose_logs(medication_id);
-- Usado por: historial por medicamento, cálculo de adherencia

CREATE INDEX IF NOT EXISTS idx_dose_logs_scheduled_date
  ON dose_logs(scheduled_date);
-- Usado por: getDoseLogsByDate (se ejecuta en cada carga de pantalla Today)

CREATE INDEX IF NOT EXISTS idx_health_measurements_type_date
  ON health_measurements(type, measured_at DESC);
-- Usado por: gráfico de tendencias por métrica

CREATE INDEX IF NOT EXISTS idx_schedules_medication_id
  ON schedules(medication_id);
-- Usado por: getSchedulesByMedication
```

**Solución:**
```ts
// En getDb(), después de abrir la DB
await _db.execAsync("PRAGMA journal_mode=WAL;");
await _db.execAsync("PRAGMA foreign_keys = ON;");
```

Los índices se agregan como migración en `initDatabase()`.

---

### M10 — `importBackup()`: inserts sin transacción

- **Estado:** `[ ] Pendiente`
- **Archivos afectados:** [src/services/backup.ts](../src/services/backup.ts)
- **Categoría:** Fiabilidad · Rendimiento

**Problema:**
`importBackup()` en modo `"replace"` llama `clearAllData()` y luego inserta cada registro de forma individual en loops:

```ts
for (const med of data.medications) await insertMedication(med)
for (const sch of data.schedules)   await insertSchedule(sch)
for (const log of data.doseLogs)    await upsertDoseLog(log)
// ...
```

Sin transacción, cada `await insertX()` es una transacción SQLite separada. Para un backup con 50 medicamentos + 500 logs + 200 mediciones de salud, esto crea ~750 transacciones individuales. En un dispositivo mid-range, esto puede tardar varios segundos y, si la app se cierra a la mitad, la base de datos queda en un estado parcialmente importado (datos corruptos).

**Solución:**
```ts
const db = await getDb()
await db.withTransactionAsync(async () => {
  if (mode === 'replace') await clearAllData()
  for (const med of data.medications) await insertMedication(med)
  for (const sch of data.schedules)   await insertSchedule(sch)
  for (const log of data.doseLogs)    await upsertDoseLog(log)
  for (const appt of data.appointments)    await insertAppointment(appt)
  for (const m of data.healthMeasurements) await insertHealthMeasurement(m)
  for (const c of data.dailyCheckins)      await upsertDailyCheckin(c)
})
```

Esto garantiza atomicidad: o se importa todo, o no se importa nada.

---

### M11 — Centralizar claves de AsyncStorage/MMKV en `config.ts`

- **Estado:** `[ ] Pendiente`
- **Archivos afectados:** [src/config.ts](../src/config.ts), [src/store/index.ts](../src/store/index.ts), [src/i18n/index.ts](../src/i18n/index.ts), [app/_layout.tsx](../app/_layout.tsx), [app/(tabs)/index.tsx](../app/(tabs)/index.tsx)
- **Categoría:** Mantenibilidad · Prevención de bugs

**Problema:**
Hay 7 claves de AsyncStorage definidas como strings literales en archivos diferentes. Un error tipográfico en cualquiera crea un bug silencioso (lee `undefined` siempre, sin ningún error):

```ts
// store/index.ts
const THEME_KEY = "@pilloclock/theme_mode"

// i18n/index.ts
export const LANGUAGE_KEY = "@pilloclock/language"

// notifications.ts
const NOTIF_MAP_KEY = "@pilloclock/notif_map"

// _layout.tsx
const ONBOARDING_DONE_KEY = "@pilloclock/onboarding_done"

// (tabs)/index.tsx — sin constante, strings inline
AsyncStorage.getItem("@pilloclock/tour_done")
AsyncStorage.getItem("@pilloclock/tip_reschedule_seen")
AsyncStorage.getItem("@pilloclock/checkin_dismissed_date")
```

**Solución:**
```ts
// src/config.ts — agregar a las constantes existentes
export const STORAGE_KEYS = {
  THEME_MODE:               '@pilloclock/theme_mode',
  LANGUAGE:                 '@pilloclock/language',
  NOTIF_MAP:                '@pilloclock/notif_map',
  ONBOARDING_DONE:          '@pilloclock/onboarding_done',
  TOUR_DONE:                '@pilloclock/tour_done',
  TIP_RESCHEDULE_SEEN:      '@pilloclock/tip_reschedule_seen',
  CHECKIN_DISMISSED_DATE:   '@pilloclock/checkin_dismissed_date',
} as const
```

---

### M12 — Validar backup importado con Zod

- **Estado:** `[ ] Pendiente`
- **Archivos afectados:** [src/services/backup.ts](../src/services/backup.ts)
- **Categoría:** Fiabilidad · Seguridad

**Problema:**
`importBackup()` parsea el JSON y hace castings directos a los tipos de la app sin ninguna verificación:

```ts
const raw = JSON.parse(text)
// raw es `any` — no se valida nada
const backup = raw as BackupData
const data = backup.data  // ¿Y si no tiene este campo?
for (const med of data.medications) await insertMedication(med) // inserta datos sin validar
```

Si el usuario importa un archivo corrupto, de una versión incompatible, o malicioso, los datos incorrectos se insertan directamente en la BD sin ningún error de formato en compilación.

**Solución con Zod:**
```bash
npm install zod
```

```ts
import { z } from 'zod'

const medicationImportSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  dosageAmount: z.number().positive(),
  dosageUnit: z.enum(['mg', 'g', 'mcg', 'ml', 'gotas', 'comprimidos', 'capsulas', 'UI']),
  // ...
})

const backupSchema = z.object({
  version: z.number().int().min(1),
  app: z.literal('pill-o-clock'),
  data: z.object({
    medications: z.array(medicationImportSchema),
    schedules: z.array(scheduleImportSchema),
    doseLogs: z.array(doseLogImportSchema),
    appointments: z.array(appointmentImportSchema).default([]),
    healthMeasurements: z.array(healthMeasurementImportSchema).default([]),
    dailyCheckins: z.array(dailyCheckinImportSchema).default([]),
  }),
})

// En importBackup():
const result = backupSchema.safeParse(rawJson)
if (!result.success) throw new BackupFormatError()
const data = result.data.data  // tipado y validado
```

El schema de Zod también sirve como documentación formal del formato de backup.

---

### M13 — `loadAll()` llamado en exceso — optimizar la pantalla Today

- **Estado:** `[ ] Pendiente`
- **Archivos afectados:** [app/(tabs)/index.tsx](../app/(tabs)/index.tsx)
- **Categoría:** Rendimiento

**Problema:**
`loadAll()` se dispara en múltiples puntos, incluyendo el `useFocusEffect` de la pantalla Today. Esto ejecuta queries completas a BD (medications + schedules + appointments + logs) **cada vez que el usuario vuelve a cualquier pestaña que pase por Today**.

La pantalla Today solo necesita actualizar las dosis del día cuando vuelve al foco, no recargar toda la data:

```tsx
// Actual: recarga TODO en cada focus
useFocusEffect(
  useCallback(() => { loadAll(); }, [loadAll])
)

// Mejor: solo recargar los logs de hoy (ya existe en el store)
useFocusEffect(
  useCallback(() => { loadTodayLogs(); }, [loadTodayLogs])
)
```

`loadAll()` completo solo es necesario al arranque de la app (ya ocurre en `_layout.tsx`) y cuando se sabe que los datos de fondo cambiaron (background task, import de backup).

---

## 🟢 Prioridad Baja

---

### B1 — React Hook Form en MedicationForm

- **Estado:** `[ ] Pendiente`
- **Archivos afectados:** [components/MedicationForm.tsx](../components/MedicationForm.tsx)
- **Categoría:** Mantenibilidad · Developer experience

**Problema:**
`MedicationForm` gestiona su estado con múltiples `useState` individuales para cada campo. La validación está dispersa en el handler de submit. A medida que se agregan campos (dosis mínima/máxima, formulaciones farmacéuticas, etc.), el componente acumula estado difícil de trackear.

**Solución:**
[React Hook Form](https://react-hook-form.com/) funciona con React Native y se integra con Zod (ver M12) para validación:

```tsx
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { medicationFormSchema } from '../src/schemas/medication'

const { control, handleSubmit, formState: { errors } } = useForm({
  resolver: zodResolver(medicationFormSchema),
  defaultValues: { name: '', dosageAmount: 1, dosageUnit: 'comprimidos', ... }
})
```

La validación de fechas coherentes (startDate < endDate), dosis > 0, stock ≥ threshold, etc. queda expresada en el schema Zod en lugar de lógica imperativa en el submit.

---

### B2 — FlashList para listas largas (historial, salud, citas)

- **Estado:** `[ ] Pendiente`
- **Archivos afectados:** [app/(tabs)/history.tsx](../app/(tabs)/history.tsx), [app/(tabs)/health.tsx](../app/(tabs)/health.tsx), [app/(tabs)/appointments.tsx](../app/(tabs)/appointments.tsx)
- **Categoría:** Rendimiento

**Problema:**
Las pantallas de historial, salud y citas usan `ScrollView` con `.map()`, renderizando todos los items a la vez en memoria. Para usuarios con historial extenso (12+ meses de dosis diarias, mediciones frecuentes de salud), esto causa:
- Renders lentos al entrar a la pantalla
- Mayor uso de memoria

**Solución:**
[@shopify/flash-list](https://shopify.github.io/flash-list/) es el reemplazo recomendado actualmente para FlatList y ScrollView+map, con mejor rendimiento que el FlatList nativo:

```bash
npx expo install @shopify/flash-list
```

```tsx
import { FlashList } from '@shopify/flash-list'

<FlashList
  data={logs}
  renderItem={({ item }) => <HistoryLogRow log={item} />}
  estimatedItemSize={72}  // altura estimada de cada fila
  keyExtractor={(item) => item.id}
/>
```

**Prioridad real:** Los datasets actuales de la app son pequeños, por lo que el impacto hoy es bajo. Gana relevancia si se agregan features como historial anual o sincronización cloud.

---

### B3 — Tests automatizados: estrategia recomendada

- **Estado:** `[ ] Pendiente`
- **Categoría:** Calidad · CI/CD

**La app actualmente no tiene ningún test.**

**Estrategia recomendada por capa:**

#### Lógica pura — Jest + Testing Library
Para funciones puras y hooks sin dependencias de UI:

```bash
npm install -D jest @testing-library/react-native @testing-library/jest-native
```

Tests de mayor valor con menor costo:
- `isScheduleActiveOnDate()` — lógica crítica de correctitud
- `useTodaySchedule()` — hook central de la pantalla Today
- `importBackup()` / `exportBackup()` — lógica de backup/restore
- Las migraciones de SQLite (v1 → v7+)

#### E2E — Maestro
Para flujos completos de usuario:

```bash
# macOS/Linux
curl -Ls "https://get.maestro.mobile.dev" | bash
```

Flujos de mayor valor:
```yaml
# .maestro/add_medication.yaml
appId: com.pilloclock.app
---
- launchApp
- tapOn: "Medicamentos"
- tapOn:
    id: "add-medication-button"
- inputText:
    text: "Ibuprofeno"
    id: "medication-name-input"
- tapOn: "Guardar"
- assertVisible: "Ibuprofeno"
```

Maestro es el estándar actual para React Native E2E porque corre en el simulador/emulador real sin necesitar un servidor de pruebas, y los tests en YAML son legibles para no desarrolladores.

---

### B4 — Errores críticos silenciados en tasks de background

- **Estado:** `[ ] Pendiente`
- **Archivos afectados:** [app/_layout.tsx](../app/_layout.tsx), [src/services/backgroundTask.ts](../src/services/backgroundTask.ts)
- **Categoría:** Observabilidad

**Problema:**
Los errores en tareas críticas se descartan silenciosamente:

```ts
// _layout.tsx
closeMissedDoses().catch((e) => console.warn("[closeMissedDoses]", e))
```

En producción (donde `console.warn` no es visible), estos errores desaparecen sin dejar rastro. Sentry ya está configurado — aprovechar:

```ts
// _layout.tsx
closeMissedDoses().catch((e) => {
  console.warn("[closeMissedDoses]", e)
  Sentry.captureException(e, { tags: { task: 'closeMissedDoses' } })
})

// backgroundTask.ts — en el catch del TaskManager
} catch (e) {
  console.warn("[BackgroundTask] reschedule failed:", e)
  Sentry.captureException(e, { tags: { task: BG_TASK_NAME } })
  return BackgroundFetch.BackgroundFetchResult.Failed
}
```

---

## Tracking rápido

| ID | Título | Prioridad | Estado |
|---|---|---|---|
| A1 | Accesibilidad: VoiceOver / TalkBack | 🔴 Alta | `[x]` |
| A2 | `predictiveBackGestureEnabled: false` global | 🔴 Alta | `[x]` |
| A3 | Notification map en AsyncStorage → SQLite | 🔴 Alta | `[x]` |
| M1 | AsyncStorage → react-native-mmkv para prefs | 🟡 Media | `[ ]` |
| M2 | Drizzle ORM para expo-sqlite | 🟡 Media | `[ ]` |
| M3 | Zustand slices + separar UI state | 🟡 Media | `[ ]` |
| M4 | `LayoutAnimation` fuera del store | 🟡 Media | `[ ]` |
| M5 | CSS variables en NativeWind para dark mode | 🟡 Media | `[ ]` |
| M6 | Hardcoded colors en tab bar | 🟡 Media | `[ ]` |
| M7 | `TouchableOpacity` → `Pressable` + ripple | 🟡 Media | `[ ]` |
| M8 | `setInterval` → `AppState` en Settings | 🟡 Media | `[ ]` |
| M9 | SQLite: WAL mode + índices faltantes | 🟡 Media | `[ ]` |
| M10 | `importBackup()` sin transacción | 🟡 Media | `[ ]` |
| M11 | Centralizar claves de storage en `config.ts` | 🟡 Media | `[ ]` |
| M12 | Validar backup importado con Zod | 🟡 Media | `[ ]` |
| M13 | `loadAll()` innecesario en focus de Today | 🟡 Media | `[ ]` |
| B1 | React Hook Form en MedicationForm | 🟢 Baja | `[ ]` |
| B2 | FlashList para listas largas | 🟢 Baja | `[ ]` |
| B3 | Tests automatizados (Jest + Maestro) | 🟢 Baja | `[ ]` |
| B4 | Errores de background task → Sentry | 🟢 Baja | `[ ]` |
