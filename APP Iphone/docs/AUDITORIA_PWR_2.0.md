# PWR ANALYSIS 2.0 — Auditoría previa

**Fase 1 del encargo. Informe técnico interno, antes de tocar código.**
Fecha: 18 de agosto de 2026.
Ámbito: `src/lib/cv/**`, `src/features/coach/components/pwr/**`, y los dos puntos
donde se monta (`SetVideoAnalysisModal`, `PwrAnalysisTab`). Nada más.

---

## 0. Resumen ejecutivo

**El motor que pide la Fase 2 ya está construido, y está bien construido.**

El flujo solicitado —vídeo → detección → seguimiento → trayectoria → px a metros →
filtrado → posición/velocidad/aceleración → segmentación → métricas → confianza—
es, casi literalmente, lo que hay hoy en `src/lib/cv/`. Es determinista, no hay
ninguna IA generativa en el camino, y las decisiones no triviales están razonadas
por escrito y algunas medidas contra repeticiones sintéticas.

No voy a sustituirlo. Sustituirlo sería tirar trabajo verificado para reescribir
lo mismo peor. **Lo que sí hay son seis huecos reales**, y ninguno está en el
motor de señal:

| # | Hueco | Fase del encargo | Coste |
|---|---|---|---|
| 1 | **Se calcula todo por repetición y solo se enseña una.** El resto se tira. | F4, F5 | Bajo — los datos ya existen |
| 2 | **Rendimiento: el lector de fotogramas va por `seek`.** Es el techo de todo. | F8 | Alto |
| 3 | **Sticking point sin inicio, fin ni % de ROM.** Hoy es un punto, no una zona. | F6 | Bajo |
| 4 | **No hay exportación de ninguna clase.** | F12 | Medio |
| 5 | **No existe infraestructura de calibración ni versión del motor.** | F9, F10, F11 | Medio |
| 6 | **Ejercicio y carga se piden DESPUÉS de analizar.** | F3 | Bajo |

Y tres cosas que el encargo no menciona y conviene decidir antes de tocar nada:

- **`velocity_loss` se calcula con dos fórmulas distintas** según venga de PWR o
  de VBT, y las dos escriben la misma clave del catálogo. Es un fallo de
  consistencia sobre datos ya guardados, no un hueco de funcionalidad (§9, Fase 4).
- La etiqueta **"Fuerza Suelo"** sigue mintiendo.
- El **1RM estimado** usa un perfil genérico existiendo ya el del atleta.

Las tres están detalladas en §7 y §9, y las recojo como decisiones en §11.

---

## 1. Arquitectura actual

Todo ocurre **en el navegador**. El vídeo no se sube a ningún sitio: se lee del
fichero local, se procesa contra un `<canvas>` y se descarta. Lo único que se
guarda son las métricas (~200 bytes). Esto fue una decisión explícita y sigue
siendo la correcta; no la toco.

```
  <input type=file>  ──►  <video> local (blob URL)
          │
          ▼
  VideoTrimmer.tsx ................ recorta a la repetición (miniaturas + tiradores)
          │
          ▼
  frameSource.ts / createFrameReader
     · mide la cadencia real (mediana de intervalos, ajuste a nominal)
     · reduce a 1280 px de ancho como máximo (espacio de trabajo)
     · entrega fotograma a fotograma, esperando al consumidor
     · instante REAL del fotograma vía requestVideoFrameCallback.mediaTime
          │
          ▼  ImageData (RGBA)
  tracker.ts ...................... puente con el worker, peticiones con ID
          │
          ▼  postMessage + transfer
  cv.worker.js  (OpenCV.js WASM, hilo aparte)
     · DETECT_PLATE → Canny + cierre + contornos + fitEllipse + validación
     · INIT         → siembra ~24 features dentro del disco
     · TRACK        → Lucas-Kanade piramidal, ida y vuelta, mediana del conjunto
          │
          ▼  recorrido en píxeles + instante
  plateGeometry.ts ................ px → metros por la ALTURA de la elipse
          │
          ▼
  signal.ts ....................... mediana de 3 + regresión local cuadrática
          │                          (Savitzky-Golay para muestreo no uniforme)
          ▼  KinematicPoint[] { time, x, y, velocity, acceleration }
  pwrMath.ts ...................... segmentación en repeticiones + métricas
          │                          + dinámica (F, P, RFD) + 1RM estimado
          ▼
  quality.ts ...................... 5 dimensiones ponderadas → 0-100 + veredicto
          │
          ▼
  MetricsDashboard.tsx ............ recharts, y guardado en la bolsa JSONB
```

**Ficheros y tamaño** (5.434 líneas en total):

| Fichero | Líneas | Qué es |
|---|---|---|
| `cv.worker.js` | 858 | Detección de disco y seguimiento. OpenCV. |
| `VideoTracker.tsx` | 1.036 | Máquina de estados de la interfaz de captura. |
| `pwrMath.ts` | 642 | Segmentación y métricas. |
| `MetricsDashboard.tsx` | 648 | Panel de resultados. |
| `quality.ts` | 433 | Puntuación de confianza. |
| `frameSource.ts` | 409 | Lector de fotogramas. |
| `signal.ts` | 348 | Filtrado y derivación. |
| `VideoTrimmer.tsx` | 309 | Recorte. |
| `plateGeometry.ts` | 260 | Calibración de escala. |
| `tracker.ts` | 292 | Puente con el worker. |

