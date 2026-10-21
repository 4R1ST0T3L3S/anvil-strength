import { useRef, useState } from 'react';
import {
    AlertTriangle, ArrowDown, ArrowUp, BadgeCheck, ChevronDown, Copy, Lock, MoreHorizontal, Pill, Plus, Trash2, Unlock, Wand2, X,
} from 'lucide-react';
import { AnchoredMenu } from '../../../../components/ui/AnchoredMenu';
import { Button } from '../../../../components/ui/Button';
import type { FoodCategory, FoodItem, Meal, MealFood } from '../../../../types/nutrition';
import { agruparAlimentos, etiquetaDudosa, macrosDe, type Grupo } from '../../../../lib/nutricion/macros';
import { gramosEnDia, totalesDeComida } from '../../../../lib/nutricion/dias';
import { FoodSearch } from '../FoodSearch';
import { CampoGramos, COLOR_MACRO, formatear, LineaMacros } from './comun';

/**
 * UNA COMIDA DEL PLAN, EN EL DÍA QUE SE ESTÁ VIENDO
 * =====================================================================
 *
 * Cada hueco de la comida es un alimento PRINCIPAL y sus ALTERNATIVAS
 * ("ó"). Solo el principal cuenta en los totales. Los gramos se escriben en
 * el sitio y se guardan al salir del campo: en el día base van al alimento,
 * en un tipo de día a sus gramos de ese día.
 *
 * Lo que había y faltaba: no se podían cambiar los gramos de un alimento
 * sin borrarlo y volver a añadirlo, ni renombrar, mover o duplicar una
 * comida. Y las alternativas se guardaban con la categoría "Otros" en vez
 * de la de su hueco.
 */

export const CATEGORIAS: FoodCategory[] = ['Carbohidratos', 'Proteínas', 'Grasas', 'Verduras', 'Frutas', 'Otros'];

const TONO_CATEGORIA: Record<string, string> = {
    Carbohidratos: 'text-warning',
    Proteínas: 'text-info',
    Grasas: 'text-[var(--tint-orange-ink)]',
    Verduras: 'text-success',
    Frutas: 'text-[var(--tint-red-ink)]',
    Otros: 'text-ink-subtle',
};

export interface AccionesComida {
    onGuardarGramos: (cambios: { id: string; amount_g: number }[]) => void;
    onAnadir: (meal: Meal, food: FoodItem, gramos: number, categoria: string, grupo?: string) => void;
    onQuitar: (mealFoodId: string) => void;
    onBloquear: (mealFood: MealFood, bloqueado: boolean) => void;
    onRenombrar: (meal: Meal, nombre: string) => void;
    onHora: (meal: Meal, hora: string) => void;
    onSuplementos: (meal: Meal, suplementos: string[]) => void;
    onMover: (meal: Meal, direccion: -1 | 1) => void;
    onDuplicar: (meal: Meal) => void;
    onEliminar: (meal: Meal) => void;
    onAjustar: (meal: Meal) => void;
}

interface ComidaCardProps extends AccionesComida {
    meal: Meal;
    dia: string | null;
    indice: number;
    total: number;
    kcalDelDia: number;
    soloLectura: boolean;
    puedeBloquear: boolean;
}

type Busqueda = { tipo: 'nuevo'; categoria: string } | { tipo: 'alternativa'; grupo: Grupo };

