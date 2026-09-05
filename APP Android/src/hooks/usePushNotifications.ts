/**
 * AVISOS PUSH — DOS CANALES, UNA SOLA INTERFAZ
 *
 * En el navegador: Web Push (VAPID + PushManager + service worker).
 * En el APK: Firebase Cloud Messaging a través del plugin nativo. En el
 * WebView de Capacitor `PushManager` NO EXISTE, así que la versión anterior
 * —solo Web Push— daba `isSupported: false` en el móvil y el botón de la
 * campana no hacía nada.
 *
 * La campana (`NotificationBell`) no sabe cuál de los dos hay debajo.
 */

import { useState, useEffect, useCallback } from 'react';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '../lib/supabase';
import { pushNativoActivado } from '../lib/plataforma';
import { borrarTokenPushNativo, guardarTokenPushNativo, tokenPushLocal } from '../services/pushTokensService';

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

/** El plugin habla en su propio vocabulario; la interfaz, en el del navegador. */
function permisoNativo(receive: string): NotificationPermission {
    if (receive === 'granted') return 'granted';
    if (receive === 'denied') return 'denied';
    return 'default';
}

/**
 * Pide el token a Firebase. El plugin no lo devuelve: lo entrega en el evento
 * `registration`, así que se espera a ese evento con un tope de 15 s (sin red
 * no llega nunca, y un botón girando para siempre es peor que un "no se pudo").
 */
function registrarEnFcm(): Promise<string | null> {
    return new Promise((resolve) => {
        const oyentes: Promise<PluginListenerHandle>[] = [];
        let cerrado = false;

        const terminar = (token: string | null) => {
            if (cerrado) return;
            cerrado = true;
            clearTimeout(tope);
            for (const o of oyentes) o.then((l) => l.remove()).catch(() => { /* ya quitado */ });
            resolve(token);
        };

        const tope = setTimeout(() => terminar(null), 15_000);
        oyentes.push(PushNotifications.addListener('registration', ({ value }) => terminar(value)));
        oyentes.push(PushNotifications.addListener('registrationError', (e) => {
            console.warn('FCM no pudo registrar el dispositivo:', e);
            terminar(null);
        }));
        PushNotifications.register().catch((err) => {
            console.warn('PushNotifications.register() falló:', err);
            terminar(null);
        });
    });
}

export function usePushNotifications() {
    const nativo = Capacitor.isNativePlatform();

    // En el APK sin Firebase configurado no hay nada que consultar: se sabe
    // desde el primer render, sin pasar por "cargando".
    const sinPushNativo = nativo && !pushNativoActivado();

    const [state, setState] = useState<PushNotificationState>(() => ({
        isSupported: false,
        isSubscribed: false,
        permission: 'default',
        isLoading: !sinPushNativo,
    }));

    useEffect(() => {
        if (nativo) {
            if (sinPushNativo) return;
            PushNotifications.checkPermissions()
                .then((p) => setState({
                    isSupported: true,
                    isSubscribed: p.receive === 'granted' && !!tokenPushLocal(),
                    permission: permisoNativo(p.receive),
                    isLoading: false,
                }))
                .catch(() => setState(s => ({ ...s, isSupported: false, isLoading: false })));
            return;
        }

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
    }, [nativo, sinPushNativo]);

    /**
     * Solicita permiso y suscribe al usuario a push notifications
     * @returns true si la suscripción fue exitosa
     */
    const subscribeToPush = useCallback(async (): Promise<boolean> => {
        if (nativo) {
            if (!pushNativoActivado()) return false;
            setState(s => ({ ...s, isLoading: true }));
            try {
                const permiso = await PushNotifications.requestPermissions();
                setState(s => ({ ...s, permission: permisoNativo(permiso.receive) }));
                if (permiso.receive !== 'granted') {
                    setState(s => ({ ...s, isLoading: false }));
                    return false;
                }
                const token = await registrarEnFcm();
                const ok = token ? await guardarTokenPushNativo(token) : false;
                setState(s => ({ ...s, isSubscribed: ok, isLoading: false }));
                return ok;
            } catch (error) {
                console.error('❌ Push nativo: no se pudo activar:', error);
                setState(s => ({ ...s, isLoading: false }));
                return false;
            }
        }

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
    }, [nativo, state.isSupported]);

    /**
     * Cancela la suscripción a push notifications
     */
    const unsubscribe = useCallback(async (): Promise<boolean> => {
        setState(s => ({ ...s, isLoading: true }));

        if (nativo) {
            try {
                await borrarTokenPushNativo();
                await PushNotifications.unregister().catch(() => { /* ya sin registro */ });
                setState(s => ({ ...s, isSubscribed: false, isLoading: false }));
                return true;
            } catch (error) {
                console.error('❌ Push nativo: no se pudo desactivar:', error);
                setState(s => ({ ...s, isLoading: false }));
                return false;
            }
        }

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
    }, [nativo]);

    return {
        ...state,
        subscribeToPush,
        unsubscribe
    };
}