> **Nota sobre el estado del repositorio.** Siete de estos ficheros están
> modificados sin commit (`git status`), con ~1.976 líneas añadidas. `signal.ts`,
> `frameSource.ts` y `VideoTrimmer.tsx` son nuevos y **nunca se han commiteado**.
> Toda la auditoría se refiere al árbol de trabajo, no a `bb440d6c`.

---

## 2. Librerías

| Librería | Versión | Uso en PWR |
|---|---|---|
| `@techstark/opencv-js` | 4.12 | **Sí.** Canny, morfología, contornos, `fitEllipse`, `HoughCircles`, `goodFeaturesToTrack`, `calcOpticalFlowPyrLK`. Se carga como worker clásico desde `/opencv.js` (~670 KB WASM). |
| `recharts` | 3.8 | **Sí.** Dos gráficas. |
| `jspdf` | 4.2 | Está en el proyecto (PDF de entrenamientos). **PWR no lo usa.** |
| `papaparse` | 5.5 | Está en el proyecto. **PWR no lo usa.** |
| `html2canvas` | 1.4 | Está en el proyecto. **PWR no lo usa.** |

**No hay MediaPipe, ni pose estimation, ni ningún modelo.** Y no hace falta: se
sigue el disco, que es un objeto rígido de diámetro conocido. Meter pose aquí
añadiría un modelo de 3–6 MB para medir peor lo que ya se mide bien. Los tres
últimos son la buena noticia de la Fase 12: el aparato de exportación ya está en
el proyecto, solo hay que conectarlo.

---

## 3. Cómo se detecta la barra

No se detecta la barra: **se detecta el disco**, y se sigue su cara. Es lo
correcto — la barra es un cilindro sin textura y sin escala conocida; el disco es
un círculo de diámetro estándar.

**Detección** (`detectByContours`, `cv.worker.js:239`), en 720 px de ancho:

1. Gris → Canny con umbrales derivados de la **mediana** de la imagen (no
   constantes: se adapta a la exposición).
2. Cierre morfológico, para unir el trazo del borde.
3. `findContours` → `fitEllipse` sobre cada uno.
4. **Validación**, y aquí está lo que distingue esto de un detector ingenuo:
   - **residuo** — distancia media de los puntos del contorno a la elipse ajustada;
   - **cobertura angular** — qué fracción de la vuelta recorre el contorno.

   Un disco medio tapado por la pierna del atleta da residuo bajo y cobertura 0,6:
   se acepta. Un listón recto da cobertura alta y residuo pésimo: se rechaza.
5. Límites de tamaño contra el **lado menor** del fotograma (no el ancho — un
   móvil graba en vertical), y achatamiento mínimo 0,35.
6. `pickOutermost`: entre elipses concéntricas se toma la **exterior**, porque los
   45 cm son el diámetro exterior. Quedarse con el aro de color interior
   sobrestimaría la velocidad ~50%.
7. Respaldo `HoughCircles` **solo si el usuario ha señalado el disco**. Sin pista
   no entra, deliberadamente: sin pista su trabajo es inventarse círculos.

**Escala** (`plateGeometry.ts`): se usa la **ALTURA** de la elipse, no el diámetro.
Con la cámara girada θ respecto de la perpendicular, lo vertical se proyecta a
escala completa y lo horizontal se comprime por cos θ. Como el levantamiento se
mide en vertical, la altura da la escala correcta sea cual sea θ. Y si la cámara
está alta o baja (φ), la altura del disco se comprime igual que el recorrido de la
barra, y el cociente vuelve a salir bien.

Es el acierto metodológico de fondo de todo el módulo. **No lo toco.**

Tres escalones declarados: automático → asistido (el usuario toca) → aro a mano.
Más selector de diámetro real (45/40/35/32 cm).

**Seguimiento** (`trackStep`, `cv.worker.js:559`):

- Nube de ~24 features (`goodFeaturesToTrack`) sembrados dentro de una máscara al
  85% del eje del disco.
- `calcOpticalFlowPyrLK`, ventana 21×21, 4 niveles de pirámide.
- **Validación ida-y-vuelta**: cada fotograma se sigue del anterior al actual y
  del actual de vuelta al anterior; un punto que no regresa a menos de 1,5 px se
  descarta. Cuesta el doble de flujo óptico y vale la pena.
- El centro se mueve por la **mediana** de los desplazamientos individuales — que
  además es inmune a que el disco gire.
- Re-siembra si la nube baja de 10 puntos; si un fotograma se pierde, se
  **conserva la referencia anterior** (adoptar el fotograma fallido convertía cada
  pérdida en un error permanente de posición: se midió, 12 px sobre un 6% del ROM).

**Veredicto: es un buen detector y un buen seguidor. No hay motivo técnico para
sustituir ninguno de los dos.**

---

## 4. Cómo se calcula la velocidad

`signal.ts`. Dos pasos:

1. **Mediana de 3** sobre X e Y. El flujo óptico no se degrada, *salta*: la marca
   se va a otro objeto un fotograma y vuelve. Una mediana de 3 borra ese salto
   aislado sin tocar el movimiento real. Los saltos se siguen contando sobre el
   recorrido **crudo** para la nota de calidad, así que filtrar aquí no esconde
   nada.

2. **Regresión local cuadrática.** Para cada punto se ajusta `y = a₀ + a₁u + a₂u²`
   por mínimos cuadrados a los vecinos dentro de una ventana **definida en
   segundos** (0,10 s para velocidad, 0,18 s para aceleración), y se leen del
   ajuste la posición, la pendiente (velocidad) y la curvatura (aceleración).

Tres propiedades que importan y que están bien resueltas:

- **Se deriva del ajuste, no de la señal suavizada.** Suavizar y luego derivar
  aplica el filtro dos veces.
