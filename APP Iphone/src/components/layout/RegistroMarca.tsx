import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/**
 * EL REGISTRO DE MARCA — LA PORTADA FUERA DEL SISTEMA DE LA APP
 * =====================================================================
 *
 * El rediseño de septiembre de 2026 cambia superficies, tipografía y radios
 * de toda la aplicación, pero la web pública queda FUERA a propósito: tiene
 * su propio registro (Plus Jakarta, Anton, folds drenados en rojo y blanco).
 *
 * `.registro-marca` (src/styles/tokens.css) devuelve a todo lo que cuelga de
 * él los valores con los que se diseñó la portada. Este componente lo pone y,
 * además, lo cuenta por contexto: los modales y menús salen por PORTAL a
 * `<body>`, fuera de este `div`, y sin el contexto un modal abierto desde la
 * portada se pintaría con el sistema de la app.
 */

type Registro = 'app' | 'marca';

const RegistroContext = createContext<Registro>('app');

export function RegistroMarca({ activo = true, children }: { activo?: boolean; children: ReactNode }) {
    return (
        <RegistroContext.Provider value={activo ? 'marca' : 'app'}>
            {/* `contents` cuando no aplica: el envoltorio no genera caja y no
                altera la maquetación de ninguna pantalla de la app. */}
            <div className={activo ? 'registro-marca' : 'contents'}>{children}</div>
        </RegistroContext.Provider>
    );
}

/** Para piezas que salen por portal: la clase que tienen que llevar puesta. */
export function useClaseDeRegistro(): string {
    return useContext(RegistroContext) === 'marca' ? 'registro-marca' : '';
}

/**
 * Decide por la RUTA si se está en la web pública.
 *
 * `/` solo es portada sin sesión: con sesión redirige al panel. El resto de
 * rutas públicas lo son siempre.
 */
export function RegistroPorRuta({ haySesion, children }: { haySesion: boolean; children: ReactNode }) {
    const { pathname } = useLocation();
    const { session } = useAuth();

    const publica =
        (pathname === '/' && !haySesion && !session) ||
        pathname === '/web' ||
        pathname === '/competiciones' ||
        pathname.startsWith('/legal/');

    return <RegistroMarca activo={publica}>{children}</RegistroMarca>;
}
