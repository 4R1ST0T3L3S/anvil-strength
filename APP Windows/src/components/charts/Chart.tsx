import type { ReactElement, ReactNode } from 'react';
import { ResponsiveContainer } from 'recharts';
import { EmptyState } from '../ui/EmptyState';
import { SkeletonChart } from '../ui/Skeleton';
import { ALTO } from './theme';
import { cn } from '../../lib/utils';

/**
 * ANVIL STRENGTH — ENVOLTORIO DE GRÁFICA
 * =====================================================================
 *
 * LO QUE RESUELVE, QUE NO ES DIBUJAR
 *
 * Dibujar ya lo hace recharts. Lo que ninguna de las 75 gráficas de la
 * aplicación hace bien es lo de alrededor:
 *
 * 1. RESERVAR EL SITIO. `ResponsiveContainer` mide a su padre, y mientras no
 *    hay datos el padre mide cero: la página se pinta compacta y da un salto
 *    de 240px hacia abajo cuando llegan. Aquí la altura la fija el
 *    envoltorio, así que el hueco existe desde el primer frame — y el
 *    esqueleto mide exactamente lo mismo.
 *
 * 2. LOS CUATRO ESTADOS. Cargando, vacío, error y con datos. Hoy una gráfica
 *    sin datos pinta unos ejes desnudos, que es la forma más silenciosa de
 *    decir "no hay nada": parece que la gráfica está rota, no que el atleta
 *    todavía no ha registrado series.
 *
 * 3. UN SOLO SITIO DONDE VIVE EL ASPECTO. Ver `theme.ts`.
 *
 *
 * DEUDA CONOCIDA, PARA F5
 *
 * Esto NO difiere la carga de recharts: cada pantalla sigue importando
 * `LineChart`, `XAxis` y compañía en la cabecera de su fichero, así que las
 * 827 KB del trozo `CartesianChart` entran con la pantalla. Como todas las
 * pantallas con gráfica ya son rutas diferidas, no entran en el arranque —
 * pero sí en cuanto se abre el panel del entrenador, aunque no se mire una
 * sola gráfica. Diferirlo de verdad es cosa de cada pantalla al migrarla, y
 * ahí manda la regla de K8: solo se monta la gráfica visible ±1.
 */

export interface ChartProps {
    /** Altura en píxeles. Usa `ALTO.mini | normal | grande` de `theme.ts`. */
    alto?: number;
    cargando?: boolean;
    /** Si es `true`, se pinta el estado vacío en vez de los ejes desnudos. */
    vacio?: boolean;
    /** Mensaje del estado vacío. Debe decir qué falta y cómo se consigue. */
    vacioTitulo?: string;
    vacioCuerpo?: string;
    error?: string | null;
    onReintentar?: () => void;
    /** Qué representa la gráfica, para quien no la ve. */
    'aria-label': string;
    /**
     * El resumen en palabras de lo que enseña la gráfica: "el total sube de
     * 480 a 520 kg en ocho semanas". Un SVG de recharts es invisible para un
     * lector de pantalla, así que sin esto el dato no existe para quien no ve.
     */
    resumen?: ReactNode;
    className?: string;
    /** Un único elemento de recharts (`<LineChart>`, `<BarChart>`…). */
    children: ReactElement;
}

export function Chart({
    alto = ALTO.normal,
    cargando = false,
    vacio = false,
    vacioTitulo = 'Todavía no hay datos que dibujar',
    vacioCuerpo,
    error = null,
    onReintentar,
    'aria-label': ariaLabel,
    resumen,
    className,
    children,
}: ChartProps) {
    if (cargando) {
        return <SkeletonChart alto={alto} className={className} />;
    }

    if (error) {
        return (
            <div
                className={cn('flex items-center justify-center rounded-card border border-[var(--border-default)] bg-surface-raised', className)}
                style={{ height: alto }}
            >
                <EmptyState
                    kind="error"
                    title="No se han podido cargar los datos"
                    body={error}
                    action={
                        onReintentar && (
                            <button
                                type="button"
                                onClick={onReintentar}
                                className="rounded-field border border-[var(--border-default)] px-4 py-2 text-t-sm font-semibold text-ink transition-colors duration-fast ease-snap hover:border-[var(--border-strong)] hover:bg-surface-overlay"
                            >
                                Reintentar
                            </button>
                        )
                    }
                />
            </div>
        );
    }

    if (vacio) {
        return (
            <div
                className={cn('flex items-center justify-center rounded-card border border-[var(--border-default)] bg-surface-raised', className)}
                style={{ height: alto }}
            >
                <EmptyState kind="empty" title={vacioTitulo} body={vacioCuerpo} />
            </div>
        );
    }

    return (
        <figure className={cn('m-0', className)} style={{ height: alto }}>
            {/* `role="img"` + `aria-label`: sin esto un lector recorre los
                cientos de nodos del SVG de recharts uno a uno y no dice nada
                útil. Con esto anuncia una imagen con su descripción. */}
            <div role="img" aria-label={ariaLabel} className="h-full w-full">
                <ResponsiveContainer width="100%" height="100%">
                    {children}
                </ResponsiveContainer>
            </div>

            {resumen && (
                <figcaption className="sr-only">{resumen}</figcaption>
            )}
        </figure>
    );
}
