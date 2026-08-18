# PWR ANALYSIS 2.0 — Recapitulación de la sesión

**Qué es Anvil, qué es PWR Analysis, y todo lo que se ha hecho aquí.**
Fecha: 18 de agosto de 2026.

---

## 1. El proyecto

**Anvil Strength** es el club digital de powerlifting: una aplicación web (React
19 + TypeScript + Vite + Tailwind, con Supabase detrás) donde entrenadores
programan y atletas ejecutan. Tiene programación semanal, registro de series,
check-ins, nutrición, competiciones, mensajería, estadísticas y PDF de
entrenamiento.

Dentro de todo eso hay una herramienta que no se parece a las demás:

### PWR Analysis

**Mide la velocidad de la barra a partir de un vídeo normal de móvil.** Sin
encoder, sin sensores y sin que el vídeo salga del dispositivo.

Es la parte de VBT (*velocity-based training*) de Anvil: la velocidad a la que se
mueve una barra dice cuánto esfuerzo real está costando una serie, y eso permite
ajustar la carga por lo que el atleta puede hacer HOY en vez de por un porcentaje
escrito hace tres semanas. Los aparatos que lo miden bien —encoders lineales—
cuestan entre 300 y 1.000 €.

**Todo ocurre en el navegador.** El vídeo se lee del fichero local, se procesa
contra un `<canvas>` y se descarta; lo único que se guarda son las métricas
(~200 bytes). No hay bucket, ni cola, ni servidor de proceso, ni coste mensual, y
no hay vídeos de gente entrenando en ningún sitio.

---

## 2. Cómo funciona PWR Analysis

```
  <input type=file>  ──►  <video> local (blob URL)
          │
          ▼
  VideoTrimmer ................... recorta a la repetición
          │
          ▼
  frameSource.ts ................. lee fotograma a fotograma, con el instante
          │                        REAL del descodificador
          ▼  ImageData
  tracker.ts ..................... puente con el hilo de visión
          │
          ▼  postMessage
  cv.worker.js (OpenCV WASM)
     · detecta el DISCO ajustando una ELIPSE (no un círculo)
     · lo sigue con Lucas-Kanade piramidal: nube de ~24 puntos,
       validación ida-y-vuelta, mediana del conjunto
          │
          ▼  recorrido en píxeles + instantes
  plateGeometry.ts ............... px → metros por la ALTURA de la elipse
          │
          ▼
  signal.ts ...................... mediana de 3 + regresión local cuadrática
          │                        (Savitzky-Golay para muestreo no uniforme)
          ▼  posición · velocidad · aceleración
  pwrMath.ts ..................... segmenta repeticiones y calcula métricas
          │
          ▼
  quality.ts ..................... nota de fiabilidad 0-100, con bloqueo duro
          │
          ▼
  MetricsDashboard + SeriesReport . se enseña, se guarda, se exporta
```

### Las tres ideas que sostienen la precisión

**1. La escala se toma de la ALTURA del disco, no de su diámetro.**
Con la cámara girada un ángulo θ respecto de la perpendicular, lo vertical se
proyecta a escala completa y lo horizontal se comprime por cos θ. Como el
levantamiento se mide en vertical, **la altura da la escala correcta sea cual sea
θ**. Y si la cámara está alta o baja, la altura del disco se comprime igual que
el recorrido de la barra, y el cociente vuelve a salir bien. Medir el diámetro
solo acierta con la cámara perfectamente perpendicular, que no lo está nunca.

**2. La velocidad sale de un AJUSTE, no de derivar una señal suavizada.**
Para cada punto se ajusta una parábola por mínimos cuadrados a los vecinos dentro
de una ventana definida **en segundos** (no en muestras), y se leen del ajuste la
posición, la pendiente y la curvatura. Suavizar y luego derivar aplica el filtro
dos veces y aplasta el pico; una parábola sí puede describir un máximo.

**3. Una repetición se cierra por lo que pasa DESPUÉS de la parada.**
Un umbral seco de velocidad parte en dos cualquier repetición con punto de
estancamiento — justo las series pesadas, que son las interesantes. Aquí, al
llegar a una parada se mira hacia delante 0,6 s: si la barra avanza 3 cm más en
el mismo sentido antes de invertirse, era un estancamiento y la fase continúa. Se
mide por **desplazamiento**, no por velocidad, porque a 60 Hz un píxel de ruido
son 0,09 m/s.

