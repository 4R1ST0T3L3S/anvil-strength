#!/usr/bin/env node
/**
 * ANVIL STRENGTH — ¿QUÉ HAY DE VERDAD EN LA BASE DE DATOS?
 * =====================================================================
 *
 * POR QUÉ EXISTE
 *
 * `git push` despliega el código del navegador y NADA MÁS. Las migraciones
 * de `database/` se ejecutan a mano y las funciones de borde se despliegan a
 * mano, así que siempre hay una ventana en la que la aplicación pide algo que
 * el servidor todavía no sabe hacer.
 *
 * Eso, por sí solo, sería llevadero. Lo que no lo es: la LISTA de lo que
 * falta se llevaba a mano, en una nota, y la nota se desactualizaba. El
 * 21/08/2026 esa nota daba por pendientes NUEVE migraciones; sondeando de
 * verdad resultó que siete ya estaban aplicadas, y que la única rota de
 * verdad —la página pública de competiciones— no figuraba en la lista.
 *
 * Un inventario que hay que actualizar a mano es un inventario que miente.
 * Este script pregunta.
 *
 *     npm run db:check
 *
 *
 * CÓMO SE LEE UNA RESPUESTA DE POSTGREST (esto es lo que cuesta acertar)
 * ---------------------------------------------------------------------
 *
 *   200                → existe, y `anon` puede leerlo
 *   401 + 42501        → EXISTE y la RLS o el GRANT lo cierran. En una
 *                        función, es la respuesta CORRECTA: están revocadas
 *                        de `anon` a propósito
 *   400 + 42703        → la TABLA existe pero esa COLUMNA no
 *   404 + PGRST205     → la tabla no existe
 *   404 + PGRST202     → no hay ninguna función con ese nombre Y ESA FIRMA
 *
 * La última es la trampa: llamar a una función de dos argumentos sin
 * argumentos da 404 aunque la función exista. Por eso cada entrada de
 * `FUNCIONES` trae sus nombres de parámetro reales — sin ellos la sonda
 * daría un falso negativo, que es exactamente el error que este script viene
 * a evitar.
 *
 * Usa la clave ANÓNIMA, la misma que va en el paquete del navegador: no hay
 * ningún secreto aquí y no lee ni un dato personal (`limit=0` en las tablas,
 * identificadores nulos en las funciones).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const UUID_NULO = '00000000-0000-0000-0000-000000000000';

// =====================================================================
// EL INVENTARIO
// =====================================================================
//
// Una entrada por cosa que el código da por hecha. `archivo` es lo que hay
// que ejecutar si falta, y `rompe` describe qué se ve mal en pantalla
// mientras tanto — sin eso, un "FALTA" no dice si urge o no.

/** Tablas y columnas. `columna` en una tabla que existe distingue las dos. */
const TABLAS = [
    { tabla: 'profiles', columna: 'account_status', archivo: 'athlete_lifecycle.sql' },
    { tabla: 'profiles', columna: 'coach_prefs', archivo: 'REESTRUCTURACION_2026-08.sql' },
    { tabla: 'profiles', columna: 'athlete_prefs', archivo: 'REESTRUCTURACION_2026-08.sql' },
    { tabla: 'profiles', columna: 'pdf_theme', archivo: 'pdf_theme.sql' },
    { tabla: 'coach_athletes', columna: 'status', archivo: 'athlete_lifecycle.sql' },
    { tabla: 'coach_athletes', columna: 'notes', archivo: 'REESTRUCTURACION_2026-08.sql' },
    { tabla: 'coach_athletes', columna: 'billing_mode', archivo: 'PAGOS_2026-08-23.sql',
      rompe: 'El control de pagos por atleta (exento / suspendido) no se puede fijar.' },
    { tabla: 'session_exercises', columna: 'section', archivo: 'CALENTAMIENTO_ESTRUCTURADO.sql',
      rompe: 'Resumen y Registro del atleta se quedan EN BLANCO: las dos consultas piden la columna sin guarda.' },
    { tabla: 'session_exercises', columna: 'round_count', archivo: 'CALENTAMIENTO_ESTRUCTURADO.sql' },
    { tabla: 'training_sets', columna: 'target_metric', archivo: 'MIGRACION_PENDIENTE.sql',
      rompe: 'El coach no puede guardar series: PostgREST rechaza el lote entero con PGRST204.' },
    { tabla: 'training_blocks', columna: 'release_offset_days', archivo: 'week_visibility_and_scheduling.sql' },
    { tabla: 'training_weeks', columna: 'is_visible', archivo: 'week_visibility_and_scheduling.sql' },
    { tabla: 'form_templates', columna: 'intro', archivo: 'REESTRUCTURACION_2026-08.sql' },
    { tabla: 'form_responses', columna: 'updated_by', archivo: 'coach_edit_checkins.sql' },
    { tabla: 'exercise_library', columna: 'setup', archivo: 'exercise_indications.sql',
      rompe: 'La ficha del ejercicio no enseña el bloque "Cómo se hace". Degrada con elegancia.' },
    { tabla: 'athlete_payments', archivo: 'REESTRUCTURACION_2026-08.sql' },
    { tabla: 'competition_results', archivo: 'REESTRUCTURACION_2026-08.sql' },
    { tabla: 'exercise_videos', archivo: 'exercise_videos.sql' },
    { tabla: 'athlete_claim_links', archivo: 'CLAIM_LINK.sql' },
    { tabla: 'athlete_profile_data', archivo: 'INFORMACION_PERSONAL.sql' },
    { tabla: 'metric_definitions', archivo: 'metrics_catalog.sql' },
    { tabla: 'macrocycles', archivo: 'macros_stats_vbt.sql' },
    { tabla: 'pwr_calibration_sessions', archivo: 'pwr_calibration.sql' },
    { tabla: 'chat_messages', archivo: '(SIN FICHERO — creada a mano en el panel de Supabase)',
      rompe: 'Deuda conocida: la tabla del chat vivo no está escrita en el repositorio.' },
    { tabla: 'session_exercises', columna: 'accessory_class', archivo: 'CALENDARIO_Y_MARCAS_2026-08-30.sql',
      rompe: 'Los accesorios salen todos como «sin clasificar» y el reparto ACC SQ/BP/DL queda vacío. Degrada con elegancia: no impide programar.' },
    { tabla: 'athlete_rep_maxes', archivo: 'CALENDARIO_Y_MARCAS_2026-08-30.sql',
      rompe: 'La pestaña Histórico y las mejores marcas del programador no funcionan. Degrada con elegancia: avisan de que falta la migración.' },
];

