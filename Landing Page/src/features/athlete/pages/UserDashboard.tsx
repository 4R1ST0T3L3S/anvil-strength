import {
    LayoutDashboard, FileText, Utensils, Calendar, Trophy, User, ShoppingBag, Medal, Activity, Users, TrendingUp, Inbox, MessageSquare, SlidersHorizontal,
} from 'lucide-react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { DashboardLayout, AccountMenu } from '../../../components/layout/DashboardLayout';
import { ViewTransition } from '../../../components/layout/ViewTransition';

import { WorkoutLogger } from '../../training/components/WorkoutLogger';
import { CalendarSection } from '../../coach/components/CalendarSection';
import { ProfileSection } from '../../profile/components/ProfileSection';
import { AnvilStore } from '../../profile/components/AnvilStore';
import { NotificationBell } from '../../../components/ui/NotificationBell';
import { NotificationSettings } from '../../profile/components/NotificationSettings';
import { AjustesPage } from '../../profile/components/AjustesPage';
import { AthleteHome } from '../components/AthleteHome';
import { AthleteNutritionView } from '../components/AthleteNutritionView';
import { AthleteCompetitionsView } from '../components/AthleteCompetitionsView';
import { AthleteVbtView } from '../components/AthleteVbtView';
import { BloqueoDePago } from '../../../components/ui/BloqueoDePago';
import { usePuertaDePago } from '../../../hooks/usePuertaDePago';
import { useIdioma } from '../../../hooks/useIdioma';
import { vistaBloqueada } from '../../../lib/billing';
import { AnvilRanking } from '../components/AnvilRanking';
import { AthleteStatsView } from '../components/AthleteStatsView';
import { AthleteInbox } from '../../inbox/components/AthleteInbox';
import { useAthleteInboxUnread } from '../../inbox/hooks/useInbox';
import { ChatPage } from '../../chat/pages/ChatPage';
import { useChatSinLeer } from '../../chat/hooks/useChat';

import { UserProfile, useUser } from '../../../hooks/useUser';
import { isAthlete, isCoach, isStaff, tieneAmbosPaneles } from '../../../lib/roles';
import { FEATURES } from '../../../lib/features';

interface UserDashboardProps {
    user: UserProfile;
    onLogout: () => void;
}

/**
 * Las vistas del panel son RUTAS, no estado local: el botón atrás del
 * móvil funciona, refrescar no devuelve al inicio y las pantallas se pueden
 * enlazar. El slug va en castellano porque la URL la lee el atleta.
 */
const VIEWS = {
    '': 'home',
    planificacion: 'planning',
    bandeja: 'inbox',
    mensajes: 'messages',
    estadisticas: 'stats',
    velocidad: 'vbt',
    nutricion: 'nutrition',
    competiciones: 'competitions',
    calendario: 'calendar',
    ranking: 'ranking',
    ajustes: 'settings',
    notificaciones: 'notifications',
    perfil: 'profile',
    tienda: 'store',
} as const;

type Slug = keyof typeof VIEWS;

const isSlug = (value: string | undefined): value is Slug =>
    value === undefined || value === '' || value in VIEWS;

