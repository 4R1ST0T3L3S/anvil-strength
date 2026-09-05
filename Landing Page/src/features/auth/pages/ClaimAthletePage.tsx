import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { m } from 'framer-motion';
import { AlertCircle, Check, Loader, Lock, Mail } from 'lucide-react';
import { claimService, type ClaimPreview } from '../../../services/claimService';
import { supabase } from '../../../lib/supabase';
import { DURATION, EASE_OUT } from '../../../lib/motion';

/**
 * RECLAMAR LA FICHA DE UN ATLETA FICTICIO — /reclamar/<token>
 * =====================================================================
 * La alternativa al enlace mágico por correo (InvitePage / `athletesService
 * .invite`): aquí el atleta pone su PROPIO email y contraseña sobre la
 * cuenta latente que su entrenador ya preparó, con todo su historial
 * dentro. Tres pasos:
 *
 *   1. Se enseña de quién es la ficha y quién la programa — igual que en la
 *      invitación de equipo, para que no parezca spam.
 *   2. El atleta escribe su email y una contraseña.
 *   3. Se activa la cuenta (función de borde `athletes`, acción `claim`) y
 *      se inicia sesión con esas mismas credenciales en este navegador.
 *
 * Sin sesión previa en ningún momento: quien llega aquí no tiene cuenta
 * abierta, así que esta pantalla no depende de `useUser()`.
 */
export function ClaimAthletePage() {
    const { token = '' } = useParams<{ token: string }>();
    const navigate = useNavigate();

    const [preview, setPreview] = useState<ClaimPreview | null>(null);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [claimed, setClaimed] = useState(false);

    useEffect(() => {
        let alive = true;
        claimService
            .peek(token)
            .then(result => { if (alive) setPreview(result); })
            .catch(err => {
                console.error(err);
                if (alive) setPreview({ valid: false, athleteName: null, coachName: null, reason: 'no_existe' });
            });
        return () => { alive = false; };
    }, [token]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSubmitting(true);

        try {
            const result = await claimService.claim(token, email, password);

            // La cuenta ya está activa, pero en ESTE navegador no hay
            // sesión hasta iniciarla explícitamente con las credenciales
            // que se acaban de fijar.
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email: result.email,
                password,
            });
            if (signInError) throw signInError;

            setClaimed(true);
            setTimeout(() => navigate('/dashboard', { replace: true }), 1200);
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : 'No se pudo reclamar la cuenta.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="flex min-h-[100dvh] items-center justify-center bg-surface-canvas px-4 py-12">
            <m.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: DURATION.base, ease: EASE_OUT }}
                className="w-full max-w-sm rounded-sheet border border-[var(--border-default)] bg-surface-raised p-7 text-center"
            >
                {preview === null ? (
                    <Loader className="mx-auto animate-spin text-brand-text" size={26} />
                ) : claimed ? (
                    <>
                        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-pill bg-[var(--success-quiet)]">
                            <Check size={26} className="text-success" strokeWidth={3} aria-hidden="true" />
                        </span>
                        <h1 className="mt-4 text-t-xl font-black uppercase leading-tight tracking-display text-ink">
                            ¡Ya es tuya!
                        </h1>
                        <p className="mt-2 text-t-sm leading-relaxed text-ink-muted">
                            Entrando a tu panel…
                        </p>
                    </>
                ) : !preview.valid ? (
                    <ClaimFailure reason={preview.reason} onHome={() => navigate('/', { replace: true })} />
                ) : (
                    <>
                        <p className="text-t-xs font-bold uppercase tracking-widest text-ink-subtle">
                            {preview.coachName ? `${preview.coachName} te ha preparado tu ficha` : 'Tu entrenador te ha preparado tu ficha'}
                        </p>
                        <h1 className="mt-1 text-t-2xl font-black uppercase leading-tight tracking-display text-ink">
                            {preview.athleteName ?? 'Bienvenido'}
                        </h1>
                        <p className="mt-3 text-t-sm leading-relaxed text-ink-muted">
                            Tu entrenamiento, tus marcas y tu historial ya están dentro. Pon tu
                            correo y una contraseña para entrar por primera vez.
                        </p>

                        <form onSubmit={handleSubmit} className="mt-6 space-y-3 text-left">
                            <div className="relative">
                                <label htmlFor="claim-email" className="sr-only">Correo electrónico</label>
                                <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" size={18} aria-hidden="true" />
                                <input
                                    id="claim-email"
                                    type="email"
                                    required
                                    autoComplete="username email"
                                    placeholder="Tu correo"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full rounded-field border border-[var(--border-default)] bg-surface-sunken py-3 pl-10 pr-3 text-t-sm text-ink transition-colors duration-fast focus:border-brand"
                                />
                            </div>
                            <div className="relative">
                                <label htmlFor="claim-password" className="sr-only">Contraseña</label>
                                <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" size={18} aria-hidden="true" />
                                <input
                                    id="claim-password"
                                    type="password"
                                    required
                                    minLength={8}
                                    autoComplete="new-password"
                                    placeholder="Contraseña (mínimo 8 caracteres)"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full rounded-field border border-[var(--border-default)] bg-surface-sunken py-3 pl-10 pr-3 text-t-sm text-ink transition-colors duration-fast focus:border-brand"
                                />
                            </div>

                            {error && (
                                <p className="rounded-field bg-[var(--danger-quiet)] px-3 py-2 text-t-xs text-danger-text">
                                    {error}
                                </p>
                            )}

                            <button
                                type="submit"
                                disabled={submitting}
                                className="flex w-full items-center justify-center gap-2 rounded-field bg-brand py-3 text-t-sm font-extrabold uppercase tracking-wide text-brand-ink transition-colors duration-fast ease-snap hover:bg-brand-hover disabled:opacity-50"
                            >
                                {submitting ? <Loader size={16} className="animate-spin" aria-hidden="true" /> : null}
                                {submitting ? 'Activando…' : 'Entrar a mi cuenta'}
                            </button>
                        </form>
                    </>
                )}
            </m.div>
        </div>
    );
}

