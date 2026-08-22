# ANVIL Strength — Decisiones de la revisión del 21 de agosto de 2026

**Estado: decisiones cerradas por Marc. Punto de partida de la implementación.**

Este documento recoge las quince decisiones que quedaron zanjadas antes de tocar
código, el estado REAL de la base de datos verificado contra producción ese mismo
día, y el orden de ejecución acordado.

Complementa —no sustituye— a [`PLAN_REESTRUCTURACION_2026-08-12.md`](./PLAN_REESTRUCTURACION_2026-08-12.md)
y a [`IDEAS_COMPETENCIA.md`](./IDEAS_COMPETENCIA.md).

**Regla:** lo que está aquí no se vuelve a preguntar. Si algo hay que cambiar, se
cambia AQUÍ primero, con fecha, y luego en el código.

---

## 0. Estado real de la base de datos — verificado el 21/08/2026

Sondeado contra producción (`ihcyuoczbmjxfinxvzra`) con la clave anónima, tabla
por tabla y función por función.

**Cómo se lee una sonda de PostgREST** (esto es lo que más tiempo ha hecho perder
en el pasado, así que queda escrito):

| Respuesta | Significa |
|---|---|
| `200` | La tabla/columna existe y `anon` puede leerla (0 filas ≠ tabla vacía) |
| `401` + `42501` | **Existe** y la RLS la cierra a `anon`. En una función, existe y está revocada — que es lo correcto |
| `400` + `42703` | La **tabla existe** pero esa columna no |
| `404` + `PGRST205` | La tabla no existe |
| `404` + `PGRST202` | La función no existe **con esa firma** — hay que llamarla con los nombres de parámetro reales antes de concluir nada |

### Aplicado ✅

`athlete_lifecycle.sql` (`set_coach_athlete_status`, `find_athlete_by_email`,
`upsert_coach_athlete`, `gestiono_este_perfil`, `profiles.account_status`) ·
`INFORMACION_PERSONAL.sql` (`manages_athlete`, `athlete_profile_data`,
`athlete_profile_schemas`) · `CALENTAMIENTO_ESTRUCTURADO.sql`
(`session_exercises.section`, `round_count`) · `REESTRUCTURACION_2026-08.sql`
(`athlete_payments`, `competition_results`, `profiles.coach_prefs`,
`profiles.athlete_prefs`, `coach_athletes.notes`, `form_templates.intro`) ·
`exercise_videos.sql` (`resolve_exercise_video`) · `week_visibility_and_scheduling.sql`
(`week_is_released`) · `expand_grouped_set.sql` · `metrics_catalog.sql`
(`metric_definitions`) · `CLAIM_LINK.sql` (`athlete_claim_links`) ·
`pwr_calibration.sql` · `pdf_theme.sql` · `coach_edit_checkins.sql`
(`form_responses.updated_by`) · `MIGRACION_PENDIENTE.sql`
(`training_sets.target_metric`) · `FIX_RLS_COMPETICIONES.sql` (fuga cerrada,
verificado: `competitions?athlete_id=not.is.null` sin sesión → `[]`)

> La nota `migraciones-pendientes` de la memoria estaba muy desactualizada y ella
> misma lo advertía. **Esta sección la sustituye.**

### Pendiente ❌

| Fichero | Consecuencia hoy | Prioridad |
|---|---|---|
| `FIX_COMPETICIONES_CLUB.sql` | **La página pública de competiciones está ROTA.** `get_public_upcoming_competitions` no existe y [`CompetitionsPage.tsx:53`](../src/features/landing/pages/CompetitionsPage.tsx) la llama. Se endureció la RLS sin crear la función `SECURITY DEFINER` que la sustituía | **Urgente** |
| `exercise_indications.sql` | El bloque "Cómo se hace" de la ficha del ejercicio no se pinta. Degrada con elegancia | Normal |

### Deuda de esquema descubierta

- **`chat_messages` no está definida en ningún `.sql` del repositorio.** Existe en
  producción, creada a mano en el dashboard. Es la tabla que usa el chat vivo.
