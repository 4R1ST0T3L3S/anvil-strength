import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { esDeLaCompeticion } from './apuestasDeCompeticion.ts';

const europeo = ['EUROPEAN Sub-Junior & Junior Classic Powerlifting Championships', 'Europeo Sub-⁠junior y Junior'];
const nacionalJunior = ['Campeonato de España Junior 2026'];

describe('casar apuestas de la Arena con una competición', () => {
    it('una palabra propia basta, también en castellano', () => {
        assert.equal(esDeLaCompeticion({ title: 'Europeo: ¿Marc pasa de 830?' }, europeo), true);
        assert.equal(esDeLaCompeticion({ title: '¿Quién gana?', description: 'En el European de Malta' }, europeo), true);
    });
    it('las palabras genéricas no casan solas', () => {
        assert.equal(esDeLaCompeticion({ title: 'Junior: ¿récord de banca?' }, europeo), false);
        assert.equal(esDeLaCompeticion({ title: 'AEP3 Chiva: total de Pau' }, europeo), false);
    });
    it('sin palabras propias, hacen falta todas las genéricas o sus sinónimos', () => {
        assert.equal(esDeLaCompeticion({ title: 'Nacional Junior: ¿Marc campeón?' }, nacionalJunior), true);
        assert.equal(esDeLaCompeticion({ title: 'Campeonato de España Subjunior' }, nacionalJunior), false);
        assert.equal(esDeLaCompeticion({ title: 'Junior: ¿récord?' }, nacionalJunior), false);
    });
    it('sin nombres no casa nada', () => {
        assert.equal(esDeLaCompeticion({ title: 'Europeo' }, [null, '']), false);
    });
});
