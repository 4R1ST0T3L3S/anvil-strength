import { useState } from 'react';
import {
    LayoutDashboard,
    Users,
    Calendar,
    Trophy,
    User
} from 'lucide-react';
import { CoachHome } from '../components/CoachHome';
import { CoachAthletes } from '../components/CoachAthletes';
import { CoachAthleteDetails } from '../components/CoachAthleteDetails';
import { CoachTeamSchedule } from '../components/CoachTeamSchedule';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import { CalendarSection } from '../components/CalendarSection';
import { ProfileSection } from '../../profile/components/ProfileSection';


import { UserProfile, useUser } from '../../../hooks/useUser';

interface CoachDashboardProps {
    user: UserProfile;
    onLogout: () => void;
}

type ViewState = 'home' | 'athletes' | 'schedule' | 'calendar' | 'athlete_details' | 'profile';

export function CoachDashboard({ user, onLogout }: CoachDashboardProps) {
    const [currentView, setCurrentView] = useState<ViewState>('home');
    const { refetch } = useUser();
    const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(null);

    // Security Check
    if (user?.role !== 'coach') {
        return (
            <div className="flex h-screen items-center justify-center bg-[#1c1c1c] text-white">
                <div className="text-center">
                    <h1 className="text-2xl font-bold text-anvil-red mb-2">Acceso Denegado</h1>
                    <p className="text-gray-400">No tienes permisos para ver esta página.</p>
                </div>
            </div>
        );
    }

    const handleSelectAthlete = (id: string) => {
        setSelectedAthleteId(id);
        setCurrentView('athlete_details');
    };

    const menuItems = [
        {
            icon: <LayoutDashboard size={20} />,
            label: 'Dashboard',
            onClick: () => setCurrentView('home'),
            isActive: currentView === 'home'
        },
        {
            icon: <Users size={20} />,
            label: 'Mis Atletas',
            onClick: () => setCurrentView('athletes'),
            isActive: currentView === 'athletes' || currentView === 'athlete_details'
        },
        {
            icon: <Trophy size={20} />,
            label: 'Agenda Equipo',
            onClick: () => setCurrentView('schedule'),
            isActive: currentView === 'schedule'
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

    ];

    const renderContent = () => {
        switch (currentView) {
            case 'home':
                return <CoachHome user={user} />;
            case 'athletes':
                return <CoachAthletes user={user} onSelectAthlete={handleSelectAthlete} />;
            case 'athlete_details':
                return selectedAthleteId ? (
                    <CoachAthleteDetails
                        athleteId={selectedAthleteId}
                        onBack={() => setCurrentView('athletes')}
                    />
                ) : <CoachAthletes user={user} onSelectAthlete={handleSelectAthlete} />;
            case 'schedule':
                return <CoachTeamSchedule user={user} />;
            case 'calendar':
                return (
                    <div className="p-4 md:p-8">
                        <CalendarSection />
                    </div>
                );
            case 'profile':
                return <ProfileSection user={user} onUpdate={() => refetch()} />;
            default:
                return <CoachHome user={user} />;
        }
    };

    return (
        <DashboardLayout
            user={user}
            onLogout={onLogout}
            onOpenSettings={() => setCurrentView('profile')}
            menuItems={menuItems}
            roleLabel="Coach"
        >
            {renderContent()}
        </DashboardLayout>
    );
}
