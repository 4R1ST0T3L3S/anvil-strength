# Anvil Strength — Sistema de diseño

Registro: **producto**. El diseño sirve a la tarea, no es el producto. La
referencia no es una landing bonita: es que un atleta entre a mitad de serie,
encuentre lo que busca y salga, y que un coach revise diez entrenamientos y
conteste por chat sin pelearse con la interfaz.

Principios (septiembre de 2026):

- **Minimalista y silencioso.** Blanco, negro y grises; el rojo de marca es el
  ÚNICO acento y solo aparece en la acción principal, en la selección actual
  y en los contadores de lo que espera. *Si algo es rojo y no se puede pulsar
  ni indica un estado, sobra.*
- **Dos temas reales.** Oscuro y claro, con los mismos tokens; el atleta
  elige en Ajustes o sigue al sistema. Ningún componente sabe en qué tema
  está: pinta con tokens y punto.
- **Tipografía tranquila.** Una familia, pesos 400–600, títulos en frase.
  Nada de mayúsculas con tracking, ni cursiva, ni peso 900: eso era el
  lenguaje anterior y se ha retirado de toda la aplicación.
- **Móvil primero.** El atleta usa la app de pie, entre series, con una mano.
  Zona pulsable de 44 px, hojas inferiores, zonas seguras del iPhone y el
  teclado en cuenta.
- **Movimiento breve y con sentido.** 150–220 ms, curva de salida exponencial,
  y `prefers-reduced-motion` lo colapsa todo.

---

## Dónde vive cada cosa

| Archivo | Contiene |
|---|---|
| [src/styles/tokens.css](src/styles/tokens.css) | **Fuente única de verdad.** Color (dos temas), tipografía, elevación, radios, movimiento, capas, zona segura. |
| [tailwind.config.js](tailwind.config.js) | Expone los tokens como utilidades (`token()` con `color-mix` para las opacidades). No define valores propios. |
| [src/index.css](src/index.css) | La **capa de respuesta**, los reset globales, `.material-bar`. |
| [src/lib/motion.ts](src/lib/motion.ts) | Espejo en JS de los tokens de movimiento, para framer-motion. |
| [src/lib/tema.ts](src/lib/tema.ts) · [src/hooks/useTema.ts](src/hooks/useTema.ts) | El tema: `data-theme` en `<html>`, preferencia guardada, `useTemaEnPantalla()` para quien necesite saber qué se está pintando (el `Toaster`). |
| [src/components/layout/RegistroMarca.tsx](src/components/layout/RegistroMarca.tsx) | El **registro de marca** de la web pública: restaura los valores antiguos dentro de `.registro-marca` para que la portada no cambie. |
| [src/components/ui/](src/components/ui) | Primitivas (ver abajo). |
| [src/components/layout/](src/components/layout) | `DashboardLayout` (barra lateral / barra de pestañas), `PageHeader`, `InicioPanel`. |

**Regla 1:** ningún componente nuevo escribe un hex ni un `white/5` a mano. Si
un valor no está en `tokens.css`, o falta un token o el componente se está
saliendo del sistema. `bg-white/10` se ve en el tema oscuro y desaparece en
el claro: por eso existen los rellenos (`--fill-*`).

**Regla 2 — el sistema es ADITIVO.** Las utilidades nuevas usan nombres propios
(`rounded-card`, `text-t-sm`, `ease-snap`, `bg-fill-hover`) y jamás reutilizan
claves que Tailwind ya define.

**Regla 3 — la portada juega con otras reglas.** La web pública (`/`, `/web`,
`/competiciones`, `/legal/*`, el modal de acceso y el aviso de cookies) va
envuelta en `.registro-marca`, que devuelve los tokens a sus valores de
portada. Está fuera del alcance de este sistema a propósito.

---

## Color

### Superficies

