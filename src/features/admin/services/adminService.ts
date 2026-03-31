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
    },

    // Bulk update users
    updateUsersBulk: async (changedUsers: { id: string, role?: string, has_access?: boolean }[]): Promise<void> => {
        const promises = changedUsers.map(async (u) => {
            const updates: any = {};
            if (u.role !== undefined) updates.role = u.role;
            if (u.has_access !== undefined) updates.has_access = u.has_access;
            if (Object.keys(updates).length > 0) {
                const { error } = await supabase
                    .from('profiles')
                    .update(updates)
                    .eq('id', u.id);
                if (error) throw new Error(`Error actualizando al usuario ${u.id}`);
            }
        });
        
        await Promise.all(promises);
    },

    // Assign a coach to an athlete
    updateUserCoach: async (athleteId: string, coachId: string | null): Promise<void> => {
        const { error } = await supabase
            .from('profiles')
            .update({ coach_id: coachId })
            .eq('id', athleteId);

        if (error) {
            console.error('Error updating user coach:', error);
            throw new Error('No se pudo asignar el entrenador');
        }
    },

    // Assign a nutritionist to an athlete
    updateUserNutritionist: async (athleteId: string, nutritionistId: string | null): Promise<void> => {
        const { error } = await supabase
            .from('profiles')
            .update({ nutritionist_id: nutritionistId })
            .eq('id', athleteId);

        if (error) {
            console.error('Error updating user nutritionist:', error);
            throw new Error('No se pudo asignar el nutricionista');
        }
    }
};
