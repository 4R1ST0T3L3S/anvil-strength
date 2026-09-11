import { Bell, Check, FileText, Globe, LogOut, Monitor, Moon, SlidersHorizontal, Sun, User, Users, Dumbbell, Languages } from 'lucide-react';
import { PageHeader, Contenido } from '../../../components/layout/PageHeader';
import { List, ListRow } from '../../../components/ui/List';
import { Avatar } from '../../../components/ui/Avatar';
import { SelectorDeIdioma } from '../../../components/ui/SelectorDeIdioma';
import { useTema } from '../../../hooks/useTema';
import type { Tema } from '../../../lib/tema';
import type { UserProfile } from '../../../hooks/useUser';

/**
 * PREFERENCIAS Y AJUSTES
 * =====================================================================
 *
 * La pantalla de Ajustes de iOS, para Anvil: listas agrupadas con un chip
 * de color por fila, y todo lo que antes vivía en la barra lateral (tema,
 * web, salida) más los accesos de configuración (avisos, perfil, y para el
 * entrenador sus preferencias de programación y el diseño del PDF).
 */

const OPCIONES_TEMA: { valor: Tema; etiqueta: string; icono: typeof Sun }[] = [
    { valor: 'sistema', etiqueta: 'Como el sistema', icono: Monitor },
    { valor: 'claro', etiqueta: 'Claro', icono: Sun },
    { valor: 'oscuro', etiqueta: 'Oscuro', icono: Moon },
];

export interface AjustesPageProps {
    user: UserProfile;
    /** Entrenador o nutricionista: enseña sus preferencias de programación y el PDF. */
    esStaff: boolean;
    /** Atleta: enseña el idioma del dispositivo. */
    esAtleta: boolean;
    /** Navega a una vista del panel por su nombre interno. */
    onNavegar: (vista: 'profile' | 'notifications' | 'preferences' | 'pdf_theme') => void;
    onBack: () => void;
    onLogout?: () => void | Promise<void>;
    /** Cambiar al otro panel, si se tienen los dos. */
    cambiarPanel?: { label: string; onClick: () => void };
}

export function AjustesPage({ user, esStaff, esAtleta, onNavegar, onBack, onLogout, cambiarPanel }: AjustesPageProps) {
    const { tema, establecer } = useTema();

    return (
        <Contenido ancho="estrecho">
            <PageHeader titulo="Preferencias y ajustes" atras={{ onClick: onBack }} compacta />
            <div className="space-y-6 px-4 pb-4 sm:px-6 lg:px-8">
                <List>
                    <ListRow
                        avatar={<Avatar nombre={user.full_name} src={user.avatar_url} size={44} />}
                        titulo={user.full_name || 'Mi cuenta'}
                        subtitulo="Perfil, datos y foto"
                        chevron
                        onClick={() => onNavegar('profile')}
                    />
                    {cambiarPanel && (
                        <ListRow
                            icono={esStaff && !esAtleta ? <Dumbbell /> : <Users />}
                            titulo={cambiarPanel.label}
                            chevron
                            onClick={cambiarPanel.onClick}
                        />
                    )}
                </List>

                <List titulo="Apariencia">
                    {OPCIONES_TEMA.map(o => (
                        <ListRow
                            key={o.valor}
                            icono={<o.icono />}
                            titulo={o.etiqueta}
                            onClick={() => establecer(o.valor)}
                            derecha={tema === o.valor ? <Check className="h-[18px] w-[18px] text-brand-text" strokeWidth={2.5} aria-hidden="true" /> : undefined}
                        />
                    ))}
                </List>

                {esAtleta && (
                    <List titulo="Idioma" pie="Solo cambia la web pública y los textos traducidos; el panel va en español.">
                        <div className="flex items-center gap-3 px-4 py-3">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[var(--tint-blue)] text-[var(--tint-blue-ink)]">
                                <Languages size={17} aria-hidden="true" />
                            </span>
                            <SelectorDeIdioma className="flex-1" />
                        </div>
                    </List>
                )}

                <List titulo="Avisos">
                    <ListRow icono={<Bell />} titulo="Avisos" subtitulo="Qué te avisamos y en qué dispositivo" chevron onClick={() => onNavegar('notifications')} />
                </List>

                {esStaff && (
                    <List titulo="Entrenador">
                        <ListRow icono={<SlidersHorizontal />} titulo="Preferencias de programación" subtitulo="Cobros, bloqueos y valores por defecto" chevron onClick={() => onNavegar('preferences')} />
                        <ListRow icono={<FileText />} titulo="Documento PDF" subtitulo="Marca y colores de los planes que exportas" chevron onClick={() => onNavegar('pdf_theme')} />
                    </List>
                )}

                <List>
                    <ListRow icono={<User />} titulo="Mi perfil" chevron onClick={() => onNavegar('profile')} />
                    <ListRow icono={<Globe />} titulo="Ver la web" chevron onClick={() => window.location.assign('/web')} />
                    {onLogout && <ListRow icono={<LogOut />} titulo="Cerrar sesión" destructiva onClick={() => void onLogout()} />}
                </List>
            </div>
        </Contenido>
    );
}
