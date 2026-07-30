# Pill O-Clock — Port a iOS (estado y pendientes)

> **Fecha:** 2026-07-24 · **Rama:** `main` · **Versión:** 1.7.0 (buildNumber iOS `"1"`)
> **Contexto:** Android va por 1.7.0 / versionCode 30, live en Google Play *internal testing*.
> **iOS nunca se compiló hasta ahora — este documento cubre el primer intento en un simulador de Mac** (sin cuenta paga de Apple Developer: el simulador no la requiere; la cuota de USD 99 es solo para dispositivo físico, TestFlight y App Store).

---

## 0. Resumen ejecutivo

La app está **sorprendentemente bien preparada para iOS**: el desarrollo Android ya dejó el
código *cross-platform*. Los 3 módulos nativos Android-only (`expo-alarm`, `expo-widget`,
`react-native-health-connect`) están **guardados con `Platform.OS` / `requireOptionalNativeModule`**,
así que en iOS son no-op y **no crashean al arranque**. Más aún, `notifications.ts` **ya tiene
escrita la rama de iOS** que agenda las dosis como cadenas de `expo-notifications`.

El único blocker para compilar y correr era de **entorno de build**, no de código — ya resuelto.

> ### ✅ MILESTONE 1 LOGRADO (2026-07-24): compila y arranca en el simulador
> `npx expo run:ios --device "iPhone 17"` → **Build Succeeded, 0 errores, 5 warnings**.
> La app se instaló y arrancó en el simulador (iPhone 17, iOS 26.5); el onboarding de
> Pill O-Clock renderiza y el home muestra "No medications today". **No crashea al inicio.**
>
> **Cómo se desbloqueó:** el primer intento falló en `pod install` con
> `Invalid Podfile file: Please upgrade XCode` — RN 0.81 exige **Xcode ≥ 16.1** por Podfile
> (`helpers.rb::min_xcode_version_supported = '16.1'`; `utils.rb::check_minimum_required_xcode`).
> La Mac estaba en macOS 14.3 (topa en Xcode 15.4). Se resolvió actualizando a
> **macOS 26.5 (Tahoe) + Xcode 26.6** (muy por encima del `>= 16.1`).
>
> **Ojo tras un upgrade mayor de macOS/Xcode:** hay que re-aceptar la licencia
> (`sudo xcodebuild -license accept`), correr `sudo xcodebuild -runFirstLaunch`, y
> **re-descargar el runtime del simulador** (`xcodebuild -downloadPlatform iOS`) — el upgrade
> borra los runtimes previos. El download queda **bloqueado si la licencia no está aceptada**.

> ### Hallazgos benignos detectados en runtime (no blockers)
> 1. **Warning de Google Mobile Ads en build:** `ios_app_id key not found in
>    react-native-google-mobile-ads key in app.json. App will crash without it.` →
>    **falso positivo**: el config plugin (forma `["react-native-google-mobile-ads", {iosAppId}]`)
>    **sí** inyectó `GADApplicationIdentifier` al `Info.plist` (test id `...~1458002511`). El
>    warning lo emite otro script de la SDK v15.7 que busca una key *top-level*
>    `react-native-google-mobile-ads` (ausente). El plist ya tiene el id → no crashea. **No se
>    toca app.json** (compartido con el build de Android en producción).
> 2. **Ruido `SQLiteErrorException: duplicate column` en el log nativo al iniciar:** cada
>    `ALTER TABLE ADD COLUMN` del runner de migraciones (`src/db/database.ts`) está envuelto en
>    `try { } catch { /* already exists */ }`. En install fresco, el `CREATE TABLE` inicial ya
>    crea columnas que las migraciones incrementales reintentan agregar → "duplicate column",
>    **capturado y tragado por el JS**. `expo-sqlite` loguea la excepción a nivel Swift *antes*
>    del catch. Benigno, pre-existente y **cross-platform** (pasa igual en Android). Esquema final
>    correcto. Candidato a limpieza futura (init idempotente), no urgente.