export function UserDashboard({ user, onLogout }: UserDashboardProps) {
    const navigate = useNavigate();
    const { view, chatId } = useParams<{ view: string; chatId: string }>();
    const { refetch } = useUser();

    // Hooks antes de cualquier `return`: se llaman siempre y en el mismo orden.
    const puerta = usePuertaDePago(user.id);
    const { t } = useIdioma();
    const sinLeerBandeja = useAthleteInboxUnread(user.id);
    const sinLeerChat = useChatSinLeer(user.id);

    const slug: Slug = chatId ? 'mensajes' : isSlug(view) ? ((view ?? '') as Slug) : '';

    const go = (next: Slug) => navigate(next === '' ? '/dashboard' : `/dashboard/${next}`);

    if (!isSlug(view) && !chatId) return <Navigate to="/dashboard" replace />;

    // Quien no tiene entrenamiento propio no pinta nada aquí: redirección,
    // no error. `!isAthlete` y no `isStaff`: los roles se suman.
    if (!isAthlete(user)) return <Navigate to="/coach-dashboard" replace />;

    const menuItems = [
        { icon: <LayoutDashboard size={20} />, label: t('nav.inicio'), onClick: () => go(''), isActive: slug === '' },
        { icon: <FileText size={20} />, label: t('nav.entrenar'), onClick: () => go('planificacion'), isActive: slug === 'planificacion' },
        { icon: <Inbox size={20} />, label: 'Bandeja', onClick: () => go('bandeja'), isActive: slug === 'bandeja', badge: sinLeerBandeja },
        { icon: <MessageSquare size={20} />, label: 'Mensajes', onClick: () => go('mensajes'), isActive: slug === 'mensajes', badge: sinLeerChat },
        { icon: <TrendingUp size={20} />, label: 'Estadísticas', shortLabel: 'Progreso', onClick: () => go('estadisticas'), isActive: slug === 'estadisticas', hideOnMobileBar: true },
        { icon: <Utensils size={20} />, label: t('nav.nutricion'), onClick: () => go('nutricion'), isActive: slug === 'nutricion', hideOnMobileBar: true },
        { icon: <Trophy size={20} />, label: t('nav.competiciones'), shortLabel: 'Competir', onClick: () => go('competiciones'), isActive: slug === 'competiciones', hideOnMobileBar: true },
        { icon: <User size={20} />, label: t('nav.perfil'), onClick: () => go('perfil'), isActive: slug === 'perfil', hideOnMobileBar: true },
        { icon: <Activity size={20} />, label: t('nav.velocidad'), onClick: () => go('velocidad'), isActive: slug === 'velocidad', hideOnMobileBar: true },
        { icon: <Calendar size={20} />, label: t('nav.calendarioAep'), onClick: () => go('calendario'), isActive: slug === 'calendario', hideOnMobileBar: true },
        { icon: <Medal size={20} />, label: t('nav.ranking'), onClick: () => go('ranking'), isActive: slug === 'ranking', hideOnMobileBar: true },
        { icon: <SlidersHorizontal size={20} />, label: 'Preferencias y ajustes', shortLabel: 'Ajustes', onClick: () => go('ajustes'), isActive: slug === 'ajustes' || slug === 'notificaciones', hideOnMobileBar: true },
        // La Tienda Anvil está apagada (ver src/lib/features.ts).
        ...(FEATURES.anvilStore
            ? [{ icon: <ShoppingBag size={20} />, label: t('nav.tienda'), onClick: () => go('tienda'), isActive: slug === 'tienda', hideOnMobileBar: true }]
            : []),
    ];

    // CONMUTADOR DE PANEL: solo para quien tiene los dos.
    const panelSwitch = tieneAmbosPaneles(user)
        ? {
            icon: <Users size={20} />,
            label: isCoach(user) ? t('nav.cambiarAEntrenador') : t('nav.cambiarANutricion'),
            shortLabel: isCoach(user) ? 'Entrenador' : 'Nutrición',
            onClick: () => navigate('/coach-dashboard'),
        }
        : undefined;

    const renderContent = () => {
        switch (VIEWS[slug]) {
            /*
             * LA PUERTA DE PAGO SUSTITUYE A `has_access` (K3). Se cierran el
             * entrenamiento, la velocidad y la nutrición; NUNCA el chat ni la
             * bandeja (K5): sin ellos el atleta no puede ni preguntar cómo pagar.
             */
            case 'planning':
                if (vistaBloqueada('entrenamiento', puerta.resultado, puerta.prefs.billing.blocks)) {
                    return <BloqueoDePago resultado={puerta.resultado} queSeHaBloqueado="Tu entrenamiento" />;
                }
                return <WorkoutLogger athleteId={user.id} athleteName={user.full_name} />;
            case 'inbox':
                return <AthleteInbox user={user} onOpenTraining={() => go('planificacion')} />;
            case 'messages':
                return (
                    <ChatPage
                        user={user}
                        chatId={chatId ?? null}
                        onAbrir={(id) => navigate(`/dashboard/mensajes/${id}`, { replace: !chatId })}
                        onCerrar={() => go('')}
                    />
                );
            case 'vbt':
                if (vistaBloqueada('vbt', puerta.resultado, puerta.prefs.billing.blocks)) {
                    return <BloqueoDePago resultado={puerta.resultado} queSeHaBloqueado="El análisis de velocidad" />;
                }
                return <AthleteVbtView athleteId={user.id} />;
            case 'nutrition':
                if (vistaBloqueada('nutricion', puerta.resultado, puerta.prefs.billing.blocks)) {
                    return <BloqueoDePago resultado={puerta.resultado} queSeHaBloqueado="Tu plan de nutrición" />;
                }
                return <AthleteNutritionView user={user} />;
            // Estadísticas sin puerta de pago: es su propio historial.
            case 'stats':
                return <AthleteStatsView user={user} />;
            case 'competitions':
                return <AthleteCompetitionsView user={user} />;
            case 'calendar':
                return (
                    <div className="p-4 md:p-8">
                        <CalendarSection onBack={() => go('')} />
                    </div>
                );
            case 'ranking':
                return <AnvilRanking user={user} onBack={() => go('')} />;
            case 'settings':
                return (
                    <AjustesPage
                        user={user}
                        esStaff={false}
                        esAtleta
                        onBack={() => go('')}
                        onLogout={onLogout}
                        cambiarPanel={panelSwitch ? { label: panelSwitch.label, onClick: panelSwitch.onClick } : undefined}
                        onNavegar={(v) => go(v === 'notifications' ? 'notificaciones' : 'perfil')}
                    />
                );
            case 'notifications':
                return <NotificationSettings userId={user.id} esStaff={isStaff(user)} esAtleta onBack={() => go('ajustes')} />;
            case 'profile':
                return <ProfileSection user={user} onUpdate={() => refetch()} onBack={() => go('')} />;
            case 'store':
                if (!FEATURES.anvilStore) return <Navigate to="/dashboard" replace />;
                return <AnvilStore userId={user.id} />;
            case 'home':
            default:
                return (
                    <AthleteHome
                        user={user}
                        onNavigate={(v) => go(viewToSlug(v))}
                        headerActions={
                            <div className="flex items-center gap-1">
                                {panelSwitch && (
                                    <button
                                        onClick={panelSwitch.onClick}
                                        aria-label={panelSwitch.label}
                                        className="flex h-9 items-center gap-1.5 rounded-pill bg-[var(--brand-quiet)] px-3 text-t-xs font-semibold text-brand-text transition-colors duration-fast hover:bg-[var(--brand-quiet-strong)]"
                                    >
                                        <span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4" aria-hidden="true">{panelSwitch.icon}</span>
                                        <span className="max-w-[92px] truncate">{panelSwitch.shortLabel ?? panelSwitch.label}</span>
                                    </button>
                                )}
                                <NotificationBell userId={user.id} />
                                <AccountMenu onLogout={onLogout} userName={user.full_name} items={menuItems.filter(i => i.hideOnMobileBar)} />
                            </div>
                        }
                    />
                );
        }
    };

    const llenar = slug === '' || slug === 'mensajes';

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
            <ViewTransition transitionKey={slug} llenar={llenar}>{renderContent()}</ViewTransition>
        </DashboardLayout>
    );
}

/** `AthleteHome` navega con los nombres internos de vista. */
function viewToSlug(view: string): Slug {
    const entry = (Object.entries(VIEWS) as [Slug, string][]).find(([, name]) => name === view);
    return entry ? entry[0] : '';
}
