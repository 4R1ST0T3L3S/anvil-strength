import { supabase } from '../lib/supabase';
import { ROLES_CONFIGURABLES, type Capacidad, type RolConfigurable } from '../lib/roles';

/**
 * PERMISOS CONFIGURABLES POR ROL.
 *
 * Ver database/PERMISOS_2026-08-30.sql. Solo `role_capabilities` es la
 * fuente editable; `developer` y `admin` no pasan por aquí — sus
 * capacidades siguen fijas en `lib/roles.ts`.
 */

export type CapacidadesPorRol = Partial<Record<RolConfigurable, Capacidad[]>>;

/** Traduce "la tabla no existe todavía" a una instrucción concreta. */
function explicaError(err: unknown): Error {
    const raw = (err as { message?: string; code?: string })?.message ?? '';
    const code = (err as { code?: string })?.code;

    if (
        code === 'PGRST205' || code === '42883' ||
        raw.includes('does not exist') || raw.includes('schema cache') ||
        /role_capabilities|replace_role_capabilities/i.test(raw)
    ) {
        return new Error(
            'Los permisos configurables todavía no están activados en la base de datos. ' +
            'Ejecuta database/PERMISOS_2026-08-30.sql en Supabase.'
        );
    }
    if (raw.includes('row-level security') || raw.includes('violates row-level') || code === '42501') {
        return new Error('Solo un desarrollador puede cambiar los permisos de un rol.');
    }
    return err instanceof Error ? err : new Error(raw || 'error desconocido');
}

export const permissionsService = {
    /**
     * Todo el mapa configurado, agrupado por rol.
     *
     * Sin la migración ejecutada, `role_capabilities` no existe: se
     * devuelve `null` (no `{}`) para que quien lo consuma sepa distinguir
     * "la tabla está vacía porque nadie ha tocado nada todavía" (`{}`, caso
     * legítimo justo tras ejecutar la migración) de "la tabla no existe"
     * (`null`, hay que ejecutar la migración). `useCapabilityConfig` trata
     * los dos casos igual —usa el mapa fijo de reserva—, pero la pantalla
     * de Ajustes necesita saber cuál de los dos está pasando para avisar.
     */
    async list(): Promise<CapacidadesPorRol | null> {
        const { data, error } = await supabase
            .from('role_capabilities')
            .select('role, capability');

        if (error) {
            if (error.code === 'PGRST205' || /does not exist|schema cache/.test(error.message)) {
                return null;
            }
            throw explicaError(error);
        }

        const out: CapacidadesPorRol = {};
        for (const row of (data ?? []) as { role: RolConfigurable; capability: Capacidad }[]) {
            (out[row.role] ??= []).push(row.capability);
        }
        return out;
    },

    /**
     * Reemplaza ENTERO el conjunto de capacidades de un rol.
     *
     * Devuelve lo que de verdad quedó guardado — mismo motivo que
     * `rolesService.setMyRoles`: si el servidor rechaza algo, la interfaz
     * tiene que pintar lo real y no lo que se mandó.
     */
    async replaceForRole(role: RolConfigurable, capabilities: Capacidad[]): Promise<Capacidad[]> {
        if (!(ROLES_CONFIGURABLES as readonly string[]).includes(role)) {
            throw new Error(`"${role}" no es un rol configurable.`);
        }

        const { data, error } = await supabase.rpc('replace_role_capabilities', {
            p_role: role,
            p_capabilities: capabilities,
        });

        if (error) throw explicaError(error);
        return (data ?? []) as Capacidad[];
    },
};
