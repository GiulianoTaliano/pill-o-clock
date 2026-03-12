# Pill O-Clock — Roadmap v1.3 → v2.0

> Fecha de revisión: marzo 2026 · Versión actual en producción: **1.4.0 (Android)**

---

## Estado actual — Qué hace la app hoy

### Módulos completos
| Módulo | Funcionalidades clave |
|---|---|
| **Medicamentos** | CRUD, categorías, unidades de dosis, colores custom, fechas inicio/fin, notas, activo/inactivo, stock + alerta de stock bajo |
| **Horarios** | Múltiples alarmas por medicamento, días de semana específicos o diario |
| **Alarmas** | Android: AlarmManager nativo (bypassa Doze, pantalla completa, suena en silencio). iOS: cadena local notifications. Snooze 15 min, reprogramar único, deshacer toma/omisión, acciones directas desde notificación |
| **Pantalla de hoy** | Dosis del día por sección (pendiente/perdida/completada), priority sort, notas por dosis, racha de adherencia, date-jump |
| **Historial** | Vista semanal navegable, stats taken/skipped, % adherencia |
| **Calendario** | Vista mensual con dots de estado, detalle por día (dosis + turnos) |
| **Turnos médicos** | CRUD, doctor, ubicación GPS (mapa picker), recordatorio antes (1h/2h/24h) |
| **Salud** | Presión arterial, glucosa, peso, SpO2, frec. cardíaca — gráfico de línea por métrica, recordatorio recurrente configurable |
| **Check-in diario** | Mood 1-5, síntomas, notas — prompt automático en home |
| **Configuración** | Tema (auto/light/dark), idioma (EN/ES), backup JSON export/import, PDF report, permiso full-screen intent |
| **Onboarding** | 4 slides, solicitud de permisos (notificaciones, exact alarm, full-screen) |

### Deudas técnicas identificadas
- Backup JSON no incluye turnos, mediciones de salud ni check-ins → **datos críticos se pierden al hacer restore**
- Historial solo semanal, sin vista mensual ni anual
- Sin iOS build configurado en EAS
- Sin tracking de errores en producción
- Sin tests automatizados
- Onboarding usa solo íconos Ionicons — sin ilustraciones propias

---

## Principios del roadmap

1. **Retención primero** — la app ya es funcional; el foco del próximo ciclo es que los usuarios la sigan usando y hablen de ella.
2. **Confianza del usuario** — cada cambio que toque datos debe ser 100 % seguro y reversible.
3. **Lanzamiento multiplataforma** — iOS es un mercado mayor para apps de salud; debe salir cuanto antes.
4. **Progresividad** — no agregar complejidad de UI antes de pulir la existente.

---

## v1.3 — “Confianza y pulido” · ✅ Lanzado

> Objetivo: lanzar en iOS, corregir las fallas que más dañan la retención, y preparar la base para las features de crecimiento.

### 🔴 Crítico (bloquea lanzamiento iOS)

#### 1. Lanzamiento en App Store ⏳ _(pospuesto — tarifa iOS $99)_
- Configurar perfil de EAS para iOS production
- Completar `infoPlist` con descripciones de permisos correctas para revisión de Apple
- Gestionar el entitlement de Critical Alerts ante Apple (ya está en `app.json`, necesita aprobación)
- Capturas de pantalla para todas las resoluciones requeridas (iPhone 6.9", 6.5", iPad)
- Privacidad: enlazar la privacy policy desde Configuración → "Política de privacidad"
- App Store Connect: keywords, categoría (Medical o Health & Fitness), subtítulo

#### 2. ✅ Backup completo
- Ampliar `BackupData` para incluir `appointments`, `healthMeasurements` y `dailyCheckins`
- Bump `BackupData.version` a `2` con migración backward-compatible al importar
- Agregar indicador de qué datos contiene el backup antes de sobrescribir