---

## 3. Lo que se ha hecho en esta sesión

### Fase 1 — Auditoría (`docs/AUDITORIA_PWR_2.0.md`)

Se auditó el módulo entero antes de tocar nada. **Conclusión principal: el motor
que pedía la Fase 2 ya existía y estaba bien construido.** No se sustituyó nada
del núcleo —detector, seguidor, filtrado, segmentación—, y la justificación es
que cada pieza estaba razonada por escrito y varias medidas contra sintéticos;
reescribirlas habría significado volver a pagar errores ya pagados.

Se identificaron seis huecos reales, todos en la ENTRADA y la SALIDA, no en el
cálculo.

### Fase 11 — Versión del motor (`src/lib/cv/engineVersion.ts`) ✅

`PWR Engine v2.0.0`, codificada como entero (`mayor×10000 + menor×100 + parche`)
porque la bolsa de métricas es numérica. Permite reanalizar vídeos antiguos y
comparar precisión entre versiones, y expulsar del perfil carga-velocidad las
mediciones de un motor que se descubra sesgado. Lo anterior queda como
«anterior a v2.0», que es más honesto que inventarle un v0.0.0.

### Fase 4 — Métricas por repetición y por serie (`pwrMath.ts`) ✅

Antes se calculaban TODAS las repeticiones y se enseñaba UNA; el resto se tiraba
en el mismo `useMemo` que las calculaba.

Nuevo por repetición: número de repetición, **velocidad propulsiva** y % de
recorrido propulsivo, aceleración pico, tiempo hasta la velocidad máxima, y la
zona de estancamiento completa.

Nuevo por serie (`summariseSeries`): repeticiones, ROM medio, velocidad media,
propulsiva media, mejor y peor repetición, pérdida de velocidad, consistencia
(CV), potencia media y máxima, tiempo bajo tensión y tiempo en movimiento.

### Fase 6 — Zona de estancamiento ✅

Antes era un punto; ahora es una zona con inicio, fin, instante del mínimo,
duración, distancia desde el arranque y **% del ROM** —que es el número
comparable entre atletas, porque no depende de lo largo que sea el recorrido de
cada uno—. Los bordes se toman a media profundidad entre el fondo del valle y el
menor de los dos picos que lo rodean, con el cruce interpolado.

### Fase 5 — Las seis gráficas (`SeriesReport.tsx`) ✅

Velocidad vs tiempo · Posición vs tiempo · Velocidad vs recorrido · Aceleración
vs tiempo (con la línea de −g) · Comparación entre repeticiones · Pérdida de
velocidad de la serie. Más una séptima: el detalle del estancamiento con la zona
sombreada. Todas exportables a PNG, y una tabla repetición a repetición.

Las comparaciones van contra el **% de recorrido** y no solo contra el tiempo:
dos repeticiones de la misma serie duran distinto, y superpuestas contra el
tiempo la más lenta se sale por la derecha. Contra el % de ROM se ve **dónde**
—a qué altura del levantamiento— se perdió la velocidad.

### Fase 8 — Rendimiento (`frameSource.ts`) 🟡

**Se midió antes de optimizar**, y la medición corrigió la propia auditoría:

| Etapa | ms/fotograma | % |
|---|---|---|
| Leer el fotograma (`seek` + dibujar + `getImageData`) | 199–243 | **90%** |
| Seguimiento (transferencia + flujo óptico ×2) | 20–27 | 10% |
| Copia redundante de 3,5 MB | 1,1 | **0,5%** |

Las «redundancias» que la auditoría iba a atacar resultaron ser ruido. El `seek`
era el 90%.

La solución **no necesita WebCodecs** ni un demultiplexor de MP4: se reproduce el
vídeo y se cogen los fotogramas al vuelo con `requestVideoFrameCallback`. El dato
que lo hace viable es que el seguimiento cuesta 22 ms, **menos que los 33 ms que
dura un fotograma a 30 fps**.

Y no es volver al fallo antiguo —hace dos revisiones se analizaba reproduciendo y
perdía la mitad de los fotogramas— porque ahora hay **contrapresión**: los
fotogramas entran en una cola de 8 y, cuando se llena, se PAUSA el vídeo. Más
tres salidas de seguridad: atasco a los 3 s, cobertura temporal mínima del 80%, y
aviso de rearme a quien consume. Por encima de un 4% de fotogramas perdidos se
abandona y se repite entero por `seek`.

