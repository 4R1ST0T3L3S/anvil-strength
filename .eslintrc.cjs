module.exports = {
    root: true,
    env: { browser: true, es2020: true },
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:react-hooks/recommended',
    ],
    // `supabase/functions` corre en Deno con `service_role`, no en el
    // navegador: no puede importar nada de `src/` y sus reglas son otras.
    ignorePatterns: ['dist', '.eslintrc.cjs', 'supabase/functions'],
    parser: '@typescript-eslint/parser',
    plugins: ['react-refresh'],
    rules: {
        'react-refresh/only-export-components': [
            'warn',
            { allowConstantExport: true },
        ],
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],

        /**
         * `coach_athletes` SE CONSULTA POR UNA SOLA PUERTA.
         *
         * La misma consulta —"¿quiénes son los atletas de este entrenador?"—
         * llegó a estar escrita ocho veces a mano, y CINCO de las ocho se
         * olvidaban de `status = 'active'`. Consecuencia: un atleta al que el
         * coach había sacado del equipo desaparecía de la pestaña "Atletas" y
         * seguía apareciendo, con su nombre real, en el inicio del panel.
         *
         * Un filtro que hay que acordarse de escribir en ocho sitios es un
         * filtro que alguien se va a dejar. Esta regla lo impide de raíz:
         * usa `src/features/coach/hooks/useCoachRoster.ts`, que es donde vive
         * la consulta y el filtro.
         *
         * Excepciones legítimas (leen o escriben UN par coach-atleta concreto,
         * no una lista): `athletesService.getCoachNotes` y `saveCoachNotes`.
         * Van marcadas con `eslint-disable-next-line` y su motivo al lado.
         */
        'no-restricted-syntax': [
            'error',
            {
                selector:
                    "CallExpression[callee.property.name='from'][arguments.0.value='coach_athletes']",
                message:
                    'No consultes `coach_athletes` directamente: se olvida el filtro `status`. ' +
                    'Usa fetchRoster/fetchRosterIds/useCoachRoster de ' +
                    'src/features/coach/hooks/useCoachRoster.ts.',
            },

            /**
             * `outline-none` SIN ANILLO DE SUSTITUCIÓN DEJA EL CONTROL SIN FOCO.
             *
             * Había 156 repartidos por la app: 97 sueltos (que matan el
             * contorno SIEMPRE, no solo al enfocar) y 59 con el prefijo
             * `focus:`. Ninguno de los 97 traía un anillo propio.
             *
             * Y no bastaba con el `:focus-visible` global de index.css:
             * `.focus\:outline-none:focus` tiene especificidad (0,2,0) y
             * `:focus-visible` (0,1,0), así que la utilidad GANA. El anillo
             * estaba escrito, y perdía.
             *
             * Lo que sí vale es `focus-visible:outline-none` acompañado de
             * `focus-visible:ring-*`, que es lo que hace `Button`: ahí el
             * contorno se sustituye por un anillo, no se borra. Esta regla lo
             * permite a propósito y solo prohíbe las dos formas destructivas.
             */
            {
                selector: "Literal[value=/(^|\\s)(focus:)?outline-none(\\s|$)/]",
                message:
                    'No uses `outline-none` ni `focus:outline-none`: borran el anillo de foco y ' +
                    'ganan por especificidad al `:focus-visible` global de index.css, así que el ' +
                    'control queda inutilizable con teclado. Si necesitas un foco propio, usa ' +
                    '`focus-visible:outline-none` JUNTO A `focus-visible:ring-2 focus-visible:ring-brand` ' +
                    '(ver src/components/ui/Button.tsx). Si no, no pongas nada: el anillo ya viene solo.',
            },
            {
                selector: "TemplateElement[value.raw=/(^|\\s)(focus:)?outline-none(\\s|$)/]",
                message:
                    'No uses `outline-none` ni `focus:outline-none`: borran el anillo de foco y ' +
                    'ganan por especificidad al `:focus-visible` global de index.css, así que el ' +
                    'control queda inutilizable con teclado. Si necesitas un foco propio, usa ' +
                    '`focus-visible:outline-none` JUNTO A `focus-visible:ring-2 focus-visible:ring-brand` ' +
                    '(ver src/components/ui/Button.tsx). Si no, no pongas nada: el anillo ya viene solo.',
            },
        ],
    },
    overrides: [
        {
            // La puerta única. Es el sitio donde la consulta SÍ tiene que estar.
            files: ['src/features/coach/hooks/useCoachRoster.ts'],
            rules: { 'no-restricted-syntax': 'off' },
        },
    ],
}
