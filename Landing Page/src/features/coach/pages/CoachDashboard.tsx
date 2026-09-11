import { useState } from 'react';
import {
    LayoutDashboard, Users, CalendarDays, Calendar, User, Activity, Dumbbell, SlidersHorizontal, Inbox, MessageSquare, Apple, Bell,
} from 'lucide-react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { CoachHome } from '../components/CoachHome';
import { CoachAthletes } from '../components/CoachAthletes';
import { CoachDiets } from '../components/CoachDiets';
import { CoachAthleteDetails } from '../components/CoachAthleteDetails';
import { CoachTeamSchedule } from '../components/CoachTeamSchedule';
import { DashboardLayout, AccountMenu } from '../../../components/layout/DashboardLayout';
import { NotificationBell } from '../../../components/ui/NotificationBell';
import { ViewTransition } from '../../../components/layout/ViewTransition';
import { CalendarSection } from '../components/CalendarSection';
import { ProfileSection } from '../../profile/components/ProfileSection';
import { PreferencesPage } from './PreferencesPage';
import { PdfThemeSettings } from '../../profile/components/PdfThemeSettings';
import { NotificationSettings } from '../../profile/components/NotificationSettings';
import { UserProfile, useUser } from '../../../hooks/useUser';
import { PwrAnalysisTab } from '../components/pwr/PwrAnalysisTab';
import { FloatingChat } from '../../chat/components/FloatingChat';
import { CoachInbox } from '../../inbox/components/CoachInbox';
import { CoachInboxAthlete } from '../../inbox/components/CoachInboxAthlete';
import { useCoachInboxSummary } from '../../inbox/hooks/useInbox';
import { ChatPage } from '../../chat/pages/ChatPage';
import { useChatSinLeer } from '../../chat/hooks/useChat';
import { isStaff, isNutritionist, isDeveloper, isAthlete, tieneAmbosPaneles } from '../../../lib/roles';

interface CoachDashboardProps {
    user: UserProfile;
    onLogout: () => void;
}

/**
 * Las vistas son RUTAS, no `useState`: el entrenador entra y sale de fichas
 * constantemente y sin URL no hay botón atrás ni enlaces que compartir.
 *
 *   /coach-dashboard                      inicio
 *   /coach-dashboard/<vista>              una sección
 *   /coach-dashboard/atletas/<id>         la ficha de un atleta
 *   /coach-dashboard/bandeja/<id>         los entrenamientos pendientes de un atleta
 *   /coach-dashboard/mensajes/<id>        la conversación con alguien
 */
const VIEWS = {
    '': 'home',
    atletas: 'athletes',
    bandeja: 'inbox',
    mensajes: 'messages',
    dietas: 'diets',
    agenda: 'schedule',
    calendario: 'calendar',
    pwr: 'pwr_analysis',
    preferencias: 'preferences',
    notificaciones: 'notifications',
    perfil: 'profile',
    documento: 'pdf_theme',
} as const;

type Slug = keyof typeof VIEWS;

const isSlug = (value: string | undefined): value is Slug =>
    value === undefined || value === '' || value in VIEWS;

