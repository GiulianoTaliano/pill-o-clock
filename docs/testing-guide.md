# Pill-O-Clock — Guía de Testing

> **Versión de referencia:** 1.0.0  
> **Última actualización:** Marzo 2026  
> **Plataformas:** Android (API 26+) · iOS (15+)

---

## Índice

1. [Convenciones y leyenda](#1-convenciones-y-leyenda)
2. [Entorno de prueba](#2-entorno-de-prueba)
3. [Diferencias clave entre plataformas](#3-diferencias-clave-entre-plataformas)
4. [Módulo 1 — Onboarding y permisos](#4-módulo-1--onboarding-y-permisos)
5. [Módulo 2 — Pantalla de Hoy (Home)](#5-módulo-2--pantalla-de-hoy-home)
6. [Módulo 3 — Medicamentos](#6-módulo-3--medicamentos)
7. [Módulo 4 — Calendario](#7-módulo-4--calendario)
8. [Módulo 5 — Historial](#8-módulo-5--historial)
9. [Módulo 6 — Ajustes](#9-módulo-6--ajustes)
10. [Módulo 7 — Notificaciones y alarmas](#10-módulo-7--notificaciones-y-alarmas)
11. [Módulo 8 — Pantalla de alarma a pantalla completa](#11-módulo-8--pantalla-de-alarma-a-pantalla-completa)
12. [Módulo 9 — Backup: exportar e importar](#12-módulo-9--backup-exportar-e-importar)
13. [Módulo 10 — Apariencia e idioma](#13-módulo-10--apariencia-e-idioma)
14. [Casos de borde y regresiones](#14-casos-de-borde-y-regresiones)
15. [Checklist de release](#15-checklist-de-release)

---

## 1. Convenciones y leyenda

| Símbolo | Significado |
|---------|-------------|
| ✅ | Resultado esperado (pass) |
| ❌ | Comportamiento incorrecto (fail) |
| 🤖 | Paso o resultado exclusivo de **Android** |
| 🍎 | Paso o resultado exclusivo de **iOS** |
| ⚠️ | Atención — condición especial o requisito previo |
| `[campo]` | Valor de ejemplo a ingresar |

Cada módulo se puede ejecutar de forma independiente. Cuando un módulo requiere datos previos se indicará explícitamente en **Prerrequisitos**.

---

## 2. Entorno de prueba

### Dispositivos recomendados

| Plataforma | Mínimo recomendado | Dispositivo ideal para DnD / alarmas |
|------------|-------------------|--------------------------------------|
| Android | API 31 (S) — cubre el permiso de alarma exacta | Pixel 7 o superior con Android 13+ |
| Android legacy | API 28 (Pie) — verifica compatibilidad básica | Cualquier dispositivo con Android 9 |
| iOS | iOS 15 | iPhone con iOS 17+ para Critical Alerts |

### Estado inicial requerido para comenzar el ciclo completo

- Aplicación **recién instalada** (sin datos previos).
- O bien: ejecutar **Ajustes → Borrar todos los datos** entre ciclos de prueba.
- Notificaciones del dispositivo habilitadas a nivel de sistema operativo (se verifican en cada módulo).

### Preparación de tiempo

Varios tests requieren esperar a que llegue una notificación. Para acelerar:

- Crea medicamentos con una alarma fijada **2–3 minutos** en el futuro.
- En Android podés usar "Accelerate" de ADB si trabajás desde un emulador:  
  `adb shell am broadcast -a android.intent.action.TIME_SET`

---

## 3. Diferencias clave entre plataformas

Comprender estas diferencias es fundamental para interpretar los resultados correctamente.

### 3.1 Sistema de notificaciones

| Concepto | Android | iOS |
|----------|---------|-----|
| Canal de notificaciones | Creado en `pill-reminders` con `Importance.MAX` | No aplica (iOS usa categorías) |
| Sonido de alarma | `alarm.wav` asignado al canal | `alarm.wav` en el bundle de la notificación |
| Bypass Do Not Disturb | ✅ `bypassDnd: true` en el canal | ✅ Con Critical Alerts entitlement |
| Tipo de alerta | Heads-up notification en primer plano y segundo plano | Banner en primer plano; alerta completa en segundo plano |
| Acciones rápidas (Tomar / Posponer / Omitir) | Visibles expandiendo la notificación | Visibles al deslizar hacia abajo sobre la notificación |
| Vibración personalizada | `[0, 500, 300, 500, 300, 500]` ms | Definida por el sistema según nivel de alerta |

### 3.2 Permisos

| Permiso | Android < 12 (API ≤ 30) | Android 12 (API 31–32) | Android 13+ (API 33+) | iOS |
|---------|------------------------|----------------------|---------------------|-----|
| Notificaciones | Automático | Automático | Diálogo obligatorio | Diálogo en onboarding |
| Alarma exacta | Automático | ⚠️ Manual en Ajustes del sistema | Automático (`USE_EXACT_ALARM`) | No aplica |
| Critical Alerts | No aplica | No aplica | No aplica | Aprobado en App Store (entitlement declarado) |

### 3.3 Deep link de la pantalla de alarma

La pantalla de alarma a pantalla completa (`app/alarm.tsx`) se abre mediante el deep link:  
`pilloclock://alarm?scheduleId=<id>&date=<YYYY-MM-DD>`

- 🤖 En Android se activa automáticamente si la app está en segundo plano y el usuario toca la notificación con la acción correcta. Verifcar que el intent filter esté configurado.
- 🍎 En iOS el deep link es gestionado por `expo-router`. El comportamiento es idéntico.

---

## 4. Módulo 1 — Onboarding y permisos

**Prerrequisitos:** Aplicación recién instalada.

### TC-01 · Flujo completo de onboarding

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Abrir la app por primera vez | ✅ Se muestra la pantalla de onboarding con el slide 1 (ícono de píldora) |
| 2 | Deslizar hacia la derecha (o tocar "Siguiente") | ✅ Avanza al slide 2 (ícono de notificación) |
| 3 | Continuar hasta el slide 4 (escudo) | ✅ Aparece el botón "Conceder permiso" y el indicador de puntos actualiza posición |
| 4 | Tocar "Conceder permiso" | ✅ Se presenta el diálogo del sistema operativo solicitando permiso de notificaciones |
| 5a 🤖 | Conceder el permiso en Android | ✅ El indicador cambia a verde; el botón "Empezar" se activa |
| 5b 🍎 | Conceder el permiso en iOS | ✅ Igual que 5a |
| 6 | Tocar "Empezar" | ✅ Se navega a la pantalla principal (Home). El onboarding no vuelve a mostrarse al relanzar la app |

### TC-02 · Onboarding con permiso denegado

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Repetir TC-01 pasos 1–4 | — |
| 2 | **Denegar** el permiso de notificaciones | ✅ El indicador de permiso permanece inactivo/rojo pero el botón "Empezar" sigue disponible |
| 3 | Tocar "Empezar" | ✅ Se llega al Home. Las alarmas no sonarán hasta que el usuario conceda el permiso manualmente |

### TC-03 🤖 · Permiso de alarma exacta (Android 12 / API 31–32)

> Solo aplica a dispositivos con Android 12 o 12L.

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Completar TC-01 en un dispositivo Android 12 | — |
| 2 | Crear un medicamento con una alarma | ✅ Se muestra un diálogo indicando que se requiere el permiso "Alarmas y recordatorios" |
| 3 | Tocar "Abrir configuración" | ✅ Abre la pantalla de Ajustes del sistema en la sección correcta |
| 4 | Habilitar "Alarmas y recordatorios" para Pill-O-Clock | ✅ Volver a la app; las alarmas funcionan con exactitud |
| 5 | Tocar "Ahora no" en el diálogo | ✅ El diálogo se cierra; el medicamento se guarda pero la alarma puede llegar con retraso |

---

## 5. Módulo 2 — Pantalla de Hoy (Home)

**Prerrequisitos:** Al menos un medicamento con una alarma para el día de hoy.

### TC-04 · Estructura de la pantalla

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Ir a la pestaña "Hoy" | ✅ Se muestra la fecha actual localizada (ej: "Jueves, 5 de marzo de 2026") |
| 2 | Verificar secciones | ✅ Aparecen secciones separadas: **Pendientes**, **Perdidas**, **Completadas** (solo si hay dosis en cada estado) |
| 3 | Verificar orden | ✅ Dentro de cada sección, las dosis se ordenan por prioridad de categoría y luego por hora |
| 4 | Sin medicamentos configurados | ✅ Se muestra el `EmptyState` con mensaje e ícono |

### TC-05 · Marcar dosis como tomada

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Tocar el botón "✅ Tomar" en una dosis pendiente | ✅ La tarjeta se mueve a la sección **Completadas** con animación |
| 2 | Verificar feedback háptico | ✅ Se siente un pulso háptico leve |
| 3 | Verificar en Historial | ✅ El log aparece con estado `taken` |

### TC-06 · Marcar dosis como omitida

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Tocar "❌ Omitir" en una dosis pendiente | ✅ La tarjeta se mueve a **Completadas** con estado "Omitida" |
| 2 | Verificar en Historial | ✅ El log aparece con estado `skipped` |

### TC-07 · Posponer (snooze) una dosis

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Tocar "⏰ Posponer" en una dosis pendiente | ✅ Aparece un toast "Pospuesto 15 min" |
| 2 | Verificar que la tarjeta no desaparece | ✅ La dosis sigue visible como pendiente (en su nuevo horario) |
| 3 | Esperar 15 minutos | ✅ Llega una nueva notificación de recordatorio |

### TC-08 · Revertir una dosis completada

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Marcar una dosis como tomada (TC-05) | — |
| 2 | Tocar el botón de revertir en la tarjeta completada | ✅ La dosis vuelve a la sección **Pendientes** |
| 3 | Verificar en Historial | ✅ El log es eliminado |

### TC-09 · Pull-to-refresh

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Hacer pull-to-refresh en la lista | ✅ Aparece el indicador de carga y los datos se recargan desde la base de datos |

---

## 6. Módulo 3 — Medicamentos

### TC-10 · Crear medicamento básico (diario)

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Ir a pestaña "Medicamentos" → botón `+` | ✅ Se abre el formulario de nuevo medicamento |
| 2 | Dejar el nombre vacío y tocar "Guardar" | ✅ Error: "Nombre requerido" |
| 3 | Ingresar nombre `[Ibuprofeno]` | — |
| 4 | Ingresar cantidad `[400]` · unidad `[mg]` | — |
| 5 | Seleccionar categoría `[Antiinflamatorio]` | — |
| 6 | Verificar que la alarma mostrará todos los días | ✅ Los días están vacíos = diario |
| 7 | Tocar "Guardar" | ✅ Regresa a la lista; el medicamento aparece en "Activos" |
| 8 | Verificar en Hoy | ✅ Aparece una tarjeta para la dosis del día si la hora ya pasó o está próxima |

### TC-11 · Crear medicamento con días específicos y período

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Nuevo medicamento → nombre `[Vitamina D]` · unidad `[UI]` | — |
| 2 | En la alarma, seleccionar solo Lunes, Miércoles, Viernes | ✅ Los toggles de días resaltan los seleccionados |
| 3 | Activar fechas de tratamiento: inicio = hoy, fin = 30 días | — |
| 4 | Guardar | ✅ El medicamento aparece; las notificaciones solo se programan para Lu/Mi/Vi dentro del rango |
| 5 | Revisar el Calendario | ✅ Solo aparece en los días correctos |

### TC-12 · Crear medicamento con múltiples alarmas

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Nuevo medicamento → tocar "Agregar" (para añadir alarma) | ✅ Aparece una segunda fila de horario |
| 2 | Configurar alarmas a las `[08:00]` y `[20:00]` | — |
| 3 | Intentar eliminar la única alarma restante | ✅ Error: "Debe haber al menos una alarma" |
| 4 | Guardar con dos alarmas | ✅ En Hoy aparecen dos dosis para ese medicamento |

### TC-13 · Validaciones del formulario

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Dejar cantidad de dosis en blanco | ✅ Error: "Dosis requerida" |
| 2 | Ingresar un nombre ya existente | ✅ Error: "Nombre duplicado" |
| 3 | Ingresar fecha de fin menor a fecha de inicio | ✅ Error: "Período inválido" |

### TC-14 · Selección de color personalizado

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | En el formulario, tocar el selector de color | ✅ Abre el `ColorPicker` con colores predefinidos |
| 2 | Seleccionar un color predefinido (ej: verde) | ✅ La previsualización actualiza el color |
| 3 | Abrir el `RGBPickerModal` y seleccionar un color hex personalizado | ✅ El medicamento se guarda con ese color |
| 4 | Verificar en la lista | ✅ La tarjeta muestra el color seleccionado |

### TC-15 · Editar medicamento

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Tocar "Editar" en un medicamento existente | ✅ El formulario se abre con los valores actuales prellenados |
| 2 | Modificar el nombre y guardar | ✅ La lista y las notificaciones se actualizan. Las notificaciones anteriores se cancelan y se reprograman |

### TC-16 · Pausar / reactivar medicamento

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | En la lista, desactivar el toggle de un medicamento activo | ✅ El medicamento se mueve a la sección "Pausados"; sus notificaciones se cancelan |
| 2 | Reactivar el toggle | ✅ Vuelve a "Activos" y las notificaciones se reprograman |
| 3 | Verificar en Hoy | ✅ Las dosis pausadas desaparecen y reaparecen según el estado |

### TC-17 · Eliminar medicamento

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Tocar "Eliminar" en un medicamento | ✅ Aparece un diálogo de confirmación con el nombre del medicamento |
| 2 | Confirmar | ✅ El medicamento y todas sus notificaciones son eliminados; la lista se actualiza con animación |
| 3 | Cancelar | ✅ El medicamento sigue en la lista |

---

## 7. Módulo 4 — Calendario

**Prerrequisitos:** Al menos un medicamento activo con historial de varios días.

### TC-18 · Navegación por meses

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Ir a pestaña "Calendario" | ✅ Se muestra el mes actual; el día de hoy está resaltado |
| 2 | Tocar "◀" para ir al mes anterior | ✅ El calendario muestra el mes previo y carga los logs correspondientes |
| 3 | Tocar "▶" para volver al mes actual | ✅ Regresa al mes corriente |

### TC-19 · Indicadores de estado en el calendario

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Observar días con dosis en el mes | ✅ Los días muestran puntos de color según el estado dominante (tomada, omitida, perdida, pendiente) |
| 2 | Tocar un día con dosis | ✅ El panel inferior lista las dosis del día con íconos de estado, nombre del medicamento y hora |

### TC-20 · Marcar dosis desde el Calendario

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Seleccionar el día de hoy en el Calendario | ✅ Se listan las dosis del día |
| 2 | Tocar "Tomar" en una dosis pendiente | ✅ El estado cambia a "Tomada" y el punto del día en el calendario se actualiza |

---

## 8. Módulo 5 — Historial

**Prerrequisitos:** Al menos 7 días de logs.

### TC-21 · Navegación por ventanas de 7 días

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Ir a pestaña "Historial" | ✅ Se muestra la ventana de los últimos 7 días con etiqueta de rango (ej: "27 Feb – 5 Mar 2026") |
| 2 | Tocar "◀" (semana anterior) | ✅ La ventana retrocede 7 días y los logs se actualizan |
| 3 | Tocar "▶" (semana siguiente) | ✅ La ventana avanza 7 días |

### TC-22 · Estadísticas de adherencia

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Verificar el bloque de estadísticas | ✅ Muestra: cantidad tomadas, omitidas, y porcentaje de adherencia |
| 2 | Si no hay logs en el rango | ✅ El porcentaje de adherencia no se muestra (o aparece "—") |

### TC-23 · Listado de logs por fecha

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Verificar que los logs se agrupan por fecha | ✅ Cada fecha aparece como encabezado con sus dosis abajo |
| 2 | Verificar ícono por estado | ✅ ✅ = tomada · ✗ = omitida · ⏱ = pendiente |
| 3 | Cambiar de pestaña y volver a Historial | ✅ Los datos se recargan automáticamente (`useFocusEffect`) |

---

## 9. Módulo 6 — Ajustes

### TC-24 · Cambio de idioma

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Ir a Ajustes → idioma "English" | ✅ Toda la UI cambia a inglés inmediatamente (sin reinicio) |
| 2 | Cambiar de vuelta a "Español" | ✅ La UI vuelve al español |
| 3 | Verificar notificaciones programadas tras cambio de idioma | ✅ El texto de las notificaciones futuras usa el idioma activo al momento de programarse |

### TC-25 · Cambio de tema

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Seleccionar "Oscuro" | ✅ La UI cambia a tema oscuro inmediatamente |
| 2 | Seleccionar "Claro" | ✅ La UI cambia a tema claro |
| 3 | Seleccionar "Sistema" | ✅ El tema sigue la configuración del dispositivo |
| 4 | Cambiar el tema del dispositivo con la app abierta | ✅ La app responde al cambio en tiempo real |

### TC-26 · Versión de la app

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Desplazarse hasta la sección "Acerca de" | ✅ Muestra "1.0.0" (o la versión actual del build) |

---

## 10. Módulo 7 — Notificaciones y alarmas

> Este módulo cubre los comportamientos **críticos** de la app. Ejecutar en dispositivo físico siempre que sea posible.

### TC-27 · Notificación en segundo plano (app cerrada)

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Crear un medicamento con alarma 2 minutos en el futuro | — |
| 2 | Cerrar la app completamente (swipe up / fuerza cierre) | — |
| 3 | Esperar a la hora de la alarma | ✅ Llega una notificación con sonido de alarma (`alarm.wav`) y vibración |
| 4 | Verificar el título y cuerpo | ✅ "💊 [Nombre del med]" / "Dosis: [dosis] · Expandir para ver opciones" |
| 5a 🍎 | Deslizar hacia abajo sobre la notificación iOS | ✅ Aparecen los botones: "✅ Tomé el medicamento" · "⏰ Posponer 15 min" · "❌ Omitir" |
| 5b 🤖 | Expandir la notificación Android | ✅ Aparecen los mismos tres botones de acción |

### TC-28 · Notificación en primer plano (app abierta)

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Dejar la app abierta y esperar la alarma | ✅ La notificación se muestra como banner sobre la UI (shouldShowAlert: true) |
| 2 | Verificar sonido | ✅ Suena el sonido de alarma incluso con la app en primer plano |

### TC-29 · Acción "Tomar" desde notificación

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Recibir una notificación y tocar "✅ Tomé el medicamento" | ✅ La app **no** se abre (opensAppToForeground: false) |
| 2 | Abrir la app y verificar Hoy | ✅ La dosis figura como "Tomada" |
| 3 | Verificar que las notificaciones de repetición se cancelaron | ✅ No llegan notificaciones adicionales para esa dosis |

### TC-30 · Acción "Posponer" desde notificación

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Recibir notificación y tocar "⏰ Posponer 15 min" | ✅ La app no se abre |
| 2 | Esperar 15 minutos | ✅ Llega una nueva notificación con título "🔔 Recordatorio: [Nombre] (repetición)" |
| 3 | Verificar en Hoy | ✅ La dosis sigue como "Pendiente" |

### TC-31 · Acción "Omitir" desde notificación

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Recibir notificación y tocar "❌ Omitir" | ✅ La app no se abre |
| 2 | Abrir la app y verificar Hoy | ✅ La dosis figura como "Omitida" |
| 3 | Verificar que no llegan repeticiones | ✅ No hay notificaciones adicionales para esa dosis |

### TC-32 · Repetición automática (sin respuesta)

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Recibir la notificación; **no interactuar con ella** | — |
| 2 | Esperar 5 minutos | ✅ Llega una segunda notificación (repetición 1/4) |
| 3 | Continuar sin responder | ✅ Llegan hasta 4 repeticiones (a los 5, 10, 15, 20 min) |
| 4 | Pasado ese tiempo sin acción | ✅ No llegan más repeticiones; la dosis queda como "Perdida" al día siguiente |

### TC-33 🤖 · Bypass de Do Not Disturb (Android)

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Activar "No molestar" en el dispositivo | — |
| 2 | Esperar la hora de la alarma | ✅ La notificación **sí** suena y vibra (canal configurado con `bypassDnd: true`) |

### TC-34 🍎 · Critical Alerts (iOS)

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | En iOS, activar "No molestar" (Focus Mode) | — |
| 2 | Esperar la hora de la alarma | ✅ La notificación llega con sonido gracias al entitlement `critical-alerts` |

---

## 11. Módulo 8 — Pantalla de alarma a pantalla completa

### TC-35 · Apertura desde notificación

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Tocar el cuerpo de una notificación (no un botón de acción) | ✅ Se abre la app en la pantalla de alarma a pantalla completa |
| 2 | Verificar datos mostrados | ✅ Nombre del medicamento, dosis, notas (si tiene), y color del medicamento |
| 3 | Verificar animación | ✅ El ícono de píldora pulsa de forma continua |

### TC-36 · Acciones en la pantalla de alarma

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Tocar "Tomé el medicamento" | ✅ Se registra la dosis como "Tomada" y regresa al Home |
| 2 | Tocar "Posponer 15 min" | ✅ Se programa una nueva notificación en 15 min; regresa al Home |
| 3 | Tocar "Omitir" | ✅ Se registra como "Omitida" y regresa al Home |

### TC-37 · Pantalla de alarma con datos inválidos

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Abrir el deep link manualmente con un `scheduleId` inexistente: `pilloclock://alarm?scheduleId=XXX&date=2026-01-01` | ✅ La app navega automáticamente de vuelta al Home (sin crash) |

---

## 12. Módulo 9 — Backup: exportar e importar

### TC-38 · Exportar backup

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Ajustes → "Exportar datos" | ✅ Se abre el sheet de compartir del sistema |
| 2 | Verificar el nombre del archivo | ✅ `pilloclock-backup-YYYY-MM-DD.json` |
| 3 | Guardar en Files / Drive / etc. | ✅ El archivo se guarda correctamente |
| 4 | Abrir el JSON | ✅ Contiene `version`, `exportedAt`, `app: "pill-o-clock"`, y arrays de `medications`, `schedules`, `doseLogs` |

### TC-39 · Importar backup — modo "Fusionar"

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Ajustes → "Importar datos" | ✅ Diálogo con opciones "Fusionar" y "Reemplazar" |
| 2 | Seleccionar "Fusionar" | ✅ Se abre el selector de archivos del sistema |
| 3 | Seleccionar un JSON de backup válido | ✅ Toast: "Se importaron N registros" |
| 4 | Verificar que los datos existentes persisten y los nuevos se añaden | ✅ No se borra nada; se fusionan los datos |

### TC-40 · Importar backup — modo "Reemplazar"

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Ajustes → "Importar datos" → "Reemplazar" | — |
| 2 | Seleccionar un JSON de backup | ✅ Toast de éxito |
| 3 | Verificar que los datos previos fueron borrados | ✅ Solo existen los datos del backup |

### TC-41 · Importar archivo inválido

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Intentar importar un JSON que no sea un backup de Pill-O-Clock | ✅ Toast de error: "Formato inválido" |
| 2 | Cancelar en el selector de archivos | ✅ No se muestra ningún error; vuelve a Ajustes |

---

## 13. Módulo 10 — Apariencia e idioma

> Ver también TC-24 y TC-25.

### TC-42 · Persistencia de preferencias

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Cambiar el idioma a "English" y cerrar la app | ✅ Al reabrir, el idioma sigue siendo inglés |
| 2 | Cambiar el tema a "Oscuro" y cerrar la app | ✅ Al reabrir, el tema sigue siendo oscuro |

### TC-43 · Tema automático (Sistema)

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Configurar tema en "Sistema" | — |
| 2 | Cambiar el dispositivo a modo oscuro con la app abierta | ✅ La app cambia a oscuro instantáneamente |
| 3 | Volver a modo claro | ✅ La app vuelve a claro |

---

## 14. Casos de borde y regresiones

### TC-44 · Sin conexión a internet

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Desactivar WiFi y datos móviles | — |
| 2 | Usar todas las funciones de la app | ✅ Todo funciona normalmente. No hay llamadas de red (datos 100% locales, SQLite) |

### TC-45 · Reinicio del dispositivo con alarmas programadas

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Crear medicamentos con alarmas futuras | — |
| 2 | Reiniciar el dispositivo | — |
| 3a 🤖 | En Android: la app escucha `RECEIVE_BOOT_COMPLETED` | ✅ Las notificaciones se reprograman automáticamente al arrancar |
| 3b 🍎 | En iOS: las notificaciones locales persisten en el sistema | ✅ Las notificaciones no se pierden tras el reinicio |

### TC-46 · Medicamento con período de tratamiento vencido

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Crea un medicamento con fecha de fin = ayer | ✅ No aparece en el Home de hoy |
| 2 | Verificar en Historial | ✅ Las dosis del período aparecen normalmente |

### TC-47 · Dosis "perdida" (no respondida el día anterior)

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Dejar una notificación sin responder y avanzar el reloj al día siguiente | ✅ Al abrir la app, esa dosis aparece en Hoy como "Perdida" (estado `missed`) |
| 2 | Verificar en Historial | ✅ La dosis perdida aparece en el log del día anterior |

### TC-48 · Medicamento sin alarmas activas hoy (días específicos)

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Crear medicamento con alarma solo los viernes. Probar un martes | ✅ No aparece en Hoy ni en el Calendario del martes |

### TC-49 · Nombre duplicado al crear medicamento

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Crear medicamento "Ibuprofeno" | — |
| 2 | Intentar crear otro con el mismo nombre | ✅ Error "Nombre duplicado" |
| 3 | Editar "Ibuprofeno" y guardarlo con el mismo nombre | ✅ No se muestra error (el nombre propio está excluido de la validación) |

### TC-50 · Reset total de datos

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Ajustes → "Borrar todos los datos" | ✅ Diálogo de confirmación explicando que no es reversible |
| 2 | Confirmar | ✅ Todos los medicamentos, horarios y logs son eliminados; la app queda como nueva |
| 3 | Verificar notificaciones | ✅ No quedan notificaciones pendientes en el sistema |

---

## 15. Checklist de release

Ejecutar la siguiente lista antes de publicar cada build en las stores.

### Pre-release — Ambas plataformas

- [ ] TC-01 (Onboarding completo) pasa en dispositivo físico
- [ ] TC-04 a TC-09 (Home) pasan
- [ ] TC-10, TC-12, TC-15, TC-17 (CRUD de medicamentos) pasan
- [ ] TC-27 a TC-32 (Notificaciones en segundo plano) pasan en dispositivo físico
- [ ] TC-35 a TC-36 (Pantalla de alarma) pasan
- [ ] TC-38, TC-39, TC-40 (Backup) pasan
- [ ] TC-42 (Persistencia de preferencias) pasa
- [ ] TC-44 (Sin conexión) pasa
- [ ] TC-50 (Reset de datos) pasa

### Pre-release — Android únicamente

- [ ] TC-03 (Permiso alarma exacta Android 12) verificado en API 31 o 32
- [ ] TC-33 (Bypass DnD) verificado
- [ ] TC-45a (Reprogramación post-reinicio) verificado
- [ ] El canal `pill-reminders` aparece en Ajustes → Notificaciones → Pill-O-Clock
- [ ] El sonido `alarm.wav` suena correctamente (no el sonido de sistema default)
- [ ] La app no cierra con el gesto de retroceso predictivo (predictiveBackGestureEnabled: false)

### Pre-release — iOS únicamente

- [ ] TC-02 (Permiso denegado) no causa crash
- [ ] TC-34 (Critical Alerts no molestar) verificado con Focus Mode activo
- [ ] TC-45b (Notificaciones post-reinicio) verificado
- [ ] Los botones de acción de notificación se muestran al deslizar en iOS
- [ ] La app funciona en modo tablet (supportsTablet: true)

---

> **Nota:** Esta guía cubre los flujos funcionales de la versión 1.0.0. Actualizar los módulos afectados ante cada nueva feature o cambio en el comportamiento de notificaciones.
