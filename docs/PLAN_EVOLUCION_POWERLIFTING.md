# ANVIL Strength — Evolución a plataforma de powerlifting

**Fase 1 (auditoría) y Fase 2 (diseño). Sin código todavía.**
Fecha: 8 de agosto de 2026.

---

## 0. Resumen ejecutivo

De los 14 puntos pedidos, **6 ya existen** en alguna forma y hay que mejorarlos,
no construirlos. **3 existen pero están rotos o desconectados**. **5 son nuevos**.

| # | Petición | Estado real | Trabajo |
|---|---|---|---|
| 1 | Pantalla HOY | Existe (`TodayPanel` + `AthleteHome`) | Ampliar, no crear |
| 2 | Información personal | No existe. Sí existe el patrón (plantillas de check-in) | Nuevo, reutilizando patrón |
| 3 | Vídeos de atleta | Estudio | Documento |
| 4 | Extras → Consideraciones | Ya son TEXTO, no ejercicios | Renombrar + recolocar |
| 5 | Calentamiento estructurado | Es texto libre | Nuevo, sobre `session_exercises` |
| 6 | RPE pautado vs real | **Ya existe entero** (`executionLog.ts`) | Exponerlo al coach y al atleta |
| 7 | Vídeos de ejercicio | Existe (`exercise_videos`, R2) | Conectar al calentamiento |
| 8 | Links externos | Columna existe, **sin interfaz ni fallback** | Cerrar el hueco |
| 9 | Check-in al terminar | Check-in existe; **no hay "terminar"** | Arreglar regresión + CTA |
| 10 | Plantillas | Existen (día + progresión) | Auditar |
| 11 | Periodización | Existe (macro → bloque → semana → día) | Auditar |
| 12 | ANVIL Insights | Motor de métricas existe; **el atleta no tiene pantalla de estadísticas** | Nuevo sobre lo existente |
| 13 | UX del entrenamiento | Parcial | Reordenar |
| 14 | Responsive | Hay detector propio (`overflowGuard`) | Pasada dirigida |

---

## 1. AUDITORÍA — Cómo está modelado hoy

### 1.1 Stack

Vite + React 19 + TypeScript, Tailwind con sistema de tokens propio
(`tailwind.config.js`, `DESIGN.md`), React Router 7, TanStack Query,
Supabase (Postgres + RLS + Storage + Edge Functions), Vercel.
Organización por *features* en `src/features/<dominio>/`.

### 1.2 Jerarquía de entrenamiento

```
macrocycles          (opcional, ligado a competición)
   └── training_blocks          coach_id + athlete_id, is_active, start_week/end_week,
        │                       release_offset_days, color, description, objectives
        ├── training_weeks      SOLO metadatos (nombre, is_visible). La AUSENCIA
        │                       de fila = semana visible.
        └── training_sessions   week_number (ISO del AÑO, no ordinal del bloque),
             │                  day_number, day_of_week, date, completed_at,
             │                  athlete_notes, warmup TEXT, extras TEXT
             └── session_exercises   exercise_id, order_index, notes, variant_name,
                  │                  rpe, velocity_avg, rest_seconds, modifiers[],
                  │                  primary/secondary_muscles (override)
                  └── training_sets  target_reps/load/metric/rpe, rest_seconds,
                                     actual_reps/load/rpe, is_completed,
                                     set_type, set_detail, group_tag,
                                     vbt_* (7 columnas) + bolsa JSONB `vbt_metrics`
```

**Punto crítico ya resuelto y que no hay que romper:** `target_load` **no siempre
son kilos**. `target_metric` dice la unidad (`kg`/`rir`/`rpe`/`vel`/`vel_loss`).
`kgOf()` en `lib/stats/athleteStats.ts` es la única puerta legítima de lectura.

### 1.3 Atletas, entrenadores, roles

- `profiles` — un solo registro para todos. `roles[]` es la verdad; `role` es un
  reflejo mantenido por trigger (`database/ROLES_MULTIPLES.sql`). Permisos se
  preguntan con `puede()` de `src/lib/roles.ts`, nunca con `user.role`.
- `coach_athletes` — relación con estado e histórico (`athlete_lifecycle.sql`).
- Ciclo de vida: `managed` → `invited` → `active`. Un atleta gestionado es una
  cuenta latente de `auth.users`, así que su `id` no cambia al reclamarla.
- **`profiles` NO tiene columna `email`** en la base real. El correo de login
  vive en `auth.users.email`; el de contacto en `profiles.contact_email`.

Campos personales que ya existen en `profiles`: `gender`, `age_category`,
`weight_category`, `biography`, `squat_pr`, `bench_pr`, `deadlift_pr`.
**No hay edad, peso corporal, altura ni envergadura.**