- **No hay desfase y el pico se conserva**, porque una parábola sí puede describir
  un máximo. La versión anterior (media móvil + doble EMA) atenuaba la velocidad
  máxima un 33%.
- **La ventana en segundos y no en muestras**: el filtrado es el mismo a 30 Hz que
  a 240, en vez de ser cuatro veces más agresivo en el segundo.
- `u` normalizado a [-1,1] antes de resolver la matriz normal — sin eso el sistema
  queda mal condicionado. Detalle correcto y fácil de olvidar.

**Error medido** contra repetición sintética (30 fps, 1 px de ruido):
recorrido +0,1%, velocidad media −2,4%, velocidad máxima −6,9%.

**Veredicto: correcto. Es Savitzky-Golay generalizado a muestreo no uniforme, que
es el estándar en biomecánica. No lo toco.**

---

## 5. Cómo se segmentan las repeticiones

`findSpans` en `pwrMath.ts:278`. Es la parte con la historia más interesante.

Un umbral seco (`v < 0,04 → cierra la fase`) parte en dos cualquier repetición con
punto de estancamiento — justo la población para la que está hecha la herramienta.
Un peso al 92% se para de verdad a media subida y la velocidad cruza el cero. La
consecuencia era que **cuanto más pesada la serie, más probable que el análisis no
la viese**.

Lo que cierra una fase ahora no es un umbral ni un tiempo, sino **qué pasa
después**: al llegar a una parada se mira hacia delante 0,6 s, y si la barra
avanza 3 cm más en el mismo sentido antes de invertirse, era un estancamiento y la
fase continúa (`findResume`). Se mide por **desplazamiento**, no por velocidad: a
60 Hz un píxel de ruido son 0,09 m/s de velocidad instantánea, y con la barra ya
arriba y quieta eso bastaba para tragarse medio segundo de más.

Y ningún umbral de duración sirve: a 30 fps un estancamiento real y el final de
una repetición duran los dos cuatro o cinco fotogramas. Está comprobado.

Después, `refineByHeight` mueve los extremos al punto más bajo y al más alto del
tramo — el ROM es por definición la distancia entre esos dos, no entre donde la
velocidad cruzó un umbral nuestro.

Y la **velocidad media es desplazamiento entre tiempo**, interpolando el instante
exacto de cruce del 8% del pico. Ese 8% salió de un barrido (2%→15% × 3 formas de
levantamiento × 6 combinaciones de cadencia y ruido × 3 semillas), no de una
intuición: sesgo −0,3% frente al −24% del método anterior.

**Veredicto: es la mejor parte del módulo y la que más caro costaría rehacer. No
la toco.**

---

## 6. Cuellos de botella de rendimiento

Aquí está el trabajo de verdad. Un vídeo de 1 minuto tarda ~1 minuto, y el motivo
es estructural.

### 6.1. El lector va por `seek`, y eso es el techo

`frameSource.read()` hace, **en serie y para cada fotograma**:

```
  video.currentTime = t   →  esperar evento 'seeked'   ← DOMINANTE
  →  ctx.drawImage(video)
  →  ctx.getImageData()                                ← 3,7 MB de alojamiento
  →  buffer.slice(0)                                   ← 3,7 MB COPIADOS AL PEDO
  →  postMessage(transfer)
  →  worker: matFromImageData                          ← otra copia al heap WASM
  →  worker: cvtColor RGBA→GRAY
  →  worker: 2 × calcOpticalFlowPyrLK  (1280×720, 4 niveles, 21×21)
  →  respuesta
  →  main: drawImage(video) + re-trazar TODO el recorrido   ← O(n²) acumulado
```

**Un `seek` no es barato.** El decodificador no puede saltar a un fotograma
arbitrario: tiene que volver al keyframe anterior y decodificar hacia delante. Un
H.264 de móvil pone keyframes cada 1–4 s, o sea hasta 120 fotogramas de trabajo
por cada salto. Los navegadores optimizan algo los saltos secuenciales hacia
delante, pero sigue siendo un orden de magnitud más caro que decodificar seguido.

A eso se suma que `seekTo` tiene un respaldo de `setTimeout(…, 120)` para cuando
`requestVideoFrameCallback` no vuelve a dispararse. Es correcto como red de
seguridad, pero fija un **techo de 120 ms por fotograma** en los navegadores donde
ese caso se dé a menudo. A 30 fps sobre 10 s recortados son 36 segundos solo de
espera.

> ### ✅ MEDIDO — y el desglose analítico se quedó corto en un sitio importante
>
> Cronometrado sobre un vídeo real de 1280×720 generado en el navegador
> (`src/dev/pwrBench.tsx`, `/pwr-bench.html`):
>
> | Etapa | ms/fotograma | % |
> |---|---|---|
> | **Leer el fotograma (`seek` + dibujar + `getImageData`)** | **199–243** | **90%** |
> | Seguimiento (copia + transferencia + flujo óptico ×2) | 20–27 | 10% |
> | Copia redundante `buffer.slice(0)` de 3,5 MB | 1,1 | **0,5%** |
>
> **La sospecha era correcta y las proporciones no.** El `seek` es nueve de cada
> diez milisegundos. Pero las «redundancias» de §6.2 —que iban a ser el grueso
> del trabajo— **son ruido**: la copia de 3,5 MB que parecía escandalosa cuesta
> 1,1 ms, o sea medio punto porcentual. Optimizarla habría sido un día de
> trabajo para no cambiar nada medible.
>
> El dato que abrió la puerta a la solución es el otro: **el seguimiento cuesta
> 22 ms, menos que los 33 ms que dura un fotograma a 30 fps.** Da tiempo de
> sobra a procesar cada fotograma antes de que llegue el siguiente, así que se
> puede REPRODUCIR el vídeo en vez de posicionarlo.
>
> *Salvedad: el WebM de `MediaRecorder` no lleva índice de búsqueda, así que el
> coste de `seek` medido es un techo; con un MP4 de móvil es menor. No cambia la
> conclusión —el reparto sigue siendo abrumadoramente a favor del `seek`— pero
> no se debe citar «243 ms» como el número que ve un usuario.*

