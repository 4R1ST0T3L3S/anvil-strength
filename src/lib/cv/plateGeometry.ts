/**
 * ANVIL STRENGTH — LA ESCALA DEL VÍDEO
 * =====================================================================
 *
 * QUÉ RESUELVE ESTE FICHERO
 *
 * Un vídeo no sabe cuánto mide nada. Sabe píxeles. Para decir "0,62 m/s" hace
 * falta un objeto de tamaño conocido en la imagen, y en un gimnasio ese objeto
 * es el disco: un disco de competición mide 45 cm de diámetro, siempre.
 *
 * De ahí sale `pixelToMeterRatio`, el número por el que se multiplica TODO el
 * análisis. Conviene ser consciente de lo que arrastra:
 *
 *   · velocidad y ROM son proporcionales a ese número        (error ×1)
 *   · la potencia es fuerza × velocidad, y las dos dependen  (error ×2 aprox.)
 *   · el 1RM estimado usa una pendiente de 0,0125 por punto de %1RM, así que
 *     equivocarse 0,12 m/s son DIEZ puntos de intensidad relativa
 *
 * Es decir: la calibración no es un paso previo molesto, es la barra de error
 * de todo lo que la aplicación afirma después.
 *
 *
 * POR QUÉ SE MIDE LA ALTURA DE LA ELIPSE Y NO EL DIÁMETRO
 *
 * Esta es la parte que importa y la que estaba mal.
 *
 * Un disco es un círculo, pero en la imagen sale como una ELIPSE en cuanto la
 * cámara no está exactamente perpendicular a la barra — o sea, siempre. Buscar
 * círculos (`HoughCircles`) falla justo cuando la grabación es real, que es lo
 * que le pasó al intento anterior.
 *
 * Y hay algo mejor que ajustar la elipse: elegir bien qué eje se mide.
 *
 * Con la cámara girada un ángulo θ respecto de la perpendicular a la barra:
 *
 *   · lo VERTICAL se proyecta a escala completa      → 45 cm ocupan 0,45·s px
 *   · lo horizontal se comprime por cos θ            → parece más estrecho
 *
 * Como el levantamiento se mide en vertical, usar la ALTURA de la elipse da la
 * escala correcta **sea cual sea θ**. Y si la cámara está alta o baja (ángulo
 * φ), la altura del disco se comprime por cos φ… pero el recorrido de la barra
 * se comprime exactamente igual, así que el cociente vuelve a salir bien.
 *
 * En una frase: **la altura del disco se auto-corrige; el diámetro no.** Medir
 * el radio de un círculo —lo que hacía la versión anterior— solo acierta con la
 * cámara perfectamente perpendicular, y ninguna lo está.
 *
 * Lo que sí se estropea con θ grande es la DESVIACIÓN HORIZONTAL de la barra,
 * porque esa sí se mide en el eje comprimido. Por eso `obliquityDeg` se calcula
 * y se guarda: no hace falta para la escala, hace falta para saber de qué
 * métricas fiarse. Ver `quality.ts`.
 */

// =====================================================================
// TIPOS
// =====================================================================

/**
 * Una elipse tal y como la devuelve `cv.fitEllipse`, en píxeles del vídeo
 * original (no de la imagen reducida con la que trabaja el detector).
 *
 * `width` y `height` son los ejes COMPLETOS, no los semiejes, y `angleDeg` es
 * el giro del eje `width` respecto de la horizontal de la imagen. Cuál de los
 * dos es el mayor no está garantizado: depende del contorno.
 */
export interface PlateEllipse {
    cx: number;
    cy: number;
    width: number;
    height: number;
    angleDeg: number;
}

/**
 * De dónde salió la escala. Ordenado de más a menos fiable, y esa fiabilidad
 * es lo que puntúa `quality.ts`.
 *
 *   'auto'      — el detector encontró el disco solo.
 *   'assisted'  — el detector lo encontró donde el usuario le señaló.
 *   'ring'      — no se encontró: el usuario ajustó un aro a ojo.
 *   'two_points'— respaldo antiguo: dos clics en los bordes del disco.
 */
export type CalibrationMethod = 'auto' | 'assisted' | 'ring' | 'two_points';

export interface Calibration {
    method: CalibrationMethod;
    /** Diámetro real del disco, en metros. 0,45 es el de competición. */
    plateDiameterM: number;
    /** Lo que de verdad fija la escala: la altura del disco en la imagen. */
    verticalExtentPx: number;
    /** metros por píxel. Es el número que consume todo el análisis. */
    pixelToMeterRatio: number;
    /**
     * Desviación estimada de la cámara respecto de la perpendicular, en
     * grados. `null` cuando la escala es manual y no hay elipse que medir.
     */
    obliquityDeg: number | null;
    /** Confianza del detector, 0–1. `null` si no intervino. */
    detectionScore: number | null;
    ellipse: PlateEllipse | null;
}

/** Diámetro de un disco de competición (IPF / IWF), en metros. */
export const COMPETITION_PLATE_M = 0.45;

/**
 * Diámetros habituales, para cuando no se entrena con bumpers de competición.
 *
 * Está porque el error de suponer 45 cm en un disco de hierro de 32 cm es del
 * 40% en la velocidad, y nadie lo notaría: los números seguirían pareciendo
 * razonables. Es exactamente el tipo de fallo silencioso que §7.1 del
 * documento de arquitectura pedía evitar.
 */
