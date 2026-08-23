import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { ChatMessage } from '../../../types/database';

/**
 * LA CONVERSACIÓN ENTRE DOS PERSONAS.
 * =====================================================================
 *
 * POR QUÉ ESTO ES UNA CONSULTA Y NO UN `useState`
 *
 * Antes: un `useState` con los mensajes, un `useCallback` que los pedía, y un
 * efecto que llamaba al callback y además abría el canal en tiempo real. Eso
 * tenía dos precios:
 *
 *   · `fetchMessages` termina con `setLoading(false)` y se llamaba desde el
 *     CUERPO del efecto, así que abrir una conversación eran dos renders.
 *   · Cero caché. Volver a una conversación que se acababa de mirar la pedía
 *     entera otra vez, y hasta que llegaba se veía el hilo en blanco. En un
 *     chat, ver el hilo vacío medio segundo se lee como "se han borrado los
 *     mensajes".
 *
 * Con la caché, volver a una conversación la enseña al instante y el refresco
 * ocurre por detrás.
 *
 * Es el mismo patrón que ya usa `src/hooks/useNotifications.ts`: consulta para
 * el estado inicial, y el canal en tiempo real escribiendo sobre la caché con
 * `setQueryData`. El canal SÍ es un efecto legítimo — es exactamente
 * "suscribirse a un sistema externo", que es para lo que existen los efectos.
 */

export const claveConversacion = (yo: string, elOtro: string | null) =>
    ['chat', yo, elOtro] as const;

export const useChat = (currentUserId: string, otherUserId: string | null) => {
    const queryClient = useQueryClient();
    const clave = claveConversacion(currentUserId, otherUserId);

    const { data: messages = [], isPending: loading } = useQuery({
        queryKey: clave,
        queryFn: async (): Promise<ChatMessage[]> => {
            const { data, error } = await supabase
                .from('chat_messages')
                .select('*')
                .or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`)
                .order('created_at', { ascending: true });

            if (error) throw error;

            // El filtro final se hace aquí y no en la consulta porque PostgREST
            // no admite un `or` de dos condiciones compuestas; se piden todos
            // los mensajes en los que participo y se queda la conversación.
            return (data || []).filter(msg =>
                (msg.sender_id === currentUserId && msg.receiver_id === otherUserId) ||
                (msg.sender_id === otherUserId && msg.receiver_id === currentUserId)
            );
        },
        enabled: !!otherUserId,
    });

    /** Añade un mensaje a la caché sin duplicarlo. */
    const anadirMensaje = useCallback((nuevo: ChatMessage) => {
        queryClient.setQueryData<ChatMessage[]>(clave, (previos = []) =>
            previos.some(m => m.id === nuevo.id) ? previos : [...previos, nuevo]
        );
        // `clave` se reconstruye en cada render, así que las dependencias son
        // sus piezas y no el array.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [queryClient, currentUserId, otherUserId]);

    // Tiempo real. Esto SÍ es un efecto: se suscribe a un sistema externo y se
    // da de baja al desmontar.
    useEffect(() => {
        if (!otherUserId) return;

        const channel = supabase
            .channel(`chat_${currentUserId}_${otherUserId}_${Math.random().toString(36).substring(7)}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'chat_messages',
                filter: `receiver_id=eq.${currentUserId}`,
            }, (payload) => {
                const newMessage = payload.new as ChatMessage;
                if (newMessage.sender_id === otherUserId) anadirMensaje(newMessage);
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [currentUserId, otherUserId, anadirMensaje]);

    const sendMessage = async (content: string, type: 'text' | 'image' = 'text') => {
        if (!otherUserId || !content.trim()) return;

        const { data, error } = await supabase
            .from('chat_messages')
            .insert([{
                sender_id: currentUserId,
                receiver_id: otherUserId,
                content,
                type,
            }])
            .select()
            .single();

        if (error) throw error;
        anadirMensaje(data);
        return data;
    };

    const markAsRead = async () => {
        if (!otherUserId) return;

        await supabase
            .from('chat_messages')
            .update({ is_read: true })
            .eq('sender_id', otherUserId)
            .eq('receiver_id', currentUserId)
            .eq('is_read', false);
    };

    /** Vuelve a pedir el hilo. Para cuando se sospecha que falta algo. */
    const fetchMessages = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: clave });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [queryClient, currentUserId, otherUserId]);

    return { messages, loading, sendMessage, markAsRead, fetchMessages };
};
