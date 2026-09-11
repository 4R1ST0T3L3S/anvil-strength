# ANVIL STRENGTH — Auditoría, consolidación y plan de implementación

**Fecha de la auditoría:** 11 de septiembre de 2026
**Rama auditada:** `overhaul/ux-2026-08` (262e3f61, avanzada por *fast-forward* a `origin/main` bdf03c0b)
**Base de datos auditada:** Supabase `ihcyuoczbmjxfinxvzra` (producción, PostgreSQL 17, eu-central-1) — consultada en directo, no desde los `.sql` del repositorio.

> Este documento tiene dos partes. La **A** es la auditoría y el plan, escritos
> ANTES de tocar código. La **B** (al final) es el registro de lo que se hizo, y
> se rellena al terminar.

---

# PARTE A — AUDITORÍA Y PLAN

## 0. Resumen ejecutivo

- El producto es amplio y funciona: programación por bloques, registro de
  series sin conexión, estadísticas, VBT/PWR con visión artificial, nutrición,
  cuestionarios, competiciones, pagos manuales, roles múltiples, PDF, PWA,
  modo claro/oscuro e i18n parcial.
- **El chat existe pero está a medio hacer y es inseguro.** Solo texto; el botón
  de imagen no hace nada; el atleta no tiene ninguna entrada al chat en la
  navegación (solo se llega desde la pantalla de pago bloqueado); el indicador
  "En línea" es falso; y la RLS de `chat_messages` permite **escribir a cualquier
  usuario** (atleta↔atleta incluido) y permite al receptor **reescribir el
  contenido y el remitente** de los mensajes que recibe.
- **Las notificaciones push están rotas de extremo a extremo:** la función
  `send-push` no está desplegada, el disparador no envía el secreto que la
  función exige y no hay ninguna suscripción guardada. Además hay dos sistemas
  de avisos conviviendo (`notifications` vivo, `app_notifications` muerto) y el
  disparador de marcas personales **manda cada PR a todos los atletas de la
  plataforma** (614 de los 723 avisos guardados).
- **No existe revisión de entrenamientos.** El entrenador puede leer lo que hizo
  el atleta (pestaña Registro), pero no hay estado "pendiente/revisado", ni
  feedback que le llegue al atleta, ni bandeja.
- El sistema de diseño tiene buenos cimientos (tokens OKLCH, dos temas medidos
  en contraste, primitivas con foco y estados), pero el lenguaje visual —
  mayúsculas, peso 900, cursivas, tracking ancho, iconos de marca de agua — es
  el de una app de gimnasio, no el minimalismo premium que se pide.
- El código está **copiado en cinco sitios** (raíz + cuatro copias por producto),
  y lo que se despliega en anvilstrength.es sale de `Landing Page/`, no de la
  raíz. Todo cambio tiene que propagarse.

---

## 1. Arquitectura actual

### 1.1 Stack

| Capa | Tecnología |
|---|---|
| UI | React 19.2, TypeScript 5.9, Vite 7.3 |
| Estilos | Tailwind 3.4 sobre tokens OKLCH propios (`src/styles/tokens.css`) |
| Movimiento | framer-motion 12 con `LazyMotion`/`domMax` + keyframes CSS propios |
| Estado de servidor | TanStack Query 5 |
| Rutas | react-router-dom 7 |
| Backend | Supabase (Postgres 17, Auth, Storage, Realtime, Edge Functions Deno, pg_cron, pg_net, Vault) |
| Gráficas | recharts 3 |
| PDF | jspdf, html2canvas, pdfjs-dist, react-pdf |
| Visión artificial | @techstark/opencv-js (PWR, en un Worker) |
| PWA | vite-plugin-pwa (`registerType: 'prompt'`, `push-sw.js` por `importScripts`) |
| Móvil nativo | Capacitor 8 (Android) · Electron (Windows) |
| Hosting | Vercel (+ función serverless `api/aep.ts`) |
| Tests | `node:test` (507 pruebas unitarias en `src/**/*.test.ts`) · Playwright (e2e, requieren credenciales) |

### 1.2 Estructura del repositorio y mapa de despliegue

```
src/                 app completa (el ancestro común de las copias)
database/            ~90 .sql sueltos, se ejecutan A MANO en el editor de Supabase
supabase/functions/  athletes, send-push (Edge Functions)
scripts/             db-check, sonda-rls, propagar (copias), verify (PWR)
docs/                planes y decisiones anteriores
Landing Page/        COPIA completa → anvilstrength.es  (vercel.json raíz)
APP Iphone/          COPIA completa → proyecto Vercel aparte (webapp iPhone)
APP Android/         COPIA completa → APK con Capacitor (build local)
APP Windows/         COPIA completa → Electron (build local)
```

