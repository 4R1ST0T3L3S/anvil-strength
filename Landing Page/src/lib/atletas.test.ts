import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buscarAtleta, leerCategoria, normalizarNombre, partirNombre } from './atletas.ts';
import { agruparCompeticiones, formatearFechas, slugCompeticion } from '../features/landing/lib/competiciones.ts';

describe('buscar la ficha de un atleta por su nombre de la base', () => {
    it('ignora tildes y espacios sobrantes', () => {
        assert.equal(buscarAtleta('Pau Rodríguez ')?.slug, 'pau-rodriguez');
    });
    it('casa aunque el nombre de la base traiga el segundo apellido', () => {
        assert.equal(buscarAtleta('Marc Alonso Pascual')?.slug, 'marc-alonso');
        assert.equal(buscarAtleta('Alejandro Hermosilla Sánchez')?.slug, 'alejandro-hermosilla');
    });
    it('no decide por el primer nombre: "Pau" a secas no es nadie', () => {
        assert.equal(buscarAtleta('Pau'), undefined);
        assert.equal(buscarAtleta('Pau García'), undefined);
    });
    it('distingue a los dos Paus', () => {
        assert.equal(buscarAtleta('Pau Camacho Ruiz')?.slug, 'pau-camacho');
        assert.equal(buscarAtleta('PAU RODRIGUEZ')?.slug, 'pau-rodriguez');
    });
    it('un nombre vacío no casa con nada', () => {
        assert.equal(buscarAtleta(''), undefined);
        assert.equal(buscarAtleta(null), undefined);
    });
});

describe('piezas de texto', () => {
    it('normaliza', () => {
        assert.equal(normalizarNombre('  Fernández-Arenas  '), 'fernandez arenas');
    });
    it('parte nombre y apellidos', () => {
        assert.deepEqual(partirNombre('Marc Alonso Pascual'), { nombre: 'Marc', apellidos: 'Alonso Pascual' });
        assert.deepEqual(partirNombre('Masoko'), { nombre: '', apellidos: 'Masoko' });
    });
    it('lee la categoría tal cual la escribimos', () => {
        assert.deepEqual(leerCategoria('-105kg SBJ'), { peso: '-105', division: 'Sub-junior' });
        assert.deepEqual(leerCategoria('-69 JNR'), { peso: '-69', division: 'Junior' });
        assert.deepEqual(leerCategoria('+120kg Open'), { peso: '+120', division: 'Open' });
        assert.deepEqual(leerCategoria('-105kg'), { peso: '-105', division: null });
    });
});

describe('agrupar las filas públicas en competiciones', () => {
    const fila = (nombre: string, atleta: string, extra: Record<string, string | null> = {}) => ({
        name: nombre,
        date: '2026-12-06',
        location: 'Kranjska Gora',
        level: 'EPF',
        athlete_id: atleta,
        athlete_full_name: atleta,
        athlete_avatar_url: null,
        ...extra,
    });

    it('una competición con dos filas es una competición con dos convocados', () => {
        const r = agruparCompeticiones([
            fila('EUROPEAN Sub-Junior & Junior Classic Powerlifting Championships', 'Marc Alonso Pascual'),
            fila('EUROPEAN Sub-Junior & Junior Classic Powerlifting Championships', 'Pau Rodríguez '),
        ]);
        assert.equal(r.length, 1);
        assert.equal(r[0].convocados.length, 2);
        assert.ok(r[0].convocados.every((c) => c.ficha?.recorte));
    });

    it('el mismo atleta dos veces cuenta una', () => {
        const r = agruparCompeticiones([fila('AEP 3', 'Carlos Villena'), fila('AEP 3', 'Carlos Villena')]);
        assert.equal(r[0].convocados.length, 1);
    });

    it('junta fechas y se queda con el inicio más temprano y el final más tardío', () => {
        const r = agruparCompeticiones([
            fila('AEP 3', 'A B', { date: '2026-12-21', end_date: '2026-12-21' }),
            fila('AEP 3', 'C D', { date: '2026-12-20', end_date: '2026-12-22' }),
        ]);
        assert.equal(r[0].fecha, '2026-12-20');
        assert.equal(r[0].fin, '2026-12-22');
    });

    it('el mismo nombre en años distintos son dos competiciones', () => {
        const r = agruparCompeticiones([
            fila('AEP 3', 'A B', { date: '2026-12-20' }),
            fila('AEP 3', 'A B', { date: '2027-12-19' }),
        ]);
        assert.equal(r.length, 2);
        assert.notEqual(r[0].slug, r[1].slug);
    });

    it('ordena por fecha', () => {
        const r = agruparCompeticiones([
            fila('Segunda', 'A B', { date: '2027-01-10' }),
            fila('Primera', 'A B', { date: '2026-11-10' }),
        ]);
        assert.deepEqual(r.map((c) => c.nombre), ['Primera', 'Segunda']);
    });

    it('el slug no lleva tildes ni signos', () => {
        assert.equal(slugCompeticion('Campeonato de España Júnior', '2027-02-02'), 'campeonato-de-espana-junior-2027');
    });
});

describe('fechas de una competición', () => {
    it('un día', () => {
        assert.equal(formatearFechas('2026-12-06', null), '6 dic 2026');
    });
    it('varios días del mismo mes', () => {
        assert.equal(formatearFechas('2026-12-06', '2026-12-13'), '6–13 dic 2026');
    });
    it('cambiando de mes', () => {
        assert.equal(formatearFechas('2026-11-28', '2026-12-02'), '28 nov – 2 dic 2026');
    });
});
