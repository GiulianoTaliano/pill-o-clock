# Pill O-Clock: evaluación visual y dirección propuesta

Fecha: 9 de octubre de 2026. Complementa el [informe principal](uiux-audit-2026-10-09.md). La propuesta es conceptual; no cambia la app.

## Evidencia visual y sus límites

- Inspección de las **56 imágenes** de `screenshots/audit-sprint2-validation`: 28 claras y 28 oscuras, agrupadas en ocho láminas para comparación. El manifiesto fecha la captura el **21 de julio de 2026**. Son antecedentes visuales, no evidencia de que todos esos defectos continúen.
- Revisión del código de las 13 pantallas y sus componentes en HEAD `c820ad2`.
- Inspección auxiliar del APK Android **1.7.0, versionCode 35**, instalado el 27 de julio. El repositorio declara versionCode 36: no se presupone equivalencia. Se verificaron Inicio y Ajustes mediante captura y árbol de accesibilidad estabilizados, y los diálogos de omisión y Archivar mediante sus árboles y resultados. Otras capturas automáticas llegaron durante transiciones o en una ruta distinta de la solicitada: se descartaron como evidencia atribuible a una pantalla.
- No se publican las capturas nuevas del dispositivo porque contienen datos del entorno. La lámina propuesta usa ejemplos ficticios.
- No hay validación visual actual de iOS, tablet, texto al 200 %, TalkBack o VoiceOver. Los riesgos correspondientes se indican como pendientes.

## Qué conviene conservar

La cápsula con reloj de `BrandMark.tsx` es una identidad propia y pertinente. `Illustration.tsx` ya construye una familia SVG adaptable al tema; no hace falta reemplazarla con imágenes decorativas. Las etiquetas junto a los accesos de Inicio y el botón para compartir el informe desde Historial corrigen problemas de descubribilidad anteriores. El botón principal de DoseCard usa ahora `bg-green-700`, una mejora respecto del verde claro de capturas antiguas. La barra de cinco pestañas es una buena base.

## Evaluación por dimensión

| Dimensión | Evidencia actual | Efecto | Dirección recomendada |
|---|---|---|---|
| Jerarquía de Inicio | `index.tsx:373,402,432`: bienestar y citas preceden a las dosis | La tarea diaria puede quedar debajo de contenido secundario | Próxima dosis pendiente primero; después otras dosis, pendientes de registrar, citas y bienestar |
| Orden temporal | `index.tsx:153-161`: ordena por categoría antes que por hora | La primera tarjeta no garantiza ser la próxima toma | Hora efectiva como orden principal; categoría sólo descriptiva |
| Información crítica | `MedicationCard.tsx:107`, alarma `:357` y captura APK35 de Inicio recortan nombres | Dos presentaciones similares pueden resultar difíciles de distinguir | Dos líneas para nombre/presentación, dosis en línea propia y detalle completo accesible |
| Densidad | `MedicationCard.tsx:84-315`: identidad, categoría, fechas, stock, horarios, próximo evento, interruptor y tres acciones | Una lista corta ocupa varias pantallas | Fila resumida + detalle; mostrar en lista sólo estado, próxima toma y alerta de stock cuando aplica |
| Colores | `DoseCard.tsx:206`, `MedicationCard.tsx:84,115`, `alarm.tsx:254` | Color de medicamento, categoría, estado y acción compiten | Color de medicamento en marcador pequeño; estado mediante texto/ícono; azul estable para interacción |
| Forma y profundidad | Tarjetas con borde, sombra y radios grandes se repiten en casi todos los niveles | Un bloque informativo parece tan importante como una tarea | Reservar tarjeta destacada para la siguiente acción; listas con separadores para registros |
| Tipografía | `tailwind.config.js` no define escala semántica; abundan `text-xs`; `app/(tabs)/_layout.tsx:85` usa 11 en pestañas | La legibilidad depende del componente y de la escala del sistema | Estilos semánticos para título, nombre, cuerpo, ayuda y metadatos |
| Navegación inferior | Captura estabilizada APK35: “Medicament...” | Un destino principal pierde su nombre completo | Probar etiquetas completas con 320/360 dp y texto aumentado; considerar “Medicinas” sólo tras prueba de comprensión |
| Formularios | `MedicationForm.tsx:66,598,1194`: puntos de progreso y muchos grupos equivalentes | Cuesta saber qué falta, qué es opcional y qué se guardará | Título del paso, “Paso 2 de 3”, resumen final y opciones avanzadas plegadas |
| Modalidad | Modales de nota, motivo, snooze, sitio, cita, perfil y contraseña tienen contratos propios | Cerrar/volver/confirmar no siempre significa lo mismo | Un patrón común de hoja, botón cerrar y cancelar sin efectos |
| Vacíos | `EmptyState.tsx:7-17` no ofrece API de acción | Mensajes mandan buscar el + fuera de su contexto | CTA dentro del vacío: “Agregar medicamento”, “Registrar medición”; distinguir ausencia de datos de carga fallida |
| Feedback | `ToastContext.tsx:35,65,150`: 3 segundos, posiciones idénticas, sin anuncio accesible | Mensajes se pisan y se pueden perder | Un mensaje visible; resultado persistente en contexto; errores recuperables junto al campo |
| Movimiento | `Skeleton.tsx:17`, `DoseCard.tsx`, `index.tsx:196`: animaciones sin consulta de movimiento reducido | Se añade movimiento sin respetar la preferencia del SO; pulsación continua innecesaria | Respetar preferencia del SO; cambio de estado legible aun sin animación |
| Gráficos | `SimpleLineChart.tsx:48-55,73`: X por índice y SVG sin semántica | Intervalos desiguales parecen iguales; lector de pantalla no recibe valores | Fechas reales, unidad, rango, puntos inspeccionables y resumen textual; lista de valores como alternativa |
| Modo oscuro | Tokens CSS y hook diferentes; alarma sigue el color del medicamento | Las combinaciones correctas en texto dejan de serlo como fondo | Roles separados para relleno, contenido, estado y superficie; temas de alarma propios |

