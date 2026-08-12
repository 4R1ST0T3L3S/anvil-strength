import { useState } from 'react';
import {
    LayoutDashboard,
    Users,
    CalendarDays,
    Calendar,
    User,
    Activity,
    Dumbbell,
    SlidersHorizontal,
} from 'lucide-react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { CoachHome } from '../components/CoachHome';
import { CoachAthletes } from '../components/CoachAthletes';
import { CoachAthleteDetails } from '../components/CoachAthleteDetails';
import { CoachTeamSchedule } from '../components/CoachTeamSchedule';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import { ViewTransition } from '../../../components/layout/ViewTransition';
import { CalendarSection } from '../components/CalendarSection';
import { ProfileSection } from '../../profile/components/ProfileSection';
import { PreferencesPage } from './PreferencesPage';
import { UserProfile, useUser } from '../../../hooks/useUser';
import { PwrAnalysisTab } from '../components/pwr/PwrAnalysisTab';
import { FloatingChat } from '../../chat/components/FloatingChat';
import { isStaff, isNutritionist, tieneAmbosPaneles } from '../../../lib/roles';

interface CoachDashboardProps {
    user: UserProfile;
    onLogout: () => void;
}

/**
 * Igual que en el panel de atleta: las vistas son rutas, no `useState`.
 * Aquí importa incluso más, porque el coach entra y sale de la ficha de un
 * atleta constantemente y sin URL no había forma de volver con el botón
 * atrás ni de mandarle a nadie el enlace de un atleta concreto.
 */
const VIEWS = {
    '': 'home',
    atletas: 'athletes',
    agenda: 'schedule',
    calendario: 'calendar',
    pwr: 'pwr_analysis',
    preferencias: 'preferences',
    perfil: 'profile',
} as const;

type Slug = keyof typeof VIEWS;

const isSlug = (value: string | undefined): value is Slug =>
    value === undefined || value === '' || value in VIEWS;

const TITLES: Record<Slug, string | undefined> = {
    '': undefined,
    atletas: 'Mis atletas',
    agenda: 'Agenda del equipo',
    calendario: 'Calendario AEP',
    pwr: 'Análisis PWR',
    preferencias: 'Preferencias',
    perfil: 'Mi perfil',
};

