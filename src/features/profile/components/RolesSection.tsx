import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Loader, Lock, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import type { UserProfile } from '../../../hooks/useUser';
import {
    ROLES_AUTOGESTIONABLES,
    ROL_INFO,
    rolesDe,
    type Rol,
    type RolAutogestionable,
} from '../../../lib/roles';
import { rolesService } from '../../../services/rolesService';

/**
 * QUÉ ERES EN ANVIL
 *
 * EL CASO QUE VIENE A RESOLVER
 *
 * Alguien que entrena a gente, pauta nutrición y ADEMÁS tiene su propio
 * entrenador. Con un solo rol eso no se puede escribir, así que hasta ahora
 * había que pedirle a un desarrollador que cambiara la casilla a mano — y
 * cada cambio quitaba lo anterior. Aquí se marcan los que hagan falta, a la
 * vez, y sin depender de nadie.
 *
 *
 * POR QUÉ SE PUEDE DEJAR QUE CADA UNO SE PONGA "ENTRENADOR"
 *
 * Porque el rol abre PANTALLAS, no DATOS. Declararse entrenador enseña el
 * panel de gestión; para ver a un atleta concreto hace falta una fila en
 * `coach_athletes`, y esa nace de una invitación que la otra persona acepta.
 * Quien se marque entrenador sin serlo se encuentra una lista vacía.
 *
 * Los que sí dan acceso real —desarrollador y administración— no están aquí,
 * y no por decisión de esta pantalla: `set_my_roles()` los descarta en el
 * servidor. Aunque alguien llamara a la función a mano con 'admin' dentro,
 * volvería sin él.
 */
/** ¿Es uno de los que cada cual se pone y se quita solo? */
const esAutogestionable = (rol: string): rol is RolAutogestionable =>
    (ROLES_AUTOGESTIONABLES as readonly string[]).includes(rol);

export function RolesSection({ user }: { user: UserProfile }) {
    const queryClient = useQueryClient();
    const actuales = rolesDe(user);

    const [seleccion, setSeleccion] = useState<Set<string>>(
        () => new Set<string>(actuales.filter(esAutogestionable))
    );
    const [guardando, setGuardando] = useState(false);

    /** Los que tiene y no puede tocar. Se enseñan, pero apagados. */
    const concedidos = actuales.filter(r => !esAutogestionable(r));

    const original = new Set<string>(actuales.filter(esAutogestionable));
    const hayCambios =
        seleccion.size !== original.size || [...seleccion].some(r => !original.has(r));

    const alternar = (rol: RolAutogestionable) => {
        setSeleccion(prev => {
            const siguiente = new Set(prev);
            if (siguiente.has(rol)) siguiente.delete(rol);
            else siguiente.add(rol);
            return siguiente;
        });
    };

    const guardar = async () => {
        if (guardando || !hayCambios) return;
        setGuardando(true);
        try {
            // Se pinta lo que DEVUELVE el servidor, no lo que se mandó: es
            // él quien decide qué entra, y dar por bueno lo enviado dejaría
            // marcado en pantalla un rol que se ha descartado.
            const finales = await rolesService.setMyRoles([...seleccion] as RolAutogestionable[]);
            setSeleccion(new Set<string>(finales.filter(esAutogestionable)));

            // El perfil en caché lleva el rol viejo, y de él cuelgan las
            // rutas y el menú entero. Sin invalidarlo, alguien que acaba de
            // marcarse entrenador no vería su panel hasta recargar.
            await queryClient.invalidateQueries({ queryKey: ['user'] });

            toast.success('Roles actualizados');
        } catch (err) {
            console.error(err);
            toast.error(err instanceof Error ? err.message : 'No se pudieron guardar los roles');
        } finally {
            setGuardando(false);
        }
    };

    return (
        <section className="rounded-card border border-[var(--border-default)] bg-surface-raised p-4 sm:p-6">
            <header className="mb-1">
                <h2 className="text-t-lg font-black uppercase tracking-display text-ink">
                    Qué eres en Anvil
                </h2>
            </header>
            <p className="mb-5 text-t-sm leading-relaxed text-ink-muted">
                Marca todo lo que seas. Puedes ser varias cosas a la vez: si entrenas a
                gente y además te entrenan a ti, marca <strong className="font-bold text-ink">Entrenador</strong> y{' '}
                <strong className="font-bold text-ink">Atleta</strong>.
            </p>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {ROLES_AUTOGESTIONABLES.map(rol => {
                    const activo = seleccion.has(rol);
                    const info = ROL_INFO[rol as Rol];
                    return (
                        <button
                            key={rol}
                            type="button"
                            role="switch"
                            aria-checked={activo}
                            onClick={() => alternar(rol)}
                            className={`flex min-w-0 items-start gap-3 rounded-card border p-3.5 text-left transition-colors duration-fast ease-snap ${
                                activo
                                    ? 'border-brand bg-[var(--brand-quiet)]'
                                    : 'border-[var(--border-default)] hover:border-[var(--border-strong)] hover:bg-surface-overlay'
                            }`}
                        >
                            {/* Casilla dibujada y no un <input>: tiene que
                                verse igual en iOS, en Android y en escritorio,
                                y el nativo no se deja. El papel accesible lo
                                pone `role="switch"` con `aria-checked`. */}
                            <span
                                aria-hidden="true"
                                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-chip border transition-colors duration-fast ${
                                    activo
                                        ? 'border-brand bg-brand text-brand-ink'
                                        : 'border-[var(--border-strong)]'
                                }`}
                            >
                                {activo && <Check size={13} strokeWidth={3.5} />}
                            </span>
                            <span className="min-w-0">
                                <span className="block text-t-sm font-bold text-ink">{info.nombre}</span>
                                <span className="mt-0.5 block text-t-xs leading-relaxed text-ink-subtle">
                                    {info.descripcion}
                                </span>
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Lo que le ha dado otro. Se enseña para que se entienda de
                dónde salen las pantallas de más que ve, y apagado para que
                quede claro que no es cosa suya quitárselo. */}
            {concedidos.length > 0 && (
                <div className="mt-4 space-y-2">
                    {concedidos.map(rol => (
                        <div
                            key={rol}
                            className="flex min-w-0 items-start gap-3 rounded-card border border-dashed border-[var(--border-default)] p-3.5"
                        >
                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-ink-faint">
                                <Lock size={13} aria-hidden="true" />
                            </span>
                            <span className="min-w-0">
                                <span className="flex items-center gap-2 text-t-sm font-bold text-ink">
                                    {ROL_INFO[rol].nombre}
                                    <ShieldCheck size={13} aria-hidden="true" className="shrink-0 text-brand" />
                                </span>
                                <span className="mt-0.5 block text-t-xs leading-relaxed text-ink-subtle">
                                    {ROL_INFO[rol].descripcion}
                                </span>
                            </span>
                        </div>
                    ))}
                </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-3">
                {hayCambios && (
                    <p className="text-t-xs text-ink-subtle">Sin guardar</p>
                )}
                <button
                    type="button"
                    onClick={guardar}
                    disabled={guardando || !hayCambios}
                    className="flex items-center gap-2 rounded-field bg-brand px-5 py-2.5 text-t-sm font-extrabold uppercase tracking-wide text-brand-ink transition-colors duration-fast ease-snap hover:bg-brand-hover disabled:opacity-40"
                >
                    {guardando && <Loader size={15} className="animate-spin" aria-hidden="true" />}
                    Guardar roles
                </button>
            </div>
        </section>
    );
}