### 6.2. Trabajo redundante identificado

| Qué | Coste | Arreglo |
|---|---|---|
| `image.data.buffer.slice(0)` en las tres funciones de `tracker.ts` | **3,7 MB copiados por fotograma**, para nada: `getImageData` ya devuelve un búfer recién hecho del que se puede desprender | Transferir directamente |
| Se manda **RGBA** y el worker solo usa **gris** | 4× más bytes de los necesarios | Convertir antes, o mandar `VideoFrame` |
| Flujo óptico a **1280×720** | La detección ya trabaja a 720 px. LK tiene precisión de subpíxel | Bajar el espacio de seguimiento — **midiendo** el coste en px |
| `drawImage(video)` en el bucle + re-trazar el recorrido entero cada fotograma | O(n²) en el número de fotogramas | Dibujo incremental, y saltarse fotogramas de *pintado* (no de análisis) |
| Todo es **estrictamente secuencial** | El fotograma N+1 no empieza a leerse hasta que el worker acaba el N | Encauzar: leer N+1 mientras el worker procesa N |

### 6.3. La vía elegida: reproducir, no posicionar

**No hace falta WebCodecs.** `VideoDecoder` obligaría a meter un demultiplexor de
MP4 (mp4box.js, ~200 KB de dependencia nueva) solo para obtener los paquetes
codificados, y el problema se resuelve sin eso.

Basta con **reproducir el vídeo y coger los fotogramas al vuelo** con
`requestVideoFrameCallback`, que además entrega el instante exacto del
descodificador. El descodificador hace entonces lo único que sabe hacer rápido:
ir hacia delante.

**Y esto no es volver al fallo antiguo** —hace dos revisiones se analizaba
reproduciendo y perdía la mitad de los fotogramas—. Tres cosas son distintas:

1. Aquella versión iba a golpe de `requestAnimationFrame`, al ritmo de la
   PANTALLA. Esta va con `requestVideoFrameCallback`, al ritmo del VÍDEO.
2. **Hay contrapresión.** Los fotogramas entran en una cola de 8 y, cuando se
   llena, **se pausa el vídeo**. El descodificador espera al seguimiento en vez
   de atropellarlo. Eso es lo que conserva la garantía de no perder ninguno, que
   es la propiedad por la que se estaba pagando el `seek`.
3. **Se sabe cuántos se pierden**, con `presentedFrames`. Por encima del 4% se
   abandona y se repite entero por `seek`.

Además hay tres salidas de seguridad, y las tres hicieron falta:

- **Atasco** — si no llega un fotograma en 3 s (vídeo oculto, pestaña en segundo
  plano, ventana sin componer), se abandona.
- **Cobertura** — si los fotogramas entregados no abarcan al menos el 80% del
  recorte, se abandona **aunque no se haya detectado ni una pérdida**.
- **Rearme** — al abandonar se avisa a quien consume para que tire el recorrido a
  medias y vuelva a sembrar el seguimiento.

`seek` sigue siendo la única vía en Firefox, que no tiene
`requestVideoFrameCallback`.

---

## 7. Limitaciones de precisión actuales

Ordenadas por cuánto mueven el resultado.

1. **La escala multiplica todo.** Un error del 10% en la altura de la elipse son
   10% en velocidad y ROM, ~21% en potencia y ~5 puntos de %1RM. Medido sobre
   sintéticos, el detector acierta a ±2,6%. Es el mayor término de error del
   sistema y no tiene forma de mejorar sin una referencia externa — que es
   exactamente para lo que sirve la Fase 9.

2. **Movimiento fuera del plano.** Se supone vídeo lateral y que la barra se mueve
   en un plano paralelo al sensor. Si el atleta se acerca o se aleja de la cámara,
   la escala cambia durante la repetición y nadie lo modela. La obliquidad se
   estima y se guarda, pero solo se usa para penalizar la nota, no para corregir.
   **Con una sola cámara esto no se puede resolver del todo**; sí se puede acotar.

3. **Velocidad máxima aún −6,9%** a 30 fps. Es el residuo del filtrado y ya no se
   arregla moviendo la ventana: haría falta más muestreo o extrapolar el pico.

4. **Solo se enseña y se guarda la mejor repetición.** `extractLiftingPhases`
   devuelve todas las concéntricas con sus métricas completas, y
   `MetricsDashboard` se queda con la de mayor velocidad de pico y **tira el
   resto**. La pérdida de velocidad se calcula primera-vs-última y nada más. Es el
   hueco más barato de cerrar de todo el informe: los datos ya están calculados.

5. **El sticking point es un punto, no una zona.** `findSticking` devuelve el valle
   entre dos máximos de velocidad —que es la definición correcta, y devolver `null`
   cuando la barra sube de un tirón es información, no un fallo—. Pero no hay
   inicio, ni fin, ni % del ROM, ni marca sobre la gráfica.

6. **`estimate1RM` usa perfiles genéricos.** `mvt` y `slope` constantes por
   levantamiento, cuando la aplicación **ya calcula el perfil del propio atleta**
   en `lib/stats/athleteStats.ts`. Al menos está declarado: fuera del tramo lineal
   marca `reliable: false` en vez de devolver una cifra saturada.