export const PLATE_PRESETS: { label: string; meters: number }[] = [
    { label: '45 cm · competición', meters: 0.45 },
    { label: '40 cm', meters: 0.40 },
    { label: '35 cm', meters: 0.35 },
    { label: '32 cm · hierro 10 kg', meters: 0.32 },
];

// =====================================================================
// GEOMETRÍA
// =====================================================================

const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Altura de la elipse en la imagen, en píxeles.
 *
 * Con semiejes a y b girados un ángulo α, la coordenada vertical de un punto
 * de la elipse es  y = cy + a·cos t·sin α + b·sin t·cos α, cuyo máximo es
 * √(a²sin²α + b²cos²α). Por dos, la altura completa.
 *
 * Es el único número de aquí que entra en el cálculo de la velocidad.
 */
export function verticalExtentPx(e: PlateEllipse): number {
    const a = e.width / 2;
    const b = e.height / 2;
    const s = Math.sin(rad(e.angleDeg));
    const c = Math.cos(rad(e.angleDeg));
    return 2 * Math.sqrt(a * a * s * s + b * b * c * c);
}

/** Lo mismo en horizontal. Solo se usa para juzgar el ángulo de cámara. */
export function horizontalExtentPx(e: PlateEllipse): number {
    const a = e.width / 2;
    const b = e.height / 2;
    const s = Math.sin(rad(e.angleDeg));
    const c = Math.cos(rad(e.angleDeg));
    return 2 * Math.sqrt(a * a * c * c + b * b * s * s);
}

/**
 * Cuánto se desvía la cámara de la perpendicular a la barra, en grados.
 *
 * El disco es un círculo: si en la imagen sale achatado, es porque se mira de
 * lado. La razón entre el eje menor y el mayor vale cos θ.
 *
 * Es una estimación con dos límites que conviene no olvidar: no distingue si
 * el giro es horizontal (cámara a un lado) o vertical (cámara alta o baja), y
 * un disco parcialmente tapado puede ajustarse a una elipse más achatada de lo
 * que es. Sirve para decidir de qué fiarse, no para corregir nada.
 */
export function obliquityDeg(e: PlateEllipse): number {
    const major = Math.max(e.width, e.height);
    const minor = Math.min(e.width, e.height);
    if (major <= 0) return 0;
    const ratio = Math.min(1, Math.max(0, minor / major));
    return (Math.acos(ratio) * 180) / Math.PI;
}

// =====================================================================
// CONSTRUCCIÓN DE LA CALIBRACIÓN
// =====================================================================

/** La escala a partir de una elipse detectada. El camino bueno. */
export function calibrationFromEllipse(
    ellipse: PlateEllipse,
    plateDiameterM: number,
    method: 'auto' | 'assisted',
    detectionScore: number
): Calibration {
    const extent = verticalExtentPx(ellipse);
    return {
        method,
        plateDiameterM,
        verticalExtentPx: extent,
        pixelToMeterRatio: extent > 0 ? plateDiameterM / extent : 0,
        obliquityDeg: obliquityDeg(ellipse),
        detectionScore,
        ellipse,
    };
}

/**
 * La escala a partir de un aro puesto a mano.
 *
 * Se trata como un círculo perfecto porque no hay más información: el usuario
 * ha ajustado un radio, no una elipse. Eso significa que hereda el error del
 * ángulo de cámara que el método de la elipse evita, y por eso `quality.ts` lo
 * penaliza. No se elimina la opción: cuando la detección falla, un número con
 * su salvedad escrita vale más que ningún número.
 */
export function calibrationFromRing(
    cx: number,
    cy: number,
    radiusPx: number,
    plateDiameterM: number
): Calibration {
    const extent = radiusPx * 2;
    return {
        method: 'ring',
        plateDiameterM,
        verticalExtentPx: extent,
        pixelToMeterRatio: extent > 0 ? plateDiameterM / extent : 0,
        obliquityDeg: null,
        detectionScore: null,
        ellipse: { cx, cy, width: extent, height: extent, angleDeg: 0 },
    };
}

/** La escala a partir de dos clics en los bordes del disco. */
export function calibrationFromTwoPoints(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    plateDiameterM: number
): Calibration {
    const extent = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    return {
        method: 'two_points',
        plateDiameterM,
        verticalExtentPx: extent,
        pixelToMeterRatio: extent > 0 ? plateDiameterM / extent : 0,
        obliquityDeg: null,
        detectionScore: null,
        ellipse: null,
    };
}

/**
 * La misma calibración con otro diámetro de disco.
 *
 * Cambiar de 45 a 32 cm no vuelve a detectar nada: la elipse medida sigue
 * siendo válida, lo que cambia es cuántos metros representa.
 */
export function withPlateDiameter(cal: Calibration, plateDiameterM: number): Calibration {
    return {
        ...cal,
        plateDiameterM,
        pixelToMeterRatio: cal.verticalExtentPx > 0 ? plateDiameterM / cal.verticalExtentPx : 0,
    };
}

/** Etiqueta corta del método, para pantalla. */
export const CALIBRATION_METHOD_LABEL: Record<CalibrationMethod, string> = {
    auto: 'Disco detectado automáticamente',
    assisted: 'Disco detectado donde lo señalaste',
    ring: 'Aro ajustado a mano',
    two_points: 'Dos puntos marcados a mano',
};
