import { useState, lazy, Suspense } from 'react';
// import { useNavigate } from 'react-router-dom'; // <--- 1. IMPORTANTE: Hook de navegación
import {
    LayoutDashboard,
    Users,
    Calendar,
    Trophy,
    User,
    Activity,
    MessageCircle,
    Loader
} from 'lucide-react';
/**
 * El coach entra siempre a 'home'. Cargar por adelantado el análisis PWR
 * (visión por computador), el editor de bloques o las gráficas es descargar
 * megabytes que la mayoría de sesiones no llegan a abrir. Cada vista se trae
 * su código la primera vez que se visita.
 */
const ChatView = lazy(() => import('../../chat/ChatView').then(m => ({ default: m.ChatView })));
import { CoachHome } from '../components/CoachHome';
import { CoachAthletes } from '../components/CoachAthletes';
// Arrastra TrainingBlockList -> WorkoutBuilder (118 KB) y AthleteStatsModal -> recharts.
const CoachAthleteDetails = lazy(() => import('../components/CoachAthleteDetails').then(m => ({ default: m.CoachAthleteDetails })));
const CoachTeamSchedule = lazy(() => import('../components/CoachTeamSchedule').then(m => ({ default: m.CoachTeamSchedule })));
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
const CalendarSection = lazy(() => import('../components/CalendarSection').then(m => ({ default: m.CalendarSection })));
const ProfileSection = lazy(() => import('../../profile/components/ProfileSection').then(m => ({ default: m.ProfileSection })));
import { UserProfile, useUser } from '../../../hooks/useUser';
// La más pesada de todas: VideoTracker (visión por computador) + recharts.
const PwrAnalysisTab = lazy(() => import('../components/pwr/PwrAnalysisTab').then(m => ({ default: m.PwrAnalysisTab })));

// Nota: Ya no importamos ArenaView aquí porque es una página externa

interface CoachDashboardProps {
    user: UserProfile;
    onLogout: () => void;
}

// Ya no necesitamos 'arena' en el estado de la vista
type ViewState = 'home' | 'athletes' | 'schedule' | 'calendar' | 'athlete_details' | 'chat' | 'profile' | 'pwr_analysis';

export function CoachDashboard({ user, onLogout }: CoachDashboardProps) {
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
        },
        {
            icon: <Activity size={20} />,
            label: 'PWR Análisis',
            onClick: () => setCurrentView('pwr_analysis'),
            isActive: currentView === 'pwr_analysis'
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
            case 'chat': return <ChatView user={user} />;
            case 'profile': return <ProfileSection user={user} onUpdate={() => refetch()} onBack={() => setCurrentView('home')} />;
            case 'pwr_analysis': return <PwrAnalysisTab onBack={() => setCurrentView('home')} />;
            default: return <CoachHome user={user} onNavigate={(view) => setCurrentView(view as ViewState)} />;
        }
    };

    const viewTitles: Record<ViewState, string> = {
        home: '',
        athletes: 'Mis Atletas',
        athlete_details: 'Ficha del Atleta',
        schedule: 'Agenda Equipo',
        calendar: 'Calendario AEP',
        chat: 'Mensajes',
        profile: 'Mi Perfil',
        pwr_analysis: 'PWR Análisis'
    };

    const handleBack = () => {
        if (currentView === 'athlete_details') setCurrentView('athletes');
        else setCurrentView('home');
    };

    return (
        <DashboardLayout
            menuItems={menuItems}
            userId={user.id}
            title={viewTitles[currentView]}
            onBack={currentView !== 'home' ? handleBack : undefined}
            onLogout={onLogout}
            userName={user.full_name}
        >
            {/* La vista se descarga al visitarla por primera vez. El fallback
                mantiene la altura para que la cabecera no dé un salto. */}
            <Suspense
                fallback={
                    <div className="flex min-h-[60vh] items-center justify-center">
                        <Loader className="animate-spin text-anvil-red" size={28} />
                    </div>
                }
            >
                {renderContent()}
            </Suspense>
        </DashboardLayout>
    );
}