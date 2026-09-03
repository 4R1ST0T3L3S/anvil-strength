/* Manejadores de Web Push — importado por el service worker generado (workbox importScripts) */

self.addEventListener('push', (event) => {
    let data = { title: 'Anvil Strength', message: '', link: '/' };
    try {
        if (event.data) data = { ...data, ...event.data.json() };
    } catch {
        if (event.data) data.message = event.data.text();
    }

    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.message,
            icon: '/pwa-192x192.png',
            badge: '/pwa-192x192.png',
            data: { link: data.link || '/' },
            vibrate: [200, 100, 200],
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const link = event.notification.data?.link || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // Si la app ya está abierta, enfocarla y navegar
            for (const client of windowClients) {
                if ('focus' in client) {
                    client.focus();
                    if ('navigate' in client) client.navigate(link);
                    return;
                }
            }
            return clients.openWindow(link);
        })
    );
});
