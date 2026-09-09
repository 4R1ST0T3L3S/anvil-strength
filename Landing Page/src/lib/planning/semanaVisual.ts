/**
 * ANVIL STRENGTH — LA SEMANA DE UN VISTAZO
 * =====================================================================
 *
 * "Lunes: sentadilla y banca. Martes: peso muerto. Miércoles: descanso."
 * Es la vista que contesta si la semana está bien REPARTIDA, que es una
 * pregunta distinta de si tiene el volumen correcto.
 *
 *
 * PIVOTA, NO RECUENTA
 *
 * `weeklyLiftSummary` ya devuelve, por cada básico, en qué días aparece y
 * con qué series, repeticiones, detalle e intensidad
 * (`LiftDayEntry`). Aquí solo se le da la vuelta a esa tabla: de "por
 * levantamiento, sus días" a "por día, sus levantamientos".
 *
 * Hacerlo así no es una comodidad, es lo que garantiza que el planificador
 * y el panel de volumen digan lo mismo. Un contador propio daría dos cifras
 * distintas de la misma semana en dos sitios que se miran a la vez, y la
 * equivocada sería la nueva: `weeklyLiftSummary` se apoya en el
 * clasificador SQ/BP/DL con su lista de exclusiones (búlgara, frontal,
 * militar, francés, rumano…), que costó descubrir caso a caso.
 *
 * Lo único que se cuenta aquí de cero son las series ACCESORIAS, porque
 * aquella función solo mira los tres básicos. Se cuentan con
 * `computeSetMetrics`, la misma que usa ella para los básicos.
 *
 *
 * LAS BANDAS DESCRIBEN, NO JUZGAN
 *
 * Cada día se marca como volumen alto/medio/bajo e intensidad alta/media/
 * baja **respecto a los otros días de esa misma semana**, nunca contra un
 * ideal. El encargo es explícito: "no hace falta que el sistema juzgue
 * automáticamente si la programación es buena o mala; debe facilitar que el
 * entrenador pueda verla".
 *
 * Por eso tampoco hay banda cuando solo hay un día con trabajo: "alto" y
 * "bajo" no significan nada sin nada con qué compararse, y pintar el único
 * día de la semana como "alto" sería inventarse una lectura.
 */

import type { VolumeSessionInput } from '../volume/engine';
import { computeSetMetrics, buildReferenceMaxes, exerciseKey } from './blockAnalytics';
import { classifyMainLift } from './mainLift';
import { weeklyLiftSummary, MAIN_LIFTS, type MainLift } from './liftSummary';
import { WEEKDAYS, weekdayLabel, type Weekday } from '../../types/training';

// =====================================================================
// EL DATO
// =====================================================================

export type Banda = 'alto' | 'medio' | 'bajo';

/** Lo que se hace de UN básico en UN día. */
export interface BasicoDelDia {
    lift: MainLift;
    label: string;
    sets: number;
    reps: number;
    /** "4 × 5 @ 72%", tal y como lo compone `liftSummary`. */
    detail: string;
    /** %1RM de la serie más pesada. `null` sin referencia o sin kilos. */
    topIntensity: number | null;
}

export interface DiaDeLaSemana {
    /** `null` en la columna de los días sin agendar. */
    weekday: Weekday | null;
    /** "Lunes", o "Sin agendar". */
    etiqueta: string;
    /** Abreviatura para la rejilla: "LUN". */
    corta: string;
    /** Ids de las sesiones que caen ese día. Puede haber más de una. */
    sessionIds: string[];
    basicos: BasicoDelDia[];
    /** Series que NO son de un básico de competición. */
    seriesAccesorias: number;
    seriesTotales: number;
    /** Media de la intensidad punta de los básicos del día, en %1RM. */
    intensidadMedia: number | null;
    /** No hay ninguna serie programada. */
    esDescanso: boolean;
    /** Relativa a los DEMÁS días con trabajo de esta semana. */
    bandaVolumen: Banda | null;
    bandaIntensidad: Banda | null;
}

export interface FrecuenciaDeBasico {
    lift: MainLift;
    label: string;
    /** Días distintos en los que aparece. Es la frecuencia semanal. */
    dias: number;
    sets: number;
}

export interface SemanaVisual {
    /** Los siete días, siempre los siete, más "Sin agendar" si hace falta. */
    dias: DiaDeLaSemana[];
    frecuencia: FrecuenciaDeBasico[];
    totalSeries: number;
    /** Días con al menos una serie. */
    diasEntrenados: number;
}

// =====================================================================

/** Clave con la que un día se identifica en el pivote. */
const CLAVE_SIN_AGENDAR = '__sin_agendar__';

