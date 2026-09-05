import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { evaluarPuerta, type BillingMode, type ResultadoPuerta } from '../lib/billing';
import { DEFAULT_COACH_PREFS, resolveCoachPrefs, type CoachPrefs } from '../lib/prefs/contract';

/**
 * ANVIL STRENGTH — LA PUERTA DE PAGO, DESDE EL LADO DEL ATLETA
 * =====================================================================
 *
 * Contesta a una pregunta: ¿este atleta está al corriente con su entrenador?
 *
 *
 * LA REGLA DE ORO DE ESTE FICHERO
 *
 * **Ante la duda, NO se bloquea.** Si la consulta falla, si la migración de
 * base de datos todavía no se ha ejecutado, si el atleta no tiene entrenador,
 * si las preferencias no cargan: en todos esos casos el atleta entrena.
 *
 * No es prudencia genérica, es la consecuencia directa de K1: un fallo aquí
 * deja sin entrenar a alguien que ha pagado, y eso se paga en confianza. El
 * coste del error contrario —alguien que debe dinero entrena una semana más—
 * lo arregla el entrenador con un mensaje.
 *
 *
 * EL SQL PUEDE NO ESTAR EJECUTADO TODAVÍA
 *
 * `database/PAGOS_2026-08-23.sql` lo ejecuta Marc a mano en Supabase, y el
 * código se despliega antes. Mientras no esté, `my_billing_status()` no
 * existe y la llamada devuelve un error de función desconocida. Eso NO es una
 * excepción a gestionar: es el estado normal durante unos días, y se traduce
 * en "al corriente" sin ruido en consola.
 */

export interface EstadoPuerta {
    resultado: ResultadoPuerta;
    /** Identificador del entrenador con el que no está al día. Para abrir el chat. */
    coachId: string | null;
    /** Preferencias del entrenador ya resueltas (qué se bloquea, cortesía). */
    prefs: CoachPrefs;
    cargando: boolean;
}

interface FilaEstado {
    coach_id: string;
    billing_mode: BillingMode;
    paid_until: string | null;
    has_payments: boolean;
    is_current: boolean;
}

/** El resultado que se devuelve cuando no se sabe: siempre pasa. */
const PASA: ResultadoPuerta = {
    alCorriente: true,
    bloquea: false,
    motivo: 'No hay datos de facturación.',
    cierraEl: null,
};

export function usePuertaDePago(athleteId: string | undefined): EstadoPuerta {
    const { data, isPending } = useQuery({
        queryKey: ['puerta-de-pago', athleteId],
        queryFn: async () => {
            const { data: filas, error } = await supabase.rpc('my_billing_status');

            if (error) {
                /*
                 * 42883 = "function does not exist". Es el estado esperado
                 * mientras la migración no se haya ejecutado, así que no se
                 * escribe nada en consola: llenarla de errores rojos por algo
                 * previsto entrena a la gente a ignorarla.
                 *
                 * Cualquier otro error sí se registra, pero tampoco bloquea.
                 */
                if (error.code !== '42883') {
                    console.error('Estado de pago:', error);
                }
                return null;
            }

            const lista = (filas ?? []) as FilaEstado[];
            if (lista.length === 0) return null;

            /*
             * UN ATLETA PUEDE TENER VARIOS PROFESIONALES —entrenador de fuerza
             * y nutricionista— y pagar a uno y no al otro. Se elige la relación
             * MÁS RESTRICTIVA: si con alguno no está al día, ese es el que
             * decide, porque es el que va a cortarle algo.
             */
            const problematica = lista.find(f => !f.is_current);
            return problematica ?? lista[0];
        },
        enabled: !!athleteId,
        // El estado de pago cambia como mucho una vez al mes. Cinco minutos
        // de frescura evitan repreguntarlo en cada cambio de pestaña.
        staleTime: 1000 * 60 * 5,
        // Si falla, falla: reintentar tres veces solo retrasa la pantalla.
        retry: false,
    });

    const { data: prefsRaw } = useQuery({
        queryKey: ['coach-prefs-de-mi-entrenador', data?.coach_id],
        queryFn: async () => {
            const { data: perfil, error } = await supabase
                .from('profiles')
                .select('coach_prefs')
                .eq('id', data!.coach_id)
                .single();
            if (error) throw error;
            return perfil?.coach_prefs ?? null;
        },
        enabled: !!data?.coach_id,
        staleTime: 1000 * 60 * 10,
        retry: false,
    });

    const prefs = resolveCoachPrefs(prefsRaw ?? null);

    if (!data) {
        return { resultado: PASA, coachId: null, prefs: DEFAULT_COACH_PREFS, cargando: isPending };
    }

    /*
     * Se recalcula en el cliente en vez de creerse el `is_current` que viene
     * del servidor. No es desconfianza: la función SQL no conoce las
     * preferencias del entrenador —ni `gate` ni `graceDays`—, así que su
     * respuesta usa los 7 días por defecto. Aquí se aplica lo que el
     * entrenador tenga configurado de verdad.
     */
    const resultado = evaluarPuerta({
        gate: prefs.billing.gate,
        modo: data.billing_mode ?? 'auto',
        pagadoHasta: data.paid_until,
        tieneAlgunPago: data.has_payments,
        graceDays: prefs.billing.graceDays,
    });

    return { resultado, coachId: data.coach_id, prefs, cargando: isPending };
}
