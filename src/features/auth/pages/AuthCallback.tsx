import { useEffect, useMemo, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useUser } from '../../../hooks/useUser';
import { homeRouteFor } from '../../../lib/roles';
import { getSiteOrigin } from '../../../lib/authRedirect';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';

/**
 * Aterrizaje tras autenticarse con Google o tras confirmar el email.
 *
 * Supabase devuelve al usuario aquí con el token en el fragmento de la URL.
 * El cliente lo canjea solo y dispara `SIGNED_IN`, así que esta pantalla no
 * tiene que hacer nada más que ESPERAR a que el contexto tenga sesión y
 * mandar a cada rol a su panel.
 *
 * Existe como ruta propia, en vez de volver a "/", por dos motivos:
 * es una URL fija y concreta que se puede meter en la lista blanca de
 * Supabase, y evita el parpadeo de portada que se veía mientras la sesión
 * terminaba de restaurarse.
 *
 * LO QUE SE AÑADIÓ, Y POR QUÉ
 * =====================================================================
 * Antes esta pantalla solo sabía hacer dos cosas: girar, o rebotar a la
 * portada a los 8 segundos. Los dos fallos reales del login terminaban
 * ahí, indistinguibles el uno del otro y de "va lento":
 *
 *   1. Supabase devuelve el error EN LA URL (`?error=...` o, más a menudo,
 *      en el fragmento `#error=...`) cuando el usuario cancela en la
 *      pantalla de Google, cuando el enlace de correo ha caducado o cuando
 *      el proveedor rechaza. Eso no es una espera: es una respuesta, y ya
 *      había llegado. Ahora se lee y se dice.
 *
 *   2. Cuando la URL de retorno no está en la lista blanca del panel de
 *      Supabase, el usuario ni siquiera llega hasta aquí: acaba en la
 *      "Site URL" del proyecto, que era la de vercel.app. Eso no se puede
 *      detectar desde el origen del que salimos —ya no somos nosotros
 *      quien recibe—, pero sí se puede detectar el caso hermano: llegar
 *      aquí SIN token y SIN error, que es lo que pasa cuando alguien abre
 *      /auth/callback a pelo o cuando el fragmento se perdió por el
 *      camino. Antes eso giraba 8 segundos; ahora se dice a la primera.
 */

/** Qué trae la URL: la vuelta buena, un error del proveedor, o nada. */
type Aterrizaje =
    | { tipo: 'con-credencial' }
    | { tipo: 'error'; codigo: string; detalle: string | null }
    | { tipo: 'vacio' };

/**
 * Lee la URL una sola vez.
 *
 * Mira el fragmento Y la cadena de consulta porque Supabase usa los dos
 * según el flujo: el implícito devuelve `#access_token=...`, el de código
 * `?code=...`, y los errores aparecen en cualquiera de los dos.
 */
function leerAterrizaje(): Aterrizaje {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const query = new URLSearchParams(window.location.search);
    const de = (clave: string) => hash.get(clave) ?? query.get(clave);

    const error = de('error') ?? de('error_code');
    if (error) {
        return {
            tipo: 'error',
            codigo: error,
            // Viene con `+` en vez de espacios; `URLSearchParams` ya lo deshace.
            detalle: de('error_description'),
        };
    }

    if (de('access_token') || de('code') || de('refresh_token')) {
        return { tipo: 'con-credencial' };
    }

    return { tipo: 'vacio' };
}

/** El error de Supabase, en castellano y con la salida que corresponde. */
function explicar(codigo: string, detalle: string | null): { titulo: string; cuerpo: string } {
    const texto = `${codigo} ${detalle ?? ''}`.toLowerCase();

    if (texto.includes('access_denied') || texto.includes('cancel')) {
        return {
            titulo: 'Has cancelado la entrada',
            cuerpo: 'No se ha creado ninguna sesión. Puedes volver a intentarlo cuando quieras.',
        };
    }
    if (texto.includes('expired') || texto.includes('otp_expired')) {
        return {
            titulo: 'El enlace ha caducado',
            cuerpo: 'Los enlaces de acceso duran poco a propósito. Pide uno nuevo desde la pantalla de entrada.',
        };
    }
    if (texto.includes('redirect') || texto.includes('not allowed')) {
        return {
            titulo: 'Esta dirección de vuelta no está autorizada',
            cuerpo:
                'El proveedor ha rechazado devolverte a este sitio. Es configuración del servidor, no algo ' +
                'que puedas arreglar tú: avisa a Anvil Strength indicando desde qué dirección entraste.',
        };
    }
    return {
        titulo: 'No se ha podido completar la entrada',
        cuerpo: detalle?.trim() || 'El proveedor de identidad ha devuelto un error sin explicación.',
    };
}

