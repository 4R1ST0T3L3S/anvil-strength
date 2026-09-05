/**
 * PIEZAS DE LA PORTADA
 * =====================================================================
 * Registro de MARCA. La aplicación (paneles, constructor, registro de
 * sesión) usa las primitivas de `src/components/ui` y la estrategia de
 * color contenida que describe DESIGN.md. Aquí no: la portada es la única
 * superficie donde el diseño ES el producto, y su trabajo es que alguien
 * que no nos conoce decida quedarse.
 *
 * De ahí las dos libertades que se toman estas piezas y que NO deben
 * cruzar a la aplicación:
 *
 *   1. Folds drenados. Secciones enteras de rojo o de blanco, no un rojo
 *      contenido a la acción primaria.
 *   2. Botones con canto físico. En una herramienta de trabajo un botón
 *      que se hunde 4px es ruido; en una portada es lo que hace que dé
 *      gusto pulsarlo.
 */

import { m, useReducedMotion, type Variants } from 'framer-motion';
import type { ReactNode } from 'react';

// =====================================================================
// BOTÓN TÁCTIL
// =====================================================================

type PressTone = 'brand' | 'light' | 'dark';

const PRESS_TONES: Record<PressTone, { face: string; edge: string }> = {
    brand: { face: 'bg-brand text-brand-ink', edge: 'var(--press-edge-brand)' },
    light: { face: 'bg-white text-fold-light-ink', edge: 'var(--press-edge-light)' },
    dark: { face: 'bg-fold-light-ink text-ink', edge: 'var(--press-edge-dark)' },
};

/**
 * Botón con canto inferior sólido que se hunde al pulsarlo.
 *
 * El canto es una `box-shadow` sin desenfoque: una sombra CON forma. Al
 * pulsar, el botón baja exactamente lo que mide el canto y el canto
 * desaparece, así que el objeto no cambia de altura total — se hunde. Un
 * `scale()` daría la sensación de alejarse; esto da la de empujar.
 *
 * `transition` nombra las propiedades una a una a propósito: `all` habría
 * animado también el color de fondo del hover, que debe ser inmediato.
 */
export function PressButton({
    children,
    onClick,
    href,
    tone = 'brand',
    size = 'lg',
    className = '',
}: {
    children: ReactNode;
    onClick?: () => void;
    href?: string;
    tone?: PressTone;
    size?: 'md' | 'lg';
    className?: string;
}) {
    const { face, edge } = PRESS_TONES[tone];

    const classes = [
        'group/press relative inline-flex items-center justify-center rounded-pill font-black uppercase',
        'tracking-wide select-none',
        size === 'lg' ? 'px-8 py-4 text-t-base md:text-t-lg' : 'px-5 py-2.5 text-t-sm',
        face,
        'transition-[transform,box-shadow] duration-instant ease-snap',
        'translate-y-0 active:translate-y-[var(--press-depth)] active:shadow-none',
        'motion-reduce:active:translate-y-0',
        className,
    ].join(' ');

    const style = { boxShadow: `0 var(--press-depth) 0 0 ${edge}` };

    if (href) {
        return (
            <a href={href} style={style} className={classes}>
                {children}
            </a>
        );
    }

    return (
        <button type="button" onClick={onClick} style={style} className={classes}>
            {children}
        </button>
    );
}

// =====================================================================
// FOLD
// =====================================================================

type FoldTone = 'dark' | 'light' | 'brand' | 'black';

const FOLD_TONES: Record<FoldTone, string> = {
    dark: 'bg-surface-canvas text-ink',
    black: 'bg-surface-sunken text-ink',
    light: 'bg-fold-light text-fold-light-ink',
    brand: 'bg-brand text-brand-ink',
};

/**
 * Sección de página a pantalla completa de ancho.
 *
 * El cambio de fondo entre folds es lo que marca el ritmo del scroll:
 * negro, blanco, rojo. Sin ese contraste haría falta un separador o un
 * título de sección en cada corte para saber que has cambiado de tema,
 * que es justo el andamiaje que se quería quitar.
 */
export function Fold({
    id,
    tone = 'dark',
    className = '',
    children,
}: {
    id?: string;
    tone?: FoldTone;
    className?: string;
    children: ReactNode;
}) {
    return (
        <section id={id} className={`${FOLD_TONES[tone]} ${className}`}>
            <div className="mx-auto w-full max-w-[1180px] px-6 md:px-10">{children}</div>
        </section>
    );
}

// =====================================================================
// REVELADO AL ENTRAR EN PANTALLA
// =====================================================================

/**
 * Aparición suave al llegar a la sección.
 *
 * Dos decisiones que parecen detalles y no lo son:
 *
 * · Con `prefers-reduced-motion` no hay desplazamiento NI opacidad: el
 *   contenido está puesto desde el principio. Reducir movimiento no es
 *   "lo mismo pero más rápido".
 *
 * · `once: true` y un umbral bajo. Un revelado que se repite cada vez que
 *   la sección vuelve a entrar convierte el scroll hacia arriba en un
 *   parpadeo constante.
 *
 * El desplazamiento es de 14px. Lo suficiente para que se lea como
 * movimiento, no tanto como para que el texto "salte" al llegar.
 */
