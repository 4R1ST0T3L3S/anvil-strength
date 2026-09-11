import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../../../lib/supabase';
import { CLAVES } from '../../../lib/queryKeys';
import {
    chatService, fundirMensajes, ordenarMensajes,
    type ChatAttachment, type ChatKind, type ChatMessage, type Conversation,
} from '../../../services/chatService';
import { chatMediaService, type SubidaOpciones } from '../../../services/chatMediaService';

/**
 * ANVIL STRENGTH — EL CHAT, PARA REACT
 * =====================================================================
 *
 * UN SOLO CANAL EN TIEMPO REAL POR USUARIO (`useChatRealtime`), montado una
 * vez en el panel, con dos oídos:
 *
 *   · INSERT donde yo soy el destinatario → el mensaje entra en el hilo si
 *     está abierto, se marca ENTREGADO (ha llegado a este dispositivo) y se
 *     refresca la lista de conversaciones.
 *   · UPDATE donde yo soy el remitente → mis mensajes cambian a ✓✓ cuando
 *     el otro los recibe.
 *
 * Antes había tres canales por usuario (uno por pantalla) y ninguno de
 * reconexión: al volver de un túnel el hilo se quedaba sin los mensajes de
 * en medio. Ahora, al reconectar, al volver a la pestaña y al recuperar la
 * red se vuelve a pedir todo lo abierto y se confirman las entregas.
 *
 * ENVÍO OPTIMISTA. El mensaje se pinta al instante con `client_id` y estado
 * `enviando`; si falla se queda como `fallido` con reintento; cuando llega
 * el real, `fundirMensajes` sustituye el provisional por él (mismo client_id).
 */

export type EstadoLocal = 'enviando' | 'subiendo' | 'fallido';

export interface MensajeEnPantalla extends ChatMessage {
    /** Solo en los provisionales. */
    estadoLocal?: EstadoLocal;
    /** 0-1 mientras sube un adjunto. */
    progreso?: number;
    /** Vista previa local del adjunto, hasta que exista en el servidor. */
    previewUrl?: string;
    error?: string;
}

export const TAMANO_PAGINA = 40;

// =====================================================================
// LISTA DE CONVERSACIONES Y NO LEÍDOS
// =====================================================================

export function useConversaciones(userId: string | null | undefined, esStaff: boolean) {
    return useQuery({
        queryKey: CLAVES.chat.conversaciones(userId ?? ''),
        queryFn: () => chatService.conversations(userId as string, esStaff),
        enabled: !!userId,
        staleTime: 15_000,
    });
}

export function useChatSinLeer(userId: string | null | undefined) {
    const q = useQuery({
        queryKey: CLAVES.chat.sinLeer(userId ?? ''),
        queryFn: () => chatService.unreadCount(userId as string),
        enabled: !!userId,
        staleTime: 15_000,
    });
    return q.data ?? 0;
}

// =====================================================================
// EL CANAL
// =====================================================================

/** Qué conversación está abierta ahora mismo, para no avisar de lo que se está viendo. */
const abiertaRef: { current: string | null } = { current: null };
export function marcarConversacionAbierta(otherId: string | null) {
    abiertaRef.current = otherId;
}
export function conversacionAbierta(): string | null {
    return abiertaRef.current;
}

/**
 * Se monta UNA vez (en el armazón del panel). Mantiene la caché al día y
 * avisa de lo que llega para conversaciones que no están abiertas.
 */
