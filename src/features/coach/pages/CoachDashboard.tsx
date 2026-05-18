import { useState, useEffect } from 'react';
// import { useNavigate } from 'react-router-dom'; // <--- 1. IMPORTANTE: Hook de navegación
import {
    LayoutDashboard,
    Users,
    Calendar,
    Trophy,
    User,
    Activity,
    LogOut,
    Globe
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CoachHome } from '../components/CoachHome';
import { CoachAthletes } from '../components/CoachAthletes';
import { CoachAthleteDetails } from '../components/CoachAthleteDetails';
import { CoachTeamSchedule } from '../components/CoachTeamSchedule';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import { WelcomeTourModal } from '../../onboarding/components/WelcomeTourModal';
import { CalendarSection } from '../components/CalendarSection';
import { ProfileSection } from '../../profile/components/ProfileSection';
import { UserProfile, useUser } from '../../../hooks/useUser';
import { PwrAnalysisTab } from '../components/pwr/PwrAnalysisTab';
import { FloatingChat } from '../../chat/components/FloatingChat';

// Nota: Ya no importamos ArenaView aquí porque es una página externa

interface CoachDashboardProps {
    user: UserProfile;
    onLogout: () => void;
}

// Ya no necesitamos 'arena' en el estado de la vista
type ViewState = 'home' | 'athletes' | 'schedule' | 'calendar' | 'athlete_details' | 'profile' | 'pwr_analysis';

export function CoachDashboard({ user, onLogout: _onLogout }: CoachDashboardProps) {
    const navigate = useNavigate();
    const [currentView, setCurrentView] = useState<ViewState>('home');
    const { refetch } = useUser();
    const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(null);
    const [chatAthlete, setChatAthlete] = useState<{ id: string; full_name: string; avatar_url?: string } | null>(null);
    const [isWelcomeModalOpen, setIsWelcomeModalOpen] = useState(false);

    useEffect(() => {
        const hasSeenTour = localStorage.getItem(`has_seen_tour_${user.id}`);
        if (!hasSeenTour) {
            setIsWelcomeModalOpen(true);
            localStorage.setItem(`has_seen_tour_${user.id}`, 'true');
        }
    }, [user.id]);

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
        },
        {
            icon: <Activity size={20} />,
            label: 'PWR Análisis',
            onClick: () => setCurrentView('pwr_analysis'),
            isActive: currentView === 'pwr_analysis'
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
            case 'home': return <CoachHome user={user} onNavigate={(view) => setCurrentView(view as ViewState)} />;
            case 'athletes': return (
                <CoachAthletes 
                    user={user} 
                    onSelectAthlete={handleSelectAthlete} 
                    onOpenChat={(a) => setChatAthlete(a)}
                    onBack={() => setCurrentView('home')} 
                />
            );
            case 'athlete_details': return selectedAthleteId ? (
                <CoachAthleteDetails 
                    athleteId={selectedAthleteId} 
                    onOpenChat={(a) => setChatAthlete(a)}
                    onBack={() => setCurrentView('athletes')} 
                />
            ) : (
                <CoachAthletes 
                    user={user} 
                    onSelectAthlete={handleSelectAthlete} 
                    onOpenChat={(a) => setChatAthlete(a)}
                    onBack={() => setCurrentView('home')} 
                />
            );
            case 'schedule': return <CoachTeamSchedule user={user} onBack={() => setCurrentView('home')} />;
            case 'calendar': return <CalendarSection onBack={() => setCurrentView('home')} />;
            case 'profile': return <ProfileSection user={user} onUpdate={() => refetch()} onBack={() => setCurrentView('home')} />;
            case 'pwr_analysis': return <PwrAnalysisTab />;
            default: return <CoachHome user={user} onNavigate={(view) => setCurrentView(view as ViewState)} />;
        }
    };

    return (
        <DashboardLayout
            menuItems={menuItems}
        >
            {renderContent()}
            
            <FloatingChat 
                isOpen={!!chatAthlete}
                onClose={() => setChatAthlete(null)}
                athlete={chatAthlete}
                coach={user}
            />

            <WelcomeTourModal 
                isOpen={isWelcomeModalOpen} 
                onClose={() => setIsWelcomeModalOpen(false)} 
            />
        </DashboardLayout>
    );
}