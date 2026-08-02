import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { UserProfile } from '../hooks/useUser';
import { isStaff, isAdmin } from '../lib/roles';
import { useAuth } from '../context/AuthContext';
import { LandingPage } from '../features/landing/pages/LandingPage';
import { DashboardSkeleton } from '../components/skeletons/DashboardSkeleton';
// Lazy Load Pages
const ArenaView = lazy(() => import('../features/arena/pages/ArenaView').then(module => ({ default: module.ArenaView })));
const CompetitionsPage = lazy(() => import('../features/landing/pages/CompetitionsPage').then(module => ({ default: module.CompetitionsPage })));
const AdminDashboard = lazy(() => import('../features/admin/pages/AdminDashboard').then(module => ({ default: module.AdminDashboard })));
const UserDashboard = lazy(() => import('../features/athlete/pages/UserDashboard').then(module => ({ default: module.UserDashboard })));
const CoachDashboard = lazy(() => import('../features/coach/pages/CoachDashboard').then(module => ({ default: module.CoachDashboard })));
const NutritionDashboard = lazy(() => import('../features/nutrition/pages/NutritionDashboard').then(module => ({ default: module.NutritionDashboard })));
const AthleteChatView = lazy(() => import('../features/chat/pages/AthleteChatView').then(module => ({ default: module.AthleteChatView })));
const CoachChatManager = lazy(() => import('../features/chat/components/CoachChatManager').then(module => ({ default: module.CoachChatManager })));
const AuthCallback = lazy(() => import('../features/auth/pages/AuthCallback').then(module => ({ default: module.AuthCallback })));
const AnvilGamesHub = lazy(() => import('../features/games/pages/AnvilGamesHub').then(module => ({ default: module.AnvilGamesHub })));
const InvitePage = lazy(() => import('../features/auth/pages/InvitePage').then(module => ({ default: module.InvitePage })));
/**
 * Banco de pruebas de maquetación. Solo en desarrollo.
 *
 * El ternario es lo que hace que DESAPAREZCA del build, y no basta con
 * envolver la ruta: con un `lazy(() => import(...))` suelto en el módulo,
 * Rollup ve una importación dinámica incondicional y emite el chunk igual
 * aunque nadie llegue a pedirlo. Aquí `import.meta.env.DEV` se sustituye por
 * `false` al compilar, la rama muere y con ella la importación.
 */
const MobilePreview = import.meta.env.DEV
    ? lazy(() => import('../features/devtools/MobilePreview').then(module => ({ default: module.MobilePreview })))
    : null;



interface AppRoutesProps {
    user: UserProfile | null | undefined;
    onLoginClick: () => void;
    onSignupClick: () => void;
    onLogout: () => Promise<void>;
}

