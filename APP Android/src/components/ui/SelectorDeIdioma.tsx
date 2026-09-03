import { useRef, useState } from 'react';
import { Check, Languages } from 'lucide-react';
import { AnchoredMenu } from './AnchoredMenu';
import { useIdioma } from '../../hooks/useIdioma';
import type { Idioma } from '../../lib/i18n';
import { cn } from '../../lib/utils';

/**
 * ANVIL STRENGTH — ELEGIR IDIOMA
 * =====================================================================
 *
 * CADA IDIOMA SE NOMBRA EN SÍ MISMO
 *
 * «English», no «Inglés». Quien busca su idioma en una lista no sabe cómo se
 * llama su idioma en el idioma que no entiende — es la única regla de esta
 * pieza que se salta constantemente en el resto del mundo.
 *
 *
 * NO HAY BANDERAS, Y ES DELIBERADO
 *
 * Una bandera es un país, no una lengua. La del Reino Unido deja fuera a
 * Estados Unidos, Irlanda y Australia; la de España deja fuera a media
 * América. Y aquí encima hay un club español con atletas que compiten fuera:
 * poner una bandera junto a «English» sería decirle a un mexicano que el
 * español es de otros.
 */

const IDIOMAS: { valor: Idioma; nombre: string; codigo: string }[] = [
    // Cada uno escrito en su propia lengua. Ver la nota de arriba.
    { valor: 'es', nombre: 'Español', codigo: 'ES' },
    { valor: 'en', nombre: 'English', codigo: 'EN' },
];

export function SelectorDeIdioma({ className }: { className?: string }) {
    const { idioma, cambiar } = useIdioma();
    const [abierto, setAbierto] = useState(false);
    const anclaRef = useRef<HTMLButtonElement>(null);

    const actual = IDIOMAS.find((i) => i.valor === idioma) ?? IDIOMAS[0];

    return (
        <>
            <button
                ref={anclaRef}
                type="button"
                onClick={() => setAbierto((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={abierto}
                aria-label={`Idioma: ${actual.nombre}. Cambiar`}
                title={`Idioma: ${actual.nombre}`}
                className={cn(
                    'flex h-11 min-w-[44px] items-center justify-center gap-1.5 rounded-field px-2',
                    'text-ink-muted transition-colors duration-fast ease-snap',
                    'hover:bg-surface-raised hover:text-ink',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-canvas)]',
                    className
                )}
            >
                <Languages className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                {/* El código en dos letras, no el icono a secas: un globo
                    terráqueo no dice en qué idioma estás, solo que se puede
                    cambiar. Y va `aria-hidden` porque el nombre completo ya
                    está en la etiqueta del botón. */}
                <span className="text-t-2xs font-black tracking-wide" aria-hidden="true">
                    {actual.codigo}
                </span>
            </button>

            <AnchoredMenu
                open={abierto}
                onClose={() => setAbierto(false)}
                anchorRef={anclaRef}
                align="end"
                width={200}
                role="menu"
            >
                {IDIOMAS.map((i) => {
                    const activo = i.valor === idioma;
                    return (
                        <button
                            key={i.valor}
                            role="menuitemradio"
                            aria-checked={activo}
                            type="button"
                            // `lang` en el propio elemento: sin esto un lector
                            // de pantalla en español lee "English" con fonética
                            // española y no se entiende nada.
                            lang={i.valor}
                            onClick={() => {
                                setAbierto(false);
                                if (!activo) cambiar(i.valor);
                            }}
                            className={cn(
                                'flex min-h-[44px] w-full items-center gap-3 rounded-field px-3 text-left',
                                'transition-colors duration-fast ease-snap',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                                activo ? 'bg-brand-quiet text-ink' : 'text-ink-muted hover:bg-surface-raised hover:text-ink'
                            )}
                        >
                            <span className="w-7 shrink-0 text-t-2xs font-black tracking-wide text-ink-subtle">
                                {i.codigo}
                            </span>
                            <span className="min-w-0 flex-1 text-t-sm font-bold">{i.nombre}</span>
                            {activo && <Check className="h-4 w-4 shrink-0 text-brand-text" aria-hidden="true" />}
                        </button>
                    );
                })}
            </AnchoredMenu>
        </>
    );
}
