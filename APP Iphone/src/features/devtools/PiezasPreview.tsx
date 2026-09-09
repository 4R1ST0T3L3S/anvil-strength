import { useState } from 'react';
import { RemoveAthleteModal } from '../coach/components/RemoveAthleteModal';
import { ArchivedList } from '../coach/components/CoachAthletes';
import type { RosterAthlete } from '../coach/hooks/useCoachRoster';
import type { AccountStatus } from '../../services/athletesService';
import { ExerciseCard } from '../planning/components/builder/ExerciseCard';
import { EJERCICIO_MIXTO, EJERCICIO_SIMPLE, SEMANA_DE_MENTIRA, OBJETIVOS_DE_MENTIRA } from './ejercicioDeMentira';
import { CurrentWeekLifts } from '../planning/components/context/CurrentWeekLifts';
import {
    TarjetaDeFase, TarjetaDeCompeticion, TarjetaDeMovimiento,
} from '../athlete/components/AthleteStatsView';
import { resolverFases } from '../../lib/period/fases';
import { FASES_DE_MENTIRA, COMPETICION_DE_MENTIRA, RESUMENES_DE_MENTIRA } from './ejercicioDeMentira';
import type { ExtendedSessionExercise } from '../planning/components/builder/types';
import type { TrainingSet } from '../../types/training';

/**
 * BANCO DE PIEZAS. SOLO EN DESARROLLO.
 * =====================================================================
 *
 * POR QUÉ EXISTE
 *
 * Casi todo lo que se toca en esta aplicación vive detrás de un inicio de
 * sesión y, además, detrás de un ESTADO concreto: la lista de archivados solo
 * se ve si has archivado a alguien, el diálogo de borrar ficha solo aparece
 * con un atleta gestionado delante, y el aviso de pago vencido exige que un
 * pago esté vencido. Reproducir cada uno de esos estados con datos de verdad,
 * a mano, para mirar una tarjeta, es lo que hace que al final no se mire.
 *
 * Aquí las piezas se montan con datos inventados y se ven todas a la vez, en
 * todos sus estados, sin tocar la base de datos.
 *
 * Es hermano de MobilePreview: aquel monta una PANTALLA entera del atleta a
 * 375px; este monta PIEZAS sueltas. Los dos desaparecen del build de
 * producción por el mismo mecanismo (ver la nota de AppRoutes).
 *
 *     npm run dev  →  http://localhost:4321/dev/piezas
 *
 * REGLA: los datos de aquí son INVENTADOS y tienen que notarse. Nombres de
 * mentira evidentes, nunca nombres reales de atletas — esto se abre delante
 * de gente y es una pantalla de desarrollo, no un escaparate.
 */

const HOY = new Date();
const haceMeses = (n: number) =>
    new Date(HOY.getFullYear(), HOY.getMonth() - n, 12).toISOString();

const ARCHIVADOS: RosterAthlete[] = [
    {
        id: 'demo-1', full_name: 'Fulanito de Tal', avatar_url: null,
        weight_category: '-83', age_category: 'Senior', total: 540,
        status: 'archived', relation: 'head_coach',
        startedAt: haceMeses(14), endedAt: haceMeses(2),
    },
    {
        id: 'demo-2', full_name: 'Menganita Pérez', avatar_url: null,
        weight_category: '-72', age_category: 'Junior', total: 0,
        status: 'ended', relation: 'head_coach',
        startedAt: haceMeses(20), endedAt: haceMeses(8),
    },
    {
        id: 'demo-3', full_name: 'Perengano de las Cuevas del Almanzora y Ribadesella', avatar_url: null,
        weight_category: null, age_category: null, total: 0,
        status: 'archived', relation: 'nutritionist',
        startedAt: haceMeses(3), endedAt: null,
    },
];

