import { supabase } from './supabase';

/**
 * CERRAR SESIÓN — LA ÚNICA COPIA
 * =====================================================================
 *
 * Había TRES, y las tres fallaban por el mismo sitio:
 *
 *   App.tsx                 removeItem(cache) → await signOut() → reload()
 *   ProfileSection.tsx      try { await signOut() } → href = '/'
 *   PendingApprovalPage.tsx await signOut() → invalidateQueries → href = '/'
 *
 * POR QUÉ NO FUNCIONABA
 *
 * `supabase.auth.signOut()` sin argumentos usa `scope: 'global'`: es una
 * PETICIÓN AL SERVIDOR para revocar el refresh token en todos los
 * dispositivos. Cuando esa petición falla —y falla en los dos casos más
 * corrientes: el token ya había caducado, o no hay red— la promesa se
 * RECHAZA. En `App.tsx` eso significaba que `window.location.reload()`
 * nunca llegaba a ejecutarse y que `anvil-auth-token` seguía en
 * `localStorage`: pulsabas "Cerrar sesión", no pasaba nada visible, y
 * seguías dentro. Justo el caso de quien va y viene entre la cuenta de
 * entrenador y la de atleta, que es cuando más veces se pulsa.
 *
 * Aquí la revocación en el servidor es un INTENTO —bien si sale, y si no
 * da igual— y el borrado local se hace pase lo que pase. Salir de tu
 * propia sesión no puede depender de que haya cobertura.
 *
 * LO QUE SE BORRA Y LO QUE NO
 *
 * Se borra todo lo que pertenece a la PERSONA. No se toca nada que
 * pertenezca al DISPOSITIVO —el tema, el idioma, el aviso de cookies—:
 * cambiar de cuenta no es motivo para que la aplicación vuelva a
 * preguntar si aceptas las cookies ni para perder el modo oscuro.
 *
 * `anvil:write-queue:v1` es el que de verdad importa de la lista: guarda
 * escrituras pendientes con `tabla:id` y su carga útil. Si el atleta A
 * deja series sin subir y en el mismo móvil entra el atleta B, esa cola se
 * vaciaría contra la sesión de B. La RLS lo rechazaría, pero el sitio
 * donde se corta eso es aquí.
 */

/** Claves exactas que pertenecen a la sesión y no al dispositivo. */
const CLAVES_DE_SESION = [
    /** La sesión de Supabase (ver el `storageKey` de lib/supabase.ts). */
    'anvil-auth-token',
    /** Copia del último perfil, para el arranque en frío (hooks/useUser.ts). */
    'anvil_user_cache',
    /** Escrituras pendientes de subir (lib/offlineQueue.ts). */
    'anvil:write-queue:v1',
];

/**
 * Prefijos de claves por usuario.
 *
 * `sb-` está porque el cliente de Supabase usa ese prefijo por defecto: si
 * alguna vez se creó un cliente sin nuestro `storageKey` —o si cambia en
 * una versión futura de la librería—, su sesión se quedaría escrita ahí y
 * sobreviviría al cierre. Borrar de más aquí no rompe nada.
 */
const PREFIJOS_DE_SESION = ['countdown_prefs_', 'anvil_widgets_', 'sb-'];

function purgarAlmacenamiento(): void {
    try {
        for (const clave of CLAVES_DE_SESION) {
            window.localStorage.removeItem(clave);
        }

        // Recorrido inverso: `removeItem` reindexa, y hacia delante se saltaría
        // la clave siguiente a cada borrado.
        for (let i = window.localStorage.length - 1; i >= 0; i--) {
            const clave = window.localStorage.key(i);
            if (clave && PREFIJOS_DE_SESION.some((p) => clave.startsWith(p))) {
                window.localStorage.removeItem(clave);
            }
        }
    } catch (e) {
        // Modo privado, almacenamiento lleno o bloqueado por el navegador.
        // No puede impedir la salida: la navegación de abajo va igual.
        console.warn('No se pudo limpiar el almacenamiento local al salir:', e);
    }
}

/**
 * Cierra la sesión de verdad y devuelve al usuario a la portada.
 *
 * No devuelve el control: termina en una navegación completa del
 * documento. Quien la llame no tiene que limpiar nada más.
 *
 * `replace` y no `href`: sustituye la entrada actual del historial, así
 * que el botón atrás no devuelve al panel del que se acaba de salir. Y una
 * navegación completa —en vez del `reload()` de antes— tira el árbol de
 * React entero, que es la única forma de garantizar que no queda estado
 * del usuario anterior en memoria.
 */
export async function cerrarSesion(): Promise<void> {
    // 1. Revocar en el servidor. Es lo DESEABLE (cierra la sesión también en
    //    los otros dispositivos), no lo imprescindible.
    try {
        await supabase.auth.signOut();
    } catch (e) {
        console.warn('No se pudo revocar la sesión en el servidor; se cierra en local:', e);
    }

    // 2. Y ahora en local, pase lo que pase arriba. Sin red esta es la que
    //    de verdad saca al usuario.
    try {
        await supabase.auth.signOut({ scope: 'local' });
    } catch {
        // Sin sesión que cerrar. Es el resultado que buscábamos.
    }

    // 3. Barrido manual: la librería solo conoce su propia clave.
    purgarAlmacenamiento();

    // 4. Fuera.
    window.location.replace('/');
}

/**
 * QUE EL BOTÓN ATRÁS NO RESUCITE EL PANEL.
 * =====================================================================
 *
 * Al salir hacemos una navegación completa, así que el documento del panel
 * se va a la caché de retroceso (bfcache) del navegador CON SU ESTADO DE
 * JAVASCRIPT INTACTO. Pulsar atrás no vuelve a ejecutar nada: restaura la
 * página tal cual estaba, con el panel pintado y el usuario dentro. Se ve
 * como si el cierre de sesión no hubiera funcionado, aunque la sesión ya
 * no exista.
 *
 * `pageshow` con `persisted` es el único aviso que da el navegador de que
 * eso ha pasado. Si al volver ya no hay sesión pero la página cree que sí,
 * se recarga y los guardas de ruta hacen su trabajo.
 *
 * Devuelve la función para dejar de vigilar.
 */
export function vigilarRestauracionDeHistorial(haySesionEnPantalla: () => boolean): () => void {
    const alVolver = (evento: PageTransitionEvent) => {
        if (!evento.persisted) return;
        if (!haySesionEnPantalla()) return;

        supabase.auth
            .getSession()
            .then(({ data }) => {
                if (!data.session) window.location.reload();
            })
            .catch(() => {
                /* Si ni siquiera se puede preguntar, no forzamos una recarga. */
            });
    };

    window.addEventListener('pageshow', alVolver);
    return () => window.removeEventListener('pageshow', alVolver);
}
