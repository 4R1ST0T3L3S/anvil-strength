/**
 * ANVIL STRENGTH — VALIDACIÓN
 * =====================================================================
 * Una sola puerta de entrada, para que ninguna pantalla tenga que saber en
 * qué fichero vive cada cosa.
 *
 *   rules.ts     Validadores genéricos, puros y componibles.
 *   domain.ts    Los rangos de powerlifting, en UN sitio.
 *   useCampo.ts  Estado de un campo y CUÁNDO se enseña el error.
 *
 * La primitiva que los pinta es `src/components/ui/Field.tsx`.
 *
 * Recordatorio que conviene no perder de vista: esto es experiencia de uso,
 * no seguridad. Quien manda son las políticas RLS y las funciones de
 * Supabase, y ninguna regla de aquí las sustituye.
 */

export type { Validador } from './rules';
export {
    combinar,
    requerido,
    email,
    minimoLargo,
    maximoLargo,
    contrasena,
    igualA,
    numeroEnRango,
    entero,
    fecha,
    alMenosUno,
    aceptado,
} from './rules';

export * from './domain';

export type { Campo, CampoOpciones } from './useCampo';
export { useCampo, validarFormulario } from './useCampo';