- **`training_blocks` tiene políticas duplicadas** (`Coach manage own blocks` +
  `Coach Manage Blocks`) con `auth.uid()` sin envolver en `(SELECT ...)`. Es el
  mismo patrón que causó el timeout de `training_sets` y sigue sin arreglar.

---

## 1. Las quince decisiones

### K1 · El pago SÍ corta el acceso — revoca la decisión del 12/08/2026

**Decidido: SÍ.**

Queda **revocada** la decisión 2 de [`anvil-reestructuracion-2026-08`]
(*"Pago vencido solo AVISA, nunca corta el acceso"*, 12/08/2026). Los comentarios
de [`src/lib/billing.ts`](../src/lib/billing.ts) y de
`database/REESTRUCTURACION_2026-08.sql` que afirman lo contrario se reescriben,
no se borran en silencio: la razón del cambio queda documentada donde estaba la
razón anterior.

**Sigue siendo cierto** lo que aquella decisión protegía: ANVIL **no cobra**. No
hay pasarela, no hay Stripe, no se mueve dinero. `athlete_payments` es un
REGISTRO que el entrenador rellena a mano; lo único nuevo es que ese registro
ahora decide el acceso.

**Despliegue obligatorio en dos tiempos.** No negociable:

1. Sale con `gate: 'warn'` para todos los entrenadores. Se avisa, no se bloquea.
2. Una semana con datos reales, comprobando que el semáforo dice la verdad.
3. Solo entonces el valor por defecto pasa a `'block'`.

Un fallo aquí deja sin entrenar a alguien que ha pagado, y eso se paga en
confianza, no en tiempo de desarrollo.

---

### K2 · El atleta gestionado se borra de verdad

**Decidido: SÍ, borrado real.**

Hoy, cerrar la relación con un atleta **ficticio** (`account_status = 'managed'`,
cuenta latente sin contraseña) lo deja en un estado del que no hay salida: no
puede entrar (nunca tuvo contraseña), su entrenador ya no puede leerlo
(`gestiono_este_perfil()` exige relación activa) y no existe ninguna función para
borrarlo. Queda en `auth.users` y `profiles` para siempre.

**Tres niveles con nombre distinto en la interfaz.** Nada de un botón "Eliminar"
ambiguo:

| Acción | Qué hace | Reversible | Historial |
|---|---|---|---|
| **Archivar** | `coach_athletes.status = 'archived'` | Sí | Intacto |
| **Terminar relación** | `status = 'ended'`, `ended_at = NOW()` | Sí (vuelve a `active`) | Intacto |
| **Borrar ficha** | Borra `auth.users` + cascada | **NO** | Se pierde |

**"Borrar ficha" solo aparece si se cumplen las DOS condiciones**, comprobadas en
el servidor y no en el navegador:

- `profiles.account_status = 'managed'`
- `profiles.claimed_at IS NULL`

Es decir: **una ficha que alguien ha reclamado alguna vez no se puede borrar
nunca.** Sus entrenamientos son suyos, no del entrenador.

Vive en la Edge Function `athletes` (acción `delete_managed`) porque borrar de
`auth.users` exige `service_role`. Confirmación escribiendo el nombre del atleta.

---

### K3 · Manda el pago, no `has_access`

**Decidido: manda el pago.**

> *"Si no tiene pago no puede verlo; en cuanto el entrenador actualice el periodo
> de pago, vuelve a tener acceso."*

**Consecuencia directa: `has_access` deja de ser la puerta del entrenamiento.**
Las cinco comprobaciones `user.has_access === false` de
[`UserDashboard.tsx`](../src/features/athlete/pages/UserDashboard.tsx) y
[`AthleteHome.tsx`](../src/features/athlete/components/AthleteHome.tsx) se
sustituyen por la puerta de pago. `RestrictedFeature` (*"Planificación Premium"*)
desaparece del panel del atleta.

`has_access` **no se borra**: se queda como lo que de verdad es, una suspensión de
cuenta a nivel de plataforma que maneja la administración desde `/admin`. Son dos
cosas distintas y ahora tienen dos nombres distintos:

| | Quién lo controla | Qué significa |
|---|---|---|
| `has_access` | Administración de ANVIL | La cuenta está suspendida en la plataforma |
| Puerta de pago | El entrenador | Este atleta no está al corriente **con su entrenador** |

