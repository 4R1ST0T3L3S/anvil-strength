import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { suscribirCambios } from '../../../lib/realtimeCompartido';
import { CLAVES } from '../../../lib/queryKeys';
import { reviewService, type InboxAthleteSummary, type ReviewedSession, type SessionReview, type SessionFeedback } from '../../../services/reviewService';
import { inboxService, type InboxItem } from '../../../services/inboxService';

/**
 * ANVIL STRENGTH — LAS BANDEJAS, PARA REACT
 * =====================================================================
 *
 * Todo pasa por React Query: la lista se enseña al instante desde la caché
 * y se refresca por detrás. Los canales en tiempo real no escriben datos,
 * solo INVALIDAN: es más simple y no puede desincronizarse. Y son
 * COMPARTIDOS (`suscribirCambios`): el contador de la pestaña y la propia
 * bandeja escuchan el mismo socket.
 *
 * CON EMBUDO. El atleta guarda cada serie y cada guardado toca
 * `training_sessions.athlete_updated_at`: un UPDATE por serie. Sin embudo,
 * el entrenador con la bandeja abierta refrescaría veinte veces en un
 * minuto. Con 800 ms de espera, una vez.
 */

function useInvalidarConEmbudo(claves: readonly (readonly unknown[])[], ms = 800) {
    const queryClient = useQueryClient();
    const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
    const clavesRef = useRef(claves);
    useEffect(() => { clavesRef.current = claves; });

    useEffect(() => () => { if (temporizador.current) clearTimeout(temporizador.current); }, []);

    return useCallback(() => {
        if (temporizador.current) clearTimeout(temporizador.current);
        temporizador.current = setTimeout(() => {
            for (const clave of clavesRef.current) {
                queryClient.invalidateQueries({ queryKey: clave as unknown[] });
            }
        }, ms);
    }, [queryClient, ms]);
}

// =====================================================================
// ENTRENADOR
// =====================================================================

/** Una fila por atleta con entrenamientos pendientes. Lo lee también el contador del menú. */
export function useCoachInboxSummary(coachId: string | null | undefined, opciones: { enabled?: boolean } = {}) {
    const invalidar = useInvalidarConEmbudo([CLAVES.bandeja.raiz]);

    const query = useQuery({
        queryKey: CLAVES.bandeja.resumenCoach(coachId ?? ''),
        queryFn: () => reviewService.coachSummary(),
        enabled: !!coachId && opciones.enabled !== false,
        staleTime: 30_000,
    });

    // Cualquier cambio en las sesiones de mis bloques (la RLS filtra el resto).
    useEffect(() => {
        if (!coachId) return;
        return suscribirCambios(`bandeja_coach_${coachId}`, [{ event: '*', table: 'training_sessions' }], invalidar);
    }, [coachId, invalidar]);

    const total = useMemo(
        () => (query.data ?? []).reduce((n, a) => n + a.pendingCount, 0),
        [query.data]
    );

    return { ...query, atletas: (query.data ?? []) as InboxAthleteSummary[], totalPendientes: total };
}

/** Los entrenamientos pendientes de UN atleta, con su historial y sus comentarios. */
export function useAthletePendingSessions(coachId: string | null | undefined, athleteId: string | null | undefined) {
    const sesiones = useQuery({
        queryKey: CLAVES.bandeja.pendientesDeAtleta(coachId ?? '', athleteId ?? ''),
        queryFn: () => reviewService.pendingSessions(athleteId as string),
        enabled: !!coachId && !!athleteId,
    });

    const ids = useMemo(() => (sesiones.data ?? []).map(s => s.id).sort().join(','), [sesiones.data]);

    const historial = useQuery({
        queryKey: CLAVES.bandeja.historial(ids),
        queryFn: () => reviewService.history(ids.split(',').filter(Boolean)),
        enabled: ids.length > 0,
    });

    const feedback = useQuery({
        queryKey: CLAVES.bandeja.feedback(ids),
        queryFn: () => reviewService.feedbackFor(ids.split(',').filter(Boolean)),
        enabled: ids.length > 0,
    });

    return {
        sesiones,
        historial: (historial.data ?? {}) as Record<string, SessionReview[]>,
        feedback: (feedback.data ?? {}) as Record<string, SessionFeedback[]>,
        recargarFeedback: feedback.refetch,
    };
}

