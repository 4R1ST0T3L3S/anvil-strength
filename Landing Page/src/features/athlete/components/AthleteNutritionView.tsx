import { useMemo, useState } from 'react';
import { Apple, BadgeCheck, ChevronDown, ClipboardList, Clock, FileDown, Pill } from 'lucide-react';
import { toast } from 'sonner';
import { UserProfile } from '../../../hooks/useUser';
import { useAthleteNutritionPlan } from '../../../hooks/useNutrition';
import { Button } from '../../../components/ui/Button';
import { SegmentedControl } from '../../../components/ui/SegmentedControl';
import { diasDelPlan, gramosEnDia, totalesDeComida, totalesDelDia } from '../../../lib/nutricion/dias';
import { agruparAlimentos, macrosDe } from '../../../lib/nutricion/macros';
import { BARRA_MACRO, COLOR_MACRO, ETIQUETA_MACRO, formatear, LineaMacros } from '../../nutrition/components/editor/comun';

/**
 * MI NUTRICIÓN — LO QUE VE EL ATLETA
 * =====================================================================
 *
 * Lo que el atleta necesita mirando el móvil en la cocina: qué come hoy y
 * cuánto. Por eso:
 *
 *   · Si el plan tiene tipos de día (entreno, descanso…), se elige arriba y
 *     todo lo de debajo cambia a ese día.
 *   · Cada hueco enseña el alimento principal y sus alternativas con «ó»,
 *     ya en su cantidad equivalente. Antes salían todas las filas seguidas,
 *     como si hubiera que comérselas todas, y además se sumaban.
 *   · El total del día cuenta solo los principales.
 *   · El PDF se puede descargar desde aquí, igual que lo exporta el
 *     nutricionista.
 */

interface AthleteNutritionViewProps {
    user: UserProfile;
}

const BASE = '__base__';

