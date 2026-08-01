/**
 * EXPORTAR LA SEMANA DE ENTRENAMIENTO A PDF
 * =====================================================================
 * Una página por día, una fila por ejercicio, columnas fijas: ejercicio,
 * series, repeticiones, descanso e intensidad.
 *
 * POR QUÉ IMPRESIÓN Y NO UNA LIBRERÍA DE PDF
 *
 * El proyecto tiene `react-pdf`, que es el VISOR de PDF; el generador sería
 * `@react-pdf/renderer`, otra dependencia de cerca de un mega que acabaría en
 * el bundle de una aplicación que se usa en el gimnasio con datos móviles.
 *
 * El diálogo de impresión del navegador ya trae "Guardar como PDF" en
 * Windows, macOS, Android e iOS. Genera el mismo archivo, respeta el tamaño
 * de papel que elija el usuario, no pesa nada y no puede quedarse obsoleto.
 *
 * Se escribe en una ventana aparte a propósito: así la hoja no hereda ni una
 * regla del CSS de la aplicación —que es oscuro y a pantalla completa— y lo
 * que se ve en la vista previa es exactamente lo que sale por la impresora.
 */

import type { TrainingSet, TargetMetric } from '../../types/training';
import { TARGET_METRICS, weekdayLabel } from '../../types/training';

export interface PrintExerciseRow {
    name: string;
    /** Número de series. Vacío si no se puede deducir. */
    series: string;
    /** Repeticiones por serie. Puede ser un rango ("5-6") o varias ("6, 5, 4"). */
    reps: string;
    /** Descanso ya formateado ("2′30″"). */
    rest: string;
    /** Intensidad con su unidad ("140 kg", "@8", "RIR 2", "0,45 m/s"). */
    intensity: string;
    /** Notas del coach para ese ejercicio. */
    notes?: string | null;
}

export interface PrintDay {
    /** "Lunes" o "Día 1". */
    title: string;
    /** "4 de agosto" — opcional, solo si el día está agendado. */
    date?: string | null;
    exercises: PrintExerciseRow[];
}

export interface PrintWeek {
    blockName: string;
    athleteName: string;
    weekLabel: string;
    /** Rango de fechas de la semana, si se conoce. */
    dateRange?: string | null;
    days: PrintDay[];
}

/** Escapa el texto que va al HTML. Los nombres de ejercicio los escribe el coach. */
function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Segundos a "2′30″". Vacío si no hay descanso pautado. */
export function formatRest(seconds: number | null | undefined): string {
    if (!seconds || seconds <= 0) return '';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m === 0) return `${s}″`;
    if (s === 0) return `${m}′`;
    return `${m}′${String(s).padStart(2, '0')}″`;
}

/**
 * Documento completo.
 *
 * `break-after: page` en cada día es lo que cumple el "una página por día".
 * El último lleva `break-after: auto` para no dejar una hoja en blanco al
 * final, que es el fallo clásico de estas exportaciones.
 */
