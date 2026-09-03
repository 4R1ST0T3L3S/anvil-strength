# Automatizar el flujo de vídeo → métricas

**Análisis técnico previo a la implementación.**
Fecha: 5 de agosto de 2026.

---

> ## ⚠️ CORRECCIÓN — 5 de agosto de 2026, misma tarde
>
> **Dos cosas de este documento estaban mal, y las dos importan.**
>
> > ### ⛔ La primera corrección era, a su vez, FALSA. Ver §11.
> >
> > Decía que `VideoTracker.tsx` ya detectaba el disco automáticamente. No lo
> > hacía: el componente saltaba directo al modo "toca el disco" y colocaba un
> > aro de radio `alto_del_vídeo × 0,10` —una constante— que se ajustaba a ojo
> > con botones de ±5 px. La detección existía en `cv.worker.js` pero **no la
> > llamaba nadie** desde el commit `c98564dc` ("remove broken auto-detection").
> >
> > Es decir: la §7.1 original tenía razón en que la calibración era el
> > problema, y se tachó por error. Se resolvió de verdad en la Fase B (§11).
>
> **1. ~~La calibración NO es un bloqueante. Ya estaba resuelta.~~**
> ~~La §7.1 decía que era "EL problema de verdad". Es falso:
> `VideoTracker.tsx` ya detecta el disco automáticamente
> (`STANDARD_PLATE_METERS = 0.45`), lo enseña para confirmar y ofrece un
> respaldo manual de dos clics.~~ Escribí esa sección sin leer `VideoTracker.tsx`,
> deduciendo de que `pixelToMeterRatio` llegara como parámetro que la
> calibración era manual. **Lo era.**
>
> **2. Casi toda la arquitectura de aquí abajo sobra.**
> Partía de que había que subir los vídeos a un servidor. Pero el vídeo es
> **desechable**: lo único que tiene valor son las métricas. Y el análisis ya
> funciona en el navegador. Entonces no hace falta subir nada, y sin subida no
> hay bucket, ni cola, ni trabajador, ni retención, ni factura.
>
> **Lo que se ha implementado (Fase A) está en §10, al final.** Es
> radicalmente más simple que lo que describen las §3–§6, y esas secciones se
> conservan solo como referencia para el día que se quiera de verdad procesar
> en servidor — que hoy no hace falta.

---

El flujo que se quiere:

```
El atleta registra una serie
  ↓ pulsa "Subir vídeo"
Recortador integrado — selecciona solo la parte que vale
  ↓
El vídeo sube en segundo plano
  ↓  (el atleta sigue entrenando)
PWR procesa el vídeo
  ↓
La serie queda enriquecida con todas las métricas
```

Este documento dice si eso es viable, cuánto cuesta, qué se rompe por el
camino y qué hacer primero. **La conclusión está al final, en "Recomendación",
y contradice en parte el plan de arriba** — conviene leer esa sección antes que
ninguna otra si hay prisa.

---

## 0. Resumen ejecutivo

| | |
|---|---|
| ¿Es viable? | Sí, técnicamente. |
| ¿Merece la pena AHORA? | **Solo la mitad barata.** La otra mitad tiene un bloqueante que no es de infraestructura. |
| Bloqueante real | **La calibración automática.** Sin ella, un servidor no puede dar m/s, solo píxeles por segundo. No es un problema de colas ni de servidores: es de visión artificial. |
| Coste de la mitad barata | Un fichero SQL y ~2 días de trabajo. |
| Coste de la mitad cara | Un contenedor con ffmpeg (~10–15 €/mes) y ~2 semanas, **más** resolver la calibración. |
| Riesgo mayor | Almacenamiento. Sin política de retención, esto se come cientos de GB en meses. |

---

## 1. De dónde partimos

Lo que ya existe y condiciona el diseño:

- **El análisis corre en el navegador.** `src/lib/cv/tracker.ts` + un worker
  (`cv.worker`). El bundle de visión pesa ~670 KB comprimidos.
- **La calibración es MANUAL.** `pixelToMeterRatio` sale de que alguien marque
  a mano una distancia conocida en el vídeo. Ver `VideoTracker.tsx`.
- **Ya hay dos almacenes de medios**: `exercise_videos` en Cloudflare R2 y
  `chat_media` en un bucket privado de Supabase con URLs firmadas.
- **Ya hay una cola de escritura offline**: `src/lib/offlineQueue.ts`, que
  sobrevive a quedarse sin cobertura y a cerrar la aplicación.
- **Ya hay Edge Functions** (Deno) desplegadas a mano.
- **Ya se distingue el origen de una medición**: `vbt_source` vale `encoder`,
  `video` o `manual`. Esto importa mucho y se comenta en §7.

---

