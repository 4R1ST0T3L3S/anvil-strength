import { supabase } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Attachment } from './chatMediaService';

export interface ChatMessage {
    id: string;
    sender_id: string;
    recipient_id: string;
    content: string;
    /** Adjuntos del mensaje. Rutas del bucket privado, nunca URLs. */
    attachments?: Attachment[] | null;
    is_read: boolean;
    created_at: string;
}

export interface Announcement {
    id: string;
    author_id: string;
    title: string;
    content: string;
    created_at: string;
}

export interface ChatContact {
    id: string;
    full_name: string;
    avatar_url: string | null;
    role?: string;
}

export const chatService = {
    /** Mensajes entre el usuario actual y otro usuario, ordenados cronológicamente. */
    async getConversation(userId: string, otherId: string, limit = 100): Promise<ChatMessage[]> {
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .or(`and(sender_id.eq.${userId},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${userId})`)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return (data as ChatMessage[]).reverse();
    },

    async sendMessage(
        senderId: string,
        recipientId: string,
        content: string,
        attachments?: Attachment[]
    ): Promise<ChatMessage> {
        const { data, error } = await supabase
            .from('messages')
            .insert({
                sender_id: senderId,
                recipient_id: recipientId,
                content,
                // null y no [] cuando no hay adjuntos: la restricción de la BD
                // distingue "mensaje solo de texto" de "mensaje solo de media".
                attachments: attachments?.length ? attachments : null,
            })
            .select()
            .single();

        if (error) throw error;
        return data as ChatMessage;
    },

    /** Marca como leídos todos los mensajes recibidos de un remitente. */
    async markConversationRead(userId: string, otherId: string): Promise<void> {
        const { error } = await supabase
            .from('messages')
            .update({ is_read: true })
            .eq('recipient_id', userId)
            .eq('sender_id', otherId)
            .eq('is_read', false);

        if (error) throw error;
    },

    /** Nº de mensajes sin leer agrupado por remitente. */
    async getUnreadBySender(userId: string): Promise<Record<string, number>> {
        const { data, error } = await supabase
            .from('messages')
            .select('sender_id')
            .eq('recipient_id', userId)
            .eq('is_read', false);

        if (error) throw error;
        const counts: Record<string, number> = {};
        (data || []).forEach((m: { sender_id: string }) => {
            counts[m.sender_id] = (counts[m.sender_id] || 0) + 1;
        });
        return counts;
    },

    /** El coach del atleta (contacto de chat del atleta). */
    async getMyCoach(athleteId: string): Promise<ChatContact | null> {
        const { data, error } = await supabase
            .from('coach_athletes')
            .select('coach:profiles!coach_id (id, full_name, avatar_url)')
            .eq('athlete_id', athleteId)
            .limit(1)
            .maybeSingle();

        if (error) throw error;
        const coach = data?.coach as unknown as ChatContact | null;
        return coach || null;
    },

    /** Los atletas del coach (contactos de chat del coach). */
    async getMyAthletes(coachId: string): Promise<ChatContact[]> {
        const { data, error } = await supabase
            .from('coach_athletes')
            .select('athlete:profiles!athlete_id (id, full_name, avatar_url)')
            .eq('coach_id', coachId);

        if (error) throw error;
        return (data || [])
            .map((row: { athlete: unknown }) => row.athlete as ChatContact)
            .filter(Boolean)
            .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
    },

    /** Suscripción en tiempo real a mensajes entrantes para el usuario. */
    subscribeToMessages(userId: string, onMessage: (msg: ChatMessage) => void): RealtimeChannel {
        return supabase
            .channel(`messages_${userId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `recipient_id=eq.${userId}`
            }, (payload) => onMessage(payload.new as ChatMessage))
            .subscribe();
    },

    // ============ Anuncios del club ============

    async getAnnouncements(limit = 30): Promise<Announcement[]> {
        const { data, error } = await supabase
            .from('announcements')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data as Announcement[];
    },

    async postAnnouncement(authorId: string, title: string, content: string): Promise<Announcement> {
        const { data, error } = await supabase
            .from('announcements')
            .insert({ author_id: authorId, title, content })
            .select()
            .single();

        if (error) throw error;
        return data as Announcement;
    },

    async deleteAnnouncement(id: string): Promise<void> {
        const { error } = await supabase.from('announcements').delete().eq('id', id);
        if (error) throw error;
    }
};
