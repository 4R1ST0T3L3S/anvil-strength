import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * HUMO DE ESCENARIO — WebGL, sin vídeos ni imágenes
 * =====================================================================
 *
 * El humo de las presentaciones de equipos (el del túnel de vestuarios, el
 * de los anuncios de alineación) es lo que convierte una foto recortada en
 * una entrada. Se probó con capas de degradado animadas —lo que había en la
 * convocatoria anterior— y se lee como lo que es: manchas de color que
 * respiran. El humo de verdad tiene volutas, y eso pide ruido.
 *
 * Aquí es un único shader de fragmentos: ruido fractal (fbm) con el dominio
 * deformado dos veces sobre sí mismo, que es la receta clásica para que el
 * ruido parezca fluido. Va dentro de un triángulo que tapa el lienzo entero.
 *
 *
 * LA RÁFAGA Y EL REPOSO
 *
 * Cada vez que cambia `rafaga`, el humo sale de abajo con fuerza, sube por
 * encima de su altura de reposo y se asienta: la velocidad cae de forma
 * exponencial hasta una deriva lenta. Es la coreografía que se pidió —el
 * humo arranca detrás y se queda quieto cuando el atleta se queda quieto—,
 * pero sin congelarlo del todo: un humo parado del todo se ve como una foto
 * pegada encima.
 *
 *
 * LO QUE CUESTA, Y CÓMO SE CONTIENE
 *
 *   · Se pinta a una fracción de la resolución (`calidad`, 0.5 por defecto):
 *     el humo es borroso por naturaleza y a media resolución no se nota,
 *     pero cuesta la cuarta parte.
 *   · Cuando la ráfaga se ha asentado (6 s) baja a 30 fotogramas por
 *     segundo. Una deriva lenta no necesita 60.
 *   · Se para del todo fuera de pantalla y con la pestaña oculta.
 *   · Con `prefers-reduced-motion` se pinta UN fotograma, el de reposo, y
 *     no hay bucle.
 *   · Sin WebGL (o si el contexto se pierde) no pinta nada y el fondo de
 *     debajo —el foco y el degradado de quien lo use— sigue ahí.
 */

interface HumoProps {
    /** Cambiar este valor dispara una ráfaga nueva. */
    rafaga?: number | string;
    /** Densidad en reposo, de 0 a 1. */
    densidad?: number;
    /** Hasta dónde llega en reposo, en tanto por uno del alto del lienzo. */
    altura?: number;
    /** Color de la luz que lo ilumina desde el suelo, RGB de 0 a 1. */
    tinte?: [number, number, number];
    /** Fracción de la resolución a la que se pinta. */
    calidad?: number;
    /** Desplaza el patrón para que dos capas no se vean iguales. */
    semilla?: number;
    /** Dónde se concentra en horizontal, de 0 (izquierda) a 1 (derecha). */
    centro?: number;
    className?: string;
}

const VERTICES = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAGMENTOS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform float uT;
uniform float uB;
uniform float uDens;
uniform float uAlt;
uniform vec3 uTinte;
uniform float uSemilla;
uniform float uCentro;

