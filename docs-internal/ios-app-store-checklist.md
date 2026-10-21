# Pill O-Clock en el App Store — todo lo que falta para publicar

> **Fecha:** 2026-10-10 · **Base:** `main` @ 18aa8d2 (1.8.0, buildNumber iOS `"1"`)
> **Punto de partida:** la app compila y corre en el simulador y la notificación de dosis
> dispara ([ios-port.md](ios-port.md)). **Nunca se firmó para distribución ni se subió a
> App Store Connect.** Este documento junta lo que falta: cuenta, decisiones, cambios de
> código, metadatos y pruebas. Los hallazgos de código se verificaron contra el repo y
> contra la config resuelta (`npx expo config --type introspect`). Los requisitos de Apple
> se investigaron en fuentes oficiales (ver §9); lo no verificado está marcado.

> ### Estado al 2026-10-10 (tarde)
> - **Cuenta:** inscripción individual en Apple Developer **en curso** (D1).
> - **Decisiones tomadas:** D2 sin anuncios en iOS v1 · D4 `supportsTablet: false` ·
>   D5 UE excluida en v1 (además falta soporte de catálogo por país) · D8 EAS Build.
>   Siguen abiertas, con recomendación: D3 (pedir critical alerts), D6 (cifrado) y D7
>   (categoría). Se resuelven al cargar App Store Connect.
> - **Rama `fix/privacy-policy-ads`:** resuelve R3 y R12, y hace que `adsEnabled()` sea
>   solo Android (D2). Fichas de tienda y README con contacto real.
> - **Rama `chore/ios-release-readiness`:** resuelve R1, R2, R4, R5, R7, R8, R9, R10 y R11
>   (§4). **Falta validarla con un prebuild real**: Expo no genera el proyecto iOS en
>   Windows. Se valida en la Mac (`npx expo prebuild -p ios --clean`) o con el primer
>   build en EAS.
> - **Pendientes:** R6 (UMP para Android en EEE/UK), R13, R14 (fichas iOS) y todo §5–§6.

---

## 0. Resumen

**Lo que bloquea hoy (sin esto no se sube o no se aprueba):**

1. **Cuenta de Apple Developer** (USD 99/año). Como monotributista va **individual**:
   Apple no acepta a un *sole proprietor* como organización aunque tenga D-U-N-S.
2. **El entitlement `critical-alerts` rompe la firma del build de release.** Apple tiene que
   aprobarlo a mano y EAS no lo puede sincronizar. Hay que sacarlo de `app.json`.
