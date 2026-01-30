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
import { CalendarModal } from '../../../components/modals/CalendarModal';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';

import { UserProfile } from '../../../hooks/useUser';

interface CoachDashboardProps {
    user: UserProfile;
    onLogout: () => void;
}

type ViewState = 'home' | 'athletes' | 'schedule' | 'calendar' | 'athlete_details';

export function CoachDashboard({ user, onLogout }: CoachDashboardProps) {
    const [currentView, setCurrentView] = useState<ViewState>('home');
    const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(null);
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);

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
            onClick: () => setIsCalendarOpen(true),
            isActive: false // Opens modal, doesn't change view
        },
        {
            icon: <User size={20} />,
            label: 'Mi Perfil',
            onClick: () => window.location.href = '/profile',
            isActive: false
        }
    ];

    const renderContent = () => {
        switch (currentView) {
            case 'home':
                return <CoachHome user={user} />;
            case 'athletes':
                return <CoachAthletes onSelectAthlete={handleSelectAthlete} />;
            case 'athlete_details':
                return selectedAthleteId ? (
                    <CoachAthleteDetails
                        athleteId={selectedAthleteId}
                        onBack={() => setCurrentView('athletes')}
                    />
                ) : <CoachAthletes onSelectAthlete={handleSelectAthlete} />;
            case 'schedule':
                return <CoachTeamSchedule />;
            default:
                return <CoachHome user={user} />;
        }
    };

    return (
        <DashboardLayout
            user={user}
            onLogout={onLogout}
            menuItems={menuItems}
            roleLabel="Coach"
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
