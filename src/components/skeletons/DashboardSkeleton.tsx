import { AnvilMascot } from "../ui/AnvilMascot";

export function DashboardSkeleton() {
    return (
        <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center gap-6 p-4">
            <AnvilMascot className="w-48 h-48" />
            <div className="flex flex-col items-center gap-2">
                <p className="text-xl sm:text-2xl font-black italic uppercase tracking-tighter text-white animate-pulse">
                    Cargando tus gains...
                </p>
                {/* Loader bar cosmetic */}
                <div className="h-1 w-32 bg-gray-800 rounded-full overflow-hidden relative">
                    <div className="absolute top-0 left-0 h-full w-1/2 bg-anvil-red animate-[shimmer_1.5s_infinite_linear]" />
                    <style>{`
                        @keyframes shimmer {
                            0% { transform: translateX(-100%); }
                            100% { transform: translateX(200%); }
                        }
                     `}</style>
                </div>
            </div>
        </div>
    );
}
