#!/usr/bin/env node
/**
 * ¿DE VERDAD PROTEGE LA BASE DE DATOS, O SOLO LO PARECE?
 * =====================================================================
 *
 * `src/lib/roles.ts` lo dice en su propia cabecera: "nada de esto comprueba
 * permisos DE VERDAD: eso lo hace la RLS". Este guion lo COMPRUEBA en vez
 * de creérselo.
 *
 * Pide cada tabla sensible con la clave ANÓNIMA —la misma que lleva
 * cualquiera que abra la web y mire el código fuente— y mira qué contesta
 * PostgREST. Es la sonda que ya estaba documentada en el proyecto, aquí
 * automatizada para poder repetirla después de cada migración.
 *
 * CÓMO SE LEE LA RESPUESTA
 *
 *   200 con filas    → LA TABLA ESTÁ ABIERTA. Fuga, salvo que sea pública
 *                      a propósito (el calendario de competiciones lo es).
 *   200 con 0 filas  → depende: puede ser que la RLS filtre bien, o que la
 *                      tabla esté vacía. NO prueba que esté protegida; por
 *                      eso las de `authenticated` se cuentan aparte.
 *   401 + 42501      → existe y la RLS/GRANT la cierran. ES LO CORRECTO.
 *   404 + PGRST205   → la tabla no existe (migración sin ejecutar).
 *   400 + 42703      → la tabla existe pero esa columna no.
 *
 * USO
 *
 *     node scripts/sonda-rls.mjs
 *
 * Lee VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY de .env.local. No escribe
 * nada: son todo peticiones de lectura.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

function leerEnv() {
    const texto = readFileSync(join(RAIZ, '.env.local'), 'utf8');
    const env = {};
    for (const linea of texto.split('\n')) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linea);
        if (m) env[m[1]] = m[2].trim();
    }
    return env;
}

const env = leerEnv();
const URL = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;

if (!URL || !ANON) {
    console.error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env.local');
    process.exit(1);
}

/**
 * Qué se espera de cada tabla.
 *
 *   'cerrada'  — un anónimo NO puede leer nada. Si devuelve filas, es fuga.
 *   'publica'  — se lee sin sesión a propósito.
 */
const TABLAS = [
    // Lo que de verdad dolería que se filtrase.
    { tabla: 'profiles', espera: 'cerrada', que: 'perfiles de usuarios' },
    { tabla: 'training_blocks', espera: 'cerrada', que: 'bloques de entrenamiento' },
    { tabla: 'training_sessions', espera: 'cerrada', que: 'sesiones' },
    { tabla: 'training_sets', espera: 'cerrada', que: 'series' },
    { tabla: 'session_exercises', espera: 'cerrada', que: 'ejercicios de sesión' },
    { tabla: 'coach_athletes', espera: 'cerrada', que: 'quién entrena a quién' },
    { tabla: 'coach_invites', espera: 'cerrada', que: 'códigos de invitación' },
    { tabla: 'chat_messages', espera: 'cerrada', que: 'mensajes del chat' },
    { tabla: 'form_responses', espera: 'cerrada', que: 'check-ins' },
    { tabla: 'athlete_payments', espera: 'cerrada', que: 'pagos' },
    { tabla: 'training_goals', espera: 'cerrada', que: 'objetivos del coach' },
    { tabla: 'athlete_exercise_maxes', espera: 'cerrada', que: 'máximos' },

    // Las tablas nuevas de esta tanda.
    { tabla: 'volume_targets', espera: 'cerrada', que: 'objetivos de volumen (NUEVA)' },
    { tabla: 'season_phases', espera: 'cerrada', que: 'fases de temporada (NUEVA)' },

    // Pública a propósito: el calendario oficial de competiciones.
    { tabla: 'competitions', espera: 'publica', que: 'calendario de competiciones' },
];

async function sondear({ tabla }) {
    const url = `${URL}/rest/v1/${tabla}?select=*&limit=1`;
    try {
        const r = await fetch(url, {
            headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
        });
        const cuerpo = await r.text();
        let filas = null;
        try {
            const j = JSON.parse(cuerpo);
            if (Array.isArray(j)) filas = j.length;
        } catch { /* no era JSON de filas */ }
        return { estado: r.status, filas, cuerpo: cuerpo.slice(0, 160) };
    } catch (e) {
        return { estado: 0, filas: null, cuerpo: String(e).slice(0, 120) };
    }
}

console.log(`\nSondeando ${URL} con la clave ANÓNIMA\n`);

let fugas = 0;
let sinMigrar = 0;

for (const t of TABLAS) {
    const r = await sondear(t);
    let veredicto;
    let marca;

    if (r.estado === 404 || /PGRST205/.test(r.cuerpo)) {
        veredicto = 'NO EXISTE — migración sin ejecutar';
        marca = '·';
        sinMigrar++;
    } else if (r.estado === 401 || /42501/.test(r.cuerpo)) {
        veredicto = 'cerrada por RLS/GRANT';
        marca = t.espera === 'cerrada' ? '✓' : '!';
    } else if (r.estado === 200 && r.filas === 0) {
        veredicto = t.espera === 'cerrada'
            ? 'sin filas para anon (correcto, o vacía)'
            : 'sin filas — ¿vacía?';
        marca = '✓';
    } else if (r.estado === 200 && r.filas > 0) {
        if (t.espera === 'publica') {
            veredicto = `${r.filas} fila(s) — pública a propósito`;
            marca = '✓';
        } else {
            veredicto = `${r.filas} FILA(S) LEGIBLES SIN SESIÓN — FUGA`;
            marca = '✗';
            fugas++;
        }
    } else {
        veredicto = `${r.estado} — ${r.cuerpo}`;
        marca = '?';
    }

    console.log(`  ${marca}  ${t.tabla.padEnd(24)} ${t.que.padEnd(34)} ${veredicto}`);
}

console.log('');
if (fugas > 0) {
    console.log(`✗ ${fugas} tabla(s) se leen SIN SESIÓN. Hay que cerrarlas.\n`);
    process.exitCode = 1;
} else {
    console.log('✓ Ninguna tabla sensible se lee sin sesión.\n');
}
if (sinMigrar > 0) {
    console.log(`${sinMigrar} tabla(s) todavía no existen: falta ejecutar su SQL de database/.\n`);
}
