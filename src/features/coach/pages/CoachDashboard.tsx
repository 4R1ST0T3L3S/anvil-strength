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
                return <CoachHome user={user} onNavigate={setCurrentView} />;
            case 'athletes':
                return <CoachAthletes user={user} onSelectAthlete={handleSelectAthlete} onBack={() => setCurrentView('home')} />;
            case 'athlete_details':
                return selectedAthleteId ? (
                    <CoachAthleteDetails
                        athleteId={selectedAthleteId}
                        onBack={() => setCurrentView('athletes')}
                    />
                ) : <CoachAthletes user={user} onSelectAthlete={handleSelectAthlete} onBack={() => setCurrentView('home')} />;
            case 'schedule':
                // Assuming CoachTeamSchedule doesn't have onBack yet, we might need to wrap it or add it
                return (
                    <div className="h-full flex flex-col">
                        <div className="p-4 md:p-8 pb-0">
                            <button
                                onClick={() => setCurrentView('home')}
                                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-4"
                            >
                                ← Volver al Dashboard
                            </button>
                        </div>
                        <CoachTeamSchedule user={user} />
                    </div>
                );
            case 'calendar':
                return (
                    <div className="p-4 md:p-8 h-full flex flex-col">
                        <div className="mb-4">
                            <button
                                onClick={() => setCurrentView('home')}
                                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
                            >
                                ← Volver al Dashboard
                            </button>
                        </div>
                        <CalendarSection />
                    </div>
                );
            case 'profile':
                return (
                    <div className="h-full flex flex-col">
                        <div className="p-4 md:p-8 pb-0">
                            <button
                                onClick={() => setCurrentView('home')}
                                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-4"
                            >
                                ← Volver al Dashboard
                            </button>
                        </div>
                        <ProfileSection user={user} onUpdate={() => refetch()} />
                    </div>
                );
            default:
                return <CoachHome user={user} onNavigate={setCurrentView} />;
        }
    };

    return (
        <DashboardLayout
            user={user}
            onLogout={onLogout}
            onOpenSettings={() => setCurrentView('profile')}
            menuItems={menuItems}
            roleLabel="Coach"
            hideSidebarOnDesktop={true}
            hideMobileHeader={true}
        >
            {renderContent()}
        </DashboardLayout>
    );
}
