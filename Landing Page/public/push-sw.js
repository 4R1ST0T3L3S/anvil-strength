/* Manejadores de Web Push — importado por el service worker generado (workbox importScripts).
 *
 * Qué hace con cada aviso:
 *   1. Si trae `ack` (un mensaje de chat), confirma la ENTREGA llamando a
 *      `chat-ack` con el testigo: el remitente ve ✓✓ aunque esta app esté
 *      cerrada. Es lo que significa «entregado».
 *   2. Si la app está abierta y a la vista, NO enseña nada: la app ya avisa.
 *   3. Si no, enseña la notificación. `tag` agrupa las de la misma
 *      conversación para no apilar diez avisos de la misma persona.
 */

self.addEventListener('push', (event) => {
    let data = { title: 'Anvil Strength', message: '', link: '/', tag: undefined, ack: undefined };
    try {
        if (event.data) data = { ...data, ...event.data.json() };
    } catch {
        if (event.data) data.message = event.data.text();
    }

    const confirmar = data.ack && data.ack.url && data.ack.id && data.ack.token
        ? fetch(data.ack.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: data.ack.id, token: data.ack.token }),
        }).catch(() => { /* sin red: se confirmará al abrir la app */ })
        : Promise.resolve();

    const mostrar = self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
        const aLaVista = ventanas.some((c) => c.visibilityState === 'visible' && c.focused);
        if (aLaVista && data.tag && String(data.tag).startsWith('chat-')) return;
        return self.registration.showNotification(data.title, {
            body: data.message,
            icon: '/pwa-192x192.png',
            badge: '/pwa-192x192.png',
            tag: data.tag || undefined,
            renotify: !!data.tag,
            data: { link: data.link || '/' },
            vibrate: [120, 60, 120],
        });
    });

    event.waitUntil(Promise.all([confirmar, mostrar]));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const link = (event.notification.data && event.notification.data.link) || '/';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
            for (const client of ventanas) {
                if ('focus' in client) {
                    client.focus();
                    if ('navigate' in client) client.navigate(link);
                    return;
                }
            }
            return self.clients.openWindow(link);
        })
    );
});
