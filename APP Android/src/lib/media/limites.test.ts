import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    dimensionesVideo, dimensionesImagen, elegirFormatoVideo, elegirFormatoAudio,
    tipoDeAdjunto, mimeBase, extensionPara, validarArchivo, videoSeSubeTalCual,
    normalizarRecorte, recorteInicial, formatearTamano, formatearDuracion,
    VIDEO_MAX_SEGUNDOS, pesoEstimadoVideo,
} from './limites.ts';

describe('dimensiones de salida del vídeo', () => {
    it('un 4K horizontal baja a 1280×720', () => {
        assert.deepEqual(dimensionesVideo(3840, 2160), { ancho: 1280, alto: 720 });
    });
    it('un vertical del móvil baja a 720×1280, no se aplasta', () => {
        assert.deepEqual(dimensionesVideo(1080, 1920), { ancho: 720, alto: 1280 });
    });
    it('nunca agranda un vídeo pequeño', () => {
        assert.deepEqual(dimensionesVideo(640, 360), { ancho: 640, alto: 360 });
    });
    it('los lados salen siempre pares (H.264 no admite impares)', () => {
        const d = dimensionesVideo(1281, 721);
        assert.equal(d.ancho % 2, 0);
        assert.equal(d.alto % 2, 0);
    });
    it('un cuadrado cabe en 720×720', () => {
        assert.deepEqual(dimensionesVideo(1440, 1440), { ancho: 720, alto: 720 });
    });
});

describe('dimensiones de la foto', () => {
    it('el lado largo baja a 2048 y conserva la proporción', () => {
        assert.deepEqual(dimensionesImagen(4032, 3024), { ancho: 2048, alto: 1536 });
    });
    it('una captura pequeña se queda como está', () => {
        assert.deepEqual(dimensionesImagen(1170, 800), { ancho: 1170, alto: 800 });
    });
});

describe('formato de grabación', () => {
    it('prefiere MP4 si el navegador sabe grabarlo', () => {
        assert.match(elegirFormatoVideo(m => m.startsWith('video/mp4')) ?? '', /^video\/mp4/);
    });
    it('cae a WebM cuando no hay MP4 (Firefox)', () => {
        assert.match(elegirFormatoVideo(m => m.startsWith('video/webm')) ?? '', /^video\/webm/);
    });
    it('devuelve null si no puede grabar nada', () => {
        assert.equal(elegirFormatoVideo(() => false), null);
    });
    it('la voz prefiere AAC en MP4', () => {
        assert.equal(elegirFormatoAudio(() => true), 'audio/mp4;codecs=mp4a.40.2');
    });
});

describe('tipo y extensión', () => {
    it('quita los parámetros del tipo', () => {
        assert.equal(mimeBase('video/webm;codecs=vp9,opus'), 'video/webm');
    });
    it('reconoce por extensión si el móvil no da tipo', () => {
        assert.equal(tipoDeAdjunto('', 'IMG_0001.HEIC'), 'image');
        assert.equal(tipoDeAdjunto('', 'serie.MOV'), 'video');
        assert.equal(tipoDeAdjunto('application/pdf', 'plan.pdf'), 'file');
    });
    it('extensión para Storage', () => {
        assert.equal(extensionPara('video/quicktime'), 'mov');
        assert.equal(extensionPara('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), 'xlsx');
    });
});

describe('validación antes de procesar', () => {
    it('rechaza un ejecutable', () => {
        const v = validarArchivo({ type: 'application/x-msdownload', name: 'virus.exe', size: 1000 });
        assert.equal(v.ok, false);
    });
    it('rechaza un PDF de más de 20 MB', () => {
        const v = validarArchivo({ type: 'application/pdf', name: 'plan.pdf', size: 25 * 1024 * 1024 });
        assert.equal(v.ok, false);
    });
    it('un vídeo largo NO se rechaza: se recorta después', () => {
        const v = validarArchivo({ type: 'video/quicktime', name: 'serie.mov', size: 400 * 1024 * 1024 });
        assert.equal(v.ok, true);
        assert.equal(v.tipo, 'video');
    });
});

describe('¿se sube tal cual?', () => {
    const base = { mime: 'video/mp4', size: 5 * 1024 * 1024, ancho: 1280, alto: 720, duracion: 20 };
    it('un MP4 ligero en 720p y sin recortar, sí', () => {
        assert.equal(videoSeSubeTalCual(base, { desde: 0, hasta: 20 }), true);
    });
    it('un .mov del iPhone, nunca', () => {
        assert.equal(videoSeSubeTalCual({ ...base, mime: 'video/quicktime' }, { desde: 0, hasta: 20 }), false);
    });
    it('si se ha recortado, hay que recodificar', () => {
        assert.equal(videoSeSubeTalCual(base, { desde: 3, hasta: 20 }), false);
    });
    it('un 1080p, hay que bajarlo', () => {
        assert.equal(videoSeSubeTalCual({ ...base, ancho: 1920, alto: 1080 }, { desde: 0, hasta: 20 }), false);
    });
});

describe('recorte', () => {
    it('el recorte inicial de un vídeo de 5 min son sus primeros 2', () => {
        assert.deepEqual(recorteInicial(300), { desde: 0, hasta: VIDEO_MAX_SEGUNDOS });
    });
    it('nunca deja un tramo de más de 2 minutos', () => {
        const r = normalizarRecorte({ desde: 10, hasta: 250 }, 300);
        assert.ok(r.hasta - r.desde <= VIDEO_MAX_SEGUNDOS + 1e-9);
    });
    it('no se sale del vídeo', () => {
        const r = normalizarRecorte({ desde: -5, hasta: 400 }, 90);
        assert.ok(r.desde >= 0 && r.hasta <= 90);
    });
    it('mantiene un tramo mínimo', () => {
        const r = normalizarRecorte({ desde: 50, hasta: 50 }, 90);
        assert.ok(r.hasta - r.desde >= 1);
    });
});

describe('formato para personas', () => {
    it('tamaños', () => {
        assert.equal(formatearTamano(512), '512 B');
        assert.equal(formatearTamano(2048), '2 KB');
        assert.equal(formatearTamano(7.3 * 1024 * 1024), '7,3 MB');
    });
    it('duraciones', () => {
        assert.equal(formatearDuracion(83), '1:23');
        assert.equal(formatearDuracion(5), '0:05');
    });
    it('2 minutos a 720p no pasan del techo de 50 MB', () => {
        assert.ok(pesoEstimadoVideo(VIDEO_MAX_SEGUNDOS) < 50 * 1024 * 1024);
    });
});