| Token | Oscuro | Claro | Uso |
|---|---|---|---|
| `--surface-sunken` | más oscuro | gris muy claro | Pozos, campos rellenos, letterbox de vídeo |
| `--surface-canvas` | `oklch(0.155 0.003 286)` | `oklch(0.975 …)` | Fondo de la aplicación |
| `--surface-sidebar` | un paso más | un paso menos | La barra lateral del ordenador |
| `--surface-raised` | | | Tarjetas, listas agrupadas, paneles |
| `--surface-overlay` | | | Menús, popovers, hojas, diálogos |

Cada paso es un nivel de elevación real. Los bordes de tarjeta
(`--card-border`) y los separadores de lista (`--separator`) son
transparencias de la tinta, así funcionan sobre cualquier paso y en los dos
temas.

### Rellenos: los estados

| Token | Uso |
|---|---|
| `--fill-hover` / `--fill-pressed` | Hover y pulsación sobre cualquier superficie |
| `--fill-selected` | La pestaña o fila activa |
| `--fill-input` | Campos de formulario (rellenos, sin borde) |
| `--fill-muted` | Chips neutros, iconos en su chip, botón secundario |
| `--fill-strong` | Un relleno con presencia (el pulgar del segmentado) |

### Materiales

`--material-bar` (barra de pestañas y cabeceras pegajosas, con desenfoque de
fondo en `.material-bar`), `--material-sheet` (hojas) y `--scrim` (el fondo
de un diálogo). El desenfoque va bajo `@supports`: sin él, un color opaco.

### Tinta

| Token | Uso |
|---|---|
| `--ink` | Titulares, cifras, texto principal |
| `--ink-muted` | Texto secundario, rótulos de sección |
| `--ink-subtle` | Metadatos, placeholders — **suelo legible (≥ 4.5:1)** |
| `--ink-faint` | **Nunca texto.** Chevrons, iconos decorativos, placeholders de cifras grandes |
| `--ink-inverse` | Texto sobre un fondo de tinta (el botón negro) |

### Marca y semánticos

`--brand` con `-hover`, `-active`, `-quiet` (fondo de un chip rojo),
`-quiet-strong` (hover de ese chip), `-line`, `-ink` (texto sobre rojo) y
`-text` (el rojo cuando ES el texto). Luminosidad 0,58: es el punto en que
aguanta texto blanco encima y sigue leyéndose como texto sobre las dos
superficies. En hover el rojo **se aclara** en el oscuro y se oscurece en el
claro: siempre se acerca al usuario.

`--success` / `--warning` / `--danger` / `--info`, cada uno con `-quiet`
(fondo de badge) y `danger` además con `-text` y `-quiet-strong`. Menos
saturados que el rojo de marca: el error se distingue por contexto e icono.

`--effort-low/mid/high/max` codifica el RPE.

---

## Tipografía

Una familia: **Inter** (cargada en `index.html`) con la pila del sistema
detrás (`--font-sans`), y `--font-mono` para cifras y código. Peso base
**400**; `font-synthesis: none` para que ningún peso se invente.

| Utilidad | px | Uso |
|---|---|---|
| `text-t-2xs` | 11 | Insignias, contadores. **Suelo.** |
| `text-t-xs` | 12 | Metadatos |
| `text-t-sm` | 14 | Interfaz |
| `text-t-base` | 16 | Cuerpo |
| `text-t-lg` | 18 | Subtítulos |
| `text-t-xl` | 22 | h3 |
| `text-t-2xl` | 28 | h2 |
| `text-title` | 32 | El título grande de pantalla (`PageHeader`, el inicio) |
| `text-metric` | — | Cifras grandes (pesos, cuenta atrás) |

Reglas:

- Títulos en **frase** («Bandeja de entrada»), peso 600, tracking negativo
  suave (`-0.01em` a `-0.02em`; el suelo es -0.04em).
