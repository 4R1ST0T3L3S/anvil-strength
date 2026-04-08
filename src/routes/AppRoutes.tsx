import { lazy, Suspense } from 'react';
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
                ) : user?.role === 'coach' && user?.has_access ? (
                    <Navigate to="/coach-dashboard" replace />
                ) : (
                    <Navigate to="/dashboard" replace />
                )
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

            {/* --- DASHBOARD ATLETA --- */}
            <Route path="/dashboard" element={
                !user && !hasActiveSession ? (
                    <Navigate to="/" replace />
                ) : !user && hasActiveSession ? (
                    <DashboardSkeleton />
                ) : user?.role === 'coach' && user?.has_access ? (
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
                    <Navigate to="/dashboard" replace />
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