float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}
float ruido(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
    for (int i = 0; i < 5; i++) {
        v += a * ruido(p);
        p = m * p;
        a *= 0.5;
    }
    return v;
}
void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    float asp = uRes.x / uRes.y;
    vec2 p = vec2((uv.x - 0.5) * asp, uv.y) * 2.2;

    // Empuje vertical: fuerte al salir, deriva lenta después.
    float empuje = 1.5 * (1.0 - exp(-uB * 0.9)) + 0.045 * uT;

    vec2 q = vec2(
        fbm(p + vec2(uSemilla, -empuje)),
        fbm(p + vec2(5.2 + uSemilla, 1.3 - empuje * 0.8))
    );
    vec2 r = vec2(
        fbm(p + 3.2 * q + vec2(1.7, 9.2 - empuje * 1.3)),
        fbm(p + 3.2 * q + vec2(8.3 + 0.07 * uT, 2.8 - empuje))
    );
    float d = fbm(p + 2.8 * r + vec2(0.0, -empuje * 0.6));

    // La bocanada pasa por encima de su altura de reposo y baja a ella.
    float techo = uAlt + 0.35 * exp(-uB * 0.6) * (1.0 - exp(-uB * 4.0));
    float vert = smoothstep(techo, 0.0, uv.y);
    vert *= vert;
    // Más espeso detrás de quien está en escena (uCentro), sin cortarse
    // del todo a los lados.
    float horiz = mix(0.35, 1.0, exp(-pow((uv.x - uCentro) * 1.9, 2.0)));
    float dens = smoothstep(0.26, 0.8, d) * vert * horiz * uDens;

    vec3 gris = mix(vec3(0.12, 0.11, 0.11), vec3(0.8, 0.78, 0.78), smoothstep(0.3, 0.85, d));
    float suelo = smoothstep(0.55, 0.0, uv.y);
    vec3 col = mix(gris, uTinte, suelo * 0.6 * smoothstep(0.4, 0.9, r.y));

    // Alfa premultiplicado: el lienzo se compone tal cual sobre la página.
    gl_FragColor = vec4(col * dens, dens);
}
`;

function compilar(gl: WebGLRenderingContext, tipo: number, fuente: string): WebGLShader | null {
    const s = gl.createShader(tipo);
    if (!s) return null;
    gl.shaderSource(s, fuente);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        if (import.meta.env.DEV) console.warn('Humo: el shader no compila', gl.getShaderInfoLog(s));
        gl.deleteShader(s);
        return null;
    }
    return s;
}

export function Humo({
    rafaga = 0,
    densidad = 0.75,
    altura = 0.55,
    tinte = [0.75, 0.12, 0.1],
    calidad = 0.5,
    semilla = 0,
    centro = 0.5,
    className = '',
}: HumoProps) {
    const lienzo = useRef<HTMLCanvasElement>(null);
    const reduce = useReducedMotion();

    // Lo que cambia sin tener que reconstruir el contexto entero.
    const params = useRef({ densidad, altura, tinte, semilla, centro });
    const [tr, tg, tb] = tinte;
    useEffect(() => {
        params.current = { densidad, altura, tinte: [tr, tg, tb], semilla, centro };
    }, [densidad, altura, tr, tg, tb, semilla, centro]);
    const inicioRafaga = useRef(0);
    const repintar = useRef<(() => void) | null>(null);

    useEffect(() => {
        inicioRafaga.current = performance.now();
        repintar.current?.();
    }, [rafaga]);

    useEffect(() => {
        const canvas = lienzo.current;
        if (!canvas) return;
        const gl = canvas.getContext('webgl', {
            alpha: true,
            premultipliedAlpha: true,
            antialias: false,
            depth: false,
            stencil: false,
            powerPreference: 'low-power',
        });
        if (!gl) return;

        const vs = compilar(gl, gl.VERTEX_SHADER, VERTICES);
        const fs = compilar(gl, gl.FRAGMENT_SHADER, FRAGMENTOS);
        if (!vs || !fs) return;
        const prog = gl.createProgram();
        if (!prog) return;
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
        gl.useProgram(prog);

        // Un triángulo que desborda el lienzo: cubre la pantalla con tres
        // vértices en vez de los seis de dos triángulos.
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const aPos = gl.getAttribLocation(prog, 'aPos');
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

        const u = {
            res: gl.getUniformLocation(prog, 'uRes'),
            t: gl.getUniformLocation(prog, 'uT'),
            b: gl.getUniformLocation(prog, 'uB'),
            dens: gl.getUniformLocation(prog, 'uDens'),
            alt: gl.getUniformLocation(prog, 'uAlt'),
            tinte: gl.getUniformLocation(prog, 'uTinte'),
            semilla: gl.getUniformLocation(prog, 'uSemilla'),
            centro: gl.getUniformLocation(prog, 'uCentro'),
        };

        const t0 = performance.now();
        let raf = 0;
        let visible = true;
        let perdido = false;
        let ultimo = 0;

        const ajustar = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const w = Math.max(1, Math.round(canvas.clientWidth * dpr * calidad));
            const h = Math.max(1, Math.round(canvas.clientHeight * dpr * calidad));
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
            }
            gl.viewport(0, 0, canvas.width, canvas.height);
        };

        const pintar = (ahora: number, fija?: number) => {
            if (perdido) return;
            const p = params.current;
            const b = fija ?? (ahora - inicioRafaga.current) / 1000;
            // Sale con un pico de densidad y se asienta en la de reposo.
            const entrada = 1 - Math.exp(-b * 3);
            const pico = 1 + 0.35 * Math.exp(-b * 0.9);
            gl.uniform2f(u.res, canvas.width, canvas.height);
            gl.uniform1f(u.t, fija !== undefined ? 0 : (ahora - t0) / 1000);
            gl.uniform1f(u.b, b);
            gl.uniform1f(u.dens, p.densidad * entrada * pico);
            gl.uniform1f(u.alt, p.altura);
            gl.uniform3f(u.tinte, p.tinte[0], p.tinte[1], p.tinte[2]);
            gl.uniform1f(u.semilla, p.semilla);
            gl.uniform1f(u.centro, p.centro);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        };

        const bucle = (ahora: number) => {
            raf = 0;
            if (!visible || perdido || document.hidden) return;
            const asentado = (ahora - inicioRafaga.current) / 1000 > 6;
            // En reposo, 30 fotogramas por segundo bastan.
            if (!asentado || ahora - ultimo >= 32) {
                ultimo = ahora;
                pintar(ahora);
            }
            raf = requestAnimationFrame(bucle);
        };

        const arrancar = () => {
            if (reduce) {
                ajustar();
                pintar(performance.now(), 8);
                return;
            }
            if (!raf && visible && !perdido && !document.hidden) raf = requestAnimationFrame(bucle);
        };
        repintar.current = arrancar;

        const ro = new ResizeObserver(() => {
            ajustar();
            if (reduce) pintar(performance.now(), 8);
        });
        ro.observe(canvas);

        const io = new IntersectionObserver(([e]) => {
            visible = e.isIntersecting;
            if (visible) arrancar();
        });
        io.observe(canvas);

        const alCambiarPestana = () => {
            if (!document.hidden) arrancar();
        };
        document.addEventListener('visibilitychange', alCambiarPestana);

        const alPerder = (e: Event) => {
            e.preventDefault();
            perdido = true;
            if (raf) cancelAnimationFrame(raf);
            raf = 0;
        };
        canvas.addEventListener('webglcontextlost', alPerder);

        ajustar();
        arrancar();

        return () => {
            repintar.current = null;
            if (raf) cancelAnimationFrame(raf);
            ro.disconnect();
            io.disconnect();
            document.removeEventListener('visibilitychange', alCambiarPestana);
            canvas.removeEventListener('webglcontextlost', alPerder);
            gl.deleteBuffer(buf);
            gl.deleteProgram(prog);
            gl.deleteShader(vs);
            gl.deleteShader(fs);
        };
    }, [calidad, reduce]);

    return <canvas ref={lienzo} aria-hidden="true" className={`pointer-events-none ${className}`} />;
}
