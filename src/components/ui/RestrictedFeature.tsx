import { Lock } from 'lucide-react';

interface RestrictedFeatureProps {
    title?: string;
    description?: string;
}

export function RestrictedFeature({ 
    title = "Función Premium", 
    description = "Esta sección está restringida porque actualmente no formáis parte de Anvil Strength Club."
}: RestrictedFeatureProps) {
    return (
        <div className="flex flex-col items-center justify-center h-full min-h-[400px] p-6 text-center animate-in fade-in zoom-in-95 duration-500">
            <div className="relative mb-6">
                <div className="absolute inset-0 bg-anvil-red/20 blur-xl rounded-full scale-150"></div>
                <div className="relative bg-gradient-to-b from-[#252525] to-[#1c1c1c] border border-white/10 p-6 rounded-full shadow-2xl">
                    <Lock size={48} className="text-anvil-red" />
                </div>
            </div>
            
            <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight text-white mb-3">
                {title}
            </h2>
            
            <p className="text-gray-400 font-medium max-w-md mx-auto leading-relaxed text-sm md:text-base">
                {description}
            </p>
            
            <a 
                href="https://typebot.co/lead-generation-hhwa24t"
                target="_blank"
                rel="noopener noreferrer" 
                className="mt-8 bg-anvil-red text-white hover:bg-red-600 border border-white/10 px-8 py-3 rounded-xl font-black uppercase tracking-widest text-xs transition-colors shadow-lg shadow-anvil-red/20 inline-flex"
            >
                Afiliarme a Anvil
            </a>
        </div>
    );
}
