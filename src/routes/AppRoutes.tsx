import { lazy, Suspense, type ReactNode } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { UserProfile } from '../hooks/useUser';
import { useAuth } from '../context/AuthContext';
import { LandingPage } from '../features/landing/pages/LandingPage';
import { DashboardSkeleton } from '../components/skeletons/DashboardSkeleton';
// Lazy Load Pages
const ArenaView = lazy(() => import('../features/arena/pages/ArenaView').then(module => ({ default: module.ArenaView })));
const CompetitionsPage = lazy(() => import('../features/landing/pages/CompetitionsPage').then(module => ({ default: module.CompetitionsPage })));
const AdminDashboard = lazy(() => import('../features/admin/pages/AdminDashboard').then(module => ({ default: module.AdminDashboard })));
const UserDashboard = lazy(() => import('../features/athlete/pages/UserDashboard').then(module => ({ default: module.UserDashboard })));
const CoachDashboard = lazy(() => import('../features/coach/pages/CoachDashboard').then(module => ({ default: module.CoachDashboard })));
const AvisoLegal = lazy(() => import('../features/legal/pages/AvisoLegal').then(module => ({ default: module.AvisoLegal })));
const PoliticaPrivacidad = lazy(() => import('../features/legal/pages/PoliticaPrivacidad').then(module => ({ default: module.PoliticaPrivacidad })));
const PoliticaCookies = lazy(() => import('../features/legal/pages/PoliticaCookies').then(module => ({ default: module.PoliticaCookies })));
const AuthCallback = lazy(() => import('../features/auth/pages/AuthCallback').then(module => ({ default: module.AuthCallback })));

const LegalSuspense = ({ children }: { children: ReactNode }) => (
    <Suspense fallback={
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
            <div className="w-12 h-12 border-4 border-anvil-red border-t-transparent rounded-full animate-spin"></div>
        </div>
    }>
        {children}
    </Suspense>
);

/**
 * ¿Este usuario gestiona a OTROS atletas?
 *
 * Entrenadores y nutricionistas comparten panel: los dos tienen atletas
 * asignados, agenda, calendario y chat, y las diferencias entre ambos son
 * dos entradas de menú, no una aplicación distinta.
 *
 * Antes solo se comprobaba `role === 'coach'`, así que un nutricionista
 * aterrizaba en el panel de ATLETA — con "Mi planificación" y "Mi dieta" en
 * vez de su lista de pacientes— y no tenía ninguna forma de salir de ahí.
 */
const isStaff = (user: UserProfile | null | undefined): boolean =>
    user?.role === 'coach' || user?.role === 'nutritionist';

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

    return (
        <Routes location={location} key={location.pathname}>

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

            {/* --- VUELTA DE UN LOGIN EXTERNO ---
                Google y los enlaces de confirmación de email vuelven aquí.
                Ver src/lib/authRedirect.ts. */}
            <Route path="/auth/callback" element={
                <LegalSuspense><AuthCallback /></LegalSuspense>
            } />

            {/* --- WEB PÚBLICA CON SESIÓN INICIADA ---
                "/" redirige al panel en cuanto hay sesión, así que un coach o
                un atleta no tenían forma de volver a ver la web sin cerrar
                sesión. Esta ruta muestra siempre la portada.
                Va con noindex: es un atajo interno y no debe competir en
                Google con "/", que es la URL canónica de la portada. */}
            <Route path="/inicio" element={
                <LandingPage
                    onLoginClick={onLoginClick}
                    onSignupClick={onSignupClick}
                    user={user}
                    noindex
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
                    <CompetitionsPage onLoginClick={onLoginClick} onSignupClick={onSignupClick} user={user} />
                </Suspense>
            } />

            {/* --- LEGAL PAGES --- */}
            <Route path="/legal/aviso-legal" element={<LegalSuspense><AvisoLegal onLoginClick={onLoginClick} /></LegalSuspense>} />
            <Route path="/legal/privacidad" element={<LegalSuspense><PoliticaPrivacidad onLoginClick={onLoginClick} /></LegalSuspense>} />
            <Route path="/legal/cookies" element={<LegalSuspense><PoliticaCookies onLoginClick={onLoginClick} /></LegalSuspense>} />

            {/* --- 2. RUTA DEDICADA: LA ARENA --- */}
            {/* Importante: ArenaView suele requerir la prop 'user', se la pasamos aquí */}
            <Route path="/dashboard/community" element={
                hasActiveSession && user ? (
                    user.has_access === false ? (
                        <Navigate to="/dashboard" replace />
                    ) : (
                        <Suspense fallback={<DashboardSkeleton />}>
                            <ArenaView user={user} />
                        </Suspense>
                    )
                ) : (
                    <Navigate to="/" replace />
                )
            } />

            {/* --- DASHBOARD ATLETA --- */}
            <Route path="/dashboard" element={
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

            {/* --- DASHBOARD COACH --- */}
            <Route path="/coach-dashboard" element={
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

            {/* --- ADMIN DASHBOARD --- */}
            <Route path="/admin" element={
                !user && !hasActiveSession ? (
                    <Navigate to="/" replace />
                ) : !['anvilstrengthclub@gmail.com', 'anvilstrengthdata@gmail.com'].includes(user?.email || '') ? (
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