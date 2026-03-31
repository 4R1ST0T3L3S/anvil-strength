import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testQuery() {
    console.log("Testing query...");
    
    // First let's just see ALL exercises with a vbt_file_url
    const { data: allVbts, error: err1 } = await supabase
        .from('session_exercises')
        .select('*')
        .not('vbt_file_url', 'is', null);
        
    console.log("Total session_exercises with VBT:", allVbts?.length);
    if (err1) console.error("Err1:", err1);
    
    if (allVbts && allVbts.length > 0) {
        console.log("Sample:", allVbts[0]);
    }

    // Now testing the full join
    const { data, error } = await supabase
        .from('session_exercises')
        .select(`
            id,
            vbt_file_url,
            training_sessions!inner(
                block_id,
                training_blocks!inner(
                    athlete_id
                )
            )
        `)
        .not('vbt_file_url', 'is', null);
        
    console.log("Query with joins:", JSON.stringify(data, null, 2));
    if (error) console.error("Error with join:", error);
}

testQuery();