## 2. La pregunta que decide toda la arquitectura

**¿Dónde corre la visión artificial?**

Todo lo demás —colas, almacenamiento, escalado— se deriva de esta respuesta.

### Opción A — En el dispositivo (lo que hay hoy)

**A favor:** coste de servidor CERO. El vídeo puede no salir nunca del móvil.
Ya está construido y funciona.

**En contra, y es definitivo:** *no puede cumplir la promesa de "en segundo
plano".*

iOS Safari suspende el JavaScript de una pestaña en segundo plano en unos 30
segundos. Los Web Workers se estrangulan igual. Si el atleta bloquea el móvil
—que es exactamente lo que va a hacer, porque se va a hacer la siguiente
serie— el procesado muere a medias.

No hay forma de arreglar esto desde el cliente. No es una limitación que se
pueda rodear con más código: es política del sistema operativo.

> **Conclusión:** la Opción A es incompatible con el flujo pedido. Sirve para
> el flujo actual (el coach mirando la pantalla mientras analiza) y no para
> el automático.

### Opción B — En un servidor

El vídeo se sube, un trabajador lo coge, lo procesa y escribe las métricas.

**A favor:**
- Cumple lo de "en segundo plano" de verdad: el atleta puede cerrar la app.
- **Resultados consistentes**: todos los atletas se miden con la MISMA versión
  del algoritmo. Hoy, dos móviles distintos pueden dar cifras distintas del
  mismo vídeo, y eso invalida cualquier comparación longitudinal.
- **Se puede reprocesar el histórico** cuando el algoritmo mejore. Con
  procesado en cliente, una medición de marzo se queda con el algoritmo de
  marzo para siempre.
- El móvil no se calienta ni gasta batería.

**En contra:**
- Infraestructura real y factura mensual.
- **Las Edge Functions de Supabase NO valen para esto**: son Deno, con límite
  de CPU y de pared (~150 s), sin GPU y sin ffmpeg. Un clip de 15 s a 1080p se
  las come. Hace falta un contenedor de verdad.
- Hay que subir el vídeo entero: en el gimnasio, con 4G malo.

### Opción C — Híbrida (procesar en el móvil, pero diferido)

Subir el vídeo primero (queda a salvo) y procesarlo en el móvil la próxima vez
que la app esté en primer plano.

**A favor:** sin coste de cómputo. El vídeo está seguro desde el primer
momento.

**En contra:** las métricas aparecen "cuando el atleta vuelva a abrir la app",
que puede ser al día siguiente. Es una promesa rara de explicar y encima
paga el almacenamiento igual que la Opción B, que sí cumple.

> **Descartada.** Paga los costes de B sin dar sus ventajas.

---

## 3. Arquitectura recomendada

**Opción B, con la cola en Postgres y el trabajo partido en dos fases.**

```
┌─────────────────────────────────────────────────────────────┐
│ CLIENTE (móvil del atleta)                                  │
│                                                             │
│  WorkoutLogger → serie → [Subir vídeo]                      │
│         ↓                                                   │
│  Recortador (MediaRecorder + captureStream)                 │
│    · recorta a la repetición                                │
│    · reescala a 720p                    ← control de coste  │
│         ↓                                                   │
│  Subida reanudable (TUS) a Storage                          │
│    · sobrevive a perder cobertura                           │
│    · reutiliza el patrón de offlineQueue.ts                 │
│         ↓                                                   │
│  INSERT video_analysis_jobs (status='queued')               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ COLA — una tabla de Postgres, no Redis ni SQS               │
│                                                             │
│  SELECT ... FOR UPDATE SKIP LOCKED                          │
│  · arriendo con caducidad (locked_until)                    │
│  · reintentos con espera creciente                          │
│  · buzón de fallidos (status='failed' + last_error)         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ TRABAJADOR (contenedor: Fly.io / Cloud Run / Railway)       │
│                                                             │
│  descarga → ffmpeg (normaliza) → pipeline CV → métricas     │
│         ↓                                                   │
│  UPSERT vbt_measurements + UPDATE training_sets.vbt_metrics │
│  UPDATE job status='done'                                   │
│  DELETE del vídeo si la retención lo dice   ← control coste │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ VUELTA AL CLIENTE — Supabase Realtime sobre la fila del job │
│  La serie se enriquece sola en pantalla, sin recargar.      │
└─────────────────────────────────────────────────────────────┘
```

### Por qué la cola va en Postgres y no en Redis/SQS/BullMQ

`SELECT ... FOR UPDATE SKIP LOCKED` es una cola de trabajos correcta, con
transacciones, desde PostgreSQL 9.5. A este volumen —cientos de trabajos al
día, no cientos por segundo— añadir Redis significa: un servicio más que
mantener, un sitio más donde perder datos, y dos fuentes de verdad que se
pueden desincronizar.