export function AuthCallback() {
    const { session, loading: sessionLoading } = useAuth();
    const { data: user, isLoading: userLoading } = useUser();

    // Una sola lectura, al montar: el cliente de Supabase LIMPIA la URL en
    // cuanto canjea el token, así que leerla en cada render devolvería
    // "vacío" a partir del segundo.
    const aterrizaje = useMemo(leerAterrizaje, []);

    // Si el token viniera mal, quedarse aquí girando para siempre sería el
    // peor final posible. A los 8 segundos se da por perdido.
    const [timedOut, setTimedOut] = useState(false);
    useEffect(() => {
        const t = setTimeout(() => setTimedOut(true), 8000);
        return () => clearTimeout(t);
    }, []);

    // 1. Sesión lista: a su panel. Va lo primero para que una vuelta buena
    //    no pase por ninguna de las comprobaciones de abajo.
    if (session && !userLoading) {
        // Quien gestiona atletas va a su panel; el resto, al de atleta. Los
        // usuarios sin perfil todavía cargado caen en /dashboard, que ya sabe
        // esperar a que llegue. Ver src/lib/roles.ts.
        return <Navigate to={homeRouteFor(user)} replace />;
    }

    // 2. El proveedor ha dicho que no. No hay nada que esperar.
    if (aterrizaje.tipo === 'error') {
        const { titulo, cuerpo } = explicar(aterrizaje.codigo, aterrizaje.detalle);
        return <Aviso titulo={titulo} cuerpo={cuerpo} codigo={aterrizaje.codigo} />;
    }

    // 3. Nadie nos ha dado nada y tampoco hay sesión previa. Llegar aquí a
    //    pelo es lo normal en este caso; no es un error que asustar.
    if (aterrizaje.tipo === 'vacio' && !session && !sessionLoading) {
        return (
            <Aviso
                titulo="Aquí no hay nada que confirmar"
                cuerpo={
                    'Esta pantalla solo se usa al volver de Google o de un enlace de correo. ' +
                    'Si venías de uno de los dos, el enlace ha llegado incompleto: vuelve a pedirlo.'
                }
            />
        );
    }

    if (sessionLoading || userLoading || (!timedOut && !session)) {
        return <LoadingSpinner fullscreen message="Entrando…" />;
    }

    // 4. Traía credencial, se agotó el tiempo y no cuajó.
    return (
        <Aviso
            titulo="La entrada ha tardado demasiado"
            cuerpo="La credencial era válida pero la sesión no ha llegado a abrirse. Vuelve a intentarlo."
        />
    );
}

/**
 * Pantalla de aviso.
 *
 * Enseña el origen desde el que se entró porque es EL dato que hace falta
 * para diagnosticar un fallo de lista blanca, y es justo el que el usuario
 * no sabe dar cuando le preguntas. Ver docs/AUTENTICACION.md.
 */
function Aviso({ titulo, cuerpo, codigo }: { titulo: string; cuerpo: string; codigo?: string }) {
    return (
        <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-surface-sunken px-6 text-center text-ink">
            <div className="w-full max-w-md">
                <p className="text-t-xs font-black uppercase tracking-widest text-brand-text">
                    Anvil Strength
                </p>
                <h1 className="mt-4 text-t-2xl font-black uppercase leading-tight text-ink">{titulo}</h1>
                <p className="mt-4 text-t-base leading-relaxed text-ink-muted">{cuerpo}</p>

                <Link
                    to="/"
                    replace
                    className="mt-8 inline-flex items-center justify-center rounded-pill bg-brand px-7 py-3 text-t-sm font-black uppercase tracking-wide text-brand-ink transition-opacity duration-fast hover:opacity-90"
                >
                    Volver a Anvil Strength
                </Link>

                <p className="mt-8 text-t-2xs text-ink-faint">
                    Entraste desde {getSiteOrigin()}
                    {codigo ? ` · ${codigo}` : ''}
                </p>
            </div>
        </div>
    );
}
