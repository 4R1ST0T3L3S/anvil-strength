/**
 * Verificación de `lib/calibration/agreement.ts` contra verdades construidas.
 *
 * El método es el mismo de siempre en este módulo: no se mira si los números
 * "parecen" bien, se fabrican datos cuyo sesgo, dispersión y correlación se
 * conocen de forma exacta y se comprueba que salen.
 */
const ROOT = new URL('../../src/', import.meta.url).href.replace(/\/$/, '');
const A = await import(`${ROOT}/lib/calibration/agreement.ts`);

let fallos = 0;
const ok = (cond, label, extra = '') => {
    if (!cond) fallos++;
    console.log(`${cond ? '  ok  ' : ' FALLA'} ${label}${extra ? ` — ${extra}` : ''}`);
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const reps = (vals) => vals.map((v, i) => ({ index: i + 1, meanVelocity: v, peakVelocity: null, romM: null }));

// =====================================================================
console.log('\n1. SESGO CONSTANTE: se recupera exacto y la dispersión es cero');
// =====================================================================
{
    const ref = [0.80, 0.72, 0.65, 0.58, 0.50, 0.44];
    const SESGO = -0.04;                       // PWR mide 4 cm/s de menos, siempre
    const mea = ref.map(v => v + SESGO);

    const p = A.pairReps(reps(ref), reps(mea), 'meanVelocity');
    const a = A.computeAgreement(p, 'meanVelocity');

    ok(a.n === 6, 'empareja las 6 repeticiones');
    ok(near(a.bias, SESGO, 1e-12), 'recupera el sesgo exacto', `${a.bias.toFixed(4)} m/s`);
    ok(near(a.sdDifference, 0, 1e-12), 'sin dispersión, SD = 0');
    ok(near(a.loaLower, SESGO, 1e-12) && near(a.loaUpper, SESGO, 1e-12), 'los límites colapsan en el sesgo');
    ok(near(a.mae, 0.04, 1e-12), 'el error absoluto medio es el sesgo', `${a.mae.toFixed(4)}`);
    ok(near(a.rmse, 0.04, 1e-12), 'el RMSE también');
    ok(near(a.pearsonR, 1, 1e-9), 'y la r de Pearson es 1,00 — que es justo por lo que no vale sola');
}

// =====================================================================
console.log('\n2. EL CASO QUE DESMONTA LA CORRELACIÓN');
// =====================================================================
{
    // Un método que devuelve SIEMPRE la mitad. Inservible, y r = 1,00.
    const ref = [0.80, 0.72, 0.65, 0.58, 0.50, 0.44];
    const mea = ref.map(v => v * 0.5);
    const a = A.computeAgreement(A.pairReps(reps(ref), reps(mea), 'meanVelocity'), 'meanVelocity');

    ok(near(a.pearsonR, 1, 1e-9), 'medir la mitad correlaciona 1,00 con la verdad', `r = ${a.pearsonR.toFixed(4)}`);
    ok(a.bias < -0.2, 'pero el sesgo lo delata', `${a.bias.toFixed(3)} m/s`);
    ok(near(a.mape, 50, 1e-9), 'y el error relativo es del 50%', `${a.mape.toFixed(1)}%`);
    ok(A.agreementVerdict(a).level === 'poor', 'el veredicto sale «poor»');
}

// =====================================================================
console.log('\n3. DISPERSIÓN CONOCIDA: SD muestral y límites de Bland-Altman');
// =====================================================================
{
    // Diferencias simétricas de media 0 y SD muestral calculable a mano.
    // d = [-2,-1,0,1,2]·0,01 → media 0; SD(n−1) = 0,01·sqrt(10/4) = 0,0158114
    const ref = [0.60, 0.60, 0.60, 0.60, 0.60];
    const d = [-0.02, -0.01, 0, 0.01, 0.02];
    const mea = ref.map((v, i) => v + d[i]);
    const a = A.computeAgreement(A.pairReps(reps(ref), reps(mea), 'meanVelocity'), 'meanVelocity');

    const sdEsperada = 0.01 * Math.sqrt(10 / 4);
    ok(near(a.bias, 0, 1e-12), 'sesgo nulo');
    ok(near(a.sdDifference, sdEsperada, 1e-9), 'SD muestral (n−1) correcta',
        `${a.sdDifference.toFixed(6)} vs ${sdEsperada.toFixed(6)}`);
    ok(near(a.loaUpper, 1.96 * sdEsperada, 1e-9), 'límite superior = 1,96·SD', `${a.loaUpper.toFixed(4)}`);
    ok(near(a.loaLower, -1.96 * sdEsperada, 1e-9), 'límite inferior = −1,96·SD');
    ok(near(a.mae, 0.012, 1e-12), 'MAE = media de |d|', `${a.mae.toFixed(4)}`);
    ok(near(a.rmse, Math.sqrt(0.0002), 1e-12), 'RMSE = raíz de la media de d²', `${a.rmse.toFixed(6)}`);
    // `near` y no `===`: 0.60 + 0.02 son 0.6200000000000001 en coma flotante.
    ok(near(Math.abs(a.worst.difference), 0.02, 1e-9), 'señala la repetición con el peor desacuerdo',
        `rep ${a.worst.index}, ${a.worst.difference.toFixed(4)}`);

    // Que NO use la SD poblacional (n), que sería 0,0141421.
    ok(!near(a.sdDifference, 0.01 * Math.sqrt(10 / 5), 1e-9), 'no usa la SD poblacional');
}

// =====================================================================
console.log('\n4. RECUENTOS DISTINTOS: se avisa, no se disimula');
// =====================================================================
{
    const ref = reps([0.80, 0.72, 0.65, 0.58, 0.50]);
    const mea = reps([0.78, 0.70, 0.63]);           // PWR detectó 3 de 5
    const rep = A.buildAgreementReport(ref, mea);

    const p = rep.metrics.find(m => m.metric === 'meanVelocity').pairing;
    ok(p.countsDiffer, 'detecta que los recuentos no cuadran');
    ok(p.pairs.length === 3, 'empareja solo las 3 que hay');
    ok(rep.warnings.some(w => w.includes('mal alineado')), 'avisa de que el alineado puede estar mal');
    ok(rep.warnings.some(w => w.includes('orientativos')), 'y de que con 3 repeticiones los límites no acotan');
}

// =====================================================================
console.log('\n5. NADA QUE EMPAREJAR, Y DIVISIONES POR CASI CERO');
// =====================================================================
{
    const vacio = A.buildAgreementReport([], []);
    ok(vacio.pairedReps === 0, 'sin datos, cero parejas');
    ok(vacio.warnings.length === 1 && vacio.warnings[0].includes('emparejar'), 'y lo dice');
    ok(vacio.metrics.every(m => m.agreement === null), 'no inventa estadísticas de la nada');

    // Referencia prácticamente nula: el porcentaje no debe dispararse.
    const a = A.computeAgreement(
        A.pairReps(reps([1e-9, 0.60]), reps([0.30, 0.62]), 'meanVelocity'),
        'meanVelocity'
    );
    ok(Number.isFinite(a.mape) && a.mape < 100, 'una referencia de ~0 no dispara el % a millones',
        `${a.mape.toFixed(2)}%`);

    // Una sola pareja: no hay dispersión que estimar, pero no puede reventar.
    const una = A.computeAgreement(A.pairReps(reps([0.6]), reps([0.58]), 'meanVelocity'), 'meanVelocity');
    ok(near(una.bias, -0.02, 1e-12) && una.sdDifference === 0, 'con una sola pareja da sesgo y SD 0');
    ok(una.pearsonR === null, 'y no inventa una correlación con un punto');
}

// =====================================================================
console.log('\n6. EL VEREDICTO SE MUEVE DONDE TIENE QUE MOVERSE');
// =====================================================================
{
    /**
     * Diferencias DETERMINISTAS y no ruido pseudoaleatorio: con 8 muestras, la
     * dispersión que sale de un generador se desvía lo bastante de la teórica
     * como para cruzar un corte. Alternando ±s la SD muestral vale
     * exactamente s·√(n/(n−1)), así que el ancho esperado se calcula a mano:
     *
     *     ancho = 1,96 · s · √(8/7) = 2,0952 · s
     */
    const ref = [0.80, 0.72, 0.65, 0.58, 0.50, 0.44, 0.40, 0.36];
    const alternando = (s) => ref.map((v, i) => v + (i % 2 === 0 ? s : -s));

    for (const [s, esperado] of [[0.02, 'good'], [0.04, 'fair'], [0.08, 'poor']]) {
        const a = A.computeAgreement(
            A.pairReps(reps(ref), reps(alternando(s)), 'meanVelocity'), 'meanVelocity');
        const v = A.agreementVerdict(a);
        const anchoTeorico = 1.96 * s * Math.sqrt(8 / 7);
        ok(v.level === esperado, `±${s} m/s alternos → «${esperado}»`,
            `${v.level} · ancho ${((a.loaUpper - a.loaLower) / 2).toFixed(4)} (teórico ${anchoTeorico.toFixed(4)})`);
    }

    ok(A.agreementVerdict(null).level === 'unknown', 'sin acuerdo calculado, «unknown»');
}

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} COMPROBACIONES FALLIDAS`}\n`);
process.exit(fallos === 0 ? 0 : 1);
