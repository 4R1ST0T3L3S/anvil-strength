# Anvil frente a la competencia — entrenamiento y VBT

Estado: 5 de agosto de 2026. Escrito mientras hay una revisión de VBT/PWR en
curso, así que la sección de VBT describe lo que había en `main` ese día.

Con quién se compara: **TrainHeroic**, **TrueCoach**, **Bridge Athletic** y
**Everfit** (plataformas de programación), y **Vitruve**, **Enode**,
**RepOne** y **Output** (VBT con encoder o cámara).

---

## 0. De dónde parte Anvil

Conviene tenerlo delante, porque cambia qué merece la pena copiar y qué no.

**Ventajas reales que ya existen y no son fáciles de igualar:**

- **VBT por vídeo con el móvil, sin encoder.** Vitruve y RepOne venden un
  aparato de 250–400 €. Anvil saca velocidad, potencia, RFD, ROM y desviación
  horizontal de un vídeo con OpenCV en un worker. Es la única barrera de
  entrada que importa en VBT y ya está tirada.
- **Modelo de métricas extensible.** `metric_definitions` es un catálogo: una
  métrica nueva es un `INSERT`, no un `ALTER TABLE`. La competencia tiene las
  suyas cableadas.
- **El atleta gestionado.** Programar a alguien que nunca abrirá la app y
  mandarle el PDF. TrueCoach y TrainHeroic exigen que el atleta se registre
  para existir. Esto es un diferencial comercial más grande de lo que parece:
  quita la fricción del "convence a tu atleta de instalarse otra app".
- **Powerlifting de verdad.** Calendario AEP, categorías de peso y edad,
  cuenta atrás a competición. Los genéricos no tienen nada de esto.

**Desventajas estructurales:**

- Sin app nativa (PWA). Pesa en retención frente a TrainHeroic.
- Sin biblioteca de vídeos de ejercicios propia.
- Sin facturación ni cobro a atletas. TrueCoach y Everfit lo tienen integrado
  y es la razón principal por la que un coach paga la suscripción.

---

## 1. Lo que falta y ya se nota (entrenamiento)

Ordenado por relación entre lo que aporta y lo que cuesta.

### 1.1 Autorregulación por velocidad en la propia serie
**Qué falta:** el atleta ve `140 kg × 5 @ RPE 8`. No ve `140 kg × 5, corta si
bajas de 0,32 m/s`.
**Quién lo tiene:** Vitruve y RepOne, y es su argumento de venta entero.
**Por qué importa aquí:** las piezas ya están. `metric_definitions` tiene
`velocity_loss` y `mean_velocity`; `training_sets` ya guarda objetivo y real.
Falta un campo de objetivo por velocidad en la serie y que el registro avise.
Es la funcionalidad que convierte "Anvil mide velocidad" en "Anvil entrena por
velocidad", que no es lo mismo.

### 1.2 Perfil carga-velocidad y 1RM diario
**Qué falta:** con varias mediciones a distintas cargas del mismo ejercicio se
puede ajustar una recta carga-velocidad y estimar el 1RM del día.
**Quién lo tiene:** todos los VBT con encoder.
**Estado en Anvil:** hay `OneRMCalculator` y `lib/vbt/analysis.ts`, pero el
perfil como objeto persistente por atleta y ejercicio —con su histórico y su
deriva— no existe.
**Por qué importa:** es lo que permite decir "hoy estás al 92% de tu mejor
día" sin hacer una máxima. Para un powerlifter en pico competitivo eso vale
más que cualquier gráfica.

### 1.3 Biblioteca de vídeos de ejercicios
**Qué falta:** `exercise_library` tiene nombres. `exercise_videos` está en el
código pero **la tabla no existe en la base** (comprobado: 404 de PostgREST).
**Quién lo tiene:** absolutamente todos.
**Por qué importa:** es la primera cosa que un atleta echa en falta y la
primera que un coach mira al evaluar una plataforma. No hace falta grabar
nada: basta con permitir asociar un enlace por ejercicio y que el coach suba
los suyos.

### 1.4 Comparar la ejecución con la referencia
**Qué falta:** el atleta sube el vídeo de su serie; no puede verlo al lado del
de su mejor serie del bloque, ni al lado del de su coach.
**Quién lo tiene:** Coach's Eye y Onform lo hacen suelto; ninguna plataforma
de programación lo integra bien.
**Por qué importa:** Anvil ya procesa el vídeo para sacar la trayectoria de la
barra. Superponer dos trayectorias es casi gratis a partir de ahí, y es una
imagen que vende sola.

### 1.5 Que el PDF semanal deje de ser un callejón sin salida
**Qué falta:** el PDF se genera y ahí se acaba. No hay forma de que lo que el
atleta anota a mano vuelva a entrar.
**Idea concreta:** un QR en el PDF que abra el registro de esa sesión en el
móvil sin necesidad de cuenta (enlace firmado y caducable). Es el puente
natural entre el atleta gestionado y el atleta activo, y usa la infraestructura
de cuenta latente que ya está construida.

### 1.6 Facturación
**Qué falta:** todo.
**Quién lo tiene:** TrueCoach, Everfit, Trainerize.
**Por qué importa:** es la razón por la que un coach mantiene la suscripción
aunque no le encante el resto. Stripe Connect + un plan por atleta al mes.

