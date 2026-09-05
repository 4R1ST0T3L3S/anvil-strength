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
/*
 * LAS DOS PÁGINAS DE INVITACIÓN, QUE SÍ VIVEN EN LA LANDING.
 *
 * Cuando esta carpeta se separó como "solo promocional" se les quitó la ruta
 * a las dos, pero los componentes se quedaron dentro. El efecto fue que TODOS
 * los enlaces de invitación dejaron de funcionar: `/reclamar/<token>` caía en
 * el comodín `*` y rebotaba a la portada, así que el atleta abría el enlace
 * que le había mandado su entrenador y aterrizaba en la página de "afíliate"
 * sin ninguna explicación.
 *
 * Y tienen que estar AQUÍ y no en otro sitio, porque anvilstrength.es es el
 * dominio que el AndroidManifest.xml declara con `autoVerify` para los
 * prefijos /reclamar/ e /invitacion/: es la dirección que abre la app
 * instalada si la hay, y esta web si no la hay.
 *
 * Son públicas a propósito: quien las abre todavía no tiene cuenta —es
 * literalmente lo que estos dos flujos resuelven—.
 */
const InvitePage = lazy(() => import('../features/auth/pages/InvitePage').then(module => ({ default: module.InvitePage })));
const ClaimAthletePage = lazy(() => import('../features/auth/pages/ClaimAthletePage').then(module => ({ default: module.ClaimAthletePage })));

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

            {/* INVITACIÓN DE UN ENTRENADOR (enlace con código) */}
            <Route path="/invitacion/:code" element={
                <Suspense fallback={<PageSkeleton />}>
                    <InvitePage onLoginClick={onLoginClick} onSignupClick={onSignupClick} />
                </Suspense>
            } />

            {/* RECLAMAR LA FICHA QUE UN ENTRENADOR CREÓ A MANO */}
            <Route path="/reclamar/:token" element={
                <Suspense fallback={<PageSkeleton />}>
                    <ClaimAthletePage />
                </Suspense>
            } />

            {/* TODO LO DEMÁS REBOTA A LA PORTADA */}
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}
