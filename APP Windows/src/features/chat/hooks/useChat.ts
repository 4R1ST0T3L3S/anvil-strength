import { useCallback, useEffect, useState } from 'react';
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
 *
 *
 * POR QUÉ AHORA PIDE UNA CONVERSACIÓN Y NO LA TABLA ENTERA (K12, deuda 2)
 * ---------------------------------------------------------------------
 *
 * Hasta el 24/08/2026 esto pedía TODOS los mensajes del usuario —con todo el
 * mundo, desde el principio de los tiempos— y se quedaba con la conversación
 * FILTRANDO EN EL NAVEGADOR. El comentario que lo justificaba decía que
 * PostgREST no admite un `or` de dos condiciones compuestas.
 *
 * **Eso era falso.** `or=(and(...),and(...))` es sintaxis válida y está
 * comprobada contra producción. La consulta correcta cabe en una línea:
 *
 *     or=(and(sender_id.eq.A,receiver_id.eq.B),
 *         and(sender_id.eq.B,receiver_id.eq.A))
 *
 * Con eso, el servidor devuelve la conversación y solo la conversación, y los
 * índices de `migrations/0002_chat_messages.sql` la resuelven sin ordenar
 * nada.
 *
 * Y además se pide POR VENTANAS. Un hilo de dos años no se descarga para
 * enseñar las últimas doce líneas: se piden las 50 más recientes y `cargarMas`
 * amplía la ventana. La ventana se guarda POR CONVERSACIÓN, así que volver a
 * un hilo que ya habías desplegado lo devuelve como lo dejaste.
 */

/** Cuántos mensajes trae cada tirón. */
export const TAMANO_PAGINA = 50;

export const claveConversacion = (yo: string, elOtro: string | null, ventana: number) =>
    ['chat', yo, elOtro, ventana] as const;

export const useChat = (currentUserId: string, otherUserId: string | null) => {
    const queryClient = useQueryClient();

    /**
     * La ventana abierta de cada conversación.
     *
     * Es un mapa y no un número suelto a propósito: con un número habría que
     * reiniciarlo al cambiar de interlocutor, y eso sería un `setState` dentro
     * de un efecto — justo lo que el bloque 6 se dedicó a quitar de 40 sitios.
     * Indexando por interlocutor, el valor correcto se DERIVA y no hay efecto
     * que escribir.
     */
    const [ventanas, setVentanas] = useState<Record<string, number>>({});
    const ventana = (otherUserId && ventanas[otherUserId]) || TAMANO_PAGINA;

    const clave = claveConversacion(currentUserId, otherUserId, ventana);

    const { data: messages = [], isPending: loading } = useQuery({
        queryKey: clave,
        queryFn: async (): Promise<ChatMessage[]> => {
            const yo = currentUserId;
            const elOtro = otherUserId as string;

            const { data, error } = await supabase
                .from('chat_messages')
                .select('*')
                .or(
                    `and(sender_id.eq.${yo},receiver_id.eq.${elOtro}),` +
                    `and(sender_id.eq.${elOtro},receiver_id.eq.${yo})`
                )
                // Descendente + límite = las MÁS RECIENTES. Ascendente con
                // límite daría las más antiguas, que es lo contrario de lo que
                // se quiere ver al abrir un chat.
                .order('created_at', { ascending: false })
                .limit(ventana);

            if (error) throw error;

            // Y se le da la vuelta para pintar: arriba lo viejo, abajo lo nuevo.
            return (data ?? []).slice().reverse();
        },
        enabled: !!otherUserId,
    });

    /**
     * ¿Puede haber más hilo hacia atrás?
     *
     * Si el servidor ha devuelto justo los que caben en la ventana, es que
     * probablemente hay más. Cuando el total coincide exactamente con la
     * ventana esto se equivoca una vez: se pide una página más, vuelve lo
     * mismo, y ya se sabe que no hay nada detrás.
     */
    const hayMas = messages.length >= ventana;

    const cargarMas = useCallback(() => {
        if (!otherUserId) return;
        setVentanas(previas => ({
            ...previas,
            [otherUserId]: (previas[otherUserId] || TAMANO_PAGINA) + TAMANO_PAGINA,
        }));
    }, [otherUserId]);

    /** Añade un mensaje a la caché sin duplicarlo. */
    const anadirMensaje = useCallback((nuevo: ChatMessage) => {
        queryClient.setQueryData<ChatMessage[]>(clave, (previos = []) =>
            previos.some(m => m.id === nuevo.id) ? previos : [...previos, nuevo]
        );
        // `clave` se reconstruye en cada render, así que las dependencias son
        // sus piezas y no el array.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [queryClient, currentUserId, otherUserId, ventana]);

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
    }, [queryClient, currentUserId, otherUserId, ventana]);

    return { messages, loading, sendMessage, markAsRead, fetchMessages, hayMas, cargarMas };
};
