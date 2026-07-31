# Anvil Strength — Sistema de diseño

Registro: **producto**. El diseño sirve a la tarea, no es el producto. La
referencia no es una landing bonita: es que un atleta entre a mitad de serie,
encuentre lo que busca y salga, y que un coach programe cuatro semanas sin
pelearse con la interfaz.

Tema: **oscuro únicamente**. No por estética. El atleta consulta la sesión en
el gimnasio, a menudo con poca luz; el coach programa por la noche. Un tema
claro obligaría a mirar una pantalla en blanco en los dos casos.

Estrategia de color: **contenida**. El rojo marca acción primaria, selección
actual y error. Nunca decora. *Si algo es rojo y no se puede pulsar ni indica
un estado, sobra.*

---

## Dónde vive cada cosa

| Archivo | Contiene |
|---|---|
| [src/styles/tokens.css](src/styles/tokens.css) | **Fuente única de verdad.** Color, elevación, radios, movimiento, capas. |
| [tailwind.config.js](tailwind.config.js) | Expone los tokens como utilidades. No define valores propios. |
| [src/lib/motion.ts](src/lib/motion.ts) | Espejo en JS de los tokens de movimiento, para framer-motion. |
| [src/components/ui/](src/components/ui) | Primitivas: `Button`, `Modal`, `Panel`, `EmptyState`. |

**Regla 1:** ningún componente nuevo escribe un hex a mano. Si un valor no está
en `tokens.css`, o falta un token o el componente se está saliendo del sistema.

**Regla 2 — el sistema es ADITIVO.** Las utilidades nuevas usan nombres propios
(`rounded-card`, `text-t-sm`, `ease-snap`) y jamás reutilizan claves que Tailwind
ya define (`sm`, `md`, `lg`, `out`...). Redefinir esas claves no añade utilidades:
cambia las 700 que ya hay en la app de una sola vez. La migración va pantalla por
pantalla, no en un big bang.

---

## Color

### Superficies — 4 pasos, no 7 grises

Antes convivían `#1c1c1c`, `#252525`, `#1a1a1a`, `#1f1f1f`, `#141414`,
`#181818` y `#151515`: siete valores casi idénticos que no comunicaban nada.

| Token | Uso |
|---|---|
| `--surface-sunken` | Pozos, bloques de código, letterbox de vídeo |
| `--surface-canvas` | Fondo de la aplicación |
| `--surface-raised` | Tarjetas, paneles, modales |
| `--surface-overlay` | Menús, popovers, tooltips |

Cada paso es un nivel de elevación real. Si dudas entre dos, probablemente el
componente no necesita elevarse.

Los bordes son transparencias del blanco (`--border-subtle/default/strong`),
no grises opacos: así funcionan igual sobre cualquier paso de la rampa.

### Tinta — contraste verificado

Medido contra `--surface-canvas`:

| Token | Contraste | Uso |
|---|---|---|
| `--ink` | 21.0:1 | Titulares, cifras, texto principal |
| `--ink-muted` | 7.0:1 | Texto secundario, labels |
| `--ink-subtle` | 4.7:1 | Metadatos, placeholders — **suelo legible** |
| `--ink-faint` | 2.6:1 | **Nunca texto.** Solo iconos decorativos |

> El antiguo `text-gray-500`, con **304 usos** en el proyecto, daba **3.4:1** y
> no alcanzaba el mínimo AA de 4.5:1. Su reemplazo es `text-ink-subtle` o
> `text-ink-muted`.

### Marca

`--brand` y sus estados. En hover el rojo **se aclara**, no se oscurece: sobre
fondo oscuro, oscurecer aleja el elemento del usuario en vez de acercarlo.

### Semánticos y esfuerzo

`--success` / `--warning` / `--danger` / `--info`, cada uno con su variante
`-quiet` para fondos de badge. Están deliberadamente menos saturados que el
rojo de marca: en una app de fuerza el rojo ya está ocupado por la identidad,
así que el error se distingue por contexto e icono, no por competir en color.