#### 3. ✅ Corrección del historial de dosis perdidas
- Actualmente una dosis que nunca se marcó no genera un `DoseLog` con `status: missed` en DB; es computada en memoria al momento de render. Esto hace que el historial semanal sea inconsistente si se navega a semanas pasadas sin que el día haya "pasado" mientras la app estaba abierta.  
- Solución: background task que al inicio de cada día cierra (upserta como `missed`) los logs pendientes del día anterior.

---

### 🟠 Alta prioridad

#### 4. ✅ Animación de confirmación de toma
- Al marcar una dosis como "tomada", reproducir una micro-animación (checkmark animado con `react-native-reanimated`) + vibración suave
- Esto es un **momento de satisfacción** clave para retención — el usuario debe sentir que la app lo recompensa

#### 5. ✅ Prompt de valoración en la tienda
- Usar `expo-store-review` para solicitar valoración después de 7 días de uso activo y ≥10 dosis tomadas
- Solo preguntar una vez; no volver a preguntar si el usuario descarta

#### 6. ✅ Widget de pantalla de inicio (Android)
- Widget pequeño (2×1) que muestre la próxima dosis pendiente del día con botón "Tomé"
- Usar Glance API a través de un módulo nativo Kotlin (similar al enfoque de `expo-alarm`)
- Es la feature más solicitada en apps de este tipo y mejora drásticamente la retención

#### 7. Acciones rápidas desde la notificación (iOS) ⏳ _(pospuesto — requiere iOS)_
- En Android ya funciona vía `expo-alarm`. En iOS, implementar categorías de notificación con acciones (`expo-notifications`) para Tomé / Posponer / Omitir directamente desde el banner
- Actualmente iOS solo muestra el banner sin acciones

#### 8. ✅ Vista mensual en Historial
- Agregar un toggle "Semana / Mes" en la pantalla de Historial
- Vista mensual: heatmap de adherencia (estilo GitHub contributions) — verde = ≥80%, amarillo = 50–79%, rojo = <50%, gris = sin datos
- Es visualmente poderoso para capturas de tienda y para que el usuario se enorgullezca de su racha

---

### 🟡 Mejoras de UX

#### 9. ✅ Foto del medicamento
- Permitir agregar una foto de la cajita o el blíster al crear/editar un medicamento
- Usar `expo-image-picker`
- Mostrarla como thumbnail en `MedicationCard` y en `DoseCard`
- Reduce errores de toma (el usuario confirma visualmente qué pastilla es)

#### 10. ✅ Motivo de omisión
- Al omitir una dosis, mostrar opciones rápidas: "Me olvidé" / "Efecto adverso" / "Sin stock" / "Otro"
- Persiste como campo `skipReason` en `DoseLog`
- Aparece en el PDF report y en el historial detallado
- Útil para el médico ("¿por qué saltea tanto esta medicación?")

#### 11. ✅ Próxima dosis visible en MedicationCard
- La tarjeta de medicamento activo debe mostrar "Próxima: HH:mm" o "Hoy completado ✓"
- Actualmente se necesita ir al home para saber cuándo es la próxima toma

#### 12. ✅ Soporte para medicamentos "a demanda" (PRN)
- Nuevo tipo de programación: sin horario fijo, el usuario registra cuando lo toma
- Botón "Registrar toma" flotante o en el home para meds PRN
- Útil para ibuprofeno, antihistamínicos, spray broncodilatador, etc.

---

## v1.4 — "Crecimiento y diferenciación" · ~8-10 semanas

> Objetivo: features que convierten Pill O-Clock en la app que los usuarios recomiendan.

#### 13. Perfiles múltiples (familia / cuidador)
- Soporte para gestionar medicamentos de múltiples personas ("yo", "mamá", "papá")
- Cada perfil es un set de datos aislado (medicamentos, historial, salud)
- Selector de perfil en el header del home
- Monetización potencial: perfil adicional = feature premium