7. **`calculateDynamics` usa solo la masa de la barra** y la tarjeta se titula
   *"Fuerza Suelo"*. `F = m·(g+a)` con `m` = carga da la fuerza sobre la barra. La
   fuerza de reacción del suelo incluye la masa corporal en movimiento, que un
   vídeo de la barra no puede ver. **La etiqueta miente.** Ya estaba señalado y
   sigue sin decidirse (§11.5 de `ARQUITECTURA_VIDEO_PWR.md`).

8. **Los pesos y cortes de `quality.ts` no están validados contra nada.** Bloqueo
   <50, aviso <75, cinco dimensiones ponderadas. Es criterio razonado y ordena
   bien (un 40 es peor que un 85), pero **nadie ha comprobado que un 82 signifique
   ±3% de error real**. Está escrito en el código, que es donde tiene que estar.

---

## 8. Fase 2 solicitada vs. lo que existe

El encargo pide justificar técnicamente cualquier sustitución. Aquí está el
cotejo, paso a paso:

| Paso pedido | Existe | Veredicto |
|---|---|---|
| Detección de discos/barra | `detectByContours` + validación + Hough asistido | **Conservar.** Ver §3. |
| Tracking frame a frame | LK piramidal, nube de 24, ida-y-vuelta, mediana | **Conservar.** Ver §3. |
| Trayectoria temporal | `TrackingPoint[]` con `mediaTime` del decodificador | **Conservar**, cambiando *cómo se leen* los fotogramas (§6.3), no qué se produce. |
| Conversión píxeles → distancia real | Altura de la elipse, auto-correctora con el ángulo | **Conservar.** Es lo mejor que tiene el módulo. |
| Filtrado de señal | Mediana 3 + Savitzky-Golay no uniforme | **Conservar.** Ver §4. |
| Posición / velocidad / aceleración | Del ajuste, no derivando dos veces | **Conservar.** |
| Segmentación de repeticiones | Por reanudación de desplazamiento | **Conservar.** Ver §5. |
| Métricas biomecánicas | Parciales — ver §9 | **Ampliar.** |
| Confianza del análisis | `quality.ts`, 5 dimensiones, bloqueo duro | **Conservar y exponer mejor.** |

**No sustituyo ningún componente del motor.** El encargo pedía justificación para
sustituir; la justificación que tengo es para *no* hacerlo: cada pieza está
razonada por escrito y varias están medidas contra sintéticos. Reescribirlas
significaría volver a pagar todos los errores que ya se pagaron —el pico aplastado
un 33%, las repeticiones partidas en dos, la deriva permanente tras una oclusión—
y no hay ninguna evidencia de que la reescritura los evitara.

Lo que sí cambio es **la capa de entrada** (cómo llegan los fotogramas, §6) y
**toda la capa de salida** (qué se enseña, se exporta y se valida, §9).

---

## 9. Hueco real entre lo pedido y lo que hay

### Fase 3 — Flujo de usuario

| Se pide | Estado |
|---|---|
| Ejercicio (sentadilla/banca/muerto) | **Se pide DESPUÉS**, en `MetricsDashboard` |
| Carga (kg) | **Se pide DESPUÉS.** Llega precargada desde la serie cuando se entra por ahí; suelta, arranca en 100 kg |
| Tipo de barra | **No existe** |
| Tipo de discos | ✅ Existe (45/40/35/32 cm) |
| Confirmar vídeo lateral | **No se pide** |

Que la carga se pida después no afecta a la cinemática —solo a fuerza, potencia y
1RM—, pero sí al hueco que ya mordió una vez: analizar una serie de 60 kg con el
campo en 100 infla las cifras un 67% y nadie se acuerda de corregirlo.

### Fase 4 — Métricas

**Por repetición:** de las 13 pedidas, **9 ya se calculan** dentro de
`PhaseMetrics` (ROM, duración, duración concéntrica y excéntrica, velocidad media,
velocidad pico, velocidad del sticking, altura del sticking). Faltan: nº de
repetición, **velocidad propulsiva**, aceleración pico, tiempo hasta velocidad
máxima, inicio/fin/% de ROM del sticking. Y sobre todo: **se calculan para todas y
solo se expone una.**

> **La velocidad propulsiva merece una decisión, no una implementación.** La
> definición de Sánchez-Medina es la media hasta que la aceleración cae por debajo
> de −g. Se puede calcular ya, con la aceleración que devuelve `signal.ts`. Pero
> con −6,9% de error en el pico y la aceleración siendo la segunda derivada de una
> señal ruidosa, el umbral de −9,81 m/s² va a caer en un sitio con incertidumbre.
> Hay que medirlo contra sintéticos antes de enseñarlo.

**Por serie:** de las 9 pedidas, existen 2 (nº de repeticiones, velocity loss
primera-vs-última). Faltan 7, y todas son agregados triviales de datos ya
calculados salvo "tiempo total bajo tensión".

> **⚠️ Velocity loss se calcula de DOS formas distintas en la misma aplicación,
> y las dos escriben la misma clave.**
>
> | Dónde | Fórmula |
> |---|---|
> | `MetricsDashboard.tsx:126` (PWR) | `(primera − última) / primera` |
> | `lib/vbt/analysis.ts:191` (VBT) | `(mejor − última) / mejor` |
>
> Las dos acaban en `velocity_loss` del catálogo. La segunda es la que coincide
> con tu decisión registrada. **Esto no es un hueco de la Fase 4: es un fallo de
> consistencia sobre datos ya guardados**, y no lo arregla añadir métricas nuevas.
> Con la primera repetición siendo la más rápida —lo normal— las dos coinciden;
> cuando no lo es, PWR reporta una pérdida menor que VBT sobre la misma serie, y
> puede salir negativa (por eso hay un `Math.max(0, …)` tapándolo al guardar).

