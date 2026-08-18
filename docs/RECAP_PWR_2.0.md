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

## 6. Lo que seguía sin estar bien al cerrar la primera sesión

> Actualizado en §11: el perfil de 1RM y las Fases 3, 9 y 10 ya están cerrados.
> La vía rápida de vídeo sigue sin verificarse.

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
| **Perfil 1RM** | ✅ Hecho en la segunda sesión (§10): recta del atleta, caída al genérico **diciendo por qué** |

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

### Nuevos en la segunda sesión

| Fichero | Qué es |
|---|---|
| `src/lib/cv/pwrSetup.ts` | Reglas del ajuste previo: barras, validación, salvedades (F3) |
| `src/features/coach/components/pwr/AnalysisSetup.tsx` | La pantalla del ajuste previo y su resumen |
| `src/features/coach/components/pwr/useAthleteVelocityProfile.ts` | Trae la recta del atleta para el 1RM |
| `src/lib/calibration/agreement.ts` | Acuerdo con un encoder: sesgo, RMSE, Bland-Altman (F10) |
| `src/services/calibrationService.ts` | Guardado y lectura de sesiones de calibración |
| `src/features/coach/components/pwr/CalibrationModal.tsx` | Importar el CSV y ver la comparación |
| `database/pwr_calibration.sql` | Tablas, vista del informe y `bar_mass_kg` (F9) |
| `scripts/ts-resolver.mjs` | Deja ejecutar el código de `src/` en Node |
| `scripts/verify/*` | Los tres bancos de verificación — `npm run verify` |

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

## 10. Segunda sesión — las tres fases que quedaban

**Fecha: 18 de agosto de 2026, continuación.** Cerradas las Fases 3, 9 y 10, y
la decisión del perfil de 1RM que estaba tomada y sin implementar.

### Fase 3 — Se pregunta ANTES, y sin contestar no se analiza ✅

`src/lib/cv/pwrSetup.ts` (reglas) + `AnalysisSetup.tsx` (pantalla). Ejercicio,
carga total, tipo de barra y confirmación de las condiciones del vídeo.

**La carga arrancaba en 100 kg.** Analizar una serie de 60 con ese campo sin
tocar infla fuerza, potencia y 1RM un 67%, y el número que sale ya parece
bueno. Ahora arranca **vacía**: un valor por defecto es una respuesta ya
escrita que se acepta sin leerla.

Es una PUERTA, no unos campos al lado del botón de subir: sin ajuste válido el
analizador no se monta. Lo que bloquea es solo lo que produciría un número
falso en silencio —sin carga, carga menor que la barra sola, vídeo sin
confirmar—; 700 kg avisa y deja pasar.

El **tipo de barra** se gana el sitio por dos cosas y no por decorar: la masa
con la que se comprueba que la carga sea posible, y `plateLagsBar` — una barra
de peso muerto flexa antes de que el disco despegue, así que el arranque que se
mide es el del DISCO, que va por detrás del de la barra. Esa salvedad viaja
hasta el panel de métricas.

### El 1RM ya usa la recta del atleta ✅

Estaba decidido en §11 de la auditoría y sin hacer. `estimate1RM` acepta el
perfil del atleta y, cuando lo hay, la cuenta es directa: desde el punto medido
HOY se avanza por SU pendiente hasta la velocidad de un máximo.

    1RM = carga + (mvt − v) / pendiente

Verificado construyendo atletas de 1RM conocido: **recupera el valor exacto**,
mientras el genérico se equivoca entre un 0,1% y un 3,5% en los mismos casos.

Se niega a usarlo —y dice por qué— con menos de 4 mediciones, R² por debajo de
0,8, pendiente positiva, o **todas las cargas dentro de 15 kg**. Este último es
el que más se olvida: tres mediciones a 100, 102 y 105 kg dan un R² excelente y
una pendiente que es casi todo ruido, y extrapolar con ella hasta el máximo
multiplica ese ruido por veinte.

### El MVT no coincidía entre dos módulos ⚠️

Salió al conectar el perfil, y no lo sabía nadie:

| | `pwrMath.ts` | `lib/vbt/analysis.ts` |
|---|---|---|
| banca | 0,15 | **0,17** |
| peso muerto | 0,20 | **0,15** |

La misma aplicación estimaba dos 1RM distintos del mismo levantamiento según
por qué pantalla se entrara. Es el mismo fallo que `velocity_loss`, con el
agravante de que aquel está decidido y documentado y este era un descuido.

Ahora sale de `MVT_BY_PATTERN`, que es la tabla que tiene la procedencia escrita
(González-Badillo, Sánchez-Medina). **Efecto medido sobre las cifras nuevas:**

| | cambio en el 1RM estimado |
|---|---|
| sentadilla | 0,0% |
| banca | −2,2% |
| **peso muerto** | **+7,7%** |

Lo ya guardado no se toca.

### Fases 9 y 10 — Calibración contra encoder ✅

`database/pwr_calibration.sql` · `lib/calibration/agreement.ts` ·
`services/calibrationService.ts` · `CalibrationModal.tsx`.

