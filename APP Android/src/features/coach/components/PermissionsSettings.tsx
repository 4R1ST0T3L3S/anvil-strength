import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ShieldAlert, Check, AlertTriangle } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';
import { permissionsService } from '../../../services/permissionsService';
import {
    ROLES_CONFIGURABLES, ROL_INFO, CAPACIDAD_INFO,
    type Capacidad, type RolConfigurable,
} from '../../../lib/roles';
import { CLAVES } from '../../../lib/queryKeys';

/**
 * PERMISOS POR ROL — SOLO DESARROLLADOR
 * =====================================================================
 *
 * Quién puede tocar esto ya se decidió y se comprueba ANTES de montar este
 * componente: `PreferencesPage` solo lo renderiza si `isDeveloper(user)`.
 * Aquí dentro no se vuelve a comprobar el rol de quien mira — la RLS de
 * `role_capabilities` es la barrera de verdad (ver
 * `database/PERMISOS_2026-08-30.sql`); esto es solo la interfaz.
 *
 * `developer` y `admin` no aparecen como columnas: no son configurables
 * (ver `ROLES_CONFIGURABLES`), y enseñarlos aquí invitaría a tocarlos.
 *
 * GUARDADO POR ROL, NO POR CASILLA
 *
 * Cada columna es un formulario independiente con su propio "sin guardar" y
 * su propio botón: `replace_role_capabilities` sustituye el conjunto
 * ENTERO de un rol de una vez, así que agrupar el guardado por columna es
 * lo que refleja de verdad cómo se persiste, y evita 40 peticiones sueltas
 * si alguien marca varias casillas seguidas.
 */
const TODAS_LAS_CAPACIDADES = Object.keys(CAPACIDAD_INFO) as Capacidad[];

export function PermissionsSettings() {
    const queryClient = useQueryClient();
    const query = useQuery({
        queryKey: CLAVES.permisosPorRol.raiz,
        queryFn: () => permissionsService.list(),
        staleTime: 60 * 1000,
    });

    if (query.isLoading) {
        return (
            <div className="space-y-2">
                {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-10 w-full rounded-field" />)}
            </div>
        );
    }

    if (query.isError) {
        return (
            <p className="flex items-center gap-2 text-t-sm text-danger-text">
                <AlertTriangle size={15} aria-hidden="true" />
                No se pudieron cargar los permisos. Reintenta más tarde.
            </p>
        );
    }

    // `null` (y no `{}`) es la señal de que la tabla no existe todavía —
    // ver la cabecera de `permissionsService.list`.
    if (query.data === null) {
        return (
            <div className="flex items-start gap-2.5 rounded-card border border-[var(--border-default)] bg-surface-sunken px-3.5 py-3 text-t-xs text-ink-subtle">
                <ShieldAlert size={15} className="mt-0.5 shrink-0 text-ink-faint" aria-hidden="true" />
                <p>
                    Los permisos configurables todavía no están activados en la base de datos.
                    Ejecuta <code className="rounded bg-surface-overlay px-1 py-0.5 text-ink-muted">database/PERMISOS_2026-08-30.sql</code> en
                    Supabase. Hasta entonces, cada rol usa su reparto fijo de siempre.
                </p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {ROLES_CONFIGURABLES.map(role => (
                <RoleColumn
                    key={role}
                    role={role}
                    guardadas={query.data?.[role] ?? []}
                    onSaved={() => queryClient.invalidateQueries({ queryKey: CLAVES.permisosPorRol.raiz })}
                />
            ))}
        </div>
    );
}

function RoleColumn({
    role, guardadas, onSaved,
}: {
    role: RolConfigurable;
    guardadas: Capacidad[];
    onSaved: () => void;
}) {
    const [seleccion, setSeleccion] = useState<Set<Capacidad>>(() => new Set(guardadas));
    const [guardando, setGuardando] = useState(false);

    // Si llega una foto nueva del servidor (por ejemplo, tras guardar otra
    // columna e invalidar la consulta) y esta columna no tiene cambios sin
    // guardar propios, se resincroniza. Ajuste durante el render, mismo
    // patrón que el resto del proyecto para no perder lo que se está
    // editando bajo los pies de quien lo edita.
    const [guardadasAntes, setGuardadasAntes] = useState(guardadas);
    const cambioExterno = guardadasAntes.length !== guardadas.length
        || guardadasAntes.some(c => !guardadas.includes(c));
    if (cambioExterno) {
        setGuardadasAntes(guardadas);
        const sinCambios = seleccion.size === guardadasAntes.length
            && [...seleccion].every(c => guardadasAntes.includes(c));
        if (sinCambios) setSeleccion(new Set(guardadas));
    }

    const dirty = seleccion.size !== guardadas.length || guardadas.some(c => !seleccion.has(c));

    const toggle = (cap: Capacidad) => {
        setSeleccion(prev => {
            const next = new Set(prev);
            if (next.has(cap)) next.delete(cap); else next.add(cap);
            return next;
        });
    };

    const handleSave = async () => {
        setGuardando(true);
        try {
            const finales = await permissionsService.replaceForRole(role, [...seleccion]);
            setSeleccion(new Set(finales));
            toast.success(`Permisos de "${ROL_INFO[role].nombre}" actualizados`);
            onSaved();
        } catch (err) {
            console.error(err);
            toast.error(err instanceof Error ? err.message : 'No se pudieron guardar los permisos');
        } finally {
            setGuardando(false);
        }
    };

    return (
        <section className="rounded-card border border-[var(--border-default)] bg-surface-raised p-4">
            <div className="mb-1 flex items-center justify-between gap-2">
                <h4 className="text-t-sm font-bold text-ink">{ROL_INFO[role].nombre}</h4>
                {dirty && (
                    <Button variant="primary" size="sm" loading={guardando} onClick={handleSave}>
                        Guardar
                    </Button>
                )}
            </div>
            <p className="mb-3 text-t-2xs text-ink-subtle">{ROL_INFO[role].descripcion}</p>

            <ul className="space-y-1">
                {TODAS_LAS_CAPACIDADES.map(cap => {
                    const activa = seleccion.has(cap);
                    return (
                        <li key={cap}>
                            <button
                                type="button"
                                onClick={() => toggle(cap)}
                                disabled={guardando}
                                aria-pressed={activa}
                                className="flex w-full items-start gap-2.5 rounded-field px-2 py-1.5 text-left transition-colors duration-fast ease-snap hover:bg-surface-overlay disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <span
                                    aria-hidden="true"
                                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors duration-fast ${activa
                                        ? 'border-brand bg-brand text-brand-ink'
                                        : 'border-[var(--border-default)] bg-surface-sunken'
                                        }`}
                                >
                                    {activa && <Check size={11} strokeWidth={3} />}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-t-xs font-semibold text-ink">{CAPACIDAD_INFO[cap].nombre}</span>
                                    <span className="block text-t-2xs text-ink-subtle">{CAPACIDAD_INFO[cap].descripcion}</span>
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