Las capturas históricas etiquetadas “appointment-form” o “health” a veces muestran otra pantalla o el subtab Diario. No se utilizaron para afirmar cómo se ve hoy el formulario de cita ni las métricas. La barra “Open debugger” y el tutorial de stylus son del entorno de desarrollo/SO: no son defectos del producto.

## Contraste calculado a partir de los tokens actuales

Cálculo de luminancia relativa sRGB, sin estimación sobre una imagen reducida. Evalúa el par indicado; no equivale a una certificación de toda la app.

| Texto / fondo | Contraste | Evaluación |
|---|---:|---|
| Blanco / `#2563eb` (primary claro) | 5,169:1 | Supera 4,5:1 |
| Blanco / `#4f9cff` (primary oscuro CSS) | **2,788:1** | No alcanza 4,5:1 ni 3:1 |
| Blanco / `#60a5fa` (primary oscuro del hook) | **2,542:1** | No alcanza 4,5:1 ni 3:1 |
| Blanco / `#4f9cff` (toast informativo) | **2,788:1** | No alcanza 4,5:1 ni 3:1 |
| `#5b6675` / `#f0f6ff` (muted claro) | 5,366:1 | Supera 4,5:1; conservar |
| `#4f9cff` / `#0f172a` (primary como texto oscuro) | 6,403:1 | Funciona como texto; no reutilizar como fondo con blanco |

Evidencia: `global.css:14,28`; `useAppTheme.ts:25`; `DoseCard.tsx:520-522`; `history.tsx:357`; `ToastContext.tsx:40`; `RGBPickerModal.tsx:126-130` permite además cualquier fondo con texto blanco. Este último puede llegar a 1:1 al elegir blanco. Usar `actionFill`, `onAction`, `actionText`, `statusText` y `statusSurface` independientes. El color elegido por la persona debe modificar la muestra, no el fondo del botón Confirmar.

