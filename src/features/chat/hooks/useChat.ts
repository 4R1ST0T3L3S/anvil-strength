import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { ChatMessage } from '../../../types/database';

export const useChat = (currentUserId: string, otherUserId: string | null) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchMessages = useCallback(async () => {
        if (!otherUserId) return;
        
        try {
            const { data, error } = await supabase
                .from('chat_messages')
                .select('*')
                .or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`)
                .order('created_at', { ascending: true });

            if (error) throw error;
            
            // Filter locally to ensure we only get messages between these two specific users
            const filtered = (data || []).filter(msg => 
                (msg.sender_id === currentUserId && msg.receiver_id === otherUserId) ||
                (msg.sender_id === otherUserId && msg.receiver_id === currentUserId)
            );
            
            setMessages(filtered);
        } catch (error) {
            console.error('Error fetching chat messages:', error);
        } finally {
            setLoading(false);
        }
    }, [currentUserId, otherUserId]);

    useEffect(() => {
        if (!otherUserId) return;

        fetchMessages();

        const channel = supabase.channel(`chat_${currentUserId}_${otherUserId}_${Math.random().toString(36).substring(7)}`)
            .on('postgres_changes', { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'chat_messages',
                filter: `receiver_id=eq.${currentUserId}` 
            }, (payload) => {
                const newMessage = payload.new as ChatMessage;
                if (newMessage.sender_id === otherUserId) {
                    setMessages(prev => {
                        // Evitar duplicados
                        if (prev.find(m => m.id === newMessage.id)) return prev;
                        return [...prev, newMessage];
                    });
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [currentUserId, otherUserId, fetchMessages]);

    const sendMessage = async (content: string, type: 'text' | 'image' = 'text') => {
        if (!otherUserId || !content.trim()) return;

        const { data, error } = await supabase
            .from('chat_messages')
            .insert([{
                sender_id: currentUserId,
                receiver_id: otherUserId,
                content,
                type
            }])
            .select()
            .single();

        if (error) throw error;
        setMessages(prev => [...prev, data]);
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

    return { messages, loading, sendMessage, markAsRead, fetchMessages };
};
