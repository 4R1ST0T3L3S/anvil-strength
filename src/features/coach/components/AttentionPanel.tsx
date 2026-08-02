import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, ChevronRight, CalendarClock, UserX, TrendingDown, Check } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { trainingService, type AthleteAdherence } from '../../../services/trainingService';
import { Skeleton } from '../../../components/ui/Skeleton';
import { stagger } from '../../../lib/motion';
import {
    ATTENTION_THRESHOLDS,
    activityLabel,
    adherenceRatio,
    daysSince,
} from '../lib/athleteSignals';

type Severity = 'high' | 'medium';

interface AttentionItem {
    athleteId: string;
    athleteName: string;
    icon: LucideIcon;
    title: string;
    detail: string;
    severity: Severity;
    /** Para que dos avisos del mismo atleta no se pisen en la lista. */
    key: string;
}

/**
 * QUÉ REQUIERE TU ATENCIÓN
 *
 * El inicio del coach enseñaba el número de atletas y la próxima
 * competición. Nada más. Todo lo que de verdad hay que decidir cada día
 * —quién ha desaparecido, a quién se le acaba el bloque, quién está
 * cumpliendo a medias— había que ir a buscarlo atleta por atleta, y con
 * veinte atletas eso significa que no se busca.
 *
 * CRITERIO DE DISEÑO: esto NO es un tablero de métricas. Es una lista de
 * cosas que hacer, y por eso cada línea nombra a una persona y lleva a su
 * ficha. Si un aviso no se puede accionar, no debería estar aquí.
 *
 * Y cuando no hay nada que hacer, lo dice y ocupa cuatro líneas. Un panel
 * que siempre encuentra algo de lo que quejarse acaba siendo ruido de fondo.
 */