export function useChatRealtime(
    userId: string | null | undefined,
    onMensajeNuevo?: (m: ChatMessage) => void
) {
    const queryClient = useQueryClient();
    const avisar = useRef(onMensajeNuevo);
    useEffect(() => { avisar.current = onMensajeNuevo; });

    useEffect(() => {
        if (!userId) return;

        const refrescarTodo = () => {
            queryClient.invalidateQueries({ queryKey: CLAVES.chat.raiz });
            void chatService.ackDelivered().then(() => {
                queryClient.invalidateQueries({ queryKey: CLAVES.chat.conversaciones(userId) });
            });
        };

        let canal: RealtimeChannel | null = null;
        let reintento: ReturnType<typeof setTimeout> | null = null;

        const abrir = () => {
            canal = supabase
                .channel(`chat_${userId}_${Math.random().toString(36).slice(2, 8)}`)
                .on('postgres_changes', {
                    event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `receiver_id=eq.${userId}`,
                }, (payload) => {
                    const m = payload.new as ChatMessage;
                    // Al hilo abierto, si es el suyo; a la lista siempre.
                    queryClient.setQueriesData<MensajeEnPantalla[]>(
                        { queryKey: CLAVES.chat.hilo(userId, m.sender_id) },
                        (previos) => (previos ? fundirMensajes(previos, [m]) : previos)
                    );
                    queryClient.invalidateQueries({ queryKey: CLAVES.chat.conversaciones(userId) });
                    queryClient.invalidateQueries({ queryKey: CLAVES.chat.sinLeer(userId) });
                    // Ha llegado a este dispositivo: entregado. Y si se está
                    // mirando, también leído.
                    if (abiertaRef.current === m.sender_id && document.visibilityState === 'visible') {
                        void chatService.markRead(userId, m.sender_id).then(() => {
                            queryClient.invalidateQueries({ queryKey: CLAVES.chat.sinLeer(userId) });
                        });
                    } else {
                        void chatService.ackDelivered();
                        avisar.current?.(m);
                    }
                })
                .on('postgres_changes', {
                    event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `sender_id=eq.${userId}`,
                }, (payload) => {
                    const m = payload.new as ChatMessage;
                    queryClient.setQueriesData<MensajeEnPantalla[]>(
                        { queryKey: CLAVES.chat.hilo(userId, m.receiver_id) },
                        (previos) => previos?.map(x => (x.id === m.id ? { ...x, delivered_at: m.delivered_at ?? x.delivered_at, is_read: m.is_read } : x))
                    );
                })
                .subscribe((estado) => {
                    // Tras una caída, al volver se rellena lo que faltó.
                    if (estado === 'SUBSCRIBED') refrescarTodo();
                    if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT') {
                        if (reintento) clearTimeout(reintento);
                        reintento = setTimeout(() => {
                            if (canal) supabase.removeChannel(canal);
                            abrir();
                        }, 3000);
                    }
                });
        };

        abrir();

        const alVolver = () => { if (document.visibilityState === 'visible') refrescarTodo(); };
        document.addEventListener('visibilitychange', alVolver);
        window.addEventListener('online', refrescarTodo);
        window.addEventListener('focus', alVolver);

        return () => {
            if (reintento) clearTimeout(reintento);
            if (canal) supabase.removeChannel(canal);
            document.removeEventListener('visibilitychange', alVolver);
            window.removeEventListener('online', refrescarTodo);
            window.removeEventListener('focus', alVolver);
        };
    }, [userId, queryClient]);
}

// =====================================================================
// UN HILO
// =====================================================================

export interface EnvioDeAdjunto {
    file: File;
    kind: Exclude<ChatKind, 'text'>;
    /** Texto que acompaña (pie de foto). */
    caption?: string;
    name?: string;
    duration_s?: number;
    width?: number;
    height?: number;
    poster?: File | null;
    /** Vista previa local (URL de objeto). */
    previewUrl?: string;
}

