import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { UserProfile } from '../hooks/useUser';
import { isStaff, isAdmin, isAthlete, puede } from '../lib/roles';
import { useAuth } from '../context/AuthContext';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { AppShellSkeleton } from '../components/skeletons/AppShellSkeleton';
import { useScrollRestoration } from '../hooks/useScrollRestoration';
import { PageSkeleton } from '../components/skeletons/PageSkeleton';
// Lazy Load Pages
const ArenaView = lazy(() => import('../features/arena/pages/ArenaView').then(module => ({ default: module.ArenaView })));
const AdminDashboard = lazy(() => import('../features/admin/pages/AdminDashboard').then(module => ({ default: module.AdminDashboard })));
const UserDashboard = lazy(() => import('../features/athlete/pages/UserDashboard').then(module => ({ default: module.UserDashboard })));
const CoachDashboard = lazy(() => import('../features/coach/pages/CoachDashboard').then(module => ({ default: module.CoachDashboard })));
const NutritionDashboard = lazy(() => import('../features/nutrition/pages/NutritionDashboard').then(module => ({ default: module.NutritionDashboard })));
const AthleteChatView = lazy(() => import('../features/chat/pages/AthleteChatView').then(module => ({ default: module.AthleteChatView })));
const CoachChatManager = lazy(() => import('../features/chat/components/CoachChatManager').then(module => ({ default: module.CoachChatManager })));
const AuthCallback = lazy(() => import('../features/auth/pages/AuthCallback').then(module => ({ default: module.AuthCallback })));
const AnvilGamesHub = lazy(() => import('../features/games/pages/AnvilGamesHub').then(module => ({ default: module.AnvilGamesHub })));
const InvitePage = lazy(() => import('../features/auth/pages/InvitePage').then(module => ({ default: module.InvitePage })));
const ClaimAthletePage = lazy(() => import('../features/auth/pages/ClaimAthletePage').then(module => ({ default: module.ClaimAthletePage })));
const AvisoLegal = lazy(() => import('../features/legal/pages/AvisoLegal').then(module => ({ default: module.AvisoLegal })));
const PoliticaPrivacidad = lazy(() => import('../features/legal/pages/PoliticaPrivacidad').then(module => ({ default: module.PoliticaPrivacidad })));
const PoliticaCookies = lazy(() => import('../features/legal/pages/PoliticaCookies').then(module => ({ default: module.PoliticaCookies })));
const Terminos = lazy(() => import('../features/legal/pages/Terminos').then(module => ({ default: module.Terminos })));
/**
 * Banco de PIEZAS sueltas de negocio. Solo en desarrollo.
 *
 * El ternario es lo que hace que DESAPAREZCA del build, y no basta con
 * envolver la ruta: con un `lazy(() => import(...))` suelto en el módulo,
 * Rollup ve una importación dinámica incondicional y emite el chunk igual
 * aunque nadie llegue a pedirlo. Aquí `import.meta.env.DEV` se sustituye por
 * `false` al compilar, la rama muere y con ella la importación.
 */
const PiezasPreview = import.meta.env.DEV
    ? lazy(() => import('../features/devtools/PiezasPreview').then(module => ({ default: module.PiezasPreview })))
    : null;

/**
 * Banco del SISTEMA DE DISEÑO: todas las primitivas en todos sus estados.
 * El hermano del de arriba — aquel monta piezas de negocio, este las piezas
 * base. Mismo mecanismo de desaparición en producción; ver la nota de
 * PiezasPreview.
 */