### Fase 12 — Exportación ✅

| | Para qué | Decisión |
|---|---|---|
| **CSV** | Máquinas (pandas, R) | Coma y punto decimal (RFC 4180), con BOM |
| **Excel** | Abrirlo y mirarlo | `.xlsx` real, tres hojas, números tipados |
| **PDF** | Leerlo y mandarlo | A4 blanco y negro, 7 gráficas, salvedades |

El `.xlsx` se escribe **a mano, sin dependencia nueva**: un `.xlsx` es un ZIP con
cuatro XML dentro, y sin comprimir sale en ~250 líneas, contra los 400 KB–1 MB de
una librería en una pantalla que ya carga 670 KB de OpenCV.

### Fase 7 — Confianza

Ya existía y no se tocó: cinco dimensiones ponderadas, fallo crítico que bloquea
por sí solo, bloqueo duro del guardado por debajo de 50.

---

## 4. Verificación — qué se comprobó y cómo

**El principio de esta sesión:** el analizador siempre devuelve números bonitos,
así que mirarlo por pantalla no prueba nada. Todo se midió.

### Contra 108 repeticiones sintéticas

Se construye el perfil de VELOCIDAD y se integra para la posición, de modo que
recorrido, velocidad media, pico, aceleración y estancamiento se conocen de forma
exacta. 6 formas de levantamiento × 2 cadencias × 3 niveles de ruido × 3 semillas.

| | sesgo | \|error\| medio |
|---|---|---|
| recorrido | +0,3% | 0,3% |
| velocidad media | −4,4% | 4,5% |
| velocidad máxima | −2,6% | 3,4% |
| **aceleración pico** | **−9,7%** | **17,3%** |
| velocidad propulsiva | −4,6% | 4,6% |
| sticking: % del ROM | −0,1 pp | 0,5 pp |

- **108/108 repeticiones segmentadas correctamente.**
- **18/18 estancamientos detectados, 0 inventados.**
- Pérdida de velocidad sobre una serie con fatiga conocida: **25,9% medido frente
  a 26,0% real.**

### En el navegador

Dos bancos de pruebas que **no entran en el bundle de producción** (verificado):

- `/pwr-preview.html` — alimenta el informe con repeticiones sintéticas pasadas
  por el motor real. Las 22 curvas de las 8 gráficas pintan, sin trazados vacíos
  ni errores de consola, y en móvil (375 px) la página no desborda.
- `/pwr-bench.html` — genera un vídeo real de 1280×720 y cronometra cada etapa.

---

## 5. Los siete fallos que salieron de MEDIR, no de leer

Esta es la parte que más vale conservar.

**1. La velocidad propulsiva salía siempre «100%».**
El cruce por −g se buscaba solo hasta el final del movimiento «con velocidad
apreciable», y ese suceso ocurre justo en la deceleración final, que es el tramo
que el umbral del 8% deja fuera. Nunca se encontraba. Y el síntoma —100%
propulsivo en toda la serie— es exactamente lo que uno espera ver en una serie
pesada: **no cantaba**. Apareció al meter perfiles balísticos en el banco, donde
la verdad era 66% y 74%.

**2. La aceleración pico venía sesgada un −23%.**
La ventana de 0,18 s está elegida ancha a propósito para que fuerza y potencia no
salgan ruidosas, pero una ventana ancha aplasta un máximo por construcción. Se
barrió el canje y se resolvió con un ajuste **aparte y más estrecho (0,10 s) solo
para el pico**: baja el sesgo a −9,7% y no toca ni un decimal de la fuerza, la
potencia ni el RFD ya guardados.

**3. El lector nuevo devolvía «correcto» con CERO fotogramas.**
Al no haberse abandonado explícitamente, daba el resultado por bueno. Aguas abajo
eso es un recorrido vacío y un «no se ha reconocido ninguna repetición» del que
nadie deduce la causa. No se vio leyendo el código recién escrito; lo dijo el
banco: 0 fotogramas, 0 pérdidas, ninguna queja.

