import { supabase } from '../lib/supabase';
import { fetchActiveCoach, fetchRoster } from '../features/coach/hooks/useCoachRoster';

/**
 * ANVIL STRENGTH — CHAT ENTRE ENTRENADOR Y ATLETA
 * =====================================================================
 *
 * Una sola tabla, `chat_messages` (decisión K12). El esquema completo —y la
 * RLS que impide escribir a quien no es tu entrenador o tu atleta— está en
 * database/CHAT_MENSAJERIA_2026-09-11.sql.
 *
 * ESTADOS QUE VE EL REMITENTE: enviado (existe la fila) y entregado
 * (`delivered_at`). No hay "leído" — `is_read` solo sirve para el contador
 * de no leídos del propio destinatario.
 *
 * DOS ESQUEMAS, UN SOLO CLIENTE
 *
 * La migración se ejecuta a mano y el código se despliega antes. Hasta que
 * esté aplicada, el chat sigue funcionando como siempre (solo texto, sin
 * entregas) en vez de romperse: `esquemaChat()` lo detecta una vez y el resto
 * decide con eso. Los adjuntos se ofrecen solo con el esquema nuevo.
 */

export type ChatKind = 'text' | 'image' | 'video' | 'audio' | 'file';

export interface ChatAttachment {
    /** Clave en el bucket `chat-media`. NUNCA una URL: se firma al pintar. */
    path: string;
    kind: Exclude<ChatKind, 'text'>;
    mime: string;
    size: number;
    name?: string;
    duration_s?: number;
    width?: number;
    height?: number;
    poster_path?: string;
}

export interface ChatMessage {
    id: string;
    sender_id: string;
    receiver_id: string;
    content: string;
    type: ChatKind;
    is_read: boolean;
    created_at: string;
    client_id?: string | null;
    delivered_at?: string | null;
    attachment?: ChatAttachment | null;
    media_expires_at?: string | null;
    media_deleted_at?: string | null;
}

export interface Conversation {
    otherId: string;
    fullName: string;
    avatarUrl: string | null;
    /** Qué es la otra persona respecto a mí. */
    otherRole: 'coach' | 'athlete' | null;
    /** Relación activa: se le puede escribir. Si no, solo se lee el historial. */
    canMessage: boolean;
    last: {
        id: string;
        content: string;
        type: ChatKind;
        attachmentName: string | null;
        createdAt: string;
        senderId: string;
        deliveredAt: string | null;
    } | null;
    unreadCount: number;
}

// =====================================================================
// ¿QUÉ ESQUEMA HAY EN LA BASE?
// =====================================================================

export type EsquemaChat = 'nuevo' | 'antiguo';

let esquemaDetectado: EsquemaChat | null = null;

export async function esquemaChat(): Promise<EsquemaChat> {
    if (esquemaDetectado) return esquemaDetectado;
    const { error } = await supabase
        .from('chat_messages')
        .select('id, delivered_at, attachment, client_id')
        .limit(0);
    if (!error) {
        esquemaDetectado = 'nuevo';
    } else if (error.code === '42703' || /column/i.test(error.message)) {
        esquemaDetectado = 'antiguo';
    } else {
        // Un fallo de red no dice nada del esquema: no se memoriza.
        return 'nuevo';
    }
    return esquemaDetectado;
}

// =====================================================================
// UTILIDADES PURAS
// =====================================================================

/** Carpeta de una conversación: los dos UUID ordenados (igual que `chat_folder()` en SQL). */
export function carpetaDeConversacion(a: string, b: string): string {
    return a < b ? `${a}__${b}` : `${b}__${a}`;
}

/** Orden estable: por fecha y, a igualdad, por id. Sin esto dos mensajes del mismo milisegundo bailan. */
export function ordenarMensajes<T extends { created_at: string; id: string }>(lista: T[]): T[] {
    return [...lista].sort((x, y) => (x.created_at === y.created_at ? (x.id < y.id ? -1 : 1) : x.created_at < y.created_at ? -1 : 1));
}

/**
 * Funde mensajes nuevos con los que ya había sin duplicar: por `id` y, para
 * los que se enviaron desde aquí, por `client_id` (el optimista y el real
 * son el mismo mensaje).
 */
