import { supabase } from '../lib/supabase';
import type {
    AmbitoDeObjetivo,
    MetricaDeVolumen,
    ObjetivoDeVolumen,
} from '../lib/volume/objetivos';

/**
 * OBJETIVOS DE VOLUMEN — ACCESO A DATOS
 *
 * La resolución (qué objetivo aplica a qué semana) y el descuento viven en
 * `src/lib/volume/objetivos.ts`, que es un módulo puro y comprobable. Aquí
 * solo se lee y se escribe.
 *
 * Se trae TODO lo del atleta de una vez y se resuelve en el cliente: el
 * constructor cambia de semana constantemente y una consulta por semana
 * sería una petición por cada clic en el acordeón.
 */

export interface NuevoObjetivo {
    coachId: string;
    athleteId: string;
    blockId?: string | null;
    weekNumber?: number | null;
    scope: AmbitoDeObjetivo;
    scopeKey: string;
    label: string;
    metric: MetricaDeVolumen;
    target: number;
}

/** Traduce el error de PostgREST a algo accionable. */
function explica(err: unknown): Error {
    const bruto = (err as { message?: string })?.message ?? '';
    if (
        bruto.includes('does not exist') ||
        bruto.includes('schema cache') ||
        /volume_targets/i.test(bruto)
    ) {
        return new Error(
            'Los objetivos de volumen todavía no están activados en la base de datos. ' +
            'Ejecuta database/VOLUMEN_Y_NOTAS_2026-09-07.sql en Supabase.'
        );
    }
    if (bruto.includes('row-level security') || bruto.includes('violates row-level')) {
        return new Error(
            'El servidor ha rechazado el cambio por permisos. ¿Sigues siendo el entrenador de este atleta?'
        );
    }
    if (bruto.includes('duplicate key')) {
        return new Error('Ya existe un objetivo para ese movimiento y esa métrica en este ámbito.');
    }
    return err instanceof Error ? err : new Error(bruto || 'error desconocido');
}

/** ¿Es "la tabla no existe" y no un fallo de verdad? */
function faltaLaTabla(error: { code?: string; message?: string }): boolean {
    return error.code === 'PGRST205' || /does not exist|schema cache/.test(error.message ?? '');
}

export const volumeTargetsService = {
    /**
     * Todos los objetivos de un atleta, de cualquier ámbito.
     *
     * Devuelve lista VACÍA —y no lanza— cuando la tabla todavía no existe:
     * el panel de volumen tiene que seguir enseñando las series programadas
     * aunque nadie haya ejecutado la migración. Ver la cabecera del SQL.
     */
    async listForAthlete(athleteId: string): Promise<ObjetivoDeVolumen[]> {
        const { data, error } = await supabase
            .from('volume_targets')
            .select('*')
            .eq('athlete_id', athleteId);

        if (error) {
            if (faltaLaTabla(error)) return [];
            throw explica(error);
        }
        return (data ?? []) as ObjetivoDeVolumen[];
    },

    /**
     * Fija un objetivo. Si ya había uno para ese (atleta, ámbito,
     * movimiento, métrica), lo sustituye.
     *
     * `onConflict` nombra las mismas columnas que el índice único del SQL.
     * Con `block_id` o `week_number` a NULL, PostgreSQL no considera que
     * dos filas choquen —dos NULL nunca son iguales—, y por eso el índice
     * las envuelve en `COALESCE`. El upsert de PostgREST no puede apuntar a
     * un índice con expresiones, así que aquí se hace en dos pasos: buscar
     * y actualizar, o insertar.
     */
    async upsert(entrada: NuevoObjetivo): Promise<ObjetivoDeVolumen> {
        const filtroAmbito = supabase
            .from('volume_targets')
            .select('id')
            .eq('athlete_id', entrada.athleteId)
            .eq('scope', entrada.scope)
            .eq('scope_key', entrada.scopeKey)
            .eq('metric', entrada.metric);

        // `.is()` y no `.eq()` para los nulos: `eq('block_id', null)` genera
        // `block_id=eq.null`, que en SQL es siempre falso.
        const conBloque = entrada.blockId
            ? filtroAmbito.eq('block_id', entrada.blockId)
            : filtroAmbito.is('block_id', null);
        const conSemana = entrada.weekNumber != null
            ? conBloque.eq('week_number', entrada.weekNumber)
            : conBloque.is('week_number', null);

        const { data: existente, error: errorBusqueda } = await conSemana.maybeSingle();
        if (errorBusqueda && !faltaLaTabla(errorBusqueda)) throw explica(errorBusqueda);

        if (existente?.id) {
            const { data, error } = await supabase
                .from('volume_targets')
                .update({ target: entrada.target, label: entrada.label })
                .eq('id', existente.id)
                .select()
                .single();
            if (error) throw explica(error);
            return data as ObjetivoDeVolumen;
        }

        const { data, error } = await supabase
            .from('volume_targets')
            .insert({
                coach_id: entrada.coachId,
                athlete_id: entrada.athleteId,
                block_id: entrada.blockId ?? null,
                week_number: entrada.weekNumber ?? null,
                scope: entrada.scope,
                scope_key: entrada.scopeKey,
                label: entrada.label,
                metric: entrada.metric,
                target: entrada.target,
            })
            .select()
            .single();

        if (error) throw explica(error);
        return data as ObjetivoDeVolumen;
    },

    async remove(id: string): Promise<void> {
        const { error } = await supabase.from('volume_targets').delete().eq('id', id);
        if (error) throw explica(error);
    },
};
