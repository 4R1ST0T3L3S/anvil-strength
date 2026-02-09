// Service Worker para Push Notifications - Anvil Strength
// Este archivo debe estar en /public/sw.js

self.addEventListener('push', (event) => {
    if (!event.data) return;

    let data;
    try {
        data = event.data.json();
    } catch (e) {
        data = {
            title: 'Anvil Strength',
            body: event.data.text()
        };
    }

    const options = {
        body: data.body || data.message,
        icon: data.icon || '/pwa-192x192.png',
        badge: data.badge || '/pwa-192x192.png',
        vibrate: [100, 50, 100],
        tag: data.tag || 'anvil-notification',
        renotify: true,
        data: {
            url: data.data?.url || data.link || '/',
            timestamp: Date.now()
        },
        actions: [
            { action: 'open', title: 'Ver', icon: '/pwa-192x192.png' },
            { action: 'close', title: 'Cerrar' }
        ]
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    // Si el usuario hizo clic en "cerrar", no hacer nada más
    if (event.action === 'close') return;

    const urlToOpen = event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // Buscar si ya hay una ventana abierta de la app
                for (const client of clientList) {
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        // Navegar a la URL y enfocar
                        client.navigate(urlToOpen);
                        return client.focus();
                    }
                }
                // Si no hay ventana abierta, abrir una nueva
                return clients.openWindow(urlToOpen);
            })
    );
});

// Manejar cierre de notificación sin clic
self.addEventListener('notificationclose', (event) => {
    console.log('Notification closed:', event.notification.tag);
});