3. **La política de privacidad publicada es falsa:** dice que la app no tiene SDK de
   publicidad (AdMob está activo desde PR #114) y el email de contacto
   `privacy@pilloclock.app` apunta a un dominio que no existe. **Esto afecta también a
   Google Play, hoy.**
4. **Textos de permisos genéricos** ("Allow $(PRODUCT_NAME) to access your photos"), entre
   ellos uno de micrófono que la app no usa. Es causa típica de rechazo por la guía 5.1.1.
5. **Anuncios en iOS con IDs de prueba** y sin SKAdNetwork ni consentimiento. Hay que
   decidir si los anuncios van en iOS v1 (decisión D2).
6. **Metadatos, capturas, etiqueta de privacidad, export compliance, clasificación por
   edad y declaración de dispositivo médico** en App Store Connect. Nada de eso existe todavía.

**Costo:** USD 99/año (Apple). EAS Build gratis alcanza: 15 builds de iOS por mes.

---

## 1. Hallazgos en el repo

| # | Hallazgo | Evidencia | Arreglo | ¿Afecta Android? |
|---|---|---|---|---|
| R1 | `critical-alerts` declarado sin aprobación de Apple: la firma de release falla ("provisioning profile doesn't include…") | `app.json` → `ios.entitlements` | Sacarlo. Pedirlo a Apple en paralelo (ver D3) | No |
| R2 | El código usa `interruptionLevel: "timeSensitive"` como fallback, pero **falta la capability** `com.apple.developer.usernotifications.time-sensitive`, así que iOS lo degrada a una notificación normal y no atraviesa Focus | `src/services/notifications.ts:144` | Agregar `"com.apple.developer.usernotifications.time-sensitive": true`. No requiere aprobación y EAS la sincroniza sola | No |
| R3 | La política de privacidad publicada dice *"the App contains no advertising SDK"*. También: contacto `privacy@pilloclock.app` (el dominio no resuelve), "Play Store" como única tienda (§9) y no menciona Apple Maps ni el geocoder del sistema en iOS | `docs/privacy-policy.html` (en vivo en estudiotaliano.com) | Reescribir §4 (AdMob: qué datos, anuncios no personalizados), contacto real, texto neutral respecto de la tienda, mencionar Apple en iOS | **Sí, ya está publicada** |
| R4 | Textos de permisos genéricos: `NSPhotoLibraryUsageDescription` (lo pone expo-image-picker por defecto), `NSMicrophoneUsageDescription` (lo ponen expo-camera y expo-image-picker; **la app no graba audio**), `NSLocationAlways*` (la app solo pide "when in use") | introspect | Plugins: `expo-image-picker` con `photosPermission` propio y `microphonePermission: false`; `expo-camera` con `microphonePermission: false`; `expo-location` con `locationAlways*: false` | No |
| R5 | Textos de permisos solo en inglés; la app es es/en/pt | `app.json` | `expo.locales` con `InfoPlist.strings` es/pt | No |
| R6 | Anuncios iOS: `getBannerUnitId` devuelve siempre el ID de prueba en iOS; `iosAppId` es el de prueba de Google; sin `skAdNetworkItems`; **sin consentimiento UMP/TCF para EEE/UK/Suiza** | `src/services/ads.ts:47`, `app.json` | Según D2 | **UMP: sí** (Google lo exige en las dos plataformas para EEE/UK) |
| R7 | `UIBackgroundModes: remote-notification` sin push. Es un modo de fondo sin uso (riesgo 2.5.4) | `app.json` → `ios.infoPlist` | Sacar `remote-notification`. `aps-environment` lo agrega expo-notifications y **conviene dejarlo** (sacarlo genera el warning ITMS-90078) | No |
| R8 | `supportsTablet: true`: en iPad la app rota a las 4 orientaciones (`UIRequiresFullScreen: false`) con un layout pensado para retrato, y exige capturas de iPad 13" | introspect | `supportsTablet: false` (ver D4) | No |
| R9 | Sin declaraciones de privacy manifest propias | `app.json` | `ios.privacyManifests` con UserDefaults CA92.1, FileTimestamp C617.1, SystemBootTime 35F9.1 y DiskSpace E174.1 | No |
| R10 | Si `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` está definida en el build, Expo **linkea el SDK de Google Maps para iOS** e inicializa `GMSServices`, aunque iOS usa Apple Maps (ese SDK es peso y superficie de privacidad de más) | `app.config.ts:22-24`, `@expo/config-plugins/build/ios/Maps.js` | Sacar `ios.config.googleMapsApiKey`. El JS sigue leyendo la key para Places | No |
| R11 | `eas.json` no tiene perfil de build ni de submit para iOS. `.env.local` no viaja a EAS (está en gitignore) | `eas.json` | Perfil `production` iOS. Variables en EAS: `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`, `SENTRY_AUTH_TOKEN` | No |
| R12 | El link de privacidad en Ajustes apunta a github.io (funciona por el 301) | `app/(tabs)/settings.tsx:924` | Apuntar a `https://estudiotaliano.com/pill-o-clock/privacy-policy.html` | Sí (cosmético) |
| R13 | `expo-background-fetch` está deprecado ("will be removed") | `src/services/backgroundTask.ts` | No bloquea v1. Migrar a `expo-background-task` más adelante (agrega `processing` + `BGTaskSchedulerPermittedIdentifiers`) | Sí (a futuro) |
| R14 | Las fichas de tienda hablan de Android: widget, "Android 14+", TalkBack, "alarma que suena aunque esté en silencio". En iOS sin critical alerts eso **no es cierto** (guías 2.3.1 y 2.3.10) | `store/play-store-*.txt` | Crear `store/app-store-{es,en,pt}.txt` específicos de iOS | No |

**Verificado que está bien:**

- Ícono 1024×1024 RGB sin alfa.
- `alarm.wav` dura 16 s, por debajo del límite de 30 s para sonidos de notificación.
- La UI exclusiva de Android (full-screen intent, alarma exacta, selector de tonos) está protegida con `Platform.OS` en onboarding y Ajustes.
- El presupuesto de 64 notificaciones de iOS está contemplado.
- Hay textos de Face ID y de cámara.
- Hay link a la política dentro de la app.
- El aviso médico aparece en alergias, insights y el PDF.
- Expo SDK 54 en EAS usa Xcode 26, que cumple el requisito vigente desde el 28-abr-2026 (Xcode 26 + iOS 26 SDK).

---

## 2. Cuenta de Apple Developer

- **Tipo:** **individual**. Apple es explícita: *"If you are a sole proprietor/single-person
  business, you must join as an individual and your legal name will appear as the seller."*
  El D-U-N-S de CIAL no habilita una cuenta de organización: hace falta una entidad legal
  (por ejemplo una SAS; no está validado con un contador).
- **Vendedor visible en la ficha:** tu nombre legal, no "Pill O-Clock" ni "Estudio Taliano".
  Se puede migrar a organización más adelante, pero Apple solo dice *"contact us"*: la
  entidad tiene que cumplir todos los requisitos.
- **Pasos:**
  1. Apple Account con verificación en dos pasos.
  2. Inscribirse en developer.apple.com/programs/enroll o en la app **Apple Developer**,
     que verifica identidad con DNI o pasaporte. No está confirmado que la app lo ofrezca
     en Argentina; hay un caso de un usuario argentino en mayo de 2026.
  3. Pagar USD 99 con **tarjeta a tu nombre**. Si no, Apple pide documento.
- **Tiempo:** una cuenta individual suele aprobarse con el pago o en pocos días. Una
  cuenta de organización tarda de 10 días a más de 2 meses, según los foros.
- **Después:**
  - Crear una **App Store Connect API key** (.p8 + key ID + issuer ID) para EAS Submit.
    `eas credentials` la puede generar.
  - Registrar el bundle ID `com.pilloclock.app`.
  - Crear el registro de la app en App Store Connect. **Eso reserva el nombre.**

**Riesgo de la guía 5.1.1(ix): MEDIO.** La guía dice que las apps de *"highly regulated
fields (… healthcare …) or that require sensitive user information"* deben enviarlas
entidades legales. Hay rechazos documentados con *"must be enrolled as an organization"*,
pero son de apps de información médica y de turnos, no de recordatorios de pastillas.
También hay pill trackers activos de personas individuales. Que la app no tenga cuentas
ni servidor juega a favor. **Mitigaciones:**

- Notas para App Review claras (§5.8).
- Categoría primaria Health & Fitness (D7).
- Aviso de "consultá a tu médico" visible.
- Chequeo de alergias presentado como informativo.
- Nada de cálculo de dosis.
- Anuncios fuera de iOS v1 (D2).

**Si igual rechazan por 5.1.1(ix):** constituir la entidad y pedir la migración. Es el
mismo camino que obligó a Google, pero con la diferencia de que acá un monotributo no alcanza.

---

## 3. Decisiones que tenés que tomar

| # | Decisión | Opciones | Recomendación |
|---|---|---|---|
| D1 | Tipo de cuenta | Individual ahora / SAS primero | **Individual ahora.** La SAS solo si App Review la exige |
| D2 | Anuncios en iOS v1 | (a) **apagados en iOS**; (b) prendidos sin ATT, con anuncios no personalizados: app de AdMob iOS real + 2 unidades, `skAdNetworkItems` (`cstr6suwn9` + lista de Google), UMP para EEE/UK y etiqueta de privacidad con los datos de AdMob; (c) prendidos con ATT, que exige prompt de tracking, `NSUserTrackingUsageDescription` y declarar *tracking* | **(a) para v1.** Baja el riesgo de 5.1.1(ix), 2.5.18 y 5.1.3, simplifica la etiqueta y evita ATT/SKAdNetwork. Se prende en una 1.x cuando la app esté aprobada. **Ojo:** UMP falta igual en Android para EEE/UK |
| D3 | Critical alerts | Sacar y pedir en paralelo / sacar y olvidarse | **Sacar ya y pedirlo** (developer.apple.com/contact/request/notifications-critical-alerts-entitlement/). Hay pocas chances: Apple rechazó en 2025 un recordatorio de medicación ("apps that can't enforce that usage…"). El código ya degrada a `timeSensitive` |
| D4 | iPad | `supportsTablet: true` / `false` | **`false`.** Sin capturas de iPad y sin landscape. Igual corre en iPad en modo compatibilidad y App Review puede probarla ahí (guía 2.4.1) |
| D5 | Unión Europea (DSA) | Declararse *trader*: dirección, teléfono y email **públicos** en las 27 tiendas de la UE / excluir la UE en Disponibilidad | Si no querés publicar la dirección, **excluir la UE en v1**. Con anuncios corresponde declararse *trader*. Sin declarar, Apple saca la app de la UE. No verificado: si con la UE excluida igual pide la declaración |
| D6 | Cifrado (export compliance) | Mantener `@noble` (XChaCha20 + scrypt para backups) / migrar a CryptoKit | **Mantener y responder la verdad:** "Standard algorithms… in addition to the OS". SQLCipher usa CommonCrypto (del sistema) y `@noble` no. Francia: Apple lista las apps médicas como exentas de la declaración francesa; si el diálogo la pide, excluir Francia. **No poner `usesNonExemptEncryption: false` a ciegas**: fijarlo después del primer diálogo |
| D7 | Categoría | Medical / Health & Fitness | **Primaria Health & Fitness, secundaria Medical.** Medisafe y MyTherapy van en Medical, pero con cuenta individual conviene menos escrutinio. Las dos disparan la declaración de dispositivo médico (respuesta: No) |
| D8 | Dónde se compila | EAS Build (nube; se maneja desde Windows y firma solo) / Xcode en la Mac | **EAS Build** para release y TestFlight. La Mac queda para simulador, capturas y depuración |

---

## 4. Cambios de código y configuración (un PR: `chore/ios-release-readiness`)

> **Implementado el 2026-10-10.** Así quedó la configuración resuelta: sin
> `NSMicrophoneUsageDescription`, sin `NSLocationAlways*`, sin `GMSApiKey`, con
> `time-sensitive` y sin `critical-alerts`, iPhone solo y los 4 motivos del privacy manifest.
> Diferencias con el borrador de abajo:
> - **No** se usó `cameraPermission: false` en expo-image-picker. Esa opción **borra** el
>   `NSCameraUsageDescription` de expo-camera (rompería el escáner) y bloquea `CAMERA` en
>   Android.
> - `delayAppMeasurementInit: true` en el plugin de anuncios: con los anuncios apagados en
>   iOS, el SDK no inicia la medición al abrir la app.
> - `eas.json` usa `appVersionSource: "remote"` + `autoIncrement` en iOS. EAS lleva el
>   buildNumber, así que el `"1"` de `app.json` queda solo como valor inicial.
> - Los textos traducidos van en `locales/{es,pt,en}.json`, bajo la clave `ios`, para no
>   generar strings de Android.

Todo esto vive en `app.json` y `app.config.ts`. **No afecta los builds de Android**:
`android/` es persistente y no corre prebuild. La excepción son R3 y R12.

```jsonc
// app.json → expo.ios (borrador; los textos finales en es/en/pt van en expo.locales)
"supportsTablet": false,                                   // D4
"infoPlist": {
  "UIBackgroundModes": ["fetch"],                          // R7: sin remote-notification
  ...
},
"entitlements": {
  "com.apple.developer.usernotifications.time-sensitive": true   // R2 (sin critical-alerts, R1)
},
"privacyManifests": {                                      // R9
  "NSPrivacyAccessedAPITypes": [
    { "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryUserDefaults",   "NSPrivacyAccessedAPITypeReasons": ["CA92.1"] },
    { "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryFileTimestamp",  "NSPrivacyAccessedAPITypeReasons": ["C617.1"] },
    { "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategorySystemBootTime", "NSPrivacyAccessedAPITypeReasons": ["35F9.1"] },
    { "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryDiskSpace",      "NSPrivacyAccessedAPITypeReasons": ["E174.1"] }
  ]
}
```

- **Plugins (R4):**
  - `expo-camera`: `microphonePermission: false`.
  - `["expo-image-picker", { "photosPermission": "…foto del envase…", "cameraPermission": false, "microphonePermission": false }]`.
  - `expo-location`: `locationAlwaysAndWhenInUsePermission: false` y `locationAlwaysPermission: false`.
- **Locales (R5):** `expo.locales.{es,pt,en}` con JSON de `ios` que traduzca los cuatro textos
  de permisos (ubicación, cámara, fotos, Face ID).
- **`app.config.ts` (R10):** quitar el bloque `ios.config.googleMapsApiKey`.
- **Anuncios (D2-a):** que `adsEnabled()` devuelva `false` en iOS. Sacar `iosAppId` no se
  puede, porque el plugin lo exige y el SDK queda linkeado. Se deja el de prueba sin usar,
  o se registra la app iOS en AdMob para tener el ID real listo.
- **`eas.json` (R11):** `build.production.ios` (`autoIncrement` del buildNumber con
  `appVersionSource: "remote"`, o manual) y `submit.production.ios` (`ascAppId`, API key).
- **Política de privacidad (R3) y link en Ajustes (R12).** Va en un PR aparte porque toca
  también a Android y conviene publicarlo ya.
- **Validación:**
  - `npx expo config --type introspect` sin textos genéricos ni `critical-alerts`.
  - `jest` en verde.
  - Primer `eas build -p ios --profile production` → TestFlight.

---

## 5. App Store Connect: qué cargar

### 5.1 Registro de la app
- **Plataforma:** iOS.
- **Nombre:** `Pill O-Clock: Pastillero` (24 caracteres; límite 30). Ningún nombre igual
  ni parecido aparece en la búsqueda pública (US/AR/BR/MX/ES y otras). Hay uno cercano,
  *PillClock* (EFES TECH). La prueba definitiva es crear el registro, porque los nombres
  reservados no publicados no aparecen.
- **Idioma primario:** **es-MX**. No existe es-AR, y es-MX es el que se ve en Argentina y
  casi toda Latinoamérica.
- **Bundle ID:** `com.pilloclock.app`. **SKU:** `pilloclock-ios`.

### 5.2 Metadatos por idioma (es-MX, en-US, pt-BR)

| Campo | Límite | Nota |
|---|---|---|
| Subtítulo | 30 | p. ej. "Alarma de medicamentos privada" |
| Texto promocional | 170 | Opcional, se cambia sin revisión |
| Descripción | 4000 | Texto plano. **Versión iOS**: sin widget, sin Health Connect, sin Android y sin prometer que suena en silencio. Aviso médico al final |
| Palabras clave | 100 bytes | Sin repetir el nombre ni marcas ajenas |
| URL de soporte | — | `https://estudiotaliano.com/pill-o-clock/`. Tiene contacto por mail; Apple pide contacto real. Conviene sumar una sección iOS a la landing, que hoy dice "En prueba cerrada · Android" |
| URL de política | — | `https://estudiotaliano.com/pill-o-clock/privacy-policy.html` (después de R3) |
| Copyright | — | `2026 Giuliano Dolce Taliano Santoro` |
| Novedades | — | No existe en la primera versión |

### 5.3 Capturas
- **iPhone 6.9"** a 1320×2868 (simulador iPhone 17 Pro Max) **y además 6.3"** a 1206×2622
  (iPhone 17). La página de Apple hoy es ambigua sobre cuál es obligatoria; con las dos
  quedamos cubiertos.
- Entre 1 y 10 por tamaño, PNG o JPG **sin alfa**.
- **Nada de Android** en las capturas (2.3.10): ni marcos de Pixel ni la barra de Android.
- Las capturas del simulador sirven.
- Sin iPad si se elige D4 = `false`.
- Pantallas sugeridas: Hoy, dosis con acciones, Medicamentos, Historial, Salud, Turnos y PDF.

### 5.4 Clasificación por edad (cuestionario 2025: 4+/9+/13+/16+/18+)
- *Medical or Treatment Information*: el catálogo y el aviso de alergias son información
  de medicación. Lo honesto es **"Infrequent"**, que da **13+** y coincide con el público
  declarado en Play.
- *Advertising*: "No" con D2-a. Si hubiera anuncios: en Brasil suben a A12.
- *Funciones de red social* (obligatorias desde septiembre de 2026): No.

### 5.5 Declaración de dispositivo médico regulado
Obligatoria desde el 26-mar-2026 para apps nuevas en Medical o Health & Fitness que se
distribuyan en EEE, UK o EE. UU. Está en App Information → App Store Regulations & Permits.
**Respuesta: No.** Se muestra en la ficha. No está verificado que el chequeo de alergias
quede fuera del MDR europeo; es otro argumento para empezar sin la UE (D5).

### 5.6 Etiqueta de privacidad ("App Privacy")

| Tipo de dato | Fuente | Propósito | ¿Vinculado? | ¿Tracking? |
|---|---|---|---|---|
| Ubicación precisa | Coordenadas que se mandan a Google Places en el selector de turnos (opcional) | App Functionality | No | No |
| Crash Data | Sentry | App Functionality | No | No |
| Performance Data | Sentry (`tracesSampleRate: 0.2`) | App Functionality | No | No |
| *(solo si D2 = b/c)* Device ID, Advertising Data, Product Interaction, Coarse Location | AdMob | Third-Party Advertising (+ Analytics) | No | No con anuncios no personalizados y sin ATT; **Sí con ATT** |

Los datos de salud **no se declaran**: nunca salen del dispositivo. Lo mismo vale para el
backup, que exporta el usuario. Esto es consistente con Data safety de Play (julio 2026),
salvo AdMob si queda apagado en iOS.

### 5.7 Otros formularios
- **Export compliance:** ver D6.
- **DSA:** ver D5.
- **Precio:** gratis. **No hace falta** Paid Apps Agreement, impuestos ni datos bancarios.
  AdMob paga Google.
- **Disponibilidad:** todos los países menos los que se excluyan por D5/D6.
- **Verificación de edad por estado** (Texas SB2420, Utah, Louisiana; Declared Age Range
  API): no está claro si alcanza a una utilidad sin cuentas y no encontramos que App
  Review bloquee por esto. **Consulta legal pendiente, no bloquea.**

### 5.8 Notas para App Review (borrador, en inglés)
> Pill O-Clock is a local-first medication reminder. There is no account or login: every
> feature is available right after onboarding. Medications, dose history, measurements and
> diary are stored only on the device (encrypted SQLite); we operate no backend.
> To test a reminder: add a medication with a time 2 minutes ahead. A Time Sensitive
> notification with Take / Snooze / Skip actions fires and repeats every 5 minutes up to
> 2 times. Camera is used only to scan medication barcodes; photo library only to attach a
> picture of the medication box; location (optional) only to pin appointment places.
> The app does not diagnose, calculate doses or give medical advice; allergy notices are
> informational and tell users to consult their doctor or pharmacist. Crash diagnostics
> (Sentry) contain no health data.

---

## 6. Pruebas antes de enviar (TestFlight en iPhone real)

Quedaron pendientes en [ios-port.md](ios-port.md) §7 y no se pueden hacer en el simulador:

- [ ] Recordatorio de dosis con el teléfono **bloqueado**, en **modo silencio** y con un
      **Focus** activo (comprueba Time Sensitive). Acciones Tomé, Posponer y Omitir desde
      la notificación.
- [ ] Sonido `alarm.wav` contra sonido del sistema (selector de iOS en Ajustes).
- [ ] Escáner de código de barras con un envase real.
- [ ] Face ID con bloqueo de app activado.
- [ ] Selector de ubicación con Apple Maps y teclado (en el simulador se ponía negro).
- [ ] **Restaurar en iOS un backup v4 exportado desde Android**, cifrado y sin cifrar.
- [ ] Exportar el PDF y compartirlo.
- [ ] Recorrido completo en **iPad** en modo compatibilidad (guía 2.4.1).
- [ ] VoiceOver y Dynamic Type grande en las pantallas principales.
- [ ] Sin crashes en Sentry durante la ronda (filtrar por `os.name:iOS`).

---

## 7. Orden sugerido

| Paso | Quién | Depende de |
|---|---|---|
| 1. ✅ Corregir la política de privacidad (R3, R12): rama `fix/privacy-policy-ads`, falta mergear | Claude, con tu OK | — (urgente también para Play) |
| 2. ⏳ Inscribirse en Apple Developer (individual), en curso | Vos | — |
| 3. ✅ Decidir D2, D4, D5 y D8 (D3, D6 y D7 se resuelven en App Store Connect) | Vos | — |
| 4. ✅ PR `chore/ios-release-readiness` (§4) · ⬜ fichas `store/app-store-*.txt` | Claude | 3 |
| 4b. Cargar en EAS (environment `production`) las variables `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` y `SENTRY_AUTH_TOKEN` (`eas env:create`). Sin el token, la subida de símbolos de Sentry rompe el build de release | Claude, con tu OK (manda secretos a Expo) | — |
| 5. Bundle ID + registro de la app (reserva el nombre) + API key + pedido de critical alerts | Vos, con guía | 2 |
| 6. `eas build -p ios --profile production` → `eas submit -p ios` → TestFlight interno | Claude/vos | 4, 4b, 5 |
| 7. Pruebas en iPhone real (§6) | Vos | 6 |
| 8. Capturas 6.9" y 6.3" en el simulador de la Mac | Claude/vos | 4 |
| 9. Completar App Store Connect (§5) y enviar a revisión | Vos, con guía | 7, 8 |

Apple informa que el 50% de las revisiones sale en menos de 24 h y el 90% en menos de 48 h.

---

## 8. Más adelante (no bloquea v1)

- **AlarmKit (iOS 26+):** alarmas reales que **atraviesan el modo silencio y Focus**, sin
  entitlement; solo `NSAlarmKitUsageDescription` y permiso del usuario. Es el equivalente
  iOS más cercano a la alarma de Android. Todavía no hay módulo de Expo maduro; sería un
  módulo propio liviano, como `expo-alarm`, en modo opcional.
- **Critical alerts**, si Apple lo aprueba (D3).
- **Anuncios en iOS** (D2) con UMP + SKAdNetwork.
- **Migrar a `expo-background-task`** (R13).
- **WidgetKit y HealthKit** (roadmap #26).
- **Actualizar Expo SDK** antes de que Apple exija Xcode 27, previsiblemente en la primavera
  boreal de 2027 (no verificado). El SDK de iOS 27 además obliga a usar launch screen.

---

## 9. Fuentes principales

- Inscripción y vendedor individual: https://developer.apple.com/support/enrollment/ · D-U-N-S: https://developer.apple.com/support/D-U-N-S/
- Guías de revisión (5.1.1(ix), 1.4.1, 1.4.2, 2.3.10, 2.5.18, 5.1.3): https://developer.apple.com/app-store/review/guidelines/
- Requisitos de subida (Xcode 26 desde el 28-abr-2026): https://developer.apple.com/news/upcoming-requirements/
- Dispositivo médico regulado: https://developer.apple.com/help/app-store-connect/manage-app-information/declare-regulated-medical-device-status/
- DSA *trader*: https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements/
- Capturas: https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications
- Clasificación por edad: https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions
- Etiqueta de privacidad: https://developer.apple.com/app-store/app-privacy-details/ · AdMob: https://developers.google.com/admob/ios/privacy/data-disclosure
- Export compliance: https://developer.apple.com/help/app-store-connect/reference/export-compliance-documentation-for-encryption
- Critical alerts: https://developer.apple.com/contact/request/notifications-critical-alerts-entitlement/ · Time Sensitive: https://developer.apple.com/documentation/usernotifications/unnotificationinterruptionlevel/timesensitive
- AlarmKit: https://developer.apple.com/documentation/alarmkit/scheduling-an-alarm-with-alarmkit
- Privacy manifests en Expo: https://docs.expo.dev/guides/apple-privacy/ · Capabilities de EAS: https://docs.expo.dev/build-reference/ios-capabilities/ · EAS Submit iOS: https://docs.expo.dev/submit/ios/
- UMP/GDPR de AdMob: https://developers.google.com/admob/ios/privacy/gdpr
