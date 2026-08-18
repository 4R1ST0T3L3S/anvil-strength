# Bancos de verificación del análisis

**El analizador siempre devuelve números bonitos.** Mirarlo por pantalla no
prueba nada: una velocidad media un 24% baja se ve exactamente igual que una
correcta. La única forma de saber si un cambio mejora o empeora es medirlo
contra un caso de **verdad conocida**.

Eso es el compromiso de método de §13 de `docs/AUDITORIA_PWR_2.0.md`, y esto
es lo que lo hace ejecutable.

## Cómo se lanzan

```bash
npm run verify
```

Uno suelto:

```bash
node --experimental-strip-types --import ./scripts/ts-resolver.mjs scripts/verify/acuerdo-encoder.mjs
```

No hace falta instalar nada ni hay runner de tests: Node ejecuta el TypeScript
de `src/` directamente. `scripts/ts-resolver.mjs` se encarga de que los imports
sin extensión —que Vite acepta y Node no— se resuelvan igual.

## Qué comprueba cada uno

| Banco | Qué mide |
|---|---|
| `ajuste-previo-y-1rm.mjs` | Que el MVT sale de una sola tabla, que el 1RM con el perfil del atleta **recupera un 1RM construido**, cuándo se niega a usar ese perfil, y qué bloquea el ajuste previo (Fase 3). |
| `acuerdo-encoder.mjs` | La estadística de acuerdo contra sesgos y dispersiones construidos: sesgo, error absoluto, RMSE, desviación típica **muestral** y límites de Bland-Altman comparados con su valor teórico exacto. |
| `calibracion-completa.mjs` | El camino entero de las Fases 9 y 10: un CSV de encoder con comas decimales y ROM en centímetros, leído por el lector real, emparejado y resumido. |
| `escala-manual.mjs` | La escala puesta a mano con dos clics, y la propiedad que justifica el método: que el desvío horizontal del usuario **no** cambie la escala. |
| `deteccion-disco.mjs` | **El detector de OpenCV, sin navegador.** 52 discos sintéticos de altura conocida (5 colores × 3 tamaños × 3 giros, más gimnasio oscuro, oclusión y estorbos redondos) y el error en la ALTURA, que es de donde sale la escala. |

## Cómo se escribe uno nuevo

La regla es una sola: **construir la verdad, no comprobar que "sale algo"**.

Para la cinemática se construye el perfil de VELOCIDAD y se integra para
obtener la posición — así el recorrido, la velocidad media, la máxima y el
estancamiento se conocen de forma exacta, y se puede barrer sobre formas de
levantamiento × cadencia × ruido × semilla.

Para la estadística se fabrican diferencias deterministas cuyo sesgo y
desviación se calculan a mano, y se compara contra la fórmula. Nada de ruido
pseudoaleatorio para comprobar un corte: con ocho muestras, la dispersión que
sale de un generador se desvía lo bastante de la teórica como para cruzarlo
—pasó al escribir `acuerdo-encoder.mjs`, y el fallo estaba en la prueba, no en
el código.

## El worker de OpenCV SÍ se puede probar aquí

Durante meses se dio por imposible. No lo es: `@techstark/opencv-js` arranca en
Node en ~900 ms, y con un `self` falso —`cv`, `postMessage`, un `ImageData` de
mentira y un `importScripts` vacío— se ejecuta `cv.worker.js` **tal cual, sin
modificarlo**. Ver `deteccion-disco.mjs`.

Ese detalle importa: **no hay que tocar el worker para que se deje probar.** Si
se modifica, el banco prueba otro fichero y no dice nada del que se despliega.

Y funcionó a la primera: encontró un error del **−71,5% en la altura del disco
reportado con una confianza de 0,85** —se enganchaba al buje— que había
sobrevivido a todas las revisiones anteriores, porque solo aparece cuando
coinciden disco grande Y color oscuro.

Lo que sigue necesitando un navegador de verdad es la LECTURA de vídeo
(`requestVideoFrameCallback` solo dispara si la ventana compone fotogramas) y el
seguimiento sobre un vídeo real. Para eso están `/pwr-preview.html` y
`/pwr-bench.html`.
