/**
 * ANVIL STRENGTH — QUIÉN PUEDE HACER QUÉ
 *
 * Fuente única de verdad para los permisos de la INTERFAZ. Antes cada
 * pantalla decidía por su cuenta y las decisiones no coincidían entre sí:
 *
 *   - `AppRoutes` mandaba a los nutricionistas al panel de coach y
 *     `CoachDashboard` los echaba con "Acceso Denegado", así que un
 *     nutricionista no tenía forma de entrar a ningún sitio.
 *   - La condición de administrador era una lista de dos correos escrita a
 *     mano en SEIS ficheros.
 *
 * Nada de esto comprueba permisos DE VERDAD: eso lo hace la RLS en la base
 * de datos. Esto decide qué se ENSEÑA. Si las dos discrepan, manda la RLS y
 * el usuario ve una pantalla vacía en vez de un error, que es peor. Por eso
 * conviene que digan lo mismo.
 *
 *
 * UNA PERSONA, VARIOS ROLES
 * =====================================================================
 *
 * El caso que rompió el modelo anterior: alguien que entrena a gente, pauta
 * nutrición y ADEMÁS tiene su propio entrenador. Con un solo rol eso no se
 * puede escribir — o eres entrenador, o eres atleta —, así que ahora los
 * roles son un CONJUNTO y se los pone cada uno.
 *
 * Ver database/ROLES_MULTIPLES.sql, que es donde están las garantías: aquí
 * solo se lee lo que allí se decide.
 *
 *
 * POR QUÉ CAPACIDADES Y NO ROLES
 * ---------------------------------------------------------------------
 *
 * Las pantallas preguntan por lo que quieren HACER (`puede(user,
 * 'planificar_entrenamiento')`) y no por lo que el usuario ES
 * (`isCoach(user)`). La diferencia importa el día que haya que decidir si
 * un miembro del club puede o no entrar en algún sitio: con capacidades se
 * toca UNA tabla de este archivo; con roles habría que buscar los treinta y
 * tres `user.role === '...'` repartidos por la aplicación y acertar en
 * todos.
 *
 * `isCoach` y compañía siguen exportados porque hay pantallas que de verdad
 * preguntan por el rol (qué entrada de menú enseñar, cómo llamar a alguien).
 * Para decidir permisos, `puede()`.
 */

import type { UserProfile } from '../hooks/useUser';

// =====================================================================
// LOS ROLES
// =====================================================================

export const ROLES = ['athlete', 'coach', 'nutritionist', 'member', 'developer', 'admin'] as const;
export type Rol = (typeof ROLES)[number];

/**
 * Los que cada uno se pone y se quita solo, en este orden en pantalla.
 *
 * `developer` y `admin` NO están, y esa ausencia es de seguridad, no de
 * diseño: `set_my_roles()` los descarta en el servidor. La lista de aquí
 * solo decide qué casillas se pintan.
 */
export const ROLES_AUTOGESTIONABLES = ['athlete', 'coach', 'nutritionist', 'member'] as const;
export type RolAutogestionable = (typeof ROLES_AUTOGESTIONABLES)[number];

export const ROL_INFO: Record<Rol, { nombre: string; descripcion: string }> = {
    athlete: {
        nombre: 'Atleta',
        descripcion: 'Recibes entrenamiento y nutrición, registras tus series y llevas tu progreso.',
    },
    coach: {
        nombre: 'Entrenador',
        descripcion: 'Planificas bloques a otras personas. No implica que a ti te programen: para eso marca también Atleta.',
    },
    nutritionist: {
        nombre: 'Nutricionista',
        descripcion: 'Pautas la nutrición de otras personas.',
    },
    member: {
        nombre: 'Miembro del club',
        descripcion: 'Formas parte de Anvil Strength Club. De momento con lo mismo que un atleta; las ventajas de socio llegarán aquí.',
    },
    developer: {
        nombre: 'Desarrollador',
        descripcion: 'Acceso a todo, incluida la trastienda. No es un rol que se elija.',
    },
    admin: {
        nombre: 'Administración',
        descripcion: 'Gestión de usuarios de la plataforma. No es un rol que se elija.',
    },
};

// =====================================================================
// LAS CAPACIDADES
// =====================================================================

/**
 * Lo que se puede HACER. Traducción directa de la especificación:
 *
 *   entrenador   — planifica bloques a otros; NO le pautan a él.
 *   atleta       — solo recibe entrenamiento y nutrición.
 *   nutricionista— solo pauta nutrición.
 *   desarrollador— todo, incluida la trastienda que nadie más debería ver.
 *   miembro      — hoy, lo mismo que un atleta.
 */
export type Capacidad =
    /** Crear y editar bloques de entrenamiento de OTRAS personas. */
    | 'planificar_entrenamiento'
    /** Crear y editar planes de nutrición de OTRAS personas. */
    | 'pautar_nutricion'
    /** Tener un plan de entrenamiento propio y registrar series. */
    | 'recibir_entrenamiento'
    /** Tener un plan de nutrición propio. */
    | 'recibir_nutricion'
    /** Cartera de atletas, agenda de equipo, chat como profesional. */
    | 'gestionar_atletas'
    /** Trastienda: Arena, funciones en pruebas, cosas a medio hacer. */
    | 'ver_trastienda'
    /** Panel de administración: usuarios, roles y accesos de terceros. */
    | 'administrar';

