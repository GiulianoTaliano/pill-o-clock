# Copilot Instructions — Pill O-Clock

## Project overview

Pill O-Clock is a privacy-first medication management app. All data is local
(SQLite via Drizzle ORM). No accounts, no cloud sync, no analytics. The primary
audience includes elderly users, so accessibility is a first-class concern.

**Stack:** React Native 0.81 · Expo ~54 (New Architecture) · Expo Router v6 ·
NativeWind v4 · Zustand v5 · Drizzle ORM · expo-notifications + custom
expo-alarm (Kotlin/AlarmManager) · i18next (EN / ES) · Sentry

---

## Language policy

All code **must** be written in **English**. This includes:

- Variable names, function names, class names, and type/interface names.
- Code comments, JSDoc, and section dividers.
- Test descriptions (`describe`, `it`, `test` blocks), assertion messages, and
  test helper names.
- Commit messages and PR descriptions.
- Documentation files (except user-facing i18n translation values).

The only Spanish allowed is inside i18n translation value strings (`es.ts`) and document files.

---

## Coding conventions

### File naming
| Type | Convention | Example |
|------|-----------|---------|
| Components | `PascalCase.tsx` | `DoseCard.tsx` |
| Hooks | `useCamelCase.ts` | `useTodaySchedule.ts` |
| Store slices | `camelCase.ts` | `medications.ts` |
| Services | `camelCase.ts` | `notifications.ts` |
| DB / utils / types | barrel `index.ts` | `src/types/index.ts` |

### Components
- Named function exports (`export function DoseCard`), NOT `React.FC`.
- Route screens use `export default function`.
- Props typed with `interface {Name}Props` directly above the component.
- Hooks at the top: `useTranslation()`, `useAppTheme()`, store selectors, then
  `useState` / `useRef`.
- Handlers as named inline functions: `function handleTakePress() {}`.

### NativeWind (Tailwind)
- `className` for layout / spacing / typography.
- `style` for dynamic runtime colors (e.g. medication color, status theme).
- Semantic tokens defined as CSS variables in `global.css`: `text-text`,
  `text-muted`, `bg-background`, `bg-card`.
- Dark mode: `darkMode: "media"` — driven by CSS `prefers-color-scheme`. No
  `dark:` variants needed.

### Zustand store
- Single store (`useAppStore`) composed from slice creators.
- Each slice typed as `StateCreator<AppState, [], [], SliceInterface>`.
- Always select individual fields: `useAppStore(s => s.medications)`. Never
  destructure the whole store.
- Slice interfaces live in `src/store/types.ts`.

### Database (Drizzle + SQLite)
- Table names: `snake_case`, plural (`dose_logs`, `health_measurements`).
- Column names: `snake_case` in SQL, mapped to `camelCase` in TS.
- Primary keys: `text("id")` with UUID strings (no auto-increment).
- Booleans: `integer("...", { mode: "boolean" })`.
- Dates: `text` columns with `YYYY-MM-DD` or ISO 8601 strings.
- Indexes: explicit, prefixed `idx_`.

### Types
- `interface` for objects, `type` for unions / aliases.
- Enum-like values as union literals: `type SkipReason = "forgot" | "side_effect" | ...`.
- Create/update params via `Omit<Entity, "id" | "createdAt">`.

### Internationalization
- `i18next` + `react-i18next`. Spanish is the source language; English is the
  translation.
- Two-level nested keys: `namespace.key` → `doseCard.rescheduleTitle`.
- Access: `const { t } = useTranslation()`.

### Import order
1. React / React Native core
2. Third-party (`date-fns`, `expo-*`, `react-native-reanimated`)
3. Internal absolute paths (`../src/store`)
4. Relative siblings (`./AppPressable`)
5. Type-only imports use `import type`

### Error handling
- `try/catch` with state cleanup in `catch` (`set({ isLoading: false })`).
- No custom error classes. Errors re-thrown after cleanup.

### Other patterns
- Section dividers: `// ─── Section Name ──────────`
- Haptics before user-facing actions (`expo-haptics`).
- IDs: UUID v4 via `generateId()` (in `src/utils`).
- Icons: `@expo/vector-icons` Ionicons exclusively.
- Animations: `react-native-reanimated` with shared values.
- MMKV storage keys centralized in `src/config.ts` as `STORAGE_KEYS`.

---

## Architecture quick-reference

```
app/              → Expo Router screens (file-based routing)
components/       → Reusable UI components
src/
  config.ts       → MMKV keys, constants
  db/             → Drizzle schema, database init + migrations
  hooks/          → Custom React hooks
  i18n/           → Translations (en.ts, es.ts)
  services/       → Notifications, background tasks, backup, PDF
  store/          → Zustand store + slice creators
    slices/       → Individual slices (medications, appointments, health, ui)
    types.ts      → Combined AppState type
  types/          → Domain interfaces & type aliases
  utils/          → Pure helpers (generateId, date math, category config)
modules/
  expo-alarm/     → Native Kotlin module (AlarmManager)
  expo-widget/    → Native Kotlin module (Glance widget)
```

## Critical paths (handle with care)

1. **Dose lifecycle:** `markDoseTaken` / `markDoseSkipped` → update `dose_logs`
   → reschedule notifications → update widget.
2. **Notification scheduling:** Dual-track (Android: AlarmManager, iOS: chained
   expo-notifications). Always call `rescheduleAllNotifications` after any
   schedule or medication change.
3. **Background task:** `closeMissedDoses` upserts missed logs for 30 days back.
   Must run with fresh DB connection.
4. **Schema migrations:** Versioned `ALTER TABLE` in `database.ts`. Never drop
   columns — SQLite does not support it.