**El desbloqueo es inmediato.** Al registrar un pago, `PaymentPanel` invalida
`['payment-status', athleteId]` y el atleta recupera el acceso sin recargar y sin
volver a iniciar sesión.

---

### K4 · Ejecución de migraciones

**Decidido: las ejecuto yo si puedo; si no, las preparo y Marc las ejecuta.**

**Estado real:** la CLI de Supabase está autenticada y el proyecto enlazado, pero
la conexión directa a la base falla con `LegacyDbConfigIpv6Error: IPv6 is not
supported on your current network`, y no hay ni contraseña de base de datos ni
clave `service_role` disponibles. **Hoy no se puede ejecutar DDL desde el agente.**

Dos vías, en orden de preferencia:

**(b) Recomendada — desbloquea las 8 fases siguientes.** Marc ejecuta UNA vez, en
su propia terminal:

```
npx supabase link --project-ref ihcyuoczbmjxfinxvzra
```

Le pedirá la contraseña de la base de datos. **La escribe él; el agente nunca la
ve ni la maneja.** A partir de ahí, `supabase db push` funciona sin intervención.

**(a) Alternativa — la de siempre.** El agente prepara UN fichero `.sql`
idempotente por bloque, con bloque de verificación al final, y Marc lo pega en el
SQL Editor.

**En los dos casos, y sin excepción:**

- `database/` se reorganiza en `database/migrations/NNNN_nombre.sql` + tabla
  `schema_migrations`. Los 80 ficheros sueltos con nombres `FIX_`, `MASTER_`,
  `00_DIAGNOSTICO_` son la causa raíz de que nadie sepa qué está aplicado.
- Se añade `npm run db:check`: sondea producción con la clave anónima e imprime
  qué falta. El mecanismo está probado y documentado en la sección 0.
- Toda migración lleva su bloque de verificación al final y es idempotente.

---

### K5 · Qué se bloquea por impago

**Decidido: todo lo relacionado con el entrenamiento o la nutrición.**

| Vista del atleta | ¿Se bloquea? | Por qué |
|---|---|---|
| `/dashboard/planificacion` — Entrenar | **Sí** | Es el servicio |
| `/dashboard/velocidad` — VBT | **Sí** | Es entrenamiento |
| `/dashboard/nutricion` — Nutrición | **Sí** | Es el servicio |
| Panel de "Hoy" del inicio (`TodayPanel`) | **Sí** | Enseña el entrenamiento del día |
| `/dashboard/chat` | **NO** | Si le cortas el chat no puede ni preguntar cómo pagar |
| `/dashboard/perfil` | **NO** | Sus datos son suyos |
| `/dashboard/competiciones` | **NO** | Su historial de competición es suyo |
| Calendario AEP, Ranking, Comunidad | **NO** | No es servicio del entrenador |

El resto del panel se ve con normalidad. **El bloqueo tiene que ser evidente y
tener salida**: un modal no descartable que dice qué pasa, hasta cuándo estaba
pagado, y **un botón que abre el chat con su entrenador**. Nunca un "contacta con
tu entrenador" sin camino.

`coach_prefs.billing.blocks` lo deja configurable en una línea si hace falta
afinarlo.

---

### K6 · Una semana de cortesía

**Decidido: 7 días.**

Se bloquea a partir de `MAX(paid_until) + 7 días`. Alguien que paga el día 3 en
vez del día 1 no se queda fuera.

Configurable por entrenador (`coach_prefs.billing.graceDays`), por defecto 7.

El semáforo ya existente de [`billing.ts`](../src/lib/billing.ts)
(`ok` / `soon` / `urgent` / `expired`) **no cambia**: sigue avisando desde 14 días
antes. Lo que se añade es que `expired` + 7 días cierra la puerta.

---

### K7 · Sin pagos registrados, no se bloquea

**Decidido: NO se bloquea.**

> *"Si no tiene ningún pago no se bloquea; solo cuando se comienzan a establecer
> pagos, o se dice explícitamente que ese atleta no paga."*

