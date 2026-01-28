```typescript
import React, { useState } from 'react';
import { LogOut, Calendar, Trophy, FileText, Utensils } from 'lucide-react';
import { CalendarModal } from '../components/CalendarModal';

interface UserDashboardProps {
    user: any;
    onLogout: () => void;
}

export function UserDashboard({ user, onLogout }: UserDashboardProps) {
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);

    return (
        <div className="min-h-screen bg-[#1c1c1c] text-white">
            {/* Dashboard Header */}
            <header className="bg-[#252525] border-b border-white/10 py-4 px-6">
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <img
                            src="/logo.svg"
                            alt="Anvil Strength"
                            className="h-8 w-auto opacity-80"
                        />
                        <span className="font-black text-xl tracking-tighter uppercase hidden md:block">Anvil Strength</span>
                    </div>

                    {/* Right Side User Menu */}
                    <div className="flex items-center gap-6">
                        {/* User Profile Info */}
                        <div className="flex items-center gap-3">
                            {user.profile_image ? (
                                <img
                                    src={user.profile_image}
                                    alt={user.nickname}
                                    className="h-10 w-10 rounded-full border-2 border-anvil-red object-cover"
                                />
                            ) : (
                                <div className="h-10 w-10 rounded-full bg-anvil-red flex items-center justify-center font-bold text-white">
                                    {user.nickname?.[0] || user.name?.[0] || 'U'}
                                </div>
                            )}
                            <div className="hidden md:block">
                                <p className="text-sm font-bold text-white uppercase">{user.nickname || user.name}</p>
                                <p className="text-xs text-gray-400">Atleta</p>
                            </div>
                        </div>

                        {/* Logout Button */}
                        <button
                            onClick={onLogout}
                            className="p-2 hover:bg-white/10 rounded-lg transition-colors text-gray-400 hover:text-white"
                            title="Cerrar Sesión"
                        >
                            <LogOut size={20} />
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-6 py-12">
                {/* Welcome Section */}
                <div className="mb-12">
                    <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter mb-2">
                        Hola, <span className="text-anvil-red">{user.nickname || user.name?.split(' ')[0]}</span>
                    </h1>
                    <p className="text-gray-400 text-lg">Bienvenido a tu panel de atleta.</p>
                </div>

                {/* Dashboard Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-8">

                    {/* Card: Competiciones */}
                    <div className="bg-[#252525] p-8 rounded-xl border border-white/5 hover:border-anvil-red/50 transition-all group cursor-pointer">
                        <div className="flex items-start justify-between mb-6">
                            <div className="p-3 bg-anvil-red/10 rounded-lg text-anvil-red group-hover:bg-anvil-red group-hover:text-white transition-colors">
                                <Trophy size={32} />
                            </div>
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest border border-white/10 px-2 py-1 rounded">Próximamente</span>
                        </div>
                        <h3 className="text-2xl font-bold uppercase mb-2">Mis Competiciones</h3>
                        <p className="text-gray-400">Gestiona tus inscripciones y revisa tus resultados históricos.</p>
                    </div>

                    {/* Card: Calendario (Restored) */}
                    <div 
                        className="bg-[#252525] p-8 rounded-xl border border-white/5 hover:border-anvil-red/50 transition-all group cursor-pointer active:scale-[0.98]"
                        onClick={() => setIsCalendarOpen(true)}
                    >
                        <div className="flex items-start justify-between mb-6">
                            <div className="p-3 bg-blue-500/10 rounded-lg text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                                <Calendar size={32} />
                            </div>
                            {/* Removed "Próximamente" badge */}
                        </div>
                        <h3 className="text-2xl font-bold uppercase mb-2">Calendario</h3>
                        <p className="text-gray-400">Consulta las fechas importantes y eventos del club.</p>
                    </div>

                    {/* Card: Planificaciones */}
                    <div className="bg-[#252525] p-8 rounded-xl border border-white/5 hover:border-anvil-red/50 transition-all group cursor-pointer">
                        <div className="flex items-start justify-between mb-6">
                            <div className="p-3 bg-green-500/10 rounded-lg text-green-500 group-hover:bg-green-500 group-hover:text-white transition-colors">
                                <FileText size={32} />
                            </div>
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest border border-white/10 px-2 py-1 rounded">Próximamente</span>
                        </div>
                        <h3 className="text-2xl font-bold uppercase mb-2">Mis Planificaciones</h3>
                        <p className="text-gray-400">Accede a tus rutinas de entrenamiento personalizadas.</p>
                    </div>

                    {/* Card: Dietas */}
                    <div className="bg-[#252525] p-8 rounded-xl border border-white/5 hover:border-anvil-red/50 transition-all group cursor-pointer">
                        <div className="flex items-start justify-between mb-6">
                            <div className="p-3 bg-orange-500/10 rounded-lg text-orange-500 group-hover:bg-orange-500 group-hover:text-white transition-colors">
                                <Utensils size={32} />
                            </div>
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest border border-white/10 px-2 py-1 rounded">Próximamente</span>
                        </div>
                        <h3 className="text-2xl font-bold uppercase mb-2">Nutrición</h3>
                        <p className="text-gray-400">Visualiza tus planes nutricionales y recomendaciones.</p>
                    </div>

                </div>
            </main>

            <CalendarModal 
                isOpen={isCalendarOpen} 
                onClose={() => setIsCalendarOpen(false)} 
            />
        </div>
    );
}
```
