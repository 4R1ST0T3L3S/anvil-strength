/**
 * ANVIL STRENGTH — ¿ESTO ES UN BÁSICO O UN ACCESORIO?
 * =====================================================================
 *
 * LA CLASIFICACIÓN, SIN COLORES Y SIN REACT.
 *
 * Esta lógica vivía dentro de `getLiftTheme()`, en
 * `features/planning/components/builder/DayCard.tsx`, mezclada con las clases
 * de Tailwind del tema de cada levantamiento. Funcionaba perfectamente para
 * lo que hacía —pintar una barra de color— pero dejaba la clasificación
 * atrapada dentro de un módulo de React: cualquier cálculo que la necesitara
 * tenía dos salidas, y las dos malas.
 *
 *   · Importar `DayCard` desde `lib/` arrastra React, framer-motion y
 *     lucide-react a un módulo de cálculo puro, y con ello se cae el banco de
 *     pruebas de Node (`npm test`), que no monta componentes.
 *   · Reescribir el regex donde hiciera falta da DOS clasificadores. Y el que
 *     estaría mal sería el nuevo: la lista de exclusiones de abajo costó
 *     descubrirla caso a caso, y sin ella "sentadilla búlgara" se cuenta como
 *     sentadilla de competición. El panel diría 16 series y la tarjeta del
 *     día 12, del mismo día.
 *
 * Así que la clasificación baja aquí y `getLiftTheme` la LLAMA, conservando
 * su firma y su forma de salida exactas. Un solo criterio, dos usos.
 *
 *
 * EL CRITERIO
 *
 * Solo los tres de competición tienen identidad propia. Todo lo demás es
 * accesorio, que es lo que pedía la aplicación al dejar de ser exclusivamente
 * de powerlifting: quien entrena para otra cosa no tiene por qué hacer
 * siempre uno de los tres.
 *
 * Las variantes de COMPETICIÓN sí cuentan como el básico (pausada, con
 * cadenas, tempo, sin despegue…): son el mismo patrón a distinta dificultad,
 * y sus series suman al volumen del movimiento.
 */

/**
 * Palabras que convierten un movimiento en OTRO ejercicio, no en una variante
 * del básico.
 *
 * "Sentadilla búlgara" contiene "sentadilla", así que sin esta lista se
 * marcaba como el movimiento de competición — y lo mismo con la frontal, la
 * hack, el press militar o el peso muerto rumano. Un accesorio no puede
 * contarse igual que el levantamiento al que acompaña: la etiqueta deja de
 * significar nada y el volumen del básico sale inflado.
 */
const NOT_THE_MAIN_LIFT =
    /bulgara|búlgara|frontal|hack|goblet|sissy|jaca|zercher|bulgaro|pistol|split|zancada|prensa|militar|inclinado|declinado|frances|francés|mancuerna|polea|maquina|máquina|banco|hombro|rumano|piernas rigidas|piernas rígidas|stiff|rdl|sumo alto|jefferson/;

/** Los tres de competición, más el cajón de sastre. */
export type LiftKey = 'SQ' | 'BP' | 'DL' | 'ACC';

/**
 * Clasifica un ejercicio por su nombre.
 *
 * Es tolerante con el texto libre porque es texto libre lo que escribe el
 * coach: no normaliza acentos —el regex lleva las dos formas— para no
 * cambiar ni un caso respecto de lo que la aplicación ya venía clasificando.
 */
export function classifyMainLift(name: string | null | undefined): LiftKey {
    const n = (name ?? '').toLowerCase();
    if (!n) return 'ACC';

    if (NOT_THE_MAIN_LIFT.test(n)) return 'ACC';

    if (n.includes('sentadilla') || n.includes('squat')) return 'SQ';

    // "press" a secas NO basta: arrastraba press militar, press francés y
    // cualquier press de máquina a la etiqueta de banca.
    if (n.includes('banca') || n.includes('bench')) return 'BP';

    if (n.includes('peso muerto') || n.includes('deadlift')) return 'DL';

    return 'ACC';
}

/** ¿Es uno de los tres de competición? */
export const isMainLift = (name: string | null | undefined): boolean =>
    classifyMainLift(name) !== 'ACC';
