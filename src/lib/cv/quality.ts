/**
 * ANVIL STRENGTH — ¿ME PUEDO FIAR DE ESTA MEDICIÓN?
 * =====================================================================
 *
 * POR QUÉ EXISTE
 *
 * El analizador SIEMPRE devuelve números. Con la cámara en diagonal, con el
 * seguimiento perdido a mitad de la serie, con un vídeo a 24 fotogramas donde
 * la fase concéntrica dura cuatro muestras: siempre salen 0,58 m/s y 740 W,
 * escritos con la misma tipografía y la misma seguridad que cuando el vídeo es
 * bueno.
 *
 * Eso es peor que no medir. Un hueco se pregunta; un número se cree.
 *
 * Este módulo pone una cifra a esa confianza, la desglosa en las cinco cosas
 * que de verdad la determinan, y —cuando alguna está lo bastante mal— **impide
 * guardar**. Es la §7.2 del documento de arquitectura, llevada a código.
 *
 *
 * POR QUÉ BLOQUEA Y NO SE LIMITA A AVISAR
 *
 * Porque el destino de estos números es el perfil carga-velocidad del atleta,
 * que se lee durante meses y del que sale la prescripción. Una medición mala
 * no molesta hoy: contamina la serie temporal. Y un aviso que se puede ignorar
 * se ignora, sobre todo en un gimnasio y con prisa.
 *
 * La franja intermedia sí avisa y deja pasar, porque una regla que rechaza
 * demasiado empuja a la gente a apuntar los números a mano, que es todavía
 * peor.
 *
 *
 * QUÉ NO ES
 *
 * No es una validación contra un encoder. Nadie ha comprobado que un 82 sobre
 * 100 signifique ±3% en la velocidad real: los pesos y los cortes de aquí
 * abajo son criterio razonado, no calibración empírica, y están escritos como
 * constantes con nombre para que se puedan discutir y cambiar. Lo que sí hace
 * es ordenar correctamente: una medición de 40 es peor que una de 85.
 */

import type { Calibration } from './plateGeometry';

// =====================================================================
// ENTRADAS
// =====================================================================

/** Lo que el seguimiento sabe de sí mismo y nadie estaba recogiendo. */
export interface TrackingStats {
    /** Fotogramas que se le pidieron al flujo óptico. */
    framesProcessed: number;
    /** De esos, en cuántos dijo "he perdido el punto". */
    framesLost: number;
    /** Mayor salto entre dos fotogramas seguidos, en píxeles. */
    maxJumpPx: number;
    /** Duración analizada, en segundos. */
    durationS: number;
    /** Alto del vídeo, para poder leer el salto en términos relativos. */
    frameHeightPx: number;
}

export interface QualityInput {
    calibration: Calibration;
    tracking: TrackingStats;
    /** Muestras de la fase concéntrica que se ha usado para las métricas. */
    concentricSamples: number;
    concentricDurationS: number;
    romM: number;
    meanVelocityMs: number;
}

// =====================================================================
// SALIDA
// =====================================================================

export type QualityVerdict = 'ok' | 'warn' | 'blocked';

export interface QualityDimension {
    key: string;
    label: string;
    /** 0–100. */
    score: number;
    /** Frase corta, en cristiano, de qué se ha medido. */
    detail: string;
    /**
     * Un fallo crítico bloquea el guardado por sí solo, sin importar la nota
     * global. Existe porque una media aritmética esconde un cero: 25 puntos de
     * seguimiento perdido con todo lo demás perfecto seguirían dando un
     * aprobado, y esa medición no vale.
     */
    critical: boolean;
    weight: number;
}

export interface QualityReport {
    /** 0–100. */
    score: number;
    verdict: QualityVerdict;
    dimensions: QualityDimension[];
    /** Por qué no está en verde. Vacío si lo está. */
    reasons: string[];
    /** Métricas cuyo valor no es de fiar aunque la medición se guarde. */
    unreliableMetrics: string[];
}