export function AttentionPanel({ coachId }: { coachId: string }) {
    const navigate = useNavigate();
    const [items, setItems] = useState<AttentionItem[] | null>(null);

    useEffect(() => {
        let alive = true;

        const load = async () => {
            try {
                const { data: links, error } = await supabase
                    .from('coach_athletes')
                    .select('athlete_id')
                    .eq('coach_id', coachId);

                if (error) throw error;

                const athleteIds = (links ?? []).map((l: { athlete_id: string }) => l.athlete_id);
                if (athleteIds.length === 0) { if (alive) setItems([]); return; }

                const [{ data: profiles }, { data: blocks }, adherence] = await Promise.all([
                    supabase.from('profiles').select('id, full_name').in('id', athleteIds),
                    supabase
                        .from('training_blocks')
                        .select('athlete_id, name, end_date, is_active')
                        .in('athlete_id', athleteIds)
                        .eq('is_active', true),
                    trainingService.getTeamAdherence(athleteIds).catch(() => ({} as Record<string, AthleteAdherence>)),
                ]);

                if (!alive) return;

                const names = new Map((profiles ?? []).map(p => [p.id as string, (p.full_name as string) ?? 'Atleta']));
                const activeBlockByAthlete = new Map(
                    (blocks ?? []).map(b => [b.athlete_id as string, b])
                );

                const found: AttentionItem[] = [];

                athleteIds.forEach(id => {
                    const name = names.get(id) ?? 'Atleta';
                    const block = activeBlockByAthlete.get(id);
                    const stats = adherence[id];
                    const days = daysSince(stats?.lastCompletedAt);
                    const ratio = adherenceRatio(stats);

                    // 1. Sin plan activo. Es trabajo del propio coach, así que
                    //    va primero: los demás avisos son sobre el atleta.
                    if (!block) {
                        found.push({
                            athleteId: id, athleteName: name, key: `${id}:plan`,
                            icon: CalendarClock, severity: 'high',
                            title: 'Sin plan activo',
                            detail: 'No tiene ningún bloque abierto ahora mismo',
                        });
                        return; // Sin plan, los avisos de constancia sobran.
                    }

                    // 2. Desaparecido.
                    if (days === null || days >= ATTENTION_THRESHOLDS.inactiveDays) {
                        found.push({
                            athleteId: id, athleteName: name, key: `${id}:inactivo`,
                            icon: UserX, severity: 'high',
                            title: days === null ? 'Nunca ha registrado' : 'Lleva días sin entrenar',
                            detail: activityLabel(days),
                        });
                    }

                    // 3. Cumple a medias. Solo si NO está ya marcado como
                    //    desaparecido: dos avisos de lo mismo para la misma
                    //    persona hacen la lista el doble de larga sin añadir
                    //    ni una decisión nueva.
                    else if (ratio !== null && ratio < ATTENTION_THRESHOLDS.lowAdherence) {
                        found.push({
                            athleteId: id, athleteName: name, key: `${id}:adherencia`,
                            icon: TrendingDown, severity: 'medium',
                            title: `Cumpliendo el ${Math.round(ratio * 100)}%`,
                            detail: `${stats!.completedSessions} de ${stats!.dueSessions} días cerrados`,
                        });
                    }

                    // 4. Bloque a punto de acabarse: hay que programar el
                    //    siguiente ANTES de que se quede sin nada que hacer.
                    if (block.end_date) {
                        const left = Math.ceil(
                            (new Date(block.end_date).getTime() - Date.now()) / 86_400_000
                        );
                        if (left >= 0 && left <= ATTENTION_THRESHOLDS.blockEndingDays) {
                            found.push({
                                athleteId: id, athleteName: name, key: `${id}:fin-bloque`,
                                icon: CalendarClock, severity: 'medium',
                                title: left === 0 ? 'Su bloque acaba hoy' : `Su bloque acaba en ${left} día${left === 1 ? '' : 's'}`,
                                detail: block.name as string,
                            });
                        }
                    }
                });

                const order: Record<Severity, number> = { high: 0, medium: 1 };
                found.sort((a, b) => order[a.severity] - order[b.severity]);

                setItems(found);
            } catch (err) {
                console.error('Error cargando el panel de atención:', err);
                if (alive) setItems([]);
            }
        };

        load();
        return () => { alive = false; };
    }, [coachId]);

    if (items === null) {
        return (
            <div className="space-y-2">
                <Skeleton className="h-14 w-full rounded-card" />
                <Skeleton className="h-14 w-full rounded-card" />
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <div className="flex items-center gap-3 rounded-card border border-[var(--border-default)] bg-surface-raised px-4 py-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-field bg-[var(--success-quiet)]">
                    <Check size={17} className="text-success" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                    <p className="text-t-sm font-bold text-ink">Todo en orden</p>
                    <p className="text-t-xs text-ink-subtle">
                        Todos tienen plan, están entrenando y ninguno se queda sin bloque esta semana.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <ul className="space-y-2">
            {items.slice(0, 6).map((item, index) => (
                <motion.li
                    key={item.key}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={stagger(index)}
                >
                    <button
                        onClick={() => navigate(`/coach-dashboard/atletas/${item.athleteId}`)}
                        className="group flex w-full items-center gap-3 rounded-card border border-[var(--border-default)] bg-surface-raised px-3.5 py-3 text-left transition-colors duration-fast ease-snap hover:border-[var(--border-strong)] hover:bg-surface-overlay active:scale-[0.995]"
                    >
                        <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-field ${
                                item.severity === 'high' ? 'bg-[var(--danger-quiet)]' : 'bg-[var(--warning-quiet)]'
                            }`}
                        >
                            <item.icon
                                size={15}
                                className={item.severity === 'high' ? 'text-danger' : 'text-warning'}
                                aria-hidden="true"
                            />
                        </span>

                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-t-sm font-bold text-ink">
                                {item.athleteName}
                            </span>
                            <span className="block truncate text-t-xs text-ink-muted">
                                {item.title} · {item.detail}
                            </span>
                        </span>

                        <ChevronRight
                            size={15}
                            aria-hidden="true"
                            className="shrink-0 text-ink-faint transition-transform duration-fast ease-snap group-hover:translate-x-0.5 group-hover:text-ink-muted"
                        />
                    </button>
                </motion.li>
            ))}

            {items.length > 6 && (
                <li>
                    <button
                        onClick={() => navigate('/coach-dashboard/atletas')}
                        className="flex w-full items-center justify-center gap-1.5 rounded-card px-3 py-2.5 text-t-xs font-bold text-ink-subtle transition-colors duration-fast ease-snap hover:bg-surface-raised hover:text-ink"
                    >
                        <AlertTriangle size={13} aria-hidden="true" />
                        Y {items.length - 6} más en la lista de atletas
                    </button>
                </li>
            )}
        </ul>
    );
}
