# ANVIL Strength — Reestructuración del panel y personalización

**Fase de diseño. Sin código todavía.**
Fecha: 12 de agosto de 2026.

Seis peticiones, analizadas contra el código real. El orden de este documento
es el de la petición; el orden de EJECUCIÓN está en §8 y no es el mismo.

---

## 0. Qué ya existe y qué hay que construir

| # | Petición | Estado real | Trabajo |
|---|---|---|---|
| A | Copiar un día entero a otro | Existe copiar UN ejercicio + plantillas de día. El motor de copia profunda existe (`cloneWeekContents`) | Extraer motor + UI nueva |
| B | Apartado de personalización | Existe el PATRÓN (`pdf_theme` JSONB + `resolveTheme`) y `brand_color`, pero solo lo edita el admin | Nuevo, sobre patrón conocido |
| C | Ficha de atleta a 4 apartados | Hoy son 7 pestañas planas | Reestructurar + una pantalla nueva (Resumen) |
| D | Control de pagos | No existe nada | Nuevo (tabla + semáforo + 4 superficies) |
| E | Descripción en el check-in | `form_templates.questions` es JSONB: extensible sin migración | Pequeño |
| F | Vista del atleta mejor integrada | Es la fase F5 del roadmap, la única sin empezar | Pasada dirigida |

---

## A. COPIAR UN DÍA ENTERO

### A.1 Lo que hay hoy

- `DayEditorModal` → botón **"Copiar de otro día"**: elige día origen, luego
  **un** ejercicio, y lo pega. Uno a uno.
  [`WorkoutBuilder.tsx:3191`](../src/features/planning/components/WorkoutBuilder.tsx)
- `applyDayTemplate()`: plantilla guardada del coach → un día. Sirve, pero
  obliga a guardar la plantilla primero, con nombre, para algo que es de usar
  y tirar.
- `cloneWeekContents(blockId, sourceWeek, targetWeek)`
  [`trainingService.ts:1617`](../src/services/trainingService.ts): **ya hace la
  copia profunda correcta** — inserta las sesiones, empareja por `day_number`
  (no por posición en el array), empareja ejercicios por `session_id|order_index`
  con lista para índices repetidos, copia `section`, `round_count`,
  `rest_seconds`, `rpe`, `velocity_avg`, `modifiers`, músculos, tipos de serie,
  y NO copia ejecución (`actual_*`, vídeos, VBT, `athlete_notes`, `date`).
  Usa `insertWithOptionalColumns` para degradar si a la base le falta una columna.

Toda la parte difícil está resuelta. Lo que falta es el nivel "día".

### A.2 Qué hago

**Servicio.** Extraer de `cloneWeekContents` el núcleo a una función privada
`copyExercisesInto(sourceSessions[], sessionIdByKey)`, y que ambas la usen —
así arreglar un fallo de copia lo arregla en los dos sitios, que hoy no pasaría.

Nueva API pública:

```ts
trainingService.copyDayInto(
  sourceSessionId: string,
  targetSessionIds: string[],
  mode: 'replace' | 'append',
  opts?: { copyName?: boolean; copyAppendices?: boolean }
): Promise<void>
```

Reglas, escritas para que no se discutan luego:

| Se copia | No se copia |
|---|---|
| Ejercicios, orden, sección, rondas | `completed_at` |
| Series: reps, carga, RPE, métrica, descanso, notas, tipo de serie, agrupación | `actual_reps`, `actual_load`, `actual_rpe`, `is_completed` |
| `warmup` y `extras` (Consideraciones), si se marca | Vídeos y ficheros VBT |
| Nombre del día, si se marca | `athlete_notes`, `date`, `day_of_week` del destino |

`mode: 'replace'` borra los ejercicios del destino antes; `'append'` los añade
detrás continuando el `order_index`.

**Interfaz.** Tres puntos de entrada, porque el gesto se pide desde sitios distintos:

1. **Rejilla de semanas × días** — en la tarjeta de cada día, menú `⋯` →
   **Copiar día** / **Pegar día (N ej.)**. Portapapeles interno del builder
   (estado, no `navigator.clipboard`): copiar una vez y pegar en seis días.
2. **Copiar a varios de golpe** — desde ese mismo menú, **"Copiar este día a…"**
   abre un panel con todos los días del bloque agrupados por semana y casillas.
   Un solo viaje al servidor.