export function AthleteNutritionView({ user }: AthleteNutritionViewProps) {
    const { data: plan, isLoading } = useAthleteNutritionPlan(user.id);
    const [diaElegido, setDiaElegido] = useState<string>(BASE);
    const [plegadas, setPlegadas] = useState<Record<string, boolean>>({});
    const [exportando, setExportando] = useState(false);

    const dias = useMemo(() => (plan ? diasDelPlan(plan) : []), [plan]);
    const dia = diaElegido !== BASE && dias.some((d) => d.id === diaElegido) ? diaElegido : null;
    const diaActual = dias.find((d) => d.id === dia) ?? dias[0];

    if (isLoading) {
        return (
            <div className="mx-auto max-w-3xl space-y-3 p-4 md:p-8" aria-busy="true">
                <div className="h-10 w-48 animate-pulse rounded-field bg-surface-raised" />
                <div className="h-24 animate-pulse rounded-card bg-surface-raised" />
                <div className="h-48 animate-pulse rounded-card bg-surface-raised" />
            </div>
        );
    }

    if (!plan) {
        return (
            <div className="mx-auto max-w-3xl p-4 md:p-8">
                <h1 className="text-t-2xl font-semibold tracking-display text-ink md:text-t-3xl">Mi nutrición</h1>
                <div className="mt-6 rounded-card border border-[var(--border-default)] bg-surface-raised p-8 text-center">
                    <Apple className="mx-auto text-ink-faint" size={28} aria-hidden="true" />
                    <p className="mt-3 text-t-base font-semibold text-ink">Todavía no tienes plan</p>
                    <p className="mx-auto mt-1 max-w-sm text-t-sm text-ink-subtle">
                        Cuando tu nutricionista lo publique aparecerá aquí, con tus comidas, tus cantidades y la suplementación. Mientras tanto, revisa que tu peso y tus objetivos estén al día en tu perfil.
                    </p>
                </div>
            </div>
        );
    }

    const total = totalesDelDia(plan, dia);
    const comidas = plan.meals ?? [];

    const descargar = async () => {
        setExportando(true);
        try {
            const { descargarPdfPlan } = await import('../../../lib/nutricion/pdf');
            await descargarPdfPlan(plan, { atleta: user.full_name ?? user.nickname ?? null });
        } catch {
            toast.error('No se pudo generar el PDF');
        } finally {
            setExportando(false);
        }
    };

    return (
        <div className="mx-auto max-w-3xl space-y-5 p-4 pb-28 md:p-8">
            <header className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-t-2xl font-semibold tracking-display text-ink md:text-t-3xl">Mi nutrición</h1>
                    {plan.training_block_id && <p className="mt-1 text-t-sm text-ink-muted">Bloque: {plan.training_block_id}</p>}
                </div>
                <Button size="sm" variant="secondary" icon={<FileDown size={14} />} loading={exportando} onClick={descargar}>
                    PDF
                </Button>
            </header>

            {dias.length > 1 && (
                <SegmentedControl
                    segmentos={dias.map((d) => ({ id: d.id ?? BASE, label: d.nombre }))}
                    activo={dia ?? BASE}
                    onChange={setDiaElegido}
                    aria-label="Tipo de día"
                    block
                />
            )}

            {(plan.tags?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {plan.tags!.map((t, i) => (
                        <span key={i} className="rounded-pill bg-[var(--brand-quiet)] px-2.5 py-0.5 text-t-xs font-semibold text-brand-text">{t}</span>
                    ))}
                </div>
            )}

            {/* OBJETIVO DEL DÍA */}
            <section className="rounded-card border border-[var(--border-default)] bg-surface-raised p-4" aria-label={`Objetivo: ${diaActual.nombre}`}>
                <p className="text-t-xs font-semibold text-ink-subtle">{diaActual.nombre}</p>
                <div className="mt-2 grid grid-cols-4 gap-3">
                    {(['kcal', 'proteina', 'carbos', 'grasas'] as const).map((k) => {
                        const objetivo = diaActual.objetivo[k];
                        const pct = objetivo > 0 ? Math.min(100, (total[k] / objetivo) * 100) : 0;
                        return (
                            <div key={k} className="min-w-0">
                                <p className={`text-t-lg font-semibold tabular-nums ${COLOR_MACRO[k]}`}>{formatear(objetivo || total[k])}</p>
                                <p className="truncate text-t-2xs text-ink-subtle">{ETIQUETA_MACRO[k].larga}{k === 'kcal' ? '' : ' (g)'}</p>
                                <div className="mt-1 h-1 overflow-hidden rounded-pill bg-[var(--fill-muted)]">
                                    <div className={`h-full ${BARRA_MACRO[k]}`} style={{ width: `${pct}%` }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>

            {(plan.general_guidelines?.length ?? 0) > 0 && (
                <section className="rounded-card border border-[var(--border-default)] bg-surface-raised p-4">
                    <h2 className="flex items-center gap-1.5 text-t-sm font-semibold text-ink"><ClipboardList size={15} aria-hidden="true" />Pautas</h2>
                    <ul className="mt-2 space-y-1.5 text-t-sm text-ink-muted">
                        {plan.general_guidelines!.map((g, i) => <li key={i} className="flex gap-2"><span aria-hidden="true">·</span>{g}</li>)}
                    </ul>
                </section>
            )}

            {(plan.global_supplements?.length ?? 0) > 0 && (
                <section className="rounded-card border border-[var(--border-default)] bg-surface-raised p-4">
                    <h2 className="flex items-center gap-1.5 text-t-sm font-semibold text-ink"><Pill size={15} className="text-info" aria-hidden="true" />Suplementación diaria</h2>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {plan.global_supplements!.map((s, i) => (
                            <span key={i} className="rounded-pill bg-[var(--info-quiet)] px-2.5 py-1 text-t-xs text-info">{s}</span>
                        ))}
                    </div>
                </section>
            )}

            {/* COMIDAS */}
            <div className="space-y-3">
                {comidas.length === 0 && (
                    <p className="rounded-card border border-dashed border-[var(--border-default)] p-8 text-center text-t-sm text-ink-subtle">Tu nutricionista aún no ha añadido comidas.</p>
                )}
                {comidas.map((meal) => {
                    const plegada = !!plegadas[meal.id];
                    const grupos = agruparAlimentos(meal.foods ?? []).filter((g) => g.principal.food);
                    const tot = totalesDeComida(meal, dia);
                    return (
                        <section key={meal.id} className="overflow-hidden rounded-card border border-[var(--border-default)] bg-surface-raised">
                            <button
                                type="button"
                                onClick={() => setPlegadas((p) => ({ ...p, [meal.id]: !plegada }))}
                                aria-expanded={!plegada}
                                className="flex w-full items-center gap-3 px-4 py-3 text-left"
                            >
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-baseline gap-2">
                                        <span className="truncate text-t-base font-semibold text-ink">{meal.name}</span>
                                        {meal.time && <span className="inline-flex shrink-0 items-center gap-1 text-t-xs text-ink-subtle"><Clock size={11} aria-hidden="true" />{meal.time.slice(0, 5)}</span>}
                                    </span>
                                    <LineaMacros m={tot} className="mt-0.5 text-t-xs" />
                                </span>
                                <ChevronDown size={18} className={`shrink-0 text-ink-subtle transition-transform duration-fast ease-snap ${plegada ? '-rotate-90' : ''}`} aria-hidden="true" />
                            </button>
                            {!plegada && (
                                <div className="border-t border-[var(--separator)] px-4 py-2">
                                    {grupos.length === 0 && <p className="py-3 text-center text-t-sm text-ink-subtle">Sin alimentos.</p>}
                                    <ul className="divide-y divide-[var(--separator)]">
                                        {grupos.map((g) => (
                                            <li key={g.id} className="py-2.5">
                                                {[g.principal, ...g.alternativas].map((f, i) => {
                                                    if (!f.food) return null;
                                                    const gramos = gramosEnDia(f, dia);
                                                    const m = macrosDe(f.food, gramos);
                                                    return (
                                                        <div key={f.id} className={`flex items-center gap-3 ${i > 0 ? 'mt-1 pl-4' : ''}`}>
                                                            <span className="flex min-w-0 flex-1 items-center gap-1.5">
                                                                {i > 0 && <span className="font-bold text-success" aria-label="o bien">ó</span>}
                                                                {f.food.is_generic && <BadgeCheck size={13} className="shrink-0 text-success" aria-hidden="true" />}
                                                                <span className={`truncate text-t-sm ${i > 0 ? 'text-ink-muted' : 'text-ink'}`}>{f.food.product_name}</span>
                                                            </span>
                                                            <span className={`shrink-0 text-t-sm font-semibold tabular-nums ${i > 0 ? 'text-ink-muted' : 'text-ink'}`}>{formatear(gramos)} g</span>
                                                            <span className="shrink-0 text-right text-t-xs tabular-nums text-ink-subtle sm:w-20">{formatear(m.kcal)} kcal</span>
                                                        </div>
                                                    );
                                                })}
                                                {g.alternativas.length > 0 && <p className="mt-1 pl-4 text-t-2xs text-ink-subtle">Elige una opción.</p>}
                                            </li>
                                        ))}
                                    </ul>
                                    {(meal.meal_supplements?.length ?? 0) > 0 && (
                                        <p className="flex flex-wrap items-center gap-1.5 border-t border-[var(--separator)] py-2.5 text-t-xs text-info">
                                            <Pill size={12} aria-hidden="true" />
                                            {meal.meal_supplements!.join(' · ')}
                                        </p>
                                    )}
                                </div>
                            )}
                        </section>
                    );
                })}
            </div>

            {comidas.length > 0 && (
                <p className="rounded-card bg-[var(--fill-muted)] px-4 py-3 text-t-sm text-ink">
                    <span className="font-semibold">Total del día: </span>
                    <LineaMacros m={total} />
                </p>
            )}
        </div>
    );
}