### 1.4 Check-in diario

Sistema **completo y sano**, y es el modelo a copiar para "Información personal":

- `form_templates` — `(coach_id, type)` → `questions JSONB[]`. **El coach ya
  configura qué se pregunta.**
- `form_responses` — `(athlete_id, type, period_key)` → `answers JSONB[]`,
  `updated_by`, `updated_at`.
- `getPeriodKey()` da `YYYY-MM-DD` (diario) o `YYYY-Www` (semanal).
- `mergeQuestions()` conserva respuestas a preguntas ya retiradas de la
  plantilla. Es la pieza que hace que el esquema flexible no pierda datos.
- Interfaz atleta: `CheckInCard` en `AthleteHome`. Interfaz coach:
  `CoachCheckInsTab` en `CoachAthleteDetails`. Ambas conectadas.
- Migración necesaria: `coach_edit_checkins.sql` (pendiente de ejecutar).

### 1.5 Estadísticas

Dos motores puros, sin React ni Supabase:

- `lib/stats/athleteStats.ts` — resumen general, series semanales, comparativa
  de ejercicios, perfil carga-velocidad, adherencia, distribución de intensidad,
  constancia, resumen de check-ins.
- `lib/stats/executionLog.ts` — **pautado contra ejecutado**. Ya calcula
  `prescribedRpe()` (rango "7-8" leído por el extremo alto), desviaciones por
  serie (`rpe-over`/`rpe-under`, umbral 1 punto), `plannedRpe`/`actualRpe` por
  sesión, `rpeDelta` por ejercicio, series semanales, ACWR con sus salvedades,
  y `buildFlags()` — una lista de avisos con su porqué.
- `lib/volume/engine.ts` + `muscles.ts` — reparto por grupo muscular.
- `lib/planning/blockAnalytics.ts` — análisis de bloque.

**Superficie:** `AthleteStatsModal` (6 pestañas) se abre desde
`TrainingBlockList` → `CoachAthleteDetails`. **Solo el coach.**

### 1.6 Vídeos

- **De ejercicio (permanentes):** `exercise_videos` + Cloudflare R2 detrás de
  dominio propio. Ámbitos atleta > coach > sistema, resueltos en servidor por
  `resolve_exercise_video()`. `exerciseVideoService` + `ExerciseVideoPanel`,
  conectado en `WorkoutLogger`. **Hecho.**
- **Link externo:** `exercise_library.video_url` existe en el esquema y en los
  tipos. `WorkoutBuilder` lee `hasVideo` de ahí. Pero **ninguna pantalla lo deja
  escribir** (`AddExerciseModal` no lo pide, `ExerciseSearchModal` lo pone a
  `null`) y **`ExerciseVideoPanel` no cae a él** cuando no hay vídeo interno.
- **De atleta (temporales):** no existe. `training_sets.video_url` y
  `is_video_required` están en el esquema sin uso real.
- `docs/ARQUITECTURA_VIDEO_PWR.md` trata otra cosa: análisis de velocidad por
  visión artificial **en cliente**, con la conclusión explícita de que el vídeo
  es desechable y no se sube. No sustituye al documento pedido.

### 1.7 Plantillas y periodización

- `day_templates` — día reutilizable, `payload JSONB` con ejercicios y series.
  `getDayTemplates` / `saveDayTemplate` / `applyDayTemplate`.
- `progression_templates` — pasos de progresión, `onConflict: coach_id,name`.
- Periodización: `copyWeek`, `cloneWeekContents`, `copyWeekInto`, `addWeek`,
  `deleteWeek`, `duplicateBlockToAthletes`, `week_visibility_and_scheduling.sql`
  con `week_is_released()` en RLS.
- `BlockOverviewPanel` (778 líneas) y `WorkoutBuilder` (4.615 líneas).

---

## 2. HALLAZGOS — Lo que está roto

### H1 · No existe "terminar el entrenamiento" — REGRESIÓN, prioridad alta

`trainingService.setSessionCompleted()` **no lo llama nadie**. El pie de sesión
con el botón "Terminar el día" se retiró (comentario en `WorkoutLogger.tsx:684`)
y se sustituyó por la barra de progreso. Consecuencias en cadena:

- `training_sessions.completed_at` no se escribe nunca.
- `TodayTraining.session.completed` (`getTodayForAthlete`) es siempre `false`;
  la tarjeta de inicio nunca dice "Hecho".
- `AthleteAdherence` (`getTeamAdherence`) cuenta `completed_at`: **la adherencia
  que ve el coach es 0 para todo el mundo** desde ese cambio.
- `athlete_notes` (cómo fue el día) no tiene dónde escribirse.
- Y sin un momento de "he terminado", **el punto 9 no tiene dónde engancharse**.