Divergencia **real** de cada copia respecto a `src/` (ignorando CRLF/LF):
Landing Page **12** ficheros · APP Iphone **43** · APP Android **76** · APP Windows **167**.
`scripts/propagar.mjs` propaga cambios de la raíz y se niega a pisar una copia
que haya divergido por su cuenta.

### 1.3 Frontend

- **Rutas** (`src/routes/AppRoutes.tsx`): portada `/` y `/web`, legales,
  `/competiciones`, `/invitacion/:code`, `/reclamar/:token`, `/auth/callback`,
  panel del atleta `/dashboard/:view?`, panel de gestión
  `/coach-dashboard/:view?` y `/coach-dashboard/atletas/:athleteId`,
  `/nutrition`, `/admin`, `/dashboard/chat`, `/dashboard/community` (Arena),
  `/dashboard/games`, y bancos de pruebas `/dev/*` solo en desarrollo.
- **Armazón:** `DashboardLayout` (cabecera de escritorio + barra inferior
  flotante en móvil, 5 pestañas como máximo, resto en el menú ⋮). No hay barra
  lateral de escritorio pese a lo que dicen varios comentarios.
- **Vistas del atleta:** Inicio, Entrenar (`WorkoutLogger`), Estadísticas,
  Nutrición, Competiciones, Perfil, VBT, Calendario AEP, Ranking, Tienda (apagada).
- **Vistas del entrenador:** Inicio, Atletas (lista/calendario), ficha del
  atleta (Programación con `WorkoutBuilder`, Estadísticas con Registro/VBT/
  Check-ins/Volumen, Competición, Datos, Nutrición), Dietas, Agenda, Calendario,
  Análisis PWR, Preferencias, Perfil, Documento PDF.
- **Estado:** TanStack Query en las pantallas migradas; cola de escritura
  resistente (`src/lib/offlineQueue.ts`) para el registro de series.
- **Sistema de diseño existente:** tokens (4 superficies, 4 tintas, rampa de
  marca con `--brand`/`--brand-text` separados por contraste, semánticos,
  esfuerzo), tema claro por `data-theme="light"`, radios 4/8/12/16, sombras,
  capas, movimiento (90/150/220/320 ms, curva out-quint), primitivas en
  `src/components/ui/` (Button, Modal con hoja inferior en móvil, Panel, Card,
  Field, Tabs, EmptyState, EstadoDeDatos, Skeleton, AnchoredMenu, IconButton,
  StatTile, DataTable, SaveIndicator…). Tipografía: Plus Jakarta Sans 500 y
  Anton solo en la portada.

### 1.4 Backend / Supabase (estado real sondeado)

**Tablas principales (filas):** profiles 45 · coach_athletes 19 (17 activas) ·
training_blocks 17 · training_weeks 21 · training_sessions 152 ·
session_exercises 472 · training_sets 819 · notifications 723 ·
chat_messages 19 · messages 2 (chat muerto) · app_notifications 0 (muerto) ·
competitions 16 · form_templates 2 · form_responses 32 · nutrition_plans 4 ·
food_items 115.975 · exercise_library 208 · metric_definitions 43 · vbt_* ·
athlete_payments 3 · role_capabilities 13 · season_phases 4 · push_subscriptions 0.

**Modelo de entrenamiento:** `training_blocks` → `training_sessions`
(`completed_at`, `athlete_notes`) → `session_exercises` → `training_sets`
(`target_*` = lo pautado por el coach, protegido por `protect_target_fields()`;
`actual_*`, `is_completed`, `notes`, `video_url`, `vbt_*` = lo que registra el
atleta). 15 sesiones cerradas con "Terminar entrenamiento"; 409 series
marcadas: los atletas registran series pero casi nunca cierran el día.

**Funciones SECURITY DEFINER clave:** `manages_athlete`, `shares_coaching_link`,
`sesion_es_de_mi_bloque_como_{atleta,coach}`, `set_es_de_mi_bloque_como_*`,
`week_is_released`, `expand_grouped_set`, `protect_target_fields`, `notify_*`,
`remind_*`, `handle_pr_update`.

**Storage:** `avatars` (público; la política de subida no exige sesión),
`vbt_files` (público en lectura; cualquier usuario autenticado sube),
`profiles` (público en lectura, escritura por propietario). **No hay bucket de chat.**

**Realtime (`supabase_realtime`):** notifications, user_points,
chat_messages, app_notifications, messages, announcements.

**pg_cron:** `remind-competitions` (diario 9:00) y `remind-weekly-checkin`
(domingo 18:00). **pg_net** y **Vault** instalados.

**Edge Functions desplegadas:** `athletes` (v7, la buena), `hyper-api` (copia
ANTIGUA de `athletes` con permisos de servicio y sin ninguna referencia en el
código), `swift-service` (el "hola mundo" de ejemplo). **`send-push` NO está
desplegada.**

