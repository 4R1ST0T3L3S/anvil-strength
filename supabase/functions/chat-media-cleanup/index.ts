// Supabase Edge Function: chat-media-cleanup
// =====================================================================
//
// RETENCIÓN DE 15 DÍAS PARA FOTOS Y VÍDEOS DEL CHAT.
//
// La llama pg_cron cada hora (`public.chat_media_cleanup_kick`, ver
// database/NOTIFICACIONES_2026-09-11.sql), y SOLO cuando hay algo que borrar.
// No depende de que nadie abra el chat.
//
// Por qué una función y no SQL: Supabase bloquea el DELETE directo sobre
// `storage.objects` (disparador `protect_objects_delete`). Borrar de verdad
// —el fichero, no solo la fila— exige la API de Storage.
//
// Qué hace:
//   1. Fotos y vídeos caducados: borra el fichero (y su póster) y marca el
//      mensaje con `media_deleted_at`. El mensaje sigue ahí y la app pinta
//      "Vídeo eliminado por antigüedad": ninguna referencia rota.
//   2. Huérfanos: ficheros de más de 24 h que ningún mensaje referencia (un
//      envío cancelado a medias, una app cerrada durante la subida).
//
// Sin JWT; la autenticación es el secreto de Vault que manda pg_cron.
// Despliegue: supabase functions deploy chat-media-cleanup --no-verify-jwt

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const BUCKET = 'chat-media';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
});

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** La API de Storage acepta lotes; se trocean por prudencia. */
async function removeAll(paths: string[]): Promise<number> {
    let removed = 0;
    for (let i = 0; i < paths.length; i += 100) {
        const chunk = paths.slice(i, i + 100);
        const { data, error } = await admin.storage.from(BUCKET).remove(chunk);
        if (error) {
            console.error('remove:', error);
            continue;
        }
        removed += data?.length ?? 0;
    }
    return removed;
}

Deno.serve(async (req) => {
    if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
    if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: 'La función no está configurada.' }, 500);

    const secret = req.headers.get('x-cron-secret') ?? '';
    const { data: ok, error: okError } = await admin.rpc('cron_secret_ok', { p_secret: secret });
    if (okError || ok !== true) return json({ error: 'No autorizado.' }, 401);

    let marked = 0;
    let removed = 0;

    // 1. Caducados, por tandas. Diez vueltas de 200 = 2.000 mensajes por
    //    ejecución, y la siguiente hora sigue donde se quedó.
    for (let round = 0; round < 10; round++) {
        const { data: rows, error } = await admin.rpc('chat_media_expired', { p_limit: 200 });
        if (error) {
            console.error('chat_media_expired:', error);
            break;
        }
        const list = (rows ?? []) as { id: string; paths: string[] | null }[];
        if (list.length === 0) break;

        removed += await removeAll(list.flatMap((r) => r.paths ?? []));

        // Se marca aunque el fichero ya no estuviera: lo que importa es que
        // la app deje de pedirlo.
        const { data: n, error: markError } = await admin.rpc('chat_media_mark_deleted', {
            p_ids: list.map((r) => r.id),
        });
        if (markError) {
            console.error('chat_media_mark_deleted:', markError);
            break;
        }
        marked += Number(n ?? 0);
        if (list.length < 200) break;
    }

    // 2. Huérfanos.
    let orphans = 0;
    const { data: orphanRows, error: orphanError } = await admin.rpc('chat_media_orphans', { p_limit: 500 });
    if (orphanError) {
        console.error('chat_media_orphans:', orphanError);
    } else {
        const names = ((orphanRows ?? []) as { name: string }[]).map((r) => r.name);
        orphans = await removeAll(names);
    }

    return json({ marked, removed, orphans });
});