El razonamiento del cambio era correcto (el botón flotaba mal en móvil), pero
tiró el dato con el botón.

### H2 · `getTodayForAthlete` no distingue día de descanso de bloque sin publicar

Si la consulta devuelve 0 sesiones para la semana ISO en curso, devuelve `null`
("tu entrenador aún no te ha pautado nada"), aunque el bloque exista y la semana
solo esté sin abrir. Además no dice ni la semana del programa ni el día.

### H3 · El atleta no tiene ninguna pantalla de estadísticas

`AthleteStatsModal` es exclusivo del coach. El atleta solo ve `AthleteVbtView`
(velocidad). Todo el motor de `athleteStats` y `executionLog` está escrito y el
atleta no llega a nada de él. El punto 12 pide Insights "dentro de las
estadísticas generales del atleta" — **hay que decidir en cuál de las dos caras**.

### H4 · RPE pautado vs real está calculado y casi no se enseña

`summarizeSession().plannedRpe/actualRpe`, `adherenceByExercise().rpeDelta` y
`collectDeviations()` existen. Se consumen en `AthleteLogTab` (coach). No hay
serie temporal de "RPE medio pautado vs real" ni nada de esto en el móvil del
atleta. El punto 6 es sobre todo **exposición**, no cálculo.

### H5 · El link externo de ejercicio es un callejón sin salida

Descrito en §1.6. Columna sin escritura y sin lectura de respaldo.

### H6 · Los Extras salen al final, no al principio

`WorkoutLogger` pinta calentamiento arriba y extras abajo, y el comentario dice
que es a propósito ("trabajo opcional al terminar"). Eso choca frontalmente con
el punto 4: las consideraciones tienen que leerse **antes** de empezar.

### H7 · Migraciones SQL sin ejecutar

Sigue pendiente en Supabase (según `memory/migraciones-pendientes.md`):
`metrics_catalog.sql`, `metrics_catalog_quality.sql`, `FIX_ATLETA_SIN_EMAIL.sql`
+ `functions deploy athletes`, `FIX_RLS_COMPETICIONES.sql`, `coach_edit_checkins.sql`,
`exercise_videos.sql`, `chat_media.sql`, `pdf_theme.sql`, `profiles_storage_policies.sql`.
**Todo lo que se diseñe aquí añade a esa cola.** No hay despliegue automático de SQL.

---

## 3. DISEÑO

### 3.1 · HOY (punto 1)

**No se crea pantalla nueva.** `AthleteHome` ya es "hoy": saludo, fecha,
`TodayPanel`, `CheckInCard`. Lo que falta es contexto y una acción clara.

Se amplía `TodayTraining` en `trainingService.getTodayForAthlete()`:

```ts
export interface TodayTraining {
    blockName: string;
    /** Ordinal DENTRO del bloque: week_number - start_week + 1. */
    programWeek: number | null;
    totalWeeks: number | null;
    isRestDay: boolean;
    /** Distingue "hoy descansas" de "tu coach no ha abierto la semana". */
    weekReleased: boolean;
    session: {
        id, title, dayNumber, weekday,
        completed: boolean,          // vuelve a funcionar con H1 arreglado
        considerations: string | null,   // antes `extras`
        hasWarmup, exerciseNames, totalSets, completedSets,
    } | null;
    checkIn: { daily: boolean; weekly: boolean };   // una consulta más, en paralelo
}
```

`TrainingCard` pasa a mostrar `Viernes · Semana 6 de 12 · Día 3` y el botón
primario cambia de literal según el estado: **Empezar entrenamiento** /
**Continuar (7 de 18)** / **Ver entrenamiento** (si ya está cerrado).
El estado del check-in sube al bloque HOY en vez de quedar como tarjeta suelta.

**Coste:** una consulta extra (check-in) en paralelo con las dos que ya hay.
Ninguna pantalla nueva. Ninguna ruta nueva.

### 3.2 · Información personal (punto 2)

**Se copia el patrón de check-in**, que ya está en producción y resuelve
exactamente el mismo problema (campos que decide el coach, por atleta).

Tres opciones evaluadas:

| Opción | Veredicto |
|---|---|
| Columnas en `profiles` | Descartada. Cada campo nuevo = migración + lista blanca de `SECURITY_HARDENING.sql`. Es el fallo de `pdf_theme` otra vez, y no permite "por atleta". |
| EAV (tabla campo/valor) | Descartada. Tres tablas y un join para leer la altura. |
| **Catálogo + JSONB, como los check-ins** | **Elegida.** |