Y hay una ventaja que no es menor: **el trabajo y su resultado viven en la
misma transacción**. Escribir las métricas y marcar el trabajo como hecho es
atómico. Con una cola externa eso es un problema de dos fases que hay que
resolver a mano.

Se cambia a una cola dedicada el día que haya miles de trabajos por minuto.
No antes.

---

## 4. Modelo de datos de la cola

```sql
CREATE TABLE video_analysis_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- A qué serie enriquecer. NULL = análisis suelto, sin plan detrás.
    training_set_id UUID REFERENCES training_sets(id) ON DELETE CASCADE,
    athlete_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_by      UUID REFERENCES profiles(id),

    -- Dónde está el vídeo. Clave dentro del bucket, NUNCA una URL:
    -- las URLs se firman al usarlas (mismo criterio que chat_media).
    storage_path    TEXT NOT NULL,
    storage_bucket  TEXT NOT NULL DEFAULT 'set-videos',

    -- Lo que el cliente ya sabe y el analizador no puede adivinar.
    load_kg         NUMERIC,
    exercise_hint   TEXT,
    -- Calibración: si el atleta la aportó, viene aquí. Ver §7.1.
    calibration     JSONB,

    status          TEXT NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued','running','done','failed','cancelled')),
    attempts        SMALLINT NOT NULL DEFAULT 0,
    max_attempts    SMALLINT NOT NULL DEFAULT 3,

    -- Arriendo. Si el trabajador muere, el trabajo vuelve a la cola solo.
    locked_by       TEXT,
    locked_until    TIMESTAMPTZ,

    last_error      TEXT,
    -- Puntuación de fiabilidad de la medición. Ver §7.3.
    quality         JSONB,
    result_id       UUID REFERENCES vbt_measurements(id),

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ
);

-- El índice que hace barata la toma de trabajos: PARCIAL sobre lo pendiente.
-- Sin el WHERE, el índice crece con el histórico entero y la cola se va
-- frenando a medida que se acumulan trabajos terminados.
CREATE INDEX idx_jobs_pending ON video_analysis_jobs (created_at)
    WHERE status IN ('queued','running');
```

**Tomar un trabajo:**

```sql
UPDATE video_analysis_jobs SET
    status = 'running',
    locked_by = $1,
    locked_until = NOW() + INTERVAL '10 minutes',
    attempts = attempts + 1,
    started_at = COALESCE(started_at, NOW())
WHERE id = (
    SELECT id FROM video_analysis_jobs
     WHERE (status = 'queued')
        OR (status = 'running' AND locked_until < NOW())   -- ← recupera huérfanos
     ORDER BY created_at
     FOR UPDATE SKIP LOCKED
     LIMIT 1
)
RETURNING *;
```

Ese `OR status = 'running' AND locked_until < NOW()` es lo que hace que un
trabajador que se muere a mitad no deje el trabajo colgado para siempre. Es la
línea que más veces se olvida al escribir una cola y la que más caro sale.

### Idempotencia

Un trabajo se puede reintentar, así que escribir su resultado dos veces tiene
que dar el mismo estado final. Concretamente: la medición se escribe con
`ON CONFLICT (job_id) DO UPDATE`, no con un `INSERT` a secas. Si no, un
reintento tras un fallo de red deja dos mediciones del mismo vídeo y el perfil
carga-velocidad del atleta cuenta el mismo levantamiento dos veces.

---

## 5. Almacenamiento: el coste que de verdad importa

Aquí es donde esto se va de las manos si no se decide bien desde el principio.

**La cuenta:**

| | |
|---|---|
| Clip de 15 s a 1080p | ~25–40 MB |
| Mismo clip a 720p | ~8–12 MB |
| 100 atletas × 20 series/semana × 10 MB | **20 GB / semana** |
| Al año, sin borrar nada | **~1 TB** |

**Tres decisiones que lo cortan de raíz:**

1. **Recortar ANTES de subir.** El recortador del flujo no es solo comodidad
   de interfaz: es el principal control de coste. De un vídeo de 2 minutos a
   uno de 12 segundos hay un factor 10.

2. **Reescalar a 720p en el cliente.** El pipeline de visión no gana nada con
   1080p —el seguimiento trabaja sobre una marca de unos pocos píxeles— y
   ahorra dos tercios del peso.

3. **Borrar el vídeo al terminar.** Esta es la grande. *Lo que tiene valor
   permanente son las métricas (200 bytes), no el vídeo (10 MB).* Por defecto:
   se borra al procesarlo; se conserva solo si alguien lo marca explícitamente
   ("guardar para revisar la técnica"). Eso convierte el almacenamiento de un
   coste que crece sin límite en uno prácticamente plano.

