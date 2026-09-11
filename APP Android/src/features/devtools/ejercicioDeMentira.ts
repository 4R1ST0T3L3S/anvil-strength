import type { ExtendedSessionExercise } from '../planning/components/builder/types';
import type { TrainingSet } from '../../types/training';

/**
 * UNA SENTADILLA CON DOS MÉTODOS, PARA EL BANCO DE PIEZAS.
 * =====================================================================
 *
 * Es el caso exacto que la pantalla de programación no sabía representar:
 * un top-set por esfuerzo seguido de series de trabajo por porcentaje.
 *
 *     Serie 1   1×1 @RPE 5
 *     Serie 2   3×3  · 180 kg
 *
 * Los datos son inventados y tienen que notarse. Vive en su propio fichero
 * y no dentro de PiezasPreview porque el banco de pantallas
 * (MobilePreview) necesita el mismo material y duplicarlo garantizaría que
 * los dos se separasen.
 */

let n = 0;
const id = () => `demo-set-${++n}`;

function serie(parcial: Partial<TrainingSet>): TrainingSet {
    return {
        id: id(),
        session_exercise_id: 'demo-ex-1',
        order_index: n,
        is_video_required: false,
        ...parcial,
    } as TrainingSet;
}

/** Sentadilla con prescripción MIXTA: RPE arriba, kilos debajo. */
export const EJERCICIO_MIXTO: ExtendedSessionExercise = {
    id: 'demo-ex-1',
    session_id: 'demo-sesion-1',
    exercise_id: 'demo-lib-1',
    order_index: 0,
    section: 'main',
    rest_seconds: 240,
    notes: 'Si la primera serie sale lenta, baja un 2,5% las de trabajo.',
    variant_name: null,
    exercise: {
        id: 'demo-lib-1',
        name: 'Sentadilla',
        muscle_group: 'Piernas',
        video_url: null,
    },
    sets: [
        serie({ target_reps: '1x1', target_metric: 'rpe', target_rpe: '5' }),
        serie({ target_reps: '3x3', target_metric: 'kg', target_load: 180 }),
    ],
} as unknown as ExtendedSessionExercise;

/** La misma, con las dos series en kilos: el caso corriente, sin mezcla. */
export const EJERCICIO_SIMPLE: ExtendedSessionExercise = {
    ...EJERCICIO_MIXTO,
    id: 'demo-ex-2',
    notes: null,
    exercise: { ...EJERCICIO_MIXTO.exercise!, id: 'demo-lib-2', name: 'Press banca' },
    sets: [
        serie({ target_reps: '1x1', target_metric: 'kg', target_load: 140 }),
        serie({ target_reps: '3x5', target_metric: 'kg', target_load: 120 }),
    ],
} as unknown as ExtendedSessionExercise;

// =====================================================================
// UNA SEMANA ENTERA, PARA EL PANEL DE VOLUMEN
// =====================================================================

import type { VolumeSessionInput } from '../../lib/volume/engine';
import type { ObjetivoDeVolumen, MetricaDeVolumen } from '../../lib/volume/objetivos';

function ejercicio(nombre: string, series: { reps: string; kg: number }[]) {
    return {
        id: `demo-vol-${nombre}-${++n}`,
        exercise: { name: nombre, muscle_group: null, primary_muscles: null, secondary_muscles: null },
        variant_name: null,
        sets: series.map(s => serie({ target_reps: s.reps, target_metric: 'kg', target_load: s.kg })),
    };
}

/**
 * Semana 3: sentadilla 3 días, banca 2, peso muerto 1.
 *
 * Las cifras están elegidas para que el panel enseñe los TRES estados de la
 * barra a la vez: sentadilla por debajo del objetivo, banca justo, peso
 * muerto pasado. Si las tres fueran iguales no se vería que el color cambia.
 */
export const SEMANA_DE_MENTIRA: VolumeSessionInput[] = [
    {
        id: 'demo-s1', week_number: 3, day_number: 1, day_of_week: 'monday',
        exercises: [
            ejercicio('Sentadilla', [{ reps: '4x5', kg: 180 }]),
            ejercicio('Press banca', [{ reps: '5x5', kg: 120 }]),
        ],
    },
    {
        id: 'demo-s2', week_number: 3, day_number: 2, day_of_week: 'wednesday',
        exercises: [
            ejercicio('Peso muerto', [{ reps: '5x3', kg: 220 }]),
            ejercicio('Sentadilla', [{ reps: '3x5', kg: 160 }]),
        ],
    },
    {
        id: 'demo-s3', week_number: 3, day_number: 3, day_of_week: 'friday',
        exercises: [
            ejercicio('Sentadilla', [{ reps: '2x3', kg: 195 }]),
            ejercicio('Press banca', [{ reps: '4x8', kg: 100 }]),
        ],
    },
];

