import { useState } from 'react';
import { Activity, Video } from 'lucide-react';
import CoachVbtTab from '../../coach/components/CoachVbtTab';
import { PwrAnalysisTab } from '../../coach/components/pwr/PwrAnalysisTab';
import { cn } from '../../../lib/utils';

/**
 * VELOCIDAD, DESDE EL LADO DEL ATLETA
 * =====================================================================
 *
 * Las mismas dos herramientas que tiene el entrenador, con el atleta ya
 * fijado: sus mediciones y el analizador de vídeo.
 *
 * POR QUÉ EL ATLETA TAMBIÉN
 *
 * En un club normal el encoder está en la barra del atleta y el móvil que
 * graba es el suyo. Si medir solo lo puede hacer el coach, el dato llega —si
 * llega— por WhatsApp y alguien lo teclea a mano dos días después. Dejar que
 * el atleta lo suba desde donde se produce es la única forma de que exista.
 *
 * La RLS ya permite exactamente esto: `vbt_measurements` deja al atleta
 * gestionar lo suyo y a su entrenador verlo. No hay nada aquí que el coach no
 * pueda ver en su ficha.
 */
export function AthleteVbtView({ athleteId }: { athleteId: string }) {
    const [tool, setTool] = useState<'datos' | 'video'>('datos');

    return (
        <div className="w-full px-12 py-6">
            <div
                role="tablist"
                aria-label="Herramienta de velocidad"
                className="mb-5 flex gap-1 rounded-field bg-surface-sunken p-0.5"
            >
                {([
                    ['datos', 'Mis mediciones', Activity],
                    ['video', 'Analizar un vídeo', Video],
                ] as const).map(([value, label, Icon]) => (
                    <button
                        key={value}
                        role="tab"
                        aria-selected={tool === value}
                        onClick={() => setTool(value)}
                        className={cn(
                            'flex flex-1 items-center justify-center gap-1.5 rounded-chip px-3 py-2 text-t-xs font-semibold transition-colors duration-fast ease-snap',
                            tool === value ? 'bg-brand text-brand-ink' : 'text-ink-subtle hover:text-ink'
                        )}
                    >
                        <Icon size={14} aria-hidden="true" />
                        {label}
                    </button>
                ))}
            </div>

            {tool === 'datos'
                ? <CoachVbtTab athleteId={athleteId} />
                : <PwrAnalysisTab fixedAthleteId={athleteId} />}
        </div>
    );
}