### 1.5 Autenticación, roles y permisos

- Supabase Auth (email/contraseña, Google, enlaces mágicos; cuentas LATENTES
  para atletas gestionados reclamadas por enlace).
- Roles como conjunto (`profiles.roles`), capacidades en `src/lib/roles.ts`
  (`puede()`), configurables por desarrollador (`role_capabilities`).
- RLS en todas las tablas; relaciones coach↔atleta con estado en
  `coach_athletes` (`active`/`ended`, `relation`, `billing_mode`).

---

## 2. Funcionalidades actuales (inventario que NO se puede perder)

**Atleta:** inicio con "Hoy" (entreno + macros del día), check-in diario y
semanal, registro de sesión con cola sin conexión, series agrupadas 4×8,
superseries, técnicas (dropset, cluster…), cardio, temporizador de descanso,
referencia de la última sesión, vídeo del ejercicio, cierre del día con notas y
recomendación de check-in, navegación entre bloques y semanas, estadísticas
(fases, e1RM, competición), VBT (manual, CSV de encoder, PWR por vídeo),
nutrición (plan, macros flotantes), competiciones y resultados, calendario AEP,
ranking, Arena, juegos, perfil y datos personales, preferencias (unidad, primer
día), puerta de pago (aviso/bloqueo), PWA instalable, idioma ES/EN parcial, tema.

**Entrenador:** equipo con filtros (sin entrenar, flojos, sin plan,
archivados), alta de atletas gestionados, invitaciones y enlaces de acceso,
archivar/terminar/borrar, calendario de equipo, ficha con pestañas,
**constructor de bloques** (semanas × días, plantillas de día, copiar
día/semana, progresiones multi-día, notas de semana, objetivos de volumen,
comparación semanal, planificador de frecuencia, apéndices, vista previa del
atleta, PDF), registro de ejecución con desviaciones y carga aguda/crónica,
edición de lo registrado, VBT, check-ins editables, volumen por músculo, fases
de temporada, objetivos por movimiento, competiciones y resultados, pagos
manuales, notas privadas, dietas del equipo, agenda, calendario AEP, análisis
PWR con calibración, preferencias (colores por sección, intensidad,
programación, pago), permisos por rol (developer), documento PDF con marca,
chat flotante con un atleta.

**Nutricionista / admin:** panel de nutrición completo, panel de administración.

---

## 3. Problemas encontrados

### 3.1 Seguridad (reales, verificados en producción)

| # | Problema | Consecuencia |
|---|---|---|
| S1 | `chat_messages` INSERT solo comprueba `sender_id = auth.uid()` | Cualquier usuario puede escribir a cualquier otro: **atleta↔atleta**, o a entrenadores ajenos |
| S2 | `chat_messages` UPDATE del receptor sin restricción de columnas | El receptor puede **cambiar el texto o el remitente** de un mensaje recibido |
| S3 | `anon` tiene todos los privilegios de tabla en `chat_messages`, `training_sessions`, `training_sets` | Hoy lo frena la RLS, pero es una red de seguridad de una sola capa |
| S4 | `send-push` sin desplegar y el disparador `notify_push()` sin cabecera secreta | Cada aviso hace un POST inútil a una función inexistente; ningún push llega |
| S5 | `handle_pr_update()` inserta un aviso para TODOS los atletas de la plataforma | Se filtra la marca de un atleta a equipos ajenos; 614 avisos de ruido |
| S6 | `hyper-api` (copia vieja de `athletes`) sigue desplegada con permisos de servicio | Superficie de ataque sin mantenimiento |
| S7 | Bucket `avatars`: subida sin exigir sesión; `vbt_files`: lectura pública | Abuso de almacenamiento; ficheros de encoder legibles con la URL |
| S8 | Asesor de Supabase: 2 vistas SECURITY DEFINER, 13 funciones sin `search_path`, protección de contraseñas filtradas desactivada | Deuda de endurecimiento |
| S9 | CoachChatManager tiene un modo "ver todos los atletas" (trastienda) | Chatear con atletas que no son tuyos, contra la regla pedida |

### 3.2 Datos y funcionalidad

- `training_sessions`: la política `athlete_completes_own_session` deja al atleta
  actualizar CUALQUIER columna de su sesión (no solo el cierre y las notas).
- `database/migrations/0002_chat_messages.sql` **no está aplicada** (faltan sus
  índices y `chat_roster()`): el listado de chats descarga todos los mensajes.
- Dos sistemas de avisos: `notifications` (vivo) y `app_notifications` +
  `NotificationsPopover` + `hooks/useNotifications.ts` (muertos, sin montar).
- Tres canales de tiempo real independientes por usuario para avisos y chat
  (`NotificationProvider`, `NotificationBell`, `useChat`), cada uno con su propia
  suscripción.
