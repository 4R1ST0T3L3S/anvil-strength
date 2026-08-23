import { useState } from 'react';
import { AlertTriangle, Loader } from 'lucide-react';
import { Modal } from '../ui/Modal';

/**
 * Confirmación de una acción que no se puede deshacer.
 *
 * POR QUÉ ESCRIBIR UNA PALABRA Y NO UN SIMPLE "¿SEGURO?"
 *
 * Un diálogo de sí/no se contesta con el mismo gesto con el que se abrió: el
 * dedo ya va camino del botón cuando aparece. No es una decisión, es un
 * trámite — y en un móvil, con la lista desplazándose bajo el pulgar, se
 * acepta sin haberlo leído.
 *
 * Escribir una palabra rompe esa inercia. Obliga a leer QUÉ se está borrando
 * (el nombre aparece justo encima) y no se puede completar por accidente.
 *
 * DÓNDE **NO** USAR ESTO
 *
 * Solo en lo irreversible. Un diálogo así en algo que se puede deshacer
 * entrena al usuario a teclear la palabra sin mirar, y entonces deja de
 * proteger justo donde hace falta.
 */
export function DangerConfirmModal({
    open,
    onClose,
    onConfirm,
    title,
    /** Qué se pierde exactamente. Concreto: "sus 4 bloques", no "sus datos". */
    description,
    /** Lo que hay que teclear. En minúsculas; la comparación las ignora. */
    confirmWord = 'confirmar',
    confirmLabel = 'Eliminar',
    working = false,
}: {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    description: React.ReactNode;
    confirmWord?: string;
    confirmLabel?: string;
    working?: boolean;
}) {
    // Sin limpiar el campo a mano: quien abre este diálogo lo monta con
    // `key` del elemento a borrar, así que cada apertura es una instancia
    // nueva y el campo nace vacío. Es importante que sea así — reabrirlo para
    // OTRO atleta con la palabra ya escrita lo dejaría completamente desarmado.
    const [typed, setTyped] = useState('');

    // Se ignoran mayúsculas, espacios sobrantes Y ACENTOS: el objetivo es que
    // el usuario se detenga a leer, no ponerle una prueba de mecanografía.
    //
    // Los acentos importan desde que la palabra puede ser el NOMBRE de un
    // atleta —que es lo que obliga a mirar a quién se está borrando—: exigir
    // "josé" con tilde en un teclado de móvil convierte una salvaguarda en un
    // obstáculo, y un obstáculo se rodea, no se respeta.
    const normalizar = (s: string) =>
        s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const matches = normalizar(typed) === normalizar(confirmWord);

    return (
        <Modal open={open} onClose={onClose} title={title} size="sm" dismissible={!working}>
            <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-card bg-[var(--danger-quiet)] p-3.5">
                    <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
                    <div className="min-w-0 text-t-sm leading-relaxed text-ink">{description}</div>
                </div>

                <label className="block">
                    <span className="mb-1.5 block text-t-sm text-ink-muted">
                        Escribe <strong className="font-bold text-ink">{confirmWord}</strong> para continuar
                    </span>
                    <input
                        value={typed}
                        onChange={(e) => setTyped(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && matches && !working) onConfirm(); }}
                        placeholder={confirmWord}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        aria-label={`Escribe ${confirmWord} para confirmar`}
                        className={`w-full rounded-field border bg-surface-sunken px-3 py-2.5 text-t-base text-ink transition-colors duration-fast placeholder:text-ink-subtle ${
 matches ? 'border-danger' : 'border-subtle focus:border-[var(--border-strong)]'
 }`}
                    />
                </label>

                <div className="flex gap-2 pt-1">
                    <button
                        onClick={onClose}
                        disabled={working}
                        className="flex-1 rounded-field border border-subtle py-2.5 text-t-sm font-bold text-ink-muted transition-colors duration-fast ease-snap hover:border-[var(--border-strong)] hover:text-ink disabled:opacity-40"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={onConfirm}
                        // Deshabilitado y no oculto: el usuario ve que el botón
                        // existe y qué le falta para poder pulsarlo.
                        disabled={!matches || working}
                        className="flex flex-1 items-center justify-center gap-2 rounded-field bg-danger py-2.5 text-t-sm font-extrabold uppercase tracking-wide text-brand-ink transition-colors duration-fast ease-snap hover:bg-danger-hover disabled:cursor-not-allowed disabled:opacity-30"
                    >
                        {working && <Loader size={15} className="animate-spin" aria-hidden="true" />}
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
