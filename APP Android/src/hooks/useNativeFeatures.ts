/**
 * LO QUE SOLO EXISTE DENTRO DEL APK
 *
 *   1. El botón atrás del sistema.
 *   2. Limpiar los avisos ya entregados al volver a primer plano.
 *   3. Las URLs con las que Android abre la app desde fuera: la vuelta del
 *      login con Google (esquema propio) y los App Links de la web.
 *   4. El permiso de notificaciones y el registro en Firebase.
 *
 * TODOS LOS OYENTES SE REGISTRAN UNA VEZ. La versión anterior dependía de
 * `[navigate, location]`, así que en cada cambio de pantalla se registraba un
 * `backButton` nuevo y se pedía quitar el viejo... de forma asíncrona. Había
 * una ventana en la que un toque atrás disparaba dos `navigate(-1)`. Ahora
 * `navigate` y la ruta actual viven en refs: los oyentes leen lo último sin
 * tener que volver a registrarse.
 */

import { useEffect, useRef } from 'react';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';
import { SplashScreen } from '@capacitor/splash-screen';
import { useNavigate, useLocation, type NavigateFunction } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { AUTH_CALLBACK_PATH, esUrlDeCallback } from '../lib/authRedirect';
import { URL_WEB, pushNativoActivado } from '../lib/plataforma';
import { guardarTokenPushNativo } from '../services/pushTokensService';

/** Pantallas desde las que el botón atrás minimiza la app en vez de "volver". */
const RUTAS_RAIZ = new Set(['/', '/login', '/registro', '/dashboard', '/coach-dashboard', '/nutrition', '/pending']);

