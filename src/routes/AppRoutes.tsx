import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { UserProfile } from '../hooks/useUser';
import { useAuth } from '../context/AuthContext';
import { LandingPage } from '../features/landing/pages/LandingPage';
import { DashboardSkeleton } from '../components/skeletons/DashboardSkeleton';
import { ProfilePage } from '../features/profile/pages/ProfilePage';

// 1. Importamos la VISTA CORRECTA según tu estructura de carpetas
import { ArenaView } from '../features/arena/pages/ArenaView';
// import { RopaPage } from '../features/landing/pages/RopaPage';
import { CompetitionsPage } from '../features/landing/pages/CompetitionsPage';
import { AdminDashboard } from '../features/admin/pages/AdminDashboard';

// Lazy Load Pages
const UserDashboard = lazy(() => import('../features/athlete/pages/UserDashboard').then(module => ({ default: module.UserDashboard })));
const CoachDashboard = lazy(() => import('../features/coach/pages/CoachDashboard').then(module => ({ default: module.CoachDashboard })));

interface AppRoutesProps {
    user: UserProfile | null | undefined;
    onLoginClick: () => void;
    onLogout: () => Promise<void>;
}

export function AppRoutes({ user, onLoginClick, onLogout }: AppRoutesProps) {
    const location = useLocation();
    const { session } = useAuth();

    const hasActiveSession = !!session;

    return (
        <Routes location={location} key={location.pathname}>

            {/* --- PORTADA (Siempre accesible) --- */}
            <Route path="/" element={
                !user && !hasActiveSession ? (
                    <LandingPage
                        onLoginClick={onLoginClick}
                        user={user}
                    />
                ) : user?.has_access === false ? (
                    <LandingPage
                        onLoginClick={onLoginClick}
                        user={user}
                    />
                ) : user?.role === 'coach' ? (
                    <Navigate to="/coach-dashboard" replace />
                ) : (
                    <Navigate to="/dashboard" replace />
                )
            } />

            {/* --- PERFIL PAGE (For pending users) --- */}
            <Route path="/perfil" element={
                !user && !hasActiveSession ? (
                    <Navigate to="/" replace />
                ) : user?.has_access ? (
                    <Navigate to="/dashboard" replace />
                ) : user ? (
                    <ProfilePage user={user} onLoginClick={onLoginClick} />
                ) : (
                    <Navigate to="/" replace />
                )
            } />

            {/* --- PENDING APPROVAL PAGE (Legacy/Fallback) --- */}
            <Route path="/pending" element={
                <Navigate to="/perfil" replace />
            } />

            {/* --- ROPA PAGE --- */}
            {/* <Route path="/ropa" element={<RopaPage onLoginClick={onLoginClick} user={user} />} /> */}

            {/* --- COMPETICIONES PAGE --- */}
            <Route path="/competiciones" element={<CompetitionsPage onLoginClick={onLoginClick} user={user} />} />

            {/* --- 2. RUTA DEDICADA: LA ARENA --- */}
            {/* Importante: ArenaView suele requerir la prop 'user', se la pasamos aquí */}
            <Route path="/dashboard/community" element={
                hasActiveSession && user ? (
                    user.has_access === false ? (
                        <Navigate to="/pending" replace />
                    ) : (
                        <ArenaView user={user} />
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
                ) : user?.has_access === false ? (
                    <Navigate to="/perfil" replace />
                ) : user?.role === 'coach' ? (
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
                ) : user?.has_access === false ? (
                    <Navigate to="/perfil" replace />
                ) : user?.role !== 'coach' ? (
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
                ) : user?.email !== 'anvilstrength@gmail.com' ? (
                    <Navigate to="/" replace />
                ) : (
                    <AdminDashboard />
                )
            } />

            {/* --- FALLBACK --- */}
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes >
    );
}