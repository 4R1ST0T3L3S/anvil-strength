import { useCallback, useMemo, useState } from 'react';
import { Apple, FileDown, Lock, Pencil, Plus, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import {
    useAddFoodToMeal,
    useAthleteNutritionPlan,
    useCreateDayType,
    useCreateMeal,
    useCreateNutritionPlan,
    useDeleteDayType,
    useDeleteMeal,
    useDuplicateMeal,
    useGuardarCantidades,
    useRemoveFoodFromMeal,
    useReorderMeals,
    useUpdateDayType,
    useUpdateMeal,
    useUpdateMealFood,
    useUpdateNutritionPlan,
} from '../../../hooks/useNutrition';
import { useUser } from '../../../hooks/useUser';
import { puede } from '../../../lib/roles';
import { tieneTiposDeDia } from '../../../services/nutritionService';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { SegmentedControl } from '../../../components/ui/SegmentedControl';
import { ConfirmationModal } from '../../../components/modals/ConfirmationModal';
import type { FoodItem, Meal, MealFood, NutritionPlan } from '../../../types/nutrition';
import type { ObjetivoAjuste } from '../../../lib/nutricion/ajuste';
import { ajustarComida, ajustarDia, diasDelPlan, gramosEnDia, objetivoDeComida, totalesDelDia, type PropuestaDeAjuste } from '../../../lib/nutricion/dias';
import { agruparAlimentos, gramosEquivalentes, kcalDeMacros } from '../../../lib/nutricion/macros';
import { AjusteModal } from './editor/AjusteModal';
import { ComidaCard } from './editor/ComidaCard';
import { ObjetivosDia } from './editor/ObjetivosDia';
import { PortadaPlan } from './editor/PortadaPlan';
import { TipoDeDiaModal } from './editor/TipoDeDiaModal';
import { COLOR_MACRO, ETIQUETA_MACRO, formatear } from './editor/comun';

/**
 * EL EDITOR DEL PLAN NUTRICIONAL
 * =====================================================================
 *
 * De arriba abajo:
 *
 *   1. LOS DÍAS. Día base (entreno) y, si se quieren, más tipos de día
 *      (descanso, recarga…) con sus objetivos. Todo lo de debajo se ve y
 *      se edita en el día elegido.
 *   2. PLANIFICADO FRENTE A OBJETIVO, pegado arriba al bajar.
 *   3. AJUSTAR EL DÍA: el ajuste automático de cantidades con vista previa.
 *   4. LA PORTADA (pautas, suplementación, etiquetas).
 *   5. LAS COMIDAS, con gramos editables en el sitio.
 *
 * QUIÉN EDITA. La base de datos solo deja tocar un plan a quien lo creó
 * (`nutritionist_id`). Antes, cualquiera con permiso de pautar veía el
 * editor de un plan ajeno, editaba y nada se guardaba, sin un error a la
 * vista. Ahora un plan de otra persona se abre en solo lectura y se dice
 * por qué.
 */

interface NutritionPlanEditorProps {
    athleteId: string;
    /** Para el PDF y los textos. */
    athleteName?: string | null;
}

type ModalAjuste =
    | { tipo: 'dia' }
    | { tipo: 'comida'; meal: Meal };

type ModalDia = { tipo: 'nuevo' } | { tipo: 'editar' };

const BASE = '__base__';

export function NutritionPlanEditor({ athleteId, athleteName }: NutritionPlanEditorProps) {
    const { data: plan, isLoading } = useAthleteNutritionPlan(athleteId);
    const { data: user } = useUser();

    if (isLoading) {
        return (
            <div className="space-y-3" aria-busy="true" aria-live="polite">
                <div className="h-20 animate-pulse rounded-card bg-surface-raised" />
                <div className="h-40 animate-pulse rounded-card bg-surface-raised" />
                <span className="sr-only">Cargando el plan…</span>
            </div>
        );
    }

    if (!plan) return <CrearPlan athleteId={athleteId} userId={user?.id} puedePautar={puede(user, 'pautar_nutricion')} />;

    return <EditorDelPlan plan={plan} athleteId={athleteId} athleteName={athleteName} />;
}

// =====================================================================
// SIN PLAN TODAVÍA
// =====================================================================

function CrearPlan({ athleteId, userId, puedePautar }: { athleteId: string; userId?: string; puedePautar: boolean }) {
    const crear = useCreateNutritionPlan();
    const [o, setO] = useState<ObjetivoAjuste>({ kcal: 2400, proteina: 160, carbos: 280, grasas: 70 });
    const kcal = Math.round(kcalDeMacros(o));

    if (!puedePautar) {
        return (
            <div className="rounded-card border border-[var(--border-default)] bg-surface-raised p-8 text-center">
                <Apple className="mx-auto text-ink-faint" size={28} aria-hidden="true" />
                <p className="mt-3 text-t-base font-semibold text-ink">Este atleta aún no tiene plan nutricional</p>
                <p className="mt-1 text-t-sm text-ink-subtle">Para crear planes hace falta el rol de Nutricionista.</p>
            </div>
        );
    }

    return (
        <div className="rounded-card border border-[var(--border-default)] bg-surface-raised p-5 md:p-6">
            <h2 className="text-t-lg font-semibold text-ink">Crear el plan</h2>
            <p className="mt-1 max-w-prose text-t-sm text-ink-muted">
                Empieza por el objetivo del día de entreno. Después podrás añadir comidas, otros tipos de día (descanso, recarga) y dejar que el ajuste automático calcule las cantidades.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(['kcal', 'proteina', 'carbos', 'grasas'] as const).map((k) => (
                    <label key={k} className="block rounded-card bg-[var(--fill-input)] px-3 py-2 focus-within:ring-2 focus-within:ring-brand">
                        <span className={`block text-t-xs font-semibold ${COLOR_MACRO[k]}`}>{ETIQUETA_MACRO[k].larga}</span>
                        <span className="flex items-baseline gap-1">
                            <input
                                type="number"
                                inputMode="decimal"
                                min={0}
                                value={o[k] || ''}
                                onChange={(e) => setO((x) => ({ ...x, [k]: Math.max(0, Number(e.target.value) || 0) }))}
                                className="w-full bg-transparent text-t-lg font-semibold tabular-nums text-ink focus-visible:outline-none"
                            />
                            <span className="text-t-xs text-ink-subtle">{ETIQUETA_MACRO[k].unidad}</span>
                        </span>
                    </label>
                ))}
            </div>
            {Math.abs(kcal - o.kcal) > 10 && (
                <p className="mt-2 text-t-xs text-ink-muted">
                    Los macros suman <strong className="text-ink">{formatear(kcal)} kcal</strong>.{' '}
                    <button type="button" className="font-semibold text-brand-text underline underline-offset-2" onClick={() => setO((x) => ({ ...x, kcal }))}>Usar ese valor</button>
                </p>
            )}
            <div className="mt-5">
                <Button
                    variant="primary"
                    loading={crear.isPending}
                    disabled={!userId}
                    onClick={() =>
                        userId &&
                        crear.mutate({
                            athlete_id: athleteId,
                            nutritionist_id: userId,
                            calories_target: o.kcal,
                            protein_target: o.proteina,
                            carbs_target: o.carbos,
                            fats_target: o.grasas,
                            status: 'active',
                        })
                    }
                >
                    Crear plan nutricional
                </Button>
            </div>
        </div>
    );
}

