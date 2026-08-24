import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CLAVES } from '../../../lib/queryKeys';
import { SkeletonList } from '../../../components/ui/Skeleton';
import { ArrowLeft, Calendar, Plus, Dumbbell, MoreVertical } from 'lucide-react';
import { trainingService } from '../../../services/trainingService';
import { TrainingBlock, TrainingSession } from '../../../types/training';
import { CreateSessionModal } from './CreateSessionModal';

interface BlockDetailViewProps {
    block: TrainingBlock;
    onBack: () => void;
    onSelectSession: (session: TrainingSession) => void;
}

export function BlockDetailView({ block, onBack, onSelectSession }: BlockDetailViewProps) {
    const queryClient = useQueryClient();
    const [isCreateSessionModalOpen, setIsCreateSessionModalOpen] = useState(false);

    // Las sesiones del bloque, por consulta. Antes eran un useCallback con
    // setLoading(true) en el cuerpo de un efecto: dos renders seguidos en cada
    // entrada, y ninguna cache al volver desde una sesion concreta.
    const { data: sessions = [], isPending: loading } = useQuery({
        queryKey: CLAVES.sesiones.deBloque(block.id),
        queryFn: () => trainingService.getSessionsByBlock(block.id),
    });

    const fetchSessions = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: CLAVES.sesiones.deBloque(block.id) });
    }, [queryClient, block.id]);

    const formatDate = (dateStr?: string | null) => {
        if (!dateStr) return '—';
        return new Date(dateStr).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    };

    return (
        <div className="flex flex-col h-full bg-surface-sunken">
            {/* Header */}
            <div className="border-b border-subtle bg-surface-sunken p-6">
                <div className="flex items-center gap-4 mb-4">
                    <button
                        onClick={onBack}
                        className="p-2 -ml-2 hover:bg-white/10 rounded-lg text-ink-muted hover:text-ink transition-colors"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <div className="flex items-center gap-3">
                            <h2 className="text-xl font-black uppercase text-ink tracking-tight leading-none">
                                {block.name}
                            </h2>
                            {block.is_active && (
                                <span className="bg-anvil-red/20 text-brand-text text-t-2xs font-black px-2 py-0.5 rounded uppercase tracking-wider">
                                    Activo
                                </span>
                            )}
                        </div>
                        <p className="text-ink-muted text-sm mt-1 flex items-center gap-2">
                            <Calendar size={14} />
                            {formatDate(block.start_date)} - {formatDate(block.end_date)}
                        </p>
                    </div>
                </div>

                {/* Microcycle Stats (Placeholder) */}
                <div className="flex gap-8 text-sm">
                    <div>
                        <span className="block text-ink-subtle text-xs font-bold uppercase">Días / S</span>
                        <span className="text-ink font-bold text-lg">{sessions.length}</span>
                    </div>
                    <div>
                        <span className="block text-ink-subtle text-xs font-bold uppercase">Volumen</span>
                        <span className="text-ink font-bold text-lg">-</span>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">

                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-ink uppercase tracking-tight">Estructura semanal</h3>
                    <button
                        onClick={() => setIsCreateSessionModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-lg text-sm font-bold uppercase tracking-wider hover:bg-gray-200 transition-colors"
                    >
                        <Plus size={16} />
                        Añadir Día
                    </button>
                </div>

                {/* Esqueleto con la forma de la lista, no un giro centrado:
                    asi el hueco esta reservado y nada salta al llegar. */}
                {loading ? (
                    <SkeletonList filas={3} conAvatar={false} />
                ) : sessions.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed border-subtle rounded-xl">
                        <p className="text-ink-subtle mb-4">No hay días de entrenamiento definidos.</p>
                        <button
                            onClick={() => setIsCreateSessionModalOpen(true)}
                            className="text-brand-text font-bold uppercase tracking-wider text-sm hover:underline"
                        >
                            Crear Día 1
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {sessions.map((session) => (
                            <div
                                key={session.id}
                                className="group bg-surface-sunken border border-subtle rounded-xl p-4 hover:border-anvil-red/30 transition-colors cursor-pointer"
                                onClick={() => onSelectSession(session)}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-black/40 rounded-lg flex flex-col items-center justify-center border border-subtle text-center">
                                            <span className="text-t-2xs text-ink-subtle font-bold uppercase">Día</span>
                                            <span className="text-xl font-black text-ink leading-none">{session.day_number}</span>
                                        </div>
                                        <div>
                                            <h4 className="text-ink font-bold uppercase tracking-wider text-lg">
                                                {session.name || `Entrenamiento Día ${session.day_number}`}
                                            </h4>
                                            <p className="text-xs text-ink-subtle flex items-center gap-1.5">
                                                <Dumbbell size={12} />
                                                0 Ejercicios
                                            </p>
                                        </div>
                                    </div>

                                    <button className="text-ink-subtle hover:text-ink transition-colors p-2">
                                        <MoreVertical size={20} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <CreateSessionModal
                isOpen={isCreateSessionModalOpen}
                onClose={() => setIsCreateSessionModalOpen(false)}
                blockId={block.id}
                existingSessions={sessions}
                onSessionCreated={fetchSessions}
            />
        </div>
    );
}
