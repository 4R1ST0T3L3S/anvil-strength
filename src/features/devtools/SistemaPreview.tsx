import { useState } from 'react';
import {
    Bell, Check, Dumbbell, Flame, Mail, Pencil, Plus, Search, Trash2, TrendingUp, Users,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { Card } from '../../components/ui/Card';
import { Panel } from '../../components/ui/Panel';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatTile } from '../../components/ui/StatTile';
import { Tabs } from '../../components/ui/Tabs';
import { DataTable } from '../../components/ui/DataTable';
import { Input, NumberField, Select, Textarea, Checkbox } from '../../components/ui/Field';
import {
    Skeleton, SkeletonText, SkeletonList, SkeletonCard, SkeletonStat, SkeletonChart, SkeletonTable,
} from '../../components/ui/Skeleton';
import { Chart } from '../../components/charts/Chart';
import { PeriodSelector } from '../../components/ui/PeriodSelector';
import { WidgetStack } from '../../components/ui/WidgetStack';
import { reglaDe, usePeriodo, type BloqueTemporal } from '../../lib/period';
import { EJE, REJILLA, TOOLTIP, SERIE, ALTO } from '../../components/charts/theme';
import {
    useCampo, combinar, requerido, email, contrasena, aceptado, validarCarga, validarRpe,
} from '../../lib/validation';

/**
 * BANCO DEL SISTEMA DE DISEÑO. SOLO EN DESARROLLO.
 * =====================================================================
 *
 * POR QUÉ EXISTE
 *
 * Una primitiva se juzga por sus ESTADOS, no por su aspecto en reposo. Un
 * botón que se ve bien parado y se rompe al cargar, un campo cuyo error
 * empuja el resto del formulario hacia abajo, una tabla que en móvil hay que
 * arrastrar: nada de eso se ve mirando la pieza feliz.
 *
 * Aquí están todas, en todos sus estados, a la vez, sin base de datos y sin
 * sesión. Es lo que hace que revisar el sistema cueste un minuto en vez de
 * media hora reproduciendo situaciones.
 *
 * Hermano de `/dev/movil` (pantallas enteras a 375px) y `/dev/piezas`
 * (piezas de negocio con datos inventados). Los tres desaparecen del build
 * de producción por el mismo mecanismo — ver la nota de AppRoutes.
 *
 *     npm run dev  →  http://localhost:4321/dev/sistema
 *
 * CÓMO SE REVISA: con el TECLADO. Tabula por la página entera y comprueba
 * que (1) todo control recibe un anillo visible, (2) las pestañas son UNA
 * sola parada y por dentro se navega con las flechas, y (3) al enviar el
 * formulario incompleto el foco salta al primer campo que falla.
 */

const DATOS_GRAFICA = [
    { semana: 'S1', total: 480 }, { semana: 'S2', total: 492 }, { semana: 'S3', total: 488 },
    { semana: 'S4', total: 505 }, { semana: 'S5', total: 512 }, { semana: 'S6', total: 507 },
    { semana: 'S7', total: 525 }, { semana: 'S8', total: 540 },
];

/**
 * Bloques de mentira para el selector de periodo.
 *
 * Los dos ultimos NO tienen fecha de inicio a proposito: es el caso que
 * decide K10 y el que hay que poder mirar sin montar datos reales.
 */