Se graba la misma serie con vídeo y con encoder, se contrastan **repetición a
repetición** y se guarda. Es lo único que puede convertir «un 82 de calidad» en
«±3% de error», porque un sintético demuestra que las matemáticas son correctas
pero no toca la cámara, el códec ni el gimnasio.

**El importador de CSV ya existía** (`lib/vbt/csv.ts` + `utils/vbtParser.ts`,
con los alias de columna de cada fabricante ya probados contra ficheros reales)
y se reutiliza tal cual. Solo hizo falta exponer el detalle por repetición.

**Lo que se calcula es acuerdo, no correlación.** La r de Pearson se enseña
porque la busca todo el mundo, detrás y con la salvedad puesta: un método que
devolviera siempre la mitad que el encoder correlaciona 1,00 con él y es
inservible. Lo que contesta la pregunta son los límites de Bland-Altman —sesgo
± 1,96·SD—, que dicen entre qué valores cae el 95% de las diferencias.

Se guardan **las parejas**, no solo el resumen: la forma de resumir va a
cambiar, y una sesión de calibración cuesta un atleta, un encoder y una tarde.

Y **no cambia ni un peso de `quality.ts`**. Con dos o tres sesiones, corregir
por el sesgo encontrado sería cambiar un sesgo conocido por otro desconocido.
Aquí se recoge la evidencia.

### La verificación ahora es reproducible ✅

`npm run verify`. Tres bancos, 60 comprobaciones, contra verdades construidas.

Antes no lo era: el barrido de 108 repeticiones de la primera sesión no quedó
en el repositorio. Y además **ningún módulo con dependencias podía ejecutarse en
Node**, porque Vite acepta imports sin extensión y Node no. Lo resuelve
`scripts/ts-resolver.mjs`, del lado de las pruebas y para todo el proyecto, en
vez de salpicar el código de producción con extensiones que alguien limpiaría
un día.

### Dos fallos corregidos en el camino

1. **El perfil del atleta se quedaba en pie al cambiar de ejercicio.** Pasar de
   sentadilla a banca estimaba el 1RM de banca con la pendiente de la
   sentadilla durante lo que tardara la petición: una cifra plausible, en
   pantalla, que luego cambiaba sola. Se compara la clave del resultado con la
   pedida, y mientras no coincidan se usa el genérico diciéndolo.
2. **Dos comprobaciones del banco de acuerdo fallaban, y el fallo estaba en el
   banco.** Un `===` sobre coma flotante y una amplitud de ruido mal calculada:
   con ocho muestras, la dispersión de un generador pseudoaleatorio se desvía
   lo bastante de la teórica como para cruzar un corte. Se pasó a diferencias
   deterministas, cuya desviación se calcula a mano.

---

## 11. Lo que sigue sin estar bien

- **La vía rápida de lectura de vídeo SIGUE SIN VERIFICARSE.** Se intentó otra
  vez, con un navegador real: el panel no compone fotogramas en este entorno,
  así que `requestVideoFrameCallback` no dispara y la vía rápida no llega a
  ejecutarse nunca. Sigue haciendo falta **un navegador de verdad, a la vista,
  con un vídeo real**. El riesgo está acotado —si falla, son 3 s y se cae al
  comportamiento de hoy— pero no está comprobado.
- **La aceleración pico conserva un 17% de error absoluto.** Sin cambios.
- **El tiempo hasta la velocidad máxima es ambiguo** en levantamientos con dos
  picos. Sin cambios.
- **Los pesos de `quality.ts` siguen sin validar.** Ya existe la
  infraestructura para hacerlo; lo que falta ahora son **sesiones de
  calibración de verdad**, que es trabajo de gimnasio y no de teclado.

---

## 12. Tercera tanda — el detector del disco, medido por fin

**Lo que fallaba de verdad al usar la herramienta.**

### Ahora el detector se puede MEDIR (`scripts/verify/deteccion-disco.mjs`)

Era la única pieza del módulo que no se podía comprobar: necesita OpenCV, y
OpenCV parecía cosa de navegador. **No lo es** — `@techstark/opencv-js` arranca
en Node en ~900 ms. Con eso se ejecuta `cv.worker.js` TAL CUAL, sin tocarlo,
sobre discos sintéticos de altura conocida, y se mide lo único que importa: el
error en la ALTURA de la elipse, que es de donde sale la escala del vídeo.

52 casos: 5 colores × 3 tamaños × 3 grados de giro, más gimnasio oscuro,
oclusión, estorbos redondos y cámara inclinada.

### El fallo: se enganchaba al BUJE y lo daba por bueno

Primera medición, antes de tocar nada:

```
 MAL   rojo h=320 sq=1     altura -71.5% · ellipse 0.85
 MAL   azul h=320 sq=1     altura -71.4% · ellipse 0.85
 MAL   negro h=320 sq=1    altura -71.5% · ellipse 0.73
```

