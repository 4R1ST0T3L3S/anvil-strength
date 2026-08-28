import { lazy, Suspense, useMemo } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { UserProfile } from '../hooks/useUser';
import { isStaff, isAdmin, isAthlete, puede } from '../lib/roles';
import { useAuth } from '../context/AuthContext';
import { LandingPage } from '../features/landing/pages/LandingPage';
import { DashboardSkeleton } from '../components/skeletons/DashboardSkeleton';
import { PwaInstallBlocker } from '../components/pwa/PwaInstallBlocker';
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
const ClaimAthletePage = lazy(() => import('../features/auth/pages/ClaimAthletePage').then(module => ({ default: module.ClaimAthletePage })));
const AvisoLegal = lazy(() => import('../features/legal/pages/AvisoLegal').then(module => ({ default: module.AvisoLegal })));
const PoliticaPrivacidad = lazy(() => import('../features/legal/pages/PoliticaPrivacidad').then(module => ({ default: module.PoliticaPrivacidad })));
const PoliticaCookies = lazy(() => import('../features/legal/pages/PoliticaCookies').then(module => ({ default: module.PoliticaCookies })));
const Terminos = lazy(() => import('../features/legal/pages/Terminos').then(module => ({ default: module.Terminos })));
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

/**
 * Banco de PIEZAS sueltas (el de arriba monta pantallas enteras). Mismo
 * mecanismo de desaparición en producción: el ternario mata la rama y con
 * ella la importación dinámica. Ver la nota de MobilePreview.
 */
const PiezasPreview = import.meta.env.DEV
    ? lazy(() => import('../features/devtools/PiezasPreview').then(module => ({ default: module.PiezasPreview })))
    : null;

