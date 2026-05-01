import { useState } from 'react';
import { LayoutDashboard, Users, Apple, User, LogOut, Globe } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import { UserProfile, useUser } from '../../../hooks/useUser';
import { NutritionAthletes } from '../components/NutritionAthletes';
import { NutritionAnalytics } from '../components/NutritionAnalytics';
import { ProfileSection } from '../../profile/components/ProfileSection';

interface NutritionDashboardProps {
    user: UserProfile;
    onLogout: () => void;
}

type ViewState = 'home' | 'athletes' | 'analytics' | 'profile';

export function NutritionDashboard({ user, onLogout }: NutritionDashboardProps) {
    const navigate = useNavigate();
    const [currentView, setCurrentView] = useState<ViewState>('home');
    const { refetch } = useUser();

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
            label: 'Atletas',
            onClick: () => setCurrentView('athletes'),
            isActive: currentView === 'athletes'
        },
        {
            icon: <Apple size={20} />,
            label: 'Gráficas',
            onClick: () => setCurrentView('analytics'),
            isActive: currentView === 'analytics'
        },
        {
            icon: <User size={20} />,
            label: 'Mi Perfil',
            onClick: () => setCurrentView('profile'),
            isActive: currentView === 'profile'
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
            onClick: onLogout,
            isActive: false
        }
    ];

    const renderContent = () => {
        switch (currentView) {
            case 'home': 
                return (
                    <div className="p-6 md:p-10 space-y-8 animate-fade-in">
                        <div>
                            <h1 className="text-3xl font-black text-white uppercase italic tracking-wider mb-2 flex items-center gap-3">
                                <Apple className="text-anvil-red" size={32} />
                                PANEL DE NUTRICIÓN
                            </h1>
                            <p className="text-zinc-400">
                                Gestiona las dietas, planes nutricionales y visualiza el progreso de tus atletas.
                            </p>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                            <button onClick={() => setCurrentView('athletes')} className="bg-[#1c1c1c] border border-zinc-800 p-8 rounded-2xl hover:border-anvil-red transition-all group flex flex-col items-center text-center">
                                <Users size={48} className="text-zinc-500 group-hover:text-anvil-red mb-4 transition-colors" />
                                <h3 className="text-xl font-black text-white uppercase mb-2">Gestionar Atletas</h3>
                                <p className="text-zinc-400 text-sm">Crea dietas, ajusta macros y añade comidas a los atletas del club.</p>
                            </button>
                            <button onClick={() => setCurrentView('analytics')} className="bg-[#1c1c1c] border border-zinc-800 p-8 rounded-2xl hover:border-blue-500 transition-all group flex flex-col items-center text-center">
                                <LayoutDashboard size={48} className="text-zinc-500 group-hover:text-blue-500 mb-4 transition-colors" />
                                <h3 className="text-xl font-black text-white uppercase mb-2">Métricas y Gráficas</h3>
                                <p className="text-zinc-400 text-sm">Visualiza el promedio de calorías, distribución de macros y KPIs globales.</p>
                            </button>
                        </div>
                    </div>
                );
            case 'athletes': 
                return <NutritionAthletes user={user} />;
            case 'analytics': 
                return <NutritionAnalytics />;
            case 'profile': 
                return <ProfileSection user={user} onUpdate={() => refetch()} onBack={() => setCurrentView('home')} />;
            default: 
                return <div>Página en construcción</div>;
        }
    };

    return (
        <DashboardLayout menuItems={menuItems}>
            {renderContent()}
        </DashboardLayout>
    );
}
