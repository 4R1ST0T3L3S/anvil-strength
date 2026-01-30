import { Loader } from 'lucide-react';

export function LoadingSpinner({
    message = 'Cargando...',
    fullscreen = false
}: {
    message?: string;
    fullscreen?: boolean;
}) {
    const content = (
        <div className="flex flex-col items-center gap-4">
            <Loader className="animate-spin text-anvil-red" size={48} />
            <p className="text-gray-400 font-bold tracking-widest uppercase text-sm animate-pulse">
                {message}
            </p>
        </div>
    );

    if (fullscreen) {
        return (
            <div className="min-h-screen bg-[#1c1c1c] flex items-center justify-center">
                {content}
            </div>
        );
    }

    return <div className="flex items-center justify-center p-8">{content}</div>;
}