export function CoachDashboard({ user, onLogout }: CoachDashboardProps) {
    const navigate = useNavigate();
    const { view, athleteId } = useParams<{ view: string; athleteId: string }>();
    const { refetch } = useUser();
    const [chatAthlete, setChatAthlete] = useState<{ id: string; full_name: string; avatar_url?: string } | null>(null);

    const slug: Slug = isSlug(view) ? ((view ?? '') as Slug) : '';

    const go = (next: Slug) =>
        navigate(next === '' ? '/coach-dashboard' : `/coach-dashboard/${next}`);

    if (!isSlug(view)) return <Navigate to="/coach-dashboard" replace />;

    /**
     * Antes esto comprobaba `role !== 'coach'` y devolvía un cartel de
     * "Acceso Denegado" sin salida. Pero AppRoutes manda aquí a TODO el que
     * gestiona atletas, nutricionistas incluidos: un nutricionista entraba,
     * se comía el cartel y no tenía ninguna ruta desde la que salir.
     * Ahora las dos caras usan la misma función (src/lib/roles.ts) y quien no
     * pinta aquí se redirige en vez de quedarse encallado.
     */
    if (!isStaff(user)) return <Navigate to="/dashboard" replace />;

    const nutritionist = isNutritionist(user);

    const menuItems = [
        {
            icon: <LayoutDashboard size={20} />,
            label: 'Inicio',
            onClick: () => go(''),
            isActive: slug === '',
        },
        {
            icon: <Users size={20} />,
            label: 'Atletas',
            onClick: () => go('atletas'),
            isActive: slug === 'atletas',
        },
        {
            icon: <CalendarDays size={20} />,
            label: 'Agenda',
            onClick: () => go('agenda'),
            isActive: slug === 'agenda',
        },
        {
            icon: <Calendar size={20} />,
            label: 'Calendario',
            onClick: () => go('calendario'),
            isActive: slug === 'calendario',
        },
        {
            icon: <User size={20} />,
            label: 'Perfil',
            onClick: () => go('perfil'),
            isActive: slug === 'perfil',
        },
        // El análisis de velocidad de barra es trabajo de entrenador de
        // fuerza. A un nutricionista le ocupa un hueco de menú sin darle
        // nada, así que no se le enseña.
        ...(nutritionist
            ? []
            : [{
                icon: <Activity size={20} />,
                label: 'Análisis PWR',
                onClick: () => go('pwr'),
                isActive: slug === 'pwr',
                hideOnMobileBar: true,
            }]),
        {
            icon: <SlidersHorizontal size={20} />,
            label: 'Preferencias',
            onClick: () => go('preferencias'),
            isActive: slug === 'preferencias',
            hideOnMobileBar: true,
        },
    ];

    // CONMUTADOR DE PANEL. La otra mitad del de UserDashboard: quien entrena a
    // gente y además se entrena necesita ir y volver. Es un control propio
    // (cabecera en móvil, pie de barra lateral en escritorio) para que en el
    // móvil no quede escondido en el menú de la ⋮.
    const panelSwitch = tieneAmbosPaneles(user)
        ? {
            icon: <Dumbbell size={20} />,
            label: 'Cambiar a atleta',
            shortLabel: 'Atleta',
            onClick: () => navigate('/dashboard'),
        }
        : undefined;

    const renderContent = () => {
        // La ficha de un atleta es su propia ruta (`/coach-dashboard/atletas/<id>`),
        // así que el botón atrás vuelve a la lista en vez de salir del panel.
        if (athleteId) {
            return (
                <CoachAthleteDetails
                    athleteId={athleteId}
                    onOpenChat={(a) => setChatAthlete(a)}
                    onBack={() => go('atletas')}
                />
            );
        }

        switch (VIEWS[slug]) {
            case 'athletes':
                return (
                    <CoachAthletes
                        user={user}
                        onSelectAthlete={(id) => navigate(`/coach-dashboard/atletas/${id}`)}
                        onOpenChat={(a) => setChatAthlete(a)}
                        onBack={() => go('')}
                    />
                );
            case 'schedule':
                return <CoachTeamSchedule user={user} onBack={() => go('')} />;
            case 'calendar':
                return <CalendarSection onBack={() => go('')} />;
            case 'profile':
                return <ProfileSection user={user} onUpdate={() => refetch()} onBack={() => go('')} />;
            case 'pwr_analysis':
                return <PwrAnalysisTab />;
            case 'preferences':
                return <PreferencesPage coachId={user.id} />;
            case 'home':
            default:
                return <CoachHome user={user} onNavigate={(v) => go(viewToSlug(v))} />;
        }
    };

    return (
        <DashboardLayout
            menuItems={menuItems}
            userId={user.id}
            userName={user.full_name}
            onLogout={onLogout}
            panelSwitch={panelSwitch}
            title={athleteId ? undefined : TITLES[slug]}
            onBack={slug === '' && !athleteId ? undefined : () => go(athleteId ? 'atletas' : '')}
        >
            <ViewTransition transitionKey={athleteId ?? slug}>{renderContent()}</ViewTransition>

            <FloatingChat
                isOpen={!!chatAthlete}
                onClose={() => setChatAthlete(null)}
                athlete={chatAthlete}
                coach={user}
            />
        </DashboardLayout>
    );
}

/** `CoachHome` navega con los nombres internos que usaba el `useState`. */
function viewToSlug(view: string): Slug {
    const entry = (Object.entries(VIEWS) as [Slug, string][]).find(([, name]) => name === view);
    return entry ? entry[0] : '';
}
