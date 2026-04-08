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
        const { error, data } = await supabase
            .from('profiles')
            .update({ role: newRole })
            .eq('id', userId)
            .select();

        if (error) {
            console.error('Error updating user role:', error);
            throw new Error('No se pudo actualizar el rol del usuario');
        }

        if (!data || data.length === 0) {
            throw new Error('Permiso denegado por base de datos (RLS)');
        }
    },

    // Update a user's access flag
    updateUserAccess: async (userId: string, hasAccess: boolean): Promise<void> => {
        const { error, data } = await supabase
            .from('profiles')
            .update({ has_access: hasAccess })
            .eq('id', userId)
            .select();

        if (error) {
            console.error('Error updating user access:', error);
            throw new Error('No se pudo actualizar el acceso del usuario');
        }

        if (!data || data.length === 0) {
            throw new Error('Permiso denegado por base de datos (RLS)');
        }
    },

    // Bulk update users
    updateUsersBulk: async (changedUsers: { id: string, role?: string, has_access?: boolean }[]): Promise<void> => {
        const promises = changedUsers.map(async (u) => {
            const updates: Record<string, unknown> = {};
            if (u.role !== undefined) updates.role = u.role;
            if (u.has_access !== undefined) updates.has_access = u.has_access;
            if (Object.keys(updates).length > 0) {
                const { data, error } = await supabase
                    .from('profiles')
                    .update(updates)
                    .eq('id', u.id)
                    .select(); // Hacemos un select() para comprobar que realmente se devolvieron (y actualizaron) filas

                if (error) throw new Error(`Error actualizando al usuario ${u.id}: ${error.message}`);
                
                // Si data está vacío, significa que RLS (Row Level Security) silenciosamente bloqueó la actualización
                if (!data || data.length === 0) {
                    throw new Error(`Permiso denegado por base de datos (RLS) para el usuario ${u.id}`);
                }
            }
        });
        
        await Promise.all(promises);
    },

    // Assign a coach to an athlete
    updateUserCoach: async (athleteId: string, coachId: string | null): Promise<void> => {
        const { error, data } = await supabase
            .from('profiles')
            .update({ coach_id: coachId })
            .eq('id', athleteId)
            .select();

        if (error) {
            console.error('Error updating user coach:', error);
            throw new Error('No se pudo asignar el entrenador');
        }

        if (!data || data.length === 0) {
            throw new Error('Permiso denegado por base de datos (RLS)');
        }
    },

    // Assign a nutritionist to an athlete
    updateUserNutritionist: async (athleteId: string, nutritionistId: string | null): Promise<void> => {
        const { error, data } = await supabase
            .from('profiles')
            .update({ nutritionist_id: nutritionistId })
            .eq('id', athleteId)
            .select();

        if (error) {
            console.error('Error updating user nutritionist:', error);
            throw new Error('No se pudo asignar el nutricionista');
        }

        if (!data || data.length === 0) {
            throw new Error('Permiso denegado por base de datos (RLS)');
        }
    },

    // Update Coach Branding
    updateCoachBranding: async (coachId: string, updates: { brand_color?: string; logo_url?: string }): Promise<void> => {
        const { error, data } = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', coachId)
            .select();

        if (error) {
            console.error('Error updating coach branding:', error);
            throw new Error('No se pudo actualizar la marca del entrenador');
        }

        if (!data || data.length === 0) {
            throw new Error('Permiso denegado por base de datos (RLS)');
        }
    },

    // Upload Coach Logo
    uploadCoachLogo: async (coachId: string, file: File): Promise<string> => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${coachId}-logo-${Date.now()}.${fileExt}`;
        const filePath = `avatars/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('profiles')
            .upload(filePath, file);

        if (uploadError) {
            console.error('Error uploading coach logo:', uploadError);
            throw new Error('No se pudo subir la imagen del logo');
        }

        const { data } = supabase.storage.from('profiles').getPublicUrl(filePath);
        
        // Update the user profile with the new logo URL
        await adminService.updateCoachBranding(coachId, { logo_url: data.publicUrl });
        
        return data.publicUrl;
    }
};
