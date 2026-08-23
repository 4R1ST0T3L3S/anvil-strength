import { useEffect, useState } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { Check, Copy, Link2, Loader, Share2, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '../../../components/ui/Modal';
import { invitesService, type CoachInvite } from '../../../services/invitesService';
import { DURATION, EASE_OUT, prefersReducedMotion, stagger } from '../../../lib/motion';

/**
 * INVITAR A UN ATLETA
 *
 * Antes, vincular a alguien con su entrenador solo se podía hacer entrando a
 * Supabase a mano. Eso significa que dar de alta a un atleta dependía de que
 * una persona concreta se sentara delante del panel de la base de datos, y
 * que quien se registraba un domingo por la noche no empezaba a entrenar
 * hasta que eso pasara.
 *
 * CRITERIO: la pantalla hace UNA cosa. Se abre y ya hay un enlace listo para
 * copiar — sin formulario, sin decidir nada. Las opciones (para cuántas
 * personas, cuánto dura) están, pero plegadas: el 90% de las veces es "un
 * enlace para Marta", y obligar a rellenar tres campos para eso convierte
 * treinta segundos en dos minutos.
 */
export function InviteAthleteModal({
    open,
    onClose,
    coachId,
}: {
    open: boolean;
    onClose: () => void;
    coachId: string;
}) {
    const [invites, setInvites] = useState<CoachInvite[] | null>(null);
    const [creating, setCreating] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [showOptions, setShowOptions] = useState(false);
    const [label, setLabel] = useState('');
    const [maxUses, setMaxUses] = useState(1);
    const [expiresInDays, setExpiresInDays] = useState(30);

    const reduced = prefersReducedMotion();

    useEffect(() => {
        if (!open) return;
        let alive = true;

        invitesService
            .listByCoach(coachId)
            .then(rows => { if (alive) setInvites(rows); })
            .catch(err => {
                console.error(err);
                if (alive) setInvites([]);
                toast.error('No se pudieron cargar las invitaciones');
            });

        return () => { alive = false; };
    }, [open, coachId]);

    const handleCreate = async () => {
        setCreating(true);
        try {
            const invite = await invitesService.create(coachId, {
                label,
                maxUses,
                expiresInDays,
            });
            setInvites(prev => [invite, ...(prev ?? [])]);
            setLabel('');

            // Se copia sola nada más crearla: el 100% de las veces lo
            // siguiente que quieres hacer es pegar el enlace en un chat.
            await copyToClipboard(invite);
        } catch (err) {
            console.error(err);
            toast.error('No se pudo crear la invitación');
        } finally {
            setCreating(false);
        }
    };

    const copyToClipboard = async (invite: CoachInvite) => {
        const url = invitesService.buildUrl(invite.code);
        try {
            await navigator.clipboard.writeText(url);
            setCopiedId(invite.id);
            setTimeout(() => setCopiedId(null), 2000);
        } catch {
            // Safari sin HTTPS, o permiso denegado. El código sigue a la
            // vista para poder dictarlo, así que no es un callejón sin salida.
            toast.error('No se pudo copiar. Selecciona el enlace a mano.');
        }
    };

    /** En móvil, compartir directo al chat en vez de copiar y buscar la app. */
    const handleShare = async (invite: CoachInvite) => {
        const url = invitesService.buildUrl(invite.code);
        if (!navigator.share) { void copyToClipboard(invite); return; }
        try {
            await navigator.share({
                title: 'Únete a mi equipo en Anvil Strength',
                text: 'Te invito a entrenar conmigo en Anvil Strength.',
                url,
            });
        } catch {
            // El usuario ha cancelado el diálogo del sistema. No es un error.
        }
    };

    const handleRevoke = async (invite: CoachInvite) => {
        const stamp = new Date().toISOString();
        // Optimista: la fila se marca ya. Si falla, se revierte.
        setInvites(prev => (prev ?? []).map(i => i.id === invite.id ? { ...i, revoked_at: stamp } : i));

        try {
            await invitesService.revoke(invite.id);
        } catch (err) {
            console.error(err);
            setInvites(prev => (prev ?? []).map(i => i.id === invite.id ? { ...i, revoked_at: null } : i));
            toast.error('No se pudo anular la invitación');
        }
    };

    const active = (invites ?? []).filter(isActive);
    const inactive = (invites ?? []).filter(i => !isActive(i));

    return (
        <Modal open={open} onClose={onClose} title="Invitar a un atleta" size="md">
            <div className="space-y-5">
                <p className="text-t-sm leading-relaxed text-ink-muted">
                    Comparte el enlace por WhatsApp o donde quieras. Quien lo abra se une a tu
                    equipo al crear su cuenta, sin que tengas que hacer nada más.
                </p>

                {/* --- Crear ------------------------------------------- */}
                <div className="rounded-card border border-[var(--border-default)] bg-surface-sunken p-4">
                    <button
                        onClick={handleCreate}
                        disabled={creating}
                        className="flex w-full items-center justify-center gap-2 rounded-field bg-brand py-3 text-t-sm font-extrabold uppercase tracking-wide text-brand-ink transition-colors duration-fast ease-snap hover:bg-brand-hover disabled:opacity-40"
                    >
                        {creating
                            ? <><Loader size={16} className="animate-spin" aria-hidden="true" /> Creando…</>
                            : <><Link2 size={16} aria-hidden="true" /> Crear enlace de invitación</>}
                    </button>

                    <button
                        onClick={() => setShowOptions(v => !v)}
                        aria-expanded={showOptions}
                        className="mt-2.5 w-full text-center text-t-xs font-bold text-ink-subtle transition-colors duration-fast hover:text-ink"
                    >
                        {showOptions ? 'Ocultar opciones' : 'Opciones'}
                    </button>

                    <AnimatePresence initial={false}>
                        {showOptions && (
                            <m.div
                                initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
                                animate={reduced ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
                                exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
                                transition={{ duration: reduced ? 0.01 : DURATION.fast, ease: EASE_OUT }}
                                className="overflow-hidden"
                            >
                                <div className="space-y-3 pt-3.5">
                                    <label className="block">
                                        <span className="mb-1 block text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">
                                            Para acordarte de quién es
                                        </span>
                                        <input
                                            value={label}
                                            onChange={(e) => setLabel(e.target.value)}
                                            placeholder="Marta · Grupo iniciación…"
                                            className="w-full rounded-field border border-subtle bg-surface-canvas px-3 py-2 text-t-sm text-ink transition-colors duration-fast placeholder:text-ink-subtle focus:border-brand"
                                        />
                                    </label>

                                    <div className="grid grid-cols-2 gap-3">
                                        <label className="block">
                                            <span className="mb-1 block text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">
                                                Personas
                                            </span>
                                            <input
                                                type="number"
                                                min={1}
                                                max={500}
                                                value={maxUses}
                                                onChange={(e) => setMaxUses(Math.max(1, Number(e.target.value) || 1))}
                                                className="w-full rounded-field border border-subtle bg-surface-canvas px-3 py-2 text-t-sm tabular-nums text-ink transition-colors duration-fast focus:border-brand"
                                            />
                                        </label>

                                        <label className="block">
                                            <span className="mb-1 block text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">
                                                Caduca en (días)
                                            </span>
                                            <input
                                                type="number"
                                                min={1}
                                                max={365}
                                                value={expiresInDays}
                                                onChange={(e) => setExpiresInDays(Math.max(1, Number(e.target.value) || 30))}
                                                className="w-full rounded-field border border-subtle bg-surface-canvas px-3 py-2 text-t-sm tabular-nums text-ink transition-colors duration-fast focus:border-brand"
                                            />
                                        </label>
                                    </div>

                                    <p className="text-t-xs leading-relaxed text-ink-subtle">
                                        Un enlace para varias personas es cómodo para un grupo, pero
                                        cualquiera que lo reciba reenviado puede usarlo. Para una
                                        persona concreta, déjalo en 1.
                                    </p>
                                </div>
                            </m.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* --- Activas ----------------------------------------- */}
                {invites === null ? (
                    <div className="flex justify-center py-8">
                        <Loader className="animate-spin text-brand" size={20} />
                    </div>
                ) : active.length > 0 ? (
                    <div>
                        <h3 className="mb-2 text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">
                            Enlaces activos
                        </h3>
                        <ul className="space-y-2">
                            {active.map((invite, index) => (
                                <m.li
                                    key={invite.id}
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={stagger(index)}
                                    className="rounded-card border border-[var(--border-default)] bg-surface-raised p-3"
                                >
                                    <div className="flex items-center gap-2">
                                        {/* El código, grande y legible: es lo que se
                                            dicta por teléfono cuando copiar no es
                                            una opción. */}
                                        <code className="flex-1 select-all font-mono text-t-base font-extrabold tracking-[0.15em] text-ink">
                                            {invite.code}
                                        </code>

                                        <button
                                            onClick={() => copyToClipboard(invite)}
                                            aria-label="Copiar el enlace"
                                            className="rounded-field p-2 text-ink-subtle transition-colors duration-fast ease-snap hover:bg-surface-overlay hover:text-ink"
                                        >
                                            {copiedId === invite.id
                                                ? <Check size={15} className="text-success" aria-hidden="true" />
                                                : <Copy size={15} aria-hidden="true" />}
                                        </button>

                                        <button
                                            onClick={() => handleShare(invite)}
                                            aria-label="Compartir el enlace"
                                            className="rounded-field p-2 text-ink-subtle transition-colors duration-fast ease-snap hover:bg-surface-overlay hover:text-ink"
                                        >
                                            <Share2 size={15} aria-hidden="true" />
                                        </button>

                                        <button
                                            onClick={() => handleRevoke(invite)}
                                            aria-label="Anular el enlace"
                                            className="rounded-field p-2 text-ink-subtle transition-colors duration-fast ease-snap hover:bg-[var(--danger-quiet)] hover:text-danger"
                                        >
                                            <Trash2 size={15} aria-hidden="true" />
                                        </button>
                                    </div>

                                    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-t-xs text-ink-subtle">
                                        {invite.label && (
                                            <span className="font-semibold text-ink-muted">{invite.label}</span>
                                        )}
                                        <span className="flex items-center gap-1">
                                            <Users size={11} aria-hidden="true" />
                                            {invite.uses}/{invite.max_uses}
                                        </span>
                                        <span>{expiryLabel(invite.expires_at)}</span>
                                    </p>
                                </m.li>
                            ))}
                        </ul>
                    </div>
                ) : (
                    <p className="rounded-card border border-dashed border-[var(--border-default)] px-4 py-8 text-center text-t-sm text-ink-subtle">
                        No tienes ningún enlace activo. Crea uno y compártelo.
                    </p>
                )}

                {/* Los caducados y anulados se enseñan, pero apagados: sirven
                    para entender por qué a alguien "no le funciona el enlace". */}
                {inactive.length > 0 && (
                    <details className="group">
                        <summary className="cursor-pointer list-none text-t-xs font-bold text-ink-subtle transition-colors duration-fast hover:text-ink">
                            {inactive.length} {inactive.length === 1 ? 'enlace ya no válido' : 'enlaces ya no válidos'}
                        </summary>
                        <ul className="mt-2 space-y-1.5">
                            {inactive.map(invite => (
                                <li key={invite.id} className="flex items-center gap-2 px-1 text-t-xs text-ink-faint">
                                    <code className="font-mono font-bold tracking-widest line-through">{invite.code}</code>
                                    <span>· {inactiveReason(invite)}</span>
                                </li>
                            ))}
                        </ul>
                    </details>
                )}
            </div>
        </Modal>
    );
}

function isActive(invite: CoachInvite): boolean {
    if (invite.revoked_at) return false;
    if (invite.uses >= invite.max_uses) return false;
    if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) return false;
    return true;
}

function inactiveReason(invite: CoachInvite): string {
    if (invite.revoked_at) return 'anulado';
    if (invite.uses >= invite.max_uses) return 'ya usado';
    return 'caducado';
}

function expiryLabel(expiresAt: string | null): string {
    if (!expiresAt) return 'sin caducidad';
    const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000);
    if (days <= 0) return 'caducado';
    if (days === 1) return 'caduca mañana';
    return `caduca en ${days} días`;
}