**Dónde:** **Cloudflare R2**, no Supabase Storage. Motivo concreto: R2 no cobra
salida de datos, y aquí el trabajador se descarga cada vídeo una vez. Con
egreso facturado, esa descarga es un coste recurrente por cada análisis. El
proyecto ya usa R2 para `exercise_videos`, así que no es una pieza nueva.

**Privacidad:** bucket privado y URLs firmadas de vida corta, exactamente el
criterio que ya se aplicó en `chat_media.sql`. Son vídeos de personas
entrenando: no pueden estar en una URL pública adivinable.

---

## 6. Escalabilidad

El cuello de botella es el cómputo de visión, no la base de datos.

- **Base de datos:** una cola en Postgres con índice parcial aguanta decenas de
  miles de trabajos al día sin despeinarse. No es el problema.
- **Trabajadores:** escalan horizontalmente sin coordinación. `SKIP LOCKED`
  hace que N trabajadores no se pisen. Añadir capacidad es levantar otro
  contenedor.
- **Coste:** un clip de 12 s tarda ~5–20 s de CPU. Con **Cloud Run** o **Fly
  Machines** (escalado a cero) se paga por segundo de proceso, no por tener el
  servidor encendido. Con el volumen de arranque, eso son unos pocos euros al
  mes; un contenedor pequeño siempre encendido ronda los 10–15 €.
- **Picos:** el gimnasio se llena a las 19:00 y la cola se alarga. No pasa
  nada: es asíncrono por diseño. Lo que hay que cuidar es *decirlo* en la
  interfaz ("procesando, ~3 min") en lugar de dejar un hueco en silencio.

---

## 7. Problemas, por orden de gravedad

### 7.1. La calibración — ~~EL BLOQUEANTE~~ YA RESUELTA

> **Esta sección estaba equivocada. Se conserva tachada para que se vea qué se
> creyó y por qué.**
>
> `VideoTracker.tsx` **ya calibra automáticamente**: detecta el disco
> (`STANDARD_PLATE_METERS = 0.45`), dibuja un anillo verde sobre él y pide
> confirmación (`auto_detecting` → `confirm_plate`). Si la detección falla, el
> respaldo es marcar dos puntos en los bordes del disco (`calibrate`).
>
> Es decir: la solución que abajo se propone como "la vía buena" **ya estaba
> construida**. El error fue escribir esta sección deduciendo el
> comportamiento de que `pixelToMeterRatio` llegara como parámetro, en vez de
> leer el componente.

~~**Este es el problema de verdad, y no se resuelve con arquitectura.**~~

~~Hoy `pixelToMeterRatio` sale de que una persona marque a mano una distancia
conocida sobre el vídeo. En un flujo automático no hay nadie para hacerlo.~~

Sin calibración, un servidor puede dar píxeles por segundo. **No metros por
segundo.** Y píxeles por segundo no son comparables entre dos vídeos, ni
siquiera del mismo atleta, porque basta que el móvil esté 30 cm más lejos.

Opciones, de más a menos fiable:

1. **Detectar el disco.** Un disco de competición mide 45 cm de diámetro,
   siempre. Detectar la elipse del disco da la escala automáticamente. Es la
   vía buena y es un problema de visión resoluble.
2. **Preguntar por la barra.** Una barra olímpica mide 2,20 m. Detectar sus
   extremos. Menos robusto: la barra suele salir cortada del encuadre.
3. **Que el atleta lo diga.** "¿Qué discos llevas?" en el momento de subir.
   Barato de implementar, pero devuelve la fricción que el flujo quería quitar.

> **Recomendación:** implementar (1) con (3) como red de seguridad, y no
> prometer m/s automáticos hasta que (1) funcione con un margen de error
> medido. **Mientras tanto, ningún trabajo del servidor debería escribir
> velocidades absolutas.**

### 7.2. Ángulo de cámara

Una cámara que no está perpendicular a la barra falsea el recorrido, y con él
la velocidad. Un vídeo grabado en diagonal puede dar un ROM un 20% menor y
nadie lo nota.

**Qué hacer:** calcular una puntuación de calidad y **negarse a escribir la
medición si baja de un umbral**, en vez de devolver un número malo. Un hueco
se pregunta; un número equivocado se cree.

Esto encaja con el criterio que ya sigue el proyecto: las salvedades
metodológicas se escriben en pantalla, no se esconden.

### 7.3. Confianza en el dato

Una velocidad estimada por visión artificial sobre un vídeo de móvil **no vale
lo mismo** que una de encoder. Mezclarlas en el mismo perfil carga-velocidad
sin distinguirlas produce una nube de puntos de fiabilidad desconocida.