/**
 * Series accesorias por sesión.
 *
 * "Accesorio" aquí es todo lo que `classifyMainLift` NO clasifica como
 * básico de competición, que es exactamente el complemento de lo que cuenta
 * `weeklyLiftSummary`. Así, básicos + accesorios = el total, sin huecos ni
 * solapes.
 *
 * NO hace falta filtrar aquí el calentamiento ni el cardio. `toVolumeInput`
 * —la única traducción entre el estado del constructor y los módulos de
 * cálculo— ya los descarta con `countsForVolume` antes de construir el
 * `VolumeSessionInput`, así que todo lo que llega hasta aquí cuenta. Volver
 * a comprobarlo daría a entender que el filtro vive en este módulo, y de
 * paso leería una propiedad `section` que este tipo ni siquiera tiene.
 */
function accesoriasDe(session: VolumeSessionInput, maxes: Map<string, { oneRm: number }>): number {
    let total = 0;
    for (const ex of session.exercises) {
        const name = ex.exercise?.name ?? '';
        if (classifyMainLift(name) !== 'ACC') continue;

        const reference = maxes.get(exerciseKey(name))?.oneRm ?? null;
        for (const set of ex.sets ?? []) {
            const m = computeSetMetrics(set, reference);
            if (m.series > 0) total += m.series;
        }
    }
    return total;
}

/**
 * Reparte una lista de valores en tres bandas por TERCILES.
 *
 * Terciles y no umbrales fijos: "12 series es mucho" depende del atleta, de
 * la fase y del movimiento, y un umbral escrito aquí sería justo el juicio
 * automático que el encargo pide no hacer. Los terciles solo dicen "de los
 * días de ESTA semana, este es de los que más".
 *
 * Con menos de dos valores distintos no se reparte nada: todo `null`. Un
 * único día con trabajo no puede ser "el que más".
 */
function bandas(valores: (number | null)[]): (Banda | null)[] {
    const validos = valores.filter((v): v is number => v != null && v > 0);
    const distintos = new Set(validos);
    if (distintos.size < 2) return valores.map(() => null);

    const ordenados = [...validos].sort((a, b) => a - b);
    // Los cortes se toman sobre el ÚLTIMO índice (n-1), no sobre n.
    //
    // Con `floor(n/3)` y tres días de trabajo salía corteBajo = ordenados[1],
    // o sea el valor del MEDIO, y como la comparación es `<=`, el día del
    // medio se marcaba "bajo": una semana de 9/8/6 series decía alto, bajo y
    // bajo. Sobre n-1 los tres cortes caen donde tienen que caer —el primero,
    // el del medio y el último— y esa misma semana dice alto, medio y bajo.
    const ultimo = ordenados.length - 1;
    const corteBajo = ordenados[Math.floor(ultimo / 3)];
    const corteAlto = ordenados[Math.ceil((ultimo * 2) / 3)];

    return valores.map(v => {
        if (v == null || v <= 0) return null;
        if (v >= corteAlto && corteAlto > corteBajo) return 'alto';
        if (v <= corteBajo) return 'bajo';
        return 'medio';
    });
}

/**
 * La semana entera, pivotada por día.
 *
 * `primerDia` respeta la preferencia del entrenador (lunes o domingo), igual
 * que el menú "Agendar en" del constructor: si la rejilla empezara siempre
 * en lunes y el menú en domingo, los dos estarían describiendo la misma
 * semana en órdenes distintos.
 */