`--effort-low/mid/high/max` codifica el RPE, que es el dato más leído de la
app y merece escala propia.

---

## Tipografía

Una sola familia (Inter). El registro de producto no necesita pareja
display + cuerpo: hay muchos niveles de texto y el contraste exagerado
entre ellos genera ruido.

Escala **fija en rem** con prefijo `t-` (`text-t-sm`, `text-t-2xl`…), razón ~1.2.
El prefijo existe para no pisar `text-sm`/`text-xl` de Tailwind. Nada de `clamp()`: la app se consume a DPI
constante y un titular que encoge dentro de un panel se ve peor, no mejor.

`text-metric` para cifras grandes (pesos, totales, cuenta atrás).
`font-variant-numeric: tabular-nums` es global: sin él, un peso que pasa de
97,5 a 100 desplaza la fila entera al re-renderizar.

Suelo de tracking en titulares: **-0.03em**. Por debajo de -0.04em las letras
se tocan.

---

## Radios

| Utilidad | px | Uso |
|---|---|---|
| `rounded-chip` | 4 | Badges, chips |
| `rounded-field` | 8 | Inputs, botones |
| `rounded-card` | 12 | Tarjetas, paneles |
| `rounded-sheet` | 16 | Modales, hojas |
| `rounded-pill` | 999 | Avatares, toggles |

`rounded-sm/md/lg/xl` siguen siendo los de Tailwind y no se han tocado.

Los contenedores topan en **16px**. Los `rounded-[2rem]` y `rounded-[2.5rem]`
sueltos que había leen como plantilla, no como marca.

---

## Elevación

Sombra **o** borde, nunca los dos a la vez como decoración. Las sombras en
tema oscuro se apoyan en oscurecer, no en difuminar: los desenfoques grandes
sobre negro no se ven y solo cuestan pintado.

---

## Movimiento

Curva única de salida exponencial: `ease-snap` → `cubic-bezier(0.22, 1, 0.36, 1)`.
Sin rebote ni elástico — esto es una herramienta de trabajo.
(`ease-out` y `ease-in-out` siguen siendo los de Tailwind: son claves suyas.)

| Token | ms | Uso |
|---|---|---|
| `--dur-instant` | 90 | Feedback de pulsación |
| `--dur-fast` | 150 | Hover, foco, toggles |
| `--dur-base` | 220 | Paneles, acordeones |
| `--dur-slow` | 320 | Modales, transición de ruta |

Reglas:

- El movimiento comunica **estado**. Si una animación se puede quitar sin que
  el usuario pierda información, sobra.
- **Sin secuencias orquestadas de carga de página.** El usuario entra a hacer
  una tarea, no a ver cómo carga la interfaz.
- El escalonado (`stagger`) es legítimo dentro de **una** lista — series de un
  ejercicio, atletas del coach — porque ayuda a leer el orden. Aplicar la misma
  entrada a todas las secciones de una pantalla es reflejo, no diseño.
- `prefers-reduced-motion` colapsa todas las duraciones a 1ms, y se lee en cada
  llamada porque la preferencia se puede cambiar con la pestaña abierta.

---

## Capas

Escala semántica, nunca `z-index: 9999`:

`sticky 100` → `dropdown 200` → `backdrop 300` → `modal 400` → `toast 500` → `tooltip 600`

---

## Primitivas

### `Button`

Cuatro variantes: `primary`, `secondary` (por defecto), `ghost`, `danger`.
Tres tamaños. Los siete estados obligatorios están cubiertos, incluido
`loading`, que mantiene el contenido en el flujo y solo lo hace invisible —
así el botón no cambia de ancho al pulsar guardar.

**Un solo `primary` por pantalla.** Dos primarios significan que la pantalla
no ha decidido qué quiere que hagas.

`danger` es visualmente distinto de `primary` pese a compartir familia de
color: borrar un bloque de entrenamiento no puede parecerse a guardarlo.

### `Modal`

