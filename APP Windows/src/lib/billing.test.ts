/**
 * PRUEBAS DE LA PUERTA DE PAGO
 * =====================================================================
 * La que justifica el fichero entero y la que hay que mirar primero:
 *
 *   **Sin ninguna fila de pago NO se bloquea** (K7). Hoy ningún atleta de
 *   Anvil tiene pagos registrados, así que con la regla contraria el día del
 *   despliegue se quedarían todos fuera a la vez.
 *
 * Y la segunda: **por defecto se AVISA, no se corta** (K1). Un fallo aquí
 * deja sin entrenar a alguien que ha pagado.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { evaluarPuerta, vistaBloqueada, paymentStatus } from './billing.ts';
import { DEFAULT_COACH_PREFS, resolveCoachPrefs } from './prefs/contract.ts';

const HOY = new Date(2026, 7, 23); // 23 de agosto de 2026

const base = {
    gate: 'block' as const,
    modo: 'auto' as const,
    pagadoHasta: null as string | null,
    tieneAlgunPago: false,
    graceDays: 7,
};

describe('K7 — sin pagos registrados NO se bloquea', () => {
    test('un atleta sin ninguna fila de pago pasa', () => {
        const r = evaluarPuerta({ ...base, tieneAlgunPago: false }, HOY);
        assert.equal(r.alCorriente, true);
        assert.equal(r.bloquea, false);
    });

    test('y se dice por que, para poder ensenarlo', () => {
        const r = evaluarPuerta({ ...base, tieneAlgunPago: false }, HOY);
        assert.match(r.motivo, /Todavía no hay pagos/);
    });

    test('con filas pero sin fecha de cobertura, tampoco se bloquea', () => {
        const r = evaluarPuerta({ ...base, tieneAlgunPago: true, pagadoHasta: null }, HOY);
        assert.equal(r.bloquea, false);
    });

    test('una fecha corrupta no puede cortar el acceso de nadie', () => {
        const r = evaluarPuerta({ ...base, tieneAlgunPago: true, pagadoHasta: 'pepe' }, HOY);
        assert.equal(r.bloquea, false);
    });
});

describe('K1 — el valor por defecto AVISA, no corta', () => {
    test('DEFAULT_COACH_PREFS sale en warn', () => {
        assert.equal(DEFAULT_COACH_PREFS.billing.gate, 'warn');
    });

    test('en warn, un moroso NO esta al corriente pero NO se le bloquea', () => {
        const r = evaluarPuerta(
            { ...base, gate: 'warn', tieneAlgunPago: true, pagadoHasta: '2026-01-01' },
            HOY
        );
        assert.equal(r.alCorriente, false, 'el semaforo dice la verdad');
        assert.equal(r.bloquea, false, 'pero no se corta nada');
    });

    test('en block, el mismo caso SI bloquea', () => {
        const r = evaluarPuerta(
            { ...base, gate: 'block', tieneAlgunPago: true, pagadoHasta: '2026-01-01' },
            HOY
        );
        assert.equal(r.bloquea, true);
    });

    test('en off no se bloquea ni se avisa', () => {
        const r = evaluarPuerta(
            { ...base, gate: 'off', tieneAlgunPago: true, pagadoHasta: '2026-01-01' },
            HOY
        );
        assert.equal(r.alCorriente, true);
    });
});

describe('K6 — siete dias de cortesia', () => {
    test('vencido ayer: dentro de la cortesia, no bloquea', () => {
        const r = evaluarPuerta(
            { ...base, tieneAlgunPago: true, pagadoHasta: '2026-08-22' },
            HOY
        );
        assert.equal(r.alCorriente, true);
    });

    test('el ULTIMO dia de cortesia todavia pasa', () => {
        // Pagado hasta el 16, mas 7 dias = 23. Hoy es 23.
        const r = evaluarPuerta(
            { ...base, tieneAlgunPago: true, pagadoHasta: '2026-08-16' },
            HOY
        );
        assert.equal(r.alCorriente, true, 'el dia del cierre todavia entra');
    });

    test('el dia siguiente ya no', () => {
        const r = evaluarPuerta(
            { ...base, tieneAlgunPago: true, pagadoHasta: '2026-08-15' },
            HOY
        );
        assert.equal(r.alCorriente, false);
        assert.equal(r.bloquea, true);
    });

    test('se dice hasta cuando estaba pagado, no solo que no lo esta', () => {
        const r = evaluarPuerta(
            { ...base, tieneAlgunPago: true, pagadoHasta: '2026-08-15' },
            HOY
        );
        assert.match(r.motivo, /15 de agosto/);
    });

    test('la cortesia es configurable', () => {
        const r = evaluarPuerta(
            { ...base, tieneAlgunPago: true, pagadoHasta: '2026-08-15', graceDays: 30 },
            HOY
        );
        assert.equal(r.alCorriente, true);
    });

    test('se dice que dia se cierra la puerta', () => {
        const r = evaluarPuerta(
            { ...base, tieneAlgunPago: true, pagadoHasta: '2026-08-16' },
            HOY
        );
        assert.equal(r.cierraEl, '2026-08-23');
    });
});

describe('K7 — estado por relacion', () => {
    test('exempt nunca bloquea, aunque deba meses', () => {
        const r = evaluarPuerta(
            { ...base, modo: 'exempt', tieneAlgunPago: true, pagadoHasta: '2020-01-01' },
            HOY
        );
        assert.equal(r.alCorriente, true);
    });

    test('suspended bloquea aunque este pagado', () => {
        const r = evaluarPuerta(
            { ...base, modo: 'suspended', tieneAlgunPago: true, pagadoHasta: '2099-01-01' },
            HOY
        );
        assert.equal(r.alCorriente, false);
        assert.equal(r.bloquea, true);
    });

    test('suspended en warn tampoco corta', () => {
        const r = evaluarPuerta({ ...base, gate: 'warn', modo: 'suspended' }, HOY);
        assert.equal(r.bloquea, false);
    });

    test('off gana a suspended: es el interruptor general', () => {
        const r = evaluarPuerta({ ...base, gate: 'off', modo: 'suspended' }, HOY);
        assert.equal(r.alCorriente, true);
    });
});

describe('K5 — que se corta', () => {
    const bloqueado = evaluarPuerta(
        { ...base, tieneAlgunPago: true, pagadoHasta: '2020-01-01' },
        HOY
    );
    const blocks = DEFAULT_COACH_PREFS.billing.blocks;

    test('por defecto se corta el entrenamiento', () => {
        assert.equal(vistaBloqueada('entrenamiento', bloqueado, blocks), true);
    });

    test('y el VBT, la nutricion y el panel de hoy', () => {
        assert.equal(vistaBloqueada('vbt', bloqueado, blocks), true);
        assert.equal(vistaBloqueada('nutricion', bloqueado, blocks), true);
        assert.equal(vistaBloqueada('hoy', bloqueado, blocks), true);
    });

    test('si el entrenador desactiva una vista, esa no se corta', () => {
        assert.equal(
            vistaBloqueada('nutricion', bloqueado, { ...blocks, nutricion: false }),
            false
        );
    });

    test('estando al corriente no se corta nada', () => {
        const ok = evaluarPuerta({ ...base, tieneAlgunPago: false }, HOY);
        assert.equal(vistaBloqueada('entrenamiento', ok, blocks), false);
    });
});

describe('unas preferencias a medio guardar no pueden ABRIR una puerta cerrada', () => {
    test('un billing.blocks parcial se completa con los valores por defecto', () => {
        // Simula unas prefs guardadas por una version anterior que solo
        // conocia 'entrenamiento'.
        const prefs = resolveCoachPrefs({ billing: { gate: 'block', blocks: { entrenamiento: false } } });
        assert.equal(prefs.billing.blocks.entrenamiento, false, 'lo guardado manda');
        assert.equal(prefs.billing.blocks.vbt, true, 'lo que falta cae en el valor por defecto');
        assert.equal(prefs.billing.blocks.nutricion, true);
    });

    test('unas prefs vacias salen en warn', () => {
        assert.equal(resolveCoachPrefs({}).billing.gate, 'warn');
    });

    test('la cortesia por defecto son 7 dias', () => {
        assert.equal(resolveCoachPrefs({}).billing.graceDays, 7);
    });
});

describe('el semaforo no cambia (K6): sigue avisando desde 14 dias antes', () => {
    test('mas de 14 dias: ok', () => {
        assert.equal(paymentStatus('2026-09-30', HOY).state, 'ok');
    });
    test('entre 8 y 14: soon', () => {
        assert.equal(paymentStatus('2026-09-04', HOY).state, 'soon');
    });
    test('7 o menos: urgent', () => {
        assert.equal(paymentStatus('2026-08-28', HOY).state, 'urgent');
    });
    test('pasado: expired', () => {
        assert.equal(paymentStatus('2026-08-01', HOY).state, 'expired');
    });
    test('sin fecha: unset', () => {
        assert.equal(paymentStatus(null, HOY).state, 'unset');
    });
});
