import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, Camera, FileText, Image as ImageIcon, Mic, Plus, Trash2, Video } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../../lib/utils';
import { AnchoredMenu, MenuItem } from '../../../components/ui/AnchoredMenu';
import { crearGrabadoraDeVoz } from '../../../lib/media/audio';
import { ACEPTAR_DOCUMENTOS, formatearDuracion, validarArchivo } from '../../../lib/media/limites';
import type { EnvioDeAdjunto } from '../hooks/useChat';

/**
 * EL COMPOSITOR
 * =====================================================================
 *
 * Una fila: «+» (adjuntar), el campo, y a la derecha el micro o la flecha
 * de enviar según haya texto. Igual que en cualquier mensajería moderna,
 * porque es lo que los pulgares ya saben hacer.
 *
 * CÁMARA Y GALERÍA. En móvil, `capture="environment"` abre la cámara
 * directamente —sin pasar por la galería ni por un selector genérico— y
 * `accept` sin `capture` abre la galería. Son dos `<input type="file">`
 * ocultos: el sistema pone su propia interfaz, que es la natural de cada
 * dispositivo. Lo que se elige va al preparador (`PreparadorDeAdjunto`),
 * que enseña una vista previa, recorta y comprime ANTES de subir.
 *
 * VOZ. Pulsar el micro empieza a grabar; aparece el medidor, el tiempo y
 * dos salidas: borrar o enviar. Se envía al parar, sin previa: una nota de
 * voz se escucha, no se edita.
 */