- El estado ✓✓ del chat es un "leído" — justo lo que ahora NO se quiere.
- No hay ajustes de notificaciones más allá del botón push dentro de la campana.
- La tabla `messages` (chat viejo, 2 filas) y `announcements` siguen vivas en BD.

### 3.3 UX

- Chat inalcanzable para el atleta; experiencia a pantalla completa sin lista de
  conversaciones; sin fechas agrupadas, sin estados de envío, sin reintentos,
  sin multimedia.
- Nada le dice al entrenador "tienes N entrenamientos por revisar", ni al atleta
  "tu entrenador te ha dejado un comentario".
- Lenguaje visual ruidoso: mayúsculas y peso 900 en casi todo, cursivas,
  tracking de 0,3em, iconos gigantes de marca de agua, tres acentos de color por
  área, radios de 24-48px sueltos en pantallas no migradas.
- `DESIGN.md` dice "tema oscuro únicamente" cuando el claro existe desde F7.
- F5 del plan anterior quedó parcial (8 componentes del entrenador sin rama de
  error, barrido por pantallas pendiente); F8 (i18n) solo cubre el armazón del
  atleta.

### 3.4 Rendimiento

- Chunks grandes: `CartesianChart` 825 KB, `web-*` 672 KB, `CoachDashboard`
  556 KB, `liftSummary` 498 KB, `pdfTemplateScan` 410 KB.
- `CoachChatManager` y la campana repiten consultas en cada montaje.

### 3.5 Deuda del repositorio

- Ficheros basura versionados en la raíz: `build_output.log`,
  `eslint_report.json` (404 KB), `git_log.txt`, `git_status*.txt`,
  `lint_errors.*`, `lint_output.txt`, `ts_errors.log`, `test-vbt-query.ts`,
  `fix_banner.cjs`, `refactor_icons.cjs`, `aep_calendario.html`, `aep_index.html`.
- Cinco copias del código (ver 1.2).

---

## 4. Implementaciones antiguas recuperables

| Pieza | Dónde | Qué aporta | Decisión |
|---|---|---|---|
| `chatMediaService.ts` (321 líneas) | borrado en `4298e7ed` (K13) | compresión de imagen en canvas, póster de vídeo, **grabadora de notas de voz Opus**, subida a bucket privado con carpeta por pareja ordenada, firma de URLs en bloque | **Se recupera y se amplía** (vídeo, recorte, documentos, caducidad) |
| `chat_media.sql` | `database/` | bucket privado `chat-media`, convenio de rutas `{a}__{b}/`, `can_access_chat_folder()` | **Se recupera** adaptado a `chat_messages` (estaba escrito contra la tabla muerta) |
| `ChatView.tsx` (427) | borrado en `4298e7ed` | separadores por día, lista de contactos, anuncios | Se aprovechan las ideas (separadores, lista); el código apuntaba a `messages` |
| `chatService.ts` (165) | borrado en `4298e7ed` | CRUD sobre `messages` | No se recupera (tabla muerta) |
| `useChat.ts` | vivo | conversación por ventanas con caché y tiempo real | **Se conserva** como base del hilo |
| `VideoTrimmer.tsx` | PWR (`coach/components/pwr`) | recortador con tiradores, fotogramas y botones "Inicio/Fin aquí" | **Se reutiliza su lógica** para el recorte de vídeo del chat |
| `send-push` + `push-sw.js` + `usePushNotifications` | vivos | web push con `web-push` y cifrado correcto, secreto compartido | **Se repara y se despliega** |
| `0002_chat_messages.sql` | sin aplicar | índices de conversación y `chat_roster()` | **Se integra** en la migración nueva |
| Worktree `claude/vibrant-villani-347e76` | cambios SIN commit | zona segura inferior en 7 modales (AuthModal, TeamModal…) | **Se porta** a `main` antes de borrar la rama |

---

## 5. Análisis Git

| Rama | Estado | Contenido propio | Decisión |
|---|---|---|---|
| `overhaul/ux-2026-08` (actual) | 262e3f61 | todo el trabajo | **Base de `main`** |
| `origin/main` | bdf03c0b | 2 commits de hoy (portada EN, borrar la semana correcta, editor de día emergente, `InicioPanel`) | *Fast-forward*: HEAD es ancestro directo, cero conflictos |
| `origin/fix/cambios-web-2026-09-10` | 94b906b0 | contenido ya dentro de `origin/main` | Borrar |
| `main` (local) | 262e3f61 | nada propio | Adelantar a bdf03c0b |
| `feat/portada-paneles-estadisticas-pdf` (local) | fusionada | nada | Borrar (en remoto ya no existe) |
| `claude/vibrant-villani-347e76` (worktree) | d7e1a42f + 7 cambios sin commit | 7 ajustes de safe-area | Portar los ajustes, retirar el worktree, borrar |

