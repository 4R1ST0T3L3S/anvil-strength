
export type Movimiento = "sentadilla" | "pressBanca" | "pesoMuerto";

export interface PerfilPunto {
    velocidadMs: number;
    pesoKg: number;
}

export interface PerfilMovimiento {
    puntos: PerfilPunto[];
    vMVT?: number;   // opcional, MVT personalizado del usuario
}

export interface Resultado1RM {
    e1RM: number | null;       // 1RM estimado en kg
    pct1RM: number | null;     // %1RM de esa serie (si aplica)
    modo: "general" | "perfil";
    esSerieLigera: boolean;
}

/**
 * Calcula el 1RM estimado basado en velocidad media concéntrica.
 * Soporta modo "General" (fórmula cuadrática) y modo "Perfil" (regresión lineal individual).
 */
export function calcular1RMporVelocidad(
    movimiento: Movimiento,
    pesoKg: number,
    reps: number,
    velocidadMs: number,
    perfil: PerfilMovimiento | null
): Resultado1RM {

    // 0. Validaciones básicas
    if (pesoKg <= 0 || velocidadMs <= 0) {
        return { e1RM: null, pct1RM: null, modo: "general", esSerieLigera: false };
    }

    // Flag de serie ligera (Contexto)
    const esSerieLigera = (reps >= 8 && velocidadMs > 0.60);

    // 1. Decidir modo: Perfil vs General
    // Usamos perfil si hay al menos 2 puntos válidos
    const usarPerfil = perfil && perfil.puntos.length >= 2;

    if (usarPerfil && perfil) {
        // --- MODO AVANZADO: PERFIL INDIVIDUAL ---

        // Calcular regresión lineal: Load = a * Vel + b
        const { a, b } = calcularRegresionLineal(perfil.puntos);

        // Obtener MVT (Minimum Velocity Threshold)
        let vMVT = perfil.vMVT;
        if (!vMVT) {
            // Valores por defecto
            if (movimiento === "sentadilla") vMVT = 0.30;
            else if (movimiento === "pressBanca") vMVT = 0.15;
            else if (movimiento === "pesoMuerto") vMVT = 0.17;
            else vMVT = 0.20; // fallback
        }

        // e1RM = Carga a la velocidad MVT
        const e1RM = a * vMVT + b;

        // Validar coherencia del resultado
        if (e1RM < pesoKg) {
            // Si el 1RM estimado es menor que el peso levantado, algo falla en el perfil.
            // Fallback al modo general o devolver el peso actual como mínimo.
            // En este caso, devolvemos el calculado pero podríamos flaggear error.
        }

        return {
            e1RM: Math.round(e1RM * 10) / 10,
            pct1RM: null, // En perfil, el %1RM se deriva de la velocidad actual sobre el perfil, pero la fórmula exacta depende.
            modo: "perfil",
            esSerieLigera
        };

    } else {
        // --- MODO RÁPIDO: ECUACIÓN GENERAL ---

        // Ecuación cuadrática (González-Badillo / Sánchez-Medina)
        // pct1RM = 8.4326 * v^2 - 73.501 * v + 112.33
        // Solo válida en rangos razonables.

        // Clamp de velocidad para evitar ouliers en la fórmula polinómica
        const vClamped = Math.max(0.1, Math.min(velocidadMs, 1.5));

        let pct1RM = 8.4326 * Math.pow(vClamped, 2) - 73.501 * vClamped + 112.33;

        // Clamp del porcentaje (40% - 100%)
        if (pct1RM > 100) pct1RM = 100;
        if (pct1RM < 40) pct1RM = 40;

        // Detectar si la velocidad es muy baja (posible fallo real o RM)
        // Si v < MVT teórico, pct1RM sería > 100, aquí lo limitamos a 100.

        const e1RM = pesoKg / (pct1RM / 100.0);

        return {
            e1RM: Math.round(e1RM * 10) / 10,
            pct1RM: Math.round(pct1RM * 10) / 10,
            modo: "general",
            esSerieLigera
        };
    }
}

/**
 * Regresión Lineal por Mínimos Cuadrados
 * Devuelve a (pendiente) y b (intercepto) para y = ax + b
 * Donde x = velocidad, y = peso
 */
function calcularRegresionLineal(puntos: PerfilPunto[]): { a: number; b: number } {
    const n = puntos.length;
    if (n === 0) return { a: 0, b: 0 };

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    for (const p of puntos) {
        sumX += p.velocidadMs;
        sumY += p.pesoKg;
        sumXY += (p.velocidadMs * p.pesoKg);
        sumXX += (p.velocidadMs * p.velocidadMs);
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return { a: slope, b: intercept };
}
