import React, { createContext, useContext, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { CLAVES } from '../../lib/queryKeys';
import { isStaff } from '../../lib/roles';
import type { UserProfile } from '../../hooks/useUser';
import { useChatRealtime } from '../../features/chat/hooks/useChat';
import { vistaPrevia, type Conversation } from '../../services/chatService';
import { notificationPrefsService, type PreferenciasAvisos } from '../../services/notificationPrefsService';

/**
 * AVISOS DENTRO DE LA APP
 * =====================================================================
 *
 * Aquí se monta EL canal del chat (uno por usuario, compartido por todas
 * las pantallas) y se decide qué se enseña cuando llega algo:
 *
 *   · Un mensaje de una conversación que NO está abierta → un aviso con el
 *     nombre de quien escribe y una línea del mensaje, que lleva al hilo.
 *   · Un mensaje de la conversación abierta → nada: ya se está viendo.
 *   · Con «Mensajes» apagado en Ajustes → nada, tampoco aquí.
 *
 * Los avisos son de sonner, con las superficies del sistema (ver App.tsx).
 * `addNotification` se conserva para quien lo llame por contexto.
 */

type Tipo = 'success' | 'error' | 'info' | 'reward';

interface NotificationContextType {
    addNotification: (title: string, message: string, type: Tipo) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children, user }: { children: React.ReactNode; user: UserProfile | null }) {
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const addNotification = useCallback((title: string, message: string, type: Tipo) => {
        const fn = type === 'success' ? toast.success : type === 'error' ? toast.error : toast;
        fn(title, { description: message, duration: 5000 });
    }, []);

    // Las preferencias del usuario, en caché: se leen al llegar cada mensaje.
    const prefsAvisos = useCallback(async (): Promise<PreferenciasAvisos | null> => {
        if (!user) return null;
        return queryClient.fetchQuery({
            queryKey: CLAVES.avisos.preferencias(user.id),
            queryFn: async () => (await notificationPrefsService.get(user.id)).prefs,
            staleTime: 5 * 60_000,
        });
    }, [queryClient, user]);

    useChatRealtime(user?.id, (m) => {
        void (async () => {
            const prefs = await prefsAvisos().catch(() => null);
            if (prefs && prefs.message === false) return;
            const conversaciones = queryClient.getQueryData<Conversation[]>(CLAVES.chat.conversaciones(user?.id ?? ''));
            const de = conversaciones?.find(c => c.otherId === m.sender_id);
            const nombre = de?.fullName ?? 'Nuevo mensaje';
            const ruta = isStaff(user) ? `/coach-dashboard/mensajes/${m.sender_id}` : `/dashboard/mensajes/${m.sender_id}`;
            toast(nombre, {
                description: vistaPrevia({ type: m.type, content: m.content, attachmentName: m.attachment?.name ?? null }),
                duration: 6000,
                action: { label: 'Abrir', onClick: () => navigate(ruta) },
            });
        })();
    });

    // Puntos de la Arena: el saldo sube.
    useEffect(() => {
        if (!user) return;
        const pointsChannel = supabase.channel(`points_notifs_${user.id}_${Math.random().toString(36).substring(7)}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'user_points',
                filter: `user_id=eq.${user.id}`
            }, (payload: { old?: { balance?: number }; new?: { balance?: number } }) => {
                const antes = payload.old?.balance ?? 0;
                const ahora = payload.new?.balance ?? 0;
                if (ahora > antes) toast.success('Puntos ganados', { description: `Has recibido ${ahora - antes} AC.` });
            })
            .subscribe();

        return () => { supabase.removeChannel(pointsChannel); };
    }, [user]);

    return (
        <NotificationContext.Provider value={{ addNotification }}>
            {children}
        </NotificationContext.Provider>
    );
}

export function useNotifications() {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotifications must be used within a NotificationProvider');
    }
    return context;
}