Resultado buscado: **una sola rama, `main`**, en local y en `origin`.

---

## 6. Decisiones de arquitectura para lo nuevo

### 6.1 Revisión de entrenamientos (bandeja del entrenador)

**Cuándo entra un entrenamiento:** cuando el atleta lo **cierra**
(`training_sessions.completed_at`). Lo programado sin cerrar no entra.

**Modelo, en la base de datos (no en la interfaz):**

- `training_sessions` gana `athlete_updated_at`, `reviewed_at`, `reviewed_by`
  y dos columnas **generadas**:
  - `review_pending = completed_at IS NOT NULL AND (reviewed_at IS NULL OR athlete_updated_at > reviewed_at)`
  - `modified_after_review = reviewed_at IS NOT NULL AND athlete_updated_at > reviewed_at`
- **Disparadores** que solo reaccionan cuando quien escribe ES el atleta del
  bloque (`auth.uid()`): cualquier cambio real (`IS DISTINCT FROM`) en el cierre,
  las notas del día o en `actual_*`/`is_completed`/`notes`/`video_url`/`vbt_*`
  de sus series sube `athlete_updated_at`. Un cambio del entrenador no reabre.
- Los campos de revisión **no se pueden escribir a mano**: solo por las
  funciones `review_session()` / `unreview_session()` (SECURITY DEFINER, puerta
  de servicio local a la transacción, el mismo patrón que `expand_grouped_set`).
- `training_session_reviews`: **historial** de cada revisión con una **foto**
  (JSONB) de lo registrado en ese momento. Si el atleta modifica después, la
  interfaz enseña exactamente qué cambió ("Sentadilla, serie 3: 180 → 185 kg").
  No se duplica la sesión: vuelve a estar pendiente la misma fila.
- `coach_inbox_summary()` devuelve una fila por atleta: pendientes, modificados
  tras revisión, último entrenamiento.
- Abrir un entrenamiento **no** marca nada. Solo el check.
- Migración de datos existentes: las sesiones cerradas en los últimos 14 días
  entran como pendientes; las anteriores quedan archivadas como "anteriores a la
  bandeja" (`reviewed_by` nulo), sin inventar quién las revisó.

### 6.2 Bandeja del atleta

Tabla nueva `inbox_items` pensada para crecer: `recipient_id`, `sender_id`,
`kind` (`training_feedback`, `training_reviewed`, `coach_note`, `system`),
`session_id`, `title`, `body`, `payload` JSONB, `read_at`, `archived_at`.
El feedback de una sesión ES un `inbox_item` enlazado a ella (una sola fuente de
verdad para la vista del entrenador, la del atleta y la bandeja). Revisar sin
comentario deja un aviso ligero "revisado"; revisar con comentario deja uno solo
con el comentario.

### 6.3 Chat

- Se queda `chat_messages` (K12). Columnas nuevas: `client_id` (idempotencia y
  deduplicado del envío optimista), `delivered_at`, `attachment` JSONB,
  `media_expires_at`, `media_deleted_at`; tipos `text|image|video|audio|file`.
- RLS reescrita: leer = participante; escribir = remitente **con relación
  activa** coach↔atleta (`chat_can_message()`); el receptor solo puede tocar
  `delivered_at` e `is_read` (privilegios por columna). Adiós S1, S2, S3, S9.
- **Estados visibles: Enviado (✓) y Entregado (✓✓). Sin "leído".** Entregado =
  el mensaje ha llegado a un dispositivo del destinatario (con la app abierta,
  al abrirla, o al recibir el push). `is_read` sigue existiendo solo para el
  contador de no leídos del propio destinatario; nunca se enseña al remitente.
- Tiempo real con UN canal por usuario (INSERT recibidos + UPDATE de entregas
  de los enviados), reconexión con relleno de huecos, orden estable
  (`created_at`, `id`) y deduplicado por `id`/`client_id`.

### 6.4 Multimedia

Sin dependencias nuevas (decisión U3 del 23/08, se mantiene):

| Tipo | Proceso en el navegador ANTES de subir | Resultado |
|---|---|---|
| Foto | canvas, lado mayor 2048 px, WebP/JPEG ≈ 0,8 | ~200-500 KB, legible |
| Vídeo | recorte ≤ 2 min → re-codificación canvas + MediaRecorder a **720p, 30 fps, ~1,8 Mbit/s** vídeo + 96 kbit/s audio, MP4/H.264 si el navegador lo admite (WebM de respaldo) | 30 s ≈ 7 MB; 2 min ≈ 28 MB |
| Audio | MediaRecorder, AAC/Opus a 32 kbit/s | 1 min ≈ 240 KB |
| Archivo | PDF, Office, texto, CSV… hasta 20 MB | tal cual |