Ya está resuelto: `vbt_source` distingue `encoder` / `video` / `manual`, y las
pantallas lo respetan. **Hay que mantenerlo**: el flujo automático escribe
`source = 'video'`, nunca `'encoder'`.

### 7.4. Subida desde el gimnasio

4G irregular, wifi de gimnasio, la app que se cierra a media subida.

**Qué hacer:** subida reanudable (**TUS**, que Supabase Storage soporta) y un
buzón de salida en el cliente que sobreviva a cerrar la aplicación. El patrón
ya existe en `src/lib/offlineQueue.ts` y hay que reutilizarlo, no reinventarlo.

### 7.5. Coste de almacenamiento

Cubierto en §5. Sin política de retención, esto es lo que primero se vuelve
caro. Con ella, es casi gratis.

### 7.6. Separar repeticiones

Un vídeo de una serie de 5 necesita partirse en 5 repeticiones. Ya está
medio resuelto (`extractLiftingPhases` en `pwrMath.ts`), pero está afinado
para vídeos limpios grabados por un coach. Con vídeos reales de atletas habrá
que endurecerlo.

---

## 8. Recomendación

**Partir el trabajo en dos, y hacer ahora solo la mitad barata.**

### Fase A — Ahora (~2 días)

Todo lo que es barato y no depende de resolver la calibración:

- [x] **Modelo de métricas ampliable.** *Hecho en esta sesión.* Bolsa JSONB +
      catálogo. Añadir una métrica es un `INSERT`.
- [x] **"Asociar serie" con cascada.** *Hecho en esta sesión.*
- [ ] La tabla `video_analysis_jobs`, tal cual está en §4.
- [ ] Recortador en el cliente + reescalado a 720p.
- [ ] Subida reanudable a R2, con buzón de salida offline.
- [ ] Política de retención: borrar tras procesar salvo marca explícita.
- [ ] El procesado SIGUE en el dispositivo, pero ahora deja fila de trabajo.

**Por qué así:** el vídeo queda a salvo desde el primer segundo y el modelo de
datos queda montado. Cuando llegue el trabajador, **no hay que cambiar ni el
cliente ni el esquema**: el trabajador simplemente empieza a consumir filas que
el cliente ya está escribiendo.

Esa es la razón de hacer la tabla de trabajos ahora aunque todavía no haya
trabajador: es lo que convierte la parte cara en algo *opcional y aplazable*
en vez de en una reescritura.

### Fase B — **HECHA en su parte útil. Detalle en §11.**

- [x] Calibración automática por detección de disco (§7.1). **Ajuste de ELIPSE**,
      no de círculo, y la escala se toma de la ALTURA. Ver §11.1.
- [x] Puntuación de calidad con umbral de rechazo (§7.2). Bloquea de verdad:
      por debajo de 50, o con cualquier dimensión en fallo crítico, no se
      guarda. Ver §11.2.
- [x] Trazabilidad de la medición: cinco métricas nuevas, sin migración de
      esquema. *No estaba en el plan original y es lo que hace auditable el
      histórico.* Ver §11.3.
- [ ] ~~Contenedor trabajador (ffmpeg + pipeline CV) en Cloud Run o Fly.~~
- [ ] ~~Realtime sobre la fila del trabajo para enriquecer la serie en vivo.~~
- [ ] ~~Reproceso del histórico cuando el algoritmo mejore.~~

> Los tres últimos quedan **descartados por ahora**, no aplazados por falta de
> tiempo: la corrección de cabecera ya decidió que el vídeo no se sube, y sin
> subida no hay nada que procesar en servidor. Se conservan tachados —y las
> §3–§6 enteras— para el día que la espera de 10–30 s con la pantalla encendida
> moleste lo bastante como para pagar la infraestructura.

### Lo que NO hay que hacer

- **No meter Redis/SQS/BullMQ.** Postgres sobra durante mucho tiempo.
- **No usar Edge Functions para procesar vídeo.** No dan el perfil: sin GPU,
  sin ffmpeg, con límite de pared.
- **No prometer métricas automáticas en m/s antes de §7.1.** Un número
  equivocado que nadie cuestiona hace más daño que no tener número, y este
  producto se apoya en que las cifras aguanten escrutinio.
- **No guardar los vídeos indefinidamente** "por si acaso". Es la vía rápida a
  una factura de almacenamiento que no para de crecer.

---

## 9. Estimación

| Trabajo | Esfuerzo | Coste mensual |
|---|---|---|
| Fase A completa | ~2 días | ~0 € (con retención) |
| Calibración automática | 3–5 días | 0 € |
| Contenedor trabajador | 3–4 días | 10–15 € |
| Realtime + reproceso | 2 días | 0 € |
| **Total Fase B** | **~2 semanas** | **10–15 €** |

