import { useState } from 'react';
import { LayoutDashboard, FileText, Utensils, Trophy, User, Users, CalendarDays, Calendar } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { ViewTransition } from '../../components/layout/ViewTransition';
import { CoachHome } from '../coach/components/CoachHome';
import { AthleteHome } from '../athlete/components/AthleteHome';
import type { UserProfile } from '../../hooks/useUser';

/**
 * BANCO DE PRUEBAS DEL INICIO — SOLO EN DESARROLLO (`/dev/inicio`).
 *
 * El inicio del atleta y el del entrenador tienen que caber en una pantalla
 * de ordenador sin scroll y leerse enteros en un móvil (ver
 * components/layout/InicioPanel.tsx). Comprobarlo detrás del login pide dos
 * cuentas, un equipo y datos; aquí se monta el MISMO árbol —armazón del panel
 * + inicio— con un usuario de mentira y se mide a cualquier tamaño.
 *
 * Las consultas a Supabase salen sin sesión y vuelven vacías: es a propósito.
 * Lo que se mide aquí es la maqueta, no los datos.
 *
 *   /dev/inicio?rol=atleta   (por defecto)
 *   /dev/inicio?rol=coach
 */

const USUARIO = {
    id: '00000000-0000-0000-0000-000000000000',
    full_name: 'Marc Alonso',
    role: 'athlete',
    roles: ['athlete'],
    has_access: true,
    coach_name: 'Javier Bou',
    coach_brand_color: null,
    coach_logo_url: null,
} as unknown as UserProfile;

export function InicioPreview() {
    const [rol] = useState<'atleta' | 'coach'>(() =>
        new URLSearchParams(window.location.search).get('rol') === 'coach' ? 'coach' : 'atleta'
    );

    const menuItems = rol === 'coach'
        ? [
            { icon: <LayoutDashboard size={20} />, label: 'Inicio', onClick: () => {}, isActive: true },
            { icon: <Users size={20} />, label: 'Atletas', onClick: () => {}, isActive: false },
            { icon: <CalendarDays size={20} />, label: 'Agenda', onClick: () => {}, isActive: false },
            { icon: <Calendar size={20} />, label: 'Calendario', onClick: () => {}, isActive: false },
            { icon: <User size={20} />, label: 'Perfil', onClick: () => {}, isActive: false },
        ]
        : [
            { icon: <LayoutDashboard size={20} />, label: 'Inicio', onClick: () => {}, isActive: true },
            { icon: <FileText size={20} />, label: 'Entrenar', onClick: () => {}, isActive: false },
            { icon: <Utensils size={20} />, label: 'Nutrición', onClick: () => {}, isActive: false },
            { icon: <Trophy size={20} />, label: 'Competiciones', shortLabel: 'Competir', onClick: () => {}, isActive: false },
            { icon: <User size={20} />, label: 'Perfil', onClick: () => {}, isActive: false },
        ];

    const usuario = rol === 'coach'
        ? ({ ...USUARIO, role: 'coach', roles: ['coach'] } as unknown as UserProfile)
        : USUARIO;

    return (
        <DashboardLayout
            menuItems={menuItems}
            userName={usuario.full_name}
            onLogout={() => {}}
            hideHeaderOnDesktop
            ajustarAPantalla
        >
            <ViewTransition transitionKey={rol} llenar>
                {rol === 'coach'
                    ? <CoachHome user={usuario} onNavigate={() => {}} />
                    : <AthleteHome user={usuario} onNavigate={() => {}} />}
            </ViewTransition>
        </DashboardLayout>
    );
}