3. **Dentro del editor del día** — el botón actual pasa a menú con dos
   entradas: *Un ejercicio de otro día* (lo de ahora, se conserva) y
   *Traer el día entero* (origen + reemplazar/añadir).

Si el destino tiene ejercicios, confirmación previa con el conteo real
("El día 3 de la semana 2 tiene 5 ejercicios. Se sustituirán."). El
`ConfirmationModal` ya sabe cambiar texto y color, no hace falta nada nuevo.

**Coste:** ~150 líneas de servicio, ~250 de interfaz. **Cero SQL.**

---

## B. APARTADO DE PERSONALIZACIÓN

Sección propia en el panel del coach: `/coach-dashboard/preferencias`.
No dentro de "Perfil": Perfil es *quién eres*, esto es *cómo funciona tu app*.

### B.1 Dónde se guarda

**Una sola columna `profiles.coach_prefs` JSONB.** Mismo patrón exacto que
`pdf_theme`: constraint de tipo objeto, tope de 8 KB, y un `resolvePrefs()` en
cliente que rellena lo que falte. Motivo, el mismo que está escrito en
`database/pdf_theme.sql`: son decisiones de producto que cambian cada dos
semanas, y una columna por ajuste convierte cada retoque en una migración.
Añadir un ajuste nuevo pasa a ser una línea en el contrato de TypeScript.

Contrato en `src/lib/prefs/contract.ts`, resolución en `resolve.ts`, y un
`PreferencesProvider` cerca de la raíz para no consultar en cada pantalla.

**Herencia al atleta:** el atleta lee las preferencias de SU coach por el mismo
camino que ya usa `coach_brand_color` en `useUser.ts:141`. Un `coach_prefs`
más en ese `select`, sin consulta nueva.

### B.2 Qué se puede configurar

**1. Marca**
- Color principal (`brand_color` ya existe — hoy solo lo toca el admin desde
  `AdminDashboard`; se le devuelve al coach).
- Logotipo (ya existe, en `PdfThemeSettings`; se unifica aquí).
- Color de acento que ve el atleta.

**2. Colores por sección del entrenamiento**
`ExerciseSection` ya existe: `warmup` | `main` | `accessory`. Cada una recibe
tono y saturación. Hoy están a fuego —verde esmeralda para accesorio— en
`WorkoutBuilder.tsx:2919` mediante clases de Tailwind literales.

El cambio de fondo: esos colores dejan de ser clases y pasan a **tokens CSS**
(`--sect-main`, `--sect-main-quiet`, `--sect-main-line`…) inyectados en un
`<style>` de ámbito desde el provider. Es el mismo mecanismo del sistema de
diseño (`src/styles/tokens.css`), así que el color configurable no abre una
puerta trasera fuera del sistema.

> **Nota heredada:** al exponer un color como token para Tailwind hay que
> declararlo con el patrón `<alpha-value>`, o `bg-sect-main/35` sale
> transparente. Está documentado en la memoria del proyecto.

**3. Intensidad → opacidad**
Regla configurable, no cosmética suelta: a más intensidad, más sólido el color.
El coach elige:
- el **criterio**: RPE, %1RM, o carga relativa al mejor del bloque;
- el **rango de opacidad** (p. ej. 0.15 → 0.90);
- la **curva** (lineal o con más contraste arriba).

Una función `intensityAlpha(value, prefs)` en `src/lib/prefs/intensity.ts`, y
la usan la rejilla del builder, el registro del atleta y las tarjetas de día.
Sin preferencia guardada, el resultado es el de hoy.

**4. Unidades: kg / lb**
Se sigue guardando **siempre en kg**. Es capa de presentación, no de modelo —
cambiar el almacenamiento invalidaría todo el histórico y todas las métricas de
VBT ya calculadas.

`src/lib/units.ts`: `toDisplay(kg, unit)`, `fromInput(value, unit)`,
`formatLoad(kg, unit, prefs)`, `unitLabel(unit)`, y el **redondeo de disco**
(2.5 kg / 1.25 kg / 5 lb / 2.5 lb) que es lo que hace que "102.06 kg" no
aparezca nunca en pantalla.

Override por atleta: la unidad es lo único que de verdad varía por persona
(un atleta en EE. UU. frente al resto). Va en las preferencias del atleta, no
en las del coach.

