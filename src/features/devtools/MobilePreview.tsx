import { useState } from 'react';
import {
    LayoutDashboard, FileText, Utensils, Trophy, User, Calendar, Medal, ShoppingBag,
} from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { LoggerSetRow } from '../training/components/LoggerSetRow';
import { SaveIndicator } from '../../components/ui/SaveIndicator';
import { DangerConfirmModal } from '../../components/modals/DangerConfirmModal';
import type { TrainingSet } from '../../types/training';

/**
 * BANCO DE PRUEBAS DE MAQUETACIÓN — SOLO EN DESARROLLO.
 *
 * La ruta que lo monta está detrás de `import.meta.env.DEV`, así que no
 * existe en producción ni entra en el bundle.
 *
 * POR QUÉ EXISTE: las pantallas que más se usan en el móvil —el registro de
 * series y el armazón del panel— viven detrás del login, y revisar su
 * maquetación a 375px obliga a tener una cuenta, datos de verdad y una
 * sesión abierta. Sin esto, ajustar el espaciado de una fila de series es
 * adivinar; con esto se mide.
 *
 * Solo monta componentes que se alimentan de props. Nada que hable con la
 * base de datos: no es una maqueta de la aplicación, es una regla.
 */

const mockSet = (over: Partial<TrainingSet> = {}): TrainingSet => ({
    id: crypto.randomUUID(),
    session_exercise_id: 'demo',
    target_reps: '5',
    target_load: 140,
    target_metric: 'kg',
    target_rpe: '8',
    rest_seconds: 180,
    is_video_required: false,
    order_index: 0,
    created_at: new Date(0).toISOString(),
    ...over,
});

export function MobilePreview() {
    const [danger, setDanger] = useState(false);

    const sets = [
        mockSet({ target_reps: '5', target_load: 140 }),
        mockSet({ target_reps: '5', target_load: 145, actual_reps: 5, actual_load: 145, actual_rpe: 8, is_completed: true }),
        mockSet({ target_reps: '5', target_load: 150, notes: 'La cadera se me va a la derecha' }),
        mockSet({ target_reps: 'AMRAP', target_load: null, target_metric: 'rpe', target_rpe: '9' }),
    ];

    const menuItems = [
        { icon: <LayoutDashboard size={20} />, label: 'Inicio', onClick: () => {}, isActive: false },
        { icon: <FileText size={20} />, label: 'Entrenar', onClick: () => {}, isActive: true },
        { icon: <Utensils size={20} />, label: 'Nutrición', onClick: () => {}, isActive: false },
        { icon: <Trophy size={20} />, label: 'Competiciones', shortLabel: 'Competir', onClick: () => {}, isActive: false },
        { icon: <User size={20} />, label: 'Perfil', onClick: () => {}, isActive: false },
        { icon: <Calendar size={20} />, label: 'Calendario AEP', onClick: () => {}, isActive: false, hideOnMobileBar: true },
        { icon: <Medal size={20} />, label: 'Ranking', onClick: () => {}, isActive: false, hideOnMobileBar: true },
        { icon: <ShoppingBag size={20} />, label: 'Tienda Anvil', onClick: () => {}, isActive: false, hideOnMobileBar: true },
    ];

    return (
        <DashboardLayout
            menuItems={menuItems}
            userName="Marc Alonso"
            title="Mi planificación"
            onLogout={() => {}}
        >
            <div className="mx-auto flex h-full max-w-md flex-col">
                <div className="flex-1 space-y-4 overflow-y-auto p-4 pb-40">
                    <div data-probe="tarjeta-ejercicio" className="overflow-hidden rounded-card border border-subtle bg-surface-canvas">
                        <div className="flex items-start justify-between gap-2 bg-surface-raised p-4">
                            <h3 className="text-t-lg font-bold leading-tight text-ink">Sentadilla trasera</h3>
                        </div>

                        <div className="grid grid-cols-[1rem_1fr_1fr_2.75rem_2.25rem_2.75rem] gap-1 border-b border-subtle bg-surface-overlay/40 px-2.5 py-2 text-center text-t-2xs font-bold uppercase tracking-wide text-ink-subtle sm:gap-1.5 sm:px-3">
                            <span className="text-left">#</span>
                            <span>Reps</span>
                            <span>Kg</span>
                            <span>RPE</span>
                            <span />
                            <span />
                        </div>

                        <div className="divide-y divide-[var(--border-subtle)]">
                            {sets.map((s, i) => (
                                <LoggerSetRow
                                    key={s.id}
                                    set={s}
                                    displayIndex={i + 1}
                                    targetReps={s.target_reps ?? null}
                                    onStartTimer={() => {}}
                                    defaultRestSeconds={180}
                                />
                            ))}
                        </div>
                    </div>

                    <button
                        onClick={() => setDanger(true)}
                        className="w-full rounded-field border border-subtle py-3 text-t-sm font-bold text-ink-muted"
                    >
                        Probar diálogo de borrado
                    </button>
                </div>

                <div data-probe="pie-sesion" className="pointer-events-none absolute inset-x-0 bottom-0 z-sticky px-3 pb-[calc(env(safe-area-inset-bottom)+4.75rem)] pt-3 md:pb-3">
                    <div className="pointer-events-auto rounded-card border border-[var(--border-default)] bg-surface-raised/95 p-3 shadow-overlay backdrop-blur">
                        <div className="mb-2.5 flex items-center justify-between gap-3">
                            <span className="text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">1 de 4 series</span>
                            <SaveIndicator />
                        </div>
                        <div className="mb-3 h-1 overflow-hidden rounded-pill bg-surface-sunken">
                            <div className="h-full w-1/4 bg-brand" />
                        </div>
                        <button className="w-full rounded-field bg-brand py-3 text-t-sm font-extrabold uppercase tracking-wide text-brand-ink">
                            Terminar el día
                        </button>
                    </div>
                </div>
            </div>

            <DangerConfirmModal
                open={danger}
                onClose={() => setDanger(false)}
                onConfirm={() => setDanger(false)}
                title="Sacar del equipo"
                confirmLabel="Sacar del equipo"
                description={<>Marc Alonso dejará de aparecer en tu lista.</>}
            />
        </DashboardLayout>
    );
}
