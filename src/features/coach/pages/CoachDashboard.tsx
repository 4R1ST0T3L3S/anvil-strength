import { useState } from 'react';
// import { useNavigate } from 'react-router-dom'; // <--- 1. IMPORTANTE: Hook de navegación
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

// Nota: Ya no importamos ArenaView aquí porque es una página externa

interface CoachDashboardProps {
    user: UserProfile;
    onLogout: () => void;
}

// Ya no necesitamos 'arena' en el estado de la vista
type ViewState = 'home' | 'athletes' | 'schedule' | 'calendar' | 'athlete_details' | 'profile';

export function CoachDashboard({ user, onLogout: _onLogout }: CoachDashboardProps) {
    // const navigate = useNavigate(); // Removed unused navigate
    const [currentView, setCurrentView] = useState<ViewState>('home');
    const { refetch } = useUser();
    const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(null);

    // Verificación de seguridad básica
    if (user?.role !== 'coach') {
        return <div className="p-20 text-center text-white font-bold">Acceso Denegado</div>;
    }

    const handleSelectAthlete = (id: string) => {
        setSelectedAthleteId(id);
        setCurrentView('athlete_details');
    };

    // CONFIGURACIÓN DEL MENÚ LATERAL
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
        }
    ];

    const renderContent = () => {
        switch (currentView) {
            case 'home': return <CoachHome user={user} onNavigate={(view) => setCurrentView(view as ViewState)} />;
            case 'athletes': return <CoachAthletes user={user} onSelectAthlete={handleSelectAthlete} onBack={() => setCurrentView('home')} />;
            case 'athlete_details': return selectedAthleteId ? (
                <CoachAthleteDetails athleteId={selectedAthleteId} onBack={() => setCurrentView('athletes')} />
            ) : <CoachAthletes user={user} onSelectAthlete={handleSelectAthlete} onBack={() => setCurrentView('home')} />;
            case 'schedule': return <CoachTeamSchedule user={user} onBack={() => setCurrentView('home')} />;
            case 'calendar': return <CalendarSection onBack={() => setCurrentView('home')} />;
            case 'profile': return <ProfileSection user={user} onUpdate={() => refetch()} onBack={() => setCurrentView('home')} />;
            default: return <CoachHome user={user} onNavigate={(view) => setCurrentView(view as ViewState)} />;
        }
    };

    return (
        <DashboardLayout
            menuItems={menuItems}
        >
            {renderContent()}
        </DashboardLayout>
    );
}