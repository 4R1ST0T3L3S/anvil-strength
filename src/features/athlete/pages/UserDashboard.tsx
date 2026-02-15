import { useState } from 'react';
import { useNavigate } from 'react-router-dom'; // <--- 1. IMPORTANTE
import {
    LayoutDashboard,
    FileText,
    Utensils,
    Calendar,
    Trophy,
    User,
    Swords,
    LogOut // <--- Importamos LogOut
} from 'lucide-react';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';

import { WorkoutLogger } from '../../training/components/WorkoutLogger';
import { CalendarSection } from '../../coach/components/CalendarSection';
import { ProfileSection } from '../../profile/components/ProfileSection';
import { AthleteHome } from '../components/AthleteHome';
import { AthleteNutritionView } from '../components/AthleteNutritionView';
import { AthleteCompetitionsView } from '../components/AthleteCompetitionsView';
// NOTA: Ya no importamos ArenaView aquí, porque es una página externa

import { UserProfile, useUser } from '../../../hooks/useUser';

interface UserDashboardProps {
    user: UserProfile;
    onLogout: () => void;
}

// Eliminamos 'arena' de los tipos de vista interna
type AthleteView = 'home' | 'planning' | 'nutrition' | 'competitions' | 'calendar' | 'profile';

export function UserDashboard({ user, onLogout }: UserDashboardProps) {
    const navigate = useNavigate(); // <--- 2. Inicializamos el hook
    const [currentView, setCurrentView] = useState<AthleteView>('home');
    const { refetch } = useUser();

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
            icon: <Swords size={20} />,
            label: 'La Arena',
            // 3. CAMBIO CRÍTICO: No usamos setCurrentView, navegamos a la URL
            onClick: () => navigate('/dashboard/arena'),
            isActive: false // Siempre false porque nos vamos de esta pantalla
        },
        {
            icon: <Calendar size={20} />,
            label: 'Calendario AEP',
            onClick: () => setCurrentView('calendar'),
            isActive: currentView === 'calendar'
        },
        {
            icon: <User size={20} />,
            label: 'Mi Perfil',
            onClick: () => setCurrentView('profile'),
            isActive: currentView === 'profile'
        },
        // Botón Salir para Móvil
        {
            icon: <LogOut size={20} className="text-red-500" />,
            label: 'Salir',
            onClick: onLogout,
            isActive: false
        }
    ];

    const renderContent = () => {
        switch (currentView) {
            case 'home':
                // Nota: Asegúrate de que AthleteHome también use navigate() si tiene un botón para la arena
                return <AthleteHome user={user} onNavigate={(view) => setCurrentView(view as AthleteView)} />;
            case 'planning':
                return <WorkoutLogger athleteId={user.id} />;
            case 'nutrition':
                return <AthleteNutritionView user={user} />;
            case 'competitions':
                return <AthleteCompetitionsView user={user} />;
            case 'calendar':
                return (
                    <div className="p-4 md:p-8">
                        <CalendarSection />
                    </div>
                );
            case 'profile':
                return <ProfileSection user={user} onUpdate={() => refetch()} />;
            default:
                return null;
        }
    };

    return (
        <DashboardLayout
            user={user}
            onLogout={onLogout}
            onOpenSettings={() => setCurrentView('profile')}
            menuItems={menuItems}
            roleLabel="Athlete"
            hideMobileHeader={false}
            hideSidebarOnDesktop={false}
        >
            {/* BOTÓN FLOTANTE PARA ORDENADOR */}
            <div className="hidden md:block fixed top-6 right-8 z-[100]">
                <button
                    onClick={onLogout}
                    className="flex items-center gap-2 bg-[#1c1c1c] border border-white/10 hover:border-red-500/50 hover:text-red-500 text-gray-400 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-xl"
                >
                    <LogOut size={16} />
                    Cerrar Sesión
                </button>
            </div>

            {renderContent()}
        </DashboardLayout>
    );
}