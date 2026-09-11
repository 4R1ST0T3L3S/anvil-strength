import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Bell, CheckCheck, ClipboardList, Dumbbell, Inbox, MessageSquare, MessageSquareText, Settings2, Trophy, Users, Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { notificationsService, type AppNotification } from '../../services/notificationsService';
import { supabase } from '../../lib/supabase';
import { CLAVES } from '../../lib/queryKeys';
import { haceCuanto } from '../../lib/tiempo';
import { AnchoredMenu } from './AnchoredMenu';
import { EmptyState } from './EmptyState';
import { Punto } from './Badge';
import { cn } from '../../lib/utils';

/**
 * LA CAMPANA
 * =====================================================================
 *
 * Un contador con lo que no se ha leído y un panel con los avisos: pulsar
 * uno lo marca como leído y lleva a la pantalla que corresponde (la
 * bandeja, el entrenamiento, la conversación). El icono dice de qué va cada
 * aviso sin leerlo entero.
 *
 * Por consulta y en caché: la campana vive en la barra lateral y en la
 * cabecera del inicio, y con dos copias montadas lo ven las dos a la vez.
 */

const ICONO: Record<string, typeof Bell> = {
    message: MessageSquare,
    feedback: MessageSquareText,
    review: CheckCheck,
    inbox: Inbox,
    training: Dumbbell,
    competition: Trophy,
    checkin: ClipboardList,
    club: Users,
    system: Info,
};

