import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { UserProfile } from '../hooks/useUser';
import { useAuth } from '../context/AuthContext';
import { LandingPage } from '../features/landing/pages/LandingPage';
import { DashboardSkeleton } from '../components/skeletons/DashboardSkeleton';

// --- NUEVO: Importamos la página de Predicciones ---
// Asegúrate de que la ruta coincida con donde creaste el archivo (features/dashboard/pages...)
import Predictions from '../features/dashboard/pages/Predictions';

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
                <LandingPage
                    onLoginClick={onLoginClick}
                    user={user}
                />
            } />

            {/* --- CAMBIO 2: NUEVA RUTA "LA ARENA" --- */}
            <Route path="/dashboard/predictions" element={
                !user && !hasActiveSession ? (
                    <Navigate to="/" replace />
                ) : !user && hasActiveSession ? (
                    <DashboardSkeleton />
                ) : (
                    // Aquí mostramos la página de predicciones si el usuario existe
                    <Predictions user={user} onLogout={onLogout} />
                )
            } />

            {/* RUTAS EXISTENTES DEL DASHBOARD (Sin cambios) */}
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
        </Routes>
    );
}