import { useState } from 'react';
import { AlertCircle, Loader, Mail, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '../../../components/ui/Modal';
import { athletesService, type CreateAthleteResult } from '../../../services/athletesService';

/**
 * DAR DE ALTA A UN ATLETA
 *
 * EL CASO QUE VIENE A RESOLVER
 *
 * Un entrenador tiene gente a la que programa y a la que solo manda el PDF.
 * Hasta ahora, para trabajar desde la plataforma hacía falta que esa persona
 * se registrara — es decir, que hiciera algo que quizá no va a hacer nunca.
 * Aquí el atleta queda dado de alta con ficha y vínculo, y se le puede
 * programar de inmediato. Si algún día entra, entra en ESTA ficha, con todo
 * lo que ya tenga dentro.
 *
 * EL CORREO ES OPCIONAL, Y ESE ES EL PUNTO
 *
 * Exigirlo convertiría "dar de alta a alguien" en "conseguir antes su
 * correo", que es exactamente la fricción que sobra. Si se pone, sirve para
 * dos cosas: comprobar que esa persona no está ya en la plataforma —lo que
 * evita la ficha duplicada— y poder mandarle el acceso cuando toque.
 */
export function AddAthleteModal({
    open,
    onClose,
    onCreated,
}: {
    open: boolean;
    onClose: () => void;
    /** El alta ha terminado. La lista se recarga con esto. */
    onCreated: (result: CreateAthleteResult) => void;
}) {
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [saving, setSaving] = useState(false);
    /** Alguien con ese correo ya existe y no es tuyo: hay que invitarle. */
    const [conflict, setConflict] = useState<CreateAthleteResult | null>(null);

    // El formulario se vacía REMONTANDO el componente (la lista le pasa una
    // `key` que cambia al abrir), no con un efecto que reponga cada campo:
    // así no hay un fotograma con los datos del alta anterior en pantalla.

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (saving) return;

        setSaving(true);
        setConflict(null);

        try {
            const result = await athletesService.create({
                fullName,
                email: email.trim() || null,
            });

            if (result.outcome === 'needs_invite') {
                // NO se le engancha por las bravas. Vincular la cuenta de
                // alguien a un entrenador sin que esa persona diga nada es
                // justo lo que una invitación existe para impedir.
                setConflict(result);
                return;
            }

            if (result.outcome === 'existing') {
                toast(`${result.fullName} ya estaba en tu equipo`);
            } else {
                toast.success(`${result.fullName} añadido. Ya puedes programarle.`);
            }

            onCreated(result);
            onClose();
        } catch (err) {
            console.error(err);
            toast.error(err instanceof Error ? err.message : 'No se pudo crear el atleta');
        } finally {
            setSaving(false);
        }
    };

    const handleInviteExisting = async () => {
        if (!conflict) return;
        setSaving(true);
        try {
            await athletesService.invite(conflict.profileId, email);
            toast.success(`Invitación enviada a ${email}`);
            onClose();
        } catch (err) {
            console.error(err);
            toast.error(err instanceof Error ? err.message : 'No se pudo enviar la invitación');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal open={open} onClose={onClose} title="Nuevo atleta" size="md">
            <form onSubmit={handleSubmit} className="space-y-5">
                <p className="text-t-sm leading-relaxed text-ink-muted">
                    Créalo ahora y empieza a programarle. No hace falta que se registre:
                    puedes trabajar su planificación y exportarle el PDF igualmente.
                </p>

                <div className="space-y-1.5">
                    <label htmlFor="atleta-nombre" className="block text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">
                        Nombre y apellidos
                    </label>
                    <input
                        id="atleta-nombre"
                        value={fullName}
                        onChange={e => { setFullName(e.target.value); setConflict(null); }}
                        autoFocus
                        required
                        minLength={2}
                        maxLength={80}
                        placeholder="Marta Ruiz"
                        className="h-11 w-full rounded-field border border-subtle bg-surface-sunken px-3 text-t-sm text-ink transition-colors duration-fast placeholder:text-ink-subtle focus:border-brand"
                    />
                </div>

                <div className="space-y-1.5">
                    <label htmlFor="atleta-correo" className="flex items-center gap-1.5 text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">
                        Correo
                        <span className="font-medium normal-case tracking-normal text-ink-faint">
                            · opcional
                        </span>
                    </label>
                    <div className="relative">
                        <Mail size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
                        <input
                            id="atleta-correo"
                            type="email"
                            value={email}
                            onChange={e => { setEmail(e.target.value); setConflict(null); }}
                            placeholder="marta@ejemplo.com"
                            className="h-11 w-full rounded-field border border-subtle bg-surface-sunken pl-9 pr-3 text-t-sm text-ink transition-colors duration-fast placeholder:text-ink-subtle focus:border-brand"
                        />
                    </div>
                    <p className="text-t-xs leading-relaxed text-ink-subtle">
                        Si lo pones, comprobamos que no tenga ya una cuenta y podrás mandarle
                        el acceso cuando quieras. Puedes añadirlo más adelante.
                    </p>
                </div>

                {/* Ya existe y no es tuyo. */}
                {conflict && (
                    <div className="space-y-3 rounded-card border border-[var(--warning-line,var(--border-strong))] bg-[var(--warning-quiet)] p-4">
                        <p className="flex items-start gap-2 text-t-sm leading-relaxed text-ink">
                            <AlertCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-warning" />
                            <span>
                                <strong className="font-bold">{conflict.fullName || 'Esa persona'}</strong> ya
                                tiene cuenta en Anvil con ese correo. No creamos una ficha nueva —tendría
                                el historial partido en dos— y tampoco la vinculamos sin su permiso:
                                mándale una invitación y se une ella.
                            </span>
                        </p>
                        <button
                            type="button"
                            onClick={handleInviteExisting}
                            disabled={saving}
                            className="flex w-full items-center justify-center gap-2 rounded-field bg-brand py-2.5 text-t-sm font-extrabold uppercase tracking-wide text-brand-ink transition-colors duration-fast ease-snap hover:bg-brand-hover disabled:opacity-40"
                        >
                            {saving ? <Loader size={15} className="animate-spin" /> : <Mail size={15} />}
                            Enviarle una invitación
                        </button>
                    </div>
                )}

                <div className="flex justify-end gap-2 pt-1">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-field px-4 py-2.5 text-t-sm font-bold text-ink-muted transition-colors duration-fast hover:bg-surface-raised hover:text-ink"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={saving || fullName.trim().length < 2 || Boolean(conflict)}
                        className="flex items-center gap-2 rounded-field bg-brand px-5 py-2.5 text-t-sm font-extrabold uppercase tracking-wide text-brand-ink transition-colors duration-fast ease-snap hover:bg-brand-hover disabled:opacity-40"
                    >
                        {saving ? <Loader size={15} className="animate-spin" /> : <UserPlus size={15} />}
                        Crear atleta
                    </button>
                </div>
            </form>
        </Modal>
    );
}
