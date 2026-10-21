# Recortes de atletas (convocatoria y portada)

Cada atleta con recorte tiene DOS ficheros WebP con transparencia:

| Fichero                 | Para qué                                  |
|-------------------------|-------------------------------------------|
| `<slug>.webp`           | 1600 px de alto — pantallas grandes / retina |
| `<slug>-800.webp`       | 800 px de alto — móvil                     |

y una línea en `src/data/athletes.ts`:

```ts
slug: "pau-rodriguez",
recorte: recorte("pau-rodriguez", 759, 1600, { escala: 1.42, bajar: 0.24 }),
```

`ancho` y `alto` son los de la versión de 1600. `encuadre` iguala atletas
cortados de forma distinta: `escala` agranda o encoge en escena y `bajar`
esconde por debajo del suelo esa fracción del cuerpo (para que una foto de
cuerpo entero y otra de medio cuerpo tengan la cabeza a un tamaño parecido).

## Cómo se hizo (octubre de 2026)

1. **Recorte** con BiRefNet (`rembg`, modelo `birefnet-portrait`) sobre la
   foto ORIGINAL a resolución completa, no sobre la copia de la web.
2. Si en la foto hay más gente (cargadores, jueces), se aísla al atleta con
   **SAM** (caja + puntos positivos y negativos) y se multiplica por el alfa
   fino de BiRefNet. Lo que quede suelto se borra quedándose con la isla
   principal del alfa.
3. Si la foto es pequeña, se escala x4 con **Real-ESRGAN**
   (`realesrgan-x4plus`) antes de exportar.
4. Export a WebP (calidad 88, alfa 90) a 1600 y 800 px de alto, con un
   pequeño "estrangulado" del borde para quitar el halo claro del fondo.

## Mejor foto = mejor resultado

- De frente o de brazos cruzados, de cintura o medio muslo para arriba.
- Fondo liso y sin nadie detrás.
- La más grande que haya (el original de la cámara, no la de Instagram).

## Vídeo de presentación (opcional)

Un clip de 3-5 s cruzando los brazos, con fondo transparente, sustituye al
recorte en la convocatoria y se queda en el último fotograma. Formatos:
`<slug>.webm` (VP9 con alfa) y `<slug>.mov` (HEVC con alfa, para Safari), y
en la ficha: `video: { webm: "/athletes/roster/<slug>.webm", mov: "..." }`.