const SistemaPreview = import.meta.env.DEV
    ? lazy(() => import('../features/devtools/SistemaPreview').then(module => ({ default: module.SistemaPreview })))
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

    // Ruta nueva → arriba. Volver atrás → donde estabas. Ver el hook: hasta
    // ahora no había ninguna de las dos, y cambiar de pantalla te dejaba a
    // media página en la siguiente.
    useScrollRestoration();

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

            {/* --- ENTRADA ---
                Sin sesión, la pantalla de login. Con sesión, cada uno a su
                panel, tenga o no `has_access` (sin acceso se llega igual al
                perfil para completar los datos). */}
            <Route path="/" element={
                !user && !hasActiveSession ? (
                    <LoginPage />
                ) : isAthlete(user) ? (
                    <Navigate to="/dashboard" replace />
                ) : isStaff(user) ? (
                    <Navigate to="/coach-dashboard" replace />
                ) : (
                    <Navigate to="/" replace />
                )
            } />

            {/* --- BANCOS DE PRUEBAS DE MAQUETACIÓN ---
                Solo en desarrollo. Ver la nota de `PiezasPreview` arriba. */}
            {PiezasPreview && (
                <Route path="/dev/piezas" element={
                    <Suspense fallback={<AppShellSkeleton />}><PiezasPreview /></Suspense>
                } />
            )}

            {SistemaPreview && (
                <Route path="/dev/sistema" element={
                    <Suspense fallback={<PageSkeleton />}><SistemaPreview /></Suspense>
                } />
            )}

            {/* --- INVITACIÓN DE UN ENTRENADOR ---
                Accesible SIN sesión a propósito: el caso normal es alguien
                que todavía no tiene cuenta, y tiene que poder ver de quién
                es la invitación antes de registrarse. */}
            <Route path="/invitacion/:code" element={
                <Suspense fallback={<PageSkeleton />}>
                    <InvitePage onLoginClick={onLoginClick} onSignupClick={onSignupClick} />
                </Suspense>
            } />

            {/* --- RECLAMACIÓN DE UN ATLETA FICTICIO ---
                También SIN sesión: es la alternativa al enlace mágico por
                correo (/invitacion) para quien un entrenador dio de alta a
                mano. Ver ClaimAthletePage. */}
            <Route path="/reclamar/:token" element={
                <Suspense fallback={<PageSkeleton />}>
                    <ClaimAthletePage />
                </Suspense>
            } />

            {/* --- VUELTA DE UN LOGIN EXTERNO ---
                Google y los enlaces de confirmación de email vuelven aquí.
                Ver src/lib/authRedirect.ts. */}
            <Route path="/auth/callback" element={
                <Suspense fallback={<PageSkeleton />}><AuthCallback /></Suspense>
            } />
            
            {/* --- PÁGINAS LEGALES ---
                Accesibles SIN sesión a propósito: el alta enlaza a los
                términos y a la privacidad, y hay que poder leerlos antes de
                registrarse. */}
            <Route path="/legal/aviso-legal" element={
                <Suspense fallback={<PageSkeleton />}><AvisoLegal /></Suspense>
            } />
            <Route path="/legal/privacidad" element={
                <Suspense fallback={<PageSkeleton />}><PoliticaPrivacidad /></Suspense>
            } />
            <Route path="/legal/cookies" element={
                <Suspense fallback={<PageSkeleton />}><PoliticaCookies /></Suspense>
            } />
            <Route path="/legal/terminos" element={
                <Suspense fallback={<PageSkeleton />}><Terminos /></Suspense>
            } />

            {/* --- PERFIL PAGE (For pending users) --- */}
            <Route path="/perfil" element={
                <Navigate to="/dashboard" replace />
            } />

            {/* --- PENDING APPROVAL PAGE (Legacy/Fallback) --- */}
            <Route path="/pending" element={
                <Navigate to="/perfil" replace />
            } />

            {/* --- 2. RUTA DEDICADA: LA ARENA --- */}
            {/* Importante: ArenaView suele requerir la prop 'user', se la pasamos aquí */}
            <Route path="/dashboard/community" element={
                hasActiveSession && user ? (
                    user.has_access === false ? (
                        <Navigate to="/pending" replace />
                    ) : (
                        <Suspense fallback={<AppShellSkeleton />}>
                            <ArenaView user={user} />
                        </Suspense>
                    )
                ) : (
                    <Navigate to="/" replace />
                )
            } />

            <Route path="/dashboard/chat" element={
                hasActiveSession && user ? (
                    <Suspense fallback={<AppShellSkeleton />}>
                        {/* Quien llega a /dashboard/chat PUEDE gestionar
                            atletas (es entrenador o nutricionista) pero quiso
                            entrar por /dashboard: quiere su panel de atleta. El
                            chat también. */}
                        {isAthlete(user) ? (
                            <AthleteChatView user={user} />
                        ) : (
                            <CoachChatManager coach={user} />
                        )}
                    </Suspense>
                ) : (
                    <Navigate to="/" replace />
                )
            } />

            <Route path="/dashboard/games" element={
                hasActiveSession && user ? (
                    <Suspense fallback={<AppShellSkeleton />}>
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
                        <AppShellSkeleton />
                    ) : !isAthlete(user) ? (
                        // Sin panel de atleta —ni siquiera como secundario—.
                        // Redirige al de entrenador. Así un entrenador que
                        // ADEMÁS se entrena puede conmutar con el botón "Cambiar
                        // a atleta" que pone la otra rama.
                        <Navigate to="/coach-dashboard" replace />
                    ) : user ? (
                        <Suspense fallback={<AppShellSkeleton />}>
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
                        <AppShellSkeleton />
                    ) : !isStaff(user) ? (
                        <Navigate to="/dashboard" replace />
                    ) : user ? (
                        <Suspense fallback={<AppShellSkeleton />}>
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
                    <AppShellSkeleton />
                ) : !puede(user, 'pautar_nutricion') ? (
                    // El panel de pautar comidas es de quien pauta nutrición:
                    // nutricionistas (y por herencia, desarrollo/administración).
                    // Se pregunta por la CAPACIDAD y no por `user.role`, que es
                    // el reflejo de un solo rol y dejaba fuera a quien es
                    // nutricionista además de otra cosa.
                    <Navigate to="/dashboard" replace />
                ) : user ? (
                    <Suspense fallback={<AppShellSkeleton />}>
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
                    <Suspense fallback={<AppShellSkeleton />}>
                        <AdminDashboard />
                    </Suspense>
                )
            } />

            {/* --- FALLBACK --- */}
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes >
    );
}