```sql
-- QUÉ se pide. Sin fila = el coach usa el juego predefinido.
CREATE TABLE athlete_profile_schemas (
    coach_id   UUID,            -- plantilla por defecto del coach
    athlete_id UUID,            -- NULL = vale para todos sus atletas
    fields     JSONB NOT NULL,  -- [{id,label,type,unit,editableByAthlete,required}]
    PRIMARY KEY (coach_id, athlete_id)   -- índice parcial para el NULL
);

-- QUÉ ha contestado. Una fila por atleta y fecha: el peso corporal es
-- una SERIE, no un dato fijo. Reutiliza la idea de `period_key`.
CREATE TABLE athlete_profile_data (
    athlete_id UUID,
    recorded_on DATE NOT NULL DEFAULT CURRENT_DATE,
    values     JSONB NOT NULL,
    updated_by UUID,
    PRIMARY KEY (athlete_id, recorded_on)
);
```

Campos predefinidos: edad (o fecha de nacimiento), peso, altura, sexo,
envergadura, longitud de fémur, años entrenando, lesiones/limitaciones.
El coach puede quitar, añadir y marcar cuáles edita el atleta.
`mergeFields()` — clon de `mergeQuestions()` — conserva lo contestado a campos
retirados.

**Por qué histórico y no un solo registro:** el peso corporal ya se pregunta en
el check-in semanal (`bodyweight`). Si la información personal fuese un registro
único, el peso viviría en dos sitios que divergen. Con `recorded_on`, "peso" es
una serie temporal y **el check-in semanal puede escribir en ella**, lo que
además alimenta un insight del punto 12 sin pedir nada nuevo al atleta.

Superficies: sección nueva en `ProfileSection` (atleta y coach, ambos ya la
usan) y pestaña en `CoachAthleteDetails` junto a los check-ins.
Permisos: `puede()` de `lib/roles.ts`; RLS calcada de `form_templates`/`form_responses`.

### 3.3 · Vídeos de atleta (punto 3) — solo documento

Se entrega `FUTURE_VIDEO_ARCHITECTURE.md` con:

- **A) Temporales del atleta** — R2 con regla de ciclo de vida a 7 días (R2
  soporta expiración por prefijo; borrar es entonces gratis y no hace falta cron).
  Subida directa navegador → R2 con URL firmada emitida por una Edge Function,
  para que el vídeo **no pase por Supabase ni por el servidor**. Relación
  `training_sets.video_url` ← ya existe la columna. Límites: 100 MB, 60 s,
  mp4/mov/webm. Coste estimado con 20 atletas × 3 vídeos/semana.
- **B) Explicativos de ejercicio** — ya implementados; se documenta que son
  permanentes, bajo otro prefijo (`ejercicios/`) y **fuera** de la regla de 7 días.
  Esta separación por prefijo es la decisión que condiciona el futuro y por eso
  se escribe ahora.
- Comparativa R2 vs S3 vs Supabase Storage (egress, precio, firma, expiración).
- Qué NO se hace y por qué: transcodificación, streaming adaptativo, moderación.

**No se implementa nada de A en esta fase.**

### 3.4 · Extras → Consideraciones (punto 4)

Buena noticia: **no hay migración de datos que hacer.** Los extras ya son
`training_sessions.extras TEXT` desde `session_warmup_extras.sql`, precisamente
para que no ensuciaran el volumen. Nunca fueron ejercicios.

Cambios:
1. La columna **se queda como está** (`extras`). Renombrarla obliga a tocar
   `WorkoutBuilder`, `WorkoutLogger`, el PDF, `getTodayForAthlete` y la propia
   base, a cambio de nada. Se renombra **en la interfaz**: "Consideraciones del
   entrenamiento". Se documenta el desfase nombre-columna en `types/training.ts`.
2. En `WorkoutLogger` **suben al principio**, antes del calentamiento (H6).
3. En `WorkoutBuilder` el campo sube también, con marcador de posición nuevo
   ("Prioriza velocidad hoy", "RPE 7 máximo", "Cinturón desde la 2ª serie").
4. En el PDF cambia de apéndice final a cabecera del día.

Coste: bajo. Riesgo: ninguno para los datos.

### 3.5 · Calentamiento estructurado (punto 5)

**La decisión de fondo.** Dos caminos:

- **Tabla propia `warmup_items`** — aislada, pero duplica ejercicio, series,
  repeticiones, descanso, vídeo y notas. Y el día que se quiera registrar una
  aproximación con kilos habría dos motores de series.
- **Reutilizar `session_exercises` + `training_sets` con un discriminador** —
  elegida.

```sql
ALTER TABLE session_exercises
    ADD COLUMN IF NOT EXISTS section TEXT NOT NULL DEFAULT 'main'
        CHECK (section IN ('warmup','main','accessory')),
    ADD COLUMN IF NOT EXISTS round_count INT;   -- circuito: nº de rondas
```

