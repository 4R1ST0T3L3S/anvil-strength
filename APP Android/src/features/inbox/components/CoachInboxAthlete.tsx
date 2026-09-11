import { useMemo } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { CheckCheck, MessageSquare, User } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import type { UserProfile } from '../../../hooks/useUser';
import { useAthletePendingSessions, useReviewActions } from '../hooks/useInbox';
import { PageHeader, Contenido } from '../../../components/layout/PageHeader';
import { EstadoDeDatos } from '../../../components/ui/EstadoDeDatos';
import { SkeletonCard } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Avatar } from '../../../components/ui/Avatar';
import { IconButton } from '../../../components/ui/IconButton';
import { CLAVES } from '../../../lib/queryKeys';
import { transition, DURATION } from '../../../lib/motion';
import { SessionReviewCard } from './SessionReviewCard';

/**
 * LOS ENTRENAMIENTOS PENDIENTES DE UN ATLETA
 * =====================================================================
 *
 * Del más antiguo al más reciente, cada uno con todo lo que hay: series
 * pautadas frente a hechas, RPE, notas, vídeos, el check-in de ese día y,
 * si el atleta cambió algo tras una revisión, qué cambió exactamente.
 *
 * Al marcar uno, se va con una salida corta y el siguiente sube. Nada
 * desaparece por abrirlo: solo por pulsar el check.
 */
export function CoachInboxAthlete({
    user,
    athleteId,
    onBack,
    onOpenChat,
    onOpenProfile,
}: {
    user: UserProfile;
    athleteId: string;
    onBack: () => void;
    onOpenChat: (athlete: { id: string; full_name: string; avatar_url?: string }) => void;
    onOpenProfile: (athleteId: string) => void;
}) {
    const { sesiones, historial, feedback } = useAthletePendingSessions(user.id, athleteId);
    const acciones = useReviewActions(user.id, athleteId);

    const perfil = useQuery({
        queryKey: CLAVES.atleta.porId(athleteId),
        queryFn: async () => {
            const { data } = await supabase
                .from('profiles')
                .select('id, full_name, avatar_url')
                .eq('id', athleteId)
                .maybeSingle();
            return data as { id: string; full_name: string | null; avatar_url: string | null } | null;
        },
        staleTime: 5 * 60_000,
    });

    const nombre = perfil.data?.full_name?.trim() || 'Atleta';
    const lista = useMemo(() => sesiones.data ?? [], [sesiones.data]);

    return (
        <Contenido ancho="normal">
            <PageHeader
                compacta
                atras={{ onClick: onBack, label: 'Bandeja' }}
                antetitulo={
                    <div className="flex items-center gap-2.5">
                        <Avatar nombre={nombre} src={perfil.data?.avatar_url} size={28} />
                        <span className="text-t-sm text-ink-muted">Entrenamientos por revisar</span>
                    </div>
                }
                titulo={nombre}
                subtitulo={
                    lista.length > 0
                        ? `${lista.length} ${lista.length === 1 ? 'pendiente' : 'pendientes'} · del más antiguo al más reciente`
                        : undefined
                }
                acciones={
                    <>
                        <IconButton
                            aria-label="Abrir el chat"
                            icon={<MessageSquare />}
                            onClick={() => onOpenChat({ id: athleteId, full_name: nombre, avatar_url: perfil.data?.avatar_url ?? undefined })}
                        />
                        <IconButton aria-label="Ver la ficha" icon={<User />} onClick={() => onOpenProfile(athleteId)} />
                    </>
                }
            />

            <div className="px-4 sm:px-6 lg:px-8">
                <EstadoDeDatos
                    consulta={sesiones}
                    vacio={false}
                    esqueleto={<div className="space-y-4"><SkeletonCard /><SkeletonCard /></div>}
                    queEs="que.sesiones"
                >
                    {lista.length === 0 ? (
                        <EmptyState
                            kind="done"
                            icon={<CheckCheck />}
                            title={`Al día con ${nombre.split(' ')[0]}`}
                            body="No queda ningún entrenamiento suyo por revisar."
                        />
                    ) : (
                        <div className="space-y-5">
                            <AnimatePresence initial={false}>
                                {lista.map(s => (
                                    <m.div
                                        key={s.id}
                                        layout
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.98, transition: transition(DURATION.fast) }}
                                        transition={transition(DURATION.base)}
                                    >
                                        <SessionReviewCard
                                            sesion={s}
                                            historial={historial[s.id] ?? []}
                                            feedback={feedback[s.id] ?? []}
                                            coachId={user.id}
                                            onRevisar={(comentario) => acciones.revisar.mutate({ sessionId: s.id, feedback: comentario })}
                                            onComentar={(body) => acciones.comentar.mutateAsync({ sessionId: s.id, body })}
                                            onBorrarComentario={(id) => acciones.borrarComentario.mutate(id)}
                                            revisando={acciones.revisar.isPending && acciones.revisar.variables?.sessionId === s.id}
                                        />
                                    </m.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    )}
                </EstadoDeDatos>
            </div>
        </Contenido>
    );
}
