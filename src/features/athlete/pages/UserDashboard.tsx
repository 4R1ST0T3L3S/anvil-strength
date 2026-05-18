import { useState, useEffect } from 'react';
import {
    LayoutDashboard,
    FileText,
    Utensils,
    Calendar,
    Trophy,
    User,
    Globe,
    LogOut,
    ShoppingBag
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import { WelcomeTourModal } from '../../onboarding/components/WelcomeTourModal';

import { WorkoutLogger } from '../../training/components/WorkoutLogger';
import { CalendarSection } from '../../coach/components/CalendarSection';
import { ProfileSection } from '../../profile/components/ProfileSection';
import { AnvilStore } from '../../profile/components/AnvilStore';
import { AthleteHome } from '../components/AthleteHome';
import { AthleteNutritionView } from '../components/AthleteNutritionView';
import { AthleteCompetitionsView } from '../components/AthleteCompetitionsView';
import { RestrictedFeature } from '../../../components/ui/RestrictedFeature';
import { AnvilRanking } from '../components/AnvilRanking';

import { UserProfile, useUser } from '../../../hooks/useUser';

interface UserDashboardProps {
    user: UserProfile;
    onLogout: () => void;
}

// Eliminamos 'arena' de los tipos de vista interna
type AthleteView = 'home' | 'planning' | 'nutrition' | 'competitions' | 'calendar' | 'ranking' | 'profile' | 'store';

export function UserDashboard({ user, onLogout: _onLogout }: UserDashboardProps) {
    const navigate = useNavigate();
    const [currentView, setCurrentView] = useState<AthleteView>('home');
    const [isWelcomeModalOpen, setIsWelcomeModalOpen] = useState(false);
    const { refetch } = useUser();

    useEffect(() => {
        const hasSeenTour = localStorage.getItem(`has_seen_tour_${user.id}`);
        if (!hasSeenTour) {
            setIsWelcomeModalOpen(true);
            localStorage.setItem(`has_seen_tour_${user.id}`, 'true');
        }
    }, [user.id]);

    // Security Check
    if (user?.role === 'coach' && user?.has_access) {
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
        },
        {
            icon: <ShoppingBag size={20} />,
            label: 'Tienda Anvil',
            onClick: () => setCurrentView('store'),
            isActive: currentView === 'store'
        },
        {
            icon: <Globe size={20} className="text-blue-400" />,
            label: 'Ver Web',
            onClick: () => navigate('/web'),
            isActive: false
        },
        {
            icon: <LogOut size={20} className="text-red-500" />,
            label: 'Salir',
            onClick: () => _onLogout(),
            isActive: false
        }
    ];

    const renderContent = () => {
        switch (currentView) {
            case 'home':
                // Nota: Asegúrate de que AthleteHome también use navigate() si tiene un botón para la arena
                return <AthleteHome user={user} onNavigate={(view) => setCurrentView(view as AthleteView)} />;
            case 'planning':
                if (user.has_access === false) return <RestrictedFeature title="Planificación Premium" />;
                return <WorkoutLogger athleteId={user.id} />;
            case 'nutrition':
                if (user.has_access === false) return <RestrictedFeature title="Nutrición Premium" />;
                return <AthleteNutritionView user={user} />;
            case 'competitions':
                return <AthleteCompetitionsView user={user} />;
            case 'calendar':
                return (
                    <div className="p-4 md:p-8">
                        <CalendarSection onBack={() => setCurrentView('home')} />
                    </div>
                );
            case 'ranking': return <AnvilRanking user={user} onBack={() => setCurrentView('home')} />;
            case 'profile': return <ProfileSection user={user} onUpdate={() => refetch()} onBack={() => setCurrentView('home')} />;
            case 'store': return <AnvilStore userId={user.id} />;
            default: return <AthleteHome user={user} onNavigate={(view) => setCurrentView(view as AthleteView)} />;
        }
    };

    return (
        <>
            <DashboardLayout
                menuItems={menuItems}
            >
                {renderContent()}
            </DashboardLayout>

            <WelcomeTourModal 
                isOpen={isWelcomeModalOpen} 
                onClose={() => setIsWelcomeModalOpen(false)} 
            />
        </>
    );
}