Esto es lo que evita el desastre del día del despliegue: hoy **ningún** atleta
tiene pagos registrados, y con la regla contraria se bloquearían todos a la vez.

**Estado de facturación por RELACIÓN**, en `coach_athletes.billing_mode` — igual
que `notes`, es de la relación y no de ninguno de los dos perfiles, porque un
atleta con entrenador de fuerza y nutricionista puede pagar a uno y no al otro:

| `billing_mode` | Comportamiento |
|---|---|
| `'auto'` *(por defecto)* | Sin ninguna fila de pago → **no bloquea**. Con al menos una → manda `MAX(paid_until) + graceDays` |
| `'exempt'` | Nunca bloquea. Familia, intercambios, cuentas de prueba |
| `'suspended'` | Bloquea siempre. Es el *"se dice explícitamente que ese atleta no paga"* |

**La regla, escrita una sola vez y en el servidor:**

```
atleta_al_corriente(athlete_id) =
    gate = 'off'                    → TRUE
    billing_mode = 'exempt'         → TRUE
    billing_mode = 'suspended'      → FALSE
    sin ninguna fila de pago        → TRUE          (K7)
    MAX(paid_until) + graceDays >= hoy → TRUE       (K3, K6)
    en cualquier otro caso          → FALSE
```

---

### K8 · Widgets apilados también en escritorio

**Decidido: SÍ, en escritorio también.**

Se implementa con dos salvaguardas, porque en una pantalla de 1440px esconder
información puede restar:

1. **Conmutador pila ↔ rejilla**, siempre visible, que recuerda la elección. Quien
   quiere comparar cuatro gráficas a la vez puede.
2. **Navegación por teclado obligatoria** (←/→, `role="tablist"`). Un gesto que es
   la única forma de llegar a algo es un fallo de accesibilidad.

| | Móvil | Tablet | Escritorio |
|---|---|---|---|
| Por defecto | Pila | Pila | Pila |
| Navegación | Deslizar + puntos | Deslizar + puntos | Flechas + teclado + puntos |
| Alternativa | — | Rejilla 2 col. | Rejilla completa |

**Presupuesto de rendimiento, innegociable:** solo se monta la tarjeta activa ±1.
Recharts es caro y seis `ResponsiveContainer` vivos a la vez harían imposible la
sensación de velocidad que es el objetivo de todo esto. Solo se animan `transform`
y `opacity`. `prefers-reduced-motion` → lista vertical, sin pila.

---

### K9 · Cuestionarios diarios y semanales, separados

**Decidido: separados.**

Hoy [`AthleteStatsModal.tsx:120`](../src/features/coach/components/AthleteStatsModal.tsx)
llama a `getResponsesByAthlete(athleteId)` **sin `type`**, así que trae los dos, y
`summarizeCheckIns` los ordena con `localeCompare` sobre `period_key`:
`'2026-08-02'` va antes que `'2026-W31'` por orden lexicográfico. Resultado: la
gráfica pinta primero todos los días del año y después todas las semanas,
seguidos. **El eje X no significa nada.**

Van en gráficas distintas, con conmutador **Diario / Semanal**. La granularidad la
elige quien mira.

**Y una gráfica por familia de escala**, que es el otro fallo: hoy hay un solo
`<YAxis>` para todo, así que "pasos" (~9.000) aplasta sueño, dolor y estrés (0-10)
contra el suelo.

Contrato nuevo en `form_templates.questions` — **JSONB, sin migración**:

```ts
interface FormQuestion {
  // ...lo que ya hay
  axis?: 'scale10' | 'count' | 'mass' | 'duration' | 'percent' | 'custom';
  unit?: string;               // 'kg' | 'pasos' | 'h' | '%'
  domain?: [number, number];
  invertPolarity?: boolean;    // dormir mal = 3: colorea el punto, NO invierte el eje
}
```

Registro de ejes en `src/lib/forms/axes.ts`, mismo patrón que
[`src/lib/vbt/metricRegistry.ts`](../src/lib/vbt/metricRegistry.ts), que ya
funciona.