// =====================================================================
// CON PLAN
// =====================================================================

function EditorDelPlan({ plan, athleteId, athleteName }: { plan: NutritionPlan; athleteId: string; athleteName?: string | null }) {
    const { data: user } = useUser();
    const conDias = tieneTiposDeDia();
    const esAutor = !!user && plan.nutritionist_id === user.id;
    const soloLectura = !esAutor || !puede(user, 'pautar_nutricion');

    const dias = useMemo(() => diasDelPlan(plan), [plan]);
    const [diaElegido, setDiaElegido] = useState<string>(BASE);
    // Si el día elegido se borra, se vuelve al base sin un render en vacío.
    const dia: string | null = diaElegido !== BASE && dias.some((d) => d.id === diaElegido) ? diaElegido : null;
    const diaActual = dias.find((d) => d.id === dia) ?? dias[0];
    const planificado = useMemo(() => totalesDelDia(plan, dia), [plan, dia]);
    const comidas = useMemo(() => plan.meals ?? [], [plan.meals]);

    // Mutaciones
    const actualizarPlan = useUpdateNutritionPlan();
    const crearDia = useCreateDayType();
    const actualizarDia = useUpdateDayType();
    const borrarDia = useDeleteDayType();
    const guardarCantidades = useGuardarCantidades();
    const crearComida = useCreateMeal();
    const actualizarComida = useUpdateMeal();
    const reordenar = useReorderMeals();
    const duplicar = useDuplicateMeal();
    const borrarComida = useDeleteMeal();
    const anadirAlimento = useAddFoodToMeal();
    const actualizarAlimento = useUpdateMealFood();
    const quitarAlimento = useRemoveFoodFromMeal();

    const [ajuste, setAjuste] = useState<ModalAjuste | null>(null);
    const [modalDia, setModalDia] = useState<ModalDia | null>(null);
    const [borrandoComida, setBorrandoComida] = useState<Meal | null>(null);
    const [borrandoDia, setBorrandoDia] = useState(false);
    const [exportando, setExportando] = useState(false);
    const [pdfAbierto, setPdfAbierto] = useState(false);
    const [nuevaComida, setNuevaComida] = useState<string | null>(null);

    // -----------------------------------------------------------------
    // OBJETIVOS
    // -----------------------------------------------------------------
    const guardarObjetivo = (o: ObjetivoAjuste, diaId: string | null = dia, nombre?: string) => {
        if (diaId) {
            actualizarDia.mutate({
                athleteId,
                id: diaId,
                updates: { calories_target: o.kcal, protein_target: o.proteina, carbs_target: o.carbos, fats_target: o.grasas, ...(nombre ? { name: nombre } : {}) },
            });
        } else {
            actualizarPlan.mutate({
                athleteId,
                planId: plan.id,
                updates: {
                    calories_target: o.kcal, protein_target: o.proteina, carbs_target: o.carbos, fats_target: o.grasas,
                    ...(nombre && conDias ? { base_day_name: nombre } : {}),
                },
            });
        }
    };

    // -----------------------------------------------------------------
    // CANTIDADES
    // -----------------------------------------------------------------

    /**
     * Guardar gramos a mano. Si lo que cambia es un PRINCIPAL, sus
     * alternativas le siguen a su cantidad equivalente: "100 g de arroz ó
     * 130 g de avena" no puede quedarse en 130 cuando el arroz pasa a 150.
     */
    const alGuardarGramos = useCallback((cambios: { id: string; amount_g: number }[]) => {
        const todos = [...cambios];
        for (const c of cambios) {
            for (const meal of comidas) {
                const g = agruparAlimentos(meal.foods ?? []).find((x) => x.principal.id === c.id);
                if (!g || !g.principal.food) continue;
                for (const alt of g.alternativas) {
                    if (!alt.food) continue;
                    todos.push({ id: alt.id, amount_g: gramosEquivalentes(g.principal.food, c.amount_g, alt.food, g.categoria) });
                }
            }
        }
        guardarCantidades.mutate({ athleteId, dia, cambios: todos });
    }, [comidas, guardarCantidades, athleteId, dia]);

    const aplicarPropuesta = (p: PropuestaDeAjuste, diaId: string | null) =>
        guardarCantidades.mutateAsync({ athleteId, dia: diaId, cambios: p.cambios });

    // -----------------------------------------------------------------
    // ALIMENTOS
    // -----------------------------------------------------------------
    const alAnadir = (meal: Meal, food: FoodItem, gramos: number, categoria: string, grupo?: string) => {
        const grupoId = grupo ?? crypto.randomUUID();
        anadirAlimento.mutate(
            {
                athleteId,
                tempFood: food,
                foodData: { meal_id: meal.id, food_id: food.code, amount_g: gramos, category: categoria, alternative_group_id: grupoId },
            },
            {
                onSuccess: (creado) => {
                    // En los tipos de día: un alimento nuevo entra con los mismos
                    // gramos; una alternativa, con su equivalente del principal
                    // de ESE día.
                    const tipos = plan.day_types ?? [];
                    if (!conDias || tipos.length === 0 || !creado) return;
                    const principal = grupo ? agruparAlimentos(meal.foods ?? []).find((g) => g.id === grupo)?.principal : undefined;
                    for (const d of tipos) {
                        const g = principal?.food ? gramosEquivalentes(principal.food, gramosEnDia(principal, d.id), food, categoria) : gramos;
                        guardarCantidades.mutate({ athleteId, dia: d.id, cambios: [{ id: (creado as MealFood).id, amount_g: g }] });
                    }
                },
            }
        );
    };

    // -----------------------------------------------------------------
    // COMIDAS
    // -----------------------------------------------------------------
    const mover = (meal: Meal, dir: -1 | 1) => {
        const i = comidas.findIndex((m) => m.id === meal.id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= comidas.length) return;
        const orden = comidas.map((m, k) => ({ id: m.id, order_index: k }));
        [orden[i].order_index, orden[j].order_index] = [orden[j].order_index, orden[i].order_index];
        reordenar.mutate({ athleteId, orden });
    };

    const crearNuevaComida = (nombre: string) => {
        const n = nombre.trim();
        if (!n) return;
        crearComida.mutate({ athleteId, mealData: { plan_id: plan.id, name: n, order_index: comidas.length } }, { onSuccess: () => setNuevaComida(null) });
    };

    // -----------------------------------------------------------------
    // PDF — jsPDF solo se descarga al exportar, no con el editor.
    // -----------------------------------------------------------------
    const exportarPdf = async (opciones: { dias: (string | null)[]; alternativas: boolean }) => {
        setExportando(true);
        try {
            const { descargarPdfPlan } = await import('../../../lib/nutricion/pdf');
            await descargarPdfPlan(plan, { ...opciones, atleta: athleteName ?? null, nutricionista: user?.full_name ?? null });
        } catch (e) {
            console.error(e);
            toast.error('No se pudo generar el PDF');
        } finally {
            setExportando(false);
        }
    };

    const segmentos = dias.map((d) => ({ id: d.id ?? BASE, label: d.nombre }));

    return (
        <div className="space-y-4">
            {/* 1. LOS DÍAS + ACCIONES */}
            <div className="flex flex-wrap items-center gap-2">
                {conDias && (dias.length > 1 || !soloLectura) && (
                    <div className="flex w-full min-w-0 flex-wrap items-center gap-2 md:w-auto md:flex-1">
                        {dias.length > 1 && (
                            <div className="w-full md:w-auto">
                                <SegmentedControl
                                    segmentos={segmentos}
                                    activo={dia ?? BASE}
                                    onChange={(id) => setDiaElegido(id)}
                                    aria-label="Tipo de día"
                                    size="sm"
                                    block
                                />
                            </div>
                        )}
                        {!soloLectura && (
                            <>
                                <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => setModalDia({ tipo: 'editar' })}>
                                    {dias.length > 1 ? 'Editar día' : diaActual.nombre}
                                </Button>
                                <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => setModalDia({ tipo: 'nuevo' })}>
                                    Tipo de día
                                </Button>
                            </>
                        )}
                    </div>
                )}
                <div className="ml-auto flex items-center gap-2">
                    <Button size="sm" variant="secondary" icon={<FileDown size={14} />} onClick={() => setPdfAbierto(true)} loading={exportando}>
                        PDF
                    </Button>
                    {!soloLectura && (
                        <Button size="sm" variant="primary" icon={<Wand2 size={14} />} onClick={() => setAjuste({ tipo: 'dia' })} disabled={comidas.length === 0}>
                            Ajustar el día
                        </Button>
                    )}
                </div>
            </div>

            {soloLectura && (
                <p className="flex items-start gap-2 rounded-card bg-[var(--fill-muted)] px-4 py-3 text-t-sm text-ink-muted">
                    <Lock size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                    {esAutor
                        ? 'Para editar planes hace falta el rol de Nutricionista.'
                        : 'Este plan lo creó otra persona: solo su autor puede editarlo. Lo ves en modo lectura.'}
                </p>
            )}

            {/* 2. PLANIFICADO FRENTE A OBJETIVO */}
            <ObjetivosDia
                key={dia ?? BASE}
                nombreDia={diaActual.nombre}
                objetivo={diaActual.objetivo}
                planificado={planificado}
                editable={!soloLectura}
                guardando={actualizarPlan.isPending || actualizarDia.isPending}
                onGuardar={(o) => guardarObjetivo(o)}
            />

            {/* 4. PORTADA */}
            <PortadaPlan
                plan={plan}
                editable={!soloLectura}
                guardando={actualizarPlan.isPending}
                onGuardar={(c) => actualizarPlan.mutate({ athleteId, planId: plan.id, updates: c })}
            />

            {/* 5. COMIDAS */}
            <div className="space-y-3">
                {comidas.map((meal, i) => (
                    <ComidaCard
                        key={meal.id}
                        meal={meal}
                        dia={dia}
                        indice={i}
                        total={comidas.length}
                        kcalDelDia={planificado.kcal}
                        soloLectura={soloLectura}
                        puedeBloquear={conDias}
                        onGuardarGramos={alGuardarGramos}
                        onAnadir={alAnadir}
                        onQuitar={(id) => quitarAlimento.mutate({ athleteId, mealFoodId: id })}
                        onBloquear={(f, b) => actualizarAlimento.mutate({ athleteId, mealFoodId: f.id, updates: { is_locked: b } })}
                        onRenombrar={(m, nombre) => actualizarComida.mutate({ athleteId, mealId: m.id, updates: { name: nombre } })}
                        onHora={(m, hora) => actualizarComida.mutate({ athleteId, mealId: m.id, updates: { time: hora || null } })}
                        onSuplementos={(m, s) => actualizarComida.mutate({ athleteId, mealId: m.id, updates: { meal_supplements: s } })}
                        onMover={mover}
                        onDuplicar={(m) => duplicar.mutate({ athleteId, meal: m, orderIndex: comidas.length })}
                        onEliminar={(m) => setBorrandoComida(m)}
                        onAjustar={(m) => setAjuste({ tipo: 'comida', meal: m })}
                    />
                ))}

                {comidas.length === 0 && (
                    <p className="rounded-card border border-dashed border-[var(--border-default)] px-4 py-8 text-center text-t-sm text-ink-subtle">
                        Aún no hay comidas. Empieza por las del día: desayuno, comida, merienda, cena…
                    </p>
                )}

                {!soloLectura && (
                    nuevaComida === null ? (
                        <div className="flex flex-wrap gap-1.5">
                            {['Desayuno', 'Almuerzo', 'Comida', 'Merienda', 'Pre-entreno', 'Post-entreno', 'Cena', 'Pre-cama'].map((n) => (
                                <Button key={n} size="sm" variant="secondary" icon={<Plus size={13} />} onClick={() => crearNuevaComida(n)} disabled={crearComida.isPending}>
                                    {n}
                                </Button>
                            ))}
                            <Button size="sm" variant="ghost" onClick={() => setNuevaComida('')}>Otra…</Button>
                        </div>
                    ) : (
                        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); crearNuevaComida(nuevaComida); }}>
                            <input
                                autoFocus
                                value={nuevaComida}
                                onChange={(e) => setNuevaComida(e.target.value)}
                                placeholder="Nombre de la comida"
                                aria-label="Nombre de la comida"
                                className="h-10 flex-1 rounded-field bg-[var(--fill-input)] px-3 text-t-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                            />
                            <Button variant="primary" type="submit" loading={crearComida.isPending}>Crear</Button>
                            <Button variant="ghost" type="button" onClick={() => setNuevaComida(null)}>Cancelar</Button>
                        </form>
                    )
                )}
            </div>

            {/* MODALES */}
            {ajuste && (
                <AjusteModal
                    key={ajuste.tipo === 'dia' ? `dia-${dia}` : `comida-${ajuste.meal.id}-${dia}`}
                    abierto
                    titulo={ajuste.tipo === 'dia' ? `Ajustar: ${diaActual.nombre}` : `Ajustar: ${ajuste.meal.name}`}
                    descripcion={
                        ajuste.tipo === 'dia'
                            ? 'Calcula los gramos de todas las comidas para llegar al objetivo, respetando tus proporciones y lo que esté bloqueado.'
                            : 'El objetivo de la comida es su parte del día. Cámbialo si quieres otro reparto.'
                    }
                    objetivoInicial={ajuste.tipo === 'dia' ? diaActual.objetivo : objetivoDeComida(plan, ajuste.meal.id, dia, diaActual.objetivo)}
                    calcular={ajuste.tipo === 'dia' ? (o) => ajustarDia(plan, dia, o) : (o) => ajustarComida(ajuste.meal, dia, o)}
                    aplicando={guardarCantidades.isPending}
                    onCerrar={() => setAjuste(null)}
                    onAplicar={async (propuesta, objetivo) => {
                        try {
                            await aplicarPropuesta(propuesta, dia);
                            // En el ajuste del día, un objetivo retocado en la vista
                            // previa pasa a ser el objetivo del día.
                            if (ajuste.tipo === 'dia' && JSON.stringify(objetivo) !== JSON.stringify(diaActual.objetivo)) guardarObjetivo(objetivo);
                            toast.success('Cantidades ajustadas');
                            setAjuste(null);
                        } catch { /* el aviso de error lo da la mutación */ }
                    }}
                />
            )}

            {modalDia && (
                <TipoDeDiaModal
                    key={`${modalDia.tipo}-${dia}`}
                    abierto
                    base={dias[0].objetivo}
                    inicial={modalDia.tipo === 'editar' ? { nombre: diaActual.nombre, objetivo: diaActual.objetivo } : undefined}
                    guardando={crearDia.isPending || actualizarDia.isPending || actualizarPlan.isPending || guardarCantidades.isPending}
                    onCerrar={() => setModalDia(null)}
                    onEliminar={modalDia.tipo === 'editar' && dia ? () => setBorrandoDia(true) : undefined}
                    onGuardar={async (nombre, objetivo, recalcular) => {
                        try {
                            if (modalDia.tipo === 'nuevo') {
                                // Los gramos del día nuevo salen de ajustar el día base a
                                // sus objetivos: nace cuadrado.
                                const propuesta = recalcular ? ajustarDia(plan, null, objetivo) : null;
                                const creado = await crearDia.mutateAsync({
                                    athleteId,
                                    dayType: {
                                        plan_id: plan.id,
                                        name: nombre,
                                        calories_target: objetivo.kcal,
                                        protein_target: objetivo.proteina,
                                        carbs_target: objetivo.carbos,
                                        fats_target: objetivo.grasas,
                                        order_index: (plan.day_types?.length ?? 0) + 1,
                                    },
                                    cantidades: propuesta ? (id) => propuesta.cambios.map((c) => ({ meal_food_id: c.id, day_type_id: id, amount_g: c.amount_g })) : undefined,
                                });
                                setDiaElegido(creado.id);
                            } else {
                                guardarObjetivo(objetivo, dia, nombre);
                                if (recalcular) await aplicarPropuesta(ajustarDia(plan, dia, objetivo), dia);
                            }
                            setModalDia(null);
                        } catch { /* aviso en la mutación */ }
                    }}
                />
            )}

            <ConfirmationModal
                isOpen={!!borrandoComida}
                onClose={() => setBorrandoComida(null)}
                onConfirm={() => { if (borrandoComida) borrarComida.mutate({ athleteId, mealId: borrandoComida.id }); setBorrandoComida(null); }}
                title={`¿Eliminar ${borrandoComida?.name ?? 'la comida'}?`}
                description="Se borran también sus alimentos y alternativas, en todos los tipos de día."
                confirmText="Eliminar"
                variant="danger"
            />

            <ConfirmationModal
                isOpen={borrandoDia}
                onClose={() => setBorrandoDia(false)}
                onConfirm={() => {
                    if (dia) borrarDia.mutate({ athleteId, id: dia });
                    setBorrandoDia(false);
                    setModalDia(null);
                    setDiaElegido(BASE);
                }}
                title={`¿Eliminar ${diaActual.nombre}?`}
                description="Se pierden sus objetivos y sus gramos. Las comidas y los alimentos del plan no se tocan."
                confirmText="Eliminar"
                variant="danger"
            />

            {pdfAbierto && (
                <ExportarPdfModal
                    dias={dias.map((d) => ({ id: d.id, nombre: d.nombre }))}
                    exportando={exportando}
                    onCerrar={() => setPdfAbierto(false)}
                    onExportar={async (o) => { await exportarPdf(o); setPdfAbierto(false); }}
                />
            )}
        </div>
    );
}

