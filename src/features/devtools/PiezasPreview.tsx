import { useState } from 'react';
import { RemoveAthleteModal } from '../coach/components/RemoveAthleteModal';
import { ArchivedList } from '../coach/components/CoachAthletes';
import type { RosterAthlete } from '../coach/hooks/useCoachRoster';
import type { AccountStatus } from '../../services/athletesService';

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
        <div className="min-h-screen bg-surface-canvas px-4 py-8 md:px-8">
            <div className="mx-auto w-full max-w-3xl space-y-10">
                <header>
                    <p className="text-t-2xs font-bold uppercase tracking-widest text-brand">
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
