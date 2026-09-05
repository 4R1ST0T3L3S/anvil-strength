/**
 * Verificación de lo añadido en esta sesión: el ajuste previo (F3) y el 1RM
 * con perfil del atleta. Contra verdades CONSTRUIDAS, no contra la pantalla.
 */
const ROOT = new URL('../../src/', import.meta.url).href.replace(/\/$/, '');

const { estimate1RM, athleteProfileUsable, ATHLETE_PROFILE_MIN } = await import(`${ROOT}/lib/cv/pwrMath.ts`);
const { validateSetup, canAnalyse, setupCaveats, DEFAULT_SETUP, barTypeById } = await import(`${ROOT}/lib/cv/pwrSetup.ts`);
const { mvtForExercise, exercisePattern, buildPatternVelocityProfile, MVT_BY_PATTERN } =
    await import(`${ROOT}/lib/vbt/analysis.ts`);

let fallos = 0;
const ok = (cond, label, extra = '') => {
    if (!cond) fallos++;
    console.log(`${cond ? '  ok  ' : ' FALLA'} ${label}${extra ? ` — ${extra}` : ''}`);
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// =====================================================================
console.log('\n1. EL MVT SALE DE UNA SOLA TABLA');
// =====================================================================
// Antes: pwrMath decía banca 0,15 y muerto 0,20; analysis.ts decía 0,17 y 0,15.
for (const [tipo, nombre] of [['squat', 'Sentadilla'], ['bench', 'Press banca'], ['deadlift', 'Peso muerto']]) {
    const desdePwr = estimate1RM(100, 0.5, tipo).mvt;
    const desdeVbt = mvtForExercise(nombre);
    ok(desdePwr === desdeVbt, `${tipo}: PWR y VBT usan el mismo MVT`, `${desdePwr} vs ${desdeVbt}`);
}

// Cuánto cambia respecto a lo que había, para saber qué se está tocando.
const ANTES = { squat: 0.30, bench: 0.15, deadlift: 0.20 };
const PEND = { squat: 0.0125, bench: 0.0125, deadlift: 0.0100 };
console.log('\n   Efecto sobre el 1RM genérico de una medición a 100 kg y 0,50 m/s:');
for (const tipo of ['squat', 'bench', 'deadlift']) {
    const rawAntes = 100 - (0.5 - ANTES[tipo]) / PEND[tipo];
    const rmAntes = 100 / (Math.min(100, Math.max(15, rawAntes)) / 100);
    const rmAhora = estimate1RM(100, 0.5, tipo).rm;
    console.log(`     ${tipo.padEnd(9)} ${rmAntes.toFixed(1)} kg → ${rmAhora.toFixed(1)} kg  (${((rmAhora / rmAntes - 1) * 100).toFixed(1)}%)`);
}

// =====================================================================
console.log('\n2. EL 1RM CON PERFIL DEL ATLETA RECUPERA LA VERDAD');
// =====================================================================
// Se CONSTRUYE un atleta con 1RM conocido: v = pendiente·kg + corte, elegido
// para que la velocidad valga exactamente el MVT en su máximo real.
const casos = [
    { tipo: 'squat', rmReal: 200, pendiente: -0.0060, cargaHoy: 150 },
    { tipo: 'squat', rmReal: 140, pendiente: -0.0090, cargaHoy: 120 },
    { tipo: 'bench', rmReal: 120, pendiente: -0.0085, cargaHoy: 100 },
    { tipo: 'deadlift', rmReal: 250, pendiente: -0.0045, cargaHoy: 200 },
];

for (const c of casos) {
    const mvt = MVT_BY_PATTERN[c.tipo];
    const corte = mvt - c.pendiente * c.rmReal;          // v(rmReal) === mvt
    const vHoy = c.pendiente * c.cargaHoy + corte;        // lo que se mediría hoy
    const perfil = { slopePerKg: c.pendiente, n: 6, r2: 0.95, loadRangeKg: 60 };

    const conPerfil = estimate1RM(c.cargaHoy, vHoy, c.tipo, perfil);
    const generico = estimate1RM(c.cargaHoy, vHoy, c.tipo, null);

    ok(conPerfil.source === 'athlete', `${c.tipo} ${c.rmReal} kg: usa el perfil del atleta`);
    ok(near(conPerfil.rm, c.rmReal, 0.5), `${c.tipo} ${c.rmReal} kg: recupera el 1RM real`,
        `estimado ${conPerfil.rm.toFixed(1)} kg`);
    console.log(`        genérico habría dicho ${generico.rm.toFixed(1)} kg ` +
        `(error ${((generico.rm / c.rmReal - 1) * 100).toFixed(1)}%), ` +
        `v medida ${vHoy.toFixed(3)} m/s`);
}

// =====================================================================
console.log('\n3. CUÁNDO SE NIEGA A USAR EL PERFIL (y lo dice)');
// =====================================================================
const base = { slopePerKg: -0.006, n: 6, r2: 0.95, loadRangeKg: 60 };
const malos = [
    ['sin perfil', null],
    ['pendiente positiva', { ...base, slopePerKg: 0.004 }],
    ['pocas mediciones', { ...base, n: ATHLETE_PROFILE_MIN.n - 1 }],
    ['R² bajo', { ...base, r2: ATHLETE_PROFILE_MIN.r2 - 0.05 }],
    ['cargas apelotonadas', { ...base, loadRangeKg: ATHLETE_PROFILE_MIN.loadRangeKg - 1 }],
];
for (const [label, perfil] of malos) {
    const r = estimate1RM(150, 0.6, 'squat', perfil);
    ok(r.source === 'generic' && !!r.fallbackReason, `${label}: cae al genérico con motivo`, r.fallbackReason);
}
ok(athleteProfileUsable(base).ok, 'un perfil bueno sí se acepta');

// El caso que motivó `loadRangeKg`: R² perfecto sobre cargas casi iguales.
const apelotonado = { slopePerKg: -0.006, n: 8, r2: 0.99, loadRangeKg: 4 };
ok(!athleteProfileUsable(apelotonado).ok,
    'R² 0,99 sobre 4 kg de margen NO basta', athleteProfileUsable(apelotonado).reason);

// =====================================================================
console.log('\n4. EL AJUSTE PREVIO BLOQUEA LO QUE TIENE QUE BLOQUEAR');
// =====================================================================
const setup = (p) => ({ ...DEFAULT_SETUP, lateralConfirmed: true, ...p });

ok(!canAnalyse({ ...DEFAULT_SETUP, loadKg: 100 }), 'sin confirmar el vídeo no se analiza');
ok(!canAnalyse(setup({ loadKg: 0 })), 'sin carga no se analiza');
ok(!canAnalyse(setup({ loadKg: 15, barTypeId: 'olympic' })), '15 kg con barra de 20 no se analiza');
ok(canAnalyse(setup({ loadKg: 20, barTypeId: 'olympic' })), '20 kg con barra de 20 sí se analiza');
ok(canAnalyse(setup({ loadKg: 15, barTypeId: 'womens' })), '15 kg con barra de 15 sí se analiza');
ok(canAnalyse(setup({ loadKg: 5, barTypeId: 'other' })), 'con barra desconocida no se comprueba la masa');

const pesado = validateSetup(setup({ loadKg: 700 }));
ok(canAnalyse(setup({ loadKg: 700 })), '700 kg avisa pero NO bloquea');
ok(pesado.some(i => i.level === 'warning'), '700 kg deja un aviso', pesado.find(i => i.level === 'warning')?.message);

// Salvedades de la barra
ok(setupCaveats(setup({ loadKg: 200, barTypeId: 'deadlift', exerciseType: 'deadlift' })).length === 1,
    'barra flexible en peso muerto: una salvedad');
ok(setupCaveats(setup({ loadKg: 200, barTypeId: 'deadlift', exerciseType: 'squat' })).length === 2,
    'barra flexible en sentadilla: además avisa de que quizá no es esa barra');
ok(setupCaveats(setup({ loadKg: 200, barTypeId: 'olympic' })).length === 0,
    'barra normal: ninguna salvedad');
ok(barTypeById('no-existe').id === 'other', 'una barra desconocida cae en «otra»');

// =====================================================================
console.log('\n5. LAS MEDICIONES SE AGRUPAN POR MOVIMIENTO, NO POR NOMBRE');
// =====================================================================
ok(exercisePattern('Sentadilla trasera con pausa') === 'squat', '«Sentadilla trasera con pausa» es sentadilla');
ok(exercisePattern('Back Squat') === 'squat', '«Back Squat» es sentadilla');
ok(exercisePattern('Press de banca cerrado') === 'bench', '«Press de banca cerrado» es banca, no press militar');
ok(exercisePattern('Press militar') === 'press', '«Press militar» es press');

const medicion = (nombre, kg, v) => ({
    id: `${nombre}-${kg}`, exercise_name: nombre, load_kg: kg, mean_velocity: v,
    performed_at: '2026-08-01', reps: 1, source: 'video',
});
// Mismo atleta, tres nombres distintos para el mismo movimiento.
const perfilAgrupado = buildPatternVelocityProfile([
    medicion('Sentadilla', 100, 0.80),
    medicion('Back Squat', 130, 0.62),
    medicion('Sentadilla trasera', 160, 0.44),
    medicion('Squat', 180, 0.32),
    medicion('Press banca', 90, 0.40),
], 'squat');
ok(perfilAgrupado !== null, 'con tres nombres distintos sale UN perfil');
ok(perfilAgrupado?.points.length === 4, 'entran las 4 sentadillas y no la banca',
    `${perfilAgrupado?.points.length} puntos`);
ok(near(perfilAgrupado?.loadRangeKg ?? 0, 80, 0.01), 'el margen de cargas se calcula bien',
    `${perfilAgrupado?.loadRangeKg} kg`);
ok((perfilAgrupado?.slope ?? 0) < 0, 'la pendiente sale negativa');

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} COMPROBACIONES FALLIDAS`}\n`);
process.exit(fallos === 0 ? 0 : 1);
