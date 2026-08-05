import { CalendarDays, Users } from 'lucide-react';

/**
 * LAS DOS TARJETAS DE CABECERA DEL PANEL DEL ENTRENADOR
 *
 * Viven aquí y no dentro de `CoachHome` por una razón concreta: `CoachHome`
 * consulta a Supabase nada más montarse, así que revisar su maquetación a
 * 375px exigía una cuenta, datos de verdad y una sesión abierta. Estas dos
 * solo reciben props, así que el banco de /dev/movil las monta tal cual y lo
 * que se mide ahí es EXACTAMENTE lo que se envía.
 *
 * Ver src/features/devtools/MobilePreview.tsx.
 *
 *
 * POR QUÉ LAS DOS LLEVAN `min-w-0` EN LA RAÍZ
 * ---------------------------------------------------------------------
 *
 * Es lo que hacía que se vieran cortadas en el móvil, y no se ve en el
 * código de la tarjeta sino en el de su contenedor.
 *
 * Una columna de rejilla sin declarar es `auto`, y `auto` se dimensiona al
 * MAX-CONTENT de lo que lleva dentro. `truncate` no reduce el max-content:
 * pone `white-space: nowrap`, que es justo lo contrario —le dice al motor
 * que el texto mide lo que mida la frase entera, en una línea—. Con una
 * competición llamada "Campeonato de España Absoluto de Powerlifting
 * Clásico", la columna pedía 555px dentro de una pantalla de 375.
 *
 * Y no se veía como un desbordamiento porque el `overflow-x-hidden` del
 * armazón del panel lo RECORTA en silencio: no hay barra de scroll, no hay
 * aviso en consola, solo tarjetas a las que les falta el lado derecho.
 *
 * `min-w-0` en el elemento de rejilla corta esa propagación en el sitio
 * correcto. Se pone AQUÍ y no en la rejilla de `CoachHome` para que la
 * tarjeta sea segura en cualquier contenedor que la monte —incluido el
 * banco de pruebas— y no dependa de que quien la use se acuerde.
 */

export interface NextComp {
    name: string;
    date: string;
    days: number;
    level: string;
    location: string;
}

/**
 * Acción principal del panel: ir a la lista de atletas.
 *
 * Es lo único con relleno de marca en toda la pantalla. Un panel donde tres
 * cosas gritan a la vez no tiene jerarquía, tiene ruido.
 */
export function TeamCard({
    athleteCount,
    onClick,
}: {
    athleteCount: number | null;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className="group relative flex min-h-[124px] min-w-0 flex-col justify-between gap-4 overflow-hidden rounded-card bg-brand p-4 text-left transition-colors duration-fast ease-snap hover:bg-brand-hover active:bg-brand-active sm:min-h-[132px] sm:p-5"
        >
            {/* MARCA DE AGUA.
                Anclada a la ESQUINA y recortada por `overflow-hidden`, así que
                su tamaño no depende del ancho de la tarjeta. A 128px sobre una
                tarjeta de 343px de ancho ocupaba más de un tercio del bloque y
                el contorno del icono cruzaba por detrás del texto; a 104px se
                queda donde tiene que estar, que es en el fondo. */}
            <Users
                size={104}
                aria-hidden="true"
                className="pointer-events-none absolute -right-5 -top-4 text-brand-ink opacity-[0.12] transition-transform duration-base ease-snap group-hover:scale-105 sm:-right-6 sm:h-32 sm:w-32"
            />
            <Users size={24} className="relative shrink-0 text-brand-ink" aria-hidden="true" />
            <span className="relative min-w-0">
                {/* `text-balance` y no `truncate`: el titular puede partirse en
                    dos líneas sin problema, pero cortarlo con puntos
                    suspensivos en la acción principal del panel sería raro. */}
                <span className="block text-balance text-t-xl font-black uppercase leading-none tracking-display text-brand-ink sm:text-t-2xl">
                    Mis atletas
                </span>
                <span className="mt-1.5 block text-t-sm leading-snug text-brand-ink/80">
                    {athleteCount === null
                        ? 'Programación y seguimiento'
                        : athleteCount === 0
                            ? 'Todavía no tienes ninguno asignado'
                            : `${athleteCount} ${athleteCount === 1 ? 'atleta asignado' : 'atletas asignados'}`}
                </span>
            </span>
        </button>
    );
}

/**
 * Cuánto queda para la próxima tarima del equipo.
 *
 * LA CIFRA MANDA, PERO NO A CUALQUIER PRECIO. El bloque del número era
 * `shrink-0` con `text-metric` fijo: con tres dígitos ("340 días") se comía
 * 90px de los 303 disponibles a 375px y el nombre de la competición se
 * quedaba en dos palabras y puntos suspensivos. Ahora la cifra baja un
 * escalón en móvil y sube en cuanto hay sitio.
 */
export function NextCompCard({
    comp,
    onClick,
}: {
    comp: NextComp;
    onClick: () => void;
}) {
    const days = Math.max(comp.days, 0);
    const subtitle = [comp.location, comp.level].filter(Boolean).join(' · ');

    return (
        <button
            onClick={onClick}
            className="group flex min-h-[124px] min-w-0 items-center gap-4 rounded-card border border-[var(--border-default)] bg-surface-raised p-4 text-left transition-colors duration-fast ease-snap hover:border-[var(--border-strong)] hover:bg-surface-overlay sm:min-h-[132px] sm:gap-5 sm:p-5"
        >
            <span className="shrink-0 text-center">
                <span className="block text-t-3xl font-black leading-none tabular-nums text-brand sm:text-metric">
                    {days}
                </span>
                <span className="mt-1 block text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">
                    {days === 1 ? 'día' : 'días'}
                </span>
            </span>

            {/* `min-w-0` es lo que hace que `truncate` funcione dentro de un
                flex: sin él la caja crece con su contenido y el nombre largo
                empuja a la cifra fuera de la tarjeta en vez de recortarse. */}
            <span className="min-w-0 flex-1">
                <span className="block truncate text-t-base font-bold leading-tight text-ink">
                    {comp.name}
                </span>
                <span className="mt-1 block truncate text-t-xs text-ink-subtle">
                    {subtitle || 'Próxima competición'}
                </span>
            </span>
        </button>
    );
}

/** Ningún atleta tiene competición. Mismo alto que la tarjeta que sustituye. */
export function NoCompCard() {
    return (
        <div className="flex min-h-[124px] min-w-0 items-center gap-4 rounded-card border border-dashed border-[var(--border-default)] p-4 sm:min-h-[132px] sm:p-5">
            <CalendarDays size={22} className="shrink-0 text-ink-faint" aria-hidden="true" />
            <p className="text-t-sm leading-snug text-ink-subtle">
                Ninguno de tus atletas tiene competición asignada todavía.
            </p>
        </div>
    );
}