const CAPACIDADES: Record<Rol, Capacidad[]> = {
    athlete: ['recibir_entrenamiento', 'recibir_nutricion'],

    // Ni `recibir_*`: ser entrenador no significa que te entrenen. Quien
    // quiera las dos cosas marca también Atleta, que es justo el caso que
    // motivó todo esto.
    coach: ['planificar_entrenamiento', 'gestionar_atletas'],

    nutritionist: ['pautar_nutricion', 'gestionar_atletas'],

    // Hoy, un atleta. Tiene rol propio desde ya para que las ventajas de
    // socio se puedan colgar de algo sin volver a migrar a nadie.
    member: ['recibir_entrenamiento', 'recibir_nutricion'],

    developer: [
        'planificar_entrenamiento', 'pautar_nutricion',
        'recibir_entrenamiento', 'recibir_nutricion',
        'gestionar_atletas', 'ver_trastienda', 'administrar',
    ],

    admin: [
        'planificar_entrenamiento', 'pautar_nutricion',
        'recibir_entrenamiento', 'recibir_nutricion',
        'gestionar_atletas', 'ver_trastienda', 'administrar',
    ],
};

// =====================================================================
// LECTURA DEL PERFIL
// =====================================================================

/**
 * Correos con administración mientras `profiles.role` no esté migrado.
 * RED DE SEGURIDAD, no mecanismo. Se borra cuando la migración esté
 * aplicada en producción. No añadas correos: añade el rol.
 */
const LEGACY_ADMIN_EMAILS = [
    'anvilstrengthclub@gmail.com',
    'anvilstrengthdata@gmail.com',
] as const;

type RoleBearer =
    | (Pick<UserProfile, 'role' | 'email' | 'is_developer'> & { roles?: string[] | null })
    | null
    | undefined;

/**
 * Los roles de alguien, venga de donde venga su perfil.
 *
 * Tolera que `roles` no exista todavía —la migración es manual y el código
 * se despliega antes— reconstruyéndolo desde `role` e `is_developer`. Sin
 * esto, entre el despliegue y el `psql` TODO el mundo se quedaría sin roles
 * y, por tanto, sin panel.
 */
export function rolesDe(user: RoleBearer): Rol[] {
    if (!user) return [];

    const validos = new Set<string>(ROLES);
    const desdeArray = (user.roles ?? []).filter((r): r is Rol => validos.has(r));
    if (desdeArray.length > 0) {
        // El correo heredado sigue mandando hasta que la migración corra.
        return esAdminHeredado(user) && !desdeArray.includes('admin')
            ? [...desdeArray, 'admin']
            : desdeArray;
    }

    const legado: Rol[] = [];
    if (validos.has(user.role as string)) legado.push(user.role as Rol);
    else legado.push('athlete');
    if (user.is_developer) legado.push('developer');
    if (esAdminHeredado(user) && !legado.includes('admin')) legado.push('admin');
    return legado;
}

const esAdminHeredado = (user: RoleBearer): boolean =>
    LEGACY_ADMIN_EMAILS.includes(
        (user?.email?.toLowerCase() ?? '') as (typeof LEGACY_ADMIN_EMAILS)[number]
    );

/** ¿Tiene este usuario este rol concreto? */
export const tieneRol = (user: RoleBearer, rol: Rol): boolean => rolesDe(user).includes(rol);

/**
 * LA PREGUNTA QUE DEBERÍAN HACER LAS PANTALLAS.
 *
 * Las capacidades se SUMAN entre roles: quien es atleta y entrenador
 * planifica a otros y además recibe su propio plan. Es el caso que el
 * modelo anterior no sabía representar.
 */
export function puede(user: RoleBearer, capacidad: Capacidad): boolean {
    return rolesDe(user).some(rol => CAPACIDADES[rol]?.includes(capacidad));
}

// =====================================================================
// ATAJOS
// =====================================================================

export const isAdmin = (user: RoleBearer): boolean => tieneRol(user, 'admin');

export const isDeveloper = (user: RoleBearer): boolean => tieneRol(user, 'developer');

export const isCoach = (user: RoleBearer): boolean => tieneRol(user, 'coach');

export const isNutritionist = (user: RoleBearer): boolean => tieneRol(user, 'nutritionist');

/**
 * ¿Este usuario gestiona a OTRAS personas?
 *
 * Entrenadores y nutricionistas comparten panel: los dos tienen atletas
 * asignados, agenda, calendario y chat. Las diferencias entre ambos son dos
 * entradas de menú, no una aplicación distinta.
 *
 * Ojo: esto ya NO significa "no es atleta". Desde que los roles se suman,
 * las dos cosas pueden ser ciertas a la vez y las pantallas tienen que
 * preguntar por la que les afecte, no por la contraria.
 */
export const isStaff = (user: RoleBearer): boolean => puede(user, 'gestionar_atletas');

/** ¿Tiene panel de atleta propio? */
export const isAthlete = (user: RoleBearer): boolean => puede(user, 'recibir_entrenamiento');

/** Las dos cosas: necesita poder cambiar de panel. */
export const tieneAmbosPaneles = (user: RoleBearer): boolean =>
    isStaff(user) && isAthlete(user);

/**
 * A dónde mandar a alguien que acaba de entrar.
 *
 * Quien gestiona a otros aterriza en su panel de gestión: si has entrado a
 * programar, la lista de atletas es lo primero que quieres. Quien además es
 * atleta llega igualmente a su panel con el conmutador, que está siempre a
 * un toque.
 */
export const homeRouteFor = (user: RoleBearer): string =>
    isStaff(user) ? '/coach-dashboard' : '/dashboard';