export function ComidaCard(props: ComidaCardProps) {
    const { meal, dia, indice, total, kcalDelDia, soloLectura } = props;
    const [abierta, setAbierta] = useState(true);
    const [busqueda, setBusqueda] = useState<Busqueda | null>(null);
    const [menu, setMenu] = useState(false);
    const [renombrando, setRenombrando] = useState(false);
    const [suplementando, setSuplementando] = useState(false);
    const anclaMenu = useRef<HTMLButtonElement>(null);

    const grupos = agruparAlimentos(meal.foods ?? []);
    const totales = totalesDeComida(meal, dia);
    const parte = kcalDelDia > 0 ? Math.round((totales.kcal / kcalDelDia) * 100) : 0;

    return (
        <section className="overflow-hidden rounded-card border border-[var(--border-default)] bg-surface-raised" aria-labelledby={`comida-${meal.id}`}>
            {/* CABECERA */}
            <header className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 md:px-5">
                <button
                    type="button"
                    onClick={() => setAbierta((v) => !v)}
                    aria-expanded={abierta}
                    aria-controls={`cuerpo-${meal.id}`}
                    className="-ml-1 flex h-11 w-11 md:h-9 md:w-9 shrink-0 items-center justify-center rounded-field text-ink-subtle hover:bg-[var(--fill-hover)] hover:text-ink"
                >
                    <ChevronDown size={18} className={`transition-transform duration-fast ease-snap ${abierta ? '' : '-rotate-90'}`} aria-hidden="true" />
                    <span className="sr-only">{abierta ? 'Plegar' : 'Desplegar'} {meal.name}</span>
                </button>

                <div className="min-w-[11rem] flex-1">
                    {renombrando && !soloLectura ? (
                        <input
                            autoFocus
                            defaultValue={meal.name}
                            aria-label="Nombre de la comida"
                            onBlur={(e) => { setRenombrando(false); const v = e.target.value.trim(); if (v && v !== meal.name) props.onRenombrar(meal, v); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenombrando(false); }}
                            className="h-9 w-full max-w-xs rounded-field bg-[var(--fill-input)] px-2 text-t-base font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        />
                    ) : (
                        <h3 id={`comida-${meal.id}`} className="flex items-baseline gap-2">
                            <button
                                type="button"
                                disabled={soloLectura}
                                onClick={() => setRenombrando(true)}
                                className="truncate text-left text-t-base font-semibold text-ink enabled:hover:underline enabled:hover:decoration-dotted enabled:hover:underline-offset-4"
                                title={soloLectura ? undefined : 'Cambiar el nombre'}
                            >
                                {meal.name}
                            </button>
                            {parte > 0 && <span className="shrink-0 text-t-xs text-ink-subtle">{parte} % del día</span>}
                        </h3>
                    )}
                    <LineaMacros m={totales} className="mt-0.5 text-t-xs" />
                </div>

                <label className="flex h-9 items-center gap-1 rounded-field bg-[var(--fill-input)] px-2 text-t-xs text-ink-subtle focus-within:ring-2 focus-within:ring-brand">
                    <span className="sr-only">Hora</span>
                    <input
                        type="time"
                        disabled={soloLectura}
                        defaultValue={meal.time ?? ''}
                        onBlur={(e) => { if ((e.target.value || '') !== (meal.time ?? '')) props.onHora(meal, e.target.value); }}
                        className="w-[5.5rem] bg-transparent tabular-nums text-ink focus-visible:outline-none disabled:opacity-70"
                    />
                </label>

                {!soloLectura && (
                    <>
                        <Button size="sm" variant="tinted" icon={<Wand2 size={14} />} onClick={() => props.onAjustar(meal)} disabled={grupos.length === 0}>
                            Ajustar
                        </Button>
                        <button
                            ref={anclaMenu}
                            type="button"
                            onClick={() => setMenu((v) => !v)}
                            aria-label={`Más acciones de ${meal.name}`}
                            aria-haspopup="menu"
                            aria-expanded={menu}
                            className="flex h-11 w-11 md:h-9 md:w-9 items-center justify-center rounded-field text-ink-subtle hover:bg-[var(--fill-hover)] hover:text-ink"
                        >
                            <MoreHorizontal size={18} />
                        </button>
                        <AnchoredMenu
                            open={menu}
                            onClose={() => setMenu(false)}
                            anchorRef={anclaMenu}
                            align="end"
                            width={220}
                            className="z-dropdown rounded-card border border-[var(--border-default)] bg-surface-overlay p-1.5 shadow-lg"
                        >
                            {[
                                { icono: <Pill size={15} />, texto: 'Suplementación de esta comida', accion: () => setSuplementando(true) },
                                { icono: <Copy size={15} />, texto: 'Duplicar comida', accion: () => props.onDuplicar(meal) },
                                { icono: <ArrowUp size={15} />, texto: 'Subir', accion: () => props.onMover(meal, -1), off: indice === 0 },
                                { icono: <ArrowDown size={15} />, texto: 'Bajar', accion: () => props.onMover(meal, 1), off: indice === total - 1 },
                                { icono: <Trash2 size={15} />, texto: 'Eliminar comida', accion: () => props.onEliminar(meal), peligro: true },
                            ].map((o) => (
                                <button
                                    key={o.texto}
                                    type="button"
                                    role="menuitem"
                                    disabled={o.off}
                                    onClick={() => { setMenu(false); o.accion(); }}
                                    className={`flex h-10 w-full items-center gap-2.5 rounded-field px-3 text-left text-t-sm transition-colors duration-fast ease-snap hover:bg-[var(--fill-hover)] disabled:opacity-40 ${o.peligro ? 'text-danger-text' : 'text-ink'}`}
                                >
                                    {o.icono}
                                    {o.texto}
                                </button>
                            ))}
                        </AnchoredMenu>
                    </>
                )}
            </header>

            {abierta && (
                <div id={`cuerpo-${meal.id}`} className="border-t border-[var(--separator)] px-4 pb-4 pt-2 md:px-5">
                    {grupos.length === 0 ? (
                        <p className="py-4 text-center text-t-sm text-ink-subtle">Aún no hay alimentos en esta comida.</p>
                    ) : (
                        <>
                        {/* Cabecera de columnas: sin ella, cuatro números
                            seguidos no dicen qué es cada uno. */}
                        <div aria-hidden="true" className="hidden items-center justify-end gap-2 pt-1 text-t-2xs font-semibold uppercase tracking-wide text-ink-subtle md:flex">
                            <span className="w-14 text-right">kcal</span>
                            <span className={`w-9 text-right ${COLOR_MACRO.proteina}`}>P</span>
                            <span className={`w-9 text-right ${COLOR_MACRO.carbos}`}>HC</span>
                            <span className={`w-9 text-right ${COLOR_MACRO.grasas}`}>G</span>
                            <span className="w-[4.75rem] text-right">gramos</span>
                            <span className={soloLectura ? 'w-0' : props.puedeBloquear ? 'w-[7.25rem]' : 'w-[4.75rem]'} />
                        </div>
                        <ul className="divide-y divide-[var(--separator)]">
                            {grupos.map((g) => (
                                <FilaGrupo
                                    key={g.id}
                                    grupo={g}
                                    dia={dia}
                                    soloLectura={soloLectura}
                                    puedeBloquear={props.puedeBloquear}
                                    onGuardar={(id, gramos) => props.onGuardarGramos([{ id, amount_g: gramos }])}
                                    onQuitar={props.onQuitar}
                                    onBloquear={props.onBloquear}
                                    onAlternativa={() => setBusqueda({ tipo: 'alternativa', grupo: g })}
                                />
                            ))}
                        </ul>
                        </>
                    )}

                    {(meal.meal_supplements?.length ?? 0) > 0 && !suplementando && (
                        <p className="mt-3 flex flex-wrap items-center gap-1.5 text-t-xs text-ink-muted">
                            <Pill size={13} className="text-info" aria-hidden="true" />
                            {meal.meal_supplements!.join(' · ')}
                        </p>
                    )}
                    {suplementando && (
                        <EditorSuplementos
                            inicial={meal.meal_supplements ?? []}
                            onGuardar={(s) => { props.onSuplementos(meal, s); setSuplementando(false); }}
                            onCancelar={() => setSuplementando(false)}
                        />
                    )}

                    {!soloLectura && (
                        <div className="mt-3">
                            {busqueda ? (
                                <FoodSearch
                                    onClose={() => setBusqueda(null)}
                                    referenceFood={busqueda.tipo === 'alternativa' ? busqueda.grupo.principal.food : undefined}
                                    referenceGrams={busqueda.tipo === 'alternativa' ? gramosEnDia(busqueda.grupo.principal, null) : undefined}
                                    category={busqueda.tipo === 'alternativa' ? busqueda.grupo.categoria : busqueda.categoria}
                                    onAddFood={(food, gramos) => {
                                        if (busqueda.tipo === 'alternativa') {
                                            props.onAnadir(meal, food, gramos, busqueda.grupo.categoria, busqueda.grupo.id);
                                        } else {
                                            props.onAnadir(meal, food, gramos, busqueda.categoria);
                                        }
                                    }}
                                />
                            ) : (
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="mr-1 text-t-xs text-ink-subtle">Añadir:</span>
                                    {CATEGORIAS.map((cat) => (
                                        <button
                                            key={cat}
                                            type="button"
                                            onClick={() => setBusqueda({ tipo: 'nuevo', categoria: cat })}
                                            className={`inline-flex min-h-[44px] md:min-h-0 md:h-8 py-2 md:py-0 items-center gap-1 rounded-pill bg-[var(--fill-muted)] px-3 text-t-xs font-semibold transition-colors duration-fast ease-snap hover:bg-[var(--fill-strong)] ${TONO_CATEGORIA[cat]}`}
                                        >
                                            <Plus size={12} aria-hidden="true" />
                                            {cat}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}

// =====================================================================
// UN HUECO: principal + alternativas
// =====================================================================

function FilaGrupo({
    grupo,
    dia,
    soloLectura,
    puedeBloquear,
    onGuardar,
    onQuitar,
    onBloquear,
    onAlternativa,
}: {
    grupo: Grupo;
    dia: string | null;
    soloLectura: boolean;
    puedeBloquear: boolean;
    onGuardar: (id: string, gramos: number) => void;
    onQuitar: (id: string) => void;
    onBloquear: (f: MealFood, bloqueado: boolean) => void;
    onAlternativa: () => void;
}) {
    const filas = [grupo.principal, ...grupo.alternativas];
    return (
        <li className="py-2.5">
            <p className={`mb-1 text-t-2xs font-bold uppercase tracking-wide ${TONO_CATEGORIA[grupo.categoria] ?? TONO_CATEGORIA.Otros}`}>
                {grupo.categoria}
                {grupo.alternativas.length > 0 && <span className="ml-2 normal-case tracking-normal text-ink-subtle">elige una opción</span>}
            </p>
            <ul className="space-y-1">
                {filas.map((f, i) => {
                    const food = f.food;
                    if (!food) return null;
                    const gramos = gramosEnDia(f, dia);
                    const m = macrosDe(food, gramos);
                    const esAlt = i > 0;
                    const temporal = f.id.startsWith('temp-');
                    return (
                        <li key={f.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${esAlt ? 'pl-4' : ''}`}>
                            <span className="flex w-full min-w-0 items-center gap-1.5 sm:w-auto sm:flex-1">
                                {esAlt && <span className="font-bold text-success" aria-label="o bien">ó</span>}
                                {food.is_generic && <BadgeCheck size={14} className="shrink-0 text-success" aria-label="Genérico verificado" />}
                                <span className={`truncate text-t-sm ${esAlt ? 'text-ink-muted' : 'font-medium text-ink'}`}>{food.product_name}</span>
                                {food.brands && <span className="hidden truncate text-t-xs text-ink-subtle sm:inline">· {food.brands}</span>}
                                {etiquetaDudosa(food) && (
                                    <AlertTriangle size={13} className="shrink-0 text-warning" aria-label="Las calorías de la etiqueta no casan con sus macros" />
                                )}
                            </span>
                            <span className="ml-auto flex items-center gap-2">
                                {/* En el móvil, las kcal de la fila en vez de las
                                    cuatro columnas, que no caben. */}
                                <span className="text-t-xs tabular-nums text-ink-subtle md:hidden">{formatear(m.kcal)} kcal</span>
                                <span className="hidden gap-2 text-t-xs tabular-nums md:flex">
                                    <span className="w-14 text-right text-ink-muted">{formatear(m.kcal)} kcal</span>
                                    <span className={`w-9 text-right ${COLOR_MACRO.proteina}`}>{formatear(m.proteina)}</span>
                                    <span className={`w-9 text-right ${COLOR_MACRO.carbos}`}>{formatear(m.carbos)}</span>
                                    <span className={`w-9 text-right ${COLOR_MACRO.grasas}`}>{formatear(m.grasas)}</span>
                                </span>
                                <CampoGramos
                                    valor={gramos}
                                    etiqueta={`Gramos de ${food.product_name}`}
                                    disabled={soloLectura || temporal}
                                    onGuardar={(g) => onGuardar(f.id, g)}
                                />
                                {/* Las alternativas no tienen candado ni "+":
                                    huecos del mismo ancho para que su columna
                                    de gramos case con la del principal. */}
                                {!soloLectura && esAlt && puedeBloquear && <span className="w-11 md:w-9" aria-hidden="true" />}
                                {!soloLectura && esAlt && <span className="w-11 md:w-9" aria-hidden="true" />}
                                {!soloLectura && !esAlt && puedeBloquear && (
                                    <button
                                        type="button"
                                        onClick={() => onBloquear(f, !f.is_locked)}
                                        aria-pressed={!!f.is_locked}
                                        aria-label={f.is_locked ? 'Desbloquear: el ajuste automático podrá cambiarlo' : 'Bloquear: el ajuste automático no lo tocará'}
                                        title={f.is_locked ? 'Bloqueado para el ajuste' : 'Bloquear para el ajuste'}
                                        className={`flex h-11 w-11 md:h-9 md:w-9 items-center justify-center rounded-field transition-colors duration-fast ease-snap hover:bg-[var(--fill-hover)] ${f.is_locked ? 'text-brand-text' : 'text-ink-faint hover:text-ink'}`}
                                    >
                                        {f.is_locked ? <Lock size={15} /> : <Unlock size={15} />}
                                    </button>
                                )}
                                {!soloLectura && !esAlt && (
                                    <button
                                        type="button"
                                        onClick={onAlternativa}
                                        aria-label={`Añadir alternativa a ${food.product_name}`}
                                        title="Añadir alternativa"
                                        className="flex h-11 w-11 md:h-9 md:w-9 items-center justify-center rounded-field text-ink-subtle transition-colors duration-fast ease-snap hover:bg-[var(--fill-hover)] hover:text-success"
                                    >
                                        <Plus size={15} />
                                    </button>
                                )}
                                {!soloLectura && (
                                    <button
                                        type="button"
                                        onClick={() => onQuitar(f.id)}
                                        disabled={temporal}
                                        aria-label={`Quitar ${food.product_name}`}
                                        className="flex h-11 w-11 md:h-9 md:w-9 items-center justify-center rounded-field text-ink-faint transition-colors duration-fast ease-snap hover:bg-[var(--fill-hover)] hover:text-danger-text"
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                )}
                            </span>
                        </li>
                    );
                })}
            </ul>
        </li>
    );
}

function EditorSuplementos({ inicial, onGuardar, onCancelar }: { inicial: string[]; onGuardar: (s: string[]) => void; onCancelar: () => void }) {
    const [lista, setLista] = useState(inicial);
    const [nuevo, setNuevo] = useState('');
    const anadir = () => { const v = nuevo.trim(); if (v) setLista((l) => [...l, v]); setNuevo(''); };
    return (
        <div className="mt-3 rounded-card bg-[var(--fill-muted)] p-3">
            <p className="mb-2 text-t-xs font-semibold text-ink-muted">Suplementación de esta comida</p>
            <div className="flex gap-2">
                <input
                    autoFocus
                    value={nuevo}
                    onChange={(e) => setNuevo(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && anadir()}
                    placeholder="5 g de creatina"
                    className="h-9 flex-1 rounded-field bg-[var(--fill-input)] px-3 text-t-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                />
                <Button size="sm" variant="secondary" onClick={anadir}>Añadir</Button>
            </div>
            {lista.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                    {lista.map((s, i) => (
                        <span key={`${s}-${i}`} className="flex items-center gap-1 rounded-pill bg-[var(--info-quiet)] px-2.5 py-1 text-t-xs text-info">
                            {s}
                            <button type="button" onClick={() => setLista((l) => l.filter((_, j) => j !== i))} aria-label={`Quitar ${s}`}><X size={12} /></button>
                        </span>
                    ))}
                </div>
            )}
            <div className="mt-3 flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={onCancelar}>Cancelar</Button>
                <Button size="sm" variant="primary" onClick={() => onGuardar(lista)}>Guardar</Button>
            </div>
        </div>
    );
}