export function useHilo(me: string, other: string | null) {
    const queryClient = useQueryClient();
    const [ventanas, setVentanas] = useState<Record<string, number>>({});
    const ventana = (other && ventanas[other]) || TAMANO_PAGINA;
    const clave = useMemo(() => CLAVES.chat.hilo(me, other ?? ''), [me, other]);

    const consulta = useQuery({
        queryKey: clave,
        queryFn: async (): Promise<MensajeEnPantalla[]> => {
            const del = await chatService.thread(me, other as string, ventana);
            // Los provisionales (enviando / fallidos) sobreviven al refresco.
            const previos = queryClient.getQueryData<MensajeEnPantalla[]>(clave) ?? [];
            const provisionales = previos.filter(m => m.estadoLocal && !del.some(d => d.client_id && d.client_id === m.client_id));
            return ordenarMensajes([...fundirMensajes(previos.filter(m => !m.estadoLocal), del), ...provisionales]);
        },
        enabled: !!other,
        // La ventana forma parte de la consulta pero no de la clave: al
        // ampliarla se vuelve a pedir el mismo hilo con más mensajes.
        staleTime: 10_000,
    });

    // Marcar como abierta y leer al entrar (y al recibir con el hilo abierto).
    useEffect(() => {
        if (!other) return;
        marcarConversacionAbierta(other);
        void chatService.markRead(me, other).then(() => {
            queryClient.invalidateQueries({ queryKey: CLAVES.chat.sinLeer(me) });
            queryClient.invalidateQueries({ queryKey: CLAVES.chat.conversaciones(me) });
        });
        return () => marcarConversacionAbierta(null);
    }, [me, other, queryClient]);

    // Ampliar la ventana vuelve a pedir el hilo.
    const ultimaVentana = useRef(ventana);
    useEffect(() => {
        if (ultimaVentana.current !== ventana) {
            ultimaVentana.current = ventana;
            void consulta.refetch();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ventana]);

    const mensajes = consulta.data ?? [];
    const hayMas = mensajes.filter(m => !m.estadoLocal).length >= ventana;

    const cargarMas = useCallback(() => {
        if (!other) return;
        setVentanas(v => ({ ...v, [other]: (v[other] || TAMANO_PAGINA) + TAMANO_PAGINA }));
    }, [other]);

    const escribir = useCallback((fn: (lista: MensajeEnPantalla[]) => MensajeEnPantalla[]) => {
        queryClient.setQueryData<MensajeEnPantalla[]>(clave, (lista = []) => fn(lista));
    }, [queryClient, clave]);

    const trasEnviar = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: CLAVES.chat.conversaciones(me) });
    }, [queryClient, me]);

    /** Texto. Optimista, con reintento. */
    const enviarTexto = useCallback(async (texto: string, clientIdPrevio?: string) => {
        if (!other) return;
        const content = texto.trim();
        if (!content) return;
        const clientId = clientIdPrevio ?? crypto.randomUUID();
        const provisional: MensajeEnPantalla = {
            id: `local-${clientId}`,
            client_id: clientId,
            sender_id: me,
            receiver_id: other,
            content,
            type: 'text',
            is_read: false,
            created_at: new Date().toISOString(),
            estadoLocal: 'enviando',
        };
        escribir(lista => ordenarMensajes([...lista.filter(m => m.client_id !== clientId), provisional]));
        try {
            const real = await chatService.send({ me, other, content, type: 'text', clientId });
            escribir(lista => fundirMensajes(lista.filter(m => m.client_id !== clientId || m.id === real.id), [real]));
            trasEnviar();
        } catch (err) {
            escribir(lista => lista.map(m => (m.client_id === clientId ? { ...m, estadoLocal: 'fallido', error: err instanceof Error ? err.message : 'No se pudo enviar' } : m)));
        }
    }, [me, other, escribir, trasEnviar]);

    /** Adjunto ya preparado (comprimido). Sube con progreso y luego inserta. */
    const enviarAdjunto = useCallback(async (envio: EnvioDeAdjunto, opciones: SubidaOpciones = {}) => {
        if (!other) return;
        const clientId = crypto.randomUUID();
        const content = envio.caption?.trim() ?? '';
        const provisional: MensajeEnPantalla = {
            id: `local-${clientId}`,
            client_id: clientId,
            sender_id: me,
            receiver_id: other,
            content,
            type: envio.kind,
            is_read: false,
            created_at: new Date().toISOString(),
            estadoLocal: 'subiendo',
            progreso: 0,
            previewUrl: envio.previewUrl,
            attachment: {
                path: '',
                kind: envio.kind,
                mime: envio.file.type,
                size: envio.file.size,
                name: envio.name,
                duration_s: envio.duration_s,
                width: envio.width,
                height: envio.height,
            },
        };
        escribir(lista => ordenarMensajes([...lista, provisional]));

        try {
            const adjunto: ChatAttachment = await chatMediaService.subir(
                envio.file, me, other,
                { name: envio.name, duration_s: envio.duration_s, width: envio.width, height: envio.height, poster: envio.poster },
                {
                    ...opciones,
                    onProgreso: (f) => {
                        opciones.onProgreso?.(f);
                        escribir(lista => lista.map(m => (m.client_id === clientId ? { ...m, progreso: f } : m)));
                    },
                }
            );
            escribir(lista => lista.map(m => (m.client_id === clientId ? { ...m, estadoLocal: 'enviando', progreso: 1 } : m)));
            const real = await chatService.send({ me, other, content, type: envio.kind, clientId, attachment: adjunto });
            escribir(lista => fundirMensajes(lista.filter(m => m.client_id !== clientId || m.id === real.id), [{ ...real }]).map(m =>
                m.id === real.id ? { ...m, previewUrl: envio.previewUrl } : m
            ));
            trasEnviar();
        } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') {
                escribir(lista => lista.filter(m => m.client_id !== clientId));
                return;
            }
            escribir(lista => lista.map(m => (m.client_id === clientId ? { ...m, estadoLocal: 'fallido', error: err instanceof Error ? err.message : 'No se pudo enviar' } : m)));
        }
    }, [me, other, escribir, trasEnviar]);

    const reintentar = useCallback((m: MensajeEnPantalla) => {
        if (m.type === 'text' && m.client_id) void enviarTexto(m.content, m.client_id);
    }, [enviarTexto]);

    const descartar = useCallback((clientId: string) => {
        escribir(lista => lista.filter(m => m.client_id !== clientId));
    }, [escribir]);

    return {
        mensajes,
        cargando: consulta.isPending && !!other,
        error: consulta.isError ? consulta.error : null,
        recargar: consulta.refetch,
        hayMas,
        cargarMas,
        enviarTexto,
        enviarAdjunto,
        reintentar,
        descartar,
    };
}

// =====================================================================
// URL FIRMADA DE UN ADJUNTO (con caché: la firma dura una hora)
// =====================================================================

export function useAdjuntoUrl(path: string | null | undefined, disponible = true) {
    return useQuery({
        queryKey: CLAVES.chat.adjunto(path ?? ''),
        queryFn: () => chatMediaService.firmar(path as string),
        enabled: !!path && disponible,
        staleTime: 50 * 60_000,
        gcTime: 55 * 60_000,
        retry: 1,
    });
}

export type { Conversation };