export function AppRoutes({ user, onLoginClick, onSignupClick, onLogout }: AppRoutesProps) {
    const location = useLocation();
    const { session } = useAuth();

    const hasActiveSession = !!session;

    // Sin `key={location.pathname}` en <Routes>.
    //
    // Esa clave forzaba a React a DESMONTAR y volver a montar el árbol entero
    // en cada cambio de ruta. Con las vistas del panel ahora en la URL, eso
    // significaba tirar el panel y reconstruirlo —perdiendo el estado,
    // volviendo a pedir los datos y parpadeando— cada vez que se toca una
    // pestaña. El enrutador ya sabe qué tiene que cambiar.
    return (
        <Routes location={location}>

            {/* --- PORTADA (Siempre accesible) ---
                Quien tiene sesión entra en su panel, tenga o no `has_access`.
                Antes a los usuarios sin acceso se les devolvía a la portada,
                así que registrarse terminaba justo donde había empezado y no
                había forma de llegar al perfil para completar los datos. */}
            <Route path="/" element={
                !user && !hasActiveSession ? (
                    <LandingPage
                        onLoginClick={onLoginClick}
                        onSignupClick={onSignupClick}
                        user={user}
                    />
                ) : isStaff(user) ? (
                    <Navigate to="/coach-dashboard" replace />
                ) : (
                    <Navigate to="/dashboard" replace />
                )
            } />

            {/* --- BANCO DE PRUEBAS DE MAQUETACIÓN ---
                Solo en desarrollo. Ver la nota de `MobilePreview` arriba. */}
            {MobilePreview && (
                <Route path="/dev/movil" element={
                    <Suspense fallback={<DashboardSkeleton />}><MobilePreview /></Suspense>
                } />
            )}

            {/* --- INVITACIÓN DE UN ENTRENADOR ---
                Accesible SIN sesión a propósito: el caso normal es alguien
                que todavía no tiene cuenta, y tiene que poder ver de quién
                es la invitación antes de registrarse. */}
            <Route path="/invitacion/:code" element={
                <Suspense fallback={<DashboardSkeleton />}>
                    <InvitePage onLoginClick={onLoginClick} onSignupClick={onSignupClick} />
                </Suspense>
            } />

            {/* --- VUELTA DE UN LOGIN EXTERNO ---
                Google y los enlaces de confirmación de email vuelven aquí.
                Ver src/lib/authRedirect.ts. */}
            <Route path="/auth/callback" element={
                <Suspense fallback={<DashboardSkeleton />}><AuthCallback /></Suspense>
            } />
            
            <Route path="/web" element={
                <LandingPage
                    onLoginClick={onLoginClick}
                    onSignupClick={onSignupClick}
                    user={user}
                />
            } />

            {/* --- PERFIL PAGE (For pending users) --- */}
            <Route path="/perfil" element={
                <Navigate to="/dashboard" replace />
            } />

            {/* --- PENDING APPROVAL PAGE (Legacy/Fallback) --- */}
            <Route path="/pending" element={
                <Navigate to="/perfil" replace />
            } />

            {/* --- ROPA PAGE --- */}
            {/* <Route path="/ropa" element={<RopaPage onLoginClick={onLoginClick} user={user} />} /> */}

            {/* --- COMPETICIONES PAGE --- */}
            <Route path="/competiciones" element={
                <Suspense fallback={
                    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
                        <div className="w-12 h-12 border-4 border-anvil-red border-t-transparent rounded-full animate-spin"></div>
                    </div>
                }>
                    <CompetitionsPage onLoginClick={onLoginClick} user={user} />
                </Suspense>
            } />

            {/* --- 2. RUTA DEDICADA: LA ARENA --- */}
            {/* Importante: ArenaView suele requerir la prop 'user', se la pasamos aquí */}
            <Route path="/dashboard/community" element={
                hasActiveSession && user ? (
                    user.has_access === false ? (
                        <Navigate to="/pending" replace />
                    ) : (
                        <Suspense fallback={<DashboardSkeleton />}>
                            <ArenaView user={user} />
                        </Suspense>
                    )
                ) : (
                    <Navigate to="/" replace />
                )
            } />

            <Route path="/dashboard/chat" element={
                hasActiveSession && user ? (
                    <Suspense fallback={<DashboardSkeleton />}>
                        {isStaff(user) ? (
                            <CoachChatManager coach={user} />
                        ) : (
                            <AthleteChatView user={user} />
                        )}
                    </Suspense>
                ) : (
                    <Navigate to="/" replace />
                )
            } />

            <Route path="/dashboard/games" element={
                hasActiveSession && user ? (
                    <Suspense fallback={<DashboardSkeleton />}>
                        <AnvilGamesHub user={user} />
                    </Suspense>
                ) : (
                    <Navigate to="/" replace />
                )
            } />

            <Route path="/dashboard/arena" element={<Navigate to="/dashboard/community" replace />} />

            {/* --- DASHBOARD ATLETA ---
                Dos rutas al mismo elemento en vez de un parámetro opcional:
                `/dashboard` y `/dashboard/<vista>`. Las rutas hermanas con
                segmento fijo (`/dashboard/chat`, `/dashboard/community`,
                `/dashboard/games`) ganan por especificidad, así que siguen
                resolviendo a sus páginas completas y no al panel. */}
            {['/dashboard', '/dashboard/:view'].map(path => (
                <Route key={path} path={path} element={
                    !user && !hasActiveSession ? (
                        <Navigate to="/" replace />
                    ) : !user && hasActiveSession ? (
                        <DashboardSkeleton />
                    ) : isStaff(user) ? (
                        <Navigate to="/coach-dashboard" replace />
                    ) : user ? (
                        <Suspense fallback={<DashboardSkeleton />}>
                            <UserDashboard
                                user={user}
                                onLogout={onLogout}
                            />
                        </Suspense>
                    ) : null
                } />
            ))}

            {/* --- DASHBOARD COACH ---
                La tercera ruta es la ficha de un atleta. Tener URL propia es
                lo que permite volver con el botón atrás y compartir el enlace
                de un atleta concreto. */}
            {['/coach-dashboard', '/coach-dashboard/:view', '/coach-dashboard/atletas/:athleteId'].map(path => (
                <Route key={path} path={path} element={
                    !user && !hasActiveSession ? (
                        <Navigate to="/" replace />
                    ) : !user && hasActiveSession ? (
                        <DashboardSkeleton />
                    ) : !isStaff(user) ? (
                        <Navigate to="/dashboard" replace />
                    ) : user ? (
                        <Suspense fallback={<DashboardSkeleton />}>
                            <CoachDashboard user={user} onLogout={onLogout} />
                        </Suspense>
                    ) : null
                } />
            ))}

            {/* --- NUTRITION DASHBOARD --- */}
            <Route path="/nutrition" element={
                !user && !hasActiveSession ? (
                    <Navigate to="/" replace />
                ) : !user && hasActiveSession ? (
                    <DashboardSkeleton />
                ) : !['coach', 'nutritionist'].includes(user?.role || '') && !user?.is_developer ? (
                    <Navigate to="/dashboard" replace />
                ) : user ? (
                    <Suspense fallback={<DashboardSkeleton />}>
                        <NutritionDashboard user={user} onLogout={onLogout} />
                    </Suspense>
                ) : null
            } />

            {/* --- ADMIN DASHBOARD --- */}
            <Route path="/admin" element={
                !user && !hasActiveSession ? (
                    <Navigate to="/" replace />
                ) : !isAdmin(user) ? (
                    <Navigate to="/" replace />
                ) : (
                    <Suspense fallback={<DashboardSkeleton />}>
                        <AdminDashboard />
                    </Suspense>
                )
            } />

            {/* --- FALLBACK --- */}
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes >
    );
}
