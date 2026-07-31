import { useState } from 'react';
import {
    LayoutDashboard,
    FileText,
    Utensils,
    Calendar,
    Trophy,
    User,
    MessageCircle
} from 'lucide-react';
import { ChatView } from '../../chat/ChatView';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';

import { WorkoutLogger } from '../../training/components/WorkoutLogger';
import { CalendarSection } from '../../coach/components/CalendarSection';
import { ProfileSection } from '../../profile/components/ProfileSection';
import { AthleteHome } from '../components/AthleteHome';
import { AthleteNutritionView } from '../components/AthleteNutritionView';
import { AthleteCompetitionsView } from '../components/AthleteCompetitionsView';
import { RestrictedFeature } from '../../../components/ui/RestrictedFeature';

import { UserProfile, useUser } from '../../../hooks/useUser';

interface UserDashboardProps {
    user: UserProfile;
    onLogout: () => void;
}

// Eliminamos 'arena' de los tipos de vista interna
type AthleteView = 'home' | 'planning' | 'nutrition' | 'competitions' | 'calendar' | 'chat' | 'profile';

export function UserDashboard({ user, onLogout }: UserDashboardProps) {
    const [currentView, setCurrentView] = useState<AthleteView>('home');
    const { refetch } = useUser();

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
            icon: <MessageCircle size={20} />,
            label: 'Mensajes',
            onClick: () => setCurrentView('chat'),
            isActive: currentView === 'chat'
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
                if (user.has_access === false) return <RestrictedFeature title="Planificación Premium" />;
                return <WorkoutLogger athleteId={user.id} athleteName={user.full_name} />;
            case 'nutrition':
                if (user.has_access === false) return <RestrictedFeature title="Nutrición Premium" />;
                return <AthleteNutritionView user={user} />;
            case 'competitions':
                return <AthleteCompetitionsView user={user} />;
            case 'calendar':
                return (
                    <div className="p-4 md:p-8">
                        <CalendarSection />
                    </div>
                );
            case 'chat':
                return <ChatView user={user} />;
            case 'profile':
                return <ProfileSection user={user} onUpdate={() => refetch()} />;
            default:
                return null;
        }
    };

    const viewTitles: Record<AthleteView, string> = {
        home: '',
        planning: 'Mi Planificación',
        nutrition: 'Mi Nutrición',
        competitions: 'Mis Competiciones',
        calendar: 'Calendario AEP',
        chat: 'Mensajes',
        profile: 'Mi Perfil'
    };

    return (
        <DashboardLayout
            menuItems={menuItems}
            userId={user.id}
            title={viewTitles[currentView]}
            onBack={currentView !== 'home' ? () => setCurrentView('home') : undefined}
            onLogout={onLogout}
            userName={user.full_name}
        >
            {renderContent()}
        </DashboardLayout>
    );
}