export function CoachDashboard({ user, onLogout }: CoachDashboardProps) {
    const navigate = useNavigate();
    const { view, athleteId, inboxAthleteId, chatId } = useParams<{ view: string; athleteId: string; inboxAthleteId: string; chatId: string }>();
    const { refetch } = useUser();
    const [chatAthlete, setChatAthlete] = useState<{ id: string; full_name: string; avatar_url?: string } | null>(null);

    // Los contadores de las pestañas. Comparten socket con las pantallas.
    const bandeja = useCoachInboxSummary(user.id);
    const sinLeer = useChatSinLeer(user.id);

    // Las rutas con parámetro no traen `view`: se deduce del parámetro.
    const slug: Slug = inboxAthleteId ? 'bandeja' : chatId ? 'mensajes' : isSlug(view) ? ((view ?? '') as Slug) : '';

    const go = (next: Slug) =>
        navigate(next === '' ? '/coach-dashboard' : `/coach-dashboard/${next}`);

    if (!isSlug(view) && !inboxAthleteId && !chatId) return <Navigate to="/coach-dashboard" replace />;

    // AppRoutes manda aquí a TODO el que gestiona atletas, nutricionistas
    // incluidos; quien no pinta aquí se redirige en vez de quedarse encallado.
    if (!isStaff(user)) return <Navigate to="/dashboard" replace />;

    const nutritionist = isNutritionist(user);

    const menuItems = [
        { icon: <LayoutDashboard size={20} />, label: 'Inicio', onClick: () => go(''), isActive: slug === '' && !athleteId },
        { icon: <Users size={20} />, label: 'Atletas', onClick: () => go('atletas'), isActive: slug === 'atletas' || !!athleteId },
        { icon: <Inbox size={20} />, label: 'Bandeja', onClick: () => go('bandeja'), isActive: slug === 'bandeja', badge: bandeja.totalPendientes },
        { icon: <MessageSquare size={20} />, label: 'Mensajes', onClick: () => go('mensajes'), isActive: slug === 'mensajes', badge: sinLeer },
        { icon: <CalendarDays size={20} />, label: 'Agenda', onClick: () => go('agenda'), isActive: slug === 'agenda', hideOnMobileBar: true },
        { icon: <Apple size={20} />, label: 'Dietas', onClick: () => go('dietas'), isActive: slug === 'dietas', hideOnMobileBar: true },
        { icon: <Calendar size={20} />, label: 'Calendario', onClick: () => go('calendario'), isActive: slug === 'calendario', hideOnMobileBar: true },
        // El análisis de velocidad es trabajo de entrenador de fuerza: a un
        // nutricionista le ocupa un hueco sin darle nada.
        ...(nutritionist ? [] : [{ icon: <Activity size={20} />, label: 'Análisis PWR', onClick: () => go('pwr'), isActive: slug === 'pwr', hideOnMobileBar: true }]),
        { icon: <User size={20} />, label: 'Perfil', onClick: () => go('perfil'), isActive: slug === 'perfil', hideOnMobileBar: true },
        { icon: <Bell size={20} />, label: 'Avisos', onClick: () => go('notificaciones'), isActive: slug === 'notificaciones', hideOnMobileBar: true },
        { icon: <SlidersHorizontal size={20} />, label: 'Preferencias', onClick: () => go('preferencias'), isActive: slug === 'preferencias' || slug === 'documento', hideOnMobileBar: true },
    ];

    // Quien entrena a gente y además se entrena necesita ir y volver.
    const panelSwitch = tieneAmbosPaneles(user)
        ? { icon: <Dumbbell size={20} />, label: 'Cambiar a atleta', shortLabel: 'Atleta', onClick: () => navigate('/dashboard') }
        : undefined;

    const abrirChat = (a: { id: string; full_name: string; avatar_url?: string }) => setChatAthlete(a);

    const renderContent = () => {
        if (athleteId) {
            return (
                <CoachAthleteDetails
                    athleteId={athleteId}
                    onOpenChat={abrirChat}
                    onBack={() => go('atletas')}
                />
            );
        }
        if (inboxAthleteId) {
            return (
                <CoachInboxAthlete
                    user={user}
                    athleteId={inboxAthleteId}
                    onBack={() => go('bandeja')}
                    onOpenChat={abrirChat}
                    onOpenProfile={(id) => navigate(`/coach-dashboard/atletas/${id}`)}
                />
            );
        }

        switch (VIEWS[slug]) {
            case 'athletes':
                return (
                    <CoachAthletes
                        user={user}
                        onSelectAthlete={(id) => navigate(`/coach-dashboard/atletas/${id}`)}
                        onOpenChat={abrirChat}
                        onBack={() => go('')}
                    />
                );
            case 'inbox':
                return <CoachInbox user={user} onOpenAthlete={(id) => navigate(`/coach-dashboard/bandeja/${id}`)} />;
            case 'messages':
                return (
                    <ChatPage
                        user={user}
                        chatId={chatId ?? null}
                        onAbrir={(id) => navigate(`/coach-dashboard/mensajes/${id}`)}
                        onCerrar={() => go('mensajes')}
                        onVerFicha={(id) => navigate(`/coach-dashboard/atletas/${id}`)}
                    />
                );
            case 'diets':
                return <CoachDiets user={user} onBack={() => go('')} />;
            case 'schedule':
                return <CoachTeamSchedule user={user} onBack={() => go('')} />;
            case 'calendar':
                return <CalendarSection onBack={() => go('')} />;
            case 'profile':
                return <ProfileSection user={user} onUpdate={() => refetch()} onBack={() => go('')} />;
            case 'pwr_analysis':
                return <PwrAnalysisTab />;
            case 'preferences':
                return <PreferencesPage coachId={user.id} onOpenPdfTheme={() => go('documento')} isDeveloper={isDeveloper(user)} />;
            case 'notifications':
                return <NotificationSettings userId={user.id} esStaff esAtleta={isAthlete(user)} onBack={() => go('')} />;
            case 'pdf_theme':
                return <PdfThemeSettings user={user} onBack={() => go('preferencias')} />;
            case 'home':
            default:
                return (
                    <CoachHome
                        user={user}
                        onNavigate={(v) => go(viewToSlug(v))}
                        headerActions={
                            <div className="flex items-center gap-1">
                                {panelSwitch && (
                                    <button
                                        onClick={panelSwitch.onClick}
                                        aria-label={panelSwitch.label}
                                        className="flex h-9 items-center gap-1.5 rounded-pill bg-[var(--brand-quiet)] px-3 text-t-xs font-semibold text-brand-text transition-colors duration-fast hover:bg-[var(--brand-quiet-strong)] lg:hidden"
                                    >
                                        <span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4" aria-hidden="true">{panelSwitch.icon}</span>
                                        <span className="max-w-[92px] truncate">{panelSwitch.shortLabel ?? panelSwitch.label}</span>
                                    </button>
                                )}
                                <NotificationBell userId={user.id} className="lg:hidden" />
                                <AccountMenu onLogout={onLogout} userName={user.full_name} items={menuItems.filter(i => i.hideOnMobileBar)} />
                            </div>
                        }
                    />
                );
        }
    };

    const llenar = (slug === '' && !athleteId && !inboxAthleteId) || slug === 'mensajes';

    return (
        <DashboardLayout
            menuItems={menuItems}
            userId={user.id}
            userName={user.full_name}
            userAvatar={user.avatar_url}
            onLogout={onLogout}
            panelSwitch={panelSwitch}
            ajustarAPantalla={llenar}
        >
            <ViewTransition transitionKey={athleteId ?? inboxAthleteId ?? (slug === 'mensajes' ? 'mensajes' : slug)} llenar={llenar}>
                {renderContent()}
            </ViewTransition>

            <FloatingChat
                isOpen={!!chatAthlete}
                onClose={() => setChatAthlete(null)}
                athlete={chatAthlete}
                coach={user}
            />
        </DashboardLayout>
    );
}

/** `CoachHome` navega con los nombres internos de vista. */
function viewToSlug(view: string): Slug {
    const entry = (Object.entries(VIEWS) as [Slug, string][]).find(([, name]) => name === view);
    return entry ? entry[0] : '';
}
