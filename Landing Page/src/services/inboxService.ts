import { supabase } from '../lib/supabase';

/**
 * ANVIL STRENGTH — LA BANDEJA DEL ATLETA
 * =====================================================================
 *
 * Lo que su entrenador le hace llegar: el feedback de un entrenamiento, el
 * aviso de que lo ha revisado y, en el futuro, notas sueltas y avisos del
 * sistema. Cada elemento tiene su estado (sin leer / leído / archivado) y lo
 * gestiona el atleta.
 *
 * La tabla (`inbox_items`) solo se lee desde aquí; se escribe por funciones
 * de la base (`inbox_set_state`, `review_session`, `send_session_feedback`)
 * que validan quién puede qué. Ver database/BANDEJA_REVISION_2026-09-11.sql.
 */

export type InboxKind = 'training_feedback' | 'training_reviewed' | 'coach_note' | 'system';

export interface InboxPayload {
    session_label?: string;
    block_name?: string;
    week_number?: number;
    completed_at?: string;
    was_modified?: boolean;
}

export interface InboxItem {
    id: string;
    recipientId: string;
    senderId: string | null;
    senderName: string | null;
    senderAvatar: string | null;
    kind: InboxKind;
    sessionId: string | null;
    reviewId: string | null;
    title: string;
    body: string | null;
    payload: InboxPayload;
    createdAt: string;
    readAt: string | null;
    archivedAt: string | null;
}

type Fila = {
    id: string; recipient_id: string; sender_id: string | null; kind: InboxKind;
    session_id: string | null; review_id: string | null; title: string; body: string | null;
    payload: InboxPayload | null; created_at: string; read_at: string | null; archived_at: string | null;
};

export function aElemento(f: Fila, remitentes: Map<string, { name: string | null; avatar: string | null }>): InboxItem {
    const r = f.sender_id ? remitentes.get(f.sender_id) : undefined;
    return {
        id: f.id,
        recipientId: f.recipient_id,
        senderId: f.sender_id,
        senderName: r?.name ?? null,
        senderAvatar: r?.avatar ?? null,
        kind: f.kind,
        sessionId: f.session_id,
        reviewId: f.review_id,
        title: f.title,
        body: f.body,
        payload: f.payload ?? {},
        createdAt: f.created_at,
        readAt: f.read_at,
        archivedAt: f.archived_at,
    };
}

/** ¿La tabla existe? Sin la migración, la bandeja se queda vacía en vez de romper. */
const faltaLaTabla = (error: { code?: string; message?: string } | null) =>
    !!error && (error.code === 'PGRST205' || error.code === '42P01' || /inbox_items/.test(error.message ?? ''));

export const inboxService = {
    async list(userId: string, opciones: { archivados?: boolean } = {}): Promise<InboxItem[]> {
        let q = supabase
            .from('inbox_items')
            .select('id, recipient_id, sender_id, kind, session_id, review_id, title, body, payload, created_at, read_at, archived_at')
            .eq('recipient_id', userId)
            .order('created_at', { ascending: false })
            .limit(200);

        q = opciones.archivados ? q.not('archived_at', 'is', null) : q.is('archived_at', null);

        const { data, error } = await q;
        if (faltaLaTabla(error)) return [];
        if (error) throw error;

        const filas = (data ?? []) as Fila[];
        const ids = [...new Set(filas.map(f => f.sender_id).filter((x): x is string => !!x))];
        const remitentes = new Map<string, { name: string | null; avatar: string | null }>();
        if (ids.length > 0) {
            const { data: perfiles } = await supabase
                .from('profiles')
                .select('id, full_name, avatar_url')
                .in('id', ids);
            for (const p of perfiles ?? []) {
                remitentes.set(p.id as string, {
                    name: (p.full_name as string | null) ?? null,
                    avatar: (p.avatar_url as string | null) ?? null,
                });
            }
        }
        return filas.map(f => aElemento(f, remitentes));
    },

    /** Lo que el entrenador ha dejado sobre UNA sesión (para la pantalla de entrenar). */
    async forSession(sessionId: string): Promise<InboxItem[]> {
        const { data, error } = await supabase
            .from('inbox_items')
            .select('id, recipient_id, sender_id, kind, session_id, review_id, title, body, payload, created_at, read_at, archived_at')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true });
        if (faltaLaTabla(error)) return [];
        if (error) throw error;
        return ((data ?? []) as Fila[]).map(f => aElemento(f, new Map()));
    },

    async unreadCount(userId: string): Promise<number> {
        const { count, error } = await supabase
            .from('inbox_items')
            .select('id', { count: 'exact', head: true })
            .eq('recipient_id', userId)
            .is('read_at', null)
            .is('archived_at', null);
        if (faltaLaTabla(error)) return 0;
        if (error) throw error;
        return count ?? 0;
    },

    /** Leído / no leído / archivado, para uno o varios. */
    async setState(ids: string[], estado: { read?: boolean; archived?: boolean }): Promise<void> {
        if (ids.length === 0) return;
        const { error } = await supabase.rpc('inbox_set_state', {
            p_ids: ids,
            p_read: estado.read ?? null,
            p_archived: estado.archived ?? null,
        });
        if (error) throw error;
    },

    async markAllRead(): Promise<void> {
        const { error } = await supabase.rpc('inbox_mark_all_read');
        if (error) throw error;
    },
};
