import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

/**
 * Convierte una clave VAPID base64 a Uint8Array
 * Necesario para la API de Push
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
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
        isLoading: true
    });

    useEffect(() => {
        const checkSupport = async () => {
            const supported = 'serviceWorker' in navigator && 'PushManager' in window;

            if (!supported) {
                setState(s => ({ ...s, isSupported: false, isLoading: false }));
                return;
            }

            setState(s => ({ ...s, isSupported: true, permission: Notification.permission }));

            // Verificar si ya hay una suscripción
            try {
                const registration = await navigator.serviceWorker.ready;
                const subscription = await registration.pushManager.getSubscription();
                setState(s => ({
                    ...s,
                    isSubscribed: !!subscription,
                    isLoading: false
                }));
            } catch (e) {
                console.error('Error checking push subscription:', e);
                setState(s => ({ ...s, isLoading: false }));
            }
        };

        checkSupport();
    }, []);

    /**
     * Solicita permiso y suscribe al usuario a push notifications
     * @returns true si la suscripción fue exitosa
     */
    const subscribeToPush = useCallback(async (): Promise<boolean> => {
        if (!state.isSupported || !VAPID_PUBLIC_KEY) {
            console.warn('Push notifications not supported or VAPID key missing');
            return false;
        }

        setState(s => ({ ...s, isLoading: true }));

        try {
            // 1. Pedir permiso de notificaciones
            const permission = await Notification.requestPermission();
            setState(s => ({ ...s, permission }));

            if (permission !== 'granted') {
                setState(s => ({ ...s, isLoading: false }));
                return false;
            }

            /*
             * 2. EL SERVICE WORKER YA ESTÁ, Y ES UNO SOLO.
             *
             * Antes esto registraba `/sw.js` por su cuenta si no encontraba
             * ninguno. El problema es que `vite-plugin-pwa` genera el SUYO —y
             * le inyecta `push-sw.js`, que trae exactamente los mismos
             * manejadores de `push`—, así que había dos service workers
             * compitiendo con dos copias del mismo código. Un aviso llegaba
             * duplicado o no llegaba, según cuál tuviera el control.
             *
             * `navigator.serviceWorker.ready` espera al que hay, sea cual sea,
             * en vez de crear otro. Y si no hay ninguno —porque el navegador
             * no los admite— esa promesa NO RESUELVE NUNCA, así que lleva
             * tope: mejor decir que no se han podido activar que dejar el
             * botón girando para siempre.
             */
            const registration = await Promise.race([
                navigator.serviceWorker.ready,
                new Promise<never>((_, rechazar) =>
                    setTimeout(() => rechazar(new Error('El service worker no se ha activado')), 10_000)
                ),
            ]);

            // 3. Suscribirse a Push Manager
            const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: applicationServerKey.buffer as ArrayBuffer
            });

            // 4. Extraer las claves de la suscripción
            const subscriptionJson = subscription.toJSON();

            // 5. Obtener usuario autenticado
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                throw new Error('User not authenticated');
            }

            // 6. Guardar en Supabase
            const { error } = await supabase.from('push_subscriptions').upsert({
                user_id: user.id,
                endpoint: subscriptionJson.endpoint!,
                p256dh: subscriptionJson.keys!.p256dh,
                auth: subscriptionJson.keys!.auth
            }, {
                onConflict: 'endpoint'
            });

            if (error) throw error;

            setState(s => ({ ...s, isSubscribed: true, isLoading: false }));

            return true;

        } catch (error) {
            console.error('❌ Push subscription failed:', error);
            setState(s => ({ ...s, isLoading: false }));
            return false;
        }
    }, [state.isSupported]);

    /**
     * Cancela la suscripción a push notifications
     */
    const unsubscribe = useCallback(async (): Promise<boolean> => {
        setState(s => ({ ...s, isLoading: true }));

        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();

            if (subscription) {
                // Cancelar suscripción del navegador
                await subscription.unsubscribe();

                // Eliminar de la base de datos
                await supabase
                    .from('push_subscriptions')
                    .delete()
                    .eq('endpoint', subscription.endpoint);
            }

            setState(s => ({ ...s, isSubscribed: false, isLoading: false }));

            return true;

        } catch (error) {
            console.error('❌ Push unsubscription failed:', error);
            setState(s => ({ ...s, isLoading: false }));
            return false;
        }
    }, []);

    return {
        ...state,
        subscribeToPush,
        unsubscribe
    };
}
