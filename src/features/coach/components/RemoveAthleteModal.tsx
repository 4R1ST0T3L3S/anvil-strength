import { useState } from 'react';
import { Archive, ChevronRight, Loader, Trash2, UserMinus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '../../../components/ui/Modal';
import { DangerConfirmModal } from '../../../components/modals/DangerConfirmModal';
import { athletesService } from '../../../services/athletesService';
import type { AccountStatus } from '../../../services/athletesService';

/**
 * QUITAR A ALGUIEN DEL EQUIPO — TRES COSAS DISTINTAS, TRES NOMBRES DISTINTOS
 * =====================================================================
 *
 * POR QUÉ NO HAY UN BOTÓN DE "ELIMINAR"
 *
 * Antes había uno solo, "Sacar del equipo", que cerraba la relación. Cubría
 * el caso normal y dejaba fuera los dos extremos:
 *
 *   · El atleta que se va tres meses y vuelve. Cerrar la relación funciona,
 *     pero lo saca del histórico como si se hubiera acabado.
 *   · La ficha creada por error, de alguien que no existe. Esa NO se podía
 *     quitar de ninguna manera: la cuenta latente no puede iniciar sesión,
 *     su entrenador dejaba de poder leerla al cerrar la relación, y no había
 *     ninguna función para borrarla. Se quedaba para siempre.
 *
 * Son tres decisiones distintas y solo una destruye algo. Meterlas bajo la
 * misma palabra obliga al entrenador a adivinar qué va a pasar, y ante la
 * duda no pulsa — que es como se acumulan las fichas fantasma.
 *
 *
 * EL PESO DE CADA CONFIRMACIÓN ES DISTINTO A PROPÓSITO
 *
 *   Archivar          → se hace y ya. Con deshacer en el aviso.
 *   Sacar del equipo  → un "¿seguro?" normal. Se deshace reactivando.
 *   Borrar la ficha   → hay que escribir el nombre del atleta.
 *
 * Es la doctrina de `DangerConfirmModal`, escrita en su propia cabecera: el
 * diálogo de escribir una palabra SOLO va en lo irreversible. Ponerlo en algo
 * que se deshace enseña a teclear sin mirar, y entonces deja de proteger
 * justo donde hace falta. Hasta ahora "Sacar del equipo" —que se deshace—
 * lo usaba, y "Borrar la ficha" no existía.
 *
 * El servidor vuelve a comprobarlo todo: la tercera opción exige
 * `account_status = 'managed'` y `claimed_at IS NULL` dentro de
 * `delete_managed_athlete()`. Aquí solo se decide qué se ENSEÑA.
 */

type Nivel = 'archive' | 'end' | 'delete';

interface Opcion {
    key: Nivel;
    icon: LucideIcon;
    label: string;
    detalle: string;
    /** Rojo solo en lo que destruye. Si todo es rojo, nada lo es. */
    peligro?: boolean;
}

export interface RemoveAthleteModalProps {
    open: boolean;
    onClose: () => void;
    athlete: { id: string; full_name: string | null; account_status?: AccountStatus | null } | null;
    /** Se llama tras cualquier cambio para que la lista se refresque. */
    onDone: (nivel: Nivel) => void;
}

export function RemoveAthleteModal({ open, onClose, athlete, onDone }: RemoveAthleteModalProps) {
    const [working, setWorking] = useState<Nivel | null>(null);
    const [confirmando, setConfirmando] = useState<Nivel | null>(null);

    if (!athlete) return null;

    const nombre = athlete.full_name?.trim() || 'Este atleta';
    // Solo el nombre de pila: en un móvil, teclear "María del Carmen Pérez"
    // no protege más, protege menos — se acaba copiando y pegando.
    const primerNombre = nombre.split(' ')[0];

    /**
     * La ficha nunca ha sido de una persona.
     *
     * `managed` implica `claimed_at IS NULL`: reclamar la cuenta es
     * justamente lo que la pasa a `active`. Aun así el servidor comprueba las
     * dos, porque este booleano viaja por el navegador y el otro no.
     */
    const esFicticio = athlete.account_status === 'managed';

    const OPCIONES: Opcion[] = [
        {
            key: 'archive',
            icon: Archive,
            label: 'Archivar',
            detalle: 'Sigue siendo tuyo pero no aparece en la lista. Para una pausa larga, una lesión o un parón. Se recupera cuando vuelva.',
        },
        {
            key: 'end',
            icon: UserMinus,
            label: 'Sacar del equipo',
            detalle: 'Se acabó la relación. Conserva su cuenta y su entrenamiento entero; tú conservas el histórico de que estuvo contigo. Se deshace si vuelve.',
        },
        ...(esFicticio ? [{
            key: 'delete' as const,
            icon: Trash2,
            label: 'Borrar la ficha',
            detalle: 'Desaparece: la ficha, su programación y todo lo que lleve dentro. Solo se puede porque nadie ha entrado nunca en esta cuenta. No tiene vuelta atrás.',
            peligro: true,
        }] : []),
    ];

    const ejecutar = async (nivel: Nivel) => {
        setWorking(nivel);
        try {
            if (nivel === 'delete') {
                await athletesService.deleteManagedProfile(athlete.id);
                toast.success(`Ficha de ${nombre} borrada`);
            } else {
                await athletesService.setRelationStatus(athlete.id, nivel === 'archive' ? 'archived' : 'ended');
                toast.success(
                    nivel === 'archive'
                        ? `${nombre} archivado`
                        : `${nombre} ya no está en tu equipo`,
                    {
                        // El camino de vuelta se dice AQUÍ y no en un manual:
                        // es justo cuando el entrenador se pregunta si la ha
                        // liado. Y se nombra la pestaña exacta, no "puedes
                        // recuperarlo": lo segundo tranquiliza y lo primero
                        // resuelve.
                        description: 'Está en la pestaña «Archivados», con el botón de reactivar.',
                    }
                );
            }
            setConfirmando(null);
            onClose();
            onDone(nivel);
        } catch (err) {
            console.error(err);
            toast.error(err instanceof Error ? err.message : 'No se pudo completar la acción.');
        } finally {
            setWorking(null);
        }
    };

    return (
        <>
            <Modal
                open={open && confirmando !== 'delete'}
                onClose={onClose}
                title={`Quitar a ${primerNombre}`}
                description="Tres formas, y solo una borra algo."
                size="md"
                dismissible={working === null}
            >
                <div className="space-y-2">
                    {OPCIONES.map(({ key, icon: Icon, label, detalle, peligro }) => {
                        const ocupado = working === key;
                        const esperandoConfirmacion = confirmando === key;

                        return (
                            <div key={key}>
                                <button
                                    type="button"
                                    disabled={working !== null}
                                    onClick={() => {
                                        // Borrar pasa por el diálogo de escribir el
                                        // nombre; archivar se hace directamente —es
                                        // reversible y sin consecuencias— y sacar del
                                        // equipo pide un "¿seguro?" en línea.
                                        if (key === 'delete') setConfirmando('delete');
                                        else if (key === 'archive') ejecutar('archive');
                                        else setConfirmando(esperandoConfirmacion ? null : 'end');
                                    }}
                                    className={`group flex w-full items-center gap-3.5 rounded-card border p-4 text-left transition-colors duration-fast ease-snap disabled:opacity-50 ${
                                        peligro
                                            ? 'border-[var(--danger-quiet)] hover:border-danger/50 hover:bg-[var(--danger-quiet)]'
                                            : 'border-[var(--border-default)] hover:border-[var(--border-strong)] hover:bg-surface-overlay'
                                    } ${esperandoConfirmacion ? 'border-[var(--border-strong)] bg-surface-overlay' : ''}`}
                                >
                                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-field ${
                                        peligro ? 'bg-[var(--danger-quiet)] text-danger' : 'bg-surface-sunken text-ink-muted'
                                    }`}>
                                        {ocupado
                                            ? <Loader size={16} className="animate-spin" aria-hidden="true" />
                                            : <Icon size={16} aria-hidden="true" />}
                                    </span>

                                    <span className="min-w-0 flex-1">
                                        <span className={`block text-t-sm font-bold ${peligro ? 'text-danger' : 'text-ink'}`}>
                                            {label}
                                        </span>
                                        <span className="mt-0.5 block text-t-xs leading-relaxed text-ink-muted">
                                            {detalle}
                                        </span>
                                    </span>

                                    <ChevronRight
                                        size={15}
                                        aria-hidden="true"
                                        className="shrink-0 text-ink-faint transition-transform duration-fast ease-snap group-hover:translate-x-0.5"
                                    />
                                </button>

                                {/* Confirmación EN LÍNEA para "sacar del equipo":
                                    es reversible, así que un segundo diálogo
                                    encima del primero sería más ceremonia que
                                    protección. Aparece bajo la opción elegida,
                                    donde ya está mirando el ojo. */}
                                {esperandoConfirmacion && key === 'end' && (
                                    <div className="mt-2 flex items-center gap-2 rounded-card bg-surface-sunken p-3">
                                        <p className="min-w-0 flex-1 text-t-xs text-ink-muted">
                                            {nombre} dejará de aparecer en tu lista, en el chat y en tu panel.
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => setConfirmando(null)}
                                            className="shrink-0 rounded-field px-3 py-2 text-t-xs font-bold text-ink-muted transition-colors duration-fast hover:text-ink"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => ejecutar('end')}
                                            disabled={working !== null}
                                            className="flex shrink-0 items-center gap-1.5 rounded-field bg-brand px-3.5 py-2 text-t-xs font-extrabold uppercase tracking-wide text-brand-ink transition-colors duration-fast ease-snap hover:bg-brand-hover disabled:opacity-40"
                                        >
                                            {working === 'end' && <Loader size={13} className="animate-spin" aria-hidden="true" />}
                                            Sacar
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* Por qué NO se ofrece borrar. Un botón ausente sin
                        explicación se lee como un fallo de la aplicación; con
                        ella se lee como una garantía, que es lo que es. */}
                    {!esFicticio && (
                        <p className="pt-1 text-t-xs leading-relaxed text-ink-subtle">
                            La ficha de {primerNombre} no se puede borrar: la cuenta es suya desde que
                            entró en ella, y su entrenamiento también.
                        </p>
                    )}
                </div>
            </Modal>

            <DangerConfirmModal
                key={athlete.id}
                open={confirmando === 'delete'}
                onClose={() => setConfirmando(null)}
                onConfirm={() => ejecutar('delete')}
                working={working === 'delete'}
                title="Borrar la ficha"
                confirmWord={primerNombre}
                confirmLabel="Borrar para siempre"
                description={
                    <>
                        Se borra la ficha de <strong className="font-bold">{nombre}</strong> y
                        TODO lo que cuelga de ella: su programación, sus series, sus check-ins y
                        las competiciones que le hayas asignado.
                        <span className="mt-2 block text-t-xs text-ink-muted">
                            Se puede hacer porque nadie ha entrado nunca en esta cuenta: la creaste
                            tú y sigue siendo solo tuya. No hay forma de recuperarla.
                        </span>
                    </>
                }
            />
        </>
    );
}