### Fase 5 — Gráficas

Existen 2 de 6: velocidad vs tiempo, y trayectoria de la barra (que no está en la
lista pedida pero es útil). **Faltan**: posición vs tiempo, velocidad vs recorrido,
aceleración vs tiempo, comparación entre repeticiones, velocity loss de la serie.
Ninguna es exportable.

### Fase 6 — Sticking point

Existe la detección del valle. Faltan inicio, fin, distancia desde el arranque, %
del ROM y el remarcado visual. Los datos están todos en `dataPoints`.

### Fase 7 — Confidence score

**Es lo mejor cubierto de todo el encargo.** 0–100, cinco dimensiones ponderadas,
fallo crítico que bloquea por sí solo sin importar la nota global, y bloqueo duro
del guardado por debajo de 50. Lo que falta es cosmético: el semáforo 🟢🟡🔴 tal
cual se pide.

### Fases 9, 10, 11 — Calibración, comparación, versionado

**No existe nada.** Ni tabla, ni entidad, ni importador CSV, ni versión del motor.
Es construcción desde cero, y es la parte del encargo que más valor tiene a largo
plazo: es lo único que puede convertir "los pesos de `quality.ts` son criterio
razonado" en "un 82 significa ±3%".

### Fase 12 — Exportación

**No existe nada para PWR.** Pero `jspdf`, `papaparse` y `html2canvas` ya están en
el proyecto, y hay un tema de PDF de marca en `src/lib/export/pdfTheme.ts` con
preferencias por entrenador. El PDF de PWR debe usarlo, no inventarse otro.

---

## 10. Orden de trabajo propuesto

Por impacto sobre lo que hoy está mal, no por el orden del encargo:

1. **Instrumentar el bucle y medir el reparto real del tiempo.** Antes de tocar
   `frameSource`. Es media hora y evita optimizar la parte que no manda.
2. **Fase 4 + 5 + 6 — todo por repetición.** Los datos ya existen; es capa de
   presentación. Es el mayor salto de utilidad por hora de trabajo de la lista.
3. **Fase 11 — versión del motor.** Una constante y una clave en la bolsa. Hacerlo
   **antes** que nada de lo demás, para que todo lo que se guarde a partir de hoy
   sepa quién lo generó.
4. **Fase 8 — WebCodecs + las redundancias de §6.2**, con respaldo al lector
   actual. Verificado contra los sintéticos para demostrar que no pierde precisión.
5. **Fase 3 — flujo previo.** Barato y cierra el hueco de la carga.
6. **Fase 12 — exportación** (CSV y Excel primero, PDF después: el PDF depende de
   que las gráficas de la Fase 5 existan).
7. **Fases 9 + 10 — calibración con encoder.** Lo último porque es lo único que no
   mejora nada para el usuario de hoy; mejora el *algoritmo* de mañana.

**Fase 7 no lleva trabajo estructural**, solo el semáforo.

---

## 11. Decisiones tomadas

Zanjado por Marc el 18 de agosto de 2026, tras leer este informe:

| Decisión | Resuelto |
|---|---|
| **Orden de trabajo** | Por impacto (§10), no por el orden numérico del encargo. |
| **"Fuerza Suelo"** | **Se corrige la ETIQUETA**, no el modelo. Pasa a llamarse «Fuerza sobre la barra». No se toca ninguna cifra ya guardada. |
| **Velocity loss** | **Se dejan las dos fórmulas** y se documenta la diferencia en el código. PWR sigue con primera-vs-última; VBT sigue con mejor-vs-última. |
| **Perfil 1RM** | **Se conecta el perfil del atleta**, con caída al genérico cuando no tenga mediciones suficientes, y declarando en pantalla cuál se ha usado. |

Sobre la última: es la única que toca superficies fuera de `pwr/` —hay que hacer
llegar el atleta hasta el módulo de cálculo—, y se hace porque es la mayor mejora
de precisión que no depende del vídeo.

Sobre "dejar las dos" en velocity loss: **es una decisión consciente, no un
descuido**, y por eso queda escrita en los dos ficheros. Lo que no puede pasar es
que dentro de seis meses alguien vea la discrepancia y la "arregle" sin saber que
se decidió así.

**Y una que asumí y quedó confirmada:** no se toca el motor de señal ni el de
segmentación, por lo argumentado en §8. La Calibration Session de las Fases 9–11
se entrega como `.sql` en `database/` para ejecutar a mano, como todo lo demás:
**no ejecuto nada contra Supabase.**

---

## 12. Estado de la implementación

*(18 de agosto de 2026. Se va actualizando conforme avanza.)*

