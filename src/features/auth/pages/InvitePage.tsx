import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { m } from 'framer-motion';
import { AlertCircle, Check, Loader, UserPlus } from 'lucide-react';
import { invitesService, type InvitePreview, type InviteProblem } from '../../../services/invitesService';
import { UserProfile, useUser } from '../../../hooks/useUser';
import { SafeImage } from '../../../components/ui/SafeImage';
import { DURATION, EASE_OUT } from '../../../lib/motion';

/**
 * ATERRIZAJE DE UNA INVITACIÓN — /invitacion/<CODIGO>
 *
 * Tres situaciones, y las tres tienen que terminar bien:
 *
 *  1. Ya ha iniciado sesión → se canjea solo y va a su panel. Cero clics.
 *  2. No tiene cuenta       → se guarda el código, se registra, y al volver
 *                             se canjea solo (ver `useRedeemPendingInvite`).
 *  3. El enlace no sirve    → se dice POR QUÉ (caducado, anulado, ya usado) y
 *                             qué hacer, en vez de un "error" genérico.
 *
 * Lo que se enseña primero es DE QUIÉN es la invitación. Un "Regístrate" sin
 * decir de parte de quién viene es indistinguible de un enlace de spam, y
 * nadie mete su correo en eso.
 */
export function InvitePage({
    onLoginClick,
    onSignupClick,
}: {
    onLoginClick: () => void;
    onSignupClick: () => void;
}) {
    const { code = '' } = useParams<{ code: string }>();
    const navigate = useNavigate();
    const { data: user, isLoading: userLoading, refetch } = useUser();

    const [preview, setPreview] = useState<InvitePreview | null>(null);
    const [done, setDone] = useState<{ coachName: string | null; alreadyLinked: boolean } | null>(null);
    const [failure, setFailure] = useState<InviteProblem | null>(null);

    /**
     * "Canjeando" no es un estado que haya que guardar: es exactamente
     * "tengo sesión, la invitación vale, y todavía no ha terminado ni bien ni
     * mal". Derivarlo en vez de almacenarlo elimina la posibilidad de que se
     * quede encendido por un camino que olvidara apagarlo.
     */
    const redeeming = Boolean(user) && preview?.isValid === true && !done && !failure;

    // El canje se lanza UNA vez. La guarda va en una `ref` y no en el estado
    // porque tiene que quedar marcada en el mismo instante, sin esperar a un
    // render: si no, un re-render entre medias dispararía un segundo canje.
    const started = useRef(false);

    // De quién es. Se pide siempre, tenga o no sesión: es lo que se pinta.
    useEffect(() => {
        let alive = true;
        invitesService
            .peek(code)
            .then(result => { if (alive) setPreview(result); })
            .catch(err => {
                console.error(err);
                if (alive) {
                    setPreview({
                        coachName: null, coachAvatar: null, coachRole: null,
                        isValid: false, problem: 'no_existe',
                    });
                }
            });
        return () => { alive = false; };
    }, [code]);

    // Con sesión abierta no hay nada que preguntar: se canjea.
    useEffect(() => {
        if (userLoading || !user || !preview?.isValid || started.current) return;
        started.current = true;

        invitesService
            .redeem(code)
            .then(result => {
                if (result.ok) {
                    setDone({ coachName: result.coachName, alreadyLinked: result.alreadyLinked });
                    // El perfil acaba de cambiar de entrenador: sin refrescar,
                    // el panel seguiría enseñando el anterior (o ninguno).
                    void refetch();
                } else {
                    setFailure(result.problem);
                }
            })
            .catch(err => { console.error(err); setFailure('no_existe'); });
    }, [userLoading, user, preview, code, refetch]);

    // Sin sesión: se recuerda el código para canjearlo tras registrarse.
    useEffect(() => {
        if (userLoading || user || !preview?.isValid) return;
        invitesService.rememberPending(code);
    }, [userLoading, user, preview, code]);

    return (
        <div className="flex min-h-screen items-center justify-center bg-surface-canvas px-4 py-12">
            <m.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: DURATION.base, ease: EASE_OUT }}
                className="w-full max-w-sm rounded-sheet border border-[var(--border-default)] bg-surface-raised p-7 text-center"
            >
                {preview === null ? (
                    <Loader className="mx-auto animate-spin text-brand" size={26} />
                ) : done ? (
                    <Success
                        coachName={done.coachName}
                        alreadyLinked={done.alreadyLinked}
                        onContinue={() => navigate('/dashboard', { replace: true })}
                    />
                ) : failure || !preview.isValid ? (
                    <Failure problem={failure ?? preview.problem} onHome={() => navigate('/', { replace: true })} />
                ) : (
                    <Welcome
                        preview={preview}
                        user={user}
                        redeeming={redeeming || userLoading}
                        onLoginClick={onLoginClick}
                        onSignupClick={onSignupClick}
                    />
                )}
            </m.div>
        </div>
    );
}