export function fundirMensajes<T extends ChatMessage>(previos: T[], nuevos: ChatMessage[]): T[] {
    const porId = new Map<string, T>();
    for (const m of previos) porId.set(m.id, m);
    for (const n of nuevos) {
        const gemelo = n.client_id
            ? [...porId.values()].find(m => m.client_id && m.client_id === n.client_id && m.id !== n.id)
            : undefined;
        if (gemelo) porId.delete(gemelo.id);
        porId.set(n.id, { ...(porId.get(n.id) ?? {}), ...n } as T);
    }
    return ordenarMensajes([...porId.values()]);
}

/** Resumen de una línea para la lista de conversaciones y para los avisos. */
export function vistaPrevia(m: { type: ChatKind; content: string; attachmentName?: string | null }): string {
    const texto = m.content?.trim();
    switch (m.type) {
        case 'image': return texto ? `Foto · ${texto}` : 'Foto';
        case 'video': return texto ? `Vídeo · ${texto}` : 'Vídeo';
        case 'audio': return 'Nota de voz';
        case 'file': return m.attachmentName ? `Archivo · ${m.attachmentName}` : 'Archivo';
        default: return texto;
    }
}

/** ¿El adjunto ya no existe? (caducó a los 15 días o lo limpió el servidor). */
export function adjuntoCaducado(m: Pick<ChatMessage, 'media_deleted_at' | 'media_expires_at'>, ahora = Date.now()): boolean {
    if (m.media_deleted_at) return true;
    return !!m.media_expires_at && new Date(m.media_expires_at).getTime() <= ahora;
}

// =====================================================================
// SERVICIO
// =====================================================================

const COLUMNAS_NUEVAS = 'id, sender_id, receiver_id, content, type, is_read, created_at, client_id, delivered_at, attachment, media_expires_at, media_deleted_at';
const COLUMNAS_ANTIGUAS = 'id, sender_id, receiver_id, content, type, is_read, created_at';

async function columnas(): Promise<string> {
    return (await esquemaChat()) === 'nuevo' ? COLUMNAS_NUEVAS : COLUMNAS_ANTIGUAS;
}

export const chatService = {
    /** La lista de conversaciones: una fila por contacto, con último mensaje y no leídos. */
    async conversations(userId: string, esStaff: boolean): Promise<Conversation[]> {
        if ((await esquemaChat()) === 'nuevo') {
            const { data, error } = await supabase.rpc('chat_conversations');
            if (!error) {
                return ((data ?? []) as {
                    other_id: string; full_name: string | null; avatar_url: string | null;
                    other_role: 'coach' | 'athlete' | null; can_message: boolean;
                    last_id: string | null; last_content: string | null; last_type: ChatKind | null;
                    last_attachment_name: string | null; last_created_at: string | null;
                    last_sender_id: string | null; last_delivered_at: string | null; unread_count: number;
                }[]).map(r => ({
                    otherId: r.other_id,
                    fullName: r.full_name?.trim() || 'Sin nombre',
                    avatarUrl: r.avatar_url,
                    otherRole: r.other_role,
                    canMessage: r.can_message,
                    last: r.last_id
                        ? {
                            id: r.last_id,
                            content: r.last_content ?? '',
                            type: (r.last_type ?? 'text') as ChatKind,
                            attachmentName: r.last_attachment_name,
                            createdAt: r.last_created_at as string,
                            senderId: r.last_sender_id as string,
                            deliveredAt: r.last_delivered_at,
                        }
                        : null,
                    unreadCount: r.unread_count ?? 0,
                }));
            }
            if (error.code !== 'PGRST202') throw error;
        }
        return conversacionesAntiguas(userId, esStaff);
    },

    /** Los N mensajes más recientes de una conversación, en orden de lectura. */
    async thread(me: string, other: string, limite: number): Promise<ChatMessage[]> {
        const { data, error } = await supabase
            .from('chat_messages')
            .select(await columnas())
            .or(`and(sender_id.eq.${me},receiver_id.eq.${other}),and(sender_id.eq.${other},receiver_id.eq.${me})`)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .limit(limite);
        if (error) throw error;
        return ordenarMensajes(((data ?? []) as unknown as ChatMessage[]));
    },

    /**
     * Envía un mensaje. Idempotente con el esquema nuevo: reintentar con el
     * mismo `clientId` devuelve el mensaje que ya se guardó, no uno nuevo.
     */
    async send(params: {
        me: string;
        other: string;
        content: string;
        type: ChatKind;
        clientId: string;
        attachment?: ChatAttachment | null;
    }): Promise<ChatMessage> {
        const nuevo = (await esquemaChat()) === 'nuevo';
        if (!nuevo && params.type !== 'text') {
            throw new Error('Los adjuntos estarán disponibles cuando se actualice la base de datos del chat.');
        }

        const fila: Record<string, unknown> = {
            sender_id: params.me,
            receiver_id: params.other,
            content: params.content,
            type: params.type,
        };
        if (nuevo) {
            fila.client_id = params.clientId;
            if (params.attachment) fila.attachment = params.attachment;
        }

        const { data, error } = await supabase
            .from('chat_messages')
            .insert(fila)
            .select(nuevo ? COLUMNAS_NUEVAS : COLUMNAS_ANTIGUAS)
            .single();

        if (!error) return data as unknown as ChatMessage;

        // Reintento de un envío que sí llegó: se recupera el que hay.
        if (error.code === '23505' && nuevo) {
            const { data: existente } = await supabase
                .from('chat_messages')
                .select(COLUMNAS_NUEVAS)
                .eq('sender_id', params.me)
                .eq('client_id', params.clientId)
                .maybeSingle();
            if (existente) return existente as unknown as ChatMessage;
        }
        if (error.code === '42501') {
            throw new Error('Solo puedes escribir a tu entrenador o a tus atletas.');
        }
        throw error;
    },

    /** "Entregado": todo lo recibido llega a este dispositivo. */
    async ackDelivered(): Promise<void> {
        if ((await esquemaChat()) !== 'nuevo') return;
        await supabase.rpc('chat_ack_delivered');
    },

    /** El contador de no leídos del propio destinatario. No se enseña a nadie más. */
    async markRead(me: string, other: string): Promise<void> {
        if ((await esquemaChat()) === 'nuevo') {
            const { error } = await supabase.rpc('chat_mark_read', { p_other: other });
            if (!error) return;
        }
        await supabase
            .from('chat_messages')
            .update({ is_read: true })
            .eq('sender_id', other)
            .eq('receiver_id', me)
            .eq('is_read', false);
    },

    async unreadCount(me: string): Promise<number> {
        const { count, error } = await supabase
            .from('chat_messages')
            .select('id', { count: 'exact', head: true })
            .eq('receiver_id', me)
            .eq('is_read', false);
        if (error) throw error;
        return count ?? 0;
    },
};

