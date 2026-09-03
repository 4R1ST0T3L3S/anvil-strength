import { supabase } from '../lib/supabase';
import type { AgreementReport, MeasuredRep, ReferenceRep } from '../lib/calibration/agreement';

/**
 * ANVIL STRENGTH — SESIONES DE CALIBRACIÓN CON ENCODER
 * =====================================================================
 *
 * Guarda y lee lo que hace falta para contestar la pregunta de las Fases 9 y
 * 10: **cuánto se equivoca PWR de verdad**, y si la nota de calidad que se
 * pone a sí mismo predice ese error.
 *
 * Se guardan LAS PAREJAS repetición a repetición, no solo el resumen. La forma
 * de resumir va a cambiar —hoy sesgo, error absoluto y límites de acuerdo;
 * mañana puede hacer falta un ICC o separar por nota de calidad— y con las
 * parejas eso se recalcula sobre lo que ya hay. Con solo el resumen habría que
 * repetir las sesiones, y una sesión de calibración cuesta un atleta, un
 * encoder y una tarde.
 *
 * Esquema en `database/pwr_calibration.sql`, **que hay que ejecutar a mano**.
 */

export interface CalibrationSessionInput {
    athleteId: string;
    createdBy?: string | null;
    exerciseName: string;
    exerciseId?: string | null;
    performedAt?: string;
    loadKg?: number | null;
    barMassKg?: number | null;
    /** Con qué se midió la referencia: «ADR Encoder», «Vitruve»… */
    referenceDevice: string;
    engineVersion?: number | null;
    /** La nota que PWR se puso a sí mismo. Es la columna que da sentido a todo. */
    qualityScore?: number | null;
    notes?: string | null;
    reference: ReferenceRep[];
    measured: MeasuredRep[];
    report: AgreementReport;
}

export interface CalibrationSessionRow {
    id: string;
    athlete_id: string;
    performed_at: string;
    exercise_name: string;
    load_kg: number | null;
    reference_device: string;
    engine_version: number | null;
    quality_score: number | null;
    paired_reps: number;
    mv_bias: number | null;
    mv_mae: number | null;
    mv_rmse: number | null;
    mv_loa_lower: number | null;
    mv_loa_upper: number | null;
    notes: string | null;
    created_at: string;
}

/** Una fila del informe agregado. Ver la vista `pwr_calibration_report`. */
export interface CalibrationReportRow {
    engine_version: number | null;
    reference_device: string;
    sesiones: number;
    repeticiones: number;
    mv_sesgo: number | null;
    mv_error_abs: number | null;
    mv_rmse: number | null;
    mv_sd: number | null;
    mv_loa_inferior: number | null;
    mv_loa_superior: number | null;
    pv_sesgo: number | null;
    pv_error_abs: number | null;
    rom_sesgo: number | null;
    rom_error_abs: number | null;
    /**
     * Correlación entre la nota de calidad y el error real.
     *
     * DEBERÍA SALIR NEGATIVA: más nota, menos error. Cerca de cero significa
     * que la nota no mide lo que dice medir, y descubrir eso es literalmente
     * para lo que existen estas sesiones.
     */
    corr_calidad_error: number | null;
}

/**
 * Traduce a instrucciones los dos fallos que en realidad son «esto no está
 * desplegado».
 *
 * Un `git push` despliega el código del navegador y nada más: entre que un
 * fichero `.sql` entra en el repositorio y alguien se acuerda de ejecutarlo
 * hay una ventana en la que la aplicación pide algo que el servidor no sabe
 * hacer. Sin esto, esa ventana se ve como «relation does not exist», que no
 * le dice a nadie qué hacer. Mismo criterio que en `athletesService`.
 */
function explainCalibrationError(error: unknown): Error {
    const code = (error as { code?: string }).code;
    const message = (error as { message?: string }).message ?? 'Error desconocido';

    if (code === '42P01' || /pwr_calibration/.test(message)) {
        return new Error(
            'Faltan las tablas de calibración. Hay que ejecutar ' +
            'database/pwr_calibration.sql en el editor SQL de Supabase.'
        );
    }
    return new Error(message);
}

