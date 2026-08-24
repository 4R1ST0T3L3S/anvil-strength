import { useRef, useState } from 'react';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { AnchoredMenu } from './AnchoredMenu';
import { useTema } from '../../hooks/useTema';
import type { Tema } from '../../lib/tema';
import { cn } from '../../lib/utils';

/**
 * ANVIL STRENGTH — ELEGIR TEMA
 * =====================================================================
 *
 * TRES OPCIONES Y NO UN INTERRUPTOR, QUE ES LA DECISIÓN DE DISEÑO
 *
 * Un interruptor de dos posiciones no sabe decir «lo que diga el sistema». En
 * cuanto lo tocas una vez te quedas fijado para siempre, y quien tiene el
 * móvil en claro de día y oscuro de noche pierde ese automatismo sin haber
 * pedido perderlo. Por eso `Sistema` es una opción de pleno derecho, y la que
 * viene marcada.
 *
 * El icono del botón enseña lo que se está PINTANDO, no lo que se ha elegido:
 * con `Sistema` a las once de la noche se ve una luna, porque es lo que hay
 * en pantalla. Lo que se ha elegido se ve al abrir el menú, con su marca.
 *
 * El menú se cierra al elegir. Un menú de tres opciones excluyentes que se
 * queda abierto invita a seguir tocando, y no hay nada más que hacer.
 */

const OPCIONES: { valor: Tema; etiqueta: string; icono: typeof Sun; pista: string }[] = [
    { valor: 'sistema', etiqueta: 'Sistema', icono: Monitor, pista: 'Sigue al dispositivo' },
    { valor: 'claro', etiqueta: 'Claro', icono: Sun, pista: 'Siempre claro' },
    { valor: 'oscuro', etiqueta: 'Oscuro', icono: Moon, pista: 'Siempre oscuro' },
];

export function SelectorDeTema({ className }: { className?: string }) {
    const { tema, efectivo, establecer } = useTema();
    const [abierto, setAbierto] = useState(false);
    const anclaRef = useRef<HTMLButtonElement>(null);

    const IconoActual = efectivo === 'claro' ? Sun : Moon;
    const elegida = OPCIONES.find((o) => o.valor === tema) ?? OPCIONES[0];

    return (
        <>
            <button
                ref={anclaRef}
                type="button"
                onClick={() => setAbierto((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={abierto}
                // El nombre dice las dos cosas: qué hace el botón y en qué
                // estado está. Un lector de pantalla que solo oiga "Tema" no
                // sabe si hay que tocarlo o no.
                aria-label={`Tema: ${elegida.etiqueta}. Cambiar`}
                title={`Tema: ${elegida.etiqueta}`}
                className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-field',
                    'text-ink-muted transition-colors duration-fast ease-snap',
                    'hover:bg-surface-raised hover:text-ink',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-canvas)]',
                    className
                )}
            >
                <IconoActual className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>

            <AnchoredMenu
                open={abierto}
                onClose={() => setAbierto(false)}
                anchorRef={anclaRef}
                align="end"
                width={228}
                role="menu"
            >
                {OPCIONES.map((o) => {
                    const activa = o.valor === tema;
                    const Icono = o.icono;
                    return (
                        <button
                            key={o.valor}
                            role="menuitemradio"
                            aria-checked={activa}
                            type="button"
                            onClick={() => {
                                establecer(o.valor);
                                setAbierto(false);
                            }}
                            className={cn(
                                'flex min-h-[44px] w-full items-center gap-3 rounded-field px-3 text-left',
                                'transition-colors duration-fast ease-snap',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                                activa ? 'bg-brand-quiet text-ink' : 'text-ink-muted hover:bg-surface-raised hover:text-ink'
                            )}
                        >
                            <Icono className="h-4 w-4 shrink-0" aria-hidden="true" />
                            <span className="min-w-0 flex-1">
                                <span className="block text-t-sm font-bold">{o.etiqueta}</span>
                                <span className="block text-t-2xs text-ink-subtle">{o.pista}</span>
                            </span>
                            {/* La marca es un icono, no solo un fondo de color:
                                el estado nunca se codifica solo con color. */}
                            {activa && <Check className="h-4 w-4 shrink-0 text-brand-text" aria-hidden="true" />}
                        </button>
                    );
                })}
            </AnchoredMenu>
        </>
    );
}