- Rótulos de sección: `text-t-sm font-semibold text-ink-muted`. **Sin
  `uppercase`, sin `tracking-*`, sin `italic`, sin `font-black`.** El
  codemod de septiembre de 2026 retiró más de 1.400 usos; que no vuelvan.
- `tabular-nums` es global: un peso que pasa de 97,5 a 100 no desplaza la fila.
- Nada de `text-[9px] md:text-xs`: 9 px en el móvil es al revés de lo que
  hace falta.

---

## Radios

| Utilidad | px | Uso |
|---|---|---|
| `rounded-chip` | 6 | Badges, chips, miniaturas |
| `rounded-field` | 10 | Campos, botones |
| `rounded-card` | 14 | Tarjetas, listas agrupadas |
| `rounded-sheet` | 20 | Hojas y diálogos. **Techo.** |
| `rounded-pill` | 999 | Avatares, interruptores, contadores |

`rounded-3xl` / `rounded-[2rem]` leen como plantilla, no como marca: no se
usan.

---

## Elevación

Sombra **o** borde, nunca los dos como decoración. `shadow-card` es la sombra
de una tarjeta en reposo (casi nada en el oscuro, un velo en el claro);
`shadow-overlay` la de menús y hojas. Los desenfoques grandes sobre negro no
se ven y solo cuestan pintado.

---

## Movimiento

Curva única de salida exponencial: `ease-snap` → `cubic-bezier(0.22, 1, 0.36, 1)`.
Sin rebote ni elástico.

| Token | ms | Uso |
|---|---|---|
| `--dur-instant` | 90 | Feedback de pulsación |
| `--dur-fast` | 150 | Hover, foco, interruptores, `animate-pop` de un menú |
| `--dur-base` | 220 | Paneles, acordeones, `animate-tick` del check |
| `--dur-slow` | 320 | Hojas, transición de ruta |

- El movimiento comunica **estado**. Si se puede quitar sin perder
  información, sobra.
- Sin secuencias orquestadas de carga: el usuario entra a hacer una tarea.
- El escalonado es legítimo dentro de **una** lista.
- `prefers-reduced-motion` colapsa todas las duraciones a 1 ms en
  `tokens.css`, y framer-motion lo lee en cada llamada.

### La capa de respuesta

Reglas globales en [`src/index.css`](src/index.css): `touch-action:
manipulation`, sin resaltado de toque del sistema, `:active { scale(0.97) }`
(escape: `data-no-press`), campos a `max(16px, 1em)` en móvil para que Safari
no amplíe, `:focus-visible` y no `:focus`, inercia de scroll.

### Guardar sin conexión

Ninguna escritura del atleta va directa a la red: pasa por
[`writeQueue`](src/lib/offlineQueue.ts). `SaveIndicator` solo aparece cuando
hay algo que decir.

---

## Móvil

### Zona pulsable: 44 px

Cualquier control mide 44 px de alto como mínimo; cuando el ancho no da, se
estira la zona sensible con un pseudo-elemento.

### Zona segura

`index.html` lleva `viewport-fit=cover`; `pb-safe` y
`env(safe-area-inset-bottom)` en toda barra o pie pegado abajo. La barra de
pestañas mide `--tabbar-alto` (70 px; 0 a partir de 1024 px) y el contenido
reserva ese alto más la zona segura para que nada quede debajo.

### La barra de pestañas: cuatro + «Más»

En el móvil hay **cuatro accesos** y un quinto, «Más», que abre una hoja con
todo lo demás (secciones, tema, web, salir). En el ordenador, barra lateral
de 248 px con la marca, el conmutador de panel y la cuenta. Los accesos
llevan `badge` con lo que espera (bandeja, mensajes) y `hideOnMobileBar` los
manda a «Más». `shortLabel` cuando una etiqueta no cabe.

### Teclado y hojas

