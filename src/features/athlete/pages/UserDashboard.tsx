import { useState } from 'react';
import {
    LayoutDashboard,
    FileText,
    Utensils,
    Calendar,
    Trophy,
    User
} from 'lucide-react';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
// import { AthleteTrainingPlan } from '../components/AthleteTrainingPlan';
import { WorkoutLogger } from '../../training/WorkoutLogger';
import { CalendarSection } from '../../coach/components/CalendarSection';
import { ProfileSection } from '../../profile/components/ProfileSection';
import { AthleteHome } from '../components/AthleteHome';
import { AthleteNutritionView } from '../components/AthleteNutritionView';

import { UserProfile, useUser } from '../../../hooks/useUser';

interface UserDashboardProps {
    user: UserProfile;
    onLogout: () => void;
}

type AthleteView = 'home' | 'planning' | 'nutrition' | 'competitions' | 'calendar' | 'profile';

export function UserDashboard({ user, onLogout }: UserDashboardProps) {
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
                return <AthleteHome user={user} onNavigate={(view) => setCurrentView(view)} />;
            case 'planning':
                // return <AthleteTrainingPlan userId={user.id} />;
                return <WorkoutLogger athleteId={user.id} />;
            case 'nutrition':
                return <AthleteNutritionView user={user} />;
            case 'competitions':
                return <div className="p-8 text-gray-500">Vista de Competiciones (Próximamente)</div>;
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
        >
            {renderContent()}
        </DashboardLayout>
    );
}
