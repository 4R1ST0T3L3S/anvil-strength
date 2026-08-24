import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorFallbackProps {
    error: unknown;
    resetErrorBoundary: () => void;
}

const isChunkLoadError = (error: unknown): boolean => {
    if (!(error instanceof Error)) return false;
    return (
        error.message.includes('Failed to fetch dynamically imported module') ||
        error.message.includes('Importing a module script failed') ||
        error.name === 'ChunkLoadError'
    );
};

export function ErrorFallback({ error }: ErrorFallbackProps) {
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    const isChunkError = isChunkLoadError(error);

    // Auto-reload on stale chunk errors (Service Worker cache mismatch)
    useEffect(() => {
        if (isChunkError) {
            // Clear SW caches then reload
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then((registrations) => {
                    Promise.all(registrations.map((r) => r.unregister())).then(() => {
                        window.location.reload();
                    });
                });
            } else {
                window.location.reload();
            }
        }
    }, [isChunkError]);

    // Show brief message while reloading
    if (isChunkError) {
        return (
            <div role="alert" className="min-h-[100dvh] bg-[#0a0a0a] text-ink flex flex-col items-center justify-center p-4">
                <div className="bg-[#0a0a0a] p-8 rounded-xl border border-line max-w-md w-full text-center shadow-2xl">
                    <div className="mx-auto bg-white/5 w-16 h-16 rounded-full flex items-center justify-center mb-6">
                        <RefreshCw className="text-ink h-8 w-8 animate-spin" />
                    </div>
                    <h2 className="text-xl font-black uppercase tracking-tighter mb-2 text-ink">Actualizando...</h2>
                    <p className="text-ink-muted text-sm">Detectamos una nueva versión. Recargando la app.</p>
                </div>
            </div>
        );
    }

    return (
        <div role="alert" className="min-h-[100dvh] bg-[#0a0a0a] text-ink flex flex-col items-center justify-center p-4">
            <div className="bg-[#0a0a0a] p-8 rounded-xl border border-danger/20 max-w-md w-full text-center shadow-2xl">
                <div className="mx-auto bg-danger-quiet w-16 h-16 rounded-full flex items-center justify-center mb-6">
                    <AlertTriangle className="text-brand-text h-8 w-8" />
                </div>

                <h2 className="text-2xl font-black uppercase tracking-tighter mb-2 text-ink">
                    Algo salió mal
                </h2>

                <p className="text-ink-muted mb-6">
                    Ha ocurrido un error inesperado en esta sección.
                </p>

                <pre className="text-xs text-danger-text bg-black/50 p-4 rounded mb-8 overflow-auto text-left">
                    {errorMessage}
                </pre>

                <button
                    onClick={() => window.location.reload()}
                    className="w-full bg-white text-black font-bold uppercase tracking-wider py-4 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
                >
                    <RefreshCw size={20} />
                    Intentar de nuevo
                </button>
            </div>
        </div>
    );
}