> ### ✅ MILESTONE 2 VALIDADO (2026-07-24): notificación de dosis dispara en el simulador
> Flujo real recorrido en el simulador (iPhone 17): **Add → "New medication"** (5 pasos) →
> nombre "IBUPROFENO FECOFAR 600" (autocompletado desde el **catálogo ANMAT** — funciona en iOS),
> dose 1 tab., **Daily/Recurring**, alarma a una hora ~4 min en el futuro, Days = All → **Add
> medication**. Guardó **sin crashear** (el home pasó a "1 pending"), y a la hora agendada
> **la notificación se entregó**: 💊 *"Time to take IBUPROFENO F…" · "Dose: 1 tab. · Expand to
> see options"* en la pantalla de bloqueo.
>
> Confirma end-to-end: `scheduleDoseChain` rama iOS → `expo-notifications` agenda y **dispara**;
> el permiso de notificaciones estaba concedido; la categoría `DOSE_REMINDER` con acciones
> (Take/Snooze/Skip) está adjunta ("Expand to see options"); y **no** se llamó al módulo nativo
> Android (`ExpoAlarm`) — sin "native module not found" en el log.
>
> **Nota MCP simulador:** tras el upgrade de Xcode, el panel/taps del MCP se recuperan
> **reiniciando la sesión de Claude Code** (en la sesión del upgrade quedaban con el CoreSimulator
> viejo). Reiniciada la sesión, `attach`/tap/swipe/screenshot funcionan normal.

---

## 1. Entorno de build — estado (Mac)

| Prerequisito | Estado |
|---|---|
| Node | ⚠️ **v25.8.1** — más nuevo que lo que Expo SDK 54 soporta oficialmente (Node 20/22 LTS). Hasta ahora **no bloqueó nada**: `npm install`, `prebuild` y `jest` (322/322) corrieron bien. Si el build nativo tira algo raro, primera sospecha: bajar a Node 22 LTS. |
| Homebrew | ✅ 6.0.12 |
| CocoaPods | ✅ 1.17.0 (instalado vía `brew install cocoapods`) |
| Command Line Tools | ✅ presentes (`/Library/Developer/CommandLineTools`) |
| **Xcode completo** | 🚧 **FALTA** — blocker principal. Sin `Xcode.app` no hay SDK de iOS, ni simulador, ni `xcodebuild` para iOS. Instalar desde Mac App Store (7-15 GB). |
| Runtime de simulador iOS | 🚧 **FALTA** — `xcrun simctl list runtimes` vacío (se resuelve al instalar Xcode / `xcodebuild -downloadPlatform iOS`). |
| Watchman | ⚠️ ausente (opcional; Metro anda igual, mejora el file-watching). |

### Nota sobre CocoaPods y el locale
El primer `pod install` falló con
`Unicode Normalization not appropriate for ASCII-8BIT (Encoding::CompatibilityError)`.
Es un clásico de CocoaPods cuando el shell no tiene un locale UTF-8. **Fix:** exportar
`LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` antes de `pod install`. Con eso, `pod install`
completó: 114 dependencias, 118 pods, workspace `PillOClock.xcworkspace` creado.

> El warning `[!] Unexpected XCode version string ''` durante `pod install` es **por falta de
> Xcode completo** (xcodebuild -version devuelve vacío apuntando a las CLT). Es inofensivo para
> pods y desaparece al instalar Xcode + cambiar el `xcode-select`.

---

## 2. Pasos completados (sin Xcode)

1. ✅ `npm install` (exit 0).
2. ✅ `npx expo prebuild -p ios --no-install` → generó `ios/` limpio
   (`PillOClock.xcodeproj`, Podfile, sentry.properties). Único warning: `userInterfaceStyle`
   (ignorado porque `UIUserInterfaceStyle` ya está en `infoPlist`) — cosmético.
3. ✅ `cd ios && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install` → workspace + 118 pods.
4. ✅ `npx jest` → **322/322** verdes bajo Node 25 (toolchain JS sano).

> `ios/` está **gitignoreado** (nativo, regenerable con prebuild). No se comitea.

---

## 3. Pasos pendientes (requieren Xcode instalado)

```bash
# 1) Apuntar xcode-select al Xcode completo (necesita contraseña de admin).
#    Muchas veces el App Store ya lo deja apuntado; verificar con `xcode-select -p`.
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer

# 2) Aceptar la licencia (necesita contraseña).
sudo xcodebuild -license accept

# 3) Bajar el runtime del simulador de iOS si falta.
xcodebuild -downloadPlatform iOS

# 4) Compilar y correr en el simulador.
npx expo run:ios
```

