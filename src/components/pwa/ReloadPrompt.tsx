import { useRegisterSW } from 'virtual:pwa-register/react';
import { useEffect } from 'react';
import { toast } from 'sonner';

export function ReloadPrompt() {
    const {
        needRefresh: [needRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        onRegistered(r) {
            console.log('SW Registered: ' + r);
        },
        onRegisterError(error) {
            console.log('SW registration error', error);
        },
    });

    useEffect(() => {
        if (needRefresh) {
            toast.message('🚀 Nueva actualización disponible', {
                description: 'La aplicación se ha actualizado. Recarga para ver los cambios.',
                action: {
                    label: 'Actualizar',
                    onClick: () => updateServiceWorker(true),
                },
                duration: Infinity, // Persistent until clicked
            });
        }
    }, [needRefresh, updateServiceWorker]);

    return null; // No UI needed, handled by Sonner
}