El almacenamiento se mantiene cerca de cero *solo si se aplica la retención de
§5*. Sin ella, con 100 atletas activos, ronda los 20–25 €/mes el primer año y
sube desde ahí sin techo.

---

## 10. Fase A — LO QUE SE HA IMPLEMENTADO

*(Añadido el 5 de agosto de 2026, tras la corrección de la cabecera.)*

Con las dos correcciones aplicadas —la calibración ya funciona, y el vídeo es
desechable— la Fase A se reduce a **una pantalla**. Sin cola, sin bucket, sin
trabajador, sin factura.

### El flujo real

```
El atleta abre su serie
  ↓ toca el chip de velocidad
SetVbtModal
  ↓ [Analizar un vídeo de esta serie]     ← botón nuevo
SetVideoAnalysisModal
  ↓ elige el vídeo de su galería
VideoTracker  · detecta el disco (45 cm) y pide confirmación
              · toca el centro de la barra
              · Iniciar → ~10-30 s con la pantalla encendida
  ↓
MetricsDashboard · calcula las 15 métricas
                 · la carga viene YA puesta desde la serie
  ↓ [Guardar en la serie]
Las métricas quedan dentro de la serie. El vídeo se descarta.
```

### Por qué no hay subida

El procesado ocurre en el navegador, sobre el fichero local. **El vídeo no
llega a salir del dispositivo.** Se guardan las métricas (~200 bytes), no el
vídeo (10–30 MB).

Esto es mejor que "borrar después de procesar", que era lo que se planteaba
en §5: no se borra, es que nunca se sube.

| | Diseño de §3–§6 | Lo implementado |
|---|---|---|
| Almacenamiento | Bucket + retención + limpieza | **Ninguno** |
| Cola de trabajos | Tabla + arriendos + reintentos | **Ninguna** |
| Trabajador | Contenedor con ffmpeg | **Ninguno** |
| Coste mensual | 10–15 € | **0 €** |
| Privacidad | Bucket privado, URLs firmadas | **No hay vídeo que proteger** |
| Espera | Asíncrona (minutos) | Síncrona (~10–30 s) |

### Lo único que se pierde

**"Seguir entrenando mientras procesa".** No se puede hacer en el cliente: iOS
suspende el JavaScript de una pestaña en segundo plano a los ~30 s y estrangula
los Web Workers igual, así que bloquear el móvil mataría el análisis a medias.
Es política del sistema operativo (§2, Opción A).

El precio real es **esperar entre diez y treinta segundos con la pantalla
encendida**, una vez por serie grabada. Contra eso: cero infraestructura, cero
coste y cero vídeos de gente entrenando en ningún servidor.

Si algún día esa espera molesta de verdad, §3–§6 siguen siendo el camino — y
el modelo de métricas ya está listo para recibir resultados de un trabajador
sin cambiar nada.

### Ficheros

| Fichero | Qué hace |
|---|---|
| `src/features/vbt/components/SetVideoAnalysisModal.tsx` | **Nuevo.** Aloja el analizador dentro de una serie concreta. Carga diferida del paquete de visión. |
| `src/features/vbt/components/SetVbtModal.tsx` | Botón "Analizar un vídeo de esta serie". |
| `src/features/coach/components/pwr/MetricsDashboard.tsx` | `initialLoadKg` / `initialExerciseType`: la carga entra ya puesta desde la serie. |

### Detalle que importa: la carga

`MetricsDashboard` arrancaba siempre en 100 kg. La potencia y la fuerza se
calculan **multiplicando por la masa**, así que analizar una serie de 60 kg sin
corregir ese campo daba cifras infladas en un 67% — y nadie se acuerda de
corregirlo.

Ahora la carga entra desde la serie (`actual_load`, o `target_load` **solo si
la prescripción iba en kilos** — una serie pautada a 0,45 m/s tiene un
`target_load` de 0,45 que no son kilos).

### Carga diferida

El paquete de visión pesa ~670 KB. Se importa con `lazy()` para que no lo
descargue todo atleta que abra su entrenamiento, incluidos los que no graban
vídeo nunca.

**Verificado en el build:** el bundle `UserDashboard` sigue en 95,62 kB,
idéntico a antes del cambio.

---

## 11. Fase B — LO QUE SE HA IMPLEMENTADO

*(5 de agosto de 2026, tras leer el código en vez de deducirlo.)*

### 11.0. Lo primero: la corrección de la corrección

La nota de cabecera daba la calibración por resuelta. **No lo estaba.** Lo que
había en `VideoTracker.tsx` era esto:

```js
// Go directly to tap mode - no auto-detection
setState('assist_detect');
...
// INSTANT: Place circle at tap point with default radius (no processing)
const defaultRadius = Math.round(canvas.height * 0.10);
```