| Fase | Estado | Dónde |
|---|---|---|
| **1 · Auditoría** | ✅ | Este documento |
| **11 · Versionado** | ✅ | `src/lib/cv/engineVersion.ts` — v2.0.0, codificada como entero en la bolsa |
| **4 · Métricas por repetición y serie** | ✅ | `pwrMath.ts` — `PhaseMetrics` ampliado + `summariseSeries` |
| **5 · Gráficas** | ✅ | `SeriesReport.tsx` — las 6 pedidas + detalle de sticking, cada una exportable a PNG |
| **6 · Sticking point** | ✅ | `StickingZone` — inicio, fin, mínimo, distancia, % de ROM, marcado sobre la gráfica |
| **7 · Confidence score** | ✅ (ya existía) | `quality.ts` sin cambios |
| **3 · Flujo previo** | ✅ | `lib/cv/pwrSetup.ts` + `AnalysisSetup.tsx` — ejercicio, carga, barra y confirmación del vídeo ANTES de analizar, y sin ellos no se monta el analizador |
| **8 · Rendimiento** | 🟡 | `frameSource.ts` — medido, reescrito por reproducción con contrapresión. **La vía rápida no se ha podido verificar aquí** (ver abajo) |
| **12 · Exportación** | ✅ | `lib/export/pwrReport.ts` + `pwrExport.ts` + `xlsxWriter.ts` — CSV, Excel y PDF con gráficas, más PNG por gráfica |
| **9 · Calibración con encoder** | ✅ | `database/pwr_calibration.sql` + `services/calibrationService.ts`. El importador de CSV **ya existía** (`lib/vbt/csv.ts` + `utils/vbtParser.ts`) y se reutiliza |
| **10 · Comparación automática** | ✅ | `lib/calibration/agreement.ts` + `CalibrationModal.tsx` — sesgo, error absoluto, RMSE y límites de Bland-Altman, verificados contra dispersiones construidas |

### Lo verificado, y cómo

**Contra repeticiones sintéticas** (6 formas de levantamiento × 2 cadencias ×
3 niveles de ruido × 3 semillas = 108 repeticiones), construyendo el perfil de
VELOCIDAD e integrándolo para conocer la verdad de forma exacta:

| | sesgo | \|error\| medio |
|---|---|---|
| recorrido | +0,3% | 0,3% |
| duración | +5,1% | 5,2% |
| velocidad media | −4,4% | 4,5% |
| velocidad máxima | −2,6% | 3,4% |
| **aceleración pico** | **−9,7%** | **17,3%** |
| tiempo hasta el pico | +9,0% | 10,5% |
| velocidad propulsiva | −4,6% | 4,6% |
| % propulsivo | +2,8 pp | 2,8 pp |
| sticking: % del ROM | −0,1 pp | 0,5 pp |
| sticking: duración | −6,1% | 6,7% |
| sticking: velocidad mínima | +7,9% | 19,1% |

- **108/108 repeticiones segmentadas correctamente.**
- **18/18 estancamientos detectados, 0 inventados** donde no los había.
- Pérdida de velocidad sobre una serie de 3 con fatiga conocida: **25,9% medido
  frente a 26,0% real.**

**En el navegador**, con un banco de pruebas que alimenta el informe con
repeticiones sintéticas pasadas por el motor real (`/pwr-preview.html`, solo en
desarrollo — verificado que **no entra en el bundle de producción**): las 22
curvas de las 8 gráficas pintan, sin trazados vacíos, sin errores de consola, y
en móvil (375 px) la página no desborda y la tabla se desplaza dentro de su
propia caja.

### Fase 8: qué está verificado y qué no

**Verificado:** la vuelta atrás. En el entorno donde se midió, el panel del
navegador no compone fotogramas, así que `requestVideoFrameCallback` **no
dispara nunca** — el peor caso posible para el lector nuevo. Se comportó como
tiene que comportarse: detectó el atasco en 3 s, avisó para rearmar el
seguimiento, repitió por `seek` y entregó **los 121 fotogramas íntegros**, con
`fellBack: true` en el informe.

**NO verificado: la vía rápida.** Por ese mismo motivo —el entorno no presenta
fotogramas— no se ha podido ejecutar ni una sola vez el camino de reproducción.
Lo que está medido es el cálculo que lo justifica (22 ms de seguimiento contra
33 ms de fotograma) y que el respaldo funciona; **la mejora en sí está sin
comprobar y hay que comprobarla en un navegador de verdad.**

El riesgo, si la vía rápida no funcionara en algún dispositivo, está acotado por
diseño: tres segundos de atasco y se cae al comportamiento anterior, que es el
que había. No puede salir peor que hoy, solo tres segundos más lento.

### Un fallo mío, encontrado por el propio banco

La primera versión del lector nuevo **devolvía «correcto» con cero fotogramas
entregados**. Al no haberse abandonado explícitamente, daba el resultado por
bueno; aguas abajo eso es un recorrido vacío y un «no se ha reconocido ninguna
repetición» del que nadie podría deducir la causa. Exactamente la clase de fallo
silencioso que este módulo lleva arrastrando desde el principio.

No lo vi leyendo el código que acababa de escribir. Lo dijo el banco: 0
fotogramas, 0 pérdidas, ninguna queja.

Y la comprobación que lo cierra **no cuenta fotogramas, mide cobertura de
tiempo**, porque el número esperado sale de la cadencia estimada y esa
estimación falla precisamente en el mismo caso que se está vigilando: se
esperaban 90 fotogramas y el vídeo tenía 121.

### Otro fallo, este preexistente: `measureFps` mentía

`measureFps` devolvía `exact: true` en su rama de FALLO. Si
`requestVideoFrameCallback` no llega a dispararse, ahí no se ha medido nada —se
está devolviendo la suposición de 30 fps— y declararla «exacta» hacía que
`quality.ts` **NO penalizara** un vídeo cuyos instantes son justamente los que no
se pueden verificar. Se veía como «30,00 fps medidos · instantes exactos», que es
idéntico a lo que se ve cuando todo va bien. Corregido a `exact: false`.

### Fase 12: tres formatos, y por qué no son tres copias

