import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { UserProfile } from '../hooks/useUser';
import { useAuth } from '../context/AuthContext';
import { LandingPage } from '../features/landing/pages/LandingPage';
import { DashboardSkeleton } from '../components/skeletons/DashboardSkeleton';

// 1. Importamos la VISTA CORRECTA según tu estructura de carpetas
import { ArenaView } from '../features/arena/pages/ArenaView';
import { RopaPage } from '../features/landing/pages/RopaPage';

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
                ) : user?.role === 'coach' ? (
                    <Navigate to="/coach-dashboard" replace />
                ) : (
                    <Navigate to="/dashboard" replace />
                )
            } />

            {/* --- ROPA PAGE --- */}
            <Route path="/ropa" element={<RopaPage onLoginClick={onLoginClick} user={user} />} />

            {/* --- 2. RUTA DEDICADA: LA ARENA --- */}
            {/* Importante: ArenaView suele requerir la prop 'user', se la pasamos aquí */}
            <Route path="/dashboard/community" element={
                hasActiveSession && user ? (
                    <ArenaView user={user} />
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
                ) : user?.role !== 'coach' ? (
                    <Navigate to="/dashboard" replace />
                ) : user ? (
                    <Suspense fallback={<DashboardSkeleton />}>
                        <CoachDashboard user={user} onLogout={onLogout} />
                    </Suspense>
                ) : null
            } />

            {/* --- FALLBACK --- */}
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes >
    );
}