- `section='main'` por defecto: **todas las filas existentes siguen igual**.
- Los circuitos usan `training_sets.group_tag`, que **ya existe** y ya sabe
  agrupar ejercicios distintos (superserie/triserie). `round_count` en el
  ejercicio dice cuántas rondas. `groupLabel()` ya calcula el nombre según
  cuántos comparten etiqueta.
- El calentamiento tradicional con porcentajes ya cabe: `target_load` +
  `target_metric='kg'`, o texto en `notes`.
- Vídeo y link externo funcionan **gratis**: son ejercicios de la biblioteca,
  así que `resolve_exercise_video()` y `video_url` aplican sin tocar nada (punto 7).

**Lo que hay que blindar — y es el riesgo real de este punto.** El calentamiento
NO puede contar como volumen. Hay que filtrar `section <> 'main'` en:
`getExerciseHistoryByAthlete`, `getExecutionLog`, `lib/volume/engine.ts`,
`lib/planning/blockAnalytics.ts` y `athleteStats.summarize()`. Es exactamente la
razón por la que warmup y extras se hicieron texto en su día; si se olvida un
sitio, el tonelaje se infla y las estadísticas antiguas dejan de ser comparables.
**Se hace con un helper único** (`isCountedForVolume(row)`) para que no haya cinco
condiciones que se puedan desincronizar.

**Convivencia con el texto libre.** `training_sessions.warmup TEXT` **no se borra
ni se migra automáticamente**. Un día puede tener las dos cosas: el texto se
sigue pintando (con su `RichText` y sus enlaces) y debajo los ejercicios
estructurados. En el constructor aparece un botón "Convertir a estructurado" que
propone una conversión editable, y solo escribe si el coach confirma. Los
entrenamientos antiguos siguen viéndose igual sin que nadie toque nada.

### 3.6 · RPE pautado vs real (punto 6)

Nada nuevo en el modelo: `target_rpe` (texto, admite rango) y `actual_rpe`
(numérico, medio punto) ya conviven, y `executionLog.ts` ya calcula todo.
Trabajo = **exposición**, en tres sitios:

1. **En la serie, al registrar** (`LoggerSetRow`, móvil): el campo de RPE real ya
   está y ya muestra el pautado. Se añade el delta en cuanto se escribe
   (`@8 → 7 · −1`), con color por dirección. Es el momento en que el dato es
   más barato de leer.
2. **Al cerrar el día**: en la pantalla de fin (§3.9), "RPE medio pautado 8,0 ·
   real 8,7". Sale de `summarizeSession()`, que ya lo devuelve.
3. **En el análisis**: serie temporal `plannedRpe` vs `actualRpe` por semana.
   `weeklyExecution()` ya la calcula. Se pinta en `AthleteLogTab` (coach) y en la
   pantalla de estadísticas del atleta (§3.10).

Salvedad metodológica que ya está tomada y se mantiene visible en pantalla: un
rango "7-8" se compara por el extremo **alto**.

### 3.7 · Vídeos explicativos (punto 7)

Ya resuelto para musculación. Al hacer el calentamiento con `session_exercises`
(§3.5), el calentamiento lo hereda sin código nuevo. Lo único a añadir:
`ExerciseVideoPanel` accesible desde una tarjeta de calentamiento igual que
desde una de ejercicio principal.

### 3.8 · Links externos (punto 8)

**Prioridad: interno → externo.** El interno gana porque es el que el coach ha
grabado a propósito, está comprimido, no tiene anuncios y no se cae si alguien
borra un vídeo de YouTube.

1. `exerciseVideoService.resolve()` devuelve vídeo interno → se usa.
2. Si no hay, `exercise_library.video_url` → se abre en `VideoModal` (que ya
   existe y ya sabe incrustar).
3. Si tampoco, no se enseña nada (no un botón muerto).

Se añade el campo `video_url` a `AddExerciseModal` y a la ficha de ejercicio del
constructor. **Se resuelve H5 con un campo de formulario y un `??`.**

Para el futuro (título, miniatura, descripción) **no se añaden columnas ahora**.
Cuando hagan falta, van a `exercise_videos` con `provider='external'`, que ya
admite URL completa en `video_key` y ya tiene `poster_key` y `notes`. Se
documenta esa decisión para no acabar con dos sitios donde vive un vídeo externo.

### 3.9 · Check-in al terminar (punto 9)

**Primero se arregla H1**, que es la causa raíz.

- Vuelve el cierre de sesión, pero **no como barra flotante**. Va como última
  tarjeta del scroll, después del último ejercicio: "Terminar entrenamiento".
  El motivo del cambio anterior (flotaba mal en móvil por posicionarse contra el
  alto del contenedor) desaparece si es contenido normal del flujo.
