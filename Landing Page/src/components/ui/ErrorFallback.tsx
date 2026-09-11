import { useEffect, useState } from 'react';
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

const CLAVE_RECARGAS = 'chunk_reload_count';

const recargasHechas = () => {
    try { return parseInt(sessionStorage.getItem(CLAVE_RECARGAS) || '0', 10); } catch { return 0; }
};

export function ErrorFallback({ error }: ErrorFallbackProps) {
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    const isChunkError = isChunkLoadError(error);

    /**
     * Recarga automática ante un chunk desfasado (caché de Service Worker
     * obsoleta tras un despliegue), pero con tope de 2 reintentos.
     *
     * Sin el tope, un chunk que sigue fallando después de limpiar caché
     * (por ejemplo un fichero que de verdad ya no existe en el servidor)
     * entraba en bucle: recarga -> mismo error -> recarga otra vez, para
     * siempre. El contador vive en `sessionStorage` para sobrevivir a la
     * propia recarga; al tercer intento se rinde y enseña el error normal.
     *
     * Se decide en el primer pintado (no en un efecto) para que la pantalla
     * de «actualizando» no parpadee antes de rendirse.
     */
    const [tooManyRetries] = useState(() => isChunkError && recargasHechas() >= 2);

    useEffect(() => {
        if (!isChunkError) {
            sessionStorage.removeItem(CLAVE_RECARGAS);
            return;
        }
        if (tooManyRetries) {
            sessionStorage.removeItem(CLAVE_RECARGAS);
            return;
        }

        sessionStorage.setItem(CLAVE_RECARGAS, (recargasHechas() + 1).toString());

        if ('caches' in window) {
            caches.keys().then((names) => {
                names.forEach((name) => caches.delete(name));
            });
        }

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then((registrations) => {
                Promise.all(registrations.map((r) => r.unregister())).then(() => {
                    window.location.reload();
                });
            });
        } else {
            window.location.reload();
        }
    }, [isChunkError, tooManyRetries]);

    // Un momento mientras recarga.
    if (isChunkError && !tooManyRetries) {
        return (
            <div role="alert" className="flex min-h-[100dvh] flex-col items-center justify-center bg-surface-canvas p-4 text-ink">
                <div className="w-full max-w-md rounded-card border border-[var(--card-border)] bg-surface-raised p-8 text-center shadow-card">
                    <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-pill bg-[var(--fill-muted)]">
                        <RefreshCw className="h-6 w-6 animate-spin text-ink-muted" aria-hidden="true" />
                    </div>
                    <h2 className="mb-1.5 text-t-lg font-semibold text-ink">Actualizando…</h2>
                    <p className="text-t-sm text-ink-muted">Hay una versión nueva. La app se recarga sola.</p>
                </div>
            </div>
        );
    }

    return (
        <div role="alert" className="flex min-h-[100dvh] flex-col items-center justify-center bg-surface-canvas p-4 text-ink">
            <div className="w-full max-w-md rounded-card border border-[var(--card-border)] bg-surface-raised p-8 text-center shadow-card">
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-pill bg-danger-quiet">
                    <AlertTriangle className="h-6 w-6 text-danger-text" aria-hidden="true" />
                </div>

                <h2 className="mb-1.5 text-t-xl font-semibold tracking-[-0.01em] text-ink">Algo ha fallado</h2>

                <p className="mb-5 text-t-sm text-ink-muted">
                    Ha ocurrido un error inesperado en esta sección.
                </p>

                <pre className="mb-6 max-h-40 overflow-auto rounded-field bg-surface-sunken p-3 text-left font-mono text-t-xs text-danger-text">
                    {errorMessage}
                </pre>

                <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-field bg-ink text-t-sm font-semibold text-surface-canvas transition-opacity duration-fast hover:opacity-90"
                >
                    <RefreshCw size={18} aria-hidden="true" />
                    Intentar de nuevo
                </button>
            </div>
        </div>
    );
}
