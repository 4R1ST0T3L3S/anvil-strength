import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { athletes as atletasEstaticos, type Athlete } from '../data/athletes';
import { achievements as logrosEstaticos, type Achievement } from '../data/achievements';

/**
 * ATLETAS Y LOGROS DE LA WEB — DE LA BASE, CON RED DE SEGURIDAD
 * =====================================================================
 *
 * Se editan en /admin/web y viven en `club_athletes` y `club_achievements`
 * (database/CLUB_WEB_2026-10-21.sql). Si la consulta falla o las tablas
 * vienen vacías, la web enseña lo de src/data: una portada sin atletas por
 * un fallo de red sería peor que una con datos de hace un mes.
 */

export interface FilaAtleta {
    id: string;
    slug: string;
    name: string;
    category: string;
    image: string | null;
    description: string | null;
    instagram: string | null;
    last_competition: string | null;
    gl_points: number;
    squat: number;
    bench: number;
    deadlift: number;
    total: number;
    cutout_src: string | null;
    cutout_src800: string | null;
    cutout_width: number | null;
    cutout_height: number | null;
    cutout_scale: number;
    cutout_drop: number;
    video_webm: string | null;
    video_mov: string | null;
    order_index: number;
    visible: boolean;
}

export interface FilaLogro {
    id: string;
    legacy_id: number | null;
    title: string;
    result: string;
    description: string;
    images: string[];
    achieved_on: string | null;
    order_index: number;
    visible: boolean;
}

export function filaAAtleta(f: FilaAtleta): Athlete {
    return {
        id: f.id,
        slug: f.slug,
        name: f.name,
        category: f.category,
        image: f.image ?? '',
        description: f.description ?? undefined,
        instagram: f.instagram ?? undefined,
        stats: {
            lastCompetition: f.last_competition ?? '',
            glPoints: Number(f.gl_points) || 0,
            total: Number(f.total) || 0,
            squat: Number(f.squat) || 0,
            bench: Number(f.bench) || 0,
            deadlift: Number(f.deadlift) || 0,
        },
        recorte: f.cutout_src && f.cutout_width && f.cutout_height
            ? {
                src: f.cutout_src,
                src800: f.cutout_src800 || f.cutout_src,
                ancho: f.cutout_width,
                alto: f.cutout_height,
                encuadre: { escala: Number(f.cutout_scale) || 1, bajar: Number(f.cutout_drop) || 0 },
            }
            : undefined,
        video: f.video_webm || f.video_mov ? { webm: f.video_webm ?? undefined, mov: f.video_mov ?? undefined } : undefined,
    };
}

export function filaALogro(f: FilaLogro): Achievement {
    return { id: f.legacy_id ?? f.id, title: f.title, result: f.result, desc: f.description, images: f.images ?? [] };
}

export const CLAVE_CLUB = ['club-web'] as const;

async function cargar(): Promise<{ atletas: FilaAtleta[]; logros: FilaLogro[] }> {
    const [a, l] = await Promise.all([
        supabase.from('club_athletes').select('*').order('order_index').order('name'),
        supabase.from('club_achievements').select('*').order('order_index'),
    ]);
    if (a.error) throw a.error;
    if (l.error) throw l.error;
    return { atletas: (a.data ?? []) as FilaAtleta[], logros: (l.data ?? []) as FilaLogro[] };
}

/** Todo, visible o no: para el panel de administración. */
export function useClubWebAdmin() {
    return useQuery({ queryKey: [...CLAVE_CLUB, 'admin'], queryFn: cargar });
}

/** Lo que enseña la web pública: visibles, en orden, con respaldo estático. */
export function useClubWeb(): { athletes: Athlete[]; achievements: Achievement[] } {
    const { data } = useQuery({ queryKey: CLAVE_CLUB, queryFn: cargar, staleTime: 5 * 60 * 1000, retry: 1 });
    return useMemo(() => {
        const atletas = data?.atletas.filter((f) => f.visible).map(filaAAtleta);
        const logros = data?.logros.filter((f) => f.visible).map(filaALogro);
        return {
            athletes: atletas && atletas.length > 0 ? atletas : atletasEstaticos,
            achievements: logros && logros.length > 0 ? logros : logrosEstaticos,
        };
    }, [data]);
}

export const clubWebService = {
    async guardarAtleta(f: Partial<FilaAtleta> & { slug: string; name: string }) {
        const fila = { ...f, updated_at: new Date().toISOString() };
        const { error } = f.id
            ? await supabase.from('club_athletes').update(fila).eq('id', f.id)
            : await supabase.from('club_athletes').insert(fila);
        if (error) throw error;
    },
    async borrarAtleta(id: string) {
        const { error } = await supabase.from('club_athletes').delete().eq('id', id);
        if (error) throw error;
    },
    async guardarLogro(f: Partial<FilaLogro> & { title: string }) {
        const fila = { ...f, updated_at: new Date().toISOString() };
        const { error } = f.id
            ? await supabase.from('club_achievements').update(fila).eq('id', f.id)
            : await supabase.from('club_achievements').insert(fila);
        if (error) throw error;
    },
    async borrarLogro(id: string) {
        const { error } = await supabase.from('club_achievements').delete().eq('id', id);
        if (error) throw error;
    },
    async reordenar(tabla: 'club_athletes' | 'club_achievements', orden: { id: string; order_index: number }[]) {
        const r = await Promise.all(orden.map((o) => supabase.from(tabla).update({ order_index: o.order_index }).eq('id', o.id)));
        const e = r.find((x) => x.error)?.error;
        if (e) throw e;
    },
    /** Sube una foto al bucket público y devuelve su URL. */
    async subirFoto(archivo: File, carpeta: 'atletas' | 'logros'): Promise<string> {
        const ext = (archivo.name.split('.').pop() || 'jpg').toLowerCase();
        const ruta = `${carpeta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await supabase.storage.from('club-web').upload(ruta, archivo, { cacheControl: '31536000', upsert: false, contentType: archivo.type });
        if (error) throw error;
        return supabase.storage.from('club-web').getPublicUrl(ruta).data.publicUrl;
    },
};
