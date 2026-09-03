import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useScrollRestoration } from '../hooks/useScrollRestoration';
import { PageSkeleton } from '../components/skeletons/PageSkeleton';

// Pages
import { LandingPage } from '../features/landing/pages/LandingPage';
const CompetitionsPage = lazy(() => import('../features/landing/pages/CompetitionsPage').then(module => ({ default: module.CompetitionsPage })));
const AvisoLegal = lazy(() => import('../features/legal/pages/AvisoLegal').then(module => ({ default: module.AvisoLegal })));
const PoliticaPrivacidad = lazy(() => import('../features/legal/pages/PoliticaPrivacidad').then(module => ({ default: module.PoliticaPrivacidad })));
const PoliticaCookies = lazy(() => import('../features/legal/pages/PoliticaCookies').then(module => ({ default: module.PoliticaCookies })));
const Terminos = lazy(() => import('../features/legal/pages/Terminos').then(module => ({ default: module.Terminos })));
const AuthCallback = lazy(() => import('../features/auth/pages/AuthCallback').then(module => ({ default: module.AuthCallback })));

interface AppRoutesProps {
    user: any;
    onLoginClick: () => void;
    onSignupClick: () => void;
    onLogout: () => Promise<void>;
}

export function AppRoutes({ user, onLoginClick, onSignupClick }: AppRoutesProps) {
    const location = useLocation();
    useScrollRestoration();

    return (
        <Routes location={location}>
            {/* PORTADA SIEMPRE ACCESIBLE */}
            <Route path="/" element={
                <LandingPage
                    onLoginClick={onLoginClick}
                    onSignupClick={onSignupClick}
                    user={user}
                />
            } />
            
            {/* CALLBACK DE AUTH */}
            <Route path="/auth/callback" element={
                <Suspense fallback={<PageSkeleton />}><AuthCallback /></Suspense>
            } />

            {/* PÁGINAS LEGALES Y DE INFO */}
            <Route path="/competiciones" element={
                <Suspense fallback={<PageSkeleton />}>
                    <CompetitionsPage onLoginClick={onLoginClick} user={user} />
                </Suspense>
            } />
            <Route path="/legal/aviso-legal" element={
                <Suspense fallback={<PageSkeleton />}><AvisoLegal onLoginClick={onLoginClick} /></Suspense>
            } />
            <Route path="/legal/privacidad" element={
                <Suspense fallback={<PageSkeleton />}><PoliticaPrivacidad onLoginClick={onLoginClick} /></Suspense>
            } />
            <Route path="/legal/cookies" element={
                <Suspense fallback={<PageSkeleton />}><PoliticaCookies onLoginClick={onLoginClick} /></Suspense>
            } />
            <Route path="/legal/terminos" element={
                <Suspense fallback={<PageSkeleton />}><Terminos onLoginClick={onLoginClick} /></Suspense>
            } />

            {/* TODO LO DEMÁS REBOTA A LA PORTADA */}
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}