- Al pulsar: `setSessionCompleted(id, true, notas)` — recupera `completed_at` y
  `athlete_notes`, y con ellos la adherencia del coach.
- Después, pantalla de fin: series completadas, tonelaje del día, RPE medio
  pautado vs real (§3.6), y **si el check-in diario de hoy no está hecho**,
  el CTA. Dos botones: `Completar check-in` / `Ahora no`. No bloquea nada.
- Si ya está hecho, la sección de check-in no aparece.
- La comprobación es `formsService.getResponse(athleteId,'daily',getPeriodKey('daily'))`.
  **Sistema existente, cero tablas nuevas.**

Auditoría del check-in a realizar en la fase 4: guardado, lectura por el coach,
edición por el coach (necesita `coach_edit_checkins.sql` ejecutado), detección de
"completado", y que `mergeQuestions` no duplique preguntas.

### 3.10 · ANVIL Insights (punto 12)

**Decisión previa necesaria (ver §6):** el punto dice "estadísticas generales del
atleta". Hoy esa pantalla es del coach (`AthleteStatsModal`) y el atleta no tiene
ninguna. Propuesta: **una sola pantalla, dos lecturas** — se reutiliza
`AthleteStatsModal` como vista de atleta (ruta `/dashboard/estadisticas`),
ocultando lo que sea de gestión. Escribir una segunda pantalla de estadísticas
sería justo lo que el encargo prohíbe.

`ANVIL INSIGHTS` = **pestaña nueva dentro de esa pantalla**, no pantalla aparte.

Arquitectura: un módulo puro `lib/stats/insights.ts` con una lista de reglas.

```ts
export interface Insight {
    id: string;
    severity: 'info' | 'good' | 'watch';
    title: string;        // "Tu RPE en sentadilla ha subido 0,8 en 3 semanas"
    detail: string;       // el porqué, en una frase
    basis: string;        // "18 series · 3 semanas · sentadilla"  ← siempre visible
    confidence: 'low' | 'high';
}

export interface InsightRule {
    id: string;
    minSamples: number;   // por debajo, la regla NO se evalúa
    evaluate(ctx: InsightContext): Insight | null;
}
```

Reglas de la primera tanda, todas sobre datos ya calculados:

| Regla | Fuente | Mínimo |
|---|---|---|
| Deriva del RPE real sobre el pautado | `weeklyExecution()` | 3 semanas, 10 series |
| e1RM al alza/baja por levantamiento | `compareExercises()` | 4 puntos |
| Volumen semanal fuera de rango | `weeklySeries()` | 4 semanas |
| Adherencia cayendo | `adherenceSeries()` | 3 semanas |
| Peso corporal contra rendimiento | check-in semanal + §3.2 | 6 registros |
| Sueño bajo → RPE alto | `summarizeCheckIns()` + sesiones | 8 pares |
| Mejor marca reciente | `summarize()` | — |

**Regla dura, escrita en el código y no solo aquí:** por debajo de `minSamples`,
la regla devuelve `null` y el insight **no se pinta**. Nada de "no hay datos
suficientes" como tarjeta: eso es ruido. Cada insight enseña `basis` — sobre
cuántas series y cuántas semanas se afirma —, porque un dato sin su n no es un
dato. Nada de IA en esta fase.

### 3.11 · UX del entrenamiento (punto 13)

Orden final en `WorkoutLogger`:

```
Cabecera (bloque · semana N de M · días)
1. Consideraciones      ← sube (H6)
2. Calentamiento        ← texto y/o estructurado
3. Entrenamiento principal
4. Accesorios           ← section='accessory' cuando exista
5. Terminar entrenamiento  ← vuelve (H1)
6. Check-in                ← condicional
```

Sin acordeones nuevos: cada nivel plegable es un sitio donde el atleta no mira.

### 3.12 · Responsive (punto 14)

Existe `src/lib/overflowGuard.ts`, un detector de desbordes horizontales que
solo corre en desarrollo, y `src/features/devtools/MobilePreview.tsx`. **No hace
falta inventar metodología.** Pasada dirigida a 320/375/390/430 px sobre lo que
esta fase toca, más las pantallas que el commit `7e032b78` ya arregló, usando el
detector y el navegador integrado. Se corrige lo que aparezca; no se rediseña lo
que no lo pida.

---

## 4. MIGRACIONES

Un solo archivo nuevo, idempotente, siguiendo la regla ya establecida de que las
columnas que escribe el cliente van a un archivo con su bloque de verificación:

`database/EVOLUCION_POWERLIFTING.sql`

1. `session_exercises.section` + `round_count` (§3.5) — con `DEFAULT 'main'`,
   así ninguna fila existente cambia de significado.
