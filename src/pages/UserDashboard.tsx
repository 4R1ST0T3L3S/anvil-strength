import React, { useState } from 'react';
import {
    LayoutDashboard,
    FileText,
    Utensils,
    Calendar,
    Trophy
} from 'lucide-react';
import { CalendarModal } from '../components/CalendarModal';
import { DashboardLayout } from '../components/layout/DashboardLayout';

interface UserDashboardProps {
    user: any;
    onLogout: () => void;
    onOpenSettings: () => void;
    onGoToHome: () => void;
}

type AthleteView = 'home' | 'planning' | 'nutrition' | 'competitions';

export function UserDashboard({ user, onLogout, onOpenSettings }: UserDashboardProps) {
    const [currentView, setCurrentView] = useState<AthleteView>('home');
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);

    // Security Check
    if (user?.role === 'coach') {
        return (
            <div className="flex h-screen items-center justify-center bg-[#1c1c1c] text-white">
                <div className="text-center">
                    <h1 className="text-2xl font-bold text-anvil-red mb-2">Acceso Denegado</h1>
                    <p className="text-gray-400">Esta cuenta de entrenador no tiene acceso al panel de atleta.</p>
                </div>
            </div>
        );
    }

    const menuItems = [
        {
            icon: <LayoutDashboard size={20} />,
            label: 'Home',
            onClick: () => setCurrentView('home'),
            isActive: currentView === 'home'
        },
        {
            icon: <FileText size={20} />,
            label: 'Mi Planificación',
            onClick: () => setCurrentView('planning'),
            isActive: currentView === 'planning'
        },
        {
            icon: <Utensils size={20} />,
            label: 'Mi Nutrición',
            onClick: () => setCurrentView('nutrition'),
            isActive: currentView === 'nutrition'
        },
        {
            icon: <Trophy size={20} />,
            label: 'Mis Competiciones',
            onClick: () => setCurrentView('competitions'),
            isActive: currentView === 'competitions'
        },
        {
            icon: <Calendar size={20} />,
            label: 'Calendario AEP',
            onClick: () => { }, // External link handled by isExternal
            isActive: false,
            isExternal: true,
            href: 'https://www.powerlifting-aep.es/calendario/'
        }
    ];

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
        <DashboardLayout
            user={user}
            onLogout={onLogout}
            onOpenSettings={onOpenSettings}
            menuItems={menuItems}
            roleLabel="Athlete"
        >
            <div className="h-full overflow-y-auto">
                {renderContent()}
            </div>

            <CalendarModal
                isOpen={isCalendarOpen}
                onClose={() => setIsCalendarOpen(false)}
            />
        </DashboardLayout>
    );
}