Un radio constante, ajustable a ojo con botones de ±5 px. El worker sí tenía
`AUTO_CALIBRATE` y `ASSIST_CALIBRATE` con `HoughCircles`, y `tracker.ts`
exportaba `sendAutoCalibrate` / `sendAssistCalibrate`, pero **ningún componente
los llamaba**: código muerto desde `c98564dc`, "remove broken auto-detection".

Por qué importa, en números:

| Error en el radio | Velocidad y ROM | Potencia | %1RM estimado |
|---|---|---|---|
| 10% | 10% | ~21% | ~5 puntos |
| 20% | 20% | ~44% | ~10 puntos |

`pixelToMeterRatio` multiplica todo el análisis. La aplicación producía cifras
con una barra de error que nadie veía y que nadie declaraba.

### 11.1. Calibración automática — resuelta, y por qué el intento anterior falló

**Se buscan elipses, no círculos.** Un disco solo sale redondo si la cámara
está exactamente perpendicular a la barra, y ninguna lo está. `HoughCircles`
no puede encontrar una elipse por definición.

Y hay una decisión que importa más que el detector: **qué eje se mide.**

Con la cámara girada un ángulo θ respecto de la perpendicular, lo vertical se
proyecta a escala completa y lo horizontal se comprime por cos θ. Como el
levantamiento se mide en vertical, **la ALTURA de la elipse da la escala
correcta sea cual sea θ**. Si además la cámara está alta o baja (ángulo φ), la
altura del disco se comprime por cos φ… pero el recorrido de la barra se
comprime igual, y el cociente vuelve a salir bien.

> **La altura del disco se auto-corrige. El diámetro no.** Medir un radio solo
> acierta con la cámara perfectamente perpendicular.

Lo que sí se estropea con θ grande es la desviación horizontal de la barra,
porque se mide sobre el eje comprimido. Por eso el ángulo se estima
(razón entre ejes = cos θ) y se guarda: no hace falta para la escala, hace
falta para saber de qué métricas fiarse.

El detector: Canny con umbrales derivados de la mediana → cierre morfológico →
contornos → `fitEllipse` → y entonces **se comprueba si el contorno es de
verdad una elipse**, con dos números que sustituyen al "el más grande gana" de
la versión anterior:

- **residuo** — distancia media de los puntos a la elipse ajustada.
- **cobertura angular** — qué fracción de la vuelta recorre el contorno.

Un disco medio tapado por la pierna del atleta da residuo bajo y cobertura de
0,6: se acepta. Un listón recto da cobertura alta y residuo pésimo: se
rechaza. De entre los candidatos concéntricos se toma **el exterior**, porque
los 45 cm son el diámetro exterior y quedarse con el aro de color interior
sobrestimaría la velocidad un 50%.

**Medido sobre imágenes sintéticas** (elipse de tamaño conocido, 1280×720):

| Caso | Resultado |
|---|---|
| Disco a ~45° con aro interior de color | elipse, 292,3 px medidos vs 300 reales (−2,6%), 60 ms |
| Disco inclinado 30° | elipse, 265,7 px vs 258,7 teóricos (+2,7%) |
| Dos discos, con el usuario señalando el pequeño | acierta el señalado |
| **Escena sin ningún disco** | `null` — no se inventa nada |

Ese último caso costó una corrección: el respaldo de `HoughCircles` devolvía
un círculo de 787 px en un fotograma de 720 de alto. Dos arreglos: los límites
de tamaño se miden contra el **lado menor** del fotograma (antes contra el
ancho, que en vertical no significa nada), y **Hough solo entra cuando el
usuario ha señalado el disco** — sin pista no valida nada y su trabajo es
inventarse círculos.

Tres escalones, y se dice en cuál se está: automático → asistido (el usuario
toca el disco) → aro a mano, marcado como tal.

Además: **selector de diámetro real** (45 / 40 / 35 / 32 cm). Suponer 45 cm en
un disco de hierro de 32 es un 40% de error en la velocidad, y los números
seguirían pareciendo razonables.

### 11.2. Puntuación de calidad con umbral duro

`src/lib/cv/quality.ts`. Cinco dimensiones, con peso:

| Dimensión | Peso | Qué mira |
|---|---|---|
| Escala | 0,35 | Cómo se calibró y con qué confianza |
| Seguimiento | 0,25 | Fotogramas perdidos y saltos de la marca |
| Ángulo de cámara | 0,20 | Achatamiento del disco |
| Muestreo | 0,12 | Muestras dentro de la concéntrica |
| Plausibilidad | 0,08 | ROM y velocidad en rango físico |

Cualquier dimensión en **fallo crítico bloquea por sí sola**, sin importar la
nota global: una media aritmética esconde un cero, y un 25% de seguimiento
perdido con todo lo demás perfecto seguiría aprobando.