**5. Primer día de la semana**
Hoy `WEEKDAYS` en `types/training.ts` es constante ISO (lunes = 1). Se añade
`orderedWeekdays(prefs)` y lo consumen: `CalendarSection`,
`ConsistencyCalendar`, `CoachTeamSchedule`, `CalendarWeekPicker` y el orden de
días del builder. La constante ISO no se toca — es la verdad del dato; lo que
cambia es el orden de presentación.

**6. Programación (los ajustes "a su gusto")**
- Días por semana y semanas por bloque por defecto.
- `release_offset_days` por defecto (cuándo se le abre la semana al atleta).
- Si el día se identifica por **nombre** o por **número**.
- Qué campos aparecen en el editor de serie (RPE, velocidad, %1RM, descanso,
  notas) — hoy están todos siempre.
- Qué ve el atleta: RPE prescrito sí/no, velocidad objetivo sí/no.
- Descanso por defecto al crear una serie.
- Redondeo de carga.

### B.3 Coste y honestidad

- SQL: **una columna**.
- `src/lib/prefs/` + provider: ~300 líneas.
- Pantalla de preferencias: ~600 líneas (es un formulario largo con
  previsualización en vivo).
- **El barrido de unidades es lo caro:** hay ~40 sitios pintando "kg" a mano.
  Propongo hacerlo completo en las superficies de atleta y de programación, y
  dejar **PDF y exportaciones para una segunda pasada** — el generador de PDF
  tiene su propio tema y su propia lógica de formato, y mezclarlo aquí
  duplicaría el tamaño del cambio.

---

## C. FICHA DEL ATLETA: DE 7 PESTAÑAS A 4

### C.1 El mapeo

| Nuevo apartado | Absorbe |
|---|---|
| **PROGRAMACIÓN** | `planning` — `TrainingBlockList` + `WorkoutBuilder` (macros, bloques, semanas, días, ejercicios) |
| **ESTADÍSTICAS** | `log` (`AthleteLogTab`, 45 KB) + `vbt` (`CoachVbtTab`, 42 KB) + `AthleteVolumeTab` (28 KB) + `AthleteStatsModal` (50 KB, **hoy es un modal suelto**) + check-ins como datos + PWR |
| **COMPETICIÓN** | `competitions` (hoy: solo listar y borrar) + alta + pasadas/futuras + resultados |
| **DATOS** | `personal` (`PersonalInfoSection`) + **pagos** + notas del entrenador + estado de la cuenta |

### C.2 ESTADÍSTICAS necesita navegación interna

Son ~165 KB de componentes. Una sola pantalla no funciona. Sub-navegación:

```
Estadísticas
├── Resumen      ← NUEVO. Las conclusiones, en una pantalla.
├── Registro     ← AthleteLogTab: qué hizo de verdad
├── Volumen      ← AthleteVolumeTab: series por músculo/patrón
├── Velocidad    ← CoachVbtTab + PWR
└── Check-ins    ← respuestas + gráficas de sueño/estrés/peso
```

**Resumen** es lo único nuevo de fondo, y es el que justifica la unificación:
hoy la adherencia está en un sitio, la desviación de RPE en otro, los PRs en un
modal y el peso corporal en los check-ins. Contenido:
adherencia (7/30 días) · desviación carga y RPE prescrito vs real ·
tendencia de peso corporal · PRs y estimados · carga interna y ACWR ·
últimas 3 sesiones · avisos.

El motor de todo esto **ya existe** (`src/lib/stats/executionLog.ts`,
`src/lib/vbt/analysis.ts`, `src/lib/volume/`). Es composición, no cálculo nuevo.

> Las salvedades metodológicas ya acordadas (carga interna = series × RPE;
> ACWR descriptivo y no predictivo; RPE en rango se compara por el extremo alto)
> se escriben **en pantalla**, no en un comentario del código.

`AthleteStatsModal` deja de ser modal y pasa a ser el contenido de "Resumen".
Un modal de 50 KB con las conclusiones del atleta es exactamente lo que hace
que nadie las mire.

### C.3 COMPETICIÓN: lo que falta

Hoy solo lista y borra. Se añade:
- **Alta desde la ficha** (`AssignCompetitionModal` ya existe, solo hay que
  conectarlo aquí).
- **Pasadas vs futuras**, separadas, con cuenta atrás para la siguiente
  (`CompetitionCountdown` ya existe).