2. `athlete_profile_schemas` + `athlete_profile_data` + RLS (§3.2).
3. `NOTIFY pgrst, 'reload schema'`.
4. Bloque de verificación que **ejecuta** las consultas, no solo crea objetos
   (lección de `FIX_ATLETA_SIN_EMAIL.sql`: plpgsql no valida nombres de columna
   hasta la primera ejecución).

**Nada se borra. Nada se renombra. Ninguna columna cambia de tipo.**
El cliente degrada con elegancia si el SQL no está ejecutado, igual que ya hacen
`setSessionAppendix` y `vbtService`: se captura PGRST204 y se sigue sin la
función nueva, avisando por consola.

**Compatibilidad con datos antiguos, punto por punto (§15 del encargo):**

| Dato | Qué le pasa |
|---|---|
| Entrenamientos, sesiones, series | Nada. Solo se añaden columnas con default. |
| Extras | Se quedan en su columna; cambia el rótulo y el sitio donde se pintan. |
| Calentamientos en texto | Se siguen pintando. Conversión manual y opcional. |
| RPE | Ya existe pautado y real. Cero cambios de esquema. |
| Plantillas / periodización | Sin tocar salvo fallos que aparezcan en la auditoría. |
| Check-ins | Sin tocar. Se leen desde la pantalla de fin. |
| Estadísticas | El filtro de `section` puede cambiar cifras — pero solo si alguien crea calentamiento estructurado. Los bloques existentes son todos `main`. |

---

## 5. ORDEN DE IMPLEMENTACIÓN

Cada bloque es entregable por separado y deja la app funcionando.

| B | Contenido | Riesgo |
|---|---|---|
| **B1** ✅ | H1: cierre de sesión + `athlete_notes`. Pantalla de fin. CTA de check-in (§3.9). RPE pautado vs real en el cierre (§3.6·2) | Bajo. Recupera un dato perdido. |
| **B2** ✅ | HOY ampliado (§3.1) + H2. Consideraciones arriba y renombradas (§3.4) | Bajo |
| **B3** ✅ | Delta de RPE en la serie (§3.6·1). La serie temporal (§3.6·3) YA EXISTÍA en `AthleteLogTab`; al atleta le llega en B7 | Bajo |
| **B4** ✅ | Links externos: campo + respaldo (§3.8, H5) | Muy bajo |
| **B5** ✅ | Información personal: SQL, servicio, pantallas atleta y coach (§3.2) | Medio. Tablas nuevas. |
| **B6** ✅ | Calentamiento estructurado (§3.5) | **Alto.** Toca el modelo de ejercicios y los motores de volumen. |
| **B7** | Estadísticas del atleta + ANVIL Insights (§3.10, H3) | Medio |
| **B8** | Auditoría de plantillas y periodización (puntos 10 y 11) | Se corrige solo lo que falle |
| **B9** | Pasada responsive (§3.12) | Bajo |
| **B10** | `FUTURE_VIDEO_ARCHITECTURE.md` (§3.3) | Documento |

Después de cada bloque: `npm run lint`, `npx tsc --noEmit`, arranque del
servidor de desarrollo y comprobación de que las pantallas afectadas siguen
funcionando, en móvil y escritorio.

### SQL que hay que ejecutar para B5 y B6

Los dos son idempotentes y **solo añaden**. El código degrada con elegancia si
no están: la información personal se ve vacía y no guarda; el calentamiento
estructurado no se puede crear y avisa con instrucciones. Nada de lo que ya
funciona deja de funcionar.

1. `database/INFORMACION_PERSONAL.sql` — dos tablas nuevas
   (`athlete_profile_schemas`, `athlete_profile_data`), sus políticas y la
   función `manages_athlete()`.
2. `database/CALENTAMIENTO_ESTRUCTURADO.sql` — `session_exercises.section`
   (DEFAULT `'main'`, así ninguna fila existente cambia de significado) y
   `round_count`.

### Hallazgos añadidos durante B1–B6

- **H10 · `nameFrom()` trataba un corte en la posición 0 como "sin corte".**
  En el analizador de calentamientos eso hacía que `60x5` —un escalón de una
  escalera de aproximaciones— se leyera con nombre "60x5" y por tanto como
  **60 series de 5**, recortadas a 12 por el tope. Encontrado ejecutando el
  analizador contra textos reales, no leyéndolo.
- **H11 · Las escaleras en una línea perdían todos los tramos menos el
  primero.** `Barra 20kg x10, 60x5, 80x3` daba una sola serie. Ahora la línea
  se parte por comas y cada tramo es una serie.
- La regla que decide si el primer número de `N x M` es carga o número de
  series es **si hay un nombre delante**: `Rotación externa 2x15` son dos
  series de quince; `60x5` son sesenta kilos por cinco.

