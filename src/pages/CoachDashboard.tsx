import React, { useState } from 'react';
import {
    LayoutDashboard,
    Users,
    Calendar,
    LogOut,
    Trophy
} from 'lucide-react';
import { CoachHome } from '../components/coach/CoachHome';
import { CoachAthletes } from '../components/coach/CoachAthletes';
import { CoachAthleteDetails } from '../components/coach/CoachAthleteDetails';
import { CoachTeamSchedule } from '../components/coach/CoachTeamSchedule';

interface CoachDashboardProps {
    user: any;
    onBack: () => void;
}

type ViewState = 'home' | 'athletes' | 'schedule' | 'calendar' | 'athlete_details';

export function CoachDashboard({ user, onBack }: CoachDashboardProps) {
    const [currentView, setCurrentView] = useState<ViewState>('home');
    const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(null);

    const handleSelectAthlete = (id: string) => {
        setSelectedAthleteId(id);
        setCurrentView('athlete_details');
    };

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
        <div className="flex h-screen bg-[#1c1c1c] text-white overflow-hidden font-sans">
            {/* Sidebar */}
            <aside className="w-64 bg-[#252525] flex flex-col border-r border-white/5">
                <div className="p-6 border-b border-white/5">
                    <div className="flex items-center gap-3">
                        <img src="/logo.svg" alt="Anvil" className="h-8 w-auto" />
                        <span className="font-black text-xl tracking-tighter uppercase">Coach</span>
                    </div>
                </div>

                <nav className="flex-1 p-4 space-y-2">
                    <button
                        onClick={() => setCurrentView('home')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${currentView === 'home'
                                ? 'bg-anvil-red text-white font-bold'
                                : 'text-gray-400 hover:bg-white/5 hover:text-white'
                            }`}
                    >
                        <LayoutDashboard size={20} />
                        Dashboard
                    </button>

                    <button
                        onClick={() => setCurrentView('athletes')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${currentView === 'athletes' || currentView === 'athlete_details'
                                ? 'bg-anvil-red text-white font-bold'
                                : 'text-gray-400 hover:bg-white/5 hover:text-white'
                            }`}
                    >
                        <Users size={20} />
                        Mis Atletas
                    </button>

                    <button
                        onClick={() => setCurrentView('schedule')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${currentView === 'schedule'
                                ? 'bg-anvil-red text-white font-bold'
                                : 'text-gray-400 hover:bg-white/5 hover:text-white'
                            }`}
                    >
                        <Trophy size={20} />
                        Agenda Equipo
                    </button>

                    <a
                        href="https://www.powerlifting-aep.es/calendario/"
                        target="_blank"
                        rel="noreferrer"
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-gray-400 hover:bg-white/5 hover:text-white transition-all"
                    >
                        <Calendar size={20} />
                        Calendario AEP
                    </a>
                </nav>

                <div className="p-4 border-t border-white/5">
                    <div className="flex items-center gap-3 px-4 py-3 mb-2">
                        {user.user_metadata?.avatar_url ? (
                            <img src={user.user_metadata.avatar_url} alt="Profile" className="w-8 h-8 rounded-full" />
                        ) : (
                            <div className="w-8 h-8 rounded-full bg-gray-700"></div>
                        )}
                        <div className="overflow-hidden">
                            <p className="text-sm font-bold truncate">{user.user_metadata?.full_name || 'Coach'}</p>
                            <p className="text-xs text-gray-500 truncate">Entrenador</p>
                        </div>
                    </div>
                    <button
                        onClick={onBack}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                    >
                        <LogOut size={16} />
                        Volver a Mi Perfil
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto bg-[#1c1c1c]">
                {renderContent()}
            </main>
        </div>
    );
}