/**
 * LA VENTANA DE REVELADO, EN UN SOLO SITIO.
 * =====================================================================
 *
 * Antes había cuatro configuraciones distintas repartidas en cuatro
 * ficheros: `{ once: true }` a secas en ocho sitios, `{ once: true, amount:
 * 0.15 }` en la lista escalonada y `{ once: true, amount: 0.2, margin: ... }`
 * en `Reveal`. Tres ritmos de entrada distintos en la misma página, sin que
 * ninguno fuera una decisión.
 *
 *
 * EL MARGEN SUPERIOR ENORME NO ES UN DESCUIDO
 *
 * `whileInView` se apoya en `IntersectionObserver`, que solo dispara cuando
 * el elemento TOCA la ventana. Con `once: true`, lo que se queda por encima
 * sin haberla tocado nunca sigue en opacidad cero.
 *
 * Y hay dos formas normales de aterrizar en mitad de una página sin haber
 * pasado por lo de arriba: la restauración de scroll —vuelves atrás y la
 * página te deja donde estabas, ver `useScrollRestoration`— y un enlace con
 * ancla. En los dos casos, al subir después te encuentras media página en
 * blanco que va apareciendo, como si lo de arriba fuera lo nuevo.
 *
 * `9999px` arriba estira la caja del observador hacia arriba, así que todo lo
 * que ya has dejado atrás cuenta como visto y aparece puesto. El `-80px` de
 * abajo se queda: es lo que hace que una sección empiece a revelarse un poco
 * ANTES de llegar del todo, que es lo que se siente natural.
 *
 * SIN VERIFICAR EN NAVEGADOR REAL. El panel de vistas previas con el que se
 * desarrolló esto NO ENTREGA callbacks de `IntersectionObserver` — se
 * comprobó observando `document.body`, que intersecta por definición, y
 * tampoco llegó ninguno. Así que este comportamiento concreto está razonado
 * pero no medido, y hay que mirarlo en un navegador de verdad: bajar en la
 * portada, ir a otra página, volver atrás y subir.
 */
export const VISTA_REVELADO = {
    once: true,
    amount: 0.2,
    margin: '9999px 0px -80px 0px',
} as const;

export function Reveal({
    children,
    delay = 0,
    className = '',
}: {
    children: ReactNode;
    delay?: number;
    className?: string;
}) {
    const reduce = useReducedMotion();

    if (reduce) return <div className={className}>{children}</div>;

    return (
        <m.div
            className={className}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VISTA_REVELADO}
            transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
        >
            {children}
        </m.div>
    );
}

/**
 * Variantes para escalonar los hijos de UNA lista.
 *
 * El escalonado ayuda a leer un orden —tres pasos, seis tarjetas— y por eso
 * se usa dentro de una lista y no como entrada uniforme de toda la página.
 * 55ms entre elementos: por debajo no se percibe, por encima la última
 * tarjeta llega tarde y la sección parece lenta.
 */
export const staggerList: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: 0.055 } },
};

export const staggerItem: Variants = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
};

/** Lista escalonada que respeta la preferencia de movimiento reducido. */
export function StaggerList({
    children,
    className = '',
}: {
    children: ReactNode;
    className?: string;
}) {
    const reduce = useReducedMotion();

    if (reduce) return <div className={className}>{children}</div>;

    return (
        <m.div
            className={className}
            variants={staggerList}
            initial="hidden"
            whileInView="show"
            viewport={VISTA_REVELADO}
        >
            {children}
        </m.div>
    );
}

export function StaggerItem({
    children,
    className = '',
}: {
    children: ReactNode;
    className?: string;
}) {
    const reduce = useReducedMotion();

    if (reduce) return <div className={className}>{children}</div>;

    return (
        <m.div className={className} variants={staggerItem}>
            {children}
        </m.div>
    );
}

/**
 * BANDA DE ENTRADA — la llamada a la acción intermedia.
 * =====================================================================
 *
 * POR QUÉ HACE FALTA MÁS DE UNA
 *
 * Medido en el navegador a 375px, que es donde está la mayoría: la portada
 * mide 12.694px —quince pantallas y media— y las formas de entrar estaban en
 * 491 y en 10.753. Eso son **casi nueve pantallas seguidas sin una sola
 * puerta**. Quien se convence a mitad tiene que seguir bajando hasta el final
 * o volver arriba, y lo normal es que no haga ninguna de las dos.
 *
 * En escritorio la cabecera fija lleva su propio «Crear cuenta» siempre a la
 * vista, así que ahí el problema es menor. En móvil ese botón se mete dentro
 * del menú y desaparece — comprobado bajando a 6.000px y buscando cualquier
 * elemento fijo con una llamada dentro: ninguno.
 *
 *
 * DÓNDE SE PONEN, QUE NO ES CADA X PANTALLAS
 *
 * En los dos momentos en que a alguien le acaba de encajar algo:
 *
 *   · Después de **cómo se empieza**: acabas de leer los pasos. La acción
 *     siguiente evidente es darlos.
 *   · Después de **quién te entrena**: es la sección que más convence, y
 *     todavía quedan cuatro pantallas hasta el cierre.
 *
 * Estrecha a propósito —una línea y un botón, sin titular— para que no
 * compita con el cierre de abajo. No es un segundo final: es una salida para
 * quien ya lo tiene decidido.
 */
export function BandaDeEntrada({
    texto,
    remate,
}: {
    /** La frase, en dos partes: la segunda va en tinta apagada. */
    texto: string;
    remate: string;
}) {
    return (
        <Fold tone="black" className="py-14 md:py-16">
            <Reveal className="mx-auto flex max-w-[1180px] flex-col items-center gap-5 px-6 text-center md:flex-row md:justify-between md:px-10 md:text-left">
                <p className="text-t-lg font-black uppercase leading-tight tracking-display text-ink md:text-t-xl">
                    {texto} <span className="text-ink-muted">{remate}</span>
                </p>
                <PressButton href="https://typebot.co/lead-generation-hhwa24t" className="w-full shrink-0 sm:w-auto">
                    Ficha de inscripción
                </PressButton>
            </Reveal>
        </Fold>
    );
}