Medido/real = **0,285**, y el buje de un disco mide 0,28 del diámetro. El
detector cogía el buje metálico en vez del borde, y lo reportaba **con una
confianza de 0,85**. La escala salía casi cuatro veces pequeña y todas las
velocidades cuatro veces grandes.

La causa, en una constante: `pickOutermost` solo asciende al hermano mayor si
mide **como mucho 3 veces** el candidato. Del buje al borde hay 1/0,28 = **3,57**.
No podía ascender nunca.

Solo se veía con el disco GRANDE en el encuadre —cámara cerca— porque con el
disco pequeño el buje no llega ni a `MIN_AXIS_FRAC` ni a las 25 filas de
contorno. Y solo en discos rojos, azules o negros, donde el buje gris contrasta
en escala de grises; en un disco amarillo no contrasta y el fallo desaparecía.
**Por eso no lo cazó nadie leyendo el código: hacía falta barrer tamaño Y color
a la vez.**

| | antes | después |
|---|---|---|
| altura dentro de ±5% | 29/52 | **38/52** |
| altura dentro de ±12% | 41/52 | **50/52** |
| error absoluto medio | 16,0% | **4,0%** |
| sesgo | −9,8% | +2,9% |

### La oclusión no se puede arreglar, pero sí decir

Con una pierna o el rack tapando parte del disco, la altura sale **+18 a +20%**:
ajustar una elipse a un arco parcial está mal condicionado por construcción, y
de un fotograma tapado no se saca la información que no está.

La confianza NO lo detecta —casos tapados puntúan 0,49 y casos perfectos de
disco grande y girado puntúan 0,51, se solapan—. La **cobertura angular** sí. Se
saca del worker hasta la pantalla, y por debajo del 80% la pantalla de confirmar
dice qué porcentaje del borde se ve y qué hacer. No bloquea: avisa donde sirve,
al lado del botón de aceptar.

### La escala a mano: dos puntos en vez de un aro

`calibrationFromTwoPoints` **ya existía** en `plateGeometry.ts`, con su método
`two_points`, su etiqueta y su peso en `quality.ts` — y no estaba conectada a
ninguna pantalla. Lo que había era un aro CIRCULAR con botones de ±2 px.

El aro es peor por una razón de fondo: la escala sale de la ALTURA, así que con
la cámara girada el usuario tiene que elegir entre ajustar el ancho o el alto, y
acaba en un compromiso que falsea la escala sin que nada lo delate. Marcando el
borde de arriba y el de abajo se mide directamente lo que se usa.

Ahora se arrastran dos topes sobre el vídeo, con botones de ±1 px para afinar
—en un disco de 120 px de alto, cada píxel es un 0,8% en todas las velocidades—.

Y traía un fallo latente que nunca se había ejecutado: usaba `Math.hypot`, la
distancia completa entre los dos puntos, en vez de |Δy|. Con 40 px de desvío
horizontal eso sobrestima la escala un **2%**. Con |Δy| el método se vuelve
además inmune a la precisión horizontal del usuario: solo tiene que acertar la
altura.

---

## 13. Estado real del servidor, verificado

No supuesto: sondeado contra producción el 18 de agosto de 2026.

| | Estado |
|---|---|
| Función de borde `athletes` | ✅ **DESPLEGADA** (versión 7). `peek_claim` responde `{"valid":false,"reason":"no_existe"}`; antes daba 401 |
| Secreto `APP_URL` | ✅ puesto |
| Tabla `athlete_claim_links` | ✅ existe (42501 = la RLS la cierra a `anon`, que es lo correcto) |
| `pwr_calibration_sessions` / `_reps` / vista | ✅ existen |
| Filas del catálogo `metric_definitions` | ❓ **NO SE PUEDE SABER con la clave anónima**: su política es `TO authenticated`, así que se ven 0 filas exista o no contenido |

### Por qué fallaba `supabase functions deploy athletes`

```
{"code":"LegacyProjectNotLinkedError","message":"Cannot find project ref. Have you run supabase link?"}
```

La CLI 2.115 busca `supabase/.temp/project-ref`, y en el repositorio solo estaba
el formato antiguo `supabase/.temp/linked-project.json`. Un proyecto que SÍ
estaba enlazado aparecía como no enlazado. **No era un problema de
credenciales**: se resolvió pasando `--project-ref` y desplegó a la primera.

Arreglado de raíz creando `supabase/.temp/project-ref`, así que
`supabase functions deploy athletes` a secas ya funciona.

### Lo único que queda por comprobar a mano

En el editor SQL de Supabase, con sesión:

```sql
SELECT count(*) FROM public.metric_definitions;
SELECT key FROM public.metric_definitions WHERE key = 'bar_mass_kg';
```

Si sale 0, hay que ejecutar `database/metrics_catalog.sql`,
`metrics_catalog_quality.sql`, `metrics_catalog_pwr2.sql` y la sección 5 de
`pwr_calibration.sql`. Sin ellos nada se rompe: las métricas se guardan igual y
se pintan con la clave por etiqueta en vez de con su nombre y unidad.