function Bloque({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
    return (
        <section className="space-y-3">
            <div>
                <h2 className="text-t-lg font-black uppercase tracking-display text-ink">{titulo}</h2>
                {nota && <p className="mt-1 text-t-xs text-ink-subtle">{nota}</p>}
            </div>
            <div className="rounded-card border border-dashed border-[var(--border-strong)] p-4">
                {children}
            </div>
        </section>
    );
}

export function PiezasPreview() {
    const [abierto, setAbierto] = useState<AccountStatus | null>(null);
    const [reactivando, setReactivando] = useState<string | null>(null);

    const fingirReactivar = (id: string) => {
        setReactivando(id);
        window.setTimeout(() => setReactivando(null), 900);
    };

    return (
        <div className="min-h-[100dvh] bg-surface-canvas px-4 py-8 md:px-8">
            <div className="mx-auto w-full max-w-3xl space-y-10">
                <header>
                    <p className="text-t-2xs font-bold uppercase tracking-widest text-brand-text">
                        Solo desarrollo
                    </p>
                    <h1 className="mt-1 text-t-3xl font-black uppercase tracking-display text-ink">
                        Banco de piezas
                    </h1>
                    <p className="mt-1.5 text-t-sm text-ink-muted">
                        Datos inventados. Nada de lo que se pulse aquí toca la base de datos.
                    </p>
                </header>

                <Bloque
                    titulo="Estadísticas del atleta"
                    nota="Fase actual con su barra por semanas, cuenta atrás de la competición y las tres tarjetas de básicos con su e1RM, la subida desde el inicio y la miniatura de evolución. El peso muerto va sin registro, para ver ese estado."
                >
                    <div className="space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <TarjetaDeFase
                                fase={resolverFases(FASES_DE_MENTIRA).find(r => r.estado === 'actual') ?? null}
                                movimiento={null}
                                cargando={false}
                            />
                            <TarjetaDeCompeticion competicion={COMPETICION_DE_MENTIRA} cargando={false} />
                        </div>
                        <div className="grid gap-3 md:grid-cols-3">
                            {RESUMENES_DE_MENTIRA.map((r, i) => (
                                <TarjetaDeMovimiento
                                    key={r.lift}
                                    resumen={r}
                                    medalla={['🥇', '🥈', '🥉'][i]}
                                    activo={i === 0}
                                    onSeleccionar={() => { }}
                                />
                            ))}
                        </div>
                    </div>
                </Bloque>

                <Bloque
                    titulo="Volumen semanal contra el objetivo"
                    nota="Sentadilla por debajo (barra roja), banca justa (verde) y peso muerto pasado (ámbar). El panel de la derecha del constructor."
                >
                    <div className="max-w-xs">
                        <CurrentWeekLifts
                            sessions={SEMANA_DE_MENTIRA}
                            week={3}
                            objetivos={OBJETIVOS_DE_MENTIRA}
                            blockId="demo-bloque"
                            declaredMaxes={{ sentadilla: 220, 'press banca': 150, 'peso muerto': 260 }}
                        />
                    </div>
                </Bloque>

                <Bloque
                    titulo="Prescripción mixta en un ejercicio"
                    nota="Serie 1 en RPE, serie 2 en kilos. La cabecera dice «Mixta» y cada fila lleva su unidad. Debajo, el caso corriente con las dos en kg."
                >
                    <div className="space-y-4">
                        <TarjetaDeEjercicioDePrueba inicial={EJERCICIO_MIXTO} />
                        <TarjetaDeEjercicioDePrueba inicial={EJERCICIO_SIMPLE} />
                    </div>
                </Bloque>

                <Bloque
                    titulo="Quitar del equipo"
                    nota="Tres niveles. La tercera opción solo aparece si la ficha nunca ha sido reclamada."
                >
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => setAbierto('managed')}
                            className="rounded-field bg-brand px-4 py-2.5 text-t-xs font-extrabold uppercase tracking-wide text-brand-ink"
                        >
                            Atleta ficticio (3 opciones)
                        </button>
                        <button
                            onClick={() => setAbierto('active')}
                            className="rounded-field border border-subtle px-4 py-2.5 text-t-xs font-bold text-ink-muted"
                        >
                            Cuenta reclamada (2 opciones)
                        </button>
                    </div>
                </Bloque>

                <Bloque
                    titulo="Archivados"
                    nota="Con contenido, y abajo el estado vacío. Sin constancia ni récords: aquí no entrena nadie."
                >
                    <ArchivedList
                        athletes={ARCHIVADOS}
                        loading={false}
                        searchTerm=""
                        reactivatingId={reactivando}
                        onReactivate={(a) => fingirReactivar(a.id)}
                        onBackToTeam={() => { }}
                    />
                </Bloque>

                <Bloque titulo="Archivados — vacío" nota="Lo que ve alguien que nunca ha archivado a nadie.">
                    <ArchivedList
                        athletes={[]}
                        loading={false}
                        searchTerm=""
                        reactivatingId={null}
                        onReactivate={() => { }}
                        onBackToTeam={() => { }}
                    />
                </Bloque>

                <Bloque titulo="Archivados — cargando">
                    <ArchivedList
                        athletes={[]}
                        loading
                        searchTerm=""
                        reactivatingId={null}
                        onReactivate={() => { }}
                        onBackToTeam={() => { }}
                    />
                </Bloque>
            </div>

            <RemoveAthleteModal
                open={abierto !== null}
                onClose={() => setAbierto(null)}
                athlete={abierto ? {
                    id: 'demo-modal',
                    full_name: 'Fulanito de Tal',
                    account_status: abierto,
                } : null}
                onDone={() => setAbierto(null)}
            />
        </div>
    );
}


/**
 * Envoltorio con estado para `ExerciseCard`, que es un componente
 * CONTROLADO: no guarda nada por su cuenta, avisa a su padre. Sin esto, en
 * el banco se podría abrir el selector de unidad pero la fila no cambiaría
 * nunca, y parecería roto cuando lo que falta es el padre.
 */
function TarjetaDeEjercicioDePrueba({ inicial }: { inicial: ExtendedSessionExercise }) {
    const [ex, setEx] = useState(inicial);

    const parchearSerie = (setId: string, campo: string, valor: unknown) =>
        setEx(prev => ({
            ...prev,
            sets: prev.sets.map(s => (s.id === setId ? { ...s, [campo]: valor } : s)),
        }));

    return (
        <ExerciseCard
            sessionExercise={ex}
            athleteId="demo-atleta"
            coachId="demo-coach"
            referenceMax={200}
            recentLoads={[170, 175, 180]}
            onSetMax={() => {}}
            onOpenProgression={() => {}}
            // El `as` es por el `exercise?: Partial<ExerciseLibrary>` del parche,
            // que no encaja con el `ExerciseLibrary` completo del estado. En el
            // banco da igual: los datos son de mentira y nadie los persiste.
            onUpdateExercise={(_id, parche) =>
                setEx(prev => ({ ...prev, ...parche } as ExtendedSessionExercise))
            }
            onAddSet={() =>
                setEx(prev => ({
                    ...prev,
                    sets: [
                        ...prev.sets,
                        {
                            ...prev.sets[prev.sets.length - 1],
                            id: `demo-nueva-${Date.now()}`,
                        } as TrainingSet,
                    ],
                }))
            }
            onDuplicateSet={() => {}}
            onUpdateSet={parchearSerie}
            onRemoveSet={(setId) =>
                setEx(prev => ({ ...prev, sets: prev.sets.filter(s => s.id !== setId) }))
            }
            onRemoveExercise={() => {}}
            onOpenVbtChart={() => {}}
        />
    );
}
