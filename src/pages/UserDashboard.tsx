import React, { useState } from 'react';
import {
    LayoutDashboard,
    FileText,
    Utensils,
    Calendar,
    Trophy,
    LogOut,
    User
} from 'lucide-react';
import { CalendarModal } from '../components/CalendarModal';

interface UserDashboardProps {
    user: any;
    onLogout: () => void;
    onOpenSettings: () => void;
    onGoToHome: () => void; // Keeps the prop for consistency if needed, but sidebar handles nav
}

type AthleteView = 'home' | 'planning' | 'nutrition' | 'competitions';

export function UserDashboard({ user, onLogout, onOpenSettings }: UserDashboardProps) {
    const [currentView, setCurrentView] = useState<AthleteView>('home');
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);

    const renderContent = () => {
        switch (currentView) {
            case 'home':
                return (
                    <div className="p-8">
                        <header className="mb-8">
                            <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter mb-2">
                                Hola, <span className="text-anvil-red">{user.name?.split(' ')[0] || 'Atleta'}</span>
                            </h1>
                            {user.nickname && (
                                <p className="text-gray-400 font-bold tracking-widest text-sm uppercase mb-2">
                                    Alias <span className="text-white">{user.nickname}</span>
                                </p>
                            )}
                            <p className="text-gray-400 text-lg">Bienvenido a tu panel de atleta.</p>
                        </header>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-8">
                            {/* Card: Planificaciones */}
                            <div
                                onClick={() => setCurrentView('planning')}
                                className="bg-[#252525] p-8 rounded-xl border border-white/5 hover:border-anvil-red/50 transition-all group cursor-pointer"
                            >
                                <div className="flex items-start justify-between mb-6">
                                    <div className="p-3 bg-green-500/10 rounded-lg text-green-500 group-hover:bg-green-500 group-hover:text-white transition-colors">
                                        <FileText size={32} />
                                    </div>
                                </div>
                                <h3 className="text-2xl font-bold uppercase mb-2">Mi Planificación</h3>
                                <p className="text-gray-400">Accede a tus rutinas de entrenamiento.</p>
                            </div>

                            {/* Card: Competiciones */}
                            <div
                                onClick={() => setCurrentView('competitions')}
                                className="bg-[#252525] p-8 rounded-xl border border-white/5 hover:border-anvil-red/50 transition-all group cursor-pointer"
                            >
                                <div className="flex items-start justify-between mb-6">
                                    <div className="p-3 bg-anvil-red/10 rounded-lg text-anvil-red group-hover:bg-anvil-red group-hover:text-white transition-colors">
                                        <Trophy size={32} />
                                    </div>
                                </div>
                                <h3 className="text-2xl font-bold uppercase mb-2">Mis Competiciones</h3>
                                <p className="text-gray-400">Gestiona tus inscripciones.</p>
                            </div>

                            {/* Card: Nutrición */}
                            <div
                                onClick={() => setCurrentView('nutrition')}
                                className="bg-[#252525] p-8 rounded-xl border border-white/5 hover:border-anvil-red/50 transition-all group cursor-pointer"
                            >
                                <div className="flex items-start justify-between mb-6">
                                    <div className="p-3 bg-orange-500/10 rounded-lg text-orange-500 group-hover:bg-orange-500 group-hover:text-white transition-colors">
                                        <Utensils size={32} />
                                    </div>
                                </div>
                                <h3 className="text-2xl font-bold uppercase mb-2">Mi Nutrición</h3>
                                <p className="text-gray-400">Visualiza tu plan nutricional.</p>
                            </div>

                            {/* Card: Calendario */}
                            <div
                                className="bg-[#252525] p-8 rounded-xl border border-white/5 hover:border-anvil-red/50 transition-all group cursor-pointer active:scale-[0.98]"
                                onClick={() => setIsCalendarOpen(true)}
                            >
                                <div className="flex items-start justify-between mb-6">
                                    <div className="p-3 bg-blue-500/10 rounded-lg text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                                        <Calendar size={32} />
                                    </div>
                                </div>
                                <h3 className="text-2xl font-bold uppercase mb-2">Calendario</h3>
                                <p className="text-gray-400">Eventos AEP y del club.</p>
                            </div>
                        </div>
                    </div>
                );
            case 'planning':
                return <div className="p-8 text-gray-500">Vista de Planificación (Próximamente)</div>;
            case 'nutrition':
                return <div className="p-8 text-gray-500">Vista de Nutrición (Próximamente)</div>;
            case 'competitions':
                return <div className="p-8 text-gray-500">Vista de Competiciones (Próximamente)</div>;
            default:
                return null;
        }
    };

    return (
        <div className="flex h-screen bg-[#1c1c1c] text-white overflow-hidden font-sans">
            {/* Sidebar */}
            <aside className="w-64 bg-[#252525] flex flex-col border-r border-white/5 hidden md:flex">
                <div className="p-6 border-b border-white/5">
                    <div className="flex items-center gap-3">
                        <img src="/logo.svg" alt="Anvil" className="h-8 w-auto" />
                        <span className="font-black text-xl tracking-tighter uppercase">Athlete</span>
                    </div>
                </div>

                <nav className="flex-1 p-4 space-y-2">
                    <button
                        onClick={() => setCurrentView('home')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${currentView === 'home' ? 'bg-anvil-red text-white font-bold' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
                    >
                        <LayoutDashboard size={20} />
                        Home
                    </button>
                    <button
                        onClick={() => setCurrentView('planning')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${currentView === 'planning' ? 'bg-anvil-red text-white font-bold' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
                    >
                        <FileText size={20} />
                        Mi Planificación
                    </button>
                    <button
                        onClick={() => setCurrentView('nutrition')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${currentView === 'nutrition' ? 'bg-anvil-red text-white font-bold' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
                    >
                        <Utensils size={20} />
                        Mi Nutrición
                    </button>
                    <button
                        onClick={() => setCurrentView('competitions')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${currentView === 'competitions' ? 'bg-anvil-red text-white font-bold' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
                    >
                        <Trophy size={20} />
                        Mis Competiciones
                    </button>
                    <a
                        href="https://www.powerlifting-aep.es/calendario/"
                        target="_blank"
                        rel="noreferrer"
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-gray-400 hover:bg-white/5 hover:text-white transition-all"
                    >
                        <Calendar size={20} />
                        Calendario AEP
                    </a>
                </nav>

                <div className="p-4 border-t border-white/5">
                    <div
                        className="flex items-center gap-3 px-4 py-3 mb-2 cursor-pointer hover:bg-white/5 rounded-lg transition-colors"
                        onClick={onOpenSettings}
                    >
                        {user.profile_image ? (
                            <img src={user.profile_image} alt="" className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                            <div className="w-8 h-8 rounded-full bg-anvil-red flex items-center justify-center text-xs font-bold">
                                {user.nickname?.[0] || 'A'}
                            </div>
                        )}
                        <div className="overflow-hidden">
                            <p className="text-sm font-bold truncate">{user.nickname || user.name}</p>
                            <p className="text-xs text-gray-500 truncate">Editar Perfil</p>
                        </div>
                    </div>
                    <button
                        onClick={onLogout}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                    >
                        <LogOut size={16} />
                        Cerrar Sesión
                    </button>
                </div>
            </aside>

            {/* Mobile Header (Only visible on mobile) */}
            <div className="md:hidden">
                {/* Mobile menu implementation would go here, simplified for now to just show content */}
            </div>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto bg-[#1c1c1c] w-full">
                {renderContent()}
            </main>

            <CalendarModal
                isOpen={isCalendarOpen}
                onClose={() => setIsCalendarOpen(false)}
            />
        </div>
    );
}