Solo se sube el comprimido: nunca original + comprimido. Bucket **privado**
`chat-media`, ruta `{idMenor}__{idMayor}/{uuid}.{ext}`, URLs firmadas de 1 h.

### 6.5 Retención

Fotos y vídeos del chat: **15 días**. Una Edge Function `chat-media-cleanup`
(clave de servicio) la llama **pg_cron cada hora** por pg_net; borra por la API
de Storage (el SQL directo sobre `storage.objects` está bloqueado por Supabase),
marca `media_deleted_at` y limpia también subidas huérfanas de más de 24 h. El
mensaje sigue existiendo y se pinta "Vídeo eliminado por antigüedad". Audio y
documentos se conservan (coste trivial; la política vive en una constante).

### 6.6 Notificaciones

- `notifications` gana `category`; tabla nueva `notification_preferences`
  (por usuario: mensajes, feedback, bandeja, entrenamiento, competiciones, club,
  sistema). Un disparador descarta en el servidor lo que el usuario ha apagado.
- Push reparado: `send-push` desplegada; claves VAPID **generadas en el
  servidor** y guardadas en Vault (la pública se sirve por RPC, así que no
  depende de variables de entorno de Vercel); secreto del disparador generado
  dentro de la base. Ningún secreto pasa por el navegador ni por este documento.
- Push de mensajes de chat directamente desde `chat_messages` (sin llenar la
  campana de mensajes). El service worker no duplica: si la app está enfocada,
  el aviso lo da la app.
- Ajustes → Notificaciones, para los dos roles, con el estado real del permiso
  del navegador.

### 6.7 Diseño

Un sistema nuevo sobre los tokens existentes (misma arquitectura, valores y
reglas nuevos): negro/blanco/grises + rojo Anvil como acento; tipografía del
sistema en Apple (SF) e Inter en el resto; escala tipográfica tipo HIG en
minúsculas (fuera mayúsculas y cursivas); radios continuos más amplios; sombras
casi imperceptibles; materiales translúcidos sutiles en barras; listas agrupadas
tipo iOS; barra lateral en escritorio y barra de pestañas en móvil. La portada
conserva su propio registro y queda fuera.

### 6.8 Dónde se escribe

Se trabaja en `src/`, `database/` y `supabase/` de la raíz y se propaga con
`scripts/propagar.mjs` a `Landing Page/` (lo que sirve anvilstrength.es) y a
`APP Iphone/`. Android y Windows se propagan donde no han divergido; lo que no se
pueda propagar sin pisar trabajo propio se deja documentado.

---

## 7. Plan de implementación por fases

El orden es el pedido, con un ajuste deliberado: **el backend de las funciones
nuevas va antes que el sistema de diseño, y sus pantallas van después**, para que
la bandeja y el chat nazcan ya con el diseño nuevo en vez de rehacerse (el mismo
criterio que la decisión U1 del 23/08).

1. **Consolidación Git** — *fast-forward*, portar el worktree, `main` única.
2. **Bandejas de entrada (datos)** — migración de revisión + `inbox_items` + RPC + servicios.
3. **Chat (datos)** — migración de `chat_messages`, RLS, entregas, listado.
4. **Multimedia** — compresión, recorte, subida, bucket, URLs firmadas.
5. **Notificaciones** — categorías, preferencias, push reparado, retención con cron.
6. **Design System** — tokens, tipografía, primitivas, armazón (barra lateral / pestañas).
7. **Rediseño global** — bandejas y chat nuevos; inicio de coach y atleta; atletas y ficha; entrenamiento; constructor y planificador; estadísticas; nutrición; cuestionarios; competiciones; ajustes; estados vacíos/carga/error.
8. **Responsive** — iPhone primero: safe areas, teclado, hojas inferiores, tamaños táctiles.
9. **Testing** — unitarios nuevos (bandeja, chat, compresión), tsc, build, sondas RLS, pruebas en navegador.
10. **Revisión final** — QA de regresiones, propagación a copias, informe.

---

## 8. Riesgos

| Riesgo | Mitigación |
|---|---|
| Hay UNA base de datos y es la de producción | Migraciones aditivas, idempotentes, en transacción y con verificación; nada se borra |
| Disparadores nuevos sobre `training_sets` (el registro de series) | SECURITY DEFINER + índices existentes; solo actúan con cambios reales; probados con el caso de 4×8 |
| Endurecer la RLS del chat puede cortar conversaciones de relaciones terminadas | Es lo pedido: se puede LEER el historial, no escribir |
| Claves VAPID nuevas | 0 suscripciones hoy: no se invalida nada |
| Copias por producto | `propagar.mjs` + diff manual donde hayan divergido |
| Cambio visual grande para usuarios reales | Mismo contenido y rutas; sin cambios de datos por el diseño |
| Re-codificar vídeo en el navegador (iOS Safari, pestaña en segundo plano) | Detección de capacidades, progreso visible, respaldo a subir sin re-codificar si pesa menos del límite |
| Plan de Supabase (Free/Pro) desconocido: cuota de Storage | Caducidad de 15 días + compresión: el volumen se queda plano |
| El push a `main` despliega en producción | Build, tsc y pruebas antes de cada push |

