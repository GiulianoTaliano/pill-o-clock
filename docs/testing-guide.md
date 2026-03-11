# Pill O-Clock — Guía de Testing

> **Versión de referencia:** 1.2.0  
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
7. [Módulo 4 — Agenda](#7-módulo-4--agenda)
8. [Módulo 5 — Historial](#8-módulo-5--historial)
9. [Módulo 6 — Ajustes](#9-módulo-6--ajustes)
10. [Módulo 7 — Notificaciones y alarmas](#10-módulo-7--notificaciones-y-alarmas)
11. [Módulo 8 — Pantalla de alarma a pantalla completa](#11-módulo-8--pantalla-de-alarma-a-pantalla-completa)
12. [Módulo 9 — Backup: exportar e importar](#12-módulo-9--backup-exportar-e-importar)
13. [Módulo 10 — Apariencia e idioma](#13-módulo-10--apariencia-e-idioma)
14. [Módulo 11 — Stock de medicamentos](#14-módulo-11--stock-de-medicamentos)
15. [Módulo 12 — Notas por dosis](#15-módulo-12--notas-por-dosis)
16. [Módulo 13 — Citas médicas](#16-módulo-13--citas-médicas)
17. [Módulo 14 — Mediciones de salud](#17-módulo-14--mediciones-de-salud)
18. [Módulo 15 — Diario de síntomas y estado](#18-módulo-15--diario-de-síntomas-y-estado)
19. [Módulo 16 — Reporte PDF](#19-módulo-16--reporte-pdf)
20. [Casos de borde y regresiones](#20-casos-de-borde-y-regresiones)
21. [Checklist de release](#21-checklist-de-release)

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
| 4 | Habilitar "Alarmas y recordatorios" para Pill O-Clock | ✅ Volver a la app; las alarmas funcionan con exactitud |
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
| 4 | Sin medicamentos configurados | ✅ Se muestra el `EmptyState` con mensaje e ícono || 5 | Verificar chip de racha | ✅ Si hay ≥ 1 día de adherencia consecutiva aparece un chip naranja con 🔥 y el conteo de días (ej: "🔥 3 días seguidos"); si la racha es 0 el chip no se muestra |
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

### TC-07 · Posponer (snooze) una dosis **que ya llegó su hora**

| # | Paso | Resultado esperado |
|---|------|-----------------|
| 1 | Tocar "+15 min" en una dosis cuya hora ya pasó (estado pendiente / perdida) | ✅ Aparece un toast "Pospuesto 15 min" |
| 2 | Verificar que la tarjeta no desaparece | ✅ La dosis sigue visible como pendiente |
| 3 | Esperar 15 minutos | ✅ Llega una nueva notificación de recordatorio |

### TC-07b · Posponer (snooze) una dosis **antes de que llegue su hora**

| # | Paso | Resultado esperado |
|---|------|-----------------|
| 1 | Tocar "+15 min" en una dosis cuyo horario aún no llegó (ej: son las 16:00, la dosis es a las 17:00) | ✅ El badge de horario de la tarjeta cambia a **17:15** con tinte ámbar y un ícono de reloj |
| 2 | Tocar "+15 min" nuevamente | ✅ El badge pasa a **17:30** (acumulativo sobre el horario ya pospuesto) |
| 3 | Verificar que la notificación llega a las 17:15 (o 17:30) | ✅ La notificación respeta el nuevo horario |
| 4 | Marcar la dosis y verificar que el badge vuelve al color original | ✅ Al tomar / revertir, el indicador ámbar desaparece |

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
### TC-10 · Prompt de check-in diario en Home

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Abrir la pestaña "Hoy" en un día sin check-in registrado | ✅ Aparece una tarjeta teal con 🌡 y el título "¿Cómo va tu día?"; botón "Registrar" y botón `✕` de descarte |
| 2 | Tocar "Registrar" | ✅ Se abre el `CheckinModal`; al guardar, la tarjeta desaparece y no vuelve a mostrarse en el día actual |
| 3 | Tocar `✕` sin registrar el check-in | ✅ La tarjeta desaparece por el resto del día (se persiste la fecha de descarte en AsyncStorage) |
| 4 | Cerrar y reabrir la app el mismo día tras descartar | ✅ La tarjeta sigue oculta hasta el día siguiente |
| 5 | Al día siguiente, sin check-in de ese nuevo día | ✅ La tarjeta vuelve a aparecer |### TC-10-A · Reprogramar dosis una sola vez (reschedule once)

> Prerequisito: al menos una dosis **pendiente** cuya hora no haya llegado aún.

| # | Paso | Resultado esperado |
|---|------|-----------------|
| 1 | Verificar que el badge de horario de una dosis pendiente muestra un ícono de lápiz pequeño | ✅ El lápiz está visible junto al horario |
| 2 🍎 | Tocar el badge de horario en iOS | ✅ Se abre un **modal sheet** desde abajo con: handle, etiqueta "Reprogramar toma", nombre del medicamento, horario original y un spinner de hora |
| 2 🤖 | Tocar el badge de horario en Android | ✅ Se abre el selector nativo de hora del sistema |
| 3 | Seleccionar un horario diferente (ej: +30 min) y confirmar 🍎 / seleccionar 🤖 | ✅ El badge se actualiza con el nuevo horario en tinte ámbar; aparece un toast "Toma reprogramada para las HH:mm" |
| 4 | Verificar que la notificación llega al nuevo horario | ✅ No llega notificación al horario original; sí llega al nuevo |
| 5 | Tocar el badge nuevamente y cambiar el horario una segunda vez | ✅ El spinner del modal arranca desde el horario ya reprogramado (no el original) |
| 6 | Cancelar el modal 🍎 / cerrar sin seleccionar 🤖 | ✅ El horario no cambia |
| 7 | Marcar la dosis como tomada | ✅ El badge ámbar desaparece; la dosis pasa a Completadas |
| 8 | Revertir la dosis | ✅ El badge ámbar también desaparece (el snooze se limpia al revertir) |

### TC-10-B · Tip de reschedule (primera visita)

| # | Paso | Resultado esperado |
|---|------|-----------------|
| 1 | Abrir la app por primera vez con al menos una dosis pendiente | ✅ Aparece un banner azul informativo encima de la sección Pendientes con texto de ayuda sobre el badge |
| 2 | Tocar el banner | ✅ El banner desaparece y no vuelve a aparecer al relanzar la app |
| 3 | Cerrar y reabrir la app | ✅ El banner ya no se muestra (persiste en AsyncStorage) |
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
### TC-17b · Formulario — campos de stock

| # | Paso | Resultado esperado |
|---|------|--------------------||
| 1 | Abrir el formulario de nuevo medicamento | ✅ Se muestra la sección **Stock (opcional)** antes del botón Guardar |
| 2 | Ingresar `[30]` en "Stock actual" | ✅ Aparece un segundo campo "Notificarme cuando queden" |
| 3 | Ingresar `[5]` en el campo de umbral | — |
| 4 | Guardar el medicamento | ✅ La tarjeta en la lista muestra un badge verde con el ícono de caja y el valor `30` |
| 5 | Marcar una dosis como tomada | ✅ El badge pasa a `29`; si el stock cae al umbral el badge cambia a rojo y llega una notificación "Stock bajo" |
| 6 | Dejar el campo de stock vacío al crear otro medicamento | ✅ No aparece badge de stock en la tarjeta |
---

## 7. Módulo 4 — Agenda

> La pestaña **Agenda** unifica el calendario mensual de dosis y la sección de próximas citas médicas. La pantalla completa de gestión de citas se accede desde esta pestaña mediante el botón `+` o tocando una tarjeta de cita.

**Prerrequisitos:** Al menos un medicamento activo con historial de varios días.

### TC-18 · Navegación por meses

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Ir a pestaña "Agenda" | ✅ Se muestra el mes actual; el día de hoy está resaltado |
| 2 | Tocar "◀" para ir al mes anterior | ✅ El calendario muestra el mes previo y carga los logs correspondientes |
| 3 | Tocar "▶" para volver al mes actual | ✅ Regresa al mes corriente |

### TC-19 · Indicadores de estado en el calendario

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Observar días con dosis en el mes | ✅ Los días muestran puntos de color según el estado dominante (tomada, omitida, perdida, pendiente) |
| 2 | Tocar un día con dosis | ✅ El panel inferior lista las dosis del día con íconos de estado, nombre del medicamento y hora |

### TC-20 · Marcar dosis desde la Agenda

| # | Paso | Resultado esperado |
|---|------|--------------------||
| 1 | Seleccionar el día de hoy en la Agenda | ✅ Se listan las dosis del día |
| 2 | Tocar "Tomar" en una dosis pendiente | ✅ El estado cambia a "Tomada" y el punto del día en el calendario se actualiza |

### TC-20a · Sección "Próximas citas" en Agenda

| # | Paso | Resultado esperado |
|---|------|--------------------||
| 1 | Desplazarse hasta el pie de la pantalla Agenda | ✅ Aparece la sección "Próximas citas" con su botón `+` alineado a la derecha |
| 2 | Sin citas próximas | ✅ Se muestra el ícono de calendario y el texto "Sin citas" |
| 3 | Con citas próximas | ✅ Se muestran hasta 3 tarjetas con título, fecha y médico; las más cercanas primero |
| 4 | Con más de 3 citas próximas | ✅ Aparece el enlace "Ver todas (N)" debajo de las 3 primeras |
| 5 | Tocar el botón `+` | ✅ Navega a la pantalla completa de Citas con el modal de nueva cita listo para usarse |
| 6 | Tocar una tarjeta de cita | ✅ Navega a la pantalla completa de Citas |
| 7 | Tocar "Ver todas (N)" | ✅ Navega a la pantalla completa de Citas |

---

## 8. Módulo 5 — Historial

> El Historial ya no es una pestaña del menú inferior. Se accede mediante el botón de gráfico (📊) situado en el header derecho de la pantalla **Hoy**.

**Prerrequisitos:** Al menos 7 días de logs.

### TC-21 · Navegación por ventanas de 7 días

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Desde la pestaña "Hoy", tocar el botón de gráfico (📊) en el header derecho | ✅ Se muestra la ventana de los últimos 7 días con etiqueta de rango (ej: "27 Feb – 5 Mar 2026") |
| 2 | Tocar "◀" (semana anterior) | ✅ La ventana retrocede 7 días y los logs se actualizan |
| 3 | Tocar "▶" (semana siguiente) | ✅ La ventana avanza 7 días |

### TC-22 · Estadísticas de adherencia

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Verificar el bloque de estadísticas | ✅ Muestra: cantidad tomadas, omitidas, y porcentaje de adherencia |
| 2 | Si no hay logs en el rango | ✅ El porcentaje de adherencia no se muestra (o aparece "—") |

### TC-23 · Listado de logs por fecha — y notas

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Verificar que los logs se agrupan por fecha | ✅ Cada fecha aparece como encabezado con sus dosis abajo |
| 2 | Verificar ícono por estado | ✅ ✅ = tomada · ✗ = omitida · ⏱ = pendiente |
| 3 | Cambiar de pestaña y volver a Historial | ✅ Los datos se recargan automáticamente (`useFocusEffect`) |
| 4 | Verificar nota en un log que la tenga | ✅ Debajo del nombre/hora aparece un ícono de bocadillo y el texto de la nota en cursiva |
| 5 | Verificar log sin nota | ✅ No se muestra ningún elemento adicional (sin espacio vacío) |

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
| 1 | Verificar campo de nota | ✅ Aparece un `TextInput` multilínea con placeholder para agregar una nota opcional a la dosis |
| 2 | Escribir `[Tomé con el desayuno]` en el campo de nota | — |
| 3 | Tocar "Tomé el medicamento" | ✅ La dosis se registra como "Tomada" con la nota guardada; regresa al Home |
| 4 | Verificar en Historial | ✅ La nota aparece debajo del nombre de la dosis |
| 5 | Tocar "Omitir" (en otra dosis, con una nota) | ✅ La nota también se guarda para dosis omitidas |
| 6 | Tocar "Posponer 15 min" | ✅ Se programa una nueva notificación en 15 min; la nota no se guarda (la dosis sigue pendiente) |

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
| 1 | Intentar importar un JSON que no sea un backup de Pill O-Clock | ✅ Toast de error: "Formato inválido" |
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

## 14. Módulo 11 — Stock de medicamentos

**Prerrequisitos:** Un medicamento con `stockQuantity = 5` y `stockAlertThreshold = 3`.

### TC-51 · Badge de stock en la tarjeta de medicamento

| # | Paso | Resultado esperado |
|---|------|--------------------||
| 1 | Abrir la pestaña "Medicamentos" | ✅ La tarjeta del medicamento muestra un badge con ícono de caja y el número `5` en verde |
| 2 | Bajar el stock a `4` (tomando una dosis) | ✅ El badge muestra `4`; color naranja si está dentro de 3 unidades del umbral |
| 3 | Tomar dos dosis más (stock llega a `2`, por debajo del umbral `3`) | ✅ El badge cambia a **rojo** con etiqueta "Stock bajo" |
| 4 | Editar el medicamento y cambiar `stockQuantity` a `20` | ✅ El badge vuelve a verde con valor `20` |
| 5 | Editar el medicamento y eliminar el campo de stock (dejarlo en blanco) | ✅ El badge desaparece de la tarjeta |

### TC-52 · Notificación de stock bajo

| # | Paso | Resultado esperado |
|---|------|--------------------||
| 1 | Configurar un medicamento con `stockQuantity = 4` y `stockAlertThreshold = 3` | — |
| 2 | Marcar la dosis del día como tomada | ✅ El stock baja a `3` (igual al umbral) y se dispara inmediatamente una notificación del canal `stock-alerts` con título "Stock bajo" |
| 3 | Verificar el cuerpo de la notificación | ✅ Menciona el nombre del medicamento y la cantidad restante |
| 4 | Marcar otra dosis al día siguiente con stock `3 → 2` | ✅ Vuelve a dispararse la notificación (no se acumula; cada toma por debajo del umbral genera un aviso) |

### TC-53 · Stock en backup

| # | Paso | Resultado esperado |
|---|------|--------------------||
| 1 | Exportar backup con un medicamento que tenga stock configurado | ✅ El JSON exportado incluye `stockQuantity` y `stockAlertThreshold` en el objeto del medicamento |
| 2 | Importar el backup en un dispositivo limpio | ✅ El medicamento se restaura con los valores de stock correctos; el badge reaparece en la tarjeta |

---

## 15. Módulo 12 — Notas por dosis

**Prerrequisitos:** Al menos un medicamento con dosis de hoy.

### TC-54 · Agregar nota desde la pantalla de alarma

> Ver también TC-36 actualizado (Módulo 8).

| # | Paso | Resultado esperado |
|---|------|--------------------||
| 1 | Abrir la pantalla de alarma para una dosis pendiente | ✅ Se muestra el campo de nota opcional |
| 2 | Escribir una nota y tocar "Tomé el medicamento" | ✅ La nota se guarda junto con el log de la dosis |
| 3 | Ir a Historial | ✅ La nota aparece en el log con ícono de bocadillo e italiça |

### TC-55 · Agregar o editar nota desde la tarjeta de dosis (Home)

| # | Paso | Resultado esperado |
|---|------|--------------------||
| 1 | En la sección "Completadas" de Hoy, observar una dosis tomada | ✅ Si no tiene nota, se muestra un chip "Agregar nota" con ícono `+` |
| 2 | Tocar el chip "Agregar nota" | ✅ Se abre un modal de edición de nota con un `TextInput` |
| 3 | Escribir una nota y tocar "Guardar" | ✅ El modal se cierra; el chip ahora muestra el texto de la nota |
| 4 | Tocar el chip con la nota existente | ✅ El modal se abre con el texto pre-cargado para edición |
| 5 | Borrar todo el texto y guardar | ✅ La nota se elimina; el chip vuelve a mostrar "Agregar nota" |
| 6 | Tocar "Cancelar" en el modal sin guardar | ✅ No se guarda ningún cambio |

---

## 16. Módulo 13 — Citas médicas

> Las citas ya no tienen pestaña propia. La pantalla completa de Citas se abre desde la sección **"Próximas citas"** al pie de la pestaña **Agenda** (botón `+`, tarjeta de cita, o enlace "Ver todas").

**Prerrequisitos:** Ninguno.

### TC-56 · Crear una cita

| # | Paso | Resultado esperado |
|---|------|--------------------||
| 1 | Ir a pestaña "Agenda" → tocar el botón `+` de la sección "Próximas citas" | ✅ Se navega a la pantalla de Citas con las pestañas "Próximas" y "Pasadas" |
| 2 | Tocar el botón FAB `+` | ✅ Se abre el modal de formulario desde abajo |
| 3 | Dejar el título vacío y tocar "Guardar cita" | ✅ Error: Título requerido |
| 4 | Ingresar título `[Cardiolólogo]`, doctor `[Dr. Pérez]`, ubicación `[Hospital Central]` | — |
| 5 | Tocar el campo de fecha y seleccionar una fecha futura | ✅ El selector nativo se abre; al confirmar la fecha se muestra formateada |
| 6 | Habilitar el checkbox de hora y seleccionar `[09:00]` | ✅ Se muestra el chip de hora con el valor seleccionado |
| 7 | Seleccionar recordatorio "1 hora antes" | ✅ El chip de la opción queda seleccionado (fondo primario) |
| 8 | Ingresar una nota opcional y tocar "Guardar cita" | ✅ El modal se cierra; la cita aparece en la pestaña "Próximas"; la sección en Agenda se actualiza al volver |
| 9 | Verificar la tarjeta creada | ✅ Muestra título, fecha/hora, doctor, ubicación, chip de recordatorio |

### TC-57 · Editar y eliminar una cita

| # | Paso | Resultado esperado |
|---|------|--------------------||
| 1 | Desde Agenda → "Próximas citas", tocar el botón `+` para abrir Citas; luego tocar ✏ (editar) en una cita existente | ✅ El modal se abre con todos los campos pre-cargados |
| 2 | Cambiar el título y guardar | ✅ La tarjeta se actualiza con el nuevo título |
| 3 | Tocar el botón 🗑️ (eliminar) | ✅ Aparece un diálogo de confirmación |
| 4 | Confirmar la eliminación | ✅ La cita desaparece de la lista; si tenía recordatorio programado, la notificación se cancela |
| 5 | Cancelar la eliminación | ✅ La cita permanece en la lista |

### TC-58 · Notificación de recordatorio de cita

> Ejecutar en dispositivo físico.

| # | Paso | Resultado esperado |
|---|------|--------------------||
| 1 | Crear una cita con hora = ahora + 2 minutos y recordatorio = "Sin recordatorio" | ✅ No se programa ninguna notificación |
| 2 | Crear otra cita con hora = ahora + 5 minutos y recordatorio = "1 hora antes" | ✅ La notificación se dispara inmediatamente (faltan menos de 1h) |
| 3 | Verificar el título de la notificación | ✅ "\ud83d\udcc5 Recordatorio de cita" con el título de la cita en el cuerpo |
| 4 | Eliminar la cita; verificar que la notificación no llega de nuevo | ✅ La notificación fue cancelada al eliminar la cita |

### TC-59 · Separación próximas / pasadas

| # | Paso | Resultado esperado |
|---|------|--------------------||
| 1 | Crear una cita con fecha = ayer; volver a Agenda | ✅ La cita no aparece en la sección de Agenda (solo citas futuras); en la pantalla de Citas aparece en "Pasadas" con opacidad reducida |
| 2 | Crear una cita con fecha = mañana; volver a Agenda | ✅ La cita aparece en la sección "Próximas citas" de Agenda |
| 3 | Sin citas en la pestaña activa (dentro de la pantalla de Citas) | ✅ Se muestra el `EmptyState` |

---

## 17. Módulo 14 — Mediciones de salud

**Prerrequisitos:** Ninguno (la pestaña está disponible sin datos).

### TC-60 · Vista general de métricas

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Ir a la pestaña "Salud" | ✅ Se muestra la pantalla con dos sub-pestañas: "Mediciones" y "Diario" |
| 2 | Verificar la sub-pestaña "Mediciones" | ✅ Aparecen 5 tarjetas: Presión arterial, Glucosa, Peso, SpO₂, Frecuencia cardíaca |
| 3 | Sin datos registrados | ✅ Cada tarjeta muestra el nombre de la métrica y el texto "Sin registros" |
| 4 | Con datos registrados | ✅ La tarjeta muestra el último valor, la unidad y una mini sparkline si hay ≥ 2 lecturas |

### TC-61 · Registrar presión arterial

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Tocar la tarjeta "Presión arterial" | ✅ Se navega a la vista de detalle; aparece un botón `+` en el header |
| 2 | Tocar `+` | ✅ Se abre el modal de registro con dos campos numéricos: "Sistólica" y "Diastólica" |
| 3 | Dejar "Sistólica" vacío y tocar "Guardar" | ✅ Error: dato requerido |
| 4 | Ingresar `[120]` en Sistólica y `[80]` en Diastólica; ajustar fecha y hora | — |
| 5 | Tocar "Guardar" | ✅ El modal se cierra; aparece la lectura `120/80 mmHg` en la lista |
| 6 | Volver a la vista general | ✅ La tarjeta de presión arterial muestra `120/80` y la sparkline |

### TC-62 · Registrar otras métricas

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Tocar la tarjeta "Glucosa" → `+` → ingresar `[5.4]` → Guardar | ✅ Aparece "5.4 mmol/L" |
| 2 | Tocar "Peso" → ingresar `[72.5]` → Guardar | ✅ Aparece "72.5 kg" |
| 3 | Tocar "SpO₂" → ingresar `[98]` → Guardar | ✅ Aparece "98 %" |
| 4 | Tocar "Frecuencia cardíaca" → ingresar `[72]` → Guardar | ✅ Aparece "72 bpm" |
| 5 | Agregar una nota opcional en cualquier registro | ✅ La nota aparece en itálica debajo de la lectura |

### TC-63 · Gráfico de tendencia

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Registrar ≥ 3 lecturas de la misma métrica | — |
| 2 | Abrir la vista de detalle | ✅ Aparece la tarjeta "Gráfico" con una línea de tendencia sobre fondo con gradiente |
| 3 | Para presión arterial con al menos 2 lecturas | ✅ El gráfico muestra dos líneas (sistólica sólida, diastólica discontinua) y una leyenda |
| 4 | Con ≤ 1 lectura | ✅ La tarjeta de gráfico no se muestra |

### TC-64 · Eliminar una medición

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | En la vista de detalle, tocar el ícono 🗑️ junto a una lectura | ✅ Aparece un diálogo de confirmación |
| 2 | Confirmar | ✅ La lectura desaparece de la lista; la sparkline y el último valor de la tarjeta general se actualizan |
| 3 | Cancelar | ✅ La lectura permanece |

### TC-65 · Recordatorio de medición

> Ejecutar en dispositivo físico.

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | En la vista general de Mediciones, al final de la pantalla, tocar la sección "Recordatorio" | ✅ Se abre un `TimePicker` nativo |
| 2 | Seleccionar una hora 1 minuto en el futuro | ✅ Se muestra el chip verde "Activo · HH:mm"; se programa una notificación diaria repetida |
| 3 | Esperar a que llegue la hora | ✅ Llega una notificación del canal `health-reminders` con título "⏱ Hora de registrar" |
| 4 | Tocar `✕` junto al chip de recordatorio | ✅ El chip desaparece y la notificación se cancela |

---

## 18. Módulo 15 — Diario de síntomas y estado

**Prerrequisitos:** Ninguno.

### TC-66 · Check-in de hoy

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Ir a "Salud" → sub-pestaña "Diario" | ✅ Aparece una tarjeta de hoy con 🌡 y botón "Registrar" |
| 2 | Tocar "Registrar" | ✅ Se abre el `CheckinModal` |
| 3 | Sin seleccionar estado de ánimo, tocar "Guardar" | ✅ No se guarda; se requiere seleccionar al menos el humor |
| 4 | Seleccionar humor 😄 (5), marcar síntomas "Dolor de cabeza" y "Náuseas", escribir una nota | — |
| 5 | Tocar "Guardar" | ✅ El modal se cierra; la tarjeta de hoy muestra el emoji 😄 y los síntomas |

### TC-67 · Editar check-in existente

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Con un check-in guardado de hoy, tocar el botón "Editar" en la tarjeta | ✅ El `CheckinModal` se abre con los datos pre-cargados |
| 2 | Cambiar el humor a 😕 (2) y quitar todos los síntomas | — |
| 3 | Guardar | ✅ La tarjeta de hoy refleja el emoji 😕 y sin síntomas |

### TC-68 · Historial de check-ins

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Con check-ins registrados en días anteriores | ✅ Aparecen listados debajo de la tarjeta de hoy, con emoji, fecha y síntomas |
| 2 | Tocar un check-in pasado | ✅ Se abre el modal con los datos de ese día para edición |
| 3 | Sin check-ins registrados aún | ✅ Se muestra el `EmptyState` correspondiente |

### TC-69 · Prompt en home screen

> Ver TC-10 en Módulo 2.

---

## 19. Módulo 16 — Reporte PDF

**Prerrequisitos:** Al menos un medicamento, algunos logs de dosis y al menos una medición de salud o check-in.

### TC-70 · Generar reporte PDF

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Ajustes → "Generar reporte" | ✅ El botón muestra un spinner mientras se genera |
| 2 | Esperar la generación (~2–5 s) | ✅ Se abre el sheet de compartir del sistema operativo |
| 3 | Verificar el nombre del archivo | ✅ `pilloclock-report-YYYY-MM-DD.pdf` |
| 4 | Compartir vía email o guardar | ✅ El archivo es un PDF válido y se abre correctamente en un visor |

### TC-71 · Contenido del reporte

| # | Paso | Resultado esperado |
|---|------|--------------------|
| 1 | Abrir el PDF generado | ✅ Contiene secciones: **Medicamentos activos**, **Historial de dosis**, **Mediciones de salud**, **Diario** |
| 2 | Sección medicamentos | ✅ Tabla con nombre, dosis, categoría, instrucciones |
| 3 | Sección historial | ✅ Filas agrupadas por fecha; cada dosis muestra nombre, hora, estado y nota (si tiene) |
| 4 | Sección mediciones | ✅ Una sub-sección por tipo de métrica; muestra hasta 20 lecturas con fecha y valor |
| 5 | Sección diario | ✅ Hasta 30 check-ins con emoji de humor, síntomas y notas |
| 6 | Footer | ✅ Incluye nota de privacidad: "Datos 100% locales — Pill O-Clock" |
| 7 | Sin datos en alguna sección | ✅ Se muestra el texto "Sin datos registrados" en esa sección |

---

## 20. Casos de borde y regresiones

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
| 1 | Crear medicamento con alarma solo los viernes. Probar un martes | ✅ No aparece en Hoy ni en la Agenda del martes |

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

## 21. Checklist de release

Ejecutar la siguiente lista antes de publicar cada build en las stores.

### Pre-release — Ambas plataformas

- [ ] TC-01 (Onboarding completo) pasa en dispositivo físico
- [ ] TC-04 (Home — estructura + chip de racha) pasa
- [ ] TC-04 a TC-09 (Home) pasan
- [ ] TC-10 (Prompt de check-in en Home) pasa
- [ ] TC-10 (botón Historial en header de Home navega correctamente) pasa
- [ ] TC-07b (Snooze dosis futura — badge ámbar) pasa
- [ ] TC-10-A (Reschedule once) pasa en ambas plataformas
- [ ] TC-10-B (Tip de reschedule) se muestra una sola vez
- [ ] TC-10, TC-12, TC-15, TC-17 (CRUD de medicamentos) pasan
- [ ] TC-17b (Stock en formulario y badge) pasa
- [ ] TC-27 a TC-32 (Notificaciones en segundo plano) pasan en dispositivo físico
- [ ] TC-35 a TC-36 (Pantalla de alarma + nota) pasan
- [ ] TC-38, TC-39, TC-40 (Backup) pasan
- [ ] TC-42 (Persistencia de preferencias) pasa
- [ ] TC-44 (Sin conexión) pasa
- [ ] TC-50 (Reset de datos) pasa
- [ ] TC-51 a TC-53 (Stock: badge, notificación, backup) pasan
- [ ] TC-54 a TC-55 (Notas por dosis: alarma + Home) pasan
- [ ] TC-20a (Sección "Próximas citas" en Agenda) pasa
- [ ] TC-56 a TC-59 (Citas: CRUD + notificación + sección pasadas/próximas) pasan
- [ ] TC-60 a TC-64 (Mediciones de salud: CRUD + gráfico) pasan
- [ ] TC-65 (Recordatorio de medición) pasa en dispositivo físico
- [ ] TC-66 a TC-68 (Diario: check-in, edición, historial) pasan
- [ ] TC-70 a TC-71 (Reporte PDF: generación + contenido) pasan

### Pre-release — Android únicamente

- [ ] TC-03 (Permiso alarma exacta Android 12) verificado en API 31 o 32
- [ ] TC-33 (Bypass DnD) verificado
- [ ] TC-45a (Reprogramación post-reinicio) verificado
- [ ] El canal `pill-reminders` aparece en Ajustes → Notificaciones → Pill O-Clock
- [ ] El canal `health-reminders` aparece en Ajustes → Notificaciones → Pill O-Clock
- [ ] El sonido `alarm.wav` suena correctamente (no el sonido de sistema default)
- [ ] La app no cierra con el gesto de retroceso predictivo (predictiveBackGestureEnabled: false)

### Pre-release — iOS únicamente

- [ ] TC-02 (Permiso denegado) no causa crash
- [ ] TC-34 (Critical Alerts no molestar) verificado con Focus Mode activo
- [ ] TC-45b (Notificaciones post-reinicio) verificado
- [ ] Los botones de acción de notificación se muestran al deslizar en iOS
- [ ] La app funciona en modo tablet (supportsTablet: true)

---

> **Nota:** Esta guía cubre los flujos funcionales de la versión 1.3.0. Actualizar los módulos afectados ante cada nueva feature o cambio en el comportamiento de notificaciones.

---

## 22. Módulo 17 — Medicamentos PRN (a demanda)  *(nuevo en v1.3)*

> **PRN** = *pro re nata* (en latín, "según sea necesario"). Son medicamentos sin horario fijo que el usuario se administra cuando lo necesita — analgésicos, antiácidos, medicación de rescate, etc.

### Cómo activarlo

Al crear o editar un medicamento, en la sección **Frecuencia**, activar el toggle **"On demand (PRN)"**. Al hacerlo, los campos de horario y días de semana desaparecen (no aplican) y el medicamento se guarda sin schedules.

### TC-72-PRN · Crear un medicamento PRN

| # | Paso | Resultado esperado |
|---|------|---------------------|
| 1 | Nuevo medicamento → nombre `[Ibuprofeno 400]` → activar toggle "On demand (PRN)" | ✅ Los campos de alarma y días desaparecen del formulario |
| 2 | Guardar | ✅ El medicamento aparece en la lista de "Activos" sin horarios ni notificaciones programadas |
| 3 | Verificar en la pantalla de "Hoy" | ✅ **No** aparece en las secciones Pendientes/Perdidas/Completadas |
| 4 | Desplazarse en la pantalla "Hoy" hacia el final de la lista | ✅ Aparece la sección **"A demanda"** (separada con un divider) con la tarjeta del medicamento PRN |

### TC-73-PRN · Registrar una dosis PRN

| # | Paso | Resultado esperado |
|---|------|---------------------|
| 1 | En la sección "A demanda" de Hoy, tocar el botón de la tarjeta PRN | ✅ Haptic feedback; se registra un log `taken` con la hora actual en la base de datos |
| 2 | Verificar el contador en la tarjeta | ✅ Aparece debajo del nombre: `×1 tomada` (o `×1 taken` en inglés) |
| 3 | Tocar el botón dos veces más | ✅ El contador pasa a `×3 tomada` |
| 4 | Sin tomas del día | ✅ No se muestra ningún contador (el campo es invisible hasta la primera toma) |

### TC-74-PRN · PRN en Historial

| # | Paso | Resultado esperado |
|---|------|---------------------|
| 1 | Ir a Historial (↗ desde Hoy) tras registrar una dosis PRN | ✅ Aparece en el listado con estado `taken`, hora exacta de registro y nombre del medicamento |
| 2 | Verificar el estado de la dosis PRN | ✅ Las dosis PRN se muestran siempre como `taken` — no existen estados `pending`, `skipped` ni `missed` para medicamentos PRN |

### TC-75-PRN · PRN no genera notificaciones

| # | Paso | Resultado esperado |
|---|------|---------------------|
| 1 | Crear un medicamento PRN | ✅ No se programa ninguna notificación en el sistema |
| 2 | Esperar hasta media noche y revisar las notificaciones pendientes | ✅ No llega ningún aviso relacionado con el medicamento PRN |

### TC-76-PRN · PRN no aparece en Agenda / Calendario

| # | Paso | Resultado esperado |
|---|------|---------------------|
| 1 | Ir a la pestaña "Agenda" | ✅ El medicamento PRN no genera puntos de estado en ningún día del calendario (ya que no tiene schedules) |
| 2 | Las tomas registradas SÍ aparecen en Historial (TC-74-PRN) | ✅ Solo el historial refleja las tomas PRN pasadas |

---

## 23. Módulo 18 — Foto del medicamento  *(nuevo en v1.3)*

**Prerrequisitos:** Al menos un medicamento existente.

### TC-72 · Adjuntar foto al crear un medicamento

| # | Paso | Resultado esperado |
|---|------|---------------------|
| 1 | Formulario de nuevo medicamento → tocar el botón de cámara "Agregar foto" | ✅ Se solicita permiso de galería al sistema si es la primera vez |
| 2 | Denegar el permiso | ✅ Toast de error `form.errorPhotoPermission` (ej: "Se necesita permiso para acceder a la galería") |
| 3 | Conceder el permiso y repetir | ✅ Se abre el selector de imágenes del sistema con ratio 1:1 y recorte habilitado |
| 4 | Seleccionar una foto | ✅ El modal se cierra; aparece una miniatura cuadrada de la foto junto a dos botones: "Cambiar" y "Quitar" |
| 5 | Guardar el medicamento | ✅ La tarjeta en la lista muestra la foto como avatar circular en lugar del ícono de píldora |

### TC-73 · Cambiar / quitar foto en un medicamento existente

| # | Paso | Resultado esperado |
|---|------|---------------------|
| 1 | Editar un medicamento que tenga foto → tocar "Cambiar" | ✅ Se abre el selector; al confirmar reemplaza la miniatura |
| 2 | Tocar "Quitar" | ✅ La miniatura desaparece; el botón de cámara vuelve a mostrarse |
| 3 | Guardar con foto eliminada | ✅ La tarjeta vuelve a mostrar el ícono de píldora genérico |

### TC-74 · Foto en tarjeta de dosis (DoseCard)

| # | Paso | Resultado esperado |
|---|------|---------------------|
| 1 | Con un medicamento que tenga foto, abrir la pestaña "Hoy" | ✅ La `DoseCard` muestra la foto como miniatura circular en lugar del punto de color |
| 2 | Con un medicamento sin foto | ✅ El punto de color original sigue visible |
| 3 | Verificar en modo oscuro | ✅ La foto no tiene borde blanco forzado; se adapta al tema |

---

## 23. Módulo 18 — Prompt de valoración en la tienda  *(nuevo en v1.3)*

> Este prompt se activa automáticamente. **No debe dispararse en entorno de desarrollo** (`enabled: false` en `StoreReview`).

**Prerrequisitos:** Probar en build de producción (APK firmado / TestFlight).  
**Condición de disparo:** ≥ 10 dosis marcadas como "tomada" Y ≥ 7 días desde la primera instalación.

### TC-75 · Prompt no aparece antes del umbral

| # | Paso | Resultado esperado |
|---|------|---------------------|
| 1 | Instalar la app por primera vez y marcar 9 dosis como tomadas | ✅ No aparece ningún diálogo de valoración |
| 2 | Marcar la dosis número 10 el mismo día de la instalación | ✅ Tampoco aparece (faltan ≥ 7 días) |

### TC-76 · Prompt aparece al cumplir ambas condiciones

| # | Paso | Resultado esperado |
|---|------|---------------------|
| 1 | Simular que han pasado 7 días (avanzar la fecha del dispositivo o esperar) y marcar la dosis 10 | ✅ El SO muestra el sheet nativo de valoración (Play Store / App Store) |
| 2 | Cerrar el sheet y marcar más dosis | ✅ El prompt **no** vuelve a aparecer (se guarda la marca `review_prompted` en AsyncStorage) |
| 3 | Desinstalar, reinstalar y repetir en un dispositivo diferente | ✅ El prompt puede aparecer de nuevo (el estado es local a la instalación) |

---

## 24. Módulo 19 — Política de privacidad en Ajustes  *(nuevo en v1.3)*

### TC-77 · Enlace a política de privacidad

| # | Paso | Resultado esperado |
|---|------|---------------------|
| 1 | Ir a la pestaña Ajustes → sección "Acerca de" | ✅ Aparece una fila "Política de privacidad" con icono de escudo verde |
| 2 | Tocar la fila | ✅ Se abre el navegador del sistema en `https://kegb.github.io/pill-o-clock/privacy-policy.html` |
| 3 | Verificar en idioma inglés (cambiar idioma en Ajustes primero) | ✅ El texto de la fila traduce a "Privacy Policy" |
| 4 | Volver a la app | ✅ La app sigue en la misma pantalla sin crash |

---

## 25. Módulo 20 — Seguimiento de errores (Sentry)  *(nuevo en v1.3)*

> Sentry solo captura eventos en builds de **producción** (`enabled: process.env.NODE_ENV === 'production'`). En desarrollo local los errores se muestran en consola pero no se envían.

### TC-78 · Sentry no reporta en desarrollo

| # | Paso | Resultado esperado |
|---|------|---------------------|
| 1 | Ejecutar la app con `npx expo start` o `npx expo run:android` sin la variable `EXPO_PUBLIC_SENTRY_DSN` en `.env` | ✅ La app arranca sin crash; en consola aparece la advertencia de Sentry con DSN vacío |
| 2 | Provocar una excepción controlada en `ErrorBoundary` (si se tienen herramientas de QA) | ✅ El error se muestra en la UI del ErrorBoundary pero **no** se envía a Sentry (sin DSN) |

### TC-79 · Sentry captura en producción *(build firmado con DSN)*

| # | Paso | Resultado esperado |
|---|------|---------------------|
| 1 | Generar un build de producción con `EXPO_PUBLIC_SENTRY_DSN` configurado en las variables de entorno de EAS | — |
| 2 | Provocar un error no controlado (ingeniería inversa o módulo de prueba QA) | ✅ El evento aparece en el dashboard de Sentry con el stack trace completo y el `componentStack` del ErrorBoundary |
| 3 | Verificar que el `tracesSampleRate = 0.2` (20 %) no satura el cupo gratuito | ✅ No todos los clics generan transacciones (solo ~20 % de las sesiones) |

---

## 26. Módulo 21 — Widget de pantalla de inicio (Android)  *(nuevo en v1.3)*

> Solo aplica a **Android**. El widget es un appwidget estándar `2–3×1` (RemoteViews) sin Compose/Glance. Requiere dispositivo físico o emulador con paneles de acceso directo. El tamaño inicial puede variar entre launchers: en el Pixel Launcher con Android 12+ aparece como **3×1** (el launcher ajusta el mínimo de ancho al grid más cercano).

### TC-80 · Agregar el widget en la pantalla de inicio

| # | Paso | Resultado esperado |
|---|------|---------------------|
| 1 | Mantener pulsado en un espacio vacío de la pantalla de inicio | ✅ Aparece el menú contextual del launcher |
| 2 | Tocar "Widgets" y buscar "Pill O-Clock" | ✅ Aparece un widget con el nombre de la app |
| 3 | Arrastrar el widget a la pantalla de inicio | ✅ El widget se coloca (típicamente 3×1 en el Pixel Launcher) y muestra inmediatamente el estado actual de dosis |

### TC-81 · Contenido del widget con dosis pendiente

| # | Paso | Resultado esperado |
|---|------|---------------------|
| 1 | Tener una dosis pendiente para hoy | ✅ El widget muestra: `💊  [Nombre del medicamento]` en la primera línea y `Next: HH:mm` en la segunda |
| 2 | Verificar en modo oscuro del sistema | ✅ El fondo del widget cambia a `#1E293B` y el texto a colores claros (`#F1F5F9`) |
| 3 | Verificar en modo claro | ✅ El fondo es blanco y el texto es oscuro (`#0F172A`) |

### TC-82 · Widget cuando todas las dosis están completadas

| # | Paso | Resultado esperado |
|---|------|---------------------|
| 1 | Marcar todas las dosis del día como tomadas o saltadas | ✅ El widget actualiza automáticamente y muestra: `✔  All done` en color verde |
| 2 | Sin medicamentos activos para hoy | ✅ El widget también muestra `✔  All done` |

### TC-83 · Tap en el widget abre la app

| # | Paso | Resultado esperado |
|---|------|---------------------|
| 1 | Tocar el widget desde la pantalla de inicio | ✅ La app se abre en la pantalla de "Hoy" (pantalla principal) |
| 2 | Si la app ya está en segundo plano | ✅ La app pasa al primer plano sin crear una nueva instancia (`FLAG_ACTIVITY_NEW_TASK \| FLAG_ACTIVITY_CLEAR_TOP`) |

### TC-84 · Actualización en tiempo real

| # | Paso | Resultado esperado |
|---|------|---------------------|
| 1 | Volver a la pantalla de inicio y observar el widget | ✅ El widget muestra la dosis correcta desde el inicio |
| 2 | Abrir la app, marcar una dosis, y volver a la pantalla de inicio | ✅ El widget actualiza el contenido en los segundos siguientes reflejando el nuevo estado |
| 3 | Reiniciar el dispositivo | ✅ El widget sigue funcionando después del reinicio (SharedPreferences persiste entre reinicios) |

---

## Actualización del checklist de release (v1.3)

Añadir los siguientes ítems al checklist de la sección 21:

### Pre-release — Ambas plataformas (nuevos en v1.3)

- [ ] TC-72 a TC-74 (Foto de medicamento: adjuntar, cambiar, quitar, DoseCard) pasan
- [ ] TC-77 (Política de privacidad en Ajustes) pasa
- [ ] TC-78 (Sentry deshabilitado en dev) verificado
- [ ] TC-79 (Sentry captura en producción) verificado con build firmado

### Pre-release — Android únicamente (nuevos en v1.3)

- [ ] TC-80 (Widget se agrega al launcher sin crash)
- [ ] TC-81 (Widget muestra dosis pendiente con colores correctos en claro y oscuro)
- [ ] TC-82 (Widget muestra "All done" cuando no quedan pendientes)
- [ ] TC-83 (Tap en widget abre la app)
- [ ] TC-84 (Widget actualiza al volver de la app tras marcar dosis)

### Pre-release — Producción únicamente (nuevos en v1.3)

- [ ] TC-75 a TC-76 (Prompt de valoración se dispara solo una vez al cumplir condiciones)
