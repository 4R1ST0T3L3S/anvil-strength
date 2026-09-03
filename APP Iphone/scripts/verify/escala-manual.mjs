/**
 * La escala puesta a mano: dos clics en el borde de arriba y el de abajo.
 *
 * Se comprueba contra un disco de altura CONOCIDA, y sobre todo se comprueba la
 * propiedad por la que se eligió este método: que el error horizontal del
 * usuario no afecte a la escala.
 */
const ROOT = new URL('../../src/', import.meta.url).href.replace(/\/$/, '');
const G = await import(`${ROOT}/lib/cv/plateGeometry.ts`);

let fallos = 0;
const ok = (cond, label, extra = '') => {
    if (!cond) fallos++;
    console.log(`${cond ? '  ok  ' : ' FALLA'} ${label}${extra ? ` — ${extra}` : ''}`);
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const PLATE = 0.45;      // disco de competición, 45 cm
const ALTURA = 200;      // px de alto en la imagen

// =====================================================================
console.log('\n1. DOS CLICS PERFECTOS');
// =====================================================================
{
    const cal = G.calibrationFromTwoPoints({ x: 640, y: 300 }, { x: 640, y: 500 }, PLATE);
    ok(cal.method === 'two_points', 'el método se declara como manual de dos puntos');
    ok(near(cal.verticalExtentPx, ALTURA, 1e-9), 'la extensión vertical es exacta',
        `${cal.verticalExtentPx} px`);
    ok(near(cal.pixelToMeterRatio, PLATE / ALTURA, 1e-12), 'la escala sale bien',
        `${(cal.pixelToMeterRatio * 1000).toFixed(3)} mm/px`);
    ok(cal.obliquityDeg === null, 'no promete un ángulo de cámara que no puede medir');
    ok(cal.detectionScore === null, 'ni una confianza de detector que no ha intervenido');
}

// =====================================================================
console.log('\n2. LA PROPIEDAD QUE JUSTIFICA EL MÉTODO');
// =====================================================================
{
    // El usuario pincha 40 px desviado en horizontal. Sobre 200 de alto, la
    // distancia en línea recta crece un 2% — y la ALTURA no cambia nada.
    const recto = G.calibrationFromTwoPoints({ x: 640, y: 300 }, { x: 640, y: 500 }, PLATE);
    const torcido = G.calibrationFromTwoPoints({ x: 620, y: 300 }, { x: 660, y: 500 }, PLATE);

    ok(near(torcido.verticalExtentPx, recto.verticalExtentPx, 1e-9),
        '40 px de desvío horizontal NO cambian la escala',
        `${torcido.verticalExtentPx} px`);

    // Lo que hacía la versión anterior, con `Math.hypot`.
    const conHypot = Math.hypot(660 - 620, 500 - 300);
    ok(conHypot > recto.verticalExtentPx,
        'con la distancia completa habría sobrestimado, y por eso se cambió',
        `${conHypot.toFixed(1)} px en vez de ${recto.verticalExtentPx}`);
    console.log(`        el error que se evita: ${(((conHypot / ALTURA) - 1) * 100).toFixed(1)}% en TODAS las velocidades`);
}

// =====================================================================
console.log('\n3. DA IGUAL EL ORDEN DE LOS CLICS');
// =====================================================================
{
    const abajoPrimero = G.calibrationFromTwoPoints({ x: 640, y: 500 }, { x: 640, y: 300 }, PLATE);
    ok(near(abajoPrimero.verticalExtentPx, ALTURA, 1e-9),
        'marcar primero abajo da la misma escala', `${abajoPrimero.verticalExtentPx} px`);
    ok(abajoPrimero.verticalExtentPx > 0, 'y nunca una extensión negativa');
}

// =====================================================================
console.log('\n4. LA ELIPSE DEDUCIDA NO SE SIEMBRA FUERA DEL DISCO');
// =====================================================================
{
    const cal = G.calibrationFromTwoPoints({ x: 640, y: 300 }, { x: 640, y: 500 }, PLATE);
    ok(cal.ellipse !== null, 'deja una elipse para que el seguidor siembre');
    ok(near(cal.ellipse.height, ALTURA, 1e-9), 'con la altura medida');
    ok(cal.ellipse.width < cal.ellipse.height, 'y MÁS ESTRECHA que alta, a propósito',
        `${cal.ellipse.width.toFixed(0)} × ${cal.ellipse.height.toFixed(0)} px`);
    ok(near(cal.ellipse.cy, 400, 1e-9), 'centrada entre los dos topes');

    // Hasta cuántos grados de giro cabe dentro del disco. Con anchura real
    // a = b·cos(θ), la máscara de 0,55·b cabe mientras cos(θ) > 0,55.
    const limite = (Math.acos(0.55) * 180) / Math.PI;
    ok(limite > 55, 'la máscara cabe dentro del disco hasta un giro alto',
        `${limite.toFixed(0)}° de cámara`);
}

// =====================================================================
console.log('\n5. UN TRAMO DEGENERADO NO PRODUCE UNA ESCALA INFINITA');
// =====================================================================
{
    const cero = G.calibrationFromTwoPoints({ x: 640, y: 400 }, { x: 640, y: 400 }, PLATE);
    ok(cero.pixelToMeterRatio === 0, 'con altura cero la escala es 0, no infinito',
        `${cero.pixelToMeterRatio}`);
    ok(Number.isFinite(cero.pixelToMeterRatio), 'y es un número finito');
}

// =====================================================================
console.log('\n6. LA NOTA DE CALIDAD LO PENALIZA, COMO DEBE');
// =====================================================================
{
    const Q = await import(`${ROOT}/lib/cv/quality.ts`);
    const manual = G.calibrationFromTwoPoints({ x: 640, y: 300 }, { x: 640, y: 500 }, PLATE);
    const auto = G.calibrationFromEllipse(
        { cx: 640, cy: 400, width: 200, height: 200, angleDeg: 0 }, PLATE, 'auto', 0.9);

    const tracking = {
        framesProcessed: 60, framesLost: 1, maxJumpPx: 6, durationS: 2,
        frameHeightPx: 720, exactTimestamps: true, medianTrackedPoints: 20,
    };
    const comun = { concentricSamples: 30, concentricDurationS: 1, romM: 0.5, meanVelocityMs: 0.6 };

    const qManual = Q.assessQuality({ calibration: manual, tracking, ...comun });
    const qAuto = Q.assessQuality({ calibration: auto, tracking, ...comun });

    ok(qManual.score < qAuto.score, 'la escala a mano puntúa por debajo de la detectada',
        `${qManual.score} vs ${qAuto.score}`);
    ok(qManual.score > 0, 'pero no se anula: un usuario atento la pone bien');
}

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} COMPROBACIONES FALLIDAS`}\n`);
process.exit(fallos === 0 ? 0 : 1);
