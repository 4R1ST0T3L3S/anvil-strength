import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ChevronLeft, Lock, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../../lib/utils';
import { Avatar } from '../../../components/ui/Avatar';
import { IconButton } from '../../../components/ui/IconButton';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { separadorDeDia, mismoDia } from '../../../lib/tiempo';
import { useHilo, type EnvioDeAdjunto, type MensajeEnPantalla } from '../hooks/useChat';
import { Burbuja } from './Burbuja';
import { Compositor } from './Compositor';
import { PreparadorDeAdjunto } from './PreparadorDeAdjunto';

/**
 * EL HILO DE UNA CONVERSACIÓN
 * =====================================================================
 *
 * Cabecera con la persona, los mensajes agrupados por día y el compositor
 * pegado abajo. Tres detalles de scroll que son los que hacen que se
 * sienta como una app de mensajería y no como una lista:
 *
 *   · Al abrir y al enviar, abajo del todo. Sin animación: el ojo espera
 *     ver el último mensaje, no ver llegar el scroll.
 *   · Al recibir con el scroll arriba, NO se salta: aparece una pastilla
 *     «Nuevos mensajes» que baja al pulsarla.
 *   · Al cargar mensajes antiguos por arriba, la vista se queda clavada
 *     donde estaba (se compensa el alto que ha crecido).
 */

export interface PersonaDelChat {
    id: string;
    full_name: string;
    avatar_url?: string | null;
    /** Qué es respecto a mí. */
    papel?: 'coach' | 'athlete' | null;
    /** Relación activa: se puede escribir. */
    canMessage?: boolean;
}

