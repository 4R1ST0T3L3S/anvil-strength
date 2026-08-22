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
