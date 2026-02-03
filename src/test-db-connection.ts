import { supabase } from './lib/supabase';
import { toast } from 'sonner';

/**
 * QA SCRIPT: DATABASE CONNECTIVITY TEST
 * Verifies insertion, reading, and deletion of the Training System Tables.
 */
export async function runDbConnectivityTest() {
    console.log('🚀 Iniciando Test de Conectividad...');
    toast.loading('Ejecutando Test de Base de Datos...');

    try {
        // 1. Get Current User (Coach)
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuario no autenticado. Inicia sesión primero.');

        console.log('👤 Usuario detectado:', user.id);

        // 2. Fetch a dummy athlete (needed for FK)
        // We use the current user as athlete for simplicity to avoid dependency on 'coach_athletes' existence.
        let athleteId = user.id;
        console.log('re Using Athlete ID for test:', athleteId);

        // 3. CREATE BLOCK
        const blockName = `QA_TEST_BLOCK_${Date.now()}`;
        console.log('Step 1: Creating Block...', blockName);

        const { data: block, error: blockError } = await supabase
            .from('training_blocks')
            .insert({
                coach_id: user.id,
                athlete_id: athleteId,
                name: blockName,
                is_active: false
            })
            .select()
            .single();

        if (blockError) throw new Error(`❌ Error creating Block: ${blockError.message}`);
        if (!block) throw new Error('❌ Block created but returned null');
        console.log('✅ Block Created:', block.id);

        // 4. CREATE SESSION
        console.log('Step 2: Creating Session...');
        const { data: session, error: sessionError } = await supabase
            .from('training_sessions')
            .insert({
                block_id: block.id,
                day_number: 999, // Test number
                name: 'QA Session'
            })
            .select()
            .single();

        if (sessionError) throw new Error(`❌ Error creating Session: ${sessionError.message}`);
        console.log('✅ Session Created:', session.id);

        // 5. READ VERIFICATION
        console.log('Step 3: Verification Read...');
        const { data: readBlock, error: readError } = await supabase
            .from('training_blocks')
            .select('*, training_sessions(*)')
            .eq('id', block.id)
            .single();

        if (readError) throw new Error(`❌ Read Verification Failed: ${readError.message}`);
        if (!readBlock) throw new Error('❌ Block not found on read.');

        // Check integrity using "any" to bypass strict typing for this quick test script 
        // if Typescript complains about joins not usually in the type definition.
        if ((readBlock as any).training_sessions.length !== 1) {
            throw new Error('❌ Session integrity check failed. Expected 1 session.');
        }
        console.log('✅ Read Verified. Integrity Check Passed.');

        // 6. CLEANUP
        console.log('Step 4: Cleanup...');
        const { error: deleteError } = await supabase
            .from('training_blocks')
            .delete()
            .eq('id', block.id);

        if (deleteError) throw new Error(`Warning: Cleanup failed: ${deleteError.message}`);
        console.log('✅ Cleanup Successful.');

        // SUCCESS MESSAGE
        console.log('%c✅ BASE DE DATOS OPERATIVA: Tablas y RLS funcionando', 'color: green; font-size: 16px; font-weight: bold;');
        toast.dismiss();
        toast.success('✅ BASE DE DATOS OPERATIVA: Test superado.');
        return true;

    } catch (error: any) {
        console.error('❌ TEST FALLIDO:', error);
        toast.dismiss();
        toast.error(`❌ TEST FALLIDO: ${error.message}`);
        return false;
    }
}