/**
 * La lista con el esquema antiguo: contactos por la relación (los atletas del
 * entrenador; el entrenador del atleta) y el último mensaje de cada uno.
 */
async function conversacionesAntiguas(userId: string, esStaff: boolean): Promise<Conversation[]> {
    const contactos: { id: string; full_name: string | null; avatar_url: string | null; papel: 'coach' | 'athlete' }[] = [];

    if (esStaff) {
        const equipo = await fetchRoster(userId, 'active');
        for (const a of equipo) contactos.push({ id: a.id, full_name: a.full_name, avatar_url: a.avatar_url, papel: 'athlete' });
    }
    const entrenador = await fetchActiveCoach(userId);
    if (entrenador && !contactos.some(c => c.id === entrenador.id)) {
        contactos.push({ id: entrenador.id, full_name: entrenador.full_name, avatar_url: entrenador.avatar_url, papel: 'coach' });
    }

    const { data } = await supabase
        .from('chat_messages')
        .select(COLUMNAS_ANTIGUAS)
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(500);
    const mensajes = (data ?? []) as unknown as ChatMessage[];

    return contactos
        .map(c => {
            const suyos = mensajes.filter(m => m.sender_id === c.id || m.receiver_id === c.id);
            const ultimo = suyos[0];
            return {
                otherId: c.id,
                fullName: c.full_name?.trim() || 'Sin nombre',
                avatarUrl: c.avatar_url,
                otherRole: c.papel,
                canMessage: true,
                last: ultimo
                    ? {
                        id: ultimo.id,
                        content: ultimo.content,
                        type: ultimo.type,
                        attachmentName: null,
                        createdAt: ultimo.created_at,
                        senderId: ultimo.sender_id,
                        deliveredAt: null,
                    }
                    : null,
                unreadCount: suyos.filter(m => m.sender_id === c.id && !m.is_read).length,
            };
        })
        .sort((a, b) => (b.last?.createdAt ?? '').localeCompare(a.last?.createdAt ?? '') || a.fullName.localeCompare(b.fullName));
}