// =====================================================================
// UMBRALES
// =====================================================================

/** Por debajo de esto no se guarda. */
export const BLOCK_BELOW = 50;
/** Entre este y el anterior se guarda, con la salvedad escrita. */
export const WARN_BELOW = 75;

/**
 * A partir de este ángulo la desviación horizontal de la barra deja de ser
 * interpretable: se mide sobre el eje que la perspectiva comprime.
 *
 * La escala vertical NO se ve afectada —ver plateGeometry.ts—, así que esto
 * penaliza la confianza pero no invalida la velocidad.
 */
const OBLIQUITY_WARN_DEG = 22;
const OBLIQUITY_BAD_DEG = 42;
const OBLIQUITY_CRITICAL_DEG = 58;

/** Un salto mayor que este porcentaje del alto del vídeo es un teletransporte. */
const JUMP_CRITICAL_FRAC = 0.10;

/** Menos muestras que esto en la concéntrica y el pico de velocidad es ruido. */
const CONCENTRIC_SAMPLES_CRITICAL = 6;

/** Rango físicamente admisible de un levantamiento. Fuera de él, hay un fallo. */
const ROM_MIN_M = 0.12;
const ROM_MAX_M = 1.20;
const VEL_MIN_MS = 0.05;
const VEL_MAX_MS = 3.00;

/**
 * Cuánto vale cada método de calibración.
 *
 * `auto` no es 100 porque el detector también se equivoca; el aro a mano no es
 * 0 porque un usuario atento lo ajusta bien. Lo que reflejan estos números es
 * que uno se puede auditar después —queda la elipse guardada— y el otro no.
 */
