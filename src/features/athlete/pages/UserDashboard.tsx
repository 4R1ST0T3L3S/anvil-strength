import { useState } from 'react';
import {
    LayoutDashboard,
    FileText,
    Utensils,
    Calendar,
    Trophy,
    User,
    LogOut,
    ChevronDown // <--- Added ChevronDown
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
    const [currentView, setCurrentView] = useState<AthleteView>('home');
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
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
            menuItems={menuItems}
        >
            {/* PERFIL DE USUARIO FLOTANTE PARA ORDENADOR */}
            <div className="hidden md:block fixed top-6 right-8 z-[100]">
                <div className="relative">
                    <button
                        onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                        className="flex items-center gap-3 bg-[#1c1c1c] border border-white/10 hover:border-anvil-red/50 hover:bg-white/5 p-2 pr-4 rounded-full transition-all shadow-xl group"
                    >
                        <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-anvil-red/50 group-hover:border-anvil-red transition-colors relative bg-gray-800 flex items-center justify-center">
                            {user.avatar_url ? (
                                <img src={user.avatar_url} alt={user.full_name} className="w-full h-full object-cover" />
                            ) : (
                                <User size={20} className="text-gray-400" />
                            )}
                        </div>
                        <div className="flex flex-col items-start">
                            <span className="text-sm font-bold text-white leading-none mb-0.5">{user.full_name}</span>
                            <span className="text-[10px] text-gray-400 uppercase tracking-widest font-medium">Atleta</span>
                        </div>
                        <ChevronDown size={16} className={`text-gray-400 transition-transform ${isProfileMenuOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Dropdown Menu */}
                    {isProfileMenuOpen && (
                        <div className="absolute top-full right-0 mt-2 w-56 bg-[#1c1c1c] border border-white/10 rounded-xl shadow-2xl p-2 animate-in fade-in zoom-in-95 duration-200 origin-top-right">
                            <button
                                onClick={() => {
                                    setCurrentView('profile');
                                    setIsProfileMenuOpen(false);
                                }}
                                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 text-left text-gray-300 hover:text-white transition-colors mb-1"
                            >
                                <div className="bg-blue-500/10 p-2 rounded-lg text-blue-500">
                                    <User size={18} />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold">Mi Perfil</span>
                                    <span className="text-[10px] text-gray-500">Editar datos personales</span>
                                </div>
                            </button>

                            <div className="h-px bg-white/10 my-1 mx-2"></div>

                            <button
                                onClick={onLogout}
                                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-red-500/10 text-left text-gray-300 hover:text-red-500 transition-colors"
                            >
                                <div className="bg-red-500/10 p-2 rounded-lg text-red-500">
                                    <LogOut size={18} />
                                </div>
                                <span className="text-sm font-bold">Cerrar Sesión</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {renderContent()}
        </DashboardLayout>
    );
}