### Hallazgos añadidos durante B1–B4

- **H8 · El check-in podía borrar lo contestado.** `CheckInFormModal` cargaba
  plantilla y respuesta previa en el MISMO `try`: si fallaba leer la respuesta,
  `setQuestions` no llegaba a ejecutarse y el atleta veía un formulario vacío
  con el botón de enviar activo. Enviarlo hacía un upsert de una lista de
  respuestas vacía sobre la fila del día. **Corregido en B1.**
- **H9 · `ExerciseCardUpdates` impedía actualizar un campo suelto de la ficha.**
  El tipo era `Partial<SessionExercise> & { exercise?: Partial<ExerciseLibrary> }`,
  y como `SessionExercise['exercise']` es la ficha entera, la intersección
  resolvía a `ExerciseLibrary & Partial<ExerciseLibrary>`. La implementación sí
  fusionaba parciales; el tipo no dejaba mandarlos. **Corregido en B4.**
- El banco de `/dev/movil` monta ahora la tarjeta de HOY (cuatro estados), el
  cierre del día (dos) y la ficha de ejercicio con respaldo externo. Es lo que
  permite revisar a 320/375px sin una cuenta con bloque activo.

---

## 6. DECISIONES — ZANJADAS POR EL USUARIO (8 de agosto de 2026)

1. **Estadísticas del atleta: una pantalla, dos lecturas.** Se reutiliza
   `AthleteStatsModal` como vista del atleta en `/dashboard/estadisticas`,
   ocultando lo que sea de gestión. `ANVIL INSIGHTS` es una pestaña más.
   No se escribe una segunda pantalla de estadísticas.
2. **Calentamientos antiguos: convivencia + conversión manual.** El texto libre
   se sigue pintando. El constructor ofrece "Convertir a estructurado" con una
   propuesta editable que solo escribe si el coach confirma. Nada automático.
3. **Edad: fecha de nacimiento.** Se calcula sola, no caduca, y permite derivar
   la categoría de edad (Sub-Junior, Junior, Open, Master) que hoy es un campo
   suelto en `profiles.age_category`.

---

## 7. ESTADO REAL DE LA BASE — verificado contra producción

Comprobado el 8 de agosto de 2026 con la clave anónima contra PostgREST
(solo lecturas). Corrige la lista de `memory/migraciones-pendientes.md`.

**Aplicado:**

| Archivo | Prueba |
|---|---|
| `MIGRACION_PENDIENTE.sql` | `training_sets.target_metric,notes,set_type,set_detail,group_tag` → 200 |
| `MEJORAS_ANALISIS_VBT.sql` | `session_exercises.primary_muscles` → 200 |
| `metrics_catalog.sql` | `metric_definitions` → 200 |
| `metrics_catalog.sql` (bolsa) | `training_sets.vbt_metrics` → 200 |
| `coach_edit_checkins.sql` | `form_responses.updated_by,updated_at` → 200 |
| `session_warmup_extras.sql` | `training_sessions.warmup,extras` → 200 |
| `admin_role_and_session_completion.sql` | `training_sessions.completed_at,athlete_notes` → 200 |
| `week_visibility_and_scheduling.sql` | `training_blocks.release_offset_days` → 200 |
| `day_templates.sql`, `forms_and_gameplan.sql` | tablas presentes |

**NO aplicado — y tres tienen consecuencias hoy:**

| Archivo | Prueba | Consecuencia |
|---|---|---|
| `FIX_RLS_COMPETICIONES.sql` | `competitions?athlete_id=not.is.null` devuelve filas **sin sesión** | **Fuga de privacidad activa**: quién compite, dónde y cuándo, legible por cualquiera con la clave anónima (que va en el bundle, por diseño). |
| `exercise_videos.sql` | tabla → PGRST205; `resolve_exercise_video()` → PGRST202 | **El punto 7 no funciona en producción.** `ExerciseVideoPanel` no puede resolver ningún vídeo. |
| `metrics_catalog_quality.sql` | 0 de 5 filas de calidad | Menor: las claves se guardan, salen sin unidad ni descripción. |

No verificable con `anon` (permisos revocados, que es lo correcto):
`pdf_theme.sql`, `profiles_storage_policies.sql`, `ROLES_MULTIPLES.sql`,
`athlete_lifecycle.sql`, `FIX_ATLETA_SIN_EMAIL.sql`, `progression_templates.sql`,
`expand_grouped_set.sql`, `chat_media.sql`.

**Orden de ejecución recomendado:** `FIX_RLS_COMPETICIONES.sql` (primero, es la
fuga) → `exercise_videos.sql` → `metrics_catalog_quality.sql`.