**4. Y la comprobación que lo cierra no cuenta fotogramas: mide COBERTURA DE
TIEMPO.** El recuento esperado sale de la cadencia estimada, y esa estimación
falla precisamente en el mismo caso que se está vigilando. Se vio en el banco: se
esperaban 90 fotogramas y el vídeo tenía 121.

**5. `measureFps` mentía (fallo preexistente).**
Devolvía `exact: true` en su rama de FALLO. Si `requestVideoFrameCallback` no
dispara, ahí no se ha medido nada —se devuelve la suposición de 30 fps— y
declararla exacta hacía que `quality.ts` **no penalizara** un vídeo cuyos
instantes son justamente los que no se pueden verificar. Se veía como
«30,00 fps medidos · instantes exactos», idéntico a cuando todo va bien.

**6 y 7. El PDF llevaba iconos en vez de gráficas.**
`querySelector('svg')` devolvía el icono de descarga de la cabecera —los iconos
de lucide son SVG—. Corregido a `.recharts-surface`, seguía fallando en la única
gráfica **con leyenda**, porque la primera superficie del documento es el
cuadradito de color de la leyenda. Por fuera todo cuadraba: siete figuras, ocho
páginas, cero errores. Lo único que no encajaba era que el PDF pesara 28 KB
cuando siete PNG a doble resolución son 420.

---

## 6. Lo que sigue sin estar bien, dicho claramente

- **La aceleración pico conserva un 17% de error absoluto.** Es la segunda
  derivada de una señal ruidosa y de un vídeo no sale mejor. Se enseña con el
  aviso escrito al pie de la tabla, en el catálogo y en las exportaciones: sirve
  para ordenar repeticiones de una misma serie, no para comparar con un encoder.
- **El tiempo hasta la velocidad máxima es ambiguo por naturaleza** en
  levantamientos con dos picos: puede saltar de uno al otro entre repeticiones
  casi idénticas. No es un fallo del cálculo; la métrica no está bien definida en
  esa situación.
- **La vía rápida de la Fase 8 está SIN VERIFICAR.** El entorno donde se trabajó
  no compone fotogramas, así que `requestVideoFrameCallback` no dispara nunca y
  no se pudo ejecutar ni una vez. Lo que sí está verificado es la vuelta atrás:
  detectó el atasco en 3 s y entregó los 121 fotogramas íntegros por `seek`. El
  riesgo está acotado: si fallara, son 3 s y se cae al comportamiento de hoy.
  **Hay que probarlo en un navegador de verdad con un vídeo real.**
- **Los pesos y cortes de `quality.ts` no están validados contra un encoder.**
  Ordenan bien, pero nadie ha comprobado que un 82 signifique ±3% de error real.
  Para eso son las Fases 9 y 10.

---

## 7. Decisiones tomadas

| Decisión | Resuelto |
|---|---|
| Orden de trabajo | Por impacto, no por el orden numérico del encargo |
| **«Fuerza Suelo»** | Se corrige la ETIQUETA («Fuerza en barra»), no el modelo. No se toca ninguna cifra guardada |
| **Velocity loss** | **Se dejan las DOS fórmulas** y se documenta. PWR usa primera-vs-última; VBT usa mejor-vs-última |
| **Perfil 1RM** | Se conectará el perfil del atleta con caída al genérico |

Sobre «dejar las dos» en velocity loss: es una decisión consciente y por eso
queda escrita en los dos ficheros. Lo que no puede pasar es que dentro de seis
meses alguien vea la discrepancia y la «arregle» sin saber que se decidió así.

---

## 8. Ficheros

### Nuevos

| Fichero | Qué es |
|---|---|
| `src/lib/cv/engineVersion.ts` | Versión del motor (F11) |
| `src/lib/cv/signal.ts` | Filtrado y derivación |
| `src/lib/cv/frameSource.ts` | Lector de fotogramas, con las dos estrategias |
| `src/features/coach/components/pwr/SeriesReport.tsx` | Tabla por repetición + 7 gráficas + exportación |
| `src/features/coach/components/pwr/VideoTrimmer.tsx` | Recorte del vídeo |
| `src/lib/export/pwrReport.ts` | Modelo de datos común de las tres exportaciones |
| `src/lib/export/pwrExport.ts` | CSV, PDF y rasterizado de gráficas |
| `src/lib/export/xlsxWriter.ts` | Escritor de `.xlsx` sin dependencias |
| `database/metrics_catalog_pwr2.sql` | Las 12 métricas nuevas |
| `docs/AUDITORIA_PWR_2.0.md` | La auditoría y su seguimiento |
| `pwr-preview.html` + `src/dev/pwrPreview.tsx` | Banco del informe (solo desarrollo) |
| `pwr-bench.html` + `src/dev/pwrBench.tsx` | Banco de medición (solo desarrollo) |