> Sentry: el token solo lo pide el build de **release**; para simulador/dev **no hace falta**.
> Si algún paso lo exige, se puede desactivar temporalmente el plugin `@sentry/react-native`
> en `app.json`.

---

## 4. Auditoría de módulos nativos Android-only (¿rompen iOS?)

| Módulo / uso | Guard | ¿Rompe el arranque en iOS? |
|---|---|---|
| `modules/expo-alarm` | `requireOptionalNativeModule("ExpoAlarm")` → `null` en iOS; toda la API JS chequea `isAvailable` (`Platform.OS==="android" && módulo!=null`) y hace early-return. | ❌ No — no-op seguro. |
| `modules/expo-widget` | `Platform.OS==="android" ? requireNativeModule(...) : null`; `updateWidget`/`isWidgetAvailable` usan `?.` con fallback. | ❌ No — no-op seguro. |
| `react-native-health-connect` (`src/services/healthSync.ts`) | `isHealthSyncSupported()`/`isHealthSyncEnabled()` = `Platform.OS==="android"`; `syncMeasurementToHealthConnect`/`enableHealthSync` cortan antes de tocar el nativo. | ❌ No — sync de salud deshabilitada elegantemente. |
| `expo-intent-launcher` (notifications, appointments, AppointmentDetailModal) | Llamadas dentro de rama `Platform.OS==="android"`; en iOS se usa `Sharing.shareAsync` / early-return. | ❌ No. |
| `expo-intent-launcher` (`app/onboarding.tsx` → `handleOpenFullScreen`) | ⚠️ **Sin guard de `Platform`**, pero es UI de permiso *full-screen-intent* (Android-only), **user-triggered** y envuelta en `try/catch`. | ❌ No rompe el boot. Cosmético: idealmente no mostrar/gatear esa UI en iOS. |
| `react-native-google-mobile-ads` (`src/services/ads.ts`, `AdBanner.tsx`) | En iOS devuelve **test unit ids** de Google (no monetiza); `iosAppId` es el TEST id. | ❌ No. Seguro por diseño. |

**Conclusión:** no se detectaron landmines nativos de arranque para iOS. El milestone "compilar +
arrancar" debería depender **solo** de que Xcode esté instalado.

---

## 5. Modelo de recordatorios: Android vs iOS (ya implementado)

`src/services/notifications.ts` es *cross-platform* de fábrica:

- **Android:** `ExpoAlarm.scheduleAlarm()` (AlarmManager `setAlarmClock`) → full-screen intent,
  `AlarmAudioService`, suena hasta interacción. Un alarm por dosis, sin cap de scheduling.
- **iOS:** cadenas de `expo-notifications` (`scheduleDoseChain`, rama iOS líneas ~424-448):
  notificación inicial + `MAX_REPEATS` repeticiones cada `REPEAT_INTERVAL_MINUTES`.
  - `DAYS_AHEAD = 3` y `MAX_REPEATS = 2` en iOS para no pasar el **cap duro de 64
    notificaciones locales** pendientes.
  - `interruption level` / *critical alerts*: el entitlement
    `com.apple.developer.usernotifications.critical-alerts` ya está declarado en `app.json`.
    El simulador **ignora el provisioning del entitlement**, así que no bloquea correr; en
    dispositivo real requiere aprobación de Apple.

> Esto significa que el **milestone 2** ("agendar la alarma como notificación iOS") ya está en el
> código — y quedó **validado en runtime** en el simulador (2026-07-24, ver §0).

---

## 6. Cross-platform que debería andar sin cambios (todo JS)

Catálogo de medicamentos (RxTerms/US + ANMAT/AR), escáner de barcode (`expo-camera`),
detección de país (`expo-cellular` + fallback timezone), regímenes (incl. mensual por día del mes),
backup cifrado (SQLCipher), Face ID (`expo-local-authentication`), i18n (es/en/pt), TTS,
ubicación de turnos (`expo-location` + Google Maps).

