import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { esAppEmpaquetada } from '../lib/entorno';

/**
 * WEB PUSH — LA SUSCRIPCIÓN DE ESTE DISPOSITIVO
 * =====================================================================
 *
 * La clave pública VAPID ya no viene de una variable de entorno: la sirve
 * la base (`get_vapid_public_key`), y si aún no existe la genera la función
 * `send-push` la primera vez. Así el push funciona en cualquier copia de la
 * app sin configurar nada en Vercel. `VITE_VAPID_PUBLIC_KEY` se sigue
 * admitiendo como respaldo.
 *
 * `navigator.serviceWorker.ready` NO RESUELVE NUNCA si no hay service
 * worker (dentro del APK, a propósito, no lo hay): por eso lleva tope.
 */

function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

async function clavePublica(): Promise<string | null> {
    try {
        const { data } = await supabase.rpc('get_vapid_public_key');
        if (typeof data === 'string' && data) return data;
    } catch { /* sin migración: se prueba lo demás */ }
    try {
        const { data } = await supabase.functions.invoke('send-push', { body: { action: 'public_key' } });
        const clave = (data as { public_key?: string } | null)?.public_key;
        if (clave) return clave;
    } catch { /* función sin desplegar */ }
    return import.meta.env.VITE_VAPID_PUBLIC_KEY || null;
}

function conTope<T>(p: Promise<T>, ms: number, mensaje: string): Promise<T> {
    return Promise.race([p, new Promise<never>((_, rechazar) => setTimeout(() => rechazar(new Error(mensaje)), ms))]);
}

export interface PushNotificationState {
    isSupported: boolean;
    isSubscribed: boolean;
    permission: NotificationPermission;
    isLoading: boolean;
}

export function usePushNotifications() {
    const [state, setState] = useState<PushNotificationState>({
        isSupported: false,
        isSubscribed: false,
        permission: 'default',
        isLoading: true,
    });

    useEffect(() => {
        const comprobar = async () => {
            const supported = !esAppEmpaquetada() && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
            if (!supported) {
                setState(s => ({ ...s, isSupported: false, isLoading: false }));
                return;
            }
            setState(s => ({ ...s, isSupported: true, permission: Notification.permission }));
            try {
                const registration = await conTope(navigator.serviceWorker.ready, 5_000, 'No hay service worker activo');
                const subscription = await registration.pushManager.getSubscription();
                setState(s => ({ ...s, isSubscribed: !!subscription, isLoading: false }));
            } catch {
                setState(s => ({ ...s, isLoading: false }));
            }
        };
        void comprobar();
    }, []);

    const subscribeToPush = useCallback(async (): Promise<boolean> => {
        if (!state.isSupported) return false;
        setState(s => ({ ...s, isLoading: true }));
        try {
            const permission = await Notification.requestPermission();
            setState(s => ({ ...s, permission }));
            if (permission !== 'granted') {
                setState(s => ({ ...s, isLoading: false }));
                return false;
            }

            const clave = await clavePublica();
            if (!clave) throw new Error('No hay clave de push configurada.');

            const registration = await conTope(navigator.serviceWorker.ready, 10_000, 'El service worker no se ha activado');
            const applicationServerKey = urlBase64ToUint8Array(clave);
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
            });

            const json = subscription.toJSON();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('User not authenticated');

            const { error } = await supabase.from('push_subscriptions').upsert({
                user_id: user.id,
                endpoint: json.endpoint!,
                p256dh: json.keys!.p256dh,
                auth: json.keys!.auth,
            }, { onConflict: 'endpoint' });
            if (error) throw error;

            setState(s => ({ ...s, isSubscribed: true, isLoading: false }));
            return true;
        } catch (error) {
            console.error('Push subscription failed:', error);
            setState(s => ({ ...s, isLoading: false }));
            return false;
        }
    }, [state.isSupported]);

    const unsubscribe = useCallback(async (): Promise<boolean> => {
        setState(s => ({ ...s, isLoading: true }));
        try {
            const registration = await conTope(navigator.serviceWorker.ready, 5_000, 'No hay service worker activo');
            const subscription = await registration.pushManager.getSubscription();
            if (subscription) {
                await subscription.unsubscribe();
                await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
            }
            setState(s => ({ ...s, isSubscribed: false, isLoading: false }));
            return true;
        } catch (error) {
            console.error('Push unsubscription failed:', error);
            setState(s => ({ ...s, isLoading: false }));
            return false;
        }
    }, []);

    return { ...state, subscribeToPush, unsubscribe };
}