/** 12 series de sentadilla, 9 de banca, 4 de peso muerto; y las reps. */
export const OBJETIVOS_DE_MENTIRA: ObjetivoDeVolumen[] = ([
    { scope_key: 'SQ', label: 'Sentadilla', metric: 'series', target: 12 },
    { scope_key: 'SQ', label: 'Sentadilla', metric: 'reps', target: 60 },
    { scope_key: 'BP', label: 'Press banca', metric: 'series', target: 9 },
    { scope_key: 'DL', label: 'Peso muerto', metric: 'series', target: 4 },
] as { scope_key: string; label: string; metric: MetricaDeVolumen; target: number }[]).map((o, i) => ({
    id: `demo-obj-${i}`,
    coach_id: 'demo-coach',
    athlete_id: 'demo-atleta',
    block_id: null,
    week_number: null,
    scope: 'lift' as const,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    ...o,
}));

// =====================================================================
// ESTADÍSTICAS DEL ATLETA
// =====================================================================

import type { FaseDeTemporada } from '../../lib/period/fases';
import type { ResumenDeMovimiento, PuntoE1RM } from '../../lib/stats/e1rmProgress';
import type { CompetitionAssignment } from '../../services/competitionsService';

/** Temporada de cuatro fases; la de HOY es la segunda. */
export const FASES_DE_MENTIRA: FaseDeTemporada[] = (() => {
    const hoy = new Date();
    // La fase actual empieza hace 15 días → semana 3 de 4.
    const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 14 - 28);
    const iso = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    return [
        { name: 'Preparatoria', weeks: 4, start_date: iso(inicio) },
        { name: 'Hipertrofia', weeks: 4, start_date: null },
        { name: 'Fuerza', weeks: 4, start_date: null },
        { name: 'Peaking', weeks: 3, start_date: null },
    ].map((f, i) => ({
        id: `demo-fase-${i}`,
        coach_id: 'demo-coach',
        athlete_id: 'demo-atleta',
        macro_id: null,
        movement: null,
        order_index: i,
        end_date: null,
        color: null,
        icon: null,
        notes: i === 1 ? 'Semana de acumulación. Sube el volumen, no los kilos.' : null,
        ...f,
    }));
})();

/** Competición dentro de 104 días, como el ejemplo del encargo. */
export const COMPETICION_DE_MENTIRA: CompetitionAssignment = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 104);
    return {
        id: 'demo-comp',
        athlete_id: 'demo-atleta',
        coach_id: 'demo-coach',
        name: 'Campeonato de España',
        date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        location: 'Madrid',
        created_at: '2026-01-01',
    };
})();

/** Sentadilla y banca con evolución; peso muerto SIN registro, a propósito. */
export const RESUMENES_DE_MENTIRA: ResumenDeMovimiento[] = (() => {
    const punto = (i: number, e1rm: number): PuntoE1RM => ({
        sessionId: `demo-ses-${i}-${e1rm}`,
        date: `2026-0${Math.min(9, 6 + Math.floor(i / 4))}-${String((i % 28) + 1).padStart(2, '0')}`,
        label: `${(i % 28) + 1} sep`,
        blockName: 'Bloque 3',
        weekNumber: Math.floor(i / 2) + 1,
        e1rm,
        load: Math.round(e1rm * 0.9),
        reps: 3,
    });

    return [
        {
            lift: 'SQ', label: 'Sentadilla',
            puntos: [223, 226, 228, 231, 230, 235].map((v, i) => punto(i, v)),
            actual: 235, delta: 12, mejor: 235,
        },
        {
            lift: 'BP', label: 'Press banca',
            puntos: [177.5, 180, 182.5, 181, 185].map((v, i) => punto(i, v)),
            actual: 185, delta: 7.5, mejor: 185,
        },
        { lift: 'DL', label: 'Peso muerto', puntos: [], actual: null, delta: null, mejor: null },
    ];
})();
