export const ANVIL_QUOTES = [
    "Para soltero las 30 singles que tengo hoy.",
    "¿Rodilleras de neopreno? Lo que necesito son rodillas nuevas.",
    "Si te duele es que estás vivo. Si no te duele, sube peso.",
    "Hoy no se entrena, hoy se sobrevive.",
    "El calentamiento es para los que tienen miedo a romperse.",
    "Cardio es levantar las mancuernas rápido.",
    "Todo el mundo quiere ser bodybuilder hasta que hay que levantar post-entreno.",
    "Mi pre-entreno es la rabia acumulada de la semana.",
    "Si puedes caminar normal después de pierna, no hiciste pierna.",
    "La gravedad hoy está especialmente pesada.",
    "No es sudor, es mi grasa llorando.",
    "Más discos, menos excusas.",
    "El lunes internacional de pecho es sagrado.",
    "Si no hay video, no fue PR.",
    "Hago ejercicio porque me gusta mucho comer.",
    "Mis callos tienen callos.",
    "Busco relación seria con la barra olímpica.",
    "¿Descanso activo? Eso significa ir al rack caminando.",
    "La técnica es importante, pero el peso sube el ego.",
    "Entrenar es el único momento donde sufrir es divertido.",
    "Imagina tener menos DL que Pau... Eso si es motivación para entrenar.",
    "HOY ES DÍA DE PR ALERT"
];

export function getAnvilQuote(): string {
    const now = new Date();
    // Rotate every 15 minutes (15 * 60 * 1000 ms)
    const fifteenMinIntervals = Math.floor(now.getTime() / (15 * 60 * 1000));
    return ANVIL_QUOTES[fifteenMinIntervals % ANVIL_QUOTES.length];
}
