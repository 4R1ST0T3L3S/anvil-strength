/** @type {import('tailwindcss').Config} */

/* Los valores viven en src/styles/tokens.css; aquí solo se exponen como
   utilidades de Tailwind. Cambiar un color se hace allí, nunca aquí. */

/**
 * Expone un token de color de forma que ADEMÁS admita el modificador de
 * opacidad de Tailwind (`bg-brand/35`).
 *
 * Un color declarado como `"var(--brand)"` a secas rompe el modificador:
 * Tailwind no puede inyectar el alfa dentro de una variable cuyo contenido no
 * conoce, genera un valor inválido y el navegador lo resuelve como
 * TRANSPARENTE, sin error en ninguna parte. `color-mix` en OKLCH mantiene el
 * tono al bajar el alfa.
 */
const token =
  (name) =>
  ({ opacityValue } = {}) => {
    // Sin modificador, Tailwind pasa la cadena `var(--tw-bg-opacity)`: ahí no
    // hay nada que mezclar y se devuelve el token tal cual.
    const alpha = Number(opacityValue);
    if (!Number.isFinite(alpha) || alpha >= 1) return `var(${name})`;
    return `color-mix(in oklch, var(${name}) ${alpha * 100}%, transparent)`;
  };

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      /* `pc`: ordenador con alto de sobra (el inicio a pantalla completa, sin
         scroll). Por debajo de 640px de alto se apila y hace scroll. */
      screens: {
        pc: { raw: "(min-width: 1024px) and (min-height: 640px)" },
      },
      colors: {
        surface: {
          sunken: token("--surface-sunken"),
          canvas: token("--surface-canvas"),
          sidebar: token("--surface-sidebar"),
          raised: token("--surface-raised"),
          overlay: token("--surface-overlay"),
        },
        /* Rellenos: estados sobre cualquier superficie (hover, selección,
           campos, botones secundarios). Ver tokens.css §1. */
        fill: {
          hover: token("--fill-hover"),
          pressed: token("--fill-pressed"),
          selected: token("--fill-selected"),
          input: token("--fill-input"),
          muted: token("--fill-muted"),
          strong: token("--fill-strong"),
        },
        separator: token("--separator"),
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
          "quiet-strong": token("--brand-quiet-strong"),
          line: token("--brand-line"),
          ink: token("--brand-ink"),
          // El rojo cuando ES el texto, no el relleno. Ver tokens.css.
          text: token("--brand-text"),
        },
        success: { DEFAULT: token("--success"), quiet: token("--success-quiet") },
        warning: { DEFAULT: token("--warning"), quiet: token("--warning-quiet") },
        danger: {
          DEFAULT: token("--danger"),
          hover: token("--danger-hover"),
          quiet: token("--danger-quiet"),
          "quiet-strong": token("--danger-quiet-strong"),
          text: token("--danger-text"),
        },
        info: { DEFAULT: token("--info"), quiet: token("--info-quiet") },
        effort: {
          low: token("--effort-low"),
          mid: token("--effort-mid"),
          high: token("--effort-high"),
          max: token("--effort-max"),
        },

        // Portada. Registro de marca: ver tokens.css §11.
        fold: {
          light: token("--fold-light"),
          "light-raised": token("--fold-light-raised"),
          "light-ink": token("--fold-light-ink"),
          "light-ink-muted": token("--fold-light-ink-muted"),
          "light-line": token("--fold-light-line"),
        },
      },

      /* ADITIVO, NUNCA SOBRESCRITO: nombres propios en vez de los de Tailwind
         (`sm`, `md`, `lg`...). Redefinir esos nombres no añade utilidades:
         cambia las que ya hay en toda la app de golpe. */

      borderColor: {
        subtle: token("--border-subtle"),
        line: token("--border-default"),
        strong: token("--border-strong"),
        card: token("--card-border"),
        separator: token("--separator"),
      },

      /* `sans` se PISA a propósito: así `font-sans` y la fuente heredada son
         la misma. En la app es la del sistema (SF en Apple, Inter en el
         resto); dentro de `.registro-marca`, la de la portada. `bebas` apunta
         a la display de la portada (Anton). */
      fontFamily: {
        sans: "var(--font-sans)",
        mono: "var(--font-mono)",
        display: "var(--font-display)",
        bebas: "var(--font-display)",
      },

      /* ZONA SEGURA DEL DISPOSITIVO (`pb-safe`, `mb-safe`, `bottom-safe`). */
      spacing: {
        safe: "env(safe-area-inset-bottom, 0px)",
        "safe-top": "env(safe-area-inset-top, 0px)",
      },

      borderRadius: {
        chip: "var(--radius-xs)", // 6px  — insignias
        field: "var(--radius-sm)", // 10px — campos, botones
        card: "var(--radius-md)", // 14px — tarjetas, listas agrupadas
        sheet: "var(--radius-lg)", // 20px — hojas y diálogos. Techo.
        pill: "var(--radius-pill)",
      },

      boxShadow: {
        card: "var(--shadow-card)",
        raise: "var(--shadow-sm)",
        float: "var(--shadow-md)",
        overlay: "var(--shadow-lg)",
      },

      /* Escala fija en rem: el producto se consume a DPI constante y un
         titular que encoge dentro de un panel se ve peor, no mejor.
         `title` es el título grande de pantalla (el "large title" de iOS). */
      fontSize: {
        "t-2xs": ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.005em" }], // 11px — insignias
        "t-xs": ["0.75rem", { lineHeight: "1.125rem" }], // 12px — metadatos
        "t-sm": ["0.875rem", { lineHeight: "1.3125rem", letterSpacing: "-0.003em" }], // 14px — UI
        "t-base": ["1rem", { lineHeight: "1.5rem", letterSpacing: "-0.006em" }], // 16px — cuerpo
        "t-lg": ["1.125rem", { lineHeight: "1.5625rem", letterSpacing: "-0.01em" }], // 18px
        "t-xl": ["1.375rem", { lineHeight: "1.75rem", letterSpacing: "-0.014em" }], // 22px — h3
        "t-2xl": ["1.75rem", { lineHeight: "2.125rem", letterSpacing: "-0.02em" }], // 28px — h2
        "t-3xl": ["2.25rem", { lineHeight: "2.5rem", letterSpacing: "-0.025em" }], // 36px — h1
        "t-4xl": ["3rem", { lineHeight: "3.25rem", letterSpacing: "-0.03em" }], // 48px — display
        title: ["2rem", { lineHeight: "2.375rem", letterSpacing: "-0.024em" }], // 32px — título de pantalla

        // Cifras grandes: pesos, totales, cuenta atrás. Tabulares.
        metric: ["2.5rem", { lineHeight: "1", letterSpacing: "-0.02em" }],

        /* DISPLAY — SOLO PORTADA. Techo 6rem; tracking -0.03em. */
        "d-sm": ["clamp(1.875rem, 5vw, 3rem)", { lineHeight: "1.05", letterSpacing: "-0.03em" }],
        "d-md": ["clamp(2.5rem, 7vw, 4.5rem)", { lineHeight: "1", letterSpacing: "-0.03em" }],
        "d-lg": ["clamp(3rem, 10vw, 6rem)", { lineHeight: "0.95", letterSpacing: "-0.03em" }],
      },

      letterSpacing: {
        // Suelo del sistema: por debajo de -0.04em las letras se tocan.
        display: "-0.03em",
      },

      /* `out` e `in-out` SÍ son claves de Tailwind: por eso nombres propios. */
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

      /* ENTRADAS EN CSS — para lo que ENTRA y ya está. Si hace falta animar
         la salida, framer-motion (AnimatePresence). Solo `opacity` y
         `transform`, atadas a los tokens; `prefers-reduced-motion` las anula. */
      keyframes: {
        fade: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        rise: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        drop: {
          from: { opacity: "0", transform: "translateY(-8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        slide: {
          from: { opacity: "0", transform: "translateX(16px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        pop: {
          from: { opacity: "0", transform: "scale(0.97)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        // El check de "revisado" y el de "enviado": un único latido corto que
        // confirma que se ha registrado, no una celebración.
        tick: {
          "0%": { transform: "scale(0.6)", opacity: "0" },
          "60%": { transform: "scale(1.08)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        shimmer: {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(200%)" },
        },
      },

      /* `both`: sin él, el elemento se pinta un frame en su estado final antes
         de arrancar y se ve un parpadeo. */
      animation: {
        fade: "fade var(--dur-base) var(--ease-out) both",
        rise: "rise var(--dur-base) var(--ease-out) both",
        drop: "drop var(--dur-base) var(--ease-out) both",
        slide: "slide var(--dur-base) var(--ease-out) both",
        pop: "pop 160ms var(--ease-out) both",
        tick: "tick 260ms var(--ease-out) both",
        "spin-slow": "spin 4s linear infinite",
        shimmer: "shimmer 1.5s linear infinite",
      },
    },
  },
  plugins: [],
};