| | Para qué | Decisión |
|---|---|---|
| **CSV** | Máquinas: pandas, R, scripts | Coma y punto decimal (RFC 4180), con BOM para los acentos |
| **Excel** | Abrirlo y mirarlo | `.xlsx` de verdad, tres hojas, números tipados |
| **PDF** | Leerlo y mandarlo | A4 en blanco y negro, con las 7 gráficas y las salvedades |

El CSV va en el estándar internacional aunque un Excel en español espere `;` y
coma decimal: **no hay una elección que funcione en los dos idiomas**, así que se
elige por uso. Quien quiera abrirlo en Excel tiene el `.xlsx`, que no tiene ese
problema porque los números van tipados y no como texto.

**El `.xlsx` se escribe a mano, sin dependencia nueva.** Un `.xlsx` es un ZIP con
cuatro XML dentro; se escribe sin comprimir (el ZIP lo admite y Excel lo abre
igual) y sale en ~250 líneas. La alternativa era meter 400 KB–1 MB de librería en
una pantalla que ya carga 670 KB de OpenCV. Verificado: el fichero se descomprime
como ZIP válido, las 8 piezas son XML bien formado, las relaciones cuadran y las
celdas de datos son NÚMEROS —`B2=0.48`—, no texto.

La alternativa fácil, renombrar un CSV a `.xls`, se descartó: Excel avisa de que
el formato no coincide con la extensión y el usuario aprende a ignorar ese aviso.

### Dos fallos del PDF que solo cantaban por el tamaño del fichero

Los dos en la misma línea de código: **qué SVG es «la gráfica»**.

1. `card.querySelector('svg')` devolvía el **icono de descarga** de la cabecera
   —los iconos de lucide son SVG—. El PDF salía con siete iconos de 13×13 px en
   lugar de las gráficas.
2. Corregido a `svg.recharts-surface`, seguía fallando en la única gráfica **con
   leyenda**: tiene varias superficies de Recharts y la primera del documento es
   el cuadradito de color de la leyenda, de 14×14.

Lo importante es cómo se vieron. **Por fuera todo cuadraba**: siete figuras,
ocho páginas, sin un error en consola. Lo único que no encajaba era el tamaño del
fichero —28 KB cuando siete PNG a doble resolución son 420—. Ahora se coge la
superficie **más grande**, que no depende del orden del documento ni de qué
decoraciones lleve la gráfica, y hay una guarda que descarta cualquier figura
menor de 60×40 px por si aparece una tercera forma de colarse.

### Dos hallazgos que salieron de medir, no de leer

1. **La velocidad propulsiva salía siempre «100%».** El cruce por −g se buscaba
   solo hasta el final del movimiento «con velocidad apreciable», y ese suceso
   ocurre justo en la deceleración final, que es el tramo que el umbral del 8%
   deja fuera. Nunca se encontraba. Y el síntoma era un 100% en todas las
   repeticiones, que es exactamente el número que uno esperaría ver si la
   métrica estuviera bien: **no cantaba**. Solo apareció al meter perfiles
   balísticos en el banco de pruebas, donde la verdad era 66% y 74%.

2. **La aceleración pico venía sesgada un −23%.** La ventana de 0,18 s está
   elegida a propósito ancha para que la fuerza y la potencia no salgan
   ruidosas, pero una ventana ancha aplasta un máximo por construcción. Se
   barrió el canje y se resolvió con un **ajuste aparte, más estrecho (0,10 s),
   usado SOLO para el pico**: baja el sesgo a −9,7% y **no toca ni un decimal**
   de la fuerza, la potencia ni el RFD ya guardados.

### El detector del disco, medido en la tercera tanda

Se descubrió que OpenCV arranca en Node, así que `cv.worker.js` se puede medir
sin navegador (`scripts/verify/deteccion-disco.mjs`, 52 casos). Salió un fallo
grave: `pickOutermost` no podía ascender del BUJE al borde del disco porque el
tope de crecimiento era 3× y el salto es 3,57×. Resultado: −71,5% en la altura,
con confianza 0,85, en discos grandes de color oscuro. Error absoluto medio del
detector: **16,0% → 4,0%**. Ver §12 del RECAP.

### Lo que sigue sin estar bien, dicho claramente

- **La aceleración pico tiene un 17% de error absoluto** aun después de
  arreglarla. Es la segunda derivada de una señal ruidosa y de un vídeo no se
  saca mejor. Se enseña con el aviso escrito al pie de la tabla y en el catálogo:
  sirve para ordenar repeticiones dentro de una serie, no para comparar con un
  encoder.
- **El tiempo hasta la velocidad máxima es ambiguo por naturaleza** en
  levantamientos con dos picos: puede saltar de uno al otro entre repeticiones
  casi idénticas (el peor caso del barrido es +110%). No es un fallo del
  cálculo, es que la métrica no está bien definida en esa situación. Está dicho
  en la descripción del catálogo.
- **El reparto real del tiempo de análisis sigue sin medirse.** El desglose de
  §6 es analítico. Antes de tocar `frameSource` hay que cronometrarlo.

---

## 13. Compromisos de método

- Nada de IA generativa en el camino del cálculo. No la hay hoy y no la habrá.
- **Todo cambio en el análisis se verifica contra repeticiones sintéticas** antes
  de darlo por bueno, con el método de `pwr-verificacion-sintetica`: se construye
  el perfil de velocidad, se integra para la posición, y así ROM, media y pico son
  conocidos de forma exacta. Los números bonitos en pantalla no prueban nada.
- Ninguna métrica nueva lleva `ALTER TABLE`: bolsa JSONB + `INSERT` en
  `metric_definitions`.
- Nada fuera de PWR Analysis.
