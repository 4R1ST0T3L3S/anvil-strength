import { useEffect, useRef, useState } from 'react';
import type { Macros } from '../../../../lib/nutricion/macros';

/**
 * PIEZAS PEQUEÑAS COMPARTIDAS POR EL EDITOR DE NUTRICIÓN
 */

/** Color de cada macro, el mismo en toda la nutrición (editor, atleta, PDF). */
export const COLOR_MACRO: Record<keyof Macros, string> = {
    kcal: 'text-ink',
    proteina: 'text-info',
    carbos: 'text-warning',
    grasas: 'text-[var(--tint-orange-ink)]',
};

export const BARRA_MACRO: Record<keyof Macros, string> = {
    kcal: 'bg-ink',
    proteina: 'bg-info',
    carbos: 'bg-warning',
    grasas: 'bg-[var(--tint-orange-ink)]',
};

export const ETIQUETA_MACRO: Record<keyof Macros, { larga: string; corta: string; unidad: string }> = {
    kcal: { larga: 'Calorías', corta: 'kcal', unidad: 'kcal' },
    proteina: { larga: 'Proteína', corta: 'P', unidad: 'g' },
    carbos: { larga: 'Hidratos', corta: 'HC', unidad: 'g' },
    grasas: { larga: 'Grasas', corta: 'G', unidad: 'g' },
};

export const formatear = (v: number, decimales = 0) =>
    new Intl.NumberFormat('es-ES', { maximumFractionDigits: decimales, minimumFractionDigits: 0 }).format(v);

/**
 * Qué tan lejos está lo planificado del objetivo. Menos de un 3 % es "en
 * objetivo"; hasta un 10 %, "cerca"; más, "lejos". Con objetivo 0 no se
 * juzga.
 */
export function estadoDesvio(actual: number, objetivo: number): 'ok' | 'cerca' | 'lejos' | 'sin' {
    if (!(objetivo > 0)) return 'sin';
    const d = Math.abs(actual / objetivo - 1);
    return d <= 0.03 ? 'ok' : d <= 0.1 ? 'cerca' : 'lejos';
}

export const COLOR_ESTADO = {
    ok: 'text-success',
    cerca: 'text-warning',
    lejos: 'text-danger-text',
    sin: 'text-ink-subtle',
} as const;

/** Una línea compacta de macros: "540 kcal · 32 P · 61 HC · 14 G". */
export function LineaMacros({ m, className = '' }: { m: Macros; className?: string }) {
    return (
        <span className={`inline-flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 tabular-nums ${className}`}>
            <span className="font-semibold text-ink">{formatear(m.kcal)} <span className="font-normal text-ink-subtle">kcal</span></span>
            <span className={COLOR_MACRO.proteina}>{formatear(m.proteina)} P</span>
            <span className={COLOR_MACRO.carbos}>{formatear(m.carbos)} HC</span>
            <span className={COLOR_MACRO.grasas}>{formatear(m.grasas)} G</span>
        </span>
    );
}

/**
 * Campo de gramos que se edita en el sitio y guarda al salir o con Enter.
 *
 * No guarda en cada tecla —un "150" serían tres escrituras con 1, 15 y 150
 * en medio—, y Escape devuelve el valor que había. Mientras no se está
 * editando, sigue al valor que venga de fuera (otro ajuste, otra pestaña).
 */
export function CampoGramos({
    valor,
    onGuardar,
    etiqueta,
    disabled,
    className = '',
}: {
    valor: number;
    onGuardar: (g: number) => void;
    etiqueta: string;
    disabled?: boolean;
    className?: string;
}) {
    const [texto, setTexto] = useState(String(valor));
    const [editando, setEditando] = useState(false);
    // Escape cancela: el `blur` que viene detrás no debe guardar.
    const cancelado = useRef(false);
    const [valorPrevio, setValorPrevio] = useState(valor);
    if (valorPrevio !== valor) {
        setValorPrevio(valor);
        if (!editando) setTexto(String(valor));
    }

    const confirmar = () => {
        setEditando(false);
        if (cancelado.current) { cancelado.current = false; return; }
        const n = Number(texto.replace(',', '.'));
        if (!Number.isFinite(n) || n < 0) { setTexto(String(valor)); return; }
        const g = Math.round(n * 10) / 10;
        if (g !== valor) onGuardar(g);
        setTexto(String(g));
    };

    return (
        <span className={`inline-flex items-center rounded-field bg-[var(--fill-input)] pr-2 focus-within:ring-2 focus-within:ring-brand ${className}`}>
            <input
                type="text"
                inputMode="decimal"
                aria-label={etiqueta}
                disabled={disabled}
                value={texto}
                onFocus={(e) => { setEditando(true); e.currentTarget.select(); }}
                onChange={(e) => setTexto(e.target.value)}
                onBlur={confirmar}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.currentTarget.blur(); }
                    if (e.key === 'Escape') { cancelado.current = true; setTexto(String(valor)); e.currentTarget.blur(); }
                }}
                className="h-11 md:h-9 w-14 bg-transparent px-2 text-right text-t-sm font-semibold tabular-nums text-ink focus-visible:outline-none disabled:opacity-60"
            />
            <span className="text-t-xs text-ink-subtle">g</span>
        </span>
    );
}

/** Enfoca un elemento al montarse (para formularios que aparecen). */
export function useAutoFoco<T extends HTMLElement>() {
    const ref = useRef<T>(null);
    useEffect(() => { ref.current?.focus(); }, []);
    return ref;
}
