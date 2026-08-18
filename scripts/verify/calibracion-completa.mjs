/**
 * Camino completo de las Fases 9 y 10: un CSV de encoder tal y como lo exporta
 * un aparato, pasado por el lector REAL de la aplicación, emparejado con lo que
 * mediría PWR, y resumido.
 *
 * Lo que se comprueba no es que "salga algo": se construye un desacuerdo
 * CONOCIDO y se mira si el informe lo recupera.
 */
const ROOT = new URL('../../src/', import.meta.url).href.replace(/\/$/, '');
const { parseVbtText } = await import(`${ROOT}/lib/vbt/csv.ts`);
const A = await import(`${ROOT}/lib/calibration/agreement.ts`);

let fallos = 0;
const ok = (cond, label, extra = '') => {
    if (!cond) fallos++;
    console.log(`${cond ? '  ok  ' : ' FALLA'} ${label}${extra ? ` — ${extra}` : ''}`);
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// =====================================================================
console.log('\n1. UN CSV DE ENCODER, CON SUS RAREZAS');
// =====================================================================
// Cabeceras en inglés, decimales con COMA, ROM en centímetros y dos series.
// Las tres cosas pasan de verdad y las tres romperían la comparación en
// silencio si el lector no las normalizara.
const csv = [
    'Set,Rep,Load,Mean Velocity,Peak Vel,ROM (cm)',
    '1,1,100,"0,82","1,15","62,0"',
    '1,2,100,"0,79","1,11","61,5"',
    '1,3,100,"0,74","1,06","61,8"',
    '1,4,100,"0,68","0,99","61,2"',
    '1,5,100,"0,61","0,92","61,0"',
    '2,1,110,"0,70","1,02","60,5"',
    '2,2,110,"0,64","0,95","60,8"',
].join('\n');

const leido = parseVbtText(csv);
ok(leido.sets.length === 2, 'separa las dos series', `${leido.sets.length}`);
ok(leido.sets[0].repDetails.length === 5, 'la primera serie trae 5 repeticiones');
ok(near(leido.sets[0].repDetails[0].meanVelocity, 0.82, 1e-9),
    'la coma decimal se lee bien', `${leido.sets[0].repDetails[0].meanVelocity}`);
ok(near(leido.sets[0].repDetails[0].romM, 0.62, 1e-9),
    'el ROM en cm se convierte a METROS', `${leido.sets[0].repDetails[0].romM} m`);
ok(leido.sets[0].loadKg === 100, 'lee la carga de la serie');

// El mismo fichero con el ROM en milímetros tiene que dar lo mismo.
const csvMm = csv.replace('ROM (cm)', 'ROM (mm)')
    .replace(/"6([12])[,.]([05])"/g, (_, a, b) => `"6${a}${b},0"`);
const leidoMm = parseVbtText(csvMm);
ok(near(leidoMm.sets[0].repDetails[0].romM, 0.620, 1e-6),
    'y en milímetros también sale en metros', `${leidoMm.sets[0].repDetails[0].romM} m`);

// =====================================================================
console.log('\n2. UN DESACUERDO CONSTRUIDO, Y SI EL INFORME LO RECUPERA');
// =====================================================================
const referencia = leido.sets[0].repDetails.map(r => ({
    index: r.index, meanVelocity: r.meanVelocity, peakVelocity: r.peakVelocity, romM: r.romM,
}));

// PWR mide 4 cm/s MENOS de media (el sesgo que los sintéticos ya midieron,
// −4,4%) y alterna ±1 cm/s de dispersión.
const SESGO = -0.04;
const DISP = 0.01;
const medido = referencia.map((r, i) => ({
    index: i + 1,
    meanVelocity: r.meanVelocity + SESGO + (i % 2 === 0 ? DISP : -DISP),
    peakVelocity: r.peakVelocity + SESGO,
    romM: r.romM + 0.005,
}));

const informe = A.buildAgreementReport(referencia, medido);
const mv = informe.metrics.find(m => m.metric === 'meanVelocity').agreement;
const rom = informe.metrics.find(m => m.metric === 'romM').agreement;

ok(informe.pairedReps === 5, 'empareja las 5 repeticiones');
ok(informe.warnings.length === 0, 'sin avisos: 5 repeticiones y recuentos iguales',
    informe.warnings.join(' / '));
// Con 5 puntos y desviaciones alternas ±0,01 empezando en +, la media de las
// perturbaciones es +0,002, así que el sesgo medido es −0,038 y no −0,040.
ok(near(mv.bias, SESGO + DISP / 5, 1e-9), 'recupera el sesgo construido',
    `${mv.bias.toFixed(4)} m/s`);
ok(near(rom.bias, 0.005, 1e-9), 'y el del recorrido', `${(rom.bias * 100).toFixed(1)} cm`);
ok(rom.mape < 1.5, 'el error de recorrido sale en % pequeño, no en miles',
    `${rom.mape.toFixed(2)}%`);
ok(A.agreementVerdict(mv).level === 'good', 'con esa dispersión el veredicto es «good»',
    A.agreementVerdict(mv).text);

// =====================================================================
console.log('\n3. EL FALLO QUE ESTO EXISTE PARA IMPEDIR');
// =====================================================================
// Si el ROM del encoder se dejara en centímetros y PWR lo da en metros, el
// error saldría del 9.900% y parecería un fallo del analizador. Se comprueba
// que el lector NO deja pasar eso.
const romCrudo = 62.0;   // lo que trae el fichero
const romLeido = leido.sets[0].repDetails[0].romM;
ok(romLeido < 3, 'el ROM que sale del lector NO está en centímetros',
    `${romCrudo} → ${romLeido}`);

const siNoSeConvirtiera = A.computeAgreement(
    A.pairReps(
        [{ index: 1, meanVelocity: null, peakVelocity: null, romM: romCrudo }],
        [{ index: 1, meanVelocity: null, peakVelocity: null, romM: 0.625 }],
        'romM'
    ), 'romM');
ok(siNoSeConvirtiera.mape > 90, 'sin conversión el error sería absurdo, y por eso se convierte antes',
    `${siNoSeConvirtiera.mape.toFixed(0)}%`);

// =====================================================================
console.log('\n4. PWR DETECTA MENOS REPETICIONES QUE EL ENCODER');
// =====================================================================
const informeCorto = A.buildAgreementReport(referencia, medido.slice(0, 3));
ok(informeCorto.pairedReps === 3, 'empareja las 3 que hay');
ok(informeCorto.warnings.some(w => w.includes('5 repeticiones y PWR ha detectado 3')),
    'dice exactamente cuántas trae cada uno');
ok(informeCorto.warnings.some(w => w.includes('mal alineado')),
    'y advierte de que el alineado puede estar mal');

// =====================================================================
console.log('\n5. UN FICHERO QUE NO SE RECONOCE NO SE INVENTA');
// =====================================================================
const basura = parseVbtText('nombre;apellido\nJuan;Pérez');
ok(basura.rowCount === 0, 'un CSV sin columnas de velocidad da 0 filas');
ok(basura.sets.length === 0, 'y ninguna serie');

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} COMPROBACIONES FALLIDAS`}\n`);
process.exit(fallos === 0 ? 0 : 1);