- **< 50 o algún crítico → BLOQUEADO.** No se puede guardar, ni en una serie ni
  "suelto" (que acaba en el mismo perfil carga-velocidad).
- **50–75 → aviso**, con el motivo escrito y guardado.
- **≥ 75 → correcto.**

Las métricas se siguen viendo, atenuadas, cuando está bloqueado: esconderlas
dejaría al usuario sin saber qué corregir para volver a grabar.

Verificado con casos límite: aro manual solo → 69, avisa; cámara a 71° →
bloquea; 30% de fotogramas perdidos → bloquea; salto de la marca de 200 px en
un vídeo de 1080 → bloquea; 4 muestras en la concéntrica → bloquea; ROM de
2,4 m → bloquea. Automático + vídeo bueno → 97.

> **Salvedad, escrita también en el código:** los pesos y los cortes son
> criterio razonado, **no calibración empírica**. Nadie ha comprobado contra un
> encoder que un 82 signifique ±3% de error real. Lo que sí hace es ordenar
> correctamente: una medición de 40 es peor que una de 85.

### 11.3. Trazabilidad: cómo se midió, junto a lo medido

Cinco claves nuevas en la bolsa de métricas —`measurement_quality`,
`camera_obliquity`, `tracking_loss`, `sample_rate`, `plate_px`—, categoría
`quality`. **Sin `ALTER TABLE`:** un INSERT en `metric_definitions`
(`database/metrics_catalog_quality.sql`), que es exactamente para lo que se
montó el modelo de bolsa JSONB.

Sin esto, dentro de seis meses "0,71 m/s" es indistinguible tanto si salió del
disco detectado como de un aro puesto a ojo. Con `plate_px` guardado, además,
una medición antigua se puede **recalcular** si se descubre que el disco no era
del diámetro supuesto.

### 11.4. Lo que NO se ha hecho, y por qué

- **Contenedor trabajador, Realtime y reproceso** (§3–§6): la corrección de
  cabecera ya los había descartado —el vídeo no se sube— y esta fase no los
  recupera. Siguen documentados para el día que la espera de 10–30 s moleste de
  verdad.
- **Perfil carga-velocidad individual.** `estimate1RM` sigue usando constantes
  genéricas por levantamiento (`mvt`, `slope`) en vez del histórico del propio
  atleta. Es el siguiente paso obvio y no depende de nada de aquí.

### 11.5. Pendiente de decidir — "Fuerza Suelo"

`pwrMath.ts` calcula `f = massKg * (g + a)` usando **solo la masa de la
barra**, y la tarjeta se titula *"Fuerza Suelo"*. La fuerza de reacción del
suelo en una sentadilla incluye la masa corporal en movimiento: lo que se
calcula es la fuerza sobre la barra, no contra el suelo.

O se corrige el modelo —haría falta el peso del atleta y una fracción de masa
corporal movilizada por ejercicio— o se corrige la etiqueta. **No se ha tocado
a la espera de decisión**, porque cambiar el modelo altera todas las cifras de
fuerza y potencia ya guardadas.

### 11.6. Ficheros

| Fichero | Qué hace |
|---|---|
| `src/lib/cv/plateGeometry.ts` | **Nuevo.** La escala del vídeo: altura de la elipse, ángulo de cámara, los cuatro métodos de calibración. Sin dependencias de OpenCV, así que se comprueba a mano. |
| `src/lib/cv/quality.ts` | **Nuevo.** Las cinco dimensiones, los umbrales y la conversión a claves del catálogo. |
| `src/lib/cv/cv.worker.js` | `DETECT_PLATE` por ajuste de elipse; `AUTO_CALIBRATE` y `ASSIST_CALIBRATE` retirados. |
| `src/lib/cv/tracker.ts` | `sendDetectPlate` sustituye a las dos funciones muertas. |
| `src/features/coach/components/pwr/VideoTracker.tsx` | Calibración de tres escalones, selector de diámetro, escala visible, contadores de seguimiento. Cromo migrado a los tokens de diseño. |
| `src/features/coach/components/pwr/MetricsDashboard.tsx` | Recibe `calibration` y `trackingStats` en vez de `pixelToMeterRatio`; calcula y enseña la calidad; la mete en la bolsa. |
| `src/features/vbt/components/SetVideoAnalysisModal.tsx` | No deja guardar una medición bloqueada. |
| `src/features/coach/components/pwr/PwrAnalysisTab.tsx` | Lo mismo, en los dos botones de guardado. |
| `database/metrics_catalog_quality.sql` | **Nuevo.** Las cinco métricas de calidad en el catálogo. **Migración pendiente de ejecutar a mano.** |