export function buildWeekPrintHtml(week: PrintWeek): string {
    const days = week.days
        .map((day, index) => {
            const isLast = index === week.days.length - 1;

            const rows = day.exercises.length
                ? day.exercises
                      .map(
                          (ex) => `
                <tr>
                  <td class="name">
                    ${escapeHtml(ex.name)}
                    ${ex.notes ? `<span class="note">${escapeHtml(ex.notes)}</span>` : ''}
                  </td>
                  <td class="num">${escapeHtml(ex.series)}</td>
                  <td class="num">${escapeHtml(ex.reps)}</td>
                  <td class="num">${escapeHtml(ex.rest)}</td>
                  <td class="num">${escapeHtml(ex.intensity)}</td>
                </tr>`
                      )
                      .join('')
                : `<tr><td colspan="5" class="empty">Día de descanso</td></tr>`;

            return `
        <section class="day" style="break-after:${isLast ? 'auto' : 'page'}">
          <header class="day-head">
            <div>
              <h2>${escapeHtml(day.title)}</h2>
              ${day.date ? `<p class="day-date">${escapeHtml(day.date)}</p>` : ''}
            </div>
            <div class="meta">
              <p>${escapeHtml(week.athleteName)}</p>
              <p>${escapeHtml(week.blockName)} · ${escapeHtml(week.weekLabel)}</p>
            </div>
          </header>

          <table>
            <thead>
              <tr>
                <th class="name">Ejercicio</th>
                <th class="num">Series</th>
                <th class="num">Reps</th>
                <th class="num">Descanso</th>
                <th class="num">Intensidad</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>

          <footer class="sheet-foot">
            <span>Anvil Strength</span>
            ${week.dateRange ? `<span>${escapeHtml(week.dateRange)}</span>` : '<span></span>'}
          </footer>
        </section>`;
        })
        .join('');

    return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${escapeHtml(`${week.athleteName} — ${week.weekLabel}`)}</title>
<style>
  /* Papel A4 con márgenes cómodos para archivar en carpeta. */
  @page { size: A4; margin: 16mm 14mm; }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    /* Negro sobre blanco: esto se imprime. El tema oscuro de la aplicación
       gastaría un cartucho entero por semana. */
    color: #111;
    background: #fff;
    font-size: 11pt;
    line-height: 1.4;
  }

  .day { padding: 0; }

  .day-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    border-bottom: 2px solid #111;
    padding-bottom: 8px;
    margin-bottom: 14px;
  }
  .day-head h2 {
    margin: 0;
    font-size: 20pt;
    letter-spacing: -0.02em;
    text-transform: uppercase;
  }
  .day-date { margin: 2px 0 0; font-size: 10pt; color: #555; text-transform: capitalize; }
  .meta { text-align: right; font-size: 9pt; color: #555; }
  .meta p { margin: 0; }

  table { width: 100%; border-collapse: collapse; }

  th {
    text-align: left;
    font-size: 8.5pt;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #555;
    border-bottom: 1px solid #bbb;
    padding: 0 6px 6px;
  }
  th.num, td.num { text-align: center; }
  th.name, td.name { text-align: left; }

  td {
    padding: 9px 6px;
    border-bottom: 1px solid #e2e2e2;
    vertical-align: top;
  }
  td.name { font-weight: 600; width: 42%; }
  /* Tabulares: sin esto las cifras bailan de fila en fila. */
  td.num { font-variant-numeric: tabular-nums; white-space: nowrap; }

  .note {
    display: block;
    font-weight: 400;
    font-size: 9pt;
    color: #555;
    margin-top: 3px;
  }

  .empty { text-align: center; color: #777; font-style: italic; padding: 24px 0; }

  .sheet-foot {
    display: flex;
    justify-content: space-between;
    margin-top: 14px;
    padding-top: 8px;
    border-top: 1px solid #ddd;
    font-size: 8pt;
    color: #777;
  }

  /* En pantalla se ve como una hoja; al imprimir, sin adornos. */
  @media screen {
    body { background: #f2f2f2; padding: 24px; }
    .day {
      background: #fff;
      max-width: 820px;
      margin: 0 auto 24px;
      padding: 32px;
      box-shadow: 0 2px 8px rgba(0,0,0,.12);
    }
  }
</style>
</head>
<body>${days}</body>
</html>`;
}

/**
 * Abre la hoja en una pestaña nueva y lanza el diálogo de impresión.
 *
 * Devuelve `false` si el navegador bloqueó la ventana emergente, para que
 * quien llama pueda avisar en vez de dejar al usuario esperando algo que
 * nunca va a aparecer.
 */
export function printWeek(week: PrintWeek): boolean {
    const win = window.open('', '_blank');
    if (!win) return false;

    win.document.write(buildWeekPrintHtml(week));
    win.document.close();

    // Se espera al `load` porque Safari abre el diálogo antes de haber
    // maquetado la página y sale la primera hoja en blanco.
    const launch = () => {
        win.focus();
        win.print();
    };

    if (win.document.readyState === 'complete') launch();
    else win.addEventListener('load', launch, { once: true });

    return true;
}

// =====================================================================
// DE LOS DATOS DE LA APP A LAS FILAS DE LA HOJA
// =====================================================================


/** Forma mínima que necesita el exportador. La cumplen las dos pantallas. */
export interface PrintableExercise {
    exercise?: { name: string } | null;
    variant_name?: string | null;
    notes?: string | null;
    rest_seconds?: number | null;
    rpe?: string | null;
    sets: TrainingSet[];
}

export interface PrintableSession {
    name?: string | null;
    day_number: number;
    day_of_week?: string | null;
    exercises: PrintableExercise[];
}

/** "4x6" -> 4 series. Sin la "x", es una serie suelta. */
function seriesCount(targetReps: string | null | undefined): number {
    if (!targetReps) return 1;
    const parts = targetReps.toLowerCase().split('x');
    if (parts.length < 2) return 1;
    const n = parseInt(parts[0].trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
}

/** "4x6" -> "6". Sin la "x", el valor entero ("5-6", "AMRAP"). */
function repsPart(targetReps: string | null | undefined): string {
    if (!targetReps) return '';
    const parts = targetReps.toLowerCase().split('x');
    return (parts.length >= 2 ? parts.slice(1).join('x') : parts[0]).trim();
}

/** Junta valores repetidos en uno: ["6","6","5"] -> "6, 6, 5"; ["6","6"] -> "6". */
function collapse(values: string[]): string {
    const clean = values.filter(Boolean);
    if (clean.length === 0) return '';
    const unique = [...new Set(clean)];
    return unique.length === 1 ? unique[0] : clean.join(', ');
}

/** Intensidad de una serie, con su unidad. Ver database/set_target_metric.sql. */
function intensityOf(set: TrainingSet): string {
    const metric: TargetMetric = set.target_metric ?? 'kg';

    if (metric === 'rpe') return set.target_rpe ? `RPE ${set.target_rpe}` : '';
    if (set.target_load === null || set.target_load === undefined) return '';

    const spec = TARGET_METRICS.find(m => m.key === metric);
    const unit = spec?.unit ? ` ${spec.unit}` : '';
    const prefix = metric === 'rir' ? 'RIR ' : '';
    return `${prefix}${set.target_load}${unit}`;
}

/**
 * Convierte una sesión en una página de la hoja.
 *
 * UNA fila por ejercicio, como se pidió: las series de un mismo ejercicio se
 * agregan en vez de ocupar una fila cada una. Cuando todas coinciden se
 * escribe el valor una vez ("4" series de "6"); cuando no —una pirámide, por
 * ejemplo— se listan en orden ("6, 5, 4"), que es como lo lee un atleta.
 */
export function sessionToPrintDay(session: PrintableSession): PrintDay {
    const weekday = weekdayLabel(session.day_of_week);

    return {
        title: session.name || weekday || `Día ${session.day_number}`,
        date: session.name && weekday ? weekday : null,
        exercises: session.exercises.map((ex) => {
            const sets = ex.sets ?? [];

            const totalSeries = sets.reduce((sum, s) => sum + seriesCount(s.target_reps), 0);
            const reps = collapse(sets.map(s => repsPart(s.target_reps)));
            const intensity = collapse(sets.map(intensityOf));

            // El descanso puede estar en el ejercicio o en cada serie.
            const rest = ex.rest_seconds ?? sets.find(s => s.rest_seconds)?.rest_seconds ?? null;

            const name = [ex.exercise?.name ?? 'Ejercicio', ex.variant_name]
                .filter(Boolean)
                .join(' · ');

            return {
                name,
                series: totalSeries > 0 ? String(totalSeries) : '',
                reps,
                rest: formatRest(rest),
                // El RPE global del ejercicio vale cuando ninguna serie trae
                // intensidad propia: si no, la columna saldría vacía en los
                // días pautados solo por esfuerzo.
                intensity: intensity || (ex.rpe ? `RPE ${ex.rpe}` : ''),
                notes: ex.notes,
            };
        }),
    };
}
