import { useState } from 'react';
import { useNavigate } from 'react-router-dom'; // <--- 1. IMPORTANTE: Hook de navegación
import {
    LayoutDashboard,
    Users,
    Calendar,
    Trophy,
    User,
    Swords,
    ShoppingBag, // <--- Importamos ShoppingBag
    LogOut
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

export function CoachDashboard({ user, onLogout }: CoachDashboardProps) {
    const navigate = useNavigate(); // <--- 2. Inicializamos la navegación
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
            icon: <Swords size={20} />,
            label: 'La Arena',
            // 3. CAMBIO CLAVE: Navegación real a la ruta dedicada
            onClick: () => navigate('/dashboard/arena'),
            isActive: false // Siempre false porque salimos de esta página
        },
        {
            icon: <User size={20} />,
            label: 'Mi Perfil',
            onClick: () => setCurrentView('profile'),
            isActive: currentView === 'profile'
        },
        {
            icon: <ShoppingBag size={20} />,
            label: 'Ropa',
            onClick: () => navigate('/ropa'),
            isActive: false
        },
        // Botón para Móvil
        {
            icon: <LogOut size={20} className="text-red-500" />,
            label: 'Salir',
            onClick: onLogout,
            isActive: false
        }
    ];

    const renderContent = () => {
        switch (currentView) {
            case 'home': return <CoachHome user={user} onNavigate={(view) => setCurrentView(view as ViewState)} />;
            case 'athletes': return <CoachAthletes user={user} onSelectAthlete={handleSelectAthlete} onBack={() => setCurrentView('home')} />;
            case 'athlete_details': return selectedAthleteId ? (
                <CoachAthleteDetails athleteId={selectedAthleteId} onBack={() => setCurrentView('athletes')} />
            ) : <CoachAthletes user={user} onSelectAthlete={handleSelectAthlete} onBack={() => setCurrentView('home')} />;
            case 'schedule': return <CoachTeamSchedule user={user} />;
            case 'calendar': return <CalendarSection />;
            case 'profile': return <ProfileSection user={user} onUpdate={() => refetch()} />;
            default: return <CoachHome user={user} onNavigate={(view) => setCurrentView(view as ViewState)} />;
        }
    };

    return (
        <DashboardLayout
            user={user}
            onLogout={onLogout}
            onOpenSettings={() => setCurrentView('profile')}
            menuItems={menuItems}
            roleLabel="Coach"
            hideSidebarOnDesktop={false}
            hideMobileHeader={false}
        >
            {/* BOTÓN FLOTANTE PARA ORDENADOR */}
            <div className="hidden md:block fixed top-6 right-8 z-[100]">
                <button
                    onClick={onLogout}
                    className="flex items-center gap-2 bg-[#1c1c1c] border border-white/10 hover:border-red-500/50 hover:text-red-500 text-gray-400 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-xl"
                >
                    <LogOut size={16} />
                    Cerrar Sesión
                </button>
            </div>

            <div className="px-4 py-4 md:px-12 md:py-8 w-full animate-in fade-in duration-500">
                {renderContent()}
            </div>
        </DashboardLayout>
    );
}