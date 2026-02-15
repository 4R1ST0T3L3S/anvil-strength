import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { UserProfile } from '../hooks/useUser';
import { useAuth } from '../context/AuthContext';
import { LandingPage } from '../features/landing/pages/LandingPage';
import { DashboardSkeleton } from '../components/skeletons/DashboardSkeleton';

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

            {/* --- CAMBIO 1: PORTADA LIBRE (Adiós Gorila) --- 
                Ahora SIEMPRE muestra la LandingPage, estés logueado o no. 
                Ya no te expulsa al dashboard. 
            */}
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

            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes >
    );
}