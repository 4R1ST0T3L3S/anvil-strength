import { useEffect, useState } from 'react';
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
} from 'lucide-react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import { ViewTransition } from '../../../components/layout/ViewTransition';
import { WelcomeTourModal } from '../../onboarding/components/WelcomeTourModal';

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
import { isStaff } from '../../../lib/roles';

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

    const [showTour, setShowTour] = useTourFlag(user.id);

    // Una ruta inventada (`/dashboard/loquesea`) no puede dejar la pantalla en
    // blanco: se corrige a la de inicio antes de renderizar nada.
    const slug: Slug = isSlug(view) ? ((view ?? '') as Slug) : '';

    const go = (next: Slug) => navigate(next === '' ? '/dashboard' : `/dashboard/${next}`);

    if (!isSlug(view)) return <Navigate to="/dashboard" replace />;

    /**
     * El panel de atleta rechazaba a los entrenadores con un cartel de
     * "Acceso Denegado" sin salida. Un rol que no pinta aquí no es un error
     * del usuario: es una redirección.
     */
    if (isStaff(user)) return <Navigate to="/coach-dashboard" replace />;

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
        {
            icon: <ShoppingBag size={20} />,
            label: 'Tienda Anvil',
            onClick: () => go('tienda'),
            isActive: slug === 'tienda',
            hideOnMobileBar: true,
        },
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

            <WelcomeTourModal isOpen={showTour} onClose={() => setShowTour(false)} />
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

/**
 * El tour de bienvenida se enseña una sola vez por usuario.
 *
 * El estado arranca leyendo `localStorage` en el inicializador y no en un
 * efecto: hacerlo en un efecto pintaba el modal durante un frame a quien ya
 * lo había visto.
 */
function useTourFlag(userId: string): [boolean, (value: boolean) => void] {
    const key = `has_seen_tour_${userId}`;
    const [open, setOpen] = useState(() => localStorage.getItem(key) !== 'true');

    // Se marca como visto en cuanto se abre, no al cerrarlo: si el usuario
    // recarga con el modal abierto, no quiere volver a verlo.
    useEffect(() => {
        if (open) localStorage.setItem(key, 'true');
    }, [key, open]);

    return [open, (value: boolean) => setOpen(value)];
}