/** El check + el feedback. Invalida lo que toca y avisa con «Deshacer». */
export function useReviewActions(coachId: string | null | undefined, athleteId: string | null | undefined) {
    const queryClient = useQueryClient();

    const invalidarTodo = () => {
        queryClient.invalidateQueries({ queryKey: CLAVES.bandeja.raiz });
    };

    const deshacer = useMutation({
        mutationFn: (sessionId: string) => reviewService.unreview(sessionId),
        onSuccess: () => { invalidarTodo(); toast('Revisión deshecha'); },
        onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo deshacer.'),
    });

    const revisar = useMutation({
        mutationFn: ({ sessionId, feedback }: { sessionId: string; feedback?: string | null }) =>
            reviewService.review(sessionId, feedback),
        onMutate: async ({ sessionId }) => {
            // Optimista: la tarjeta se va al instante. Si el servidor dice que
            // no, `onError` la devuelve.
            const clave = CLAVES.bandeja.pendientesDeAtleta(coachId ?? '', athleteId ?? '');
            await queryClient.cancelQueries({ queryKey: clave });
            const previas = queryClient.getQueryData<ReviewedSession[]>(clave);
            queryClient.setQueryData<ReviewedSession[]>(clave, (lista = []) => lista.filter(s => s.id !== sessionId));
            return { previas, clave };
        },
        onError: (err, _vars, ctx) => {
            if (ctx?.previas) queryClient.setQueryData(ctx.clave, ctx.previas);
            toast.error(err instanceof Error ? err.message : 'No se pudo marcar como revisado.');
        },
        onSuccess: (_res, { sessionId, feedback }) => {
            invalidarTodo();
            toast.success(feedback ? 'Revisado y feedback enviado' : 'Marcado como revisado', {
                action: { label: 'Deshacer', onClick: () => deshacer.mutate(sessionId) },
                duration: 6000,
            });
        },
    });

    const comentar = useMutation({
        mutationFn: ({ sessionId, body }: { sessionId: string; body: string }) =>
            reviewService.sendFeedback(sessionId, body),
        onSuccess: () => { invalidarTodo(); toast.success('Feedback enviado'); },
        onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo enviar.'),
    });

    const borrarComentario = useMutation({
        mutationFn: (itemId: string) => reviewService.deleteFeedback(itemId),
        onSuccess: () => { invalidarTodo(); },
        onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo retirar.'),
    });

    return { revisar, deshacer, comentar, borrarComentario };
}

// =====================================================================
// ATLETA
// =====================================================================

function useCanalBandejaAtleta(userId: string | null | undefined) {
    const invalidar = useInvalidarConEmbudo([CLAVES.bandeja.delAtleta(userId ?? '')], 300);
    useEffect(() => {
        if (!userId) return;
        return suscribirCambios(
            `bandeja_atleta_${userId}`,
            [{ event: '*', table: 'inbox_items', filter: `recipient_id=eq.${userId}` }],
            invalidar
        );
    }, [userId, invalidar]);
}

export function useAthleteInbox(userId: string | null | undefined, opciones: { archivados?: boolean; enabled?: boolean } = {}) {
    useCanalBandejaAtleta(userId);

    const query = useQuery({
        queryKey: [...CLAVES.bandeja.delAtleta(userId ?? ''), opciones.archivados ? 'archivados' : 'vivos'],
        queryFn: () => inboxService.list(userId as string, { archivados: opciones.archivados }),
        enabled: !!userId && opciones.enabled !== false,
    });

    return { ...query, elementos: (query.data ?? []) as InboxItem[] };
}

/** Solo el número, para el contador de la pestaña. */
export function useAthleteInboxUnread(userId: string | null | undefined) {
    useCanalBandejaAtleta(userId);

    const query = useQuery({
        queryKey: CLAVES.bandeja.sinLeerAtleta(userId ?? ''),
        queryFn: () => inboxService.unreadCount(userId as string),
        enabled: !!userId,
        staleTime: 30_000,
    });

    return query.data ?? 0;
}

export function useInboxItemActions(userId: string | null | undefined) {
    const queryClient = useQueryClient();
    const invalidar = () => queryClient.invalidateQueries({ queryKey: CLAVES.bandeja.delAtleta(userId ?? '') });

    const marcar = useMutation({
        mutationFn: ({ ids, read, archived }: { ids: string[]; read?: boolean; archived?: boolean }) =>
            inboxService.setState(ids, { read, archived }),
        onMutate: async ({ ids, read, archived }) => {
            const raiz = CLAVES.bandeja.delAtleta(userId ?? '');
            await queryClient.cancelQueries({ queryKey: raiz });
            const ahora = new Date().toISOString();
            queryClient.setQueriesData<InboxItem[]>({ queryKey: raiz }, (lista) =>
                lista?.map(i => {
                    if (!ids.includes(i.id)) return i;
                    return {
                        ...i,
                        readAt: read === true ? (i.readAt ?? ahora) : read === false ? null : i.readAt,
                        archivedAt: archived === true ? (i.archivedAt ?? ahora) : archived === false ? null : i.archivedAt,
                    };
                })
            );
            if (read === true) {
                queryClient.setQueryData<number>(CLAVES.bandeja.sinLeerAtleta(userId ?? ''), (n = 0) => Math.max(0, n - ids.length));
            }
        },
        onSettled: invalidar,
        onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo actualizar.'),
    });

    const marcarTodoLeido = useMutation({
        mutationFn: () => inboxService.markAllRead(),
        onSettled: invalidar,
    });

    return { marcar, marcarTodoLeido };
}