export function Hilo({
    me,
    otro,
    onAtras,
    onVerFicha,
    className,
}: {
    me: string;
    otro: PersonaDelChat;
    onAtras?: () => void;
    onVerFicha?: () => void;
    className?: string;
}) {
    const hilo = useHilo(me, otro.id);
    const listaRef = useRef<HTMLDivElement>(null);
    const [pendienteAdjunto, setPendienteAdjunto] = useState<File | null>(null);
    const [nuevosAbajo, setNuevosAbajo] = useState(false);
    const abajoRef = useRef(true);
    const altoPrevio = useRef<number | null>(null);
    const ultimoIdRef = useRef<string | null>(null);
    const puedeEscribir = otro.canMessage !== false;

    // ¿Está el usuario mirando el final del hilo?
    const alDesplazar = useCallback(() => {
        const el = listaRef.current;
        if (!el) return;
        const distancia = el.scrollHeight - el.scrollTop - el.clientHeight;
        abajoRef.current = distancia < 80;
        if (abajoRef.current) setNuevosAbajo(false);
    }, []);

    const irAbajo = useCallback((suave = false) => {
        const el = listaRef.current;
        if (!el) return;
        el.scrollTo({ top: el.scrollHeight, behavior: suave ? 'smooth' : 'auto' });
        abajoRef.current = true;
        setNuevosAbajo(false);
    }, []);

    const verMasAntiguos = () => {
        altoPrevio.current = listaRef.current?.scrollHeight ?? null;
        hilo.cargarMas();
    };

    // Colocación del scroll cuando cambian los mensajes.
    useLayoutEffect(() => {
        const el = listaRef.current;
        if (!el) return;
        if (altoPrevio.current !== null) {
            // Se ampliaron por arriba: quedarse donde se estaba.
            el.scrollTop = el.scrollHeight - altoPrevio.current;
            altoPrevio.current = null;
            return;
        }
        const ultimo = hilo.mensajes[hilo.mensajes.length - 1];
        const ultimoId = ultimo?.id ?? null;
        const habiaOtro = ultimoIdRef.current !== null && ultimoIdRef.current !== ultimoId;
        ultimoIdRef.current = ultimoId;
        if (!ultimo) return;
        const esMio = ultimo.sender_id === me;
        if (abajoRef.current || esMio || !habiaOtro) irAbajo(false);
        else setNuevosAbajo(true);
    }, [hilo.mensajes, me, irAbajo]);

    // Al abrir, abajo del todo (también cuando termina de cargar).
    useEffect(() => { if (!hilo.cargando) irAbajo(false); }, [hilo.cargando, otro.id, irAbajo]);

    const grupos = useMemo(() => agrupar(hilo.mensajes, me), [hilo.mensajes, me]);

    const enviarAdjunto = async (envio: EnvioDeAdjunto) => {
        setPendienteAdjunto(null);
        await hilo.enviarAdjunto(envio);
        irAbajo(false);
    };

    return (
        <div className={cn('flex h-full min-h-0 flex-col bg-surface-canvas', className)}>
            {/* CABECERA */}
            <header className="material-bar z-10 flex h-14 shrink-0 items-center gap-2 border-b border-[var(--separator)] px-2 sm:px-3">
                {onAtras && (
                    <IconButton aria-label="Volver" icon={<ChevronLeft strokeWidth={2.2} />} onClick={onAtras} className="-ml-1 lg:hidden" />
                )}
                <button
                    type="button"
                    onClick={onVerFicha}
                    disabled={!onVerFicha}
                    data-no-press
                    className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[10px] px-1.5 py-1 text-left transition-colors duration-fast enabled:hover:bg-[var(--fill-hover)]"
                >
                    <Avatar nombre={otro.full_name} src={otro.avatar_url} size={34} />
                    <span className="min-w-0">
                        <span className="block truncate text-t-base font-semibold leading-tight text-ink">{otro.full_name}</span>
                        <span className="block text-t-xs text-ink-subtle">
                            {otro.papel === 'coach' ? 'Tu entrenador' : otro.papel === 'athlete' ? 'Atleta' : ''}
                        </span>
                    </span>
                </button>
            </header>

            {/* MENSAJES */}
            <div
                ref={listaRef}
                onScroll={alDesplazar}
                className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 pt-2 sm:px-4"
            >
                {hilo.cargando ? (
                    <div className="flex h-full items-center justify-center">
                        <span className="h-6 w-6 animate-spin rounded-pill border-2 border-[var(--border-strong)] border-t-ink" aria-label="Cargando" />
                    </div>
                ) : hilo.error ? (
                    <EmptyState kind="error" title="No se pudo cargar la conversación" body="Comprueba la conexión e inténtalo de nuevo." action={<Button variant="secondary" onClick={() => hilo.recargar()}>Reintentar</Button>} />
                ) : hilo.mensajes.length === 0 ? (
                    <EmptyState
                        icon={<MessageSquare />}
                        title={`Escríbele a ${otro.full_name.split(' ')[0]}`}
                        body="Aquí empezará vuestra conversación. Puedes mandar texto, fotos, vídeos, notas de voz y documentos."
                    />
                ) : (
                    <>
                        {hilo.hayMas ? (
                            <div className="flex justify-center py-3">
                                <Button variant="secondary" size="sm" onClick={verMasAntiguos}>Ver mensajes anteriores</Button>
                            </div>
                        ) : (
                            <p className="py-4 text-center text-t-xs text-ink-subtle">Inicio de la conversación</p>
                        )}
                        {grupos.map(g => (
                            <div key={g.clave}>
                                {g.separador && (
                                    <div className="sticky top-1 z-[1] my-3 flex justify-center">
                                        <span className="rounded-pill bg-[var(--fill-muted)] px-2.5 py-1 text-t-2xs font-medium text-ink-muted backdrop-blur">
                                            {g.separador}
                                        </span>
                                    </div>
                                )}
                                {g.mensajes.map((m, i) => (
                                    <Burbuja
                                        key={m.id}
                                        mensaje={m}
                                        propia={m.sender_id === me}
                                        seguida={i > 0}
                                        onReintentar={() => hilo.reintentar(m)}
                                        onDescartar={() => m.client_id && hilo.descartar(m.client_id)}
                                    />
                                ))}
                            </div>
                        ))}
                    </>
                )}

                {nuevosAbajo && (
                    <button
                        type="button"
                        onClick={() => irAbajo(true)}
                        className="sticky bottom-2 left-1/2 mt-2 flex -translate-x-1/2 items-center gap-1.5 rounded-pill bg-surface-overlay px-3 py-1.5 text-t-xs font-semibold text-ink shadow-float"
                    >
                        <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" /> Nuevos mensajes
                    </button>
                )}
            </div>

            {/* COMPOSITOR */}
            <div className="shrink-0 border-t border-[var(--separator)] bg-surface-canvas pb-[env(safe-area-inset-bottom,0px)]">
                {puedeEscribir ? (
                    <Compositor
                        onEnviarTexto={(t) => { void hilo.enviarTexto(t); irAbajo(false); }}
                        onAdjunto={(f) => setPendienteAdjunto(f)}
                        onEnviarVoz={(e) => { void hilo.enviarAdjunto(e).catch(err => toast.error(err instanceof Error ? err.message : 'No se pudo enviar')); irAbajo(false); }}
                    />
                ) : (
                    <p className="flex items-center gap-2 px-4 py-3 text-t-sm text-ink-subtle">
                        <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
                        Ya no tenéis relación activa: puedes leer el historial, pero no escribir.
                    </p>
                )}
            </div>

            <PreparadorDeAdjunto file={pendienteAdjunto} onCancelar={() => setPendienteAdjunto(null)} onEnviar={enviarAdjunto} />
        </div>
    );
}

/**
 * Agrupa por día y por «ráfaga» (mismo remitente, menos de 3 minutos entre
 * mensajes): dentro de una ráfaga las burbujas van más juntas.
 */
function agrupar(mensajes: MensajeEnPantalla[], _me: string) {
    const grupos: { clave: string; separador: string | null; mensajes: MensajeEnPantalla[] }[] = [];
    let anterior: MensajeEnPantalla | null = null;
    for (const m of mensajes) {
        const nuevoDia = !anterior || !mismoDia(anterior.created_at, m.created_at);
        const nuevaRafaga =
            nuevoDia || !anterior || anterior.sender_id !== m.sender_id ||
            new Date(m.created_at).getTime() - new Date(anterior.created_at).getTime() > 3 * 60_000;
        if (nuevaRafaga) {
            grupos.push({ clave: m.id, separador: nuevoDia ? separadorDeDia(m.created_at) : null, mensajes: [m] });
        } else {
            grupos[grupos.length - 1].mensajes.push(m);
        }
        anterior = m;
    }
    return grupos;
}
