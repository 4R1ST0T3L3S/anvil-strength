import { useMemo } from 'react';
import { Trophy, Gauge, Zap } from 'lucide-react';
import type { ExtendedSessionExercise } from '../builder/types';
import {
    buildRepMaxIndex, findRepMax, repsForLookup, markLabel,
    type RepMax,
} from '../../../../lib/stats/repMaxes';
import { ContextSection, ContextEmpty } from './ContextSection';

/**
 * MEJORES MARCAS, CONTRA LO QUE SE ESTÁ ESCRIBIENDO
 * =====================================================================
 *
 * LA PREGUNTA QUE CONTESTA
 *
 * El coach escribe "Sentadilla 200 × 3" y quiere saber, sin salir de ahí:
 * ¿qué es lo mejor que este atleta ha hecho a TRES repeticiones? Si son 205 a
 * RPE 9, el 200 de hoy es un trabajo pesado; si son 230, es una serie de
 * volumen. La misma prescripción significa dos cosas distintas y la
 * diferencia no está en pantalla en ninguna parte.
 *
 *
 * SE BUSCA POR REPETICIONES, NO POR PESO
 *
 * Un "4x3" busca el mejor TRIPLE, no el mejor 4RM: lo que define la marca es
 * cuántas repeticiones lleva cada serie. Y un 220×1 no aparece como
 * referencia de un 200×5, porque no lo es. La regla completa y su banco de
 * pruebas están en `lib/stats/repMaxes.ts`.
 *
 *
 * SOLO SE ENSEÑAN LAS MARCAS DE LOS EJERCICIOS DE ESTE DÍA
 *
 * El histórico completo vive en su pestaña (Estadísticas → Histórico). Aquí
 * cabe una lista corta y lo que hace falta es la referencia de lo que se está
 * escribiendo AHORA, no un catálogo que haya que recorrer.
 */

interface BestMarksMiniProps {
    /** Ejercicios del día que se está editando. */
    exercises: ExtendedSessionExercise[];
    /** Marcas del atleta. Vacío si la migración no está o no tiene ninguna. */
    marks: RepMax[];
    loading?: boolean;
    /** La tabla no existe todavía: hay que ejecutar la migración. */
    unavailable?: boolean;
}

/** Una referencia resuelta para un ejercicio del día. */
interface Reference {
    exerciseId: string;
    exerciseName: string;
    /** Lo que se está pautando: "3" repeticiones. */
    reps: number;
    mark: RepMax | null;
}

export function BestMarksMini({
    exercises, marks, loading = false, unavailable = false,
}: BestMarksMiniProps) {
    const index = useMemo(() => buildRepMaxIndex(marks), [marks]);

    /**
     * Una referencia por (ejercicio, repeticiones) distinto del día.
     *
     * Un ejercicio con series de 5 y de 3 genera DOS referencias, porque son
     * dos marcas distintas y las dos son relevantes. Lo que no se repite es
     * la misma combinación dos veces.
     */
    const references = useMemo(() => {
        const out: Reference[] = [];
        const seen = new Set<string>();

        for (const ex of exercises) {
            const name = ex.exercise?.name;
            if (!name) continue;

            for (const set of ex.sets) {
                const reps = repsForLookup(set.target_reps);
                if (reps == null) continue;

                const key = `${ex.id}|${reps}`;
                if (seen.has(key)) continue;
                seen.add(key);

                out.push({
                    exerciseId: ex.id,
                    exerciseName: name,
                    reps,
                    mark: findRepMax(index, name, reps),
                });
            }
        }

        // Primero las que TIENEN marca: son las únicas accionables. Las que no
        // la tienen se conservan porque decir "no hay marca de 3RM" también es
        // información — invita a registrarla.
        return out.sort((a, b) => Number(!!b.mark) - Number(!!a.mark) || a.reps - b.reps);
    }, [exercises, index]);

    const withMark = references.filter(r => r.mark);

    return (
        <ContextSection
            icon={Trophy}
            title="Histórico"
            badge={withMark.length > 0 ? `${withMark.length}` : undefined}
            hint={
                unavailable
                    ? 'Falta ejecutar la migración'
                    : loading
                        ? 'Cargando marcas…'
                        : withMark.length > 0
                            ? `${withMark.length} ${withMark.length === 1 ? 'referencia' : 'referencias'} para hoy`
                            : 'Sin marcas para lo de hoy'
            }
        >
            {unavailable ? (
                <ContextEmpty>
                    Las mejores marcas necesitan la tabla <code className="text-ink-muted">athlete_rep_maxes</code>.
                    Ejecuta <code className="text-ink-muted">database/CALENDARIO_Y_MARCAS_2026-08-30.sql</code>.
                </ContextEmpty>
            ) : loading ? (
                <ContextEmpty>Cargando las marcas del atleta…</ContextEmpty>
            ) : references.length === 0 ? (
                <ContextEmpty>
                    Añade series con repeticiones concretas y aquí aparecerá lo mejor que
                    ha hecho el atleta con ese número.
                </ContextEmpty>
            ) : (
                <ul className="space-y-1.5">
                    {references.map(ref => (
                        <li
                            key={`${ref.exerciseId}-${ref.reps}`}
                            className="rounded-field bg-surface-sunken px-2.5 py-2"
                        >
                            <div className="flex items-baseline justify-between gap-2">
                                <span className="min-w-0 truncate text-t-2xs font-bold text-ink" title={ref.exerciseName}>
                                    {ref.exerciseName}
                                </span>
                                <span className="shrink-0 text-t-2xs uppercase tracking-wide text-ink-faint">
                                    {markLabel(ref.reps).replace('Mejor ', '')}
                                </span>
                            </div>

                            {ref.mark ? (
                                <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                    <span className="text-t-sm font-black tabular-nums text-brand-text">
                                        {ref.mark.load_kg} × {ref.mark.reps}
                                    </span>
                                    {ref.mark.rpe != null && (
                                        <span className="flex items-center gap-0.5 text-t-2xs tabular-nums text-ink-muted">
                                            <Gauge size={9} aria-hidden="true" />@{ref.mark.rpe}
                                        </span>
                                    )}
                                    {ref.mark.mean_velocity != null && (
                                        <span className="flex items-center gap-0.5 text-t-2xs tabular-nums text-ink-muted">
                                            <Zap size={9} aria-hidden="true" />
                                            {ref.mark.mean_velocity.toFixed(2)} m/s
                                        </span>
                                    )}
                                    {ref.mark.achieved_on && (
                                        <span className="text-t-2xs tabular-nums text-ink-subtle">
                                            {formatDate(ref.mark.achieved_on)}
                                        </span>
                                    )}
                                </div>
                            ) : (
                                <p className="mt-0.5 text-t-2xs text-ink-subtle">
                                    Sin marca registrada a {ref.reps} {ref.reps === 1 ? 'repetición' : 'repeticiones'}
                                </p>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </ContextSection>
    );
}

/** 'YYYY-MM-DD' → '12/06/26'. Se parte a mano: `new Date` desplazaría el día. */
function formatDate(iso: string): string {
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${Number(d)}/${Number(m)}/${y.slice(2)}`;
}
