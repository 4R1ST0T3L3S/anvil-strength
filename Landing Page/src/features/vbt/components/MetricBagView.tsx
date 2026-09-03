import { useEffect, useState } from 'react';
import {
    loadMetricCatalog, presentMetricsByCategory, type MetricBag,
} from '../../../lib/vbt/metricRegistry';
import { cn } from '../../../lib/utils';

/**
 * PINTAR UNA BOLSA DE MÉTRICAS
 * =====================================================================
 *
 * Este componente NO conoce ninguna métrica. No hay en todo el archivo una
 * sola mención a la velocidad, la potencia o el ROM.
 *
 * Recibe una bolsa `{clave: número}` y pregunta al catálogo cómo se llama
 * cada clave, en qué unidad va, cuántos decimales lleva y en qué grupo cae.
 * Eso es lo que hace que la métrica que se añada dentro de seis meses
 * aparezca aquí sin tocar este archivo — que era justo el objetivo del
 * modelo (ver database/metrics_catalog.sql).
 *
 * Una métrica que el catálogo no conozca TAMBIÉN se pinta, con su clave por
 * etiqueta. Un dato medido no se esconde por no saber cómo se llama: verlo
 * feo es recuperable, no verlo es perderlo.
 */
export function MetricBagView({
    bag,
    /** Sin agrupar: una rejilla plana. Para espacios estrechos. */
    flat = false,
    className,
}: {
    bag: MetricBag | null | undefined;
    flat?: boolean;
    className?: string;
}) {
    // El catálogo se pide al montar. Hasta que llega se pinta con las
    // definiciones de respaldo, así que no hay ni un fotograma vacío; cuando
    // llega, este `setState` provoca el re-render con las de verdad.
    const [, setCatalogVersion] = useState(0);

    useEffect(() => {
        let alive = true;
        loadMetricCatalog()
            .then(() => { if (alive) setCatalogVersion(v => v + 1); })
            .catch(() => { /* el respaldo ya está pintado */ });
        return () => { alive = false; };
    }, []);

    const groups = presentMetricsByCategory(bag);

    if (groups.length === 0) {
        return (
            <p className={cn('text-t-2xs text-ink-subtle', className)}>
                Sin métricas registradas.
            </p>
        );
    }

    if (flat) {
        return (
            <div className={cn('grid grid-cols-2 gap-1.5 sm:grid-cols-3', className)}>
                {groups.flatMap(g => g.metrics).map(m => (
                    <Cell key={m.definition.key} label={m.definition.shortLabel} value={m.formatted} title={m.definition.label} />
                ))}
            </div>
        );
    }

    return (
        <div className={cn('space-y-3', className)}>
            {groups.map(g => (
                <div key={g.category}>
                    <p className="mb-1 text-t-2xs font-semibold uppercase tracking-wide text-ink-subtle">
                        {g.label}
                    </p>
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                        {g.metrics.map(m => (
                            <Cell
                                key={m.definition.key}
                                label={m.definition.shortLabel}
                                value={m.formatted}
                                title={m.definition.description ?? m.definition.label}
                            />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

function Cell({ label, value, title }: { label: string; value: string; title?: string }) {
    return (
        <div
            title={title}
            className="min-w-0 rounded-field bg-surface-sunken px-2.5 py-1.5"
        >
            <p className="truncate text-t-2xs text-ink-subtle">{label}</p>
            {/* `tabular-nums`: sin él, una columna de cifras baila al cambiar
                de dígito y cuesta compararlas de un vistazo. */}
            <p className="truncate text-t-xs font-semibold tabular-nums text-ink">{value}</p>
        </div>
    );
}
