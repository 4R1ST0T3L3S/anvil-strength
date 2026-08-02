/**
 * ANVIL STRENGTH — QUIÉN PUEDE HACER QUÉ
 *
 * Fuente única de verdad para los permisos de la interfaz. Antes cada
 * pantalla decidía por su cuenta y las decisiones no coincidían entre sí:
 *
 *   - `AppRoutes` mandaba a los nutricionistas al panel de coach y
 *     `CoachDashboard` los echaba con "Acceso Denegado", así que un
 *     nutricionista no tenía forma de entrar a ningún sitio.
 *   - La condición de administrador era una lista de dos correos escrita a
 *     mano en SEIS ficheros. Añadir un administrador significaba editarlos
 *     todos y acertar en los seis.
 *
 * Nada de esto comprueba permisos DE VERDAD: eso lo hace la RLS en la base
 * de datos. Esto decide qué se ENSEÑA. Si las dos discrepan, manda la RLS y
 * el usuario ve una pantalla vacía en vez de un error, que es peor. Por eso
 * conviene que digan lo mismo.
 */

import type { UserProfile } from '../hooks/useUser';

/**
 * Correos con administración mientras `profiles.role` no esté migrado.
 *
 * Es una RED DE SEGURIDAD, no el mecanismo. El mecanismo es el rol. Está
 * aquí porque `database/admin_role.sql` todavía tiene que ejecutarse contra
 * producción, y hasta entonces confiar solo en el rol dejaría al dueño del
 * club fuera de su propio panel.
 *
 * Se borra en cuanto la migración esté aplicada. No añadas correos nuevos:
 * añade el rol.
 */
const LEGACY_ADMIN_EMAILS = [
    'anvilstrengthclub@gmail.com',
    'anvilstrengthdata@gmail.com',
] as const;

/** Lo mínimo que necesitan estas funciones. Acepta el perfil entero. */
type RoleBearer = Pick<UserProfile, 'role' | 'email' | 'is_developer'> | null | undefined;

export function isAdmin(user: RoleBearer): boolean {
    if (!user) return false;
    if ((user.role as string) === 'admin') return true;
    return LEGACY_ADMIN_EMAILS.includes(
        (user.email?.toLowerCase() ?? '') as (typeof LEGACY_ADMIN_EMAILS)[number]
    );
}

export const isCoach = (user: RoleBearer): boolean => user?.role === 'coach';

export const isNutritionist = (user: RoleBearer): boolean => user?.role === 'nutritionist';

/**
 * ¿Este usuario gestiona a OTROS atletas?
 *
 * Entrenadores y nutricionistas comparten panel: los dos tienen atletas
 * asignados, agenda, calendario y chat. Las diferencias entre ambos son dos
 * entradas de menú, no una aplicación distinta.
 *
 * El administrador entra también: si no, el dueño del club no puede ver el
 * panel que administra.
 */
/**
 * `is_developer` NO entra aquí.
 *
 * Entraba, y era lo que hacía que cuentas de ATLETA acabaran en el panel de
 * gestión: cualquier perfil con la marca de desarrollador —que se usa para
 * abrir funciones en pruebas, no para dar permisos— aterrizaba en "Mis
 * atletas", con lista de deportistas y agenda de equipo, y sin sus check-ins,
 * su entrenamiento ni su nutrición por ninguna parte. `AppRoutes` incluso
 * redirigía `/dashboard` a `/coach-dashboard`, así que no había forma de
 * llegar a la pantalla correcta.
 *
 * Un desarrollador que además necesite el panel de entrenador tiene que
 * tenerlo por su ROL, que es lo que la RLS comprueba de todas formas: la marca
 * de desarrollador nunca dio acceso real a los datos de otros atletas, solo
 * enseñaba una pantalla que luego salía vacía.
 */
export const isStaff = (user: RoleBearer): boolean =>
    isCoach(user) || isNutritionist(user) || isAdmin(user);

/** El panel de atleta es el destino por defecto de todo el que no es staff. */
export const isAthlete = (user: RoleBearer): boolean => !isStaff(user);

/**
 * A dónde mandar a alguien que acaba de entrar.
 * Un único sitio que lo decida evita los bucles de redirección entre rutas
 * que se contradicen.
 */
export const homeRouteFor = (user: RoleBearer): string =>
    isStaff(user) ? '/coach-dashboard' : '/dashboard';