#### 14. Integración con Apple Health / Google Fit
- Exportar dosis tomadas como `HKCategoryTypeIdentifierMindfulSession` (o custom) a HealthKit
- Exportar mediciones de salud (glucosa, peso, frec. cardíaca, SpO2, PA) a HealthKit/Health Connect
- Esto hace la app mucho más atractiva para el ecosistema Apple y usuarios fitness

#### 15. Recordatorio de receta / reposición
- Campo opcional en el medicamento: "Cantidad de días de stock" o "Fecha de próxima receta"
- Notificación configurable N días antes de que se acabe el stock proyectado
- Diferente al alerta de stock bajo actual (ese es por unidades; este es predictivo por días)

#### 16. Compartir reporte con el médico
- Mejorar el PDF report actual:
  - Portada con nombre del paciente, rango de fechas, nombre del médico tratante
  - Gráfico de adherencia mensual (heatmap)
  - Tabla de mediciones de salud con referencia de valores normales
  - Sección de check-ins con tendencia de humor
- Agregar opción "Enviar por email" además de "Compartir"
- Este es un **argumento de venta** clave para usuarios mayores y sus cuidadores

#### 17. Escáner de código de barras de medicamentos
- Al crear un medicamento, opción de escanear el barcode de la caja
- Conectar a una API pública de medicamentos (ej. OpenFDA, AEMPS España) para autocompletar nombre, dosis, categoría
- `expo-barcode-scanner` o `expo-camera`

#### 18. Exportación al calendario del sistema
- Exportar turnos médicos al calendario nativo (iOS EventKit / Android Calendar Provider)
- Usar `expo-calendar`
- El usuario lo ve en su app nativa de Calendario junto al resto de su vida

#### 19. Análisis de adherencia avanzado
- Nueva sección "Estadísticas" (o pestaña en Historial): 
  - Adherencia por medicamento (tabla)
  - Tendencia semanal de las últimas 8 semanas (línea chart)
  - Top motivos de omisión
  - Racha más larga histórica
  - Hora del día con peor adherencia (¿el de las 22:00 siempre se olvida?)

#### 20. Modo oscuro optimizado + temas de color
- El modo oscuro actual funciona, pero los backgrounds de categoría y los colores de los medication cards se ven muy apagados en dark mode
- Revisar contraste de todos los estados (pending/missed/taken) en dark mode según WCAG AA
- Agregar 2-3 paletas de acento opcionales (no solo azul `#4f9cff`) — es un feature simple que los usuarios adoran y diferencia en screenshots

---

## v2.0 — "Plataforma" · ~3-4 meses

> Objetivo: transformar Pill O-Clock de una app de recordatorios a una plataforma de gestión de salud personal.

#### 21. Sincronización en la nube (Cloud Sync)
- Backend mínimo (Supabase o Firebase) con autenticación anónima + opcional email
- Sync automático del backup JSON cada vez que hay conexión
- Soporte multi-dispositivo: teléfono + tablet del mismo usuario
- Base para la feature de cuidador remoto

#### 22. Modo cuidador remoto
- Un "cuidador" puede monitorear el cumplimiento de otro perfil en tiempo real
- Notificación al cuidador si el usuario no marcó una dosis en N minutos
- Requiere cloud sync
- **Caso de uso de alta tracción:** adultos mayores + hijos cuidadores

#### 23. Apple Watch / WearOS
- Complication en Apple Watch que muestra próxima dosis
- Acción "Tomé" desde la muñeca
- Requiere módulo nativo watchOS/WearOS

#### 24. Siri Shortcuts / Google Assistant
- "Hey Siri, tomé el ibuprofeno" → registra la dosis en Pill O-Clock
- "Hey Google, ¿cuándo es mi próxima dosis?" → responde con la hora
- `expo-intent-launcher` + Siri Shortcuts API