- **Resultados** de las pasadas: peso en báscula, mejores intentos S/B/D,
  total, DOTS/GL, puesto, notas.

Los resultados van en tabla propia `competition_results`, no en columnas nuevas
de `competitions`: esa tabla también guarda el calendario oficial de la AEP,
que no tiene resultados de nadie. (Y tiene una fuga de RLS pendiente de
arreglar, ver §7.)

### C.4 DATOS

`PersonalInfoSection` en modo coach ya cubre edad, altura, peso, patologías,
etc. — con campos definidos por el coach y valores fechados. Se le añade:
- **Pagos** (§D).
- **Notas del entrenador**: texto libre privado, que el atleta NO ve. Hoy no
  existe ese espacio; lo que hay son notas por serie y por sesión, que sí ve.
- **Estado de la cuenta**: `account_status`, invitación, alta, último acceso.

### C.5 Nutrición — decidido

Quinta pestaña, condicionada a `pautar_nutricion`. La estructura completa
queda así, con las capacidades que ya usa el sistema:

| Pestaña | Capacidad |
|---|---|
| Programación | `planificar_entrenamiento` |
| Estadísticas | `planificar_entrenamiento` |
| Competición | `planificar_entrenamiento` |
| Datos | `planificar_entrenamiento` **o** `pautar_nutricion` |
| Nutrición | `pautar_nutricion` |

Un entrenador puro ve cuatro. Un nutricionista puro ve dos (Nutrición y
Datos). Quien es las dos cosas ve las cinco — que es el caso que motivó los
roles múltiples.

### C.6 Sobre el sistema de capacidades

Las pestañas actuales declaran QUÉ hace falta poder hacer para verlas
(`caps: Capacidad[]`), no quién eres. Ese diseño se conserva tal cual —
es lo que hace que un nutricionista vea su recorte del panel.

---

## D. CONTROL DE PAGOS

### D.1 Modelo

Tabla nueva `athlete_payments`:

```sql
id           uuid pk
athlete_id   uuid  -> profiles
coach_id     uuid  -> profiles
paid_until   date        -- hasta cuándo cubre este pago
amount       numeric     -- opcional
currency     text        -- opcional, por defecto 'EUR'
method       text        -- opcional
note         text
created_by   uuid
created_at   timestamptz
```

**"Pagado hasta" = `MAX(paid_until)`**, no una columna que se sobrescribe. Una
fila por pago da el histórico gratis ("lleva 8 meses pagando puntual") y no
pierde nada al renovar. Es la misma decisión que ya se tomó en
`athlete_profile_data`: el dato con fecha vale más que el dato actual.

RLS: el coach gestiona las de sus atletas vía `manages_athlete()` —la función
`SECURITY DEFINER` que ya existe en `INFORMACION_PERSONAL.sql`, y que es
obligatorio usar aquí: una comprobación que salta de tabla en tabla y no va
dentro de una función así encadena políticas RLS y provoca el timeout que ya
se sufrió con `training_sets`. El atleta: `SELECT` de las suyas y nada más.

### D.2 El semáforo

Una sola función, `paymentStatus(paidUntil, today)` en `src/lib/billing.ts`,
para que el criterio no se escriba cuatro veces:

| Estado | Condición | Color | Texto |
|---|---|---|---|
| `ok` | faltan > 14 días | neutro | "Pagado hasta el 3 de septiembre" |
| `soon` | faltan ≤ 14 días | ámbar | "Quedan 11 días de suscripción" |
| `urgent` | faltan ≤ 7 días | rojo | "Quedan 4 días — renueva para no perder acceso" |
| `expired` | ya pasó | rojo | "Venció el 1 de agosto" |
| `unset` | sin pagos | neutro apagado | "Sin pagos registrados" |

Días naturales, no laborables, y comparando fechas locales sin hora — si no,
"quedan 14 días" cambia a las 2 de la mañana según la zona horaria.

### D.3 Dónde aparece

**Coach**
- Chip en la lista de atletas (`CoachAthletes`), solo si es ámbar o rojo.
- Panel completo en Datos: estado, histórico, botón "Registrar pago".
- Fila en `AttentionPanel` cuando esté vencido — ese panel ya es el sitio de
  "esto necesita que hagas algo".

**Atleta**
- Banda en `AthleteHome`, **solo en ámbar o rojo**. En verde no se le dice
  nada: no es una pantalla de facturación, y un recordatorio permanente de que
  paga es ruido.
