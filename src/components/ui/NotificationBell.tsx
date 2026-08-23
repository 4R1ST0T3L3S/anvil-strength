import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, CheckCheck, Loader, BellRing, BellOff } from 'lucide-react';
import { toast } from 'sonner';
import { notificationsService, AppNotification } from '../../services/notificationsService';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import { AnchoredMenu } from './AnchoredMenu';
import { useQuery, useQueryClient } from '@tanstack/react-query';

function timeAgo(dateStr: string): string {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return 'ahora';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `hace ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `hace ${hours} h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `hace ${days} d`;
    return new Date(dateStr).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

/**
 * Campana de notificaciones en tiempo real.
 * - Badge con nº de no leídas.
 * - Al entrar en la app, muestra un toast con las notificaciones pendientes.
 * - Nuevas notificaciones llegan por Supabase Realtime y disparan toast.
 */
export function NotificationBell({ userId }: { userId: string }) {
    const [isOpen, setIsOpen] = useState(false);

    const bellRef = useRef<HTMLButtonElement>(null);
    const welcomeShown = useRef(false);
    const push = usePushNotifications();

    const handleTogglePush = async () => {
        if (push.isSubscribed) {
            const ok = await push.unsubscribe();
            if (ok) toast('Notificaciones push desactivadas');
        } else {
            const ok = await push.subscribeToPush();
            if (ok) toast.success('¡Push activadas! Te avisaremos aunque la app esté cerrada.');
            else if (push.permission === 'denied') toast.error('Las notificaciones están bloqueadas en los ajustes del navegador.');
            else toast.error('No se pudieron activar las push.');
        }
    };

    /**
     * Los avisos y cuántos hay sin leer, por consulta.
     *
     * Esta campana vive en la cabecera de TODAS las pantallas del panel, así
     * que se monta y desmonta en cada cambio de vista. Con el `useState` que
     * había, eso eran dos peticiones por cada navegación —y dos renders, uno
     * por cada `setState`—. Con la caché, la campana ya sabe lo que tiene que
     * enseñar desde el primer frame.
     *
     * OJO, DEUDA CONOCIDA: esto lee la tabla `notifications` a través de
     * `notificationsService`, mientras que `src/hooks/useNotifications.ts`
     * —el que usa `NotificationsPopover`— lee `app_notifications` por su
     * cuenta. Son DOS sistemas de avisos distintos conviviendo. No se unifican
     * aquí porque decidir cuál se queda es una decisión de datos, no de
     * interfaz.
     */
    const queryClient = useQueryClient();
    const claveAvisos = ['avisos-campana', userId] as const;

    const { data: avisos, refetch, isPending: loading } = useQuery({
        queryKey: ['avisos-campana', userId],
        queryFn: async () => {
            const [items, count] = await Promise.all([
                notificationsService.getNotifications(userId),
                notificationsService.getUnreadCount(userId),
            ]);
            return { items, count };
        },
        enabled: !!userId,
    });

    const notifications: AppNotification[] = avisos?.items ?? [];
    const unreadCount = avisos?.count ?? 0;

    const refresh = useCallback(async () => {
        const { data } = await refetch();
        return data?.count ?? 0;
    }, [refetch]);

    /*
     * Carga inicial + aviso de bienvenida.
     *
     * El efecto llamaba a 'refresh()', que hace dos setState de forma
     * sincrona: dos renders por cada montaje de la campana, que esta en la
     * cabecera de TODAS las pantallas del panel.
     *
     * Ahora el efecto solo dispara el aviso, y lo hace desde dentro de una
     * promesa —no en el cuerpo—, que es donde el analizador si lo admite.
     * El 'ref' sigue garantizando que el aviso salga una vez por sesion.
     */
    useEffect(() => {
        let vivo = true;
        void refresh().then(count => {
            if (!vivo) return;
            if (count > 0 && !welcomeShown.current) {
                welcomeShown.current = true;
                toast(`🔔 Tienes ${count} ${count === 1 ? 'aviso nuevo' : 'avisos nuevos'}`, {
                    description: 'Pulsa la campana para verlos.',
                    duration: 5000,
                });
            }
        });
        return () => { vivo = false; };
    }, [refresh]);

    // Realtime: nuevas notificaciones
    useEffect(() => {
        const channel = notificationsService.subscribe(userId, (n) => {
            // El aviso nuevo entra en la cache, no en un useState: asi lo ve
            // cualquier otra copia de la campana que este montada.
            queryClient.setQueryData<{ items: AppNotification[]; count: number }>(
                claveAvisos,
                (previo) => previo
                    ? { items: [n, ...previo.items], count: previo.count + 1 }
                    : { items: [n], count: 1 }
            );
            toast(n.title, { description: n.message, duration: 6000 });
        });
        return () => { channel.unsubscribe(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, queryClient]);

    // Cerrar al pulsar fuera o con Escape lo resuelve `AnchoredMenu`, que
    // además excluye el propio botón para que su clic no cierre y reabra.

    const handleOpen = () => {
        setIsOpen(prev => !prev);
        // Al abrir se pide de nuevo por si ha entrado algo mientras. Ya no hace
        // falta un 'loading' propio: la consulta enseña lo que tenia guardado
        // y refresca por detras, que es justo lo que se quiere aqui.
        if (!isOpen) void refresh();
    };

    const handleMarkAllRead = async () => {
        try {
            await notificationsService.markAllRead(userId);
            queryClient.setQueryData<{ items: AppNotification[]; count: number }>(
                claveAvisos,
                (previo) => previo ? { items: previo.items.map(n => ({ ...n, is_read: true })), count: 0 } : previo
            );
        } catch (e) {
            console.error('Error marking notifications read:', e);
        }
    };

    return (
        <>
            <button
                ref={bellRef}
                onClick={handleOpen}
                aria-expanded={isOpen}
                aria-haspopup="dialog"
                // 44x44 reales, como el resto de controles de la barra: medía
                // 36 y es vecino del menú de cuenta, que sí los tiene.
                className="relative flex h-11 w-11 items-center justify-center rounded-field text-ink-muted transition-colors hover:bg-white/[0.06] hover:text-white"
                aria-label={`Notificaciones${unreadCount > 0 ? ` (${unreadCount} sin leer)` : ''}`}
            >
                <Bell size={20} />
                {unreadCount > 0 && (
                    <span className="absolute right-1.5 top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-[var(--surface-canvas)] bg-anvil-red px-1 text-[10px] font-black text-white">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {/* El panel sale del árbol por un PORTAL (`AnchoredMenu`).
                La barra superior lleva `backdrop-blur`, que crea contexto de
                apilamiento: cualquier desplegable colgado de ella quedaba
                atrapado dentro y por debajo de la cabecera fija del registro,
                que es donde se veía cortado. Y su ancho se calculaba contra la
                ventana (`100vw - 2rem`) estando anclado a un botón que NO está
                en el borde, así que se salía ~60px por la izquierda.
                `AnchoredMenu` mide el botón, recorta el ancho a lo que cabe y
                se coloca contra la ventana: alineado en móvil y en escritorio. */}
            <AnchoredMenu
                open={isOpen}
                onClose={() => setIsOpen(false)}
                anchorRef={bellRef}
                align="end"
                width={384}
                role="dialog"
                className="z-tooltip flex max-h-[min(75vh,32rem)] flex-col overflow-hidden rounded-card border border-[var(--border-default)] bg-surface-overlay shadow-overlay"
            >
                <div className="flex min-h-0 flex-col">
                        <div className="flex shrink-0 items-center justify-between p-4 border-b border-white/5">
                            <h3 className="font-black uppercase text-white text-sm tracking-wider">Notificaciones</h3>
                            {unreadCount > 0 && (
                                <button
                                    onClick={handleMarkAllRead}
                                    className="flex items-center gap-1.5 text-[11px] font-bold text-gray-400 hover:text-anvil-red uppercase tracking-wide transition-colors"
                                >
                                    <CheckCheck size={14} /> Marcar leídas
                                </button>
                            )}
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto">
                            {loading ? (
                                <div className="flex justify-center py-10">
                                    <Loader className="animate-spin text-anvil-red" size={22} />
                                </div>
                            ) : notifications.length === 0 ? (
                                <div className="py-12 text-center text-gray-500 text-sm">
                                    <Bell size={28} className="mx-auto mb-3 opacity-30" />
                                    No tienes notificaciones.
                                </div>
                            ) : (
                                notifications.map(n => (
                                    <div
                                        key={n.id}
                                        className={`p-4 border-b border-white/5 last:border-b-0 transition-colors ${
 n.is_read ? 'opacity-60' : 'bg-anvil-red/5'
 }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            {!n.is_read && <span className="w-2 h-2 bg-anvil-red rounded-full mt-1.5 shrink-0" />}
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-white leading-tight">{n.title}</p>
                                                <p className="text-xs text-gray-400 mt-1 leading-relaxed">{n.message}</p>
                                                <p className="text-[10px] text-gray-600 font-bold uppercase mt-1.5">{timeAgo(n.created_at)}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Push toggle */}
                        {push.isSupported && (
                            <div className="shrink-0 p-3 border-t border-white/5 bg-black/20">
                                <button
                                    onClick={handleTogglePush}
                                    disabled={push.isLoading}
                                    className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wide transition-colors disabled:opacity-50 ${
 push.isSubscribed
 ? 'bg-white/5 text-gray-400 hover:text-white'
 : 'bg-anvil-red hover:bg-red-700 text-white'
 }`}
                                >
                                    {push.isLoading ? <Loader className="animate-spin" size={13} /> : push.isSubscribed ? <BellOff size={13} /> : <BellRing size={13} />}
                                    {push.isSubscribed ? 'Desactivar avisos push' : 'Activar avisos push (app cerrada)'}
                                </button>
                            </div>
                        )}
                </div>
            </AnchoredMenu>
        </>
    );
}