export function semanaVisual(
    sessions: VolumeSessionInput[],
    week: number,
    declaredMaxes: Record<string, number> = {},
    primerDia: 'monday' | 'sunday' = 'monday'
): SemanaVisual {
    const deLaSemana = sessions.filter(s => s.week_number === week);
    const maxes = buildReferenceMaxes(sessions, declaredMaxes);
    const resumen = weeklyLiftSummary(sessions, week, declaredMaxes);

    // --- 1. El pivote: de "por básico, sus días" a "por día, sus básicos".
    const porDia = new Map<string, BasicoDelDia[]>();
    /** sessionId -> la clave de día en la que cae. */
    const diaDeSesion = new Map<string, string>();

    for (const s of deLaSemana) {
        diaDeSesion.set(s.id, s.day_of_week ?? CLAVE_SIN_AGENDAR);
    }

    for (const lift of resumen) {
        for (const dia of lift.days) {
            const clave = diaDeSesion.get(dia.sessionId) ?? CLAVE_SIN_AGENDAR;
            const lista = porDia.get(clave) ?? [];
            // Un mismo día puede tener DOS sesiones (mañana y tarde). Se
            // funden en una entrada: para "qué entreno el lunes" son el
            // mismo lunes, y dos tarjetas idénticas obligarían a sumarlas a
            // ojo.
            const previo = lista.find(b => b.lift === lift.lift);
            if (previo) {
                previo.sets += dia.sets;
                previo.reps += dia.reps;
                previo.detail = `${previo.detail} · ${dia.detail}`;
                if (dia.topIntensity != null && (previo.topIntensity == null || dia.topIntensity > previo.topIntensity)) {
                    previo.topIntensity = dia.topIntensity;
                }
            } else {
                lista.push({
                    lift: lift.lift,
                    label: lift.label,
                    sets: dia.sets,
                    reps: dia.reps,
                    detail: dia.detail,
                    topIntensity: dia.topIntensity,
                });
            }
            porDia.set(clave, lista);
        }
    }

    // --- 2. Accesorios y sesiones por día.
    const accesoriasPorDia = new Map<string, number>();
    const sesionesPorDia = new Map<string, string[]>();
    for (const s of deLaSemana) {
        const clave = s.day_of_week ?? CLAVE_SIN_AGENDAR;
        accesoriasPorDia.set(clave, (accesoriasPorDia.get(clave) ?? 0) + accesoriasDe(s, maxes));
        sesionesPorDia.set(clave, [...(sesionesPorDia.get(clave) ?? []), s.id]);
    }

    // --- 3. Los siete días, SIEMPRE los siete.
    //     Un día de descanso es información: la rejilla tiene que enseñar el
    //     hueco, no saltárselo. Si solo se pintaran los días con trabajo, una
    //     semana de tres días parecería una de tres días seguidos.
    const orden = primerDia === 'sunday'
        ? [WEEKDAYS[6], ...WEEKDAYS.slice(0, 6)]
        : WEEKDAYS;

    const dias: DiaDeLaSemana[] = orden.map(d => construir(d.key, d.label, d.short));

    // La columna de los sin agendar solo existe si hay alguno.
    if (sesionesPorDia.has(CLAVE_SIN_AGENDAR)) {
        dias.push(construir(null, 'Sin agendar', 'S/A'));
    }

    function construir(weekday: Weekday | null, etiqueta: string, corta: string): DiaDeLaSemana {
        const clave = weekday ?? CLAVE_SIN_AGENDAR;
        const basicos = (porDia.get(clave) ?? []).slice().sort(
            (a, b) => MAIN_LIFTS.indexOf(a.lift) - MAIN_LIFTS.indexOf(b.lift)
        );
        const seriesAccesorias = accesoriasPorDia.get(clave) ?? 0;
        const seriesDeBasicos = basicos.reduce((n, b) => n + b.sets, 0);

        const intensidades = basicos.map(b => b.topIntensity).filter((v): v is number => v != null);
        const intensidadMedia = intensidades.length > 0
            ? Math.round(intensidades.reduce((a, b) => a + b, 0) / intensidades.length)
            : null;

        const seriesTotales = seriesDeBasicos + seriesAccesorias;

        return {
            weekday,
            etiqueta: weekday ? (weekdayLabel(weekday) ?? etiqueta) : etiqueta,
            corta,
            sessionIds: sesionesPorDia.get(clave) ?? [],
            basicos,
            seriesAccesorias,
            seriesTotales,
            intensidadMedia,
            esDescanso: seriesTotales === 0,
            bandaVolumen: null,
            bandaIntensidad: null,
        };
    }

    // --- 4. Bandas, relativas a esta misma semana.
    const bandasVol = bandas(dias.map(d => d.seriesTotales));
    const bandasInt = bandas(dias.map(d => d.intensidadMedia));
    dias.forEach((d, i) => {
        d.bandaVolumen = bandasVol[i];
        d.bandaIntensidad = bandasInt[i];
    });

    // --- 5. Frecuencia por básico. Sale del resumen, no se recuenta.
    const frecuencia: FrecuenciaDeBasico[] = resumen.map(l => ({
        lift: l.lift,
        label: l.label,
        // OJO: `l.frequency` cuenta SESIONES, y dos sesiones el mismo lunes
        // son un solo día de sentadilla. La frecuencia se cuenta sobre días
        // distintos, que es lo que significa "3 veces por semana".
        dias: new Set(l.days.map(d => diaDeSesion.get(d.sessionId) ?? CLAVE_SIN_AGENDAR)).size,
        sets: l.sets,
    }));

    return {
        dias,
        frecuencia,
        totalSeries: dias.reduce((n, d) => n + d.seriesTotales, 0),
        diasEntrenados: dias.filter(d => !d.esDescanso).length,
    };
}
