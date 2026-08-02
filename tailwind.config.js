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
        },
        success: { DEFAULT: token("--success"), quiet: token("--success-quiet") },
        warning: { DEFAULT: token("--warning"), quiet: token("--warning-quiet") },
        danger: { DEFAULT: token("--danger"), hover: token("--danger-hover"), quiet: token("--danger-quiet") },
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

        // Alias heredados. Se mantienen para no romper las ~700 utilidades
        // ya escritas; migrar por pantallas y borrarlos al terminar F5.
        //
        // `anvil-red` pasa por token() igual que el resto: hay 172 usos de
        // `anvil-red/10`, `/20`, `/50`... por toda la app que se escribieron
        // cuando el alias era un hex, y que dejaron de pintar nada al
        // apuntarlo a `var(--brand)`. Los dos siguientes son hex literales,
        // donde el modificador de opacidad ya funciona por sí solo.
        "anvil-black": "#0a0a0a",
        "anvil-red": token("--brand"),
        "anvil-gray": "#2b2d42",
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

         `bebas` no es una segunda familia: apunta al mismo sitio. Había 5
         ficheros usando `font-bebas` contra una clave que nunca existió en
         esta config, así que la utilidad no se generaba y el texto caía a la
         fuente del sistema. Se mapea en vez de borrarse para que esos
         ficheros hereden la familia real sin tocarlos uno a uno. */
      fontFamily: {
        sans: "var(--font-sans)",
        bebas: "var(--font-sans)",
      },

      /* ZONA SEGURA DEL DISPOSITIVO.
         `pb-safe` se usaba en la barra de pestañas del móvil desde siempre...
         y NO EXISTÍA: no había ni plugin ni clase que la definiera, así que
         Tailwind no generaba nada y la barra quedaba pegada al borde de la
         pantalla, debajo del indicador de inicio del iPhone.

         Va en `spacing` y no como utilidad suelta para que sirva en cualquier
         lado (`pb-safe`, `mb-safe`, `bottom-safe`) y se pueda componer con
         `calc()` donde hay que sumarle la altura de una barra. */
      spacing: {
        safe: "env(safe-area-inset-bottom, 0px)",
        "safe-top": "env(safe-area-inset-top, 0px)",
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
    },
  },
  plugins: [],
};