### Modificados

`src/lib/cv/pwrMath.ts` · `src/lib/cv/quality.ts` · `src/lib/cv/tracker.ts` ·
`src/lib/cv/cv.worker.js` · `src/features/coach/components/pwr/MetricsDashboard.tsx` ·
`src/features/coach/components/pwr/VideoTracker.tsx`

---

## 9. Aparte: por qué no se podía generar el enlace de acceso de un atleta

Se investigó el fallo de «creo un atleta y luego no me deja generar el enlace
para asociarle una cuenta».

**No es un fallo del código.** Se revisó el camino entero y está bien:

- el botón del enlace SÍ se pinta para un atleta recién creado (aparece cuando
  `account_status !== 'active'`, y un atleta nuevo queda en `managed`);
- `upsert_coach_athlete` crea el vínculo con `status = 'active'`, que es lo que
  `create_claim_link` exige;
- los errores de la función de borde se propagan a la pantalla con su motivo real.

**La causa es de DESPLIEGUE: la función de borde `athletes` no está desplegada
con el código del commit `bb440d6c`.**

Se comprobó sondeando la función en producción. `peek_claim` es una acción
**pública** que el router atiende ANTES de autenticar:

```ts
if (PUBLIC_ACTIONS.has(String(body.action))) {   // ← peek_claim, claim
    switch (body.action) { case 'peek_claim': ... }
}
const caller = await resolveCaller(req);
if (!caller) return json({ error: 'No autorizado.' }, 401);
```

La función desplegada responde `401 No autorizado` a `peek_claim`. Si tuviera
este código, jamás llegaría a esa línea. Es la versión anterior.

Por eso `create_claim_link` cae en el `default:` y devuelve **«Acción
desconocida: create_claim_link»**.

### Lo que se arregló en código

El mensaje. `athletesService` ahora traduce los dos fallos que en realidad son
«esto no está desplegado» a una instrucción concreta:

| Lo que llegaba | Lo que dice ahora |
|---|---|
| `Acción desconocida: create_claim_link` | «Esta función del servidor está desactualizada… hay que volver a desplegarla: `supabase functions deploy athletes`» |
| `relation "athlete_claim_links" does not exist` | «Falta la tabla… hay que ejecutar `database/CLAIM_LINK.sql` en Supabase» |

Un `git push` despliega el código del navegador **y nada más**. Entre que una
función nueva entra en el repositorio y alguien se acuerda de desplegarla hay una
ventana en la que la aplicación pide algo que el servidor no sabe hacer, y hasta
ahora esa ventana se veía como un mensaje sin sentido y sin salida.

### Lo que tienes que hacer tú

```bash
supabase functions deploy athletes
```

Y ejecutar `database/CLAIM_LINK.sql` en el editor SQL de Supabase, porque el
mismo commit trajo la tabla y tampoco se despliega sola. (No se pudo comprobar
desde aquí si la tabla existe: hace falta `service_role`, y la RLS la cierra a
`anon` a propósito.)

---

## 10. Pendiente

| Fase | Qué falta |
|---|---|
| **3** | Pedir ejercicio, carga, tipo de barra y confirmación de vídeo lateral ANTES de analizar |
| **9** | Infraestructura de calibración con encoder ADR (entidad, importador CSV) |
| **10** | Comparación automática encoder vs PWR: error absoluto, %, RMSE, informe de precisión |

### ⚠️ SQL que hay que ejecutar a mano en Supabase

El push despliega el código, **no el SQL**. Pendientes:

1. `database/metrics_catalog_quality.sql` — si no se ejecutó ya
2. `database/metrics_catalog_pwr2.sql` — las 12 métricas nuevas de esta sesión

Sin ellos las métricas nuevas se guardan igual, pero se redondean a 2 decimales
y se pintan con la clave por etiqueta en vez de con su nombre.
