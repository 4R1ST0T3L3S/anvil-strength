import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorFallbackProps {
    error: unknown;
    resetErrorBoundary: () => void;
}

export function ErrorFallback({ error, resetErrorBoundary }: ErrorFallbackProps) {
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';

    return (
        <div role="alert" className="min-h-screen bg-[#1c1c1c] text-white flex flex-col items-center justify-center p-4">
            <div className="bg-[#252525] p-8 rounded-xl border border-red-500/20 max-w-md w-full text-center shadow-2xl">
                <div className="mx-auto bg-red-500/10 w-16 h-16 rounded-full flex items-center justify-center mb-6">
                    <AlertTriangle className="text-anvil-red h-8 w-8" />
                </div>

                <h2 className="text-2xl font-black uppercase tracking-tighter mb-2 text-white">
                    Algo salió mal
                </h2>

                <p className="text-gray-400 mb-6">
                    Ha ocurrido un error inesperado en esta sección.
                </p>

                <pre className="text-xs text-red-400 bg-black/50 p-4 rounded mb-8 overflow-auto text-left">
                    {errorMessage}
                </pre>

                <button
                    onClick={resetErrorBoundary}
                    className="w-full bg-white text-black font-bold uppercase tracking-wider py-4 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
                >
                    <RefreshCw size={20} />
                    Intentar de nuevo
                </button>
            </div>
        </div>
    );
}