function ExportarPdfModal({
    dias,
    exportando,
    onCerrar,
    onExportar,
}: {
    dias: { id: string | null; nombre: string }[];
    exportando: boolean;
    onCerrar: () => void;
    onExportar: (o: { dias: (string | null)[]; alternativas: boolean }) => void;
}) {
    const [elegidos, setElegidos] = useState<(string | null)[]>(dias.map((d) => d.id));
    const [alternativas, setAlternativas] = useState(true);
    return (
        <Modal
            open
            onClose={onCerrar}
            title="Exportar a PDF"
            description="Texto real que se puede buscar y copiar, y un bloque por cada tipo de día."
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onCerrar}>Cancelar</Button>
                    <Button variant="primary" loading={exportando} disabled={elegidos.length === 0} onClick={() => onExportar({ dias: elegidos, alternativas })}>
                        Descargar PDF
                    </Button>
                </>
            }
        >
            {dias.length > 1 && (
                <fieldset>
                    <legend className="text-t-xs font-semibold uppercase tracking-wide text-ink-subtle">Días</legend>
                    <div className="mt-2 space-y-1">
                        {dias.map((d) => (
                            <label key={d.id ?? 'base'} className="flex cursor-pointer items-center gap-3 rounded-field px-2 py-2 hover:bg-[var(--fill-hover)]">
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 accent-[var(--brand)]"
                                    checked={elegidos.includes(d.id)}
                                    onChange={(e) => setElegidos((l) => (e.target.checked ? [...l, d.id] : l.filter((x) => x !== d.id)))}
                                />
                                <span className="text-t-sm text-ink">{d.nombre}</span>
                            </label>
                        ))}
                    </div>
                </fieldset>
            )}
            <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-field px-2 py-2 hover:bg-[var(--fill-hover)]">
                <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={alternativas} onChange={(e) => setAlternativas(e.target.checked)} />
                <span className="text-t-sm text-ink">Incluir las alternativas («ó»)</span>
            </label>
        </Modal>
    );
}