export function useNativeFeatures(isReady: boolean = false) {
    const navigate = useNavigate();
    const location = useLocation();

    const navigateRef = useRef<NavigateFunction>(navigate);
    const rutaRef = useRef(location.pathname);
    // Se actualizan en un efecto y no durante el render: los oyentes solo
    // los leen cuando salta el evento, así que llegan a tiempo igual.
    useEffect(() => {
        navigateRef.current = navigate;
        rutaRef.current = location.pathname;
    });

    // La pantalla de arranque se quita cuando hay datos, no cuando hay JS:
    // `launchAutoHide: false` en capacitor.config.ts.
    useEffect(() => {
        if (isReady && Capacitor.isNativePlatform()) {
            void SplashScreen.hide();
        }
    }, [isReady]);

    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;

        let vivo = true;
        const oyentes: Promise<PluginListenerHandle>[] = [];

        // --- 1. BOTÓN ATRÁS -------------------------------------------------
        oyentes.push(CapacitorApp.addListener('backButton', () => {
            if (!vivo) return;
            const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
            if (idx > 0) {
                navigateRef.current(-1);
                return;
            }
            if (RUTAS_RAIZ.has(rutaRef.current)) {
                void CapacitorApp.minimizeApp();
                return;
            }
            // Sin historial y fuera de una raíz (p. ej. la app abierta
            // directamente en un enlace): al inicio, que ya sabe repartir.
            navigateRef.current('/', { replace: true });
        }));

        // --- 2. VUELTA A PRIMER PLANO --------------------------------------
        oyentes.push(CapacitorApp.addListener('appStateChange', ({ isActive }) => {
            if (!vivo || !isActive) return;
            PushNotifications.removeAllDeliveredNotifications().catch(() => {
                /* sin Firebase no hay bandeja que limpiar */
            });
        }));

        // --- 3. URLs ENTRANTES ---------------------------------------------
        // `appUrlOpen` avisa con la app ya abierta; `getLaunchUrl` cubre el
        // arranque en frío, donde el evento puede dispararse antes de que este
        // oyente exista. Las dos pueden traer la misma URL: se despacha una vez.
        let ultimaUrl: string | null = null;

        const gestionarUrl = async (url: string) => {
            if (url === ultimaUrl) return;
            ultimaUrl = url;

            let parsed: URL;
            try {
                parsed = new URL(url);
            } catch {
                return;
            }

            if (esUrlDeCallback(url)) {
                // La pestaña del navegador que abrió `AuthScreen` ya ha
                // cumplido; si sigue delante, la app no se ve.
                await Browser.close().catch(() => { /* ya cerrada */ });

                const fragmento = new URLSearchParams(parsed.hash.replace(/^#/, ''));
                const code = parsed.searchParams.get('code');
                const access_token = fragmento.get('access_token');
                const refresh_token = fragmento.get('refresh_token');
                const fallo = fragmento.get('error_description') ?? parsed.searchParams.get('error_description');

                try {
                    if (code) {
                        // Flujo PKCE: el verificador quedó en localStorage al
                        // salir, y este es el mismo WebView, así que lo encuentra.
                        const { error } = await supabase.auth.exchangeCodeForSession(code);
                        if (error) throw error;
                    } else if (access_token && refresh_token) {
                        // Flujo implícito: los tokens vienen en el fragmento.
                        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
                        if (error) throw error;
                    } else {
                        console.warn('Vuelta de autenticación sin sesión:', fallo ?? url);
                        if (vivo) navigateRef.current('/', { replace: true });
                        return;
                    }
                } catch (err) {
                    console.error('No se pudo recoger la sesión del enlace de vuelta:', err);
                    if (vivo) navigateRef.current('/', { replace: true });
                    return;
                }

                // `AuthCallback` espera a que el perfil cargue y manda a cada
                // rol a su panel. Mismo aterrizaje que en la web.
                if (vivo) navigateRef.current(AUTH_CALLBACK_PATH, { replace: true });
                return;
            }

            // App Link de la web (invitación, reclamar un perfil...): la misma
            // ruta, pero dentro de la app.
            if (parsed.origin === URL_WEB && vivo) {
                navigateRef.current(`${parsed.pathname}${parsed.search}${parsed.hash}`);
            }
        };

        oyentes.push(CapacitorApp.addListener('appUrlOpen', ({ url }) => {
            if (vivo) void gestionarUrl(url);
        }));
        CapacitorApp.getLaunchUrl()
            .then((r) => { if (vivo && r?.url) void gestionarUrl(r.url); })
            .catch(() => { /* sin URL de arranque */ });

        // --- 4. NOTIFICACIONES ---------------------------------------------
        const iniciarNotificaciones = async () => {
            try {
                await LocalNotifications.requestPermissions();
            } catch (err) {
                console.warn('Notificaciones locales no disponibles:', err);
            }

            // Sin google-services.json, `register()` falla. No se intenta hasta
            // que el interruptor esté encendido (ver docs/ANDROID.md).
            if (!pushNativoActivado()) return;

            try {
                await PushNotifications.addListener('registration', ({ value }) => {
                    void guardarTokenPushNativo(value);
                });
                await PushNotifications.addListener('registrationError', (e) => {
                    console.warn('FCM no pudo registrar el dispositivo:', e);
                });
                await PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
                    // El enlace lo escribe la función de borde y ya viene
                    // validado como ruta interna; aquí se comprueba igual.
                    const link = (notification.data as { link?: unknown } | undefined)?.link;
                    if (vivo && typeof link === 'string' && link.startsWith('/') && !link.startsWith('//')) {
                        navigateRef.current(link);
                    }
                });

                // Si el permiso ya se dio (desde la campana, en otra sesión),
                // se vuelve a registrar: FCM rota los tokens y el servidor
                // tiene que tener el último.
                const estado = await PushNotifications.checkPermissions();
                if (estado.receive === 'granted') await PushNotifications.register();
            } catch (err) {
                console.warn('Push nativo no disponible:', err);
            }
        };
        void iniciarNotificaciones();

        return () => {
            vivo = false;
            for (const o of oyentes) o.then((l) => l.remove()).catch(() => { /* ya quitado */ });
            if (pushNativoActivado()) void PushNotifications.removeAllListeners();
        };
    }, []);
}