#### 25. Freemium / Monetización
- **Plan gratuito**: hasta 3 medicamentos activos, 1 perfil, backup manual
- **Plan Plus (~$2.99/mes o $19.99/año)**: perfiles múltiples, cloud sync, integración HealthKit, análisis avanzado, exportación calendario
- Usar `expo-in-app-purchases` (StoreKit / Google Play Billing)
- Modelo de negocio: no mostrar ads (daña confianza en app de salud); sí ofrecer utilidad real en el tier premium

---

## Deuda técnica transversal (a trabajar en paralelo)

| # | Tarea | Urgencia |
|---|---|---|
| T1 | Configurar Sentry (o similiar) para captura de errores en producción | ~~Alta~~ ✅ Completo (v1.3) |
| T2 | Tests de integración para el store (markDose, backup, notificaciones) con Jest | Media |
| T3 | Migración automatizada de DB con versioning (actualmente la DB se crea de cero) | Alta |
| T4 | Agregar `eslint-plugin-react-hooks` y sanear todos los hooks de dependencias | Media |
| T5 | Métricas de uso básicas y anónimas (PostHog self-hosted) para validar qué features se usan | Media |
| T6 | Revisar el budget de 64 notificaciones en iOS al agregar perfiles múltiples | Alta (para v1.5+) |
| T7 | Internacionalización: agregar portugués (Brasil) — tercer mercado más grande de la región | Media |
| T8 | Accesibilidad: labels `accessibilityLabel` en todos los botones de acción táctil | ~~Media~~ ✅ Completo (v1.4) |

---

## Assets y marketing (pre-lanzamiento iOS + v1.3)

| Acción | Descripción |
|---|---|
| **Screenshots de tienda** | Diseñar 5-6 capturas con texto superpuesto en inglés y español. Mostrar: home con dosis del día, calendar heatmap, health charts, appointment con mapa, dark mode |
| **Video preview** | 15-30s mostrando el flujo principal: agregar med → recibir alarma → marcar como tomado → ver racha. Sin voz, solo texto en pantalla |
| **Ícono A/B** | Probar 2 variantes de ícono en Google Play (A/B testing de íconos disponible en Play Store) |
| **Keyword research** | Mapear keywords en inglés y español: "pill reminder", "medication tracker", "pastilla recordatorio", "medicamento alarma". Revisar competencia directa (Medisafe, MyTherapy) |
| **Página de producto** | Landing page simple (GitHub Pages o Vercel) con capturas, features y link a tiendas |
| **Respuesta a reseñas** | Preparar plantillas de respuesta para reseñas positivas y negativas. Las primeras 10 reseñas son críticas para el ranking |

---

## Resumen de prioridades visuales

```
Q1 2026 (v1.4 — calidad y accesibilidad)
├── ✅ Skeleton loading (Historial, Agenda, formulario de medicamento)
├── ✅ Tour guiado en el Home (spotlight + tooltip, una sola vez)
├── ✅ Swipe-to-dismiss en todos los modal sheets
├── ✅ Accesibilidad completa (VoiceOver / TalkBack) en componentes interactivos
├── ✅ Predictive back gesture rehabilitado globalmente (bloqueado solo en pantalla de alarma)
└── ✅ Notification map migrado a SQLite (fiabilidad ACID)

Q3 2026 (v1.5)
├── Perfiles múltiples
├── Apple Health / Google Fit
├── Recordatorio de reposición predictivo
├── Escáner de barcode
├── Compartir reporte mejorado con médico
├── Exportar turnos al calendario del sistema
└── Estadísticas avanzadas de adherencia

Q4 2026 (v2.0)
├── Cloud Sync (Supabase)
├── Modo cuidador remoto
├── Freemium (IAP)
├── Apple Watch / WearOS
└── Siri / Google Assistant
```

---

> **Criterio de éxito v1.3:** ≥500 descargas orgánicas en los primeros 30 días post-lanzamiento iOS, rating ≥4.5 en ambas tiendas, retención D7 ≥40%.