**Clasificación de lo ya guardado**, en este orden: `axis` declarado →
`qtype === 'scale'` → heurística por `id`/`label` (`peso|kg` → `mass`,
`pasos|steps` → `count`, `sueño|horas` → `duration`) → `custom` con gráfica
propia. Una variable sin clasificar **nunca** se mete en un eje ajeno. El
resultado de la heurística se persiste la primera vez que el entrenador abre el
editor de plantilla.

**Nunca un segundo eje Y** salvo el caso pactado de carga contra RPE, donde la
correlación es el mensaje.

Color **estable por `question.id`** (hash), no por índice: hoy es `i % 5` sobre 5
colores, así que la sexta pregunta repite color y añadir una pregunta cambia el
color de todas las demás.

---

### K10 · Fecha de inicio de bloque obligatoria

**Decidido: sí, tiene que haber fechas de inicio.**

Sin `training_blocks.start_date` no hay forma de situar la semana N de un bloque
en el calendario, y por tanto no hay "Semana" ni "Histórico" reales. La conversión
ya está escrita en SQL —
[`week_is_released()`](../database/week_visibility_and_scheduling.sql) calcula el
lunes ISO de la semana N a partir de `start_date` — y solo hay que espejarla en
TypeScript.

| | Regla |
|---|---|
| **Bloques nuevos** | `start_date` obligatoria en `CreateBlockModal`. Se propone la del lunes siguiente |
| **Bloques existentes sin fecha** | Siguen funcionando en modo **ordinal** (agregando por `week_number`), con un aviso en la ficha y un botón de "poner fecha de inicio" |
| **Nunca** | Inventar una fecha. Un bloque fechado a ojo contamina todas las estadísticas de calendario |

`period.ts` declara `resolution: 'calendar' | 'ordinal'` y la interfaz lo dice.

---

### K11 · Se reactiva la PWA

**Decidido: sí.**

Hoy la situación es contradictoria: `vite-plugin-pwa` está configurado y construye
el manifiesto, y [`main.tsx:18`](../src/main.tsx) desregistra a la fuerza todos los
service workers. Se paga el coste y no se obtiene el beneficio.

Se reactiva en el bloque 8, con:

- `registerType: 'prompt'` en vez de `autoUpdate`. `ReloadPrompt` ya existe y
  avisa; una actualización silenciosa a mitad de una sesión de entrenamiento es
  justo lo que no puede pasar.
- El `globIgnores: ['**/opencv.js']` que ya está se mantiene: son 10,6 MB que no
  se pueden precargar.
- Se conectan `useWriteQueue.ts` y `offlineQueue.ts`, que ya están escritos y no
  los usa nadie: registrar series sin cobertura es el caso de uso que justifica
  toda la PWA.
- La puerta de pago se comprueba **al reconectar**, y la caché de lectura caduca a
  las 24 h.

---

### K12 · El chat se queda en `chat_messages`

**Decidido: la que sea más eficiente. Verificado: `chat_messages`.**

Había **dos implementaciones completas de chat contra dos tablas distintas**:

| | Tabla | Quién la usa | Definida en SQL |
|---|---|---|---|
| **Viva** | `chat_messages` | `useChat.ts` → `AthleteChatView`, `CoachChatManager` (las dos rutas reales) | **NO** — creada a mano en el dashboard |
| **Muerta** | `messages` | `chatService.ts` → `ChatView.tsx`, que **no lo importa nadie** | `messaging_notifications.sql` |

**Se queda `chat_messages`**, porque es la que sirve el chat que la aplicación
enseña de verdad. Se borran `ChatView.tsx` (427 líneas) y `chatService.ts`.

**Dos deudas que quedan apuntadas y no se hacen ahora:**

1. Escribir el esquema y la RLS de `chat_messages` en
   `database/migrations/`. Una tabla de producción que no está en el repositorio
   no se puede reconstruir ni auditar.
2. `useChat` carga **todos** los mensajes del usuario en una consulta
   (`.or(sender_id.eq…,receiver_id.eq…)`, sin filtro de conversación ni
   paginación) y filtra en el navegador. Se arregla en el bloque 6.

`messages` **no se borra todavía**: primero hay que contar sus filas con sesión en
el SQL Editor. Si tiene historial real, hay que decidir si se migra.