const CLAIM_FAILURE_COPY: Record<NonNullable<ClaimPreview['reason']>, { title: string; body: string }> = {
    no_existe: {
        title: 'Este enlace no existe',
        body: 'Puede que se haya copiado a medias. Pide a tu entrenador que te lo mande otra vez.',
    },
    caducado: {
        title: 'El enlace ha caducado',
        body: 'Los enlaces tienen fecha de fin por seguridad. Pide a tu entrenador uno nuevo.',
    },
    usado: {
        title: 'Este enlace ya se usó',
        body: 'Tu cuenta ya está activa. Inicia sesión con el correo y la contraseña que pusiste.',
    },
    ya_reclamado: {
        title: 'Esta ficha ya está reclamada',
        body: 'Inicia sesión con el correo y la contraseña que pusiste la primera vez.',
    },
};

function ClaimFailure({ reason, onHome }: { reason: ClaimPreview['reason']; onHome: () => void }) {
    const copy = CLAIM_FAILURE_COPY[reason ?? 'no_existe'];
    return (
        <>
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-pill bg-[var(--warning-quiet)]">
                <AlertCircle size={24} className="text-warning" aria-hidden="true" />
            </span>
            <h1 className="mt-4 text-t-xl font-black uppercase leading-tight tracking-display text-ink">
                {copy.title}
            </h1>
            <p className="mt-2 text-t-sm leading-relaxed text-ink-muted">{copy.body}</p>
            <button
                onClick={onHome}
                className="mt-6 w-full rounded-field border border-subtle py-3 text-t-sm font-bold text-ink-muted transition-colors duration-fast ease-snap hover:border-[var(--border-strong)] hover:text-ink"
            >
                Ir a la portada
            </button>
        </>
    );
}
