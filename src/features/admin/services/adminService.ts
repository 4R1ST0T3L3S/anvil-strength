import { supabase } from '../../../lib/supabase';
import { UserProfile } from '../../../hooks/useUser';

export const adminService = {
    // Get all profiles from the database
    getAllUsers: async (): Promise<UserProfile[]> => {
        const { data, error } = await supabase
            .from('profiles')
            .select('*');

        if (error) {
            console.error('Error fetching users detallado:', error);
            throw new Error(`Error de Supabase: ${error.message} (Código: ${error.code})`);
        }

        return data as UserProfile[];
    },

    // Update a user's role (coach/athlete/nutritionist)
    updateUserRole: async (userId: string, newRole: 'coach' | 'athlete' | 'nutritionist'): Promise<void> => {
        const { error } = await supabase
            .from('profiles')
            .update({ role: newRole })
            .eq('id', userId);

        if (error) {
            console.error('Error updating user role:', error);
            throw new Error('No se pudo actualizar el rol del usuario');
        }
    },

    // Update a user's access flag
    updateUserAccess: async (userId: string, hasAccess: boolean): Promise<void> => {
        const { error } = await supabase
            .from('profiles')
            .update({ has_access: hasAccess })
            .eq('id', userId);

        if (error) {
            console.error('Error updating user access:', error);
            throw new Error('No se pudo actualizar el acceso del usuario');
        }
    }
};