Como referencia de contraste, WCAG establece 4,5:1 para texto normal y 3:1 para texto grande. [W3C, contraste mínimo](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum). Para interacción nativa adoptar como objetivo 48 × 48 dp en Android y el tamaño predeterminado de 44 × 44 pt de iOS; las unidades no son intercambiables con píxeles de captura. [Android](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views), [Apple](https://developer.apple.com/design/human-interface-guidelines/accessibility). WCAG 2.5.8 usa otro criterio web, 24 × 24 CSS px con excepciones; no se presenta como regla nativa de 48 dp.

## Dirección de diseño: una agenda personal de cuidado

La app debería sentirse como una agenda confiable que responde tres preguntas: **de quién son los datos, qué está programado ahora y qué quedó registrado**. Su rasgo propio será una línea temporal con marcadores que retomen la cápsula del logo. La medicación se identifica por nombre, presentación y dosis; el color acompaña esa identidad.

### Plan de tokens propuesto

| Rol | Claro | Oscuro |
|---|---|---|
| Fondo | `#F4F7FC` | `#0B1324` |
| Superficie | `#FFFFFF` | `#132036` |
| Texto principal | `#17263C` | `#F1F5FB` |
| Texto secundario | `#52647C` | `#B9C8DC` |
| Relleno de acción + texto | `#2459C4` + blanco | `#2459C4` + blanco |
| Divisor | `#D9E2EF` | `#344760` |

Colores semánticos adicionales: registrada `#157347`, requiere revisión `#9A6700`, acción destructiva `#B4233D`, siempre con texto/ícono y versiones de superficie propias. En oscuro, links/íconos de acción `#91B7FF`; no confundirlos con el relleno. Son una propuesta inicial: medir cada combinación, incluidos estados presionado, deshabilitado y foco, antes de implementarla.

Tipografía: familia nativa de cada plataforma por familiaridad, buena cobertura ES/EN/PT y soporte de escalado. Título 28/34, nombre de medicamento 18/24 semibold, cuerpo 17/24, ayuda 15/21, metadatos 14/20; hora con cifras tabulares. Texto del SO ampliable, sin alturas que recorten. Margen horizontal 20, espaciado en escala 4/8/12/16/24/32; botones de 52 de alto y acciones esenciales de 56 en modo de texto grande. Radios 12 en controles y 16 en contenedores destacados; sombra sólo cuando comunica elevación real.

### Revisión de la dirección antes de dibujar

Una propuesta inicial de “dashboard de salud” con cinco tarjetas de estadísticas repetiría el problema actual. Se descarta: el centro pasa a ser una secuencia de tareas con hora y persona. También se descarta dar una pantalla entera a color/foto antes de revisar el tratamiento: son personalización opcional al final. Se conserva la marca existente y el azul, porque ya pertenecen al producto. El foco visual se concentra en la siguiente acción.

### Cuatro pantallas modelo

Ver [lámina conceptual editable](uiux-audit-2026-10-09-concept.svg) o [vista PNG](uiux-audit-2026-10-09-concept.png).

1. **Hoy:** título y perfil, próxima dosis, resto del día, pendientes de registrar plegables, tomas a demanda siempre disponibles, cita próxima y bienestar después de la tarea. “No registrado” describe evidencia de la app; no afirma que la persona no tomó el medicamento. No convierte el retraso en recomendación de tomarlo.
2. **Detalle del tratamiento:** nombre completo, cantidad por toma, regla temporal en lenguaje natural, siguiente evento, registro de hoy y stock con unidad explícita. “Editar tratamiento” es secundario; archivar y borrar viven en un menú contextual con consecuencias claras. Preservar acceso explícito a las acciones y su accesibilidad.
3. **Revisar antes de guardar:** persona, medicamento, dosis, horarios, días, inicio/fin y primera alarma. “Editar” al lado de cada bloque. Confirmación final “Guardar tratamiento”; estado posterior diferencia guardado de recordatorios habilitados. Sin alarmas ocultas.
4. **Recordatorios:** resumen verificable de notificaciones, alarmas exactas y pantalla completa, con acción para resolver cada permiso y resultado de una alarma de prueba. Si falta uno, describir exactamente qué función queda limitada. No prometer que una prueba garantiza funcionamiento con toda configuración futura del teléfono.

## Decisiones de contenido

| Situación | Texto propuesto |
|---|---|
| Sin medicamentos cargados | “Todavía no agregaste medicamentos” + “Agregar medicamento” |
| Hay tratamiento, pero no toca hoy | “Hoy no tenés dosis programadas” + acceso a tratamientos y tomas a demanda |
| Ya pasó la hora, sin registro | “Sin registro · Programada a las 08:00” |
| Registro efectuado | “Toma registrada a las 08:12” + “Deshacer” accesible |
| Posposición | “Recordatorio pospuesto hasta las 08:30” |
| Se sale de un formulario editado | “Tenés cambios sin guardar” + “Seguir editando” / “Descartar cambios” |
| Sin alergias documentadas | “No hay alergias registradas” + fecha/estado de revisión |
| Backup creado | “Copia creada” + fecha, perfiles y cobertura real de adjuntos |
| Error al guardar | “No se pudo guardar. Tus cambios siguen acá.” + “Reintentar” |

Unificar español rioplatense ya usado por la app, o elegir español neutro como decisión explícita; no mezclarlos dentro de una acción. “Registrar toma” comunica mejor la modificación del registro que “Confirmar” sin objeto. “A demanda” necesita una explicación visible: se registra cuando se usa y no programa alarmas automáticas. El nombre del perfil debe acompañar dosis, alarmas y exportaciones cuando haya varias personas.

## Criterios visuales de aceptación

- Las acciones principales se alcanzan con una mano y sin depender de un gesto oculto; los gestos tienen alternativa visible.
- Nombre, presentación, dosis y persona siguen legibles con 320/360 dp, tamaño de texto al 200 % y nombres largos. Si el contenido crece, se desplaza; no se superpone ni desaparece la acción.
- Claro/oscuro y colores personalizados mantienen contraste medido. Estados se distinguen sin color.
- Cada modal tiene título, cierre accesible, foco inicial y retorno de foco; cancelar/backdrop/volver no alteran datos salvo confirmación explícita.
- Mensajes y errores se anuncian y no cubren la navegación. La confirmación se entiende con animaciones apagadas.
- El gráfico permite conocer valores y fechas sin interpretar sólo una curva. Las observaciones automáticas expresan límites de datos, no causalidad clínica.
- La lámina es un punto de partida. Validar que una persona nueva encuentre próxima dosis, registro a demanda, historial, cita y respaldo sin el tour.
