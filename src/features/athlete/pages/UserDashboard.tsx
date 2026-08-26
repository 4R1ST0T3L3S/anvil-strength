import {
    LayoutDashboard,
    FileText,
    Utensils,
    Calendar,
    Trophy,
    User,
    ShoppingBag,
    Medal,
    Activity,
    Users,
} from 'lucide-react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import { ViewTransition } from '../../../components/layout/ViewTransition';

import { WorkoutLogger } from '../../training/components/WorkoutLogger';
import { CalendarSection } from '../../coach/components/CalendarSection';
import { ProfileSection } from '../../profile/components/ProfileSection';
import { AnvilStore } from '../../profile/components/AnvilStore';
import { NotificationBell } from '../../../components/ui/NotificationBell';
import { SelectorDeTema } from '../../../components/ui/SelectorDeTema';
import { AccountMenu } from '../../../components/layout/DashboardLayout';
import { useMediaQuery } from '../../../hooks/useMediaQuery';
import { AthleteHome } from '../components/AthleteHome';
import { AthleteNutritionView } from '../components/AthleteNutritionView';
import { AthleteCompetitionsView } from '../components/AthleteCompetitionsView';
import { AthleteVbtView } from '../components/AthleteVbtView';
import { BloqueoDePago } from '../../../components/ui/BloqueoDePago';
import { usePuertaDePago } from '../../../hooks/usePuertaDePago';
import { useIdioma } from '../../../hooks/useIdioma';
import { vistaBloqueada } from '../../../lib/billing';
import { AnvilRanking } from '../components/AnvilRanking';

import { UserProfile, useUser } from '../../../hooks/useUser';
import { isAthlete, isCoach, tieneAmbosPaneles } from '../../../lib/roles';
import { FEATURES } from '../../../lib/features';

interface UserDashboardProps {
    user: UserProfile;
    onLogout: () => void;
}

/**
 * Las vistas del panel son RUTAS, no estado local.
 *
 * Antes esto era un `useState`, y el precio se pagaba en cada uso: el botón
 * atrás del móvil sacaba de la aplicación en vez de volver a la pantalla
 * anterior, refrescar devolvía siempre al inicio (justo lo que uno hace
 * cuando algo no carga, perdiendo dónde estaba), y no se podía mandar a
 * nadie un enlace a una pantalla concreta.
 *
 * El slug va en castellano porque la URL la lee el usuario.
 */
const VIEWS = {
    '': 'home',
    planificacion: 'planning',
    velocidad: 'vbt',
    nutricion: 'nutrition',
    competiciones: 'competitions',
    calendario: 'calendar',
    ranking: 'ranking',
    perfil: 'profile',
    tienda: 'store',
} as const;

type Slug = keyof typeof VIEWS;

const isSlug = (value: string | undefined): value is Slug =>
    value === undefined || value === '' || value in VIEWS;

/** Título de la barra superior. El inicio no lleva: ya lo dice el saludo. */
const TITLES: Record<Slug, string | undefined> = {
    '': undefined,
    planificacion: 'Mi planificación',
    velocidad: 'Velocidad (VBT)',
    nutricion: 'Mi nutrición',
    competiciones: 'Mis competiciones',
    calendario: 'Calendario AEP',
    ranking: 'Ranking',
    perfil: 'Mi perfil',
    tienda: 'Tienda Anvil',
};