---

### K13 · Se borra el código muerto

**Decidido: sí.**

~1.100 líneas que no ejecuta nadie y que confunden cualquier lectura del código:

| Fichero | Líneas | Por qué está muerto |
|---|---|---|
| `src/features/chat/ChatView.tsx` | 427 | Exportado, importado por nadie |
| `src/services/chatService.ts` | ~180 | Solo lo llama `ChatView.tsx`, y apunta a la tabla equivocada |
| `src/services/chatMediaService.ts` | ~90 | La interfaz de F7 nunca se escribió |
| `src/hooks/useSwipeNavigation.ts` | 30 | Escrito y sin usar. Su dependencia `@use-gesture/react` **sí se aprovecha** para el `WidgetStack` de K8 |
| `src/services/pointsService.ts` | ~70 | Sin referencias |
| `src/services/invitesService.ts` → `unlinkAthlete` | ~40 | Sustituido por `setRelationStatus`. Es la **segunda** ruta de borrado con semántica incompatible |

Está todo en git. Se borra en un commit propio, separado, para que revertirlo sea
trivial si aparece un llamador escondido.

---

### K14 · Alcance del rediseño: panel de atleta primero

**Decidido: sí al rediseño, con foco en el panel del ATLETA sobre todo, y el del
entrenador después. La portada, más adelante.**

El sistema de diseño **ya existe y es bueno**: `tokens.css` en OKLCH,
`tailwind.config.js` aditivo con `color-mix` para la opacidad, `DESIGN.md` con
389 líneas de criterio. Lo que falta no es diseñar: es **terminar de adoptar lo
que ya está diseñado.**

Medido sobre 182 ficheros `.tsx`:

- **100** usan los tokens nuevos (`text-ink`, `bg-surface-*`, `text-t-*`, `rounded-card`)
- **93** usan el sistema antiguo (`text-gray-400`, `bg-anvil-red`, `bg-white/5`)
- **29 usan los dos dentro del mismo fichero** — dos grises distintos en la misma tarjeta
- Primitivas: `Button` 25 usos frente a **564** `<button>` a mano · `Modal` 12
  ficheros frente a **~30** con `fixed inset-0` sin trampa de foco · **no existe**
  primitiva de `Input` y hay 157 sueltos · `Skeleton` 2 usos frente a **114**
  spinners

**Orden acordado:**

1. **Panel del atleta** — `AthleteHome`, `WorkoutLogger`, `LoggerSetRow`,
   `TodayPanel`, `AthleteCheckIns`, `AthleteVbtView`, `AthleteNutritionView`,
   `AthleteCompetitionsView`, `SessionFinish`
2. **Panel del entrenador** — `CoachCheckInsTab`, `AthleteLogTab`, `CoachVbtTab`,
   `TrainingBlockList`, `WorkoutBuilder`, `CoachChatManager`
3. **Compartido** — `AuthModal`, `ErrorFallback`, `LoadingSpinner`,
   `NotificationsPopover`, los ~30 modales a mano
4. **Portada y legales** — más adelante, tienen su propio registro visual
   (`fold-light-*`) y no compiten por la misma atención
5. **`/admin`** — al final

**Regla dura: una pantalla tocada sale al 100% migrada.** Nada de "arreglo esta
tarjeta". Los 29 ficheros que hoy mezclan los dos sistemas existen exactamente por
migraciones a medias.

Primitivas que hay que crear antes de empezar: `Field`/`Input`/`Select`/`Textarea`,
`Card`, `Tabs`, `Chart` (envoltorio de recharts: hoy `AXIS`, `GRID` y
`TOOLTIP_STYLE` están copiados en 4 ficheros), `StatTile`, `DataTable`.

Los alias heredados (`anvil-red`, `anvil-black`, `anvil-gray`) se retiran de
`tailwind.config.js` cuando lleguen a cero usos, no antes.

---

### K15 · Se ejecuta por bloques

**Decidido: sí, estructurado por fases.**

Ver la sección 2.

---

## 2. Orden de ejecución

