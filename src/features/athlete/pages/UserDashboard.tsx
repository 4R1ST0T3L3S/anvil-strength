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
import { AthleteHome } from '../components/AthleteHome';
import { AthleteNutritionView } from '../components/AthleteNutritionView';
import { AthleteCompetitionsView } from '../components/AthleteCompetitionsView';
import { AthleteVbtView } from '../components/AthleteVbtView';
import { RestrictedFeature } from '../../../components/ui/RestrictedFeature';
import { AnvilRanking } from '../components/AnvilRanking';

import { UserProfile, useUser } from '../../../hooks/useUser';
import { isAthlete, tieneAmbosPaneles } from '../../../lib/roles';
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
            label: 'Inicio',
            onClick: () => go(''),
            isActive: slug === '',
        },
        {
            icon: <FileText size={20} />,
            label: 'Entrenar',
            onClick: () => go('planificacion'),
            isActive: slug === 'planificacion',
        },
        {
            icon: <Utensils size={20} />,
            label: 'Nutrición',
            onClick: () => go('nutricion'),
            isActive: slug === 'nutricion',
        },
        {
            icon: <Trophy size={20} />,
            label: 'Competiciones',
            // En la barra del móvil una pestaña mide 73px y "Competiciones"
            // se cortaba. "Competir" cabe entero y además rima con "Entrenar":
            // las cinco pestañas quedan en el mismo registro verbal.
            shortLabel: 'Competir',
            onClick: () => go('competiciones'),
            isActive: slug === 'competiciones',
        },
        {
            icon: <User size={20} />,
            label: 'Perfil',
            onClick: () => go('perfil'),
            isActive: slug === 'perfil',
        },
        // A partir de aquí, fuera de la barra inferior del móvil: cinco
        // pestañas es el techo antes de que los iconos dejen de ser pulsables.
        {
            icon: <Activity size={20} />,
            label: 'Velocidad',
            onClick: () => go('velocidad'),
            isActive: slug === 'velocidad',
            hideOnMobileBar: true,
        },
        {
            icon: <Calendar size={20} />,
            label: 'Calendario AEP',
            onClick: () => go('calendario'),
            isActive: slug === 'calendario',
            hideOnMobileBar: true,
        },
        {
            icon: <Medal size={20} />,
            label: 'Ranking',
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
                label: 'Tienda Anvil',
                onClick: () => go('tienda'),
                isActive: slug === 'tienda',
                hideOnMobileBar: true,
            }]
            : []),
        // CONMUTADOR DE PANEL.
        // Solo para quien tiene los dos: entrena a gente y además le
        // entrenan. Sin esto, esa persona entra en el panel que decida
        // `homeRouteFor` y no tiene ninguna forma visible de llegar al otro
        // —tendría que escribir la URL a mano—, que era exactamente lo que
        // hacía imposible el caso de los roles múltiples.
        ...(tieneAmbosPaneles(user)
            ? [{
                icon: <Users size={20} />,
                label: 'Cambiar a entrenador',
                onClick: () => navigate('/coach-dashboard'),
                isActive: false,
                hideOnMobileBar: true,
            }]
            : []),
    ];

    const renderContent = () => {
        switch (VIEWS[slug]) {
            case 'planning':
                if (user.has_access === false) return <RestrictedFeature title="Planificación Premium" />;
                return <WorkoutLogger athleteId={user.id} athleteName={user.full_name} />;
            case 'vbt':
                if (user.has_access === false) return <RestrictedFeature title="Velocidad Premium" />;
                return <AthleteVbtView athleteId={user.id} />;
            case 'nutrition':
                if (user.has_access === false) return <RestrictedFeature title="Nutrición Premium" />;
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
                return <AthleteHome user={user} onNavigate={(v) => go(viewToSlug(v))} />;
        }
    };

    return (
        <>
            <DashboardLayout
                menuItems={menuItems}
                userId={user.id}
                userName={user.full_name}
                onLogout={onLogout}
                title={TITLES[slug]}
                onBack={slug === '' ? undefined : () => go('')}
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