> **A verificar en el simulador:** la **cámara** del simulador de iOS no captura video real
> (no hay hardware), así que el **escáner de barcode** no se puede probar de punta a punta ahí;
> requiere dispositivo físico o inyección de imagen. El resto es JS puro y debería funcionar.

### Resultados del recorrido en el simulador (milestone 3, 2026-07-24)

| Feature | Resultado en iOS |
|---|---|
| **Dosis perdida (missed)** | ✅ La dosis no tomada pasó a "1 missed" con Missed/Skip/Mark as taken. |
| **Catálogo ANMAT (autocompletado)** | ✅ Sugerencias del Vademécum ANMAT al tipear el nombre. |
| **Detección de país / geolocalización** | ✅ El mapa/turnos default a Buenos Aires (`-34.60370, -58.38150`). |
| **Health tab** | ✅ Renderiza; **sin UI de Health Connect sync** (correcto: `isHealthSyncSupported()` la oculta en iOS). |
| **Health: guardar medición (presión)** | ✅ Guardó "125/82 mmHg" sin crashear → `syncMeasurementToHealthConnect` corta por el guard en iOS. |
| **AdMob banner** | ✅ Renderiza el **test banner** ("AdMob Adaptive Banner · Test mode") en iOS. Confirma que el warning de ads es falso positivo y no crashea. |
| **Settings** | ✅ Renderiza (Snooze, App lock, Profiles, Allergies, Emergency card). |
| **App lock / Face ID** | ⚠️ UI presente (`expo-local-authentication`). Testeo profundo requiere **enrolar biometría** en el simulador (menú Features → Face ID → Enrolled de Simulator.app). |
| **Turnos (form)** | ✅ Renderiza (Title/Doctor/Location/Date/Time/Reminder/Notes). |
| **🔴 Mapa (Pin on map / turnos)** | ❌ **Mapa en blanco en iOS.** Ver §7. |
| **Escáner de barcode** | ⏸️ No testeable en simulador (sin cámara). Pendiente en device real. |
| **Regímenes (mensual/taper/cycle)** | ✅ El wizard muestra las opciones (Normal/Every N days/Cycle/Monthly/Taper); lógica cubierta por los 322 tests. |
| **Backup/export, selector de región, idioma** | ⏸️ No alcanzados: están *below-the-fold* en Settings y **los gestos de scroll inyectados no mueven los ScrollView de Fabric** (limitación de la automatización del simulador, no bug de la app — los taps sí funcionan). |

---

## 7. Pendientes de iOS más allá de "compilar y correr"

| Pendiente | Prioridad | Notas |
|---|---|---|
| ~~Validar cadena de notificaciones de dosis en runtime~~ | ✅ Hecho | Validado 2026-07-24: la notificación de dosis dispara en el simulador (ver §0). |
| ~~Mapa (Google Maps) no renderiza en iOS~~ | ✅ Arreglado | **Fix aplicado (Opción A):** `LocationPickerModal.tsx` ahora usa `provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}` → iOS cae a **Apple Maps** (MapKit, sin API key ni SDK extra). Verificado en el simulador: el mapa de Buenos Aires renderiza y el error de AirGoogleMaps desapareció. Detalle en §9. |
| **Recorrer resto de features cross-platform (milestone 3)** | Media | Hecho en gran parte (ver §6). Falta por tooling/setup: backup/export + región (scroll), escáner (cámara), Face ID (enrolar biometría). |
| **Widget de home (WidgetKit)** | Baja | `expo-widget` es Android-only; iOS sería WidgetKit (otro mundo). Hoy es no-op seguro. |
| **HealthKit** | Baja/Media | Equivalente iOS de Health Connect. Hoy la sync de salud queda deshabilitada en iOS. |
| **Alarma crítica en dispositivo real** | Media | El entitlement de critical-alerts requiere aprobación de Apple; el simulador lo ignora. |
| **Escáner de barcode en device real** | Media | La cámara del simulador no sirve para probarlo end-to-end. |
| **Icono de onboarding full-screen-intent en iOS** | Cosmético | Gatear/ocultar `handleOpenFullScreen` en iOS. |

---

## 8. Comando "todo en uno" para retomar (una vez con Xcode)

