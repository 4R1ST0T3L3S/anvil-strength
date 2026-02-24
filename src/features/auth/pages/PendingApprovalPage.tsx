import { ShieldAlert, LogOut } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useQueryClient } from '@tanstack/react-query';

export function PendingApprovalPage() {
    const queryClient = useQueryClient();

    const handleLogout = async () => {
        await supabase.auth.signOut();
        queryClient.invalidateQueries({ queryKey: ['user'] });
        window.location.href = '/';
    };

    return (
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6 text-white font-sans selection:bg-anvil-red">
            <div className="max-w-md w-full bg-[#151515] border border-white/10 rounded-2xl p-8 sm:p-10 text-center shadow-2xl relative overflow-hidden">
                {/* Background Accent */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-anvil-red/10 via-anvil-red to-anvil-red/10" />

                <div className="flex justify-center mb-8">
                    <div className="w-20 h-20 bg-anvil-red/10 rounded-full flex items-center justify-center border border-anvil-red/20 shadow-[0_0_30px_rgba(220,38,38,0.15)]">
                        <ShieldAlert className="w-10 h-10 text-anvil-red" />
                    </div>
                </div>

                <h1 className="text-3xl font-black uppercase italic tracking-tighter mb-4">
                    Cuenta en <br />
                    <span className="text-anvil-red">Revisión</span>
                </h1>

                <p className="text-gray-400 text-sm leading-relaxed mb-8">
                    Tu cuenta ha sido creada con éxito, pero actualmente se encuentra pendiente de aprobación por parte del equipo de Anvil Strength. Serás notificado cuando tu acceso sea autorizado.
                </p>

                <div className="bg-[#1c1c1c] rounded-xl p-4 border border-white/5 mb-8">
                    <p className="text-xs uppercase tracking-widest font-bold text-gray-500 mb-1">
                        Estado Actual
                    </p>
                    <p className="text-sm font-black text-amber-500 flex items-center justify-center gap-2 uppercase tracking-wide">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                        </span>
                        Pendiente
                    </p>
                </div>

                <button
                    onClick={handleLogout}
                    className="w-full bg-white hover:bg-gray-200 text-black font-black uppercase tracking-wider py-4 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg"
                >
                    <LogOut className="w-5 h-5" />
                    Cerrar Sesión
                </button>
            </div>
        </div>
    );
}