export function Compositor({
    onEnviarTexto,
    onAdjunto,
    onEnviarVoz,
    disabled,
    placeholder = 'Escribe un mensaje',
}: {
    onEnviarTexto: (texto: string) => void;
    /** Un fichero elegido: la pantalla lo pasa por el preparador. */
    onAdjunto: (file: File, origen: 'camara' | 'galeria' | 'documento') => void;
    onEnviarVoz: (envio: EnvioDeAdjunto) => void;
    disabled?: boolean;
    placeholder?: string;
}) {
    const [texto, setTexto] = useState('');
    const [menu, setMenu] = useState(false);
    const masRef = useRef<HTMLButtonElement>(null);
    const areaRef = useRef<HTMLTextAreaElement>(null);
    const fotoRef = useRef<HTMLInputElement>(null);
    const videoRef = useRef<HTMLInputElement>(null);
    const galeriaRef = useRef<HTMLInputElement>(null);
    const docRef = useRef<HTMLInputElement>(null);

    // El área crece con el texto hasta cinco líneas y luego hace scroll.
    const ajustarAlto = useCallback(() => {
        const el = areaRef.current;
        if (!el) return;
        el.style.height = '0px';
        el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
    }, []);
    useEffect(ajustarAlto, [texto, ajustarAlto]);

    const enviar = () => {
        const t = texto.trim();
        if (!t) return;
        onEnviarTexto(t);
        setTexto('');
        requestAnimationFrame(() => areaRef.current?.focus());
    };

    const alTeclear = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // En escritorio, Intro envía y Mayús+Intro salta de línea. En móvil
        // Intro solo salta de línea: el botón está al lado del pulgar.
        const esMovil = window.matchMedia('(pointer: coarse)').matches;
        if (e.key === 'Enter' && !e.shiftKey && !esMovil) {
            e.preventDefault();
            enviar();
        }
    };

    const alElegir = (origen: 'camara' | 'galeria' | 'documento') => (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        const v = validarArchivo(file);
        if (!v.ok) { toast.error(v.motivo); return; }
        onAdjunto(file, origen);
    };

    // ----- VOZ -----
    const [grabando, setGrabando] = useState(false);
    const [nivel, setNivel] = useState(0);
    const [segundos, setSegundos] = useState(0);
    const grabadora = useRef<ReturnType<typeof crearGrabadoraDeVoz> | null>(null);

    const empezarVoz = async () => {
        try {
            const g = crearGrabadoraDeVoz({ onNivel: setNivel, onTiempo: setSegundos });
            grabadora.current = g;
            await g.start();
            setGrabando(true);
        } catch (err) {
            const msg = err instanceof Error ? err.message : '';
            toast.error(/denied|permission|NotAllowed/i.test(msg) ? 'Necesito permiso para usar el micrófono.' : (msg || 'No se pudo grabar.'));
        }
    };

    const pararYEnviar = async () => {
        const g = grabadora.current;
        grabadora.current = null;
        setGrabando(false);
        setNivel(0);
        if (!g) return;
        const r = await g.stop();
        if (!r) { toast('Nota demasiado corta'); return; }
        onEnviarVoz({ file: r.file, kind: 'audio', duration_s: r.duration, previewUrl: URL.createObjectURL(r.file) });
    };

    const cancelarVoz = () => {
        grabadora.current?.cancel();
        grabadora.current = null;
        setGrabando(false);
        setNivel(0);
    };

    useEffect(() => () => grabadora.current?.cancel(), []);

    if (grabando) {
        return (
            <div className="flex items-center gap-2 px-3 py-2">
                <button
                    type="button"
                    onClick={cancelarVoz}
                    aria-label="Descartar la grabación"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill text-danger-text transition-colors duration-fast hover:bg-[var(--danger-quiet)]"
                >
                    <Trash2 className="h-5 w-5" aria-hidden="true" />
                </button>
                <div className="flex h-10 min-w-0 flex-1 items-center gap-3 rounded-pill bg-[var(--fill-input)] px-4">
                    <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-pill bg-brand" aria-hidden="true" />
                    <span className="text-t-sm tabular-nums text-ink">{formatearDuracion(segundos)}</span>
                    <Onda nivel={nivel} />
                </div>
                <button
                    type="button"
                    onClick={pararYEnviar}
                    aria-label="Enviar la nota de voz"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-brand text-brand-ink transition-colors duration-fast hover:bg-brand-hover"
                >
                    <ArrowUp className="h-5 w-5" strokeWidth={2.6} aria-hidden="true" />
                </button>
            </div>
        );
    }

    return (
        <div className="flex items-end gap-2 px-3 py-2">
            <input ref={fotoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={alElegir('camara')} />
            <input ref={videoRef} type="file" accept="video/*" capture="environment" className="hidden" onChange={alElegir('camara')} />
            <input ref={galeriaRef} type="file" accept="image/*,video/*" className="hidden" onChange={alElegir('galeria')} />
            <input ref={docRef} type="file" accept={ACEPTAR_DOCUMENTOS} className="hidden" onChange={alElegir('documento')} />

            <button
                ref={masRef}
                type="button"
                onClick={() => setMenu(v => !v)}
                disabled={disabled}
                aria-label="Adjuntar"
                aria-haspopup="menu"
                aria-expanded={menu}
                className={cn(
                    'mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-[var(--fill-muted)] text-ink-muted transition-[background-color,transform] duration-fast hover:bg-[var(--fill-strong)] hover:text-ink disabled:opacity-40',
                    menu && 'rotate-45 text-ink'
                )}
            >
                <Plus className="h-5 w-5" strokeWidth={2.4} aria-hidden="true" />
            </button>

            <AnchoredMenu open={menu} onClose={() => setMenu(false)} anchorRef={masRef} align="start" width={236}>
                <MenuItem icono={<Camera />} onClick={() => { setMenu(false); fotoRef.current?.click(); }}>Hacer una foto</MenuItem>
                <MenuItem icono={<Video />} onClick={() => { setMenu(false); videoRef.current?.click(); }}>Grabar un vídeo</MenuItem>
                <MenuItem icono={<ImageIcon />} onClick={() => { setMenu(false); galeriaRef.current?.click(); }} pista="Foto o vídeo">Galería</MenuItem>
                <MenuItem icono={<FileText />} onClick={() => { setMenu(false); docRef.current?.click(); }} pista="PDF, Word, Excel…">Documento</MenuItem>
            </AnchoredMenu>

            <div className="flex min-w-0 flex-1 items-end rounded-[20px] bg-[var(--fill-input)] transition-colors duration-fast focus-within:bg-surface-raised focus-within:shadow-[0_0_0_1px_var(--border-strong)]">
                <textarea
                    ref={areaRef}
                    value={texto}
                    onChange={e => setTexto(e.target.value)}
                    onKeyDown={alTeclear}
                    rows={1}
                    disabled={disabled}
                    placeholder={placeholder}
                    aria-label="Mensaje"
                    className="max-h-[132px] min-h-[40px] w-full resize-none bg-transparent px-4 py-2.5 text-t-base leading-[20px] text-ink placeholder:text-ink-subtle focus-visible:outline-none disabled:opacity-50"
                />
            </div>

            {texto.trim() ? (
                <button
                    type="button"
                    onClick={enviar}
                    disabled={disabled}
                    aria-label="Enviar"
                    className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-brand text-brand-ink transition-[background-color,transform] duration-fast hover:bg-brand-hover disabled:opacity-40"
                >
                    <ArrowUp className="h-5 w-5" strokeWidth={2.6} aria-hidden="true" />
                </button>
            ) : (
                <button
                    type="button"
                    onClick={empezarVoz}
                    disabled={disabled}
                    aria-label="Grabar una nota de voz"
                    className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-[var(--fill-muted)] text-ink-muted transition-colors duration-fast hover:bg-[var(--fill-strong)] hover:text-ink disabled:opacity-40"
                >
                    <Mic className="h-5 w-5" aria-hidden="true" />
                </button>
            )}
        </div>
    );
}

/** Doce barritas que siguen el nivel del micro. Sin ellas no se sabe si graba. */
function Onda({ nivel }: { nivel: number }) {
    const barras = 14;
    return (
        <span className="flex h-5 flex-1 items-center gap-[3px]" aria-hidden="true">
            {Array.from({ length: barras }, (_, i) => {
                const centro = Math.abs(i - (barras - 1) / 2) / ((barras - 1) / 2);
                const alto = 3 + Math.round((1 - centro * 0.6) * nivel * 15);
                return <span key={i} className="w-[3px] rounded-pill bg-ink-muted transition-[height] duration-75" style={{ height: alto }} />;
            })}
        </span>
    );
}
