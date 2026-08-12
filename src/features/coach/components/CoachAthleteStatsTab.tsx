import { useState } from 'react';
import { LayoutDashboard, ClipboardList, Activity, ClipboardCheck } from 'lucide-react';
import { AthleteStatsModal } from './AthleteStatsModal';
import { AthleteLogTab } from './AthleteLogTab';
import CoachVbtTab from './CoachVbtTab';
import { CoachCheckInsTab } from '../../forms/CoachCheckInsTab';

type StatsSubTab = 'resumen' | 'registro' | 'velocidad' | 'checkins';

const SUB_TABS: { key: StatsSubTab; label: string; icon: typeof LayoutDashboard }[] = [
    { key: 'resumen', label: 'Resumen', icon: LayoutDashboard },
    { key: 'registro', label: 'Registro', icon: ClipboardList },
    { key: 'velocidad', label: 'Velocidad', icon: Activity },
    { key: 'checkins', label: 'Check-ins', icon: ClipboardCheck },
];

/**
 * ESTADÍSTICAS DEL ATLETA — TODO LO QUE ES DATO, EN UN SOLO SITIO.
 * =====================================================================
 *
 * Antes vivían repartidas: las conclusiones en un modal aparte
 * (`AthleteStatsModal`, que aquí se embebe como "Resumen"), el registro de
 * lo que hizo de verdad en su propia pestaña, la velocidad de barra en otra,
 * y los check-ins en una cuarta. Cuatro sitios para la misma pregunta —"¿qué
 * dicen los datos de este atleta?"— es la razón de que nadie mirara ninguno
 * con regularidad.
 *
 * Es una sub-navegación DENTRO de la pestaña Estadísticas de la ficha, al
 * mismo nivel que Programación/Competición/Datos — no una pestaña más entre
 * ellas. `AthleteStatsModal` en modo `embedded` ya trae Volumen y la
 * comparativa carga-velocidad como pestañas propias; no se duplican aquí.
 */
export function CoachAthleteStatsTab({ athleteId, athleteName, coachId }: {
    athleteId: string;
    athleteName: string;
    coachId: string;
}) {
    const [sub, setSub] = useState<StatsSubTab>('resumen');

    return (
        <div className="space-y-4">
            <div
                role="tablist"
                aria-label="Vista de estadísticas"
                className="-mx-1 flex gap-0.5 overflow-x-auto rounded-field bg-surface-sunken p-1 px-1"
            >
                {SUB_TABS.map(({ key, label, icon: Icon }) => {
                    const active = sub === key;
                    return (
                        <button
                            key={key}
                            role="tab"
                            aria-selected={active}
                            onClick={() => setSub(key)}
                            className={`flex shrink-0 items-center justify-center gap-1.5 rounded-chip px-3 py-2 text-t-xs font-semibold transition-colors duration-fast ease-snap ${active
                                ? 'bg-brand text-brand-ink'
                                : 'text-ink-subtle hover:bg-surface-raised hover:text-ink'
                                }`}
                        >
                            <Icon size={14} aria-hidden="true" />
                            {label}
                        </button>
                    );
                })}
            </div>

            {sub === 'resumen' && (
                <AthleteStatsModal
                    embedded
                    isOpen
                    onClose={() => { }}
                    athleteId={athleteId}
                    athleteName={athleteName}
                />
            )}
            {sub === 'registro' && <AthleteLogTab athleteId={athleteId} />}
            {sub === 'velocidad' && <CoachVbtTab athleteId={athleteId} />}
            {sub === 'checkins' && <CoachCheckInsTab athleteId={athleteId} coachId={coachId} />}
        </div>
    );
}
