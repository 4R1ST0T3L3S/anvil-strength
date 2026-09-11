import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

/**
 * CANALES EN TIEMPO REAL COMPARTIDOS
 * =====================================================================
 *
 * Varias pantallas quieren enterarse de lo mismo: el contador de la
 * pestaña «Bandeja» y la propia bandeja escuchan `training_sessions`; la
 * lista de conversaciones y el contador de mensajes, `chat_messages`. Si
 * cada hook abriera su canal, con tres pantallas montadas habría tres
 * sockets recibiendo el mismo evento y tres invalidaciones por cambio.
 *
 * Aquí un canal se abre UNA vez por clave y se comparte entre todos los que
 * lo piden; se cierra cuando lo suelta el último. Cada suscriptor recibe
 * los eventos por su propia función, así que ninguno depende de los demás.
 */

type Manejador = (payload: unknown) => void;

interface Entrada {
    canal: RealtimeChannel;
    suscriptores: Set<Manejador>;
}

const entradas = new Map<string, Entrada>();

export interface FiltroPostgres {
    event: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
    schema?: string;
    table: string;
    filter?: string;
}

/**
 * Se suscribe a cambios de una tabla. Devuelve la función para soltarse.
 *
 * La `clave` identifica el canal (misma clave = mismo socket). Los filtros
 * se declaran una vez, la primera vez que se abre esa clave.
 */
export function suscribirCambios(clave: string, filtros: FiltroPostgres[], manejador: Manejador): () => void {
    let entrada = entradas.get(clave);

    if (!entrada) {
        const suscriptores = new Set<Manejador>();
        let canal = supabase.channel(`${clave}_${Math.random().toString(36).slice(2, 8)}`);
        for (const f of filtros) {
            canal = canal.on(
                'postgres_changes',
                { event: f.event, schema: f.schema ?? 'public', table: f.table, ...(f.filter ? { filter: f.filter } : {}) } as never,
                (payload: unknown) => { for (const s of suscriptores) s(payload); }
            );
        }
        canal.subscribe();
        entrada = { canal, suscriptores };
        entradas.set(clave, entrada);
    }

    entrada.suscriptores.add(manejador);

    return () => {
        const actual = entradas.get(clave);
        if (!actual) return;
        actual.suscriptores.delete(manejador);
        if (actual.suscriptores.size === 0) {
            entradas.delete(clave);
            void supabase.removeChannel(actual.canal);
        }
    };
}