```
1 ──► 2 ──► 3 ──► 4 ──► 5 ──► 6 ──► 7 ──► 8 ──► 9
│     │     │     │     │     │     │     │     └─ Producto
│     │     │     │     │     │     │     └─ Móvil + widgets + PWA
│     │     │     │     │     │     └─ Rediseño (atleta → entrenador)
│     │     │     │     │     └─ Fluidez y rendimiento
│     │     │     │     └─ Pagos
│     │     │     └─ Periodo temporal
│     │     └─ Cuestionarios
│     └─ Cifras correctas
└─ Limpieza y verdad
```

| # | Bloque | Objetivo | Días |
|---|---|---|---|
| **1** | **Limpieza y verdad** | Roster por una sola puerta · los 5 sitios sin filtro de estado · borrado real (K2) · `FIX_COMPETICIONES_CLUB` + `exercise_indications` · `database/migrations/` + `db:check` (K4) · código muerto fuera (K13) · políticas duplicadas de `training_blocks` | 3-4 |
| **2** | **Cifras correctas** | `weeklySeries` agrupa por `(blockId, week)` · `estimate1RM` unificado (hay 6 copias) · `MaxSource` hasta la interfaz · fuera el `.limit(2)` · **pruebas unitarias**, hoy hay cero sobre 1.500 líneas de cálculo | 5-6 |
| **3** | **Cuestionarios** | K9 completo | 3-4 |
| **4** | **Periodo temporal** | `period.ts` · `PeriodSelector` en la URL · matriz de aplicabilidad · K10 | 6-8 |
| **5** | **Pagos** | K1, K3, K5, K6, K7. Sale en `warn` | 5-6 |
| **6** | **Fluidez** | `useQuery` en las 6 pantallas más vistas · 40 `set-state-in-effect` · 6 `static-components` · canales Realtime con nombre estable · skeletons · optimista al registrar series · eslint a 0 | 5-7 |
| **7** | **Rediseño** | K14 | 8-12 |
| **8** | **Móvil + widgets + PWA** | `100dvh` (33 sitios con `100vh`) · safe-area superior · teclado virtual · `inputMode` · 44px · háptico · `WidgetStack` (K8) · PWA (K11) | 6-8 |
| **9** | **Producto** | Panel de atención completo · estadísticas del atleta · objetivos · preparación de competición | continuo |

**Por qué este orden, en tres frases.** Integridad antes que presentación: no se
rediseña una lista que muestra fantasmas. Las cifras antes que la navegación por
cifras: `weeklySeries` está mal hoy, y montar cuatro niveles temporales encima de
un agregador roto multiplica el error por cuatro. Y rendimiento **antes** que
animaciones: *"todo vuela"* no se consigue animando, se consigue quitando lo que
bloquea el frame — animar sobre 93 pantallas que recargan con `useEffect` produce
lo contrario de lo que se busca.

---

## 3. Método de trabajo

1. **Un commit por paso.** `tsc --noEmit` + `eslint` + `npm run build` limpios
   antes de cada uno.
2. **Todo el SQL de un bloque en UN fichero idempotente**, con bloque de
   verificación al final que imprime qué se aplicó.
3. **Verificación real**, no solo compilación: navegador a 375px para lo visual,
   sonda de PostgREST para lo de base de datos, perfilador de React para lo de
   rendimiento.
4. **Al terminar cada bloque**, una lista corta de qué tiene que probar Marc — no
   un resumen de lo hecho.
5. **Ninguna decisión de producto nueva sin preguntar.** Si aparece una, se añade
   a este documento con fecha antes de escribir código.

---

## 4. Presupuesto de rendimiento

Criterio de aceptación de los bloques 6 y 8, no aspiración:

| Métrica | Objetivo |
|---|---|
| Interacción → primer pintado | < 100 ms |
| Cambio de pestaña con datos en caché | < 16 ms (un frame) |
| Animación más larga de la aplicación | 320 ms (`--dur-slow`) |
| Animaciones que bloquean la entrada | 0 |
| `prefers-reduced-motion` | Todo a 1 ms (ya implementado) |
| Errores de eslint | 0 (hoy: 70) |

---

*Documento vivo. Cualquier cambio a una decisión se escribe AQUÍ primero, con
fecha y motivo, y después en el código.*