/**
 * Funciones. `args` LLEVA LOS NOMBRES REALES DE LOS PARÁMETROS: sin ellos,
 * PostgREST responde 404 aunque la función exista y la sonda mentiría.
 *
 * Todas las de aquí son seguras de llamar con identificadores nulos: o son
 * STABLE (no escriben), o levantan una excepción antes de tocar nada.
 */
const FUNCIONES = [
    { nombre: 'manages_athlete', args: { p_athlete_id: UUID_NULO }, archivo: 'INFORMACION_PERSONAL.sql' },
    { nombre: 'week_is_released', args: { p_block_id: UUID_NULO, p_week_number: 1 }, archivo: 'week_visibility_and_scheduling.sql' },
    { nombre: 'set_coach_athlete_status', args: { p_athlete_id: UUID_NULO, p_status: 'active', p_relation: null }, archivo: 'athlete_lifecycle.sql' },
    { nombre: 'find_athlete_by_email', args: { p_email: 'nadie@example.invalid' }, archivo: 'athlete_lifecycle.sql' },
    { nombre: 'gestiono_este_perfil', args: { p_profile_id: UUID_NULO }, archivo: 'athlete_lifecycle.sql' },
    { nombre: 'upsert_coach_athlete', args: { p_coach_id: UUID_NULO, p_athlete_id: UUID_NULO, p_relation: 'head_coach' }, archivo: 'athlete_lifecycle.sql' },
    { nombre: 'claim_managed_profile', args: {}, archivo: 'athlete_lifecycle.sql' },
    { nombre: 'expand_grouped_set', args: { p_set_id: UUID_NULO }, archivo: 'expand_grouped_set.sql',
      rompe: 'De un "4x8" solo se guarda la ÚLTIMA serie registrada.' },
    { nombre: 'resolve_exercise_video', args: { p_exercise_id: UUID_NULO, p_athlete_id: null }, archivo: 'exercise_videos.sql' },
    { nombre: 'shares_coaching_link', args: { other_id: UUID_NULO }, archivo: 'SECURITY_HARDENING.sql' },
    { nombre: 'get_public_upcoming_competitions', args: {}, archivo: 'FIX_COMPETICIONES_CLUB.sql',
      rompe: 'La página pública /competiciones está ROTA: getPublicCompetitions() lanza PGRST202.' },
    { nombre: 'delete_managed_athlete', args: { p_athlete_id: UUID_NULO }, archivo: 'migrations/0001_bloque1_integridad.sql',
      rompe: 'El botón "Borrar la ficha" de un atleta ficticio falla; y training_blocks sigue con políticas duplicadas.' },
    { nombre: 'athlete_is_current', args: { p_athlete_id: UUID_NULO, p_coach_id: UUID_NULO }, archivo: 'PAGOS_2026-08-23.sql',
      rompe: 'La puerta de pago (K1-K7) se queda SIN regla en el servidor: solo decide el navegador.' },
    { nombre: 'my_billing_status', args: {}, archivo: 'PAGOS_2026-08-23.sql',
      rompe: 'usePuertaDePago() no puede leer el estado y el atleta ve el panel sin puerta.' },
    { nombre: 'chat_roster', args: {}, archivo: 'migrations/0002_chat_messages.sql', opcional: true,
      rompe: 'El listado de chat del entrenador se descarga TODOS sus mensajes para pintar una lista.' },
];