const BLOQUES_DEMO: BloqueTemporal[] = [
    { id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', name: 'Fuerza I', start_week: 30, end_week: 33, start_date: '2026-07-20' },
    { id: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb', name: 'Hipertrofia', start_week: 26, end_week: 29, start_date: '2026-06-22' },
    { id: 'cccccccc-3333-4333-8333-cccccccccccc', name: 'Bloque antiguo (sin fecha)', start_week: 10, end_week: 14, start_date: null },
    { id: 'dddddddd-4444-4444-8444-dddddddddddd', name: 'Otro sin fecha', start_week: 1, end_week: 4, start_date: null },
];

const FILAS = [
    { id: '1', nombre: 'Fulanito de Tal', categoria: '-83', total: 540, sesiones: 12 },
    { id: '2', nombre: 'Menganita Pérez', categoria: '-72', total: 412, sesiones: 9 },
    { id: '3', nombre: 'Zutanito Ruiz', categoria: '-93', total: 605, sesiones: 15 },
];

/**
 * Tarjeta de ejemplo para la pila.
 *
 * Lleva un contador de montajes A PROPÓSITO: es la única forma de VER el
 * presupuesto de K8 —solo se monta la activa ±1— sin abrir el perfilador de
 * React. Al recorrer la pila con las flechas, los números van subiendo solo
 * en las tarjetas que entran en la ventana.
 */
let montajes = 0;

const TONO_DEMO: Record<string, string> = {
    brand: 'text-brand',
    success: 'text-success',
    info: 'text-info',
    warning: 'text-warning',
};

function TarjetaDemo({ n, color }: { n: number; color: string }) {
    const [id] = useState(() => ++montajes);
    return (
        <div className="flex min-h-[140px] flex-col justify-center rounded-card border border-[var(--border-default)] bg-surface-raised p-5">
            <p className={`text-t-2xs font-bold uppercase tracking-widest ${TONO_DEMO[color] ?? 'text-ink-subtle'}`}>
                Tarjeta {n}
            </p>
            <p className="mt-1 text-metric font-black tabular-nums text-ink">{n * 137}</p>
            <p className="mt-1 text-t-xs text-ink-subtle">Montaje n.º {id} desde que cargó la página</p>
        </div>
    );
}

function Bloque({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
    return (
        <section className="space-y-3">
            <div>
                <h2 className="text-t-lg font-black uppercase tracking-display text-ink">{titulo}</h2>
                {nota && <p className="mt-1 max-w-[70ch] text-t-xs text-ink-subtle">{nota}</p>}
            </div>
            <div className="rounded-card border border-dashed border-[var(--border-strong)] p-4">
                {children}
            </div>
        </section>
    );
}

export function SistemaPreview() {
    const [pestana, setPestana] = useState<'programacion' | 'estadisticas' | 'competicion' | 'datos'>('programacion');
    const [cargandoBoton, setCargandoBoton] = useState(false);
    const [enviado, setEnviado] = useState<string | null>(null);

    const {
        periodo,
        resuelto: periodoResuelto,
        cambiar: cambiarPeriodo,
        opciones: opcionesPeriodo,
    } = usePeriodo('volumen', { bloques: BLOQUES_DEMO });

    // Formulario de muestra, con las mismas reglas que usará la aplicación.
    const nombre = useCampo({ inicial: '', validar: requerido<string>('el nombre') });
    const correo = useCampo({ inicial: '', validar: combinar(requerido<string>('el correo'), email()) });
    const clave = useCampo({ inicial: '', validar: combinar(requerido<string>('la contraseña'), contrasena()) });
    const carga = useCampo({ inicial: '', validar: validarCarga });
    const rpe = useCampo({ inicial: '', validar: validarRpe });
    const categoria = useCampo({ inicial: '', validar: requerido<string>('una categoría') });
    const notas = useCampo({ inicial: '' });
    const terminos = useCampo({ inicial: false, validar: aceptado('Hay que aceptar los términos para seguir.') });

    const campos = [nombre, correo, clave, carga, rpe, categoria, terminos];

    const enviar = (e: React.FormEvent) => {
        e.preventDefault();
        let primero: typeof nombre | null = null;
        for (const c of campos) {
            c.revelar();
            if (c.error && !primero) primero = c as typeof nombre;
        }
        if (primero) { primero.enfocar(); setEnviado('Hay campos sin corregir. El foco ha saltado al primero.'); return; }
        setEnviado('Todo correcto. Aquí iría el envío de verdad.');
    };

    const fingirCarga = () => {
        setCargandoBoton(true);
        window.setTimeout(() => setCargandoBoton(false), 1400);
    };

    return (
        <div className="min-h-[100dvh] bg-surface-canvas px-4 py-8 md:px-8">
            <div className="mx-auto w-full max-w-4xl space-y-12">
                <header>
                    <p className="text-t-2xs font-bold uppercase tracking-widest text-brand">Solo desarrollo</p>
                    <h1 className="mt-1 text-t-3xl font-black uppercase tracking-display text-ink">
                        Sistema de diseño
                    </h1>
                    <p className="mt-1.5 max-w-[70ch] text-t-sm text-ink-muted">
                        Todas las primitivas en todos sus estados. Revísalo con el teclado:
                        cada control debe recibir anillo, las pestañas son una sola parada de
                        tabulador, y al enviar el formulario incompleto el foco salta al primer
                        campo con error.
                    </p>
                </header>

                {/* ============================ BOTONES ============================ */}
                <Bloque
                    titulo="Botones"
                    nota="Cuatro variantes y tres tamaños. Al cargar, el contenido se queda en el flujo y solo se hace invisible: el botón no cambia de ancho."
                >
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-center gap-2">
                            <Button variant="primary">Primario</Button>
                            <Button variant="secondary">Secundario</Button>
                            <Button variant="ghost">Fantasma</Button>
                            <Button variant="danger">Destructivo</Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />}>Pequeño</Button>
                            <Button size="md" icon={<Plus className="h-4 w-4" />}>Mediano</Button>
                            <Button size="lg" icon={<Plus className="h-5 w-5" />}>Grande</Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button disabled>Deshabilitado</Button>
                            <Button variant="primary" loading={cargandoBoton} onClick={fingirCarga}>
                                Pulsa para ver la carga
                            </Button>
                            <Button variant="primary" block className="max-w-xs">A todo el ancho</Button>
                        </div>
                    </div>
                </Bloque>

                {/* ========================= BOTONES DE ICONO ======================== */}
                <Bloque
                    titulo="Botones de icono"
                    nota="44px de alto SIEMPRE, aunque el icono sea pequeño. `aria-label` es obligatorio: sin él no compila."
                >
                    <div className="flex flex-wrap items-center gap-2">
                        <IconButton aria-label="Editar" icon={<Pencil />} />
                        <IconButton aria-label="Buscar" icon={<Search />} size="sm" />
                        <IconButton aria-label="Notificaciones" icon={<Bell />} tono="marca" />
                        <IconButton aria-label="Borrar" icon={<Trash2 />} tono="peligro" />
                        <IconButton aria-label="Guardando" icon={<Check />} loading />
                        <IconButton aria-label="No disponible" icon={<Check />} disabled />
                    </div>
                </Bloque>

                {/* ============================ CAMPOS ============================= */}
                <Bloque
                    titulo="Campos y validación"
                    nota="El error aparece al SALIR del campo, no mientras escribes. Una vez visible, desaparece en cuanto está bien. Envía vacío para ver el salto de foco."
                >
                    <form onSubmit={enviar} noValidate className="grid gap-4 sm:grid-cols-2">
                        <Input label="Nombre" campo={nombre} obligatorio placeholder="Fulanito de Tal" />
                        <Input
                            label="Correo"
                            campo={correo}
                            obligatorio
                            type="email"
                            icono={<Mail />}
                            ayuda="Te mandaremos un enlace para entrar."
                            placeholder="tu@correo.es"
                        />
                        <Input label="Contraseña" campo={clave} obligatorio type="password" ayuda="Ocho caracteres o más." />
                        <Select label="Categoría" campo={categoria} obligatorio>
                            <option value="">Elige una…</option>
                            <option value="-66">-66 kg</option>
                            <option value="-74">-74 kg</option>
                            <option value="-83">-83 kg</option>
                            <option value="-93">-93 kg</option>
                        </Select>
                        <NumberField label="Carga" campo={carga} sufijo="kg" ayuda="Prueba 1400 para ver la red antierratas." />
                        <NumberField label="RPE" campo={rpe} modo="decimal" ayuda="Admite medios puntos: 8,5." />
                        <Textarea
                            label="Notas de la serie"
                            campo={notas}
                            maximo={120}
                            contenedorClassName="sm:col-span-2"
                            ayuda="El contador solo aparece cerca del tope."
                            placeholder="La cadera se me va a la derecha…"
                        />
                        <Checkbox
                            label="Acepto los términos y la política de privacidad"
                            campo={terminos}
                            contenedorClassName="sm:col-span-2"
                        />
                        <div className="flex items-center gap-3 sm:col-span-2">
                            <Button type="submit" variant="primary">Enviar</Button>
                            <Button type="button" variant="ghost" onClick={() => { campos.forEach(c => c.reiniciar()); setEnviado(null); }}>
                                Reiniciar
                            </Button>
                            {enviado && <p className="text-t-sm text-ink-muted" role="status">{enviado}</p>}
                        </div>
                    </form>
                </Bloque>

                {/* ============================ TARJETAS ============================ */}
                <Bloque
                    titulo="Tarjetas"
                    nota="Si tiene `onClick` sale un <button> de verdad, no un <div>: se enfoca con el tabulador y se activa con Intro."
                >
                    <div className="grid gap-2 sm:grid-cols-2">
                        <Card tono="contorno">Sin acción: es un div, y no pretende otra cosa.</Card>
                        <Card tono="contorno" onClick={() => { }}>Pulsable: tabula hasta aquí.</Card>
                        <Card tono="contorno" onClick={() => { }} activa>Seleccionada.</Card>
                        <Card tono="elevado" onClick={() => { }}>Elevada.</Card>
                    </div>
                </Bloque>

                {/* ============================= CIFRAS ============================= */}
                <Bloque
                    titulo="Cifras destacadas"
                    nota="La tendencia nunca depende solo del color: lleva flecha y texto oculto para el lector. `bajarEsBueno` invierte el juicio sin invertir la flecha."
                >
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <StatTile label="Total" valor="540" unidad="kg" icono={<Dumbbell />}
                            tendencia={{ direccion: 'sube', texto: '+12,5%' }} nota="vs. bloque anterior" />
                        <StatTile label="Sesiones" valor="12" icono={<Flame />}
                            tendencia={{ direccion: 'baja', texto: '−2' }} nota="esta semana" />
                        <StatTile label="Peso corporal" valor="82,4" unidad="kg" bajarEsBueno
                            tendencia={{ direccion: 'baja', texto: '−0,8 kg' }} nota="bajar es el objetivo" />
                        <StatTile label="Atletas" valor="27" icono={<Users />}
                            tendencia={{ direccion: 'igual', texto: 'sin cambios' }} />
                    </div>
                </Bloque>

                {/* ============================ PESTAÑAS ============================ */}
                <Bloque
                    titulo="Pestañas"
                    nota="UNA sola parada de tabulador para todo el grupo; dentro se navega con ← →, Inicio y Fin. El subrayado se desplaza, no parpadea."
                >
                    <Tabs
                        aria-label="Ficha del atleta"
                        activa={pestana}
                        onChange={setPestana}
                        pestanas={[
                            { id: 'programacion', label: 'Programación', labelCorta: 'Plan' },
                            { id: 'estadisticas', label: 'Estadísticas', labelCorta: 'Datos', insignia: 3 },
                            { id: 'competicion', label: 'Competición', labelCorta: 'Competir' },
                            { id: 'datos', label: 'Datos', deshabilitada: true },
                        ]}
                    />
                    <p className="mt-4 text-t-sm text-ink-muted">Pestaña activa: <strong className="text-ink">{pestana}</strong></p>
                </Bloque>

                {/* ============================= TABLA ============================== */}
                <Bloque
                    titulo="Tabla"
                    nota="Estrecha la ventana por debajo de 640px: deja de ser tabla y pasa a ser una lista de tarjetas. La misma información, no menos."
                >
                    <DataTable
                        titulo="Atletas del equipo"
                        filas={FILAS}
                        claveFila={(f) => f.id}
                        onFilaClick={() => { }}
                        columnas={[
                            { id: 'nombre', cabecera: 'Atleta', celda: (f) => f.nombre, esTitulo: true },
                            { id: 'cat', cabecera: 'Categoría', celda: (f) => f.categoria },
                            { id: 'total', cabecera: 'Total', celda: (f) => `${f.total} kg`, alineacion: 'derecha' },
                            { id: 'ses', cabecera: 'Sesiones', celda: (f) => f.sesiones, alineacion: 'derecha' },
                        ]}
                    />
                </Bloque>

                <Bloque titulo="Tabla — vacía">
                    <DataTable
                        titulo="Atletas del equipo"
                        filas={[]}
                        claveFila={() => ''}
                        columnas={[{ id: 'a', cabecera: 'Atleta', celda: () => null }]}
                        vacioTitulo="Todavía no tienes atletas"
                        vacioCuerpo="Invita al primero y aparecerá aquí con su total y su constancia."
                        vacioAccion={<Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />}>Invitar atleta</Button>}
                    />
                </Bloque>

                {/* ============================ GRÁFICA ============================= */}
                <Bloque
                    titulo="Gráfica"
                    nota="El envoltorio reserva la altura, así que nada salta cuando llegan los datos. Lleva descripción para quien no la ve: un SVG de recharts es invisible para un lector."
                >
                    <Chart
                        alto={ALTO.normal}
                        aria-label="Evolución del total en ocho semanas"
                        resumen="El total sube de 480 kg en la semana 1 a 540 kg en la semana 8, con dos retrocesos puntuales en las semanas 3 y 6."
                    >
                        <LineChart data={DATOS_GRAFICA} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                            <CartesianGrid {...REJILLA} />
                            <XAxis dataKey="semana" {...EJE} />
                            <YAxis {...EJE} domain={['dataMin - 20', 'dataMax + 20']} />
                            <Tooltip {...TOOLTIP} />
                            <Line type="monotone" dataKey="total" {...SERIE} />
                        </LineChart>
                    </Chart>
                </Bloque>

                <Bloque titulo="Gráfica — sin datos y cargando">
                    <div className="grid gap-3 lg:grid-cols-2">
                        <Chart
                            alto={ALTO.mini}
                            aria-label="Sin datos"
                            vacio
                            vacioTitulo="Aún no hay series registradas"
                            vacioCuerpo="En cuanto marques la primera, verás aquí la evolución."
                        >
                            <LineChart data={[]}><Line dataKey="x" /></LineChart>
                        </Chart>
                        <Chart alto={ALTO.mini} aria-label="Cargando" cargando>
                            <LineChart data={[]}><Line dataKey="x" /></LineChart>
                        </Chart>
                    </div>
                </Bloque>

                {/* =========================== ESQUELETOS ========================== */}
                <Bloque
                    titulo="Esqueletos"
                    nota="Cada uno tiene la forma de lo que viene detrás. Un esqueleto que no coincide produce un salto, y un salto es peor que un giro."
                >
                    <div className="space-y-6">
                        <div className="grid gap-3 sm:grid-cols-4">
                            <SkeletonStat /><SkeletonStat /><SkeletonStat /><SkeletonStat />
                        </div>
                        <SkeletonList filas={3} />
                        <div className="grid gap-3 lg:grid-cols-2">
                            <SkeletonCard />
                            <SkeletonChart alto={200} />
                        </div>
                        <SkeletonTable filas={3} columnas={4} />
                        <div className="flex flex-col gap-2">
                            <SkeletonText lineas={3} />
                            <div className="flex gap-2">
                                <Skeleton className="h-10 w-10 rounded-pill" />
                                <Skeleton className="h-10 w-24" />
                            </div>
                        </div>
                    </div>
                </Bloque>

                {/* ========================== PERIODO TEMPORAL ====================== */}
                <Bloque
                    titulo="Selector de periodo"
                    nota="Su estado vive en la URL: cámbialo y mira la barra de direcciones. Los dos últimos bloques no tienen fecha de inicio (punto ámbar): al elegirlos, la resolución cae a ordinal y se explica por qué."
                >
                    <div className="flex flex-col gap-4">
                        <PeriodSelector
                            opciones={opcionesPeriodo}
                            valor={periodo}
                            onChange={cambiarPeriodo}
                            bloques={BLOQUES_DEMO}
                            resuelto={periodoResuelto}
                            nota={reglaDe('volumen').nota}
                            onPonerFecha={() => setEnviado('Aquí se abriría el bloque para ponerle la fecha.')}
                        />

                        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-field bg-surface-sunken p-3 text-t-xs">
                            <dt className="text-ink-subtle">Resolución</dt>
                            <dd className={periodoResuelto.resolucion === 'ordinal' ? 'font-bold text-warning' : 'font-bold text-success'}>
                                {periodoResuelto.resolucion}
                            </dd>
                            <dt className="text-ink-subtle">Desde</dt>
                            <dd className="tabular-nums text-ink-muted">{periodoResuelto.desde?.toLocaleDateString('es-ES') ?? '—'}</dd>
                            <dt className="text-ink-subtle">Hasta</dt>
                            <dd className="tabular-nums text-ink-muted">{periodoResuelto.hasta?.toLocaleDateString('es-ES') ?? '—'}</dd>
                            <dt className="text-ink-subtle">Semanas ISO</dt>
                            <dd className="tabular-nums text-ink-muted">{periodoResuelto.semanas?.join(', ') ?? 'todas'}</dd>
                        </dl>
                    </div>
                </Bloque>

                {/* =========================== PILA DE WIDGETS ====================== */}
                <Bloque
                    titulo="Pila de widgets"
                    nota="Decision K8: apilados tambien en escritorio, con conmutador a rejilla que recuerda la eleccion. Recorrelo con las flechas: los puntos son UNA sola parada de tabulador. Solo se monta la tarjeta activa mas o menos una — mira la etiqueta de cada una."
                >
                    <WidgetStack
                        id="banco-sistema"
                        aria-label="Widgets de ejemplo"
                        widgets={[
                            { id: 'w1', titulo: 'Hoy', render: () => <TarjetaDemo n={1} color="brand" /> },
                            { id: 'w2', titulo: 'Constancia', render: () => <TarjetaDemo n={2} color="success" /> },
                            { id: 'w3', titulo: 'Volumen', render: () => <TarjetaDemo n={3} color="info" /> },
                            { id: 'w4', titulo: 'Competicion', render: () => <TarjetaDemo n={4} color="warning" /> },
                            { id: 'w5', titulo: 'Ranking', render: () => <TarjetaDemo n={5} color="brand" /> },
                        ]}
                    />
                </Bloque>

                {/* ========================= ESTADOS VACÍOS ======================== */}
                <Bloque
                    titulo="Estados vacíos"
                    nota="Tres registros, porque no son lo mismo: no hay datos todavía, el filtro los oculta, o algo falló."
                >
                    <div className="grid gap-3 lg:grid-cols-3">
                        <Panel tone="outline">
                            <EmptyState
                                kind="empty"
                                icon={<Dumbbell className="h-5 w-5" />}
                                title="Aún no tienes bloques"
                                body="Un bloque agrupa las semanas de un mesociclo. Crea el primero y podrás programar sesiones dentro."
                                action={<Button variant="primary" size="sm">Crear bloque</Button>}
                            />
                        </Panel>
                        <Panel tone="outline">
                            <EmptyState
                                kind="filter"
                                icon={<Search className="h-5 w-5" />}
                                title="Ningún atleta coincide"
                                body="Hay 27 atletas en el equipo, pero ninguno con ese texto."
                                action={<Button variant="ghost" size="sm">Limpiar el filtro</Button>}
                            />
                        </Panel>
                        <Panel tone="outline">
                            <EmptyState
                                kind="error"
                                icon={<TrendingUp className="h-5 w-5" />}
                                title="No se han podido cargar las estadísticas"
                                body="La conexión con el servidor ha fallado."
                                action={<Button variant="secondary" size="sm">Reintentar</Button>}
                            />
                        </Panel>
                    </div>
                </Bloque>
            </div>
        </div>
    );
}
