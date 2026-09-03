/** @type {import('tailwindcss').Config} */

/* Los valores viven en src/styles/tokens.css; aquí solo se exponen como
   utilidades de Tailwind. Cambiar un color se hace allí, nunca aquí. */

/**
 * Expone un token de color de forma que ADEMÁS admita el modificador de
 * opacidad de Tailwind (`bg-brand/35`).
 *
 * POR QUÉ HACE FALTA: un color declarado como `"var(--brand)"` a secas rompe
 * el modificador. Tailwind no puede inyectar el alfa dentro de una variable
 * cuyo contenido no conoce, así que genera un valor inválido y el navegador
 * lo resuelve como TRANSPARENTE — sin error en consola y sin nada en la
 * pestaña de red. La barra de volumen indirecto de VolumePanel llevaba así
 * desde que se escribió: la clase existía, el elemento existía, y no se veía.
 *
 * `color-mix` en OKLCH mantiene el tono al bajar el alfa, que es la misma
 * razón por la que los tokens están en OKLCH y no en HSL. El suelo de soporte
 * de navegador es el mismo que ya impone `oklch()` en tokens.css, así que no
 * añade ninguna restricción nueva.
 */
const token =
  (name) =>
  ({ opacityValue } = {}) => {
    // Sin modificador, Tailwind no pasa un número: pasa la cadena
    // `var(--tw-bg-opacity)` para que el color la resuelva en tiempo de
    // ejecución. Ahí no hay nada que mezclar y hay que devolver el token tal
    // cual — multiplicarla daría NaN y, otra vez, un color transparente.
    const alpha = Number(opacityValue);
    if (!Number.isFinite(alpha) || alpha >= 1) return `var(${name})`;
    return `color-mix(in oklch, var(${name}) ${alpha * 100}%, transparent)`;
  };

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          sunken: token("--surface-sunken"),
          canvas: token("--surface-canvas"),
          raised: token("--surface-raised"),
          overlay: token("--surface-overlay"),
        },
        ink: {
          DEFAULT: token("--ink"),
          muted: token("--ink-muted"),
          subtle: token("--ink-subtle"),
          faint: token("--ink-faint"),
          inverse: token("--ink-inverse"),
        },
        brand: {
          DEFAULT: token("--brand"),
          hover: token("--brand-hover"),
          active: token("--brand-active"),
          quiet: token("--brand-quiet"),
          line: token("--brand-line"),
          ink: token("--brand-ink"),
          // El rojo cuando ES el texto, no el relleno. Ver tokens.css.
          text: token("--brand-text"),
        },
        success: { DEFAULT: token("--success"), quiet: token("--success-quiet") },
        warning: { DEFAULT: token("--warning"), quiet: token("--warning-quiet") },
        danger: { DEFAULT: token("--danger"), hover: token("--danger-hover"), quiet: token("--danger-quiet"), text: token("--danger-text") },
        info: { DEFAULT: token("--info"), quiet: token("--info-quiet") },
        effort: {
          low: token("--effort-low"),
          mid: token("--effort-mid"),
          high: token("--effort-high"),
          max: token("--effort-max"),
        },

        // Portada. Registro de marca: ver sección 10 de tokens.css.
        fold: {
          light: token("--fold-light"),
          "light-raised": token("--fold-light-raised"),
          "light-ink": token("--fold-light-ink"),
          "light-ink-muted": token("--fold-light-ink-muted"),
          "light-line": token("--fold-light-line"),
        },

        // Los tres alias heredados (`anvil-red`, `anvil-black`, `anvil-gray`)
        // se retiraron el 24/08/2026 al llegar a cero usos, que era la
        // condición que fijaba K14.
        //
        // `anvil-red` era literalmente `token("--brand")`, así que renombrar
        // sus 357 usos a `brand` fue un cambio de cero píxeles. `anvil-black`
        // (#0a0a0a) y `anvil-gray` (#2b2d42) ya no los usaba nadie; el
        // segundo, además, era un azul pizarra que nunca estuvo en la paleta.

      },

      /* ADITIVO, NUNCA SOBRESCRITO.
         Todo lo de aquí abajo usa nombres propios en vez de reutilizar los de
         Tailwind (`sm`, `md`, `lg`, `xs`...). Redefinir esos nombres no añade
         utilidades: cambia las que ya hay. `rounded-lg` tiene 149 usos en la
         app y pasaría de 8px a 16px de golpe, y lo mismo la escala de texto.
         La migración va pantalla por pantalla en F5, no en un big bang. */

      borderColor: {
        subtle: token("--border-subtle"),
        line: token("--border-default"),
        strong: token("--border-strong"),
      },

      /* Una sola familia. `sans` es clave por defecto de Tailwind y aquí se
         PISA a propósito: es el único cambio que hace que `font-sans` y la
         fuente heredada por defecto sean la misma cosa.

         `bebas` YA NO apunta a `--font-sans`.
         Antes sí, como parche: 5 ficheros usaban `font-bebas` contra una
         clave que nunca existió en esta config, así que la utilidad no se
         generaba y el texto caía a la fuente del sistema. El parche cerraba
         eso, pero dejaba sin resolver la intención original — el propio
         nombre `bebas` (por Bebas Neue) y el uso siempre en mayúsculas,
         itálica y muy trackeado en esos 5 sitios) era claramente un guiño a
         una tipografía DISPLAY que nunca llegó a cargarse. Ahora que
         `--font-display` existe (Anton, ver tokens.css), `bebas` apunta ahí:
         los 5 ficheros pasan a tener la fuente de trazo grueso que su propio
         marcado llevaba pidiendo desde el principio, sin tocarlos uno a uno. */
      fontFamily: {
        sans: "var(--font-sans)",
        display: "var(--font-display)",
        bebas: "var(--font-display)",
      },

      borderRadius: {
        chip: "var(--radius-xs)", // 4px
        field: "var(--radius-sm)", // 8px  — inputs, botones
        card: "var(--radius-md)", // 12px — tarjetas, paneles
        sheet: "var(--radius-lg)", // 16px — modales. Techo del sistema.
        pill: "var(--radius-pill)",
      },

      boxShadow: {
        raise: "var(--shadow-sm)",
        float: "var(--shadow-md)",
        overlay: "var(--shadow-lg)",
      },

      /* Escala fija en rem, no fluida: el registro de producto se consume a
         DPI constante y un titular que encoge dentro de un panel se ve peor,
         no mejor. Razón ~1.2.

         Nombres propios con prefijo `t-` para no pisar `text-sm`/`text-xl`/…
         de Tailwind, que están usados por toda la app. */
      fontSize: {
        "t-2xs": ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.01em" }], // 11px — badges
        "t-xs": ["0.75rem", { lineHeight: "1.125rem" }], // 12px — metadatos
        "t-sm": ["0.875rem", { lineHeight: "1.375rem" }], // 14px — UI por defecto
        "t-base": ["1rem", { lineHeight: "1.5rem" }], // 16px — cuerpo
        "t-lg": ["1.125rem", { lineHeight: "1.625rem" }], // 18px
        "t-xl": ["1.375rem", { lineHeight: "1.75rem", letterSpacing: "-0.01em" }], // 22px — h3
        "t-2xl": ["1.75rem", { lineHeight: "2.125rem", letterSpacing: "-0.02em" }], // 28px — h2
        "t-3xl": ["2.25rem", { lineHeight: "2.5rem", letterSpacing: "-0.025em" }], // 36px — h1
        "t-4xl": ["3rem", { lineHeight: "3.25rem", letterSpacing: "-0.03em" }], // 48px — display

        // Cifras grandes: pesos, totales, cuenta atrás. Tabulares.
        metric: ["2.5rem", { lineHeight: "1", letterSpacing: "-0.02em" }],

        /* DISPLAY — SOLO PORTADA.
           La escala de arriba es fija a propósito: dentro de la aplicación un
           titular que encoge al estrechar un panel se ve peor, no mejor.
           La portada es lo contrario — se ve en un móvil y en un monitor de
           27", y ahí un tamaño fijo o se queda enano o desborda.

           Techo 6rem: por encima la página grita en vez de diseñar.
           Tracking -0.03em: el suelo del sistema. Por debajo se tocan. */
        "d-sm": ["clamp(1.875rem, 5vw, 3rem)", { lineHeight: "1.05", letterSpacing: "-0.03em" }],
        "d-md": ["clamp(2.5rem, 7vw, 4.5rem)", { lineHeight: "1", letterSpacing: "-0.03em" }],
        "d-lg": ["clamp(3rem, 10vw, 6rem)", { lineHeight: "0.95", letterSpacing: "-0.03em" }],
      },

      letterSpacing: {
        // Suelo del sistema: por debajo de -0.04em las letras se tocan.
        display: "-0.03em",
      },

      /* `out` e `in-out` SÍ son claves por defecto de Tailwind: usarlas
         redefiniría `ease-out` y `ease-in-out` en toda la app. */
      transitionTimingFunction: {
        snap: "var(--ease-out)",
        smooth: "var(--ease-in-out)",
      },

      transitionDuration: {
        instant: "var(--dur-instant)",
        fast: "var(--dur-fast)",
        base: "var(--dur-base)",
        slow: "var(--dur-slow)",
      },

      zIndex: {
        sticky: "100",
        dropdown: "200",
        backdrop: "300",
        modal: "400",
        toast: "500",
        tooltip: "600",
      },

      /* ENTRADAS EN CSS — el nivel 2 de la arquitectura de movimiento.
         =================================================================
         POR QUÉ EXISTEN.

         Dieciocho ficheros usaban `animate-in`, `fade-in`, `zoom-in-95`,
         `slide-in-from-top-2` y `animate-fade-in`: la sintaxis de
         `tailwindcss-animate`, que NO está instalado. No había ni plugin ni
         keyframes propios, así que Tailwind no generaba una sola regla y esas
         animaciones NUNCA se ejecutaron — comprobado en el CSS compilado.
         Popovers, menús, el temporizador de descanso y toda la sección de
         nutrición llevaban desde siempre apareciendo de golpe.

         POR QUÉ NO SE INSTALA EL PLUGIN, QUE SERÍA LO CÓMODO.

         `tailwindcss-animate` trae su propia escala de duraciones y su propio
         vocabulario (`animate-in` + modificadores). Meterlo significaría tener
         TRES sistemas de movimiento conviviendo: la capa de respuesta de
         index.css, framer-motion, y ese. Justo lo que produjo este fallo.

         Estas cinco animaciones son la traducción de las que se pedían, pero
         atadas a los tokens del sistema: misma curva y misma duración que usa
         framer-motion a través de lib/motion.ts. `prefers-reduced-motion` ya
         las neutraliza dos veces (tokens.css colapsa --dur-* a 1ms e
         index.css fuerza animation-duration).

         CUÁNDO USAR ESTAS Y CUÁNDO framer-motion: estas sirven para algo que
         ENTRA y ya está. En cuanto haga falta animar también la SALIDA hace
         falta AnimatePresence, y entonces es framer-motion. Ver DESIGN.md.

         Solo se desplazan `opacity` y `transform`: nada que fuerce reflow. */
      keyframes: {
        fade: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        // Sube al entrar. El equivalente de `riseIn` en lib/motion.ts, y los
        // mismos 8px: suficiente para leerse como "ha llegado" sin que el ojo
        // pierda el sitio.
        rise: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        // Baja al entrar. Para lo que cuelga de una cabecera: menús, avisos
        // pegados arriba. La dirección cuenta de dónde viene el elemento.
        drop: {
          from: { opacity: "0", transform: "translateY(-8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        // Entra desde la derecha. Paneles laterales y vistas que sustituyen a
        // otra dentro del mismo hueco.
        slide: {
          from: { opacity: "0", transform: "translateX(16px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        // 0.97 y no 0.95: por debajo de eso un diálogo se lee como que rebota.
        // Es el mismo valor que `dialogIn` en lib/motion.ts.
        pop: {
          from: { opacity: "0", transform: "scale(0.97)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        // Barra de progreso indeterminada del arranque en frío. Vivía como un
        // `<style>` inyectado dentro de DashboardSkeleton, o sea una etiqueta
        // de estilo nueva en cada render de ese componente.
        shimmer: {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(200%)" },
        },
      },

      /* `both` en el modo de relleno: sin él, el elemento se pinta un frame en
         su estado final antes de arrancar la animación y se ve un parpadeo. */
      animation: {
        fade: "fade var(--dur-base) var(--ease-out) both",
        rise: "rise var(--dur-base) var(--ease-out) both",
        drop: "drop var(--dur-base) var(--ease-out) both",
        slide: "slide var(--dur-base) var(--ease-out) both",
        pop: "pop var(--dur-base) var(--ease-out) both",
        // Giro lento y continuo para un icono decorativo (el engranaje de la
        // cuenta atrás). El único caso legítimo de bucle en la aplicación, y
        // por eso lleva la curva de bucle y no la de salida.
        "spin-slow": "spin 4s linear infinite",
        shimmer: "shimmer 1.5s linear infinite",
      },
    },
  },
  plugins: [],
};