export const calibrationService = {
    /**
     * Guarda una sesión y sus parejas.
     *
     * Sin transacción porque el cliente de Supabase no las expone, así que si
     * las parejas fallan después de crear la sesión quedaría una sesión vacía.
     * Se limpia explícitamente en ese caso: una sesión con `paired_reps` a 5 y
     * cero parejas guardadas envenenaría el informe agregado en silencio, que
     * es peor que no haber guardado nada.
     */
    async saveSession(input: CalibrationSessionInput): Promise<string> {
        const mv = input.report.metrics.find(m => m.metric === 'meanVelocity')?.agreement ?? null;
        const pv = input.report.metrics.find(m => m.metric === 'peakVelocity')?.agreement ?? null;
        const rom = input.report.metrics.find(m => m.metric === 'romM')?.agreement ?? null;

        const { data, error } = await supabase
            .from('pwr_calibration_sessions')
            .insert({
                athlete_id: input.athleteId,
                created_by: input.createdBy ?? null,
                performed_at: input.performedAt ?? new Date().toISOString().slice(0, 10),
                exercise_name: input.exerciseName,
                exercise_id: input.exerciseId ?? null,
                load_kg: input.loadKg ?? null,
                bar_mass_kg: input.barMassKg ?? null,
                reference_device: input.referenceDevice,
                engine_version: input.engineVersion ?? null,
                quality_score: input.qualityScore ?? null,
                paired_reps: input.report.pairedReps,
                mv_bias: mv?.bias ?? null,
                mv_mae: mv?.mae ?? null,
                mv_rmse: mv?.rmse ?? null,
                mv_loa_lower: mv?.loaLower ?? null,
                mv_loa_upper: mv?.loaUpper ?? null,
                pv_bias: pv?.bias ?? null,
                pv_mae: pv?.mae ?? null,
                pv_rmse: pv?.rmse ?? null,
                rom_bias: rom?.bias ?? null,
                rom_mae: rom?.mae ?? null,
                rom_mape: rom?.mape ?? null,
                notes: input.notes ?? null,
            })
            .select('id')
            .single();

        if (error) throw explainCalibrationError(error);
        const sessionId = (data as { id: string }).id;

        // Se emparejan por ORDEN, igual que en `pairReps`: el índice que trae
        // el encoder empieza en 1 en unos ficheros y en 0 en otros, y PWR
        // numera lo que ha detectado. Lo único común es la secuencia.
        const count = Math.min(input.reference.length, input.measured.length);
        const rows = Array.from({ length: count }, (_, i) => ({
            session_id: sessionId,
            rep_index: i + 1,
            ref_mean_velocity: input.reference[i].meanVelocity,
            ref_peak_velocity: input.reference[i].peakVelocity,
            ref_rom: input.reference[i].romM,
            pwr_mean_velocity: input.measured[i].meanVelocity,
            pwr_peak_velocity: input.measured[i].peakVelocity,
            pwr_rom: input.measured[i].romM,
        }));

        if (rows.length > 0) {
            const { error: repsError } = await supabase.from('pwr_calibration_reps').insert(rows);
            if (repsError) {
                await supabase.from('pwr_calibration_sessions').delete().eq('id', sessionId);
                throw explainCalibrationError(repsError);
            }
        }

        return sessionId;
    },

    async listSessions(athleteId?: string | null): Promise<CalibrationSessionRow[]> {
        let query = supabase
            .from('pwr_calibration_sessions')
            .select('*')
            .order('performed_at', { ascending: false })
            .order('created_at', { ascending: false });

        if (athleteId) query = query.eq('athlete_id', athleteId);

        const { data, error } = await query;
        if (error) {
            // Sin las tablas, la pantalla se enseña vacía con su explicación en
            // vez de reventar: quien todavía no ha ejecutado el SQL tiene que
            // poder entrar y leer qué le falta.
            if ((error as { code?: string }).code === '42P01') return [];
            throw explainCalibrationError(error);
        }
        return (data ?? []) as CalibrationSessionRow[];
    },

    /** El informe de precisión agregado, por versión del motor y aparato. */
    async getPrecisionReport(): Promise<CalibrationReportRow[]> {
        const { data, error } = await supabase
            .from('pwr_calibration_report')
            .select('*')
            .order('engine_version', { ascending: false });

        if (error) {
            if ((error as { code?: string }).code === '42P01') return [];
            throw explainCalibrationError(error);
        }
        return (data ?? []) as CalibrationReportRow[];
    },

    async deleteSession(id: string): Promise<void> {
        // Las parejas caen solas: la clave ajena lleva ON DELETE CASCADE.
        const { error } = await supabase.from('pwr_calibration_sessions').delete().eq('id', id);
        if (error) throw explainCalibrationError(error);
    },
};