```bash
# desde la raíz del repo
xcode-select -p                      # confirmar que apunta a Xcode.app (no a CLT)
xcrun simctl list runtimes | grep iOS  # confirmar que hay un runtime de iOS
npx expo run:ios                     # compila + abre el simulador
# (si pod install se re-ejecuta y falla por locale:)
#   cd ios && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install && cd ..
```

---

## 9. 🔴 Mapa (Google Maps) en iOS — detalle y opciones de fix

**Síntoma:** al abrir "Pin on map" (turnos), el mapa aparece **en blanco** y salta el error
`react-native-maps: AirGoogleMaps dir must be added to your Xcode project to support Google Maps on iOS`.
El overlay (pin, búsqueda, coordenadas) sí renderiza; faltan solo los **tiles** del mapa.

**Causa:** `components/LocationPickerModal.tsx:479` usa `provider={PROVIDER_GOOGLE}` en ambas
plataformas (decisión deliberada del dev, por `customMapStyle`/dark-mode y consistencia visual).
En Android, Google Maps es el default. En **iOS**, `PROVIDER_GOOGLE` requiere el **Google Maps SDK
para iOS** linkeado nativamente (subspec `AirGoogleMaps` de react-native-maps). Hoy:
- No hay config plugin de `react-native-maps` en `app.json` → el SDK de Google Maps iOS **no se
  instala/linkea** en el prebuild.
- Inyectar la API key vía `app.config.ts` (`ios.config.googleMapsApiKey`) **no basta** — eso solo
  la pone en el Info.plist; no linkea el SDK.
- Además, en este entorno de dev **no hay `.env.local`**, así que `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`
  está vacía (bloqueo secundario).

> Ojo: `components/AppointmentDetailModal.tsx:399` usa `<MapView>` **sin** `provider`, así que ese
> mapa (ver un turno guardado) caería a **Apple Maps** en iOS y probablemente sí renderiza.
> La inconsistencia es solo del `LocationPickerModal`.

### Opción A — Apple Maps en iOS (rápida, recomendada para "que funcione")
Guardar el provider por plataforma:
```tsx
provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
```
- ✅ Funciona **sin API key y sin SDK extra** (MapKit es nativo de iOS).
- ✅ Cambio chico y seguro para Android (mantiene `PROVIDER_GOOGLE` allá).
- ⚠️ Apple Maps **ignora `customMapStyle`** → se pierde el dark-mode del mapa en iOS.

### Opción B — Google Maps real en iOS (fiel al diseño original)
Configurar el Google Maps SDK para iOS en el prebuild (config plugin de `react-native-maps` /
Podfile) **y** proveer una API key válida con *Maps SDK for iOS* habilitado
(`EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`).
- ✅ Mantiene dark-mode + consistencia con Android.
- ⚠️ Más setup nativo; requiere la key presente en build; más superficie que mantener.

**Resuelto (2026-07-24): se aplicó la Opción A.** `LocationPickerModal.tsx` ahora usa
`provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}` (+ comentarios actualizados en
el header y en `DARK_MAP_STYLE`). Android sigue con Google Maps intacto; iOS usa Apple Maps.
Verificado en el simulador (mapa de Buenos Aires renderiza, sin el error de AirGoogleMaps) y los
**322 tests siguen verdes**. Se pierde el dark-mode del mapa solo en iOS (Apple Maps sigue el
appearance del sistema). Si más adelante se quiere Google Maps en iOS, ver Opción B.

### 9.1 Búsqueda de dirección (autocompletado) — 2 problemas y su fix

Al probar el picker aparecieron dos problemas del buscador de direcciones:

1. **Sin sugerencias al escribir (en el sim).** El autocompletado usa las **web APIs de Google**
   (Places Autocomplete + Geocoding) con `key=${GOOGLE_MAPS_API_KEY}`. En dev **no hay `.env.local`**
   → key vacía → `REQUEST_DENIED` → sin sugerencias. **No es un bug**: en el build de Android la key
   viene por EAS secret. Para probar las sugerencias de Google en el sim hay que crear `.env.local`
   con `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=...` (con *Places API* + *Geocoding API* habilitadas).