- La misma banda en su perfil, ahí sí siempre visible.

---

## E. DESCRIPCIÓN DEL COACH EN EL CHECK-IN

`form_templates.questions` es JSONB, así que crece sin migración:

```ts
interface FormQuestion {
    id: string;
    label: string;
    qtype: 'scale' | 'number' | 'text';
    help?: string;                     // NUEVO — cómo se responde esta pregunta
    scale?: {                          // NUEVO — solo para qtype 'scale'
        min: number; max: number;
        minLabel?: string; maxLabel?: string;
    };
}
```

Más una columna `form_templates.intro TEXT` para la indicación general del
formulario ("rellénalo la noche anterior; la escala es 1-10 donde 1 es no he
pegado ojo y 10 he dormido perfecto").

Dónde se pinta:
- **Coach**, editor de plantilla: campo de ayuda por pregunta + intro, con
  previsualización de cómo lo verá el atleta.
- **Atleta** (`AthleteCheckIns`, `CheckInAnswerFields`): la intro arriba en una
  tarjeta, la ayuda bajo cada etiqueta, y las etiquetas de los extremos
  visibles en la escala (hoy son números pelados del 1 al 10, que es
  precisamente lo que hace que cada atleta use una escala distinta).

Compatibilidad: `mergeQuestions()` ya conserva preguntas retiradas; los campos
nuevos son opcionales, así que una plantilla guardada ayer sigue abriendo.

---

## F. VISTA DEL ATLETA MEJOR INTEGRADA

Es la fase **F5** del roadmap (rediseño pantalla a pantalla), la única sin
empezar. Dirigida a lo que se ha señalado: números pequeños y mal puestos.

**Diagnóstico previo.** El proyecto tiene una escala tipográfica en
`tokens.css` y `DESIGN.md`, pero las superficies del atleta la esquivan: hay
tamaños literales `text-[9px]`, `text-[10px]`, `text-[11px]` sembrados por
`WorkoutLogger` (79 KB), `LoggerSetRow` (29 KB) y `SessionFinish`.

**Trabajo, por orden de cuánto se mira:**

1. **`LoggerSetRow`** — la fila de serie es *la* pantalla de la app.
   Rejilla de columnas fija y alineada entre filas; objetivo y real
   distinguidos por **jerarquía y posición**, no por tamaño diminuto;
   `tabular-nums` en toda cifra (sin eso, los dígitos bailan al escribir);
   entradas a **16 px mínimo** — por debajo, iOS Safari hace zoom al enfocar y
   descoloca la pantalla entera, que es la mitad de la sensación de "mal
   puesto" en móvil.
2. **`TodayPanel` / `AthleteHome`** — una sola jerarquía: qué toca hoy, cuánto
   queda, qué hago ahora. Las cifras sueltas o crecen o se van.
3. **`SessionFinish`** — el resumen del día es donde se cierra el bucle;
   ahora mismo compite consigo mismo.
4. **`AthleteVbtView`, `AthleteCompetitionsView`, `AthleteNutritionView`** —
   misma pasada, menos densa.
5. **Barrido final** de tamaños literales en superficies de atleta contra la
   escala del sistema.

Verificación con el navegador integrado a 375 px y a 430 px, con capturas
antes/después. No se da por bueno lo que no se ha visto renderizado.

---

## 7. SQL — TODO EN UN SOLO ARCHIVO

Regla ya establecida en el proyecto: una columna que el cliente escribe y que
no existe hace que PostgREST rechace **el lote entero** con PGRST204 — no se
guarda nada, y en silencio. Así que todo el SQL de este plan va a **un único
archivo idempotente con bloque de verificación al final**:

`database/REESTRUCTURACION_2026-08.sql`

1. `profiles.coach_prefs` JSONB + constraint de objeto + tope 8 KB.
2. `profiles.athlete_prefs` JSONB (unidad propia del atleta).
3. Tabla `athlete_payments` + índices + RLS vía `manages_athlete()`.
4. Tabla `competition_results` + RLS.
5. `form_templates.intro` TEXT.
6. `profiles.coach_notes` TEXT (notas privadas del entrenador) — o columna en
   la relación `coach_athletes` si se prefiere que sean por relación.
7. Bloque de verificación que **ejecuta** las funciones, no solo comprueba que
   existen (PostgreSQL no valida los nombres de columna de una función plpgsql
   hasta la primera ejecución).

**Sigue pendiente de aplicar, de antes, y conviene meterlo en la misma tanda:**
`FIX_RLS_COMPETICIONES.sql` (fuga real: `competitions` con `athlete_id` se lee
sin sesión), `exercise_videos.sql`, `INFORMACION_PERSONAL.sql` — del que
depende `manages_athlete()`, y por tanto los pagos —, y
`CALENTAMIENTO_ESTRUCTURADO.sql`, del que depende `section` y por tanto los
colores por sección.

> Verificar el estado real cuesta un `curl` por tabla contra PostgREST. No
> fiarse de esta lista ni de "ya las he ejecutado".

---

## 8. ORDEN DE EJECUCIÓN

| Paso | Qué | Depende de | Por qué ahí |
|---|---|---|---|
| **P0** | Trocear `WorkoutBuilder.tsx` | — | 261 KB / ~5000 líneas. Voy a tocarlo en A, B y el barrido de unidades. Sin trocear, cada cambio es a ciegas. Ya estaba pendiente de F4. |
| **P1** | Copiar día entero | P0 | Independiente, sin SQL, alivio inmediato. |
| **P2** | El SQL, de una vez | — | Para no descubrir un PGRST204 a mitad del paso 5. |
| **P3** | Preferencias (contrato + provider + pantalla) | P2 | Sin el barrido de unidades todavía. |
| **P4** | Ficha a 4 apartados + Estadísticas/Resumen | P0 | La reestructuración grande, con el builder ya troceado. |
| **P5** | Pagos + descripción de check-in | P2, P4 | Necesitan sitio donde vivir (Datos) y la tabla creada. |
| **P6** | Barrido de unidades + primer día de la semana | P3, P4 | Toca muchos ficheros; mejor con la ficha estable. |
| **P7** | Vista del atleta (F5) | P6 | Lo último: rediseñar sobre datos que aún van a cambiar de formato es trabajo tirado. |

Cada paso queda desplegable por sí solo. Nada de esto exige un big-bang.

---

## 9. DECISIONES — CERRADAS EL 12 DE AGOSTO DE 2026

Las cuatro se preguntaron y se zanjaron. No se vuelven a abrir.

1. **Nutrición: 5ª pestaña condicionada a `pautar_nutricion`.**
   La ficha tiene CUATRO apartados de entrenamiento —Programación,
   Estadísticas, Competición, Datos— y Nutrición aparece como quinta **solo**
   para quien puede pautarla. Un nutricionista puro ve Nutrición + Datos y nada
   más. Los 4 apartados son la estructura del entrenador; nutrición es otra
   profesión, no otro apartado suyo.

2. **Pago vencido: solo avisa. Nunca corta.**
   `has_access` sigue siendo manual y ningún proceso automático lo toca. El
   semáforo es información, no un portero. Que quede escrito porque es
   tentador: una fecha mal metida no puede dejar a un atleta sin su
   entrenamiento un lunes por la mañana.

3. **Personalización: global del coach, con override de unidades por atleta.**
   - **Nivel coach** (una sola vez, vale para todos sus atletas): colores de
     marca, colores por sección, rampa de intensidad→opacidad, y todos los
     ajustes de programación.
   - **Override por atleta**: SOLO unidad (kg/lb) y primer día de la semana.
   Nada más admite override. Si en el futuro aparece la tentación de añadir
   uno, el criterio es este: solo lo que varía por la PERSONA (dónde vive, qué
   unidad usa), no por el gusto de quien programa.

4. **Trocear `WorkoutBuilder.tsx` primero (P0).**
   Se extraen `DayEditorModal`, el editor de series y la rejilla de semanas a
   ficheros propios antes de tocar nada más.

---

## 10. Lo que NO entra en este plan

Para que quede dicho, y no aparezca a mitad:

- Rediseño del PDF y las exportaciones con las unidades nuevas (segunda pasada).
- Pasarela de pago real. Esto es un **registro** de pagos, no cobra nada.
- Cambiar el almacenamiento a libras. Se guarda en kg, siempre.
- Las decisiones metodológicas de análisis pendientes de debatir
  (`INDIRECT_FACTOR`, "Fuerza Suelo"): se escriben en pantalla, no se cambian.