Los diálogos entran como **hoja inferior** en el móvil; el pie de acciones
se apila en columna inversa (la principal arriba, al alcance del pulgar) y
respeta la zona segura. El compositor del chat crece con el texto y se queda
sobre el teclado.

### Cómo se comprueba

`/dev/movil` monta las pantallas críticas con datos falsos; `/dev/sistema`
enseña todas las primitivas en todos los estados y en los dos temas;
`/dev/piezas`, las piezas sueltas. Solo en desarrollo.

---

## Capas

`sticky 100` → `dropdown 200` → `backdrop 300` → `modal 400` → `toast 500` → `tooltip 600`

---

## Primitivas

| Componente | Para qué |
|---|---|
| `Button` | `primary` (rojo, uno por pantalla), `secondary` (relleno), `tinted` (rojo suave), `ghost`, `danger`. Tres tamaños, `loading` sin cambiar de ancho, `type="button"` por defecto. |
| `IconButton` | Circular, `tono` neutro/marca/peligro/relleno, `sm`/`md`. Siempre con `aria-label`. |
| `Field` | Campos rellenos (`--fill-input`), chevron propio en los `select`, `controlBase(hayError)` para reutilizar el estilo en un `input` suelto. |
| `SegmentedControl` | Filtros de una pantalla (todo / sin leer / archivados). Con `insignia` por segmento. |
| `Switch` / `SwitchRow` | Interruptores de ajustes, con título y descripción. Se aplican al momento: sin botón de guardar. |
| `Badge` / `Contador` / `Punto` | Estado en texto, número de pendientes, «sin leer». |
| `Avatar` | Iniciales si no hay foto; `anillo` para apilarlos. |
| `List` / `ListRow` | Listas agrupadas al estilo de Ajustes: icono o avatar, título, subtítulo, valor, chevron; separadores que empiezan donde empieza el texto. |
| `PageHeader` / `Contenido` | Título grande, subtítulo, «atrás», acciones; `Contenido` fija el ancho de lectura. |
| `Tabs` | Pestañas de una pantalla, indicador en tinta (no en rojo). |
| `Modal` | Portal, trampa de foco, Escape, hoja inferior en móvil, `--scrim`. |
| `AnchoredMenu` + `MenuItem` / `MenuSeparador` / `MenuEtiqueta` | Menús anclados a un botón. |
| `Card` / `Panel` | Superficie elevada y panel plano. Nunca uno dentro de otro. |
| `EmptyState` | `empty`, `filter`, `error`, `done` («todo revisado»). |
| `Skeleton` | Carga sin salto de layout. |
| `NotificationBell` | La campana: contador, panel con icono por categoría, navegación al pulsar. |

**Un solo `primary` por pantalla.** Dos primarios significan que la pantalla
no ha decidido qué quiere que hagas.

---

## Pantallas que fijan el patrón

- **Inicio** (`InicioPanel`): título grande, fecha, dos columnas en el
  ordenador sin scroll, una en el móvil. Tarjeta principal roja SOLO cuando
  es la acción del día (entrenar; revisar si hay pendientes), neutra si no.
- **Bandeja de entrada** (`features/inbox`): lista de atletas con contador,
  tarjetas por entrenamiento con todos los datos, un único botón «Marcar como
  revisado» (manual, nunca al abrir) y el feedback en hilo.
- **Mensajes** (`features/chat`): dos columnas en el ordenador, un hilo a
  pantalla completa en el móvil; burbujas sin borde, ✓ enviado / ✓✓
  entregado (nunca «leído»), compositor con adjuntos y voz.
- **Ajustes → Avisos** (`NotificationSettings`): `List` + `SwitchRow`, con el
  estado real del permiso del navegador.

---

## Imágenes

Usa siempre [`SafeImage`](src/components/ui/SafeImage.tsx) para fotos que
provengan de datos. `vercel.json` excluye las extensiones de fichero del
rewrite para que un asset ausente dé 404 visible; no simplifiques ese
`rewrite`.