2. **La dirección elegida/escrita no movía el pin (discrepancia — también en Android).** En
   `handleSelectSuggestion` se seteaba el texto **antes** de resolver las coords; si el `Place Details`
   de Google fallaba (o no había key), el pin nunca se movía → se guardaba la dirección escrita con
   las **coords viejas**. Lo mismo al escribir a mano: nada geocodificaba el texto.

**Fix aplicado (encaja con el switch a Apple Maps):** resolver coords con el **geocoder del SO**
(`expo-location` → `Location.geocodeAsync`, Apple en iOS / Android nativo, **sin API key**):
- `handleSelectSuggestion`: resuelve coords en orden 1) coords de la predicción, 2) Google Place
  Details (solo si hay key), 3) **fallback al geocoder del SO** sobre la descripción. Así el pin
  **siempre** sigue a la selección → se elimina la discrepancia (arregla también Android).
- Nuevo `handleSubmitSearch` (Enter/"search"): geocodifica el texto con el SO y mueve el pin →
  la búsqueda por dirección **funciona sin la key de Google**.
- `fetchAutocomplete`: si no hay key, corta temprano (evita requests condenadas).

**Verificación:** el geocoder del SO resuelve sin key (log real: *"Avenida Cabildo 2000, Buenos
Aires"* → `{ -34.5631, -58.4562 }`, Belgrano). 322 tests verdes. **Caveat:** la animación del mapa
no se pudo confirmar *visualmente* en el sim por un bug conocido **solo del simulador de iOS**:
Apple Maps (capa Metal) se pone en negro cuando el teclado aparece encima (el proceso sigue vivo,
sin errores JS; el home renderiza bien; en device real Apple Maps + teclado anda normal). **Validar
el flujo completo del picker en un iPhone real** queda como pendiente junto con el resto de ítems de
device real.

---

## 10. Probar en iPhone real con Apple ID gratis (sin los USD 99)

Se puede instalar un build de desarrollo en un iPhone propio con un **Apple ID gratis**
("Personal Team") — sin cuenta paga. Limitaciones: el build **caduca a los 7 días** (reinstalar),
máx. 3 apps así, y hay que **confiar** el certificado en el iPhone.

**Bloqueo específico de esta app:** un Apple ID gratis **no puede firmar** dos entitlements que la
app declara:
- `com.apple.developer.usernotifications.critical-alerts` (paga + aprobación de Apple).
- `aps-environment` (**Push Notifications**, lo agrega expo-notifications). La app solo usa
  notificaciones **locales**, así que sacarlo **no afecta** los recordatorios.

Ambos se stripean con `scripts/strip-ios-entitlements.mjs` **después** del prebuild (no se puede
hacer con un config plugin: `aps-environment` lo inyecta un mod core de Expo que corre después de
todos los plugins de usuario; editar el archivo generado es a prueba de orden). `app.json` /
`app.config.ts` quedan **intactos** → los builds de producción/EAS conservan los entitlements.

### Flujo
```bash
# 1) prebuild + strip + abre Xcode (un solo comando)
npm run ios:free-device
#    equivale a:
#    npx expo prebuild -p ios --no-install \
#      && node scripts/strip-ios-entitlements.mjs \
#      && open ios/PillOClock.xcworkspace
```
2. En **Xcode**: conectá el iPhone por USB (desbloqueá + "Confiar"). Target **PillOClock** →
   pestaña **Signing & Capabilities** → **Team**: elegí tu *Personal Team* (tu Apple ID; si no
   aparece, agregalo en Xcode → Settings → Accounts).
3. Elegí tu iPhone como destino y **Run** (▶).
4. En el iPhone: **Ajustes → General → VPN y gestión de dispositivos** → confiá tu certificado de
   desarrollador. Reabrí la app.

> ⚠️ **No usar `npx expo run:ios --device`** para este flujo: re-corre prebuild y **re-agrega** los
> entitlements → la firma falla. Buildear desde **Xcode** (que no re-corre prebuild) tras el strip.
>
> Las **notificaciones locales** (recordatorios de dosis) funcionan igual sin `aps-environment`.
> Este flujo es **solo para test de dev** — producción/TestFlight/App Store necesitan los
> entitlements reales y cuenta paga.