/**
 * Comprobaciones que no son "¿existe?" sino "¿se comporta bien?".
 * Una fuga de datos no se detecta preguntando si la tabla está ahí.
 */
const FUGAS = [
    {
        etiqueta: 'competitions no filtra las de atleta a quien no tiene sesión',
        ruta: 'competitions?select=id&athlete_id=not.is.null&limit=1',
        // Sin sesión SOLO debe verse el calendario oficial (athlete_id NULL).
        esperado: (filas) => Array.isArray(filas) && filas.length === 0,
        archivo: 'FIX_RLS_COMPETICIONES.sql',
        rompe: 'FUGA: quién compite, dónde y cuándo, legible sin iniciar sesión.',
    },
];

// =====================================================================
// SONDA
// =====================================================================

function leerEntorno() {
    let texto;
    try {
        texto = readFileSync(resolve(RAIZ, '.env.local'), 'utf8');
    } catch {
        console.error('No encuentro .env.local en la raíz del proyecto.');
        process.exit(2);
    }
    const leer = (clave) => texto.match(new RegExp(`^${clave}=(.*)$`, 'm'))?.[1]?.trim();
    const url = leer('VITE_SUPABASE_URL');
    const key = leer('VITE_SUPABASE_ANON_KEY');
    if (!url || !key) {
        console.error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env.local.');
        process.exit(2);
    }
    return { url: url.replace(/\/+$/, ''), key };
}

const { url: URL_BASE, key: CLAVE } = leerEntorno();
const CABECERAS = { apikey: CLAVE, Authorization: `Bearer ${CLAVE}` };

async function sondearTabla({ tabla, columna }) {
    const select = columna ?? '*';
    const r = await fetch(`${URL_BASE}/rest/v1/${tabla}?select=${select}&limit=0`, { headers: CABECERAS });
    if (r.ok) return { existe: true };

    const cuerpo = await r.json().catch(() => ({}));
    // 42703 = la tabla está, la columna no. Es el caso que hay que separar:
    // decir "falta la tabla" cuando lo que falta es una columna manda a
    // ejecutar el fichero equivocado.
    if (cuerpo.code === '42703') return { existe: false, detalle: columna ? `falta la columna ${columna}` : 'columna desconocida' };
    if (cuerpo.code === 'PGRST205') return { existe: false, detalle: 'no existe la tabla' };
    if (r.status === 401 || cuerpo.code === '42501') return { existe: true, detalle: 'RLS cerrada (correcto)' };
    return { existe: false, detalle: `${r.status} ${cuerpo.code ?? ''}`.trim() };
}