const METHOD_SCORE: Record<Calibration['method'], number> = {
    auto: 95,
    assisted: 85,
    ring: 35,
    two_points: 45,
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Interpolación lineal entre dos puntos de corte, saturando en los extremos. */
function ramp(value: number, atLow: number, atHigh: number, scoreLow: number, scoreHigh: number): number {
    if (atHigh === atLow) return scoreHigh;
    const t = clamp((value - atLow) / (atHigh - atLow), 0, 1);
    return scoreLow + t * (scoreHigh - scoreLow);
}

// =====================================================================
// EL CÁLCULO
// =====================================================================

export function assessQuality(input: QualityInput): QualityReport {
    const { calibration, tracking } = input;
    const dimensions: QualityDimension[] = [];
    const unreliableMetrics: string[] = [];

    // ---------------------------------------------------------------
    // 1. Calibración — de dónde sale la escala
    // ---------------------------------------------------------------
    {
        let score = METHOD_SCORE[calibration.method];
        let detail: string;

        if (calibration.method === 'auto' || calibration.method === 'assisted') {
            // La confianza del detector modula la nota: un ajuste flojo no
            // vale lo mismo que uno limpio aunque los dos sean "automáticos".
            const conf = calibration.detectionScore ?? 0.5;
            score = score * ramp(conf, 0.2, 0.8, 0.65, 1);
            detail = `Disco de ${Math.round(calibration.verticalExtentPx)} px de alto · ${(calibration.plateDiameterM * 100).toFixed(0)} cm`;
        } else {
            detail = `Escala puesta a mano · ${Math.round(calibration.verticalExtentPx)} px = ${(calibration.plateDiameterM * 100).toFixed(0)} cm`;
        }

        // Un disco muy pequeño en la imagen convierte un error de dos píxeles
        // en un error porcentual grande, venga de donde venga la medida.
        const tooSmall = calibration.verticalExtentPx > 0 && calibration.verticalExtentPx < 70;
        if (tooSmall) {
            score *= 0.6;
            detail += ' · el disco sale muy pequeño en el encuadre';
        }

        dimensions.push({
            key: 'calibration',
            label: 'Escala',
            score: clamp(score, 0, 100),
            detail,
            critical: calibration.pixelToMeterRatio <= 0 || !Number.isFinite(calibration.pixelToMeterRatio),
            weight: 0.35,
        });
    }

    // ---------------------------------------------------------------
    // 2. Ángulo de cámara
    // ---------------------------------------------------------------
    {
        const deg = calibration.obliquityDeg;

        if (deg === null) {
            // Sin elipse no hay forma de estimarlo. Se puntúa en el medio y se
            // dice que no se sabe, en vez de suponer que está bien.
            dimensions.push({
                key: 'camera',
                label: 'Ángulo de cámara',
                score: 60,
                detail: 'No se ha podido estimar (la escala es manual)',
                critical: false,
                weight: 0.20,
            });
            unreliableMetrics.push('horizontal_deviation');
        } else {
            let score: number;
            if (deg <= OBLIQUITY_WARN_DEG) score = ramp(deg, 0, OBLIQUITY_WARN_DEG, 100, 88);
            else if (deg <= OBLIQUITY_BAD_DEG) score = ramp(deg, OBLIQUITY_WARN_DEG, OBLIQUITY_BAD_DEG, 88, 55);
            else score = ramp(deg, OBLIQUITY_BAD_DEG, OBLIQUITY_CRITICAL_DEG, 55, 15);

            if (deg > OBLIQUITY_WARN_DEG) unreliableMetrics.push('horizontal_deviation');

            dimensions.push({
                key: 'camera',
                label: 'Ángulo de cámara',
                score: clamp(score, 0, 100),
                detail:
                    deg <= OBLIQUITY_WARN_DEG
                        ? `${deg.toFixed(0)}° respecto de la perpendicular · encuadre correcto`
                        : `${deg.toFixed(0)}° respecto de la perpendicular · la desviación horizontal de la barra sale comprimida`,
                critical: deg > OBLIQUITY_CRITICAL_DEG,
                weight: 0.20,
            });
        }
    }

    // ---------------------------------------------------------------
    // 3. Seguimiento — ¿la marca se ha quedado en la barra?
    // ---------------------------------------------------------------
    {
        const processed = Math.max(1, tracking.framesProcessed);
        const lossPct = (tracking.framesLost / processed) * 100;

        let score: number;
        if (lossPct <= 2) score = 100;
        else if (lossPct <= 10) score = ramp(lossPct, 2, 10, 100, 65);
        else if (lossPct <= 25) score = ramp(lossPct, 10, 25, 65, 25);
        else score = ramp(lossPct, 25, 50, 25, 0);

        // El salto es un fallo distinto de la pérdida y más traicionero: el
        // flujo óptico dice "seguido correctamente" mientras la marca se ha
        // ido a otro objeto. Se ve como un pico de velocidad imposible.
        const jumpFrac = tracking.frameHeightPx > 0 ? tracking.maxJumpPx / tracking.frameHeightPx : 0;
        const jumped = jumpFrac > JUMP_CRITICAL_FRAC;
        if (jumped) score = Math.min(score, 20);

        dimensions.push({
            key: 'tracking',
            label: 'Seguimiento',
            score: clamp(score, 0, 100),
            detail: jumped
                ? `La marca ha dado un salto de ${Math.round(jumpFrac * 100)}% de la altura del vídeo entre dos fotogramas`
                : `${lossPct.toFixed(1)}% de fotogramas perdidos`,
            critical: lossPct > 25 || jumped,
            weight: 0.25,
        });
    }

    // ---------------------------------------------------------------
    // 4. Muestreo — ¿hay fotogramas suficientes para resolver el pico?
    // ---------------------------------------------------------------
    {
        const n = input.concentricSamples;
        const hz =
            input.concentricDurationS > 0 ? n / input.concentricDurationS : 0;

        let score: number;
        if (n >= 25) score = 100;
        else if (n >= 12) score = ramp(n, 12, 25, 72, 100);
        else if (n >= CONCENTRIC_SAMPLES_CRITICAL) score = ramp(n, CONCENTRIC_SAMPLES_CRITICAL, 12, 30, 72);
        else score = ramp(n, 0, CONCENTRIC_SAMPLES_CRITICAL, 0, 30);

        if (n < 12) unreliableMetrics.push('peak_velocity', 'peak_power', 'rfd');

        dimensions.push({
            key: 'sampling',
            label: 'Muestreo',
            score: clamp(score, 0, 100),
            detail: `${n} muestras en la concéntrica${hz > 0 ? ` · ${hz.toFixed(0)} Hz` : ''}`,
            critical: n < CONCENTRIC_SAMPLES_CRITICAL,
            weight: 0.12,
        });
    }

    // ---------------------------------------------------------------
    // 5. Plausibilidad — ¿el resultado es un levantamiento?
    // ---------------------------------------------------------------
    {
        const romOk = input.romM >= ROM_MIN_M && input.romM <= ROM_MAX_M;
        const velOk = input.meanVelocityMs >= VEL_MIN_MS && input.meanVelocityMs <= VEL_MAX_MS;

        const problems: string[] = [];
        if (!romOk) problems.push(`recorrido de ${(input.romM * 100).toFixed(0)} cm`);
        if (!velOk) problems.push(`velocidad media de ${input.meanVelocityMs.toFixed(2)} m/s`);

        dimensions.push({
            key: 'plausibility',
            label: 'Plausibilidad física',
            score: problems.length === 0 ? 100 : 0,
            detail:
                problems.length === 0
                    ? `Recorrido de ${(input.romM * 100).toFixed(0)} cm a ${input.meanVelocityMs.toFixed(2)} m/s`
                    : `Fuera de rango: ${problems.join(' y ')}. Casi siempre significa que la escala está mal.`,
            critical: problems.length > 0,
            weight: 0.08,
        });
    }

    // ---------------------------------------------------------------
    // Nota global y veredicto
    // ---------------------------------------------------------------
    const totalWeight = dimensions.reduce((s, d) => s + d.weight, 0);
    const score = Math.round(
        dimensions.reduce((s, d) => s + d.score * d.weight, 0) / (totalWeight || 1)
    );

    const hasCritical = dimensions.some(d => d.critical);
    const verdict: QualityVerdict = hasCritical || score < BLOCK_BELOW
        ? 'blocked'
        : score < WARN_BELOW
            ? 'warn'
            : 'ok';

    // Los motivos se ordenan por lo mal que está cada dimensión, para que el
    // primero sea el que hay que arreglar.
    const reasons = dimensions
        .filter(d => d.critical || d.score < WARN_BELOW)
        .sort((a, b) => (Number(b.critical) - Number(a.critical)) || (a.score - b.score))
        .map(d => `${d.label}: ${d.detail}`);

    return {
        score,
        verdict,
        dimensions,
        reasons,
        unreliableMetrics: [...new Set(unreliableMetrics)],
    };
}

// =====================================================================
// LO QUE SE GUARDA CON LA MEDICIÓN
// =====================================================================

/**
 * La calidad, en claves del catálogo de métricas.
 *
 * Va en la bolsa JSONB, así que añadir esto NO es una migración de esquema:
 * son cinco claves nuevas y cinco filas en `metric_definitions`. Es exactamente
 * para lo que se montó el modelo de bolsa.
 *
 * Y no es adorno: sin estos cinco números, dentro de seis meses no habrá forma
 * de saber si aquella velocidad de 0,71 m/s de marzo se midió bien. Con ellos,
 * una medición se puede auditar, comparar, o descartar del perfil a posteriori.
 */
export function qualityToMetricBag(
    report: QualityReport,
    calibration: Calibration,
    tracking: TrackingStats
): Record<string, number | null> {
    const processed = Math.max(1, tracking.framesProcessed);
    return {
        measurement_quality: report.score,
        camera_obliquity: calibration.obliquityDeg,
        tracking_loss: (tracking.framesLost / processed) * 100,
        plate_px: calibration.verticalExtentPx,
        sample_rate: tracking.durationS > 0 ? tracking.framesProcessed / tracking.durationS : null,
    };
}