Portal + trampa de foco + devolución del foco al cerrar + Escape + bloqueo de
scroll con compensación de la barra (sin salto de layout).

En móvil entra como **hoja inferior**: el pulgar está abajo, y un diálogo
centrado obliga a estirar la mano para cerrarlo.

### `Panel`

Deliberadamente no se llama `Card`. Empieza **plano** (`tone="flat"`) y solo se
eleva cuando hay una razón. Nunca un panel dentro de otro panel: si hace falta,
la jerarquía está mal.

### `EmptyState`

Tres registros, porque no son lo mismo:

- `empty` — todavía no hay datos. **Enseña la interfaz** y propone el primer
  paso. "Aún no tienes bloques" por sí solo no sirve de nada.
- `filter` — hay datos, el filtro los oculta. La salida es limpiar el filtro.
- `error` — algo falló. La salida es reintentar, y se dice qué pasó.

---

## Migración

Los alias `anvil-black` / `anvil-red` / `anvil-gray` siguen en
`tailwind.config.js` para no romper las ~700 utilidades ya escritas.
`anvil-red` ya apunta a `--brand`.

Se van pantalla por pantalla en F5 y se borran los alias al terminar.

Orden de sustitución al migrar una pantalla:

1. `text-gray-500` → `text-ink-subtle` (o `text-ink-muted` si es texto real)
2. `text-gray-400` → `text-ink-muted`
3. `bg-[#1c1c1c]` → `bg-surface-canvas`; `bg-[#252525]` → `bg-surface-raised`
4. `bg-red-500` / `bg-red-600` / `bg-red-700` → `bg-brand`
5. `rounded-2xl` / `rounded-[2rem]` → `rounded-card` o `rounded-sheet`
6. `ease-out` → `ease-snap` en transiciones nuevas
7. `<button className="...">` → `<Button variant=…>`
8. `<img>` → `<SafeImage>` en cualquier foto que venga de datos

---

## La portada juega con otras reglas

Todo lo anterior describe la **aplicación**: tema oscuro y color contenido,
porque ahí el diseño sirve a una tarea.

La web pública es otro registro. Ahí el diseño **es** el producto, y su
trabajo es que alguien que no nos conoce decida quedarse. Por eso tiene
permitidas dos cosas que dentro de la app serían un error:

| En la app | En la portada |
|---|---|
| Rojo solo en la acción primaria | Folds enteros drenados en rojo |
| Tema oscuro únicamente | Alterna fondo oscuro y blanco (`--fold-*`) |
| Escala de texto fija en rem | Display fluido con `clamp()` (`text-d-sm/md/lg`) |
| Sin secuencias de entrada | Entrada orquestada en la primera pantalla |
| Botones planos | Botón con canto físico que se hunde al pulsar |

Los valores viven en la **sección 10** de `tokens.css`, separados y con
prefijo propio para que no se cuelen en la rampa de la aplicación. Las piezas,
en [`src/features/landing/components/landingKit.tsx`](src/features/landing/components/landingKit.tsx):
`Fold`, `PressButton`, `Reveal` y `StaggerList`.

El claro es un blanco **neutro** (croma 0), no un crema. El crema tibio es el
fondo por defecto de medio internet generado con IA; un blanco limpio al lado
del rojo de marca no se parece a nada.

El techo de tamaño del display es **6rem** y el suelo de tracking sigue siendo
**-0.03em**, igual que en la app.

---

## Imágenes

Usa siempre [`SafeImage`](src/components/ui/SafeImage.tsx) para fotos que
provengan de datos (atletas, coaches, logros, avatares de la BD).

Motivo: el `rewrite` de SPA devolvía `index.html` para toda ruta no encontrada,
imágenes incluidas. Una foto que falta daba **200 con `text/html`**, no 404: el
navegador dejaba un hueco sin error en consola ni en la pestaña de red.
`vercel.json` ya excluye las extensiones de fichero del rewrite para que vuelvan
a dar 404, y `SafeImage` se encarga de que el hueco se vea intencionado.
