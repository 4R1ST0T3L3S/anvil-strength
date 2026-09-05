import { supabase } from '../lib/supabase';
import { ROLES_AUTOGESTIONABLES, type Rol, type RolAutogestionable } from '../lib/roles';

/**
 * PONERSE LOS ROLES UNO MISMO
 *
 * La escritura NO va contra la columna: `profiles.roles` tiene el permiso de
 * UPDATE revocado igual que `role`, precisamente para que un
 * `update({ roles: ['admin'] })` desde la consola del navegador no exista
 * como posibilidad. Ver database/ROLES_MULTIPLES.sql.
 *
 * La única puerta es esta función del servidor, que descarta lo que no sea
 * de libre elección y DEVUELVE el conjunto final. Ese valor de vuelta no es
 * decorativo: es lo que hay que pintar. Si la interfaz asumiera que se ha
 * guardado lo que mandó, un rol filtrado por el servidor seguiría marcado en
 * pantalla y el usuario creería tener un permiso que no tiene.
 */
export const rolesService = {
    async setMyRoles(roles: RolAutogestionable[]): Promise<Rol[]> {
        const limpios = [...new Set(roles)].filter(r =>
            (ROLES_AUTOGESTIONABLES as readonly string[]).includes(r)
        );

        const { data, error } = await supabase.rpc('set_my_roles', { p_roles: limpios });

        if (error) {
            // 42883 = la función no existe todavía. El código se despliega
            // con el push y el SQL se ejecuta a mano, así que esta ventana
            // existe de verdad y merece un mensaje que diga qué hacer.
            if (error.code === '42883' || /set_my_roles/i.test(error.message)) {
                throw new Error(
                    'Los roles todavía no están activados en la base de datos. ' +
                    'Ejecuta database/ROLES_MULTIPLES.sql en Supabase.'
                );
            }
            throw error;
        }

        return (data ?? []) as Rol[];
    },
};