---

## 2. Lo que hay pero se queda a medias

| Área | Hoy | Lo que le falta para estar al nivel |
|---|---|---|
| Adherencia | `getTeamAdherence`, panel de atención | Motivo de la falta. "No entrenó" y "entrenó y no lo registró" son problemas distintos y hoy se ven igual |
| Check-ins | Diarios y semanales, editables por el coach | Cruzarlos con el rendimiento. Un check-in que no se correlaciona con nada es una encuesta |
| Plantillas | `day_templates`, `progression_templates` | Plantillas de BLOQUE completo y un mercado interno para compartirlas entre coaches |
| Récords | `squat_pr`, `bench_pr`, `deadlift_pr` | Historial de PR con fecha y vídeo, y PR por repeticiones (3RM, 5RM), no solo el máximo |
| VBT | Medición y adjuntado a series | Zonas de velocidad por ejercicio y atleta, que es lo que da sentido al número |

---

## 3. Ideas que no tiene nadie

Estas son las que diferencian, no las que igualan.

### 3.1 Semáforo de disponibilidad, calculado y no preguntado
Todo el mundo pide un check-in de "cómo te encuentras del 1 al 10". Nadie lo
contrasta. Anvil puede: si el check-in dice 8 pero la velocidad media del
primer ejercicio está un 12% por debajo de la referencia de ese atleta a esa
carga, la sesión se ajusta sola y se le avisa al coach. **La velocidad de la
primera serie de aproximación es un test de fatiga gratis y nadie lo está
usando así.**

### 3.2 Detección del punto malo, por atleta y ejercicio
`min_velocity` ya está en el catálogo: es el punto de estancamiento dentro del
recorrido. Agregándolo a lo largo de un bloque sale a qué altura concreta se
atasca cada atleta, y eso se traduce en accesorios: si la sentadilla se le cae
siempre a media subida, tiene sentido programar pin squats a esa altura.
**Ninguna plataforma convierte una métrica de velocidad en una recomendación
de accesorio.** Es el paso que va de medir a entrenar.

### 3.3 Coste real de la sesión, no volumen
El tonelaje miente: 10×10 a 60 kg y 3×3 a 90% no son lo mismo aunque sumen
parecido. Con velocidad y carga se puede calcular impulso y trabajo mecánico
de verdad. **Un "coste de sesión" con unidades físicas reales, no un índice
inventado**, y una carga aguda/crónica construida sobre eso.

### 3.4 Simulador de competición
Anvil ya sabe la fecha de la competición, la categoría de peso y los récords.
Falta la parte que un powerlifter hace en una servilleta: **planificar los tres
intentos** de cada movimiento, con la probabilidad de cada uno según su
histórico y la velocidad de sus últimas máximas, y el total que sale de ahí.
Con el calendario AEP delante, decirle a alguien "con este segundo intento
subes de puesto y con este otro no" es algo que hoy no hace ningún software.

### 3.5 El PDF como producto, no como exportación
El PDF ya lleva la marca del coach (`COACH_BRANDING.sql`, `pdf_theme.sql`).
Llevarlo más allá: gráficas de progreso del bloque, comparación con el bloque
anterior y el QR de registro del punto 1.5. **Para el coach que trabaja con
atletas gestionados, ese PDF ES el producto que entrega.** Hoy se trata como
una salida secundaria y debería ser la principal.

### 3.6 Traspaso entre entrenadores
`coach_athletes` ya tiene `relation`, `status`, `started_at` y `ended_at`: el
histórico está modelado y nadie lo aprovecha. Un atleta que cambia de coach
puede llevarse su historial entero, y el coach nuevo ver qué funcionó y qué no
en los tres años anteriores. **En TrainHeroic y TrueCoach cambiar de coach es
empezar de cero.** Es una ventaja que ya está pagada en el modelo de datos.

### 3.7 Contexto de peña
Un atleta que sube 5 kg en sentadilla no sabe si eso es mucho. Con los datos
del club, y **anónimos y agregados**, sí: "esa subida está en el 20% mejor de
los junior de tu categoría este bloque". La Arena ya existe como comunidad;
esto es lo mismo pero con datos de entrenamiento en lugar de apuestas.

---

## 4. Por dónde empezar

Si hay que elegir tres, estos:

1. **Objetivo por velocidad en la serie** (1.1). Es la que convierte el VBT de
   función a producto, y la infraestructura ya está.
2. **Vídeos de ejercicio** (1.3). Es lo que más se echa de menos y lo más
   barato de la lista. Además hay que crear la tabla igualmente, porque el
   código ya la llama y falla.
3. **Simulador de intentos de competición** (3.4). Es la que no tiene nadie y
   la que encaja con lo que Anvil ya sabe de cada atleta.

Y una advertencia de método: 3.1, 3.2 y 3.3 se apoyan en que la velocidad
medida por vídeo sea fiable y repetible. Antes de construir decisiones de
entrenamiento encima, conviene tener medida la dispersión del sistema de
tracking contra una referencia conocida. Una recomendación de accesorio a
partir de una métrica con un 15% de ruido es peor que no dar ninguna.