function Welcome({
    preview,
    user,
    redeeming,
    onLoginClick,
    onSignupClick,
}: {
    preview: InvitePreview;
    user: UserProfile | null | undefined;
    redeeming: boolean;
    onLoginClick: () => void;
    onSignupClick: () => void;
}) {
    const rol = preview.coachRole === 'nutritionist' ? 'nutricionista' : 'entrenador';

    return (
        <>
            {preview.coachAvatar ? (
                <SafeImage
                    src={preview.coachAvatar}
                    alt={preview.coachName ?? 'Entrenador'}
                    className="mx-auto h-16 w-16 rounded-pill object-cover"
                />
            ) : (
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-pill bg-surface-sunken text-t-2xl font-black text-ink-muted">
                    {preview.coachName?.[0]?.toUpperCase() ?? 'A'}
                </span>
            )}

            <p className="mt-4 text-t-xs font-bold uppercase tracking-widest text-ink-subtle">
                Invitación de tu {rol}
            </p>
            <h1 className="mt-1 text-t-2xl font-black uppercase leading-tight tracking-display text-ink">
                {preview.coachName ?? 'Anvil Strength'}
            </h1>
            <p className="mt-3 text-t-sm leading-relaxed text-ink-muted">
                Te invita a entrenar con él en Anvil Strength. Crea tu cuenta y tendrás su
                planificación en el móvil.
            </p>

            {redeeming ? (
                <div className="mt-6 flex items-center justify-center gap-2 text-t-sm text-ink-subtle">
                    <Loader size={16} className="animate-spin" aria-hidden="true" />
                    Uniéndote al equipo…
                </div>
            ) : user ? null : (
                <div className="mt-6 space-y-2">
                    <button
                        onClick={onSignupClick}
                        className="flex w-full items-center justify-center gap-2 rounded-field bg-brand py-3 text-t-sm font-extrabold uppercase tracking-wide text-brand-ink transition-colors duration-fast ease-snap hover:bg-brand-hover"
                    >
                        <UserPlus size={16} aria-hidden="true" />
                        Crear mi cuenta
                    </button>
                    <button
                        onClick={onLoginClick}
                        className="w-full rounded-field border border-subtle py-3 text-t-sm font-bold text-ink-muted transition-colors duration-fast ease-snap hover:border-[var(--border-strong)] hover:text-ink"
                    >
                        Ya tengo cuenta
                    </button>
                    {/* Se dice explícitamente que el enlace sobrevive al
                        registro. Si no, mucha gente lo deja abierto en una
                        pestaña "para no perderlo" y se lía. */}
                    <p className="pt-1 text-t-xs text-ink-subtle">
                        Al terminar el registro te uniremos a su equipo automáticamente.
                    </p>
                </div>
            )}
        </>
    );
}

function Success({
    coachName,
    alreadyLinked,
    onContinue,
}: {
    coachName: string | null;
    alreadyLinked: boolean;
    onContinue: () => void;
}) {
    return (
        <>
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-pill bg-[var(--success-quiet)]">
                <Check size={26} className="text-success" strokeWidth={3} aria-hidden="true" />
            </span>
            <h1 className="mt-4 text-t-xl font-black uppercase leading-tight tracking-display text-ink">
                {alreadyLinked ? 'Ya estabas en el equipo' : '¡Ya estás dentro!'}
            </h1>
            <p className="mt-2 text-t-sm leading-relaxed text-ink-muted">
                {alreadyLinked
                    ? `${coachName ?? 'Tu entrenador'} ya te tenía en su equipo.`
                    : `${coachName ?? 'Tu entrenador'} ya puede programarte. Su planificación aparecerá en "Entrenar" en cuanto la publique.`}
            </p>
            <button
                onClick={onContinue}
                className="mt-6 w-full rounded-field bg-brand py-3 text-t-sm font-extrabold uppercase tracking-wide text-brand-ink transition-colors duration-fast ease-snap hover:bg-brand-hover"
            >
                Ir a mi panel
            </button>
        </>
    );
}

/**
 * Cada motivo lleva su propio texto y su propia salida.
 *
 * Un "enlace no válido" a secas deja al atleta sin saber si tiene que pedir
 * otro, esperar, o es que se equivocó al copiarlo — y lo que hace entonces es
 * escribir al entrenador para preguntar, que es justo el trabajo que esta
 * pantalla venía a quitar.
 */
const FAILURE_COPY: Record<InviteProblem, { title: string; body: string }> = {
    no_existe: {
        title: 'Este enlace no existe',
        body: 'Puede que se haya copiado a medias. Pide a tu entrenador que te lo mande otra vez.',
    },
    caducada: {
        title: 'La invitación ha caducado',
        body: 'Los enlaces tienen fecha de fin por seguridad. Pide uno nuevo a tu entrenador.',
    },
    revocada: {
        title: 'La invitación fue anulada',
        body: 'Tu entrenador la ha cancelado. Habla con él si crees que es un error.',
    },
    agotada: {
        title: 'Este enlace ya se ha usado',
        body: 'Estaba pensado para un número concreto de personas. Pide a tu entrenador uno nuevo.',
    },
    es_tuya: {
        title: 'Esta invitación es tuya',
        body: 'No puedes unirte a tu propio equipo. Compártela con el atleta al que quieras invitar.',
    },
    sin_sesion: {
        title: 'Hace falta iniciar sesión',
        body: 'Entra en tu cuenta y vuelve a abrir el enlace.',
    },
};

function Failure({ problem, onHome }: { problem: InviteProblem | null; onHome: () => void }) {
    const copy = FAILURE_COPY[problem ?? 'no_existe'];

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