---

# PARTE B — REGISTRO DE EJECUCIÓN

Cerrado el 11 de septiembre de 2026. Commits en `main` (única rama, local y
remota): `b42857d4` (auditoría) · `d499e9cd` (limpieza y worktree) ·
`703d0382` (bandeja, chat, avisos, diseño) · `a85c77af` (copias por producto).

## B.1 Qué se ha hecho, por fase

| Fase | Estado | Resumen |
|---|---|---|
| 1–2 Auditoría y plan | ✅ | Parte A de este documento. Estado real de la base sondeado por SQL, no por los `.sql` del repo. |
| 3 Git | ✅ | `overhaul/ux-2026-08` fusionada y borrada (local y remota). Solo queda `main`. |
| 4 Chat antiguo | ✅ | Recuperado del historial (guardado aparte), estudiado y sustituido: la nueva implementación conserva sus decisiones útiles (`chat_messages`, canal por usuario) y retira `ChatComponents`, `CoachChatManager`, `AthleteChatView`, `NotificationsPopover`, `useNotifications`, `AnvilToast`. |
| 5 Bandeja del entrenador | ✅ | `database/BANDEJA_REVISION_2026-09-11.sql` (aplicada). `training_sessions.athlete_updated_at / reviewed_at / reviewed_by` + generadas `review_pending` y `modified_after_review`; disparadores que solo dejan tocar esos campos a las funciones de servicio; `training_session_reviews` (snapshot, `was_modified`, `undone_at`); `inbox_items` para el atleta; RPCs `coach_inbox_summary`, `review_session`, `unreview_session`, `send_session_feedback`, `delete_session_feedback`, `inbox_set_state`, `inbox_mark_all_read`. UI: `features/inbox` (`CoachInbox`, `CoachInboxAthlete`, `SessionReviewCard`, `AthleteInbox`), rutas `/coach-dashboard/bandeja[/:atleta]` y `/dashboard/bandeja`, contadores en la barra y en el inicio. Marcar revisado es SOLO manual. |
| 5b Bandeja del atleta | ✅ | Feedback y «revisado» llegan a `inbox_items`; el atleta lo ve en su bandeja y en la propia sesión (`SessionFinish`: pendiente / revisado / modificado tras revisión + hilo de feedback). |
| 6 Modificación tras revisión | ✅ | Cualquier cambio del ATLETA (cierre, notas, series, vídeo, VBT) mueve `athlete_updated_at` → vuelve a pendiente y `modified_after_review = true`; la tarjeta enseña qué cambió respecto al snapshot; sin duplicados, con historial; los cambios del entrenador no cuentan. Probado en producción dentro de una transacción deshecha (ver B.4). |
| 7 Chat | ✅ | `database/CHAT_MENSAJERIA_2026-09-11.sql` (aplicada): `client_id` (idempotencia), `delivered_at`, `attachment`, `media_expires_at`, RLS entrenador↔atleta propio (`chat_can_message`), bucket privado `chat-media` con políticas por carpeta, RPCs `chat_ack_delivered`, `chat_mark_read`, `chat_conversations`. Cliente: `features/chat` (lista, hilo, burbujas con ✓/✓✓, compositor con foto/vídeo/archivo/voz, preparador con recorte a 2 min y recodificación 720p/30 fps, subida con progreso), tiempo real con reconexión y refresco al volver, `FloatingChat` sobre el mismo hilo. Estados solo «Enviado» y «Entregado». |
| 7b Retención 15 días | ✅ | `chat_media_expired` + `chat-media-cleanup` (Edge Function, cron `17 * * * *`): borra el objeto y deja `media_deleted_at`; la burbuja pinta «Vídeo eliminado por antigüedad». |
| 7c Avisos | ✅ | `database/NOTIFICACIONES_2026-09-11.sql` (aplicada): categorías, `notification_preferences` filtrado EN EL SERVIDOR, VAPID en Vault (`get_vapid_public_key`), `send-push` y `chat-ack` (Edge Functions), acuse de entrega desde `push-sw.js`. Pantalla Ajustes → Avisos (`NotificationSettings`) en los dos paneles; campana rehecha. |
| 8–11 Diseño | ✅ | `tokens.css` con tema oscuro y claro, `tailwind.config.js` con los tokens nuevos, primitivas nuevas (`List`, `Switch`, `SegmentedControl`, `Badge`, `Avatar`, `PageHeader`, `IconButton`) y las existentes rehechas; `DashboardLayout` (barra lateral 248 px / barra de pestañas 4 + «Más» con zona segura); inicios rehechos; codemod `scripts/codemod-diseno-2026-09.mjs` que retiró la tipografía gritada y los colores sin tema en 178 ficheros. `DESIGN.md` reescrito. Portada intacta (`.registro-marca`). |
| 12–13 Pruebas y cierre | ✅ | Ver B.4. |

