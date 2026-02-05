import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { UserProfile } from '../hooks/useUser';
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

    return (
        <Routes location={location} key={location.pathname}>
            <Route path="/" element={
                user ? (
                    user.role === 'coach' ? (
                        <Navigate to="/coach-dashboard" replace />
                    ) : (
                        <Navigate to="/dashboard" replace />
                    )
                ) : (
                    <LandingPage
                        onLoginClick={onLoginClick}
                        user={user}
                    />
                )
            } />
            <Route path="/dashboard" element={
                !user ? (
                    <Navigate to="/" replace />
                ) : user.role === 'coach' ? (
                    <Navigate to="/coach-dashboard" replace />
                ) : (
                    <Suspense fallback={<DashboardSkeleton />}>
                        <UserDashboard
                            user={user}
                            onLogout={onLogout}
                        />
                    </Suspense>
                )
            } />
            <Route path="/coach-dashboard" element={
                !user ? (
                    <Navigate to="/" replace />
                ) : user.role !== 'coach' ? (
                    <Navigate to="/dashboard" replace />
                ) : (
                    <Suspense fallback={<DashboardSkeleton />}>
                        <CoachDashboard user={user} onLogout={onLogout} />
                    </Suspense>
                )
            } />
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}