async function sondearFuncion({ nombre, args }) {
    const r = await fetch(`${URL_BASE}/rest/v1/rpc/${nombre}`, {
        method: 'POST',
        headers: { ...CABECERAS, 'Content-Type': 'application/json' },
        body: JSON.stringify(args ?? {}),
    });
    if (r.ok) return { existe: true };

    const cuerpo = await r.json().catch(() => ({}));
    if (cuerpo.code === 'PGRST202') return { existe: false, detalle: 'no existe' };
    // Cualquier otra cosa —permiso denegado, excepción de la propia función—
    // demuestra que Postgres la encontró y entró en ella.
    if (cuerpo.code === '42501') return { existe: true, detalle: 'revocada de anon (correcto)' };
    return { existe: true, detalle: cuerpo.code ?? `${r.status}` };
}

async function sondearFuga({ ruta, esperado }) {
    const r = await fetch(`${URL_BASE}/rest/v1/${ruta}`, { headers: CABECERAS });
    const cuerpo = await r.json().catch(() => null);
    // Un 401 también es "cerrado": lo que se comprueba es que no se vea.
    if (r.status === 401) return { existe: true, detalle: 'cerrado' };
    return { existe: esperado(cuerpo), detalle: r.ok ? `${Array.isArray(cuerpo) ? cuerpo.length : '?'} filas visibles` : `${r.status}` };
}

// =====================================================================
// INFORME
// =====================================================================

const VERDE = '\x1b[32m', ROJO = '\x1b[31m', AMBAR = '\x1b[33m', GRIS = '\x1b[90m', FIN = '\x1b[0m';

async function main() {
    console.log(`\nANVIL — estado de la base de datos\n${GRIS}${URL_BASE}${FIN}\n`);

    const faltan = [];
    const grupos = [
        ['TABLAS Y COLUMNAS', TABLAS, sondearTabla, (e) => e.columna ? `${e.tabla}.${e.columna}` : e.tabla],
        ['FUNCIONES', FUNCIONES, sondearFuncion, (e) => `${e.nombre}()`],
        ['COMPORTAMIENTO', FUGAS, sondearFuga, (e) => e.etiqueta],
    ];

    for (const [titulo, entradas, sonda, nombrar] of grupos) {
        console.log(`${GRIS}── ${titulo} ${'─'.repeat(Math.max(0, 58 - titulo.length))}${FIN}`);

        // En serie y no en paralelo a propósito: son ~35 peticiones contra un
        // proyecto que ya ha tenido avisos de agotamiento de recursos, y el
        // script no tiene ninguna prisa.
        for (const entrada of entradas) {
            const r = await sonda(entrada);
            const etiqueta = nombrar(entrada);
            if (r.existe) {
                console.log(`  ${VERDE}✓${FIN} ${etiqueta.padEnd(52)} ${GRIS}${r.detalle ?? ''}${FIN}`);
            } else {
                const color = entrada.opcional ? AMBAR : ROJO;
                const marca = entrada.opcional ? '·' : '✗';
                console.log(`  ${color}${marca}${FIN} ${etiqueta.padEnd(52)} ${color}${r.detalle ?? 'falta'}${FIN}`);
                if (!entrada.opcional) faltan.push({ ...entrada, etiqueta, detalle: r.detalle });
            }
        }
        console.log();
    }

    if (faltan.length === 0) {
        console.log(`${VERDE}Todo aplicado.${FIN} La base de datos coincide con lo que el código espera.\n`);
        return 0;
    }

    console.log(`${ROJO}HAY QUE EJECUTAR ${faltan.length === 1 ? 'ESTO' : 'ESTAS MIGRACIONES'}${FIN} (SQL Editor de Supabase):\n`);
    const porArchivo = new Map();
    for (const f of faltan) {
        if (!porArchivo.has(f.archivo)) porArchivo.set(f.archivo, []);
        porArchivo.get(f.archivo).push(f);
    }
    for (const [archivo, items] of porArchivo) {
        console.log(`  ${ROJO}database/${archivo}${FIN}`);
        for (const i of items) console.log(`      ${GRIS}falta:${FIN} ${i.etiqueta}`);
        const rompe = items.find(i => i.rompe)?.rompe;
        if (rompe) console.log(`      ${AMBAR}consecuencia:${FIN} ${rompe}`);
        console.log();
    }
    return 1;
}

main().then(
    (codigo) => process.exit(codigo),
    (err) => { console.error('\nLa sonda falló:', err.message, '\n'); process.exit(2); }
);