export function NotificationBell({ userId, className }: { userId: string; className?: string }) {
    const [isOpen, setIsOpen] = useState(false);
    const bellRef = useRef<HTMLButtonElement>(null);
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const clave = CLAVES.avisos.deUsuario(userId);

    const consulta = useQuery({
        queryKey: clave,
        queryFn: async () => {
            const [items, count] = await Promise.all([
                notificationsService.getNotifications(userId),
                notificationsService.getUnreadCount(userId),
            ]);
            return { items, count };
        },
        enabled: !!userId,
        staleTime: 30_000,
    });

    const notifications: AppNotification[] = consulta.data?.items ?? [];
    const unreadCount = consulta.data?.count ?? 0;

    // Tiempo real: el aviso nuevo entra en la caché, y se anuncia.
    useEffect(() => {
        const channel = notificationsService.subscribe(userId, (n) => {
            queryClient.setQueryData<{ items: AppNotification[]; count: number }>(
                clave,
                (previo) => previo ? { items: [n, ...previo.items].slice(0, 40), count: previo.count + 1 } : { items: [n], count: 1 }
            );
            // Los de chat los anuncia el propio chat con el nombre de quien
            // escribe; aquí solo el resto.
            if (n.category !== 'message') {
                toast(n.title, {
                    description: n.message,
                    duration: 6000,
                    action: n.link ? { label: 'Ver', onClick: () => navigate(n.link as string) } : undefined,
                });
            }
        });
        return () => { supabase.removeChannel(channel); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, queryClient]);

    const abrir = async (n: AppNotification) => {
        setIsOpen(false);
        if (!n.is_read) {
            queryClient.setQueryData<{ items: AppNotification[]; count: number }>(
                clave,
                (previo) => previo
                    ? { items: previo.items.map(x => (x.id === n.id ? { ...x, is_read: true } : x)), count: Math.max(0, previo.count - 1) }
                    : previo
            );
            notificationsService.markRead(n.id).catch(() => { /* se reintenta al refrescar */ });
        }
        if (n.link) navigate(n.link);
    };

    const marcarTodo = async () => {
        try {
            await notificationsService.markAllRead(userId);
            queryClient.setQueryData<{ items: AppNotification[]; count: number }>(
                clave,
                (previo) => previo ? { items: previo.items.map(n => ({ ...n, is_read: true })), count: 0 } : previo
            );
        } catch (e) {
            console.error('Error marking notifications read:', e);
        }
    };

    const irAAjustes = () => {
        setIsOpen(false);
        navigate(window.location.pathname.startsWith('/coach-dashboard') ? '/coach-dashboard/notificaciones' : '/dashboard/notificaciones');
    };

    return (
        <>
            <button
                ref={bellRef}
                onClick={() => { setIsOpen(v => !v); if (!isOpen) void consulta.refetch(); }}
                aria-expanded={isOpen}
                aria-haspopup="dialog"
                data-no-press
                className={cn(
                    'relative flex h-10 w-10 items-center justify-center rounded-pill text-ink-muted transition-colors duration-fast ease-snap hover:bg-[var(--fill-hover)] hover:text-ink',
                    className
                )}
                aria-label={`Avisos${unreadCount > 0 ? ` (${unreadCount} sin leer)` : ''}`}
            >
                <Bell className="h-[21px] w-[21px]" aria-hidden="true" />
                {unreadCount > 0 && (
                    <span className="absolute right-1.5 top-1.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-pill bg-brand px-1 text-t-2xs font-semibold tabular-nums leading-none text-brand-ink ring-2 ring-[var(--surface-canvas)]">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            <AnchoredMenu
                open={isOpen}
                onClose={() => setIsOpen(false)}
                anchorRef={bellRef}
                align="end"
                width={380}
                role="dialog"
                className="z-tooltip flex max-h-[min(76vh,34rem)] flex-col overflow-hidden rounded-[14px] border border-[var(--card-border)] bg-surface-overlay shadow-overlay animate-pop"
            >
                <div className="flex shrink-0 items-center justify-between border-b border-[var(--separator)] px-4 py-3">
                    <h3 className="text-t-base font-semibold text-ink">Avisos</h3>
                    <div className="flex items-center gap-1">
                        {unreadCount > 0 && (
                            <button
                                onClick={marcarTodo}
                                className="flex h-8 items-center gap-1.5 rounded-[8px] px-2 text-t-xs font-medium text-ink-muted transition-colors duration-fast hover:bg-[var(--fill-hover)] hover:text-ink"
                            >
                                <CheckCheck className="h-4 w-4" aria-hidden="true" /> Todo leído
                            </button>
                        )}
                        <button
                            onClick={irAAjustes}
                            aria-label="Ajustes de avisos"
                            className="flex h-8 w-8 items-center justify-center rounded-[8px] text-ink-muted transition-colors duration-fast hover:bg-[var(--fill-hover)] hover:text-ink"
                        >
                            <Settings2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                    {consulta.isError ? (
                        <EmptyState kind="error" title="No se han podido cargar tus avisos" body="Puede que tengas alguno sin leer." className="py-8" />
                    ) : consulta.isPending ? (
                        <div className="flex justify-center py-10">
                            <span className="h-6 w-6 animate-spin rounded-pill border-2 border-[var(--border-strong)] border-t-ink" aria-label="Cargando" />
                        </div>
                    ) : notifications.length === 0 ? (
                        <EmptyState icon={<Bell />} title="Sin avisos" body="Aquí verás lo que pase con tus entrenamientos, mensajes y competiciones." className="py-8" />
                    ) : (
                        <ul>
                            {notifications.map(n => {
                                const Icono = ICONO[n.category ?? 'system'] ?? Info;
                                return (
                                    <li key={n.id}>
                                        <button
                                            type="button"
                                            onClick={() => abrir(n)}
                                            data-no-press
                                            className={cn(
                                                'relative flex w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-fast hover:bg-[var(--fill-hover)]',
                                                "after:absolute after:bottom-0 after:left-[60px] after:right-0 after:h-px after:bg-[var(--separator)] after:content-['']",
                                                !n.is_read && 'bg-[var(--brand-quiet)]/40'
                                            )}
                                        >
                                            <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]', n.is_read ? 'bg-[var(--fill-muted)] text-ink-muted' : 'bg-[var(--brand-quiet)] text-brand-text')}>
                                                <Icono className="h-4 w-4" aria-hidden="true" />
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className={cn('flex items-center gap-2 text-t-sm leading-snug text-ink', !n.is_read ? 'font-semibold' : 'font-medium')}>
                                                    {!n.is_read && <Punto aria-label="Sin leer" />}
                                                    <span className="truncate">{n.title}</span>
                                                </span>
                                                <span className="mt-0.5 line-clamp-2 block text-t-xs leading-snug text-ink-muted">{n.message}</span>
                                                <span className="mt-1 block text-t-2xs text-ink-subtle">{haceCuanto(n.created_at)}</span>
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </AnchoredMenu>
        </>
    );
}