## B.2 Ficheros

- **Base de datos** (`database/`): `BANDEJA_REVISION_2026-09-11.sql`, `CHAT_MENSAJERIA_2026-09-11.sql`, `NOTIFICACIONES_2026-09-11.sql`. Las tres APLICADAS en `ihcyuoczbmjxfinxvzra`. Aditivas: no borran datos ni columnas.
- **Edge Functions** (`supabase/functions/`): `send-push`, `chat-ack`, `chat-media-cleanup`. DESPLEGADAS.
- **Servicios**: `reviewService`, `inboxService`, `chatService`, `chatMediaService`, `notificationPrefsService`; `notificationsService` con `category`.
- **Lib**: `lib/media/{limites,imagen,video,audio}.ts`, `lib/tiempo.ts`, `lib/realtimeCompartido.ts`, `lib/queryKeys.ts` (claves `bandeja`, `chat`, `avisos`).
- **UI**: `features/inbox/**`, `features/chat/**` (rehecho), `components/ui/{NotificationBell,NotificationProvider,ErrorFallback}` rehechos, `features/profile/components/NotificationSettings.tsx`, `components/layout/{DashboardLayout,InicioPanel,PageHeader,RegistroMarca}`, `CoachHome`, `AthleteHome`, `CoachDashboard`, `UserDashboard`, `AppRoutes`, `SessionFinish`, `WorkoutLogger`, `usePushNotifications`, `public/push-sw.js`, `index.html`, `src/index.css`, `src/styles/tokens.css`, `tailwind.config.js`.
- **Copias por producto**: `Landing Page/` (anvilstrength.es, construye), `APP Iphone/` (tsc limpio) y `APP Android/` (tsc limpio salvo los tipos de `@capacitor/*`, que no están en el `node_modules` compartido) sincronizadas. **`APP Windows/` sin tocar** (118 divergencias propias de Electron): pendiente de fusión a mano.

## B.3 Pruebas

- `npm test`: **547** pruebas, 0 fallos (28 nuevas de `lib/media/limites`, 12 de `lib/tiempo`).
- `tsc --noEmit`: limpio en raíz, Landing Page y APP Iphone.
- `eslint`: 0 errores en `src/` (quedan avisos `react-refresh` preexistentes).
- `npm run build`: raíz 21 s; Landing Page 24 s.
- `node scripts/sonda-rls.mjs`: ninguna tabla sensible se lee sin sesión.
- Flujo de revisión, en producción dentro de una transacción deshecha (RLS activa, `SET LOCAL ROLE authenticated`): cierra el atleta → pendiente + aviso al coach ✓ · el atleta no puede auto-revisar ✓ · el coach revisa con feedback → deja de estar pendiente, snapshot, bandeja del atleta ✓ · el atleta edita una serie → pendiente y modificado ✓ · el coach re-revisa y toca una serie → no vuelve a pendiente, 2 revisiones, 1 marcada como modificada ✓ · deshacer → pendiente otra vez ✓ · `reviewed_at` a mano desde el cliente → el disparador lo revierte ✓.
- Advisors de seguridad de Supabase: sin hallazgos nuevos de nivel error; las funciones nuevas son `SECURITY DEFINER` con comprobación de `auth.uid()` dentro (intencionado).

## B.4 Lo que queda y cómo seguir

1. **APP Windows**: fusionar a mano (mismo procedimiento que iPhone/Android: sincronizar lo que va por detrás, conservar lo de Electron, copiar `features/landing/textos.ts`).
2. **Verificación visual con sesión**: las pantallas con datos reales (bandeja, chat con adjuntos, ajustes de avisos) se han comprobado por tipos, pruebas y SQL; falta una pasada con cuenta de entrenador y de atleta en móvil real (iPhone: cámara/galería, teclado sobre el compositor, notas de voz en Safari).
3. **Push en iOS**: exige la app instalada en pantalla de inicio (iOS ≥ 16.4); la pantalla de Avisos lo explica cuando el navegador no lo admite.
4. **Codec de vídeo**: se prefiere MP4/H.264 si el navegador lo graba; si no, WebM. Un iPhone recibiendo WebM de un Android lo reproduce en Safari ≥ 17; en versiones anteriores se ofrece la descarga.
5. **`/dev/inicio`** existe solo en la copia Landing (banco del inicio); portarlo a la raíz si se quiere medir ahí.