---

## 5. Registro de ejecución

Se añade una entrada al cerrar cada bloque. No es un resumen de lo hecho
—eso está en los commits—: es lo que hay que **probar**, y las decisiones
técnicas que se tomaron por el camino y que conviene poder discutir después.

### Bloque 1 — Limpieza y verdad · 21/08/2026 ✅

Commits `4298e7ed` (código muerto, K13) y `ca066bae` (el resto).

SQL ejecutado por Marc: `database/migrations/0001_bloque1_integridad.sql` y
`database/exercise_indications.sql`.

### Bloque 2 — Cifras correctas · 22/08/2026 ✅

Commits `aecab8e6` (1RM), `4fa7c2ef` (agregación semanal y `.limit(2)`),
`cb2f2a63` (`MaxSource`).

**No lleva SQL.** Todo es cálculo del cliente.

**Los tres fallos que se corrigen, en una línea cada uno:**

1. Un 1RM real de 100 kg salía como **103,3 kg** en toda la pantalla de
   estadísticas: se le aplicaba Epley a un dato que ya era el máximo.
2. La semana 1 de enero y la semana 1 de junio **se sumaban en el mismo
   punto** de todas las gráficas, porque `week_number` se reinicia en cada
   bloque.
3. El resumen del bloque avisaba de que los %1RM eran orientativos
   **siempre**, incluso con todos los 1RM del atleta registrados, porque el
   planificador nunca le pasaba los máximos declarados al análisis.

**Qué tiene que probar Marc:**

- [ ] Estadísticas de un atleta con **más de dos bloques**: el eje ya no
      repite semanas y las etiquetas dicen `B1·S3`, `B2·S1`… El tonelaje
      total debería subir respecto a lo que se veía antes, porque antes solo
      contaba dos bloques.
- [ ] La tarjeta "Ejercicios" del resumen dice ahora *"12 semanas · 3
      bloques"* en vez de *"Semanas 1–8"*.
- [ ] Un atleta con un **1RM registrado a una repetición**: la cifra que sale
      en estadísticas tiene que ser exactamente la que levantó.
- [ ] Resumen del bloque en el planificador, con el atleta **con todos sus
      1RM puestos**: el aviso de "porcentajes orientativos" ya no aparece.
      Quitándole el 1RM a un ejercicio, el aviso vuelve **nombrando ese
      ejercicio**.
- [ ] Que el planificador siga yendo igual de rápido al abrir un día: sus
      sparklines siguen pidiendo 2 bloques y no el historial entero.

**Decisiones técnicas tomadas por el camino** (no son de producto; si alguna
no convence, se cambia):

| | Qué se decidió | Por qué |
|---|---|---|
| Pruebas | `node:test` + el `ts-resolver.mjs` que ya existía. **Cero dependencias nuevas** | El repositorio ya había decidido no tener runner de tests y montado el resolvedor para el banco de PWR. Node 24 trae `node:test` estable |
| Etiquetas | `S3` con un bloque, `B2·S3` con varios | Un eje que diga "S1 S2 S1 S2" no se puede leer. El nombre real del bloque no cabe en un eje y viaja aparte para el tooltip |
| Resumen | `firstWeek`/`lastWeek` → `weeksTracked`/`blocksTracked` | Eran el mínimo y el máximo de `week_number`: decían "Semanas 1–8" para alguien con dos años de entrenamiento |
| `.limit(2)` | Fuera el de las estadísticas. **Se quedan** los de `getLastSessionSetsForExercises` y `getAttachableSets` | Aquellos dos no recortan lo que el usuario lee: acotan una consulta cuyo resultado se descarta casi entero. Quitarlos de verdad pide un `DISTINCT ON` en el servidor — bloque 6 |

**Deuda que queda apuntada:** `estimate1RM` por VELOCIDAD sigue teniendo tres
implementaciones (`utils/vbtCalculator.ts`, `lib/cv/pwrMath.ts`,
`lib/vbt/analysis.ts`). **No se unifican con la de repeticiones** —son otro
modelo físico— pero entre ellas sí se solapan, y eso está sin revisar.
