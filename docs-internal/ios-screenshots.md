# Capturas de App Store — guía para la Mac

> Para ejecutar en la Mac (macOS 26.5 + Xcode 26.6), por una persona o por una sesión de
> Claude Code. Al terminar, las PNG se commitean en `store/screenshots/ios/` y se suben a
> App Store Connect por la API desde cualquier máquina. Contexto:
> [ios-app-store-checklist.md](ios-app-store-checklist.md) §5.3.

## Qué hace falta

- **iPhone 6.9"**, simulador **iPhone 17 Pro Max**, a **1320×2868**. Es el tamaño obligatorio
  y Apple lo escala a los iPhone más chicos.
- **Opcional, iPhone 6.3"**, simulador **iPhone 17**, a **1206×2622**.
- **Idiomas:** español (es-MX, el principal), inglés (en-US) y portugués (pt-BR). Si en un
  idioma no se suben capturas, App Store usa las del idioma principal.
- **Datos de demostración, nunca datos reales.** Las capturas tienen que mostrar la app en
  uso (guía 2.3.3) y nada de Android (2.3.10).

## 1. Compilar en Release

Release evita los avisos amarillos de desarrollo en pantalla.

```bash
git pull
npm install
npx expo prebuild -p ios --clean
SENTRY_DISABLE_AUTO_UPLOAD=true npx expo run:ios --configuration Release --device "iPhone 17 Pro Max"
```

> Si `pod install` falla por el locale: `cd ios && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install && cd ..`
> ([ios-port.md](ios-port.md) §1).

## 2. Barra de estado limpia

```bash
xcrun simctl status_bar booted override --time 9:41 --dataNetwork wifi --wifiBars 3 --cellularMode active --cellularBars 4 --batteryState charged --batteryLevel 100
```

## 3. Cargar los datos de demostración

```bash
node scripts/generate-seed-data.mjs --output ~/Desktop/pill-o-clock-demo.json
```

Las fechas se calculan desde hoy, así que conviene generar el archivo el mismo día de las
capturas. Después:

1. Arrastrá `pill-o-clock-demo.json` a la ventana del simulador. Se guarda en la app Archivos.
2. En la app: completá el onboarding y **permití notificaciones y alarmas**.
3. Andá a **Ajustes → Datos y compartir → Restaurar**, elegí el archivo y luego **Reemplazar**.
4. Volvé a **Hoy** y confirmá que aparecen los 7 medicamentos.

## 4. Pantallas (8, en este orden)

Para cada una: `xcrun simctl io booted screenshot <archivo>`.

| # | Archivo | Pantalla | Cómo llegar |
|---|---|---|---|
| 1 | `01-hoy.png` | Hoy, con dosis tomadas y pendientes | Pestaña Hoy |
| 2 | `02-medicamentos.png` | Lista de medicamentos | Pestaña Medicamentos |
| 3 | `03-esquema.png` | Alta de medicamento en el paso de horarios o esquema | Agregar → avanzar hasta el paso de horarios (no guardar) |
| 4 | `04-historial.png` | Historial con adherencia | Pestaña Historial |
| 5 | `05-salud.png` | Mediciones con gráficos | Pestaña Salud |
| 6 | `06-medicion.png` | Detalle de una medición con la tendencia | Salud → tocar presión arterial |
| 7 | `07-turnos.png` | Turnos médicos | Pestaña o sección Turnos |
| 8 | `08-emergencia.png` | Tarjeta de emergencia | Ajustes → Personas y salud → Tarjeta de emergencia |

Guardalas en:

```
store/screenshots/ios/es-MX/6.9/01-hoy.png … 08-emergencia.png
store/screenshots/ios/en-US/6.9/…
store/screenshots/ios/pt-BR/6.9/…
```

Para cada idioma, cambiá **Ajustes → Idioma y catálogo** y repetí las 8.

Si tenés tiempo, hacé lo mismo con el simulador **iPhone 17** en `…/6.3/`.

## 5. Verificar y commitear

```bash
sips -g pixelWidth -g pixelHeight store/screenshots/ios/es-MX/6.9/*.png   # 1320 × 2868
git add store/screenshots/ios && git commit -m "store(ios): capturas de App Store" && git push
```

Después avisá: la subida a App Store Connect (`appScreenshotSets`) se hace por la API.

## Notas

- La **alarma de AlarmKit en la pantalla bloqueada** no se puede capturar bien en el
  simulador. Si se quiere esa imagen, se saca desde un iPhone real con iOS 26: lateral +
  subir volumen, con una alarma de prueba sonando. Es opcional.
- Las capturas tienen que ser PNG o JPG **sin canal alfa**. Las de `simctl` ya salen así.