function AppLoginFallback({ onLoginClick }: { onLoginClick: () => void }) {
    // Cuando el usuario entra en app.anvilstrength.es y cierra la modal de login,
    // se queda en esta pantalla de fallback en lugar de ver la landing pública.
    return (
        <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-4 text-center">
            <h1 className="text-2xl font-black uppercase text-white mb-6 tracking-wider">Anvil Strength</h1>
            <button onClick={onLoginClick} className="bg-white text-black px-8 py-3 rounded-full font-black uppercase tracking-wider hover:bg-gray-200 transition-colors">
                Iniciar Sesión
            </button>
        </div>
    );
}

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

    // Subdomain routing logic
    const isAppSubdomain = useMemo(() => {
        if (typeof window === 'undefined') return false;
        const urlParams = new URLSearchParams(window.location.search);
        
        // Simulación rápida para que puedas probar la web en localhost poniendo ?env=web
        if (urlParams.get('env') === 'web') return false;
        
        const hostname = window.location.hostname;
        return hostname.startsWith('app.') || hostname === 'localhost' || hostname === '127.0.0.1';
    }, []);

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
                    isAppSubdomain ? (
                        <AppLoginFallback onLoginClick={onLoginClick} />
                    ) : (
                        <LandingPage
                            onLoginClick={onLoginClick}
                            onSignupClick={onSignupClick}
                            user={user}
                        />
                    )
                ) : isAthlete(user) ? (
                    <Navigate to="/dashboard" replace />
                ) : isStaff(user) ? (
                    <Navigate to="/coach-dashboard" replace />
                ) : (
                    <Navigate to="/" replace />
                )
            } />

            {/* --- BANCO DE PRUEBAS DE MAQUETACIÓN ---
                Solo en desarrollo. Ver la nota de `MobilePreview` arriba. */}
            {MobilePreview && (
                <Route path="/dev/movil" element={
                    <Suspense fallback={<DashboardSkeleton />}><MobilePreview /></Suspense>
                } />
            )}

            {PiezasPreview && (
                <Route path="/dev/piezas" element={
                    <Suspense fallback={<DashboardSkeleton />}><PiezasPreview /></Suspense>
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

            {/* --- RECLAMACIÓN DE UN ATLETA FICTICIO ---
                También SIN sesión: es la alternativa al enlace mágico por
                correo (/invitacion) para quien un entrenador dio de alta a
                mano. Ver ClaimAthletePage. */}
            <Route path="/reclamar/:token" element={
                <Suspense fallback={<DashboardSkeleton />}>
                    <ClaimAthletePage />
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

            {/* --- PÁGINAS LEGALES ---
                Accesibles SIN sesión a propósito: son documentos que hay que
                poder leer antes de registrarse, no solo después. Estaban
                escritas desde hace tiempo pero nunca se habían enrutado —
                el enlace del pie de página caía siempre en el comodín "*" y
                volvía a la portada, que es el fallo que se estaba pidiendo
                arreglar. */}
            <Route path="/legal/aviso-legal" element={
                <Suspense fallback={<DashboardSkeleton />}><AvisoLegal onLoginClick={onLoginClick} /></Suspense>
            } />
            <Route path="/legal/privacidad" element={
                <Suspense fallback={<DashboardSkeleton />}><PoliticaPrivacidad onLoginClick={onLoginClick} /></Suspense>
            } />
            <Route path="/legal/cookies" element={
                <Suspense fallback={<DashboardSkeleton />}><PoliticaCookies onLoginClick={onLoginClick} /></Suspense>
            } />
            <Route path="/legal/terminos" element={
                <Suspense fallback={<DashboardSkeleton />}><Terminos onLoginClick={onLoginClick} /></Suspense>
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
                            <PwaInstallBlocker><ArenaView user={user} /></PwaInstallBlocker>
                        </Suspense>
                    )
                ) : (
                    <Navigate to="/" replace />
                )
            } />

            <Route path="/dashboard/chat" element={
                hasActiveSession && user ? (
                    <Suspense fallback={<DashboardSkeleton />}>
                        {/* Quien llega a /dashboard/chat PUEDE gestionar
                            atletas (es entrenador o nutricionista) pero quiso
                            entrar por /dashboard: quiere su panel de atleta. El
                            chat también. */}
                        <PwaInstallBlocker>
                            {isAthlete(user) ? (
                                <AthleteChatView user={user} />
                            ) : (
                                <CoachChatManager coach={user} />
                            )}
                        </PwaInstallBlocker>
                    </Suspense>
                ) : (
                    <Navigate to="/" replace />
                )
            } />

            <Route path="/dashboard/games" element={
                hasActiveSession && user ? (
                    <Suspense fallback={<DashboardSkeleton />}>
                        <PwaInstallBlocker><AnvilGamesHub user={user} /></PwaInstallBlocker>
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
                    ) : !isAthlete(user) ? (
                        // Sin panel de atleta —ni siquiera como secundario—.
                        // Redirige al de entrenador. Así un entrenador que
                        // ADEMÁS se entrena puede conmutar con el botón "Cambiar
                        // a atleta" que pone la otra rama.
                        <Navigate to="/coach-dashboard" replace />
                    ) : user ? (
                        <Suspense fallback={<DashboardSkeleton />}>
                            <PwaInstallBlocker>
                                <UserDashboard
                                    user={user}
                                    onLogout={onLogout}
                                />
                            </PwaInstallBlocker>
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
                            <PwaInstallBlocker>
                                <CoachDashboard user={user} onLogout={onLogout} />
                            </PwaInstallBlocker>
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
                ) : !puede(user, 'pautar_nutricion') ? (
                    // El panel de pautar comidas es de quien pauta nutrición:
                    // nutricionistas (y por herencia, desarrollo/administración).
                    // Se pregunta por la CAPACIDAD y no por `user.role`, que es
                    // el reflejo de un solo rol y dejaba fuera a quien es
                    // nutricionista además de otra cosa.
                    <Navigate to="/dashboard" replace />
                ) : user ? (
                    <Suspense fallback={<DashboardSkeleton />}>
                        <PwaInstallBlocker>
                            <NutritionDashboard user={user} onLogout={onLogout} />
                        </PwaInstallBlocker>
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
                        <PwaInstallBlocker><AdminDashboard /></PwaInstallBlocker>
                    </Suspense>
                )
            } />

            {/* --- FALLBACK --- */}
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes >
    );
}