export function UserDashboard({ user, onLogout }: UserDashboardProps) {
    const navigate = useNavigate();
    const { view } = useParams<{ view: string }>();
    const { refetch } = useUser();
    const isDesktop = useMediaQuery('(min-width: 768px)');

    // Antes de los `return` de mas abajo: los hooks se llaman siempre, en el
    // mismo orden, o React pierde la cuenta.
    const puerta = usePuertaDePago(user.id);
    // Arriba del todo, con el resto de hooks: más abajo hay vueltas tempranas
    // (`<Navigate>`), y un hook detrás de un `return` rompe las reglas de React.
    const { t } = useIdioma();

    // Una ruta inventada (`/dashboard/loquesea`) no puede dejar la pantalla en
    // blanco: se corrige a la de inicio antes de renderizar nada.
    const slug: Slug = isSlug(view) ? ((view ?? '') as Slug) : '';

    const go = (next: Slug) => navigate(next === '' ? '/dashboard' : `/dashboard/${next}`);

    if (!isSlug(view)) return <Navigate to="/dashboard" replace />;

    /**
     * Quien no tiene entrenamiento propio no pinta nada aquí. Un rol que no
     * encaja no es un error del usuario: es una redirección.
     *
     * La condición es `!isAthlete` y NO `isStaff`, y ese cambio es el que
     * hace posible el caso de los roles múltiples. Antes se echaba a
     * cualquiera que gestionara atletas, así que una persona que entrena a
     * gente Y tiene su propio entrenador no podía llegar a su plan: entraba
     * en /dashboard y salía rebotada a /coach-dashboard cada vez, sin
     * ninguna forma de ver sus propias series.
     */
    if (!isAthlete(user)) return <Navigate to="/coach-dashboard" replace />;

    const menuItems = [
        {
            icon: <LayoutDashboard size={20} />,
            label: t('nav.inicio'),
            onClick: () => go(''),
            isActive: slug === '',
        },
        {
            icon: <FileText size={20} />,
            label: t('nav.entrenar'),
            onClick: () => go('planificacion'),
            isActive: slug === 'planificacion',
        },
        {
            icon: <Utensils size={20} />,
            label: t('nav.nutricion'),
            onClick: () => go('nutricion'),
            isActive: slug === 'nutricion',
        },
        {
            icon: <Trophy size={20} />,
            label: t('nav.competiciones'),
            // En la barra del móvil una pestaña mide 73px y "Competiciones"
            // se cortaba. "Competir" cabe entero y además rima con "Entrenar":
            // las cinco pestañas quedan en el mismo registro verbal.
            shortLabel: 'Competir',
            onClick: () => go('competiciones'),
            isActive: slug === 'competiciones',
        },
        {
            icon: <User size={20} />,
            label: t('nav.perfil'),
            onClick: () => go('perfil'),
            isActive: slug === 'perfil',
        },
        // A partir de aquí, fuera de la barra inferior del móvil: cinco
        // pestañas es el techo antes de que los iconos dejen de ser pulsables.
        {
            icon: <Activity size={20} />,
            label: t('nav.velocidad'),
            onClick: () => go('velocidad'),
            isActive: slug === 'velocidad',
            hideOnMobileBar: true,
        },
        {
            icon: <Calendar size={20} />,
            label: t('nav.calendarioAep'),
            onClick: () => go('calendario'),
            isActive: slug === 'calendario',
            hideOnMobileBar: true,
        },
        {
            icon: <Medal size={20} />,
            label: t('nav.ranking'),
            onClick: () => go('ranking'),
            isActive: slug === 'ranking',
            hideOnMobileBar: true,
        },
        // La Tienda Anvil está apagada (ver src/lib/features.ts). No se borra:
        // se retira de la navegación y su ruta redirige al inicio, así que
        // tampoco se llega escribiendo /dashboard/tienda a mano.
        ...(FEATURES.anvilStore
            ? [{
                icon: <ShoppingBag size={20} />,
                label: t('nav.tienda'),
                onClick: () => go('tienda'),
                isActive: slug === 'tienda',
                hideOnMobileBar: true,
            }]
            : []),
    ];

    // CONMUTADOR DE PANEL.
    // Solo para quien tiene los dos: entrena/pauta a gente y además le
    // entrenan. Sin esto, esa persona entra en el panel que decida
    // `homeRouteFor` y no tiene ninguna forma visible de llegar al otro
    // —tendría que escribir la URL a mano—, que era exactamente lo que hacía
    // imposible el caso de los roles múltiples. La etiqueta se ajusta a lo que
    // es: un nutricionista va a "nutrición", no a "entrenador".
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
             * LA PUERTA DE PAGO SUSTITUYE A `has_access`. Decisión K3.
             *
             * Antes, estas tres vistas se cerraban con `user.has_access === false`
             * y un cartel de "Planificación Premium". Eso mezclaba dos cosas
             * que ahora tienen dos nombres:
             *
             *   · `has_access` — la ADMINISTRACIÓN de ANVIL suspende la cuenta.
             *     Se queda, pero ya no cierra el entrenamiento.
             *   · puerta de pago — el ENTRENADOR dice que este atleta no está
             *     al día CON ÉL.
             *
             * Y el cartel de "Premium" era engañoso de todas formas: sugería un
             * plan de suscripción de la plataforma que no existe. Aquí no se
             * vende ningún plan; hay un entrenador esperando un cobro.
             *
             * Lo que NO se toca: chat, perfil, competiciones, calendario,
             * ranking y comunidad (K5). El chat sobre todo — sin él, el atleta
             * no puede ni preguntar cómo pagar.
             */
            case 'planning':
                if (vistaBloqueada('entrenamiento', puerta.resultado, puerta.prefs.billing.blocks)) {
                    return <BloqueoDePago resultado={puerta.resultado} queSeHaBloqueado="Tu entrenamiento" />;
                }
                return <WorkoutLogger athleteId={user.id} athleteName={user.full_name} />;
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
                            isDesktop ? (
                                <div className="flex items-center gap-1">
                                    {panelSwitch && (
                                        <button
                                            onClick={panelSwitch.onClick}
                                            aria-label={panelSwitch.label}
                                            className="flex h-9 items-center gap-1.5 rounded-field border border-brand/25 bg-brand/10 px-2.5 text-t-2xs font-bold uppercase tracking-wide text-brand-text transition-colors duration-fast active:scale-[0.97]"
                                        >
                                            <span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4" aria-hidden="true">{panelSwitch.icon}</span>
                                            <span className="max-w-[92px] truncate">{panelSwitch.shortLabel ?? panelSwitch.label}</span>
                                        </button>
                                    )}
                                    <SelectorDeTema />
                                    <NotificationBell userId={user.id} />
                                    <AccountMenu onLogout={onLogout} userName={user.full_name} items={menuItems.filter(i => i.hideOnMobileBar)} />
                                </div>
                            ) : undefined
                        }
                    />
                );
        }
    };

    return (
        <>
            <DashboardLayout
                menuItems={menuItems}
                userId={user.id}
                userName={user.full_name}
                onLogout={onLogout}
                panelSwitch={panelSwitch}
                title={TITLES[slug]}
                onBack={slug === '' ? undefined : () => go('')}
                hideHeaderOnDesktop={slug === ''}
            >
                {/* La clave hace que el contenido se funda al cambiar de
                    pestaña. Sin ella el cambio es un salto seco y la pantalla
                    parece haberse recargado entera. */}
                <ViewTransition transitionKey={slug}>{renderContent()}</ViewTransition>
            </DashboardLayout>
        </>
    );
}

/**
 * `AthleteHome` navega con los nombres internos de vista, que es lo que
 * conocía cuando esto era estado local. Traducirlos aquí evita tener que
 * tocar la pantalla de inicio y sus botones.
 */
function viewToSlug(view: string): Slug {
    const entry = (Object.entries(VIEWS) as [Slug, string][]).find(([, name]) => name === view);
    return entry ? entry[0] : '';
}
