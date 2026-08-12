import { useRef, useState } from 'react';
import {
    LayoutDashboard, FileText, Utensils, Trophy, User, Calendar, Medal, ShoppingBag,
} from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { TeamCard, NextCompCard, NoCompCard } from '../coach/components/CoachHomeCards';
import { RolesSection } from '../profile/components/RolesSection';
import type { UserProfile } from '../../hooks/useUser';
import { LoggerSetRow } from '../training/components/LoggerSetRow';
import { SessionFinish } from '../training/components/SessionFinish';
import { TrainingCard } from '../athlete/components/TodayPanel';
import { ExerciseVideoPanel } from '../training/components/ExerciseVideoPanel';
import { PersonalInfoSection } from '../profile/components/PersonalInfoSection';
import { WarmupConversionPanel } from '../planning/components/builder/WarmupConversionPanel';
import { SaveIndicator } from '../../components/ui/SaveIndicator';
import { DangerConfirmModal } from '../../components/modals/DangerConfirmModal';
import { AnchoredMenu } from '../../components/ui/AnchoredMenu';
import { WEEKDAYS } from '../../types/training';
import type { TrainingSet } from '../../types/training';

/**
 * BANCO DE PRUEBAS DE MAQUETACIÓN — SOLO EN DESARROLLO.
 *
 * La ruta que lo monta está detrás de `import.meta.env.DEV`, así que no
 * existe en producción ni entra en el bundle.
 *
 * POR QUÉ EXISTE: las pantallas que más se usan en el móvil —el registro de
 * series y el armazón del panel— viven detrás del login, y revisar su
 * maquetación a 375px obliga a tener una cuenta, datos de verdad y una
 * sesión abierta. Sin esto, ajustar el espaciado de una fila de series es
 * adivinar; con esto se mide.
 *
 * Solo monta componentes que se alimentan de props. Nada que hable con la
 * base de datos: no es una maqueta de la aplicación, es una regla.
 */

const mockSet = (over: Partial<TrainingSet> = {}): TrainingSet => ({
    id: crypto.randomUUID(),
    session_exercise_id: 'demo',
    target_reps: '5',
    target_load: 140,
    target_metric: 'kg',
    target_rpe: '8',
    rest_seconds: 180,
    is_video_required: false,
    order_index: 0,
    created_at: new Date(0).toISOString(),
    ...over,
});

export function MobilePreview() {
    const [danger, setDanger] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const menuAnchor = useRef<HTMLButtonElement>(null);

    const sets = [
        mockSet({ target_reps: '5', target_load: 140 }),
        mockSet({ target_reps: '5', target_load: 145, actual_reps: 5, actual_load: 145, actual_rpe: 8, is_completed: true }),
        mockSet({ target_reps: '5', target_load: 150, notes: 'La cadera se me va a la derecha' }),
        // Las técnicas se miden aquí porque son la fila más alta: el chip y
        // su detalle añaden un renglón bajo la rejilla, y a 375px hay que
        // comprobar que no empuja el botón de "hecho" fuera de su sitio.
        mockSet({ target_reps: '8', target_load: 100, set_type: 'dropset', set_detail: '-20% x2' }),
        mockSet({ target_reps: '6', target_load: 120, set_type: 'cluster', set_detail: '3+3 / 20s', group_tag: 'A' }),
        mockSet({ target_reps: 'AMRAP', target_load: null, target_metric: 'rpe', target_rpe: '9', set_type: 'amrap' }),
    ];

    const menuItems = [
        { icon: <LayoutDashboard size={20} />, label: 'Inicio', onClick: () => {}, isActive: false },
        { icon: <FileText size={20} />, label: 'Entrenar', onClick: () => {}, isActive: true },
        { icon: <Utensils size={20} />, label: 'Nutrición', onClick: () => {}, isActive: false },
        { icon: <Trophy size={20} />, label: 'Competiciones', shortLabel: 'Competir', onClick: () => {}, isActive: false },
        { icon: <User size={20} />, label: 'Perfil', onClick: () => {}, isActive: false },
        { icon: <Calendar size={20} />, label: 'Calendario AEP', onClick: () => {}, isActive: false, hideOnMobileBar: true },
        { icon: <Medal size={20} />, label: 'Ranking', onClick: () => {}, isActive: false, hideOnMobileBar: true },
        { icon: <ShoppingBag size={20} />, label: 'Tienda Anvil', onClick: () => {}, isActive: false, hideOnMobileBar: true },
    ];

    return (
        <DashboardLayout
            menuItems={menuItems}
            userName="Marc Alonso"
            title="Mi planificación"
            onLogout={() => {}}
        >
            {/* Mismo armazón que WorkoutLogger: UN solo scroll —el de `main`—
                y la cabecera pegada arriba. Si esto diverge, el banco deja de
                medir lo que se envía. */}
            {/* CABECERA DEL PANEL DEL ENTRENADOR.
                Se mide aquí con los CASOS LÍMITE, no con los bonitos: el
                nombre de competición más largo del calendario real, tres
                dígitos de cuenta atrás y el contador a cero. Con "Nacional ·
                Madrid" y 12 días todo cabe siempre y no se ve nada. */}
            <div className="mx-auto w-full max-w-6xl space-y-3 p-4">
                <p className="text-t-2xs font-bold uppercase tracking-widest text-ink-faint">
                    Panel del entrenador · cabecera
                </p>
                <div data-probe="home-cards" className="grid gap-3 md:grid-cols-2">
                    <TeamCard athleteCount={14} onClick={() => {}} />
                    <NextCompCard
                        comp={{
                            name: 'Campeonato de España Absoluto de Powerlifting Clásico',
                            date: '2026-11-14',
                            days: 340,
                            level: 'Nacional',
                            location: 'Alcobendas (Madrid)',
                        }}
                        onClick={() => {}}
                    />
                    <TeamCard athleteCount={0} onClick={() => {}} />
                    <NextCompCard
                        comp={{ name: 'Open Anvil', date: '2026-08-06', days: 1, level: '', location: '' }}
                        onClick={() => {}}
                    />
                    <NoCompCard />
                </div>

                {/* AUTOGESTIÓN DE ROLES.
                    Se monta con el caso que motivó la funcionalidad: alguien
                    que entrena a gente, pauta nutrición Y además tiene su
                    propio entrenador, con un rol concedido (desarrollador)
                    que no puede tocarse. Guardar aquí falla a propósito —no
                    hay sesión— y eso también se quiere ver: el mensaje de
                    error tiene que caber y leerse. */}
                {/* HOY, LA TARJETA DEL ATLETA.
                    Se mide con los tres estados que más apuran el ancho: el
                    renglón de contexto completo ("Viernes · Semana 6 de 12 ·
                    Día 3") con nombre de bloque largo, y los dos casos en que
                    no hay sesión y hay que explicar por qué. */}
                <p className="pt-4 text-t-2xs font-bold uppercase tracking-widest text-ink-faint">
                    Hoy · entrenamiento del atleta
                </p>
                <div data-probe="hoy" className="grid gap-3 md:grid-cols-2">
                    <TrainingCard
                        loading={false}
                        locked={false}
                        onOpen={() => {}}
                        training={{
                            blockName: 'Acumulación de fuerza · preparación Nacional',
                            programWeek: 6,
                            totalWeeks: 12,
                            reason: null,
                            session: {
                                id: 'demo',
                                title: 'Sentadilla pesada',
                                dayNumber: 3,
                                weekday: 'Viernes',
                                completed: false,
                                hasWarmup: true,
                                considerations: 'Prioriza velocidad hoy. RPE 7 máximo.',
                                exerciseNames: ['Sentadilla trasera', 'Press de banca con pausa', 'Peso muerto rumano', 'Remo con barra'],
                                totalSets: 18,
                                completedSets: 7,
                            },
                        }}
                    />
                    <TrainingCard
                        loading={false}
                        locked={false}
                        onOpen={() => {}}
                        training={{
                            blockName: 'Acumulación',
                            programWeek: 7,
                            totalWeeks: 12,
                            reason: 'not-released',
                            session: null,
                        }}
                    />
                    <TrainingCard
                        loading={false}
                        locked={false}
                        onOpen={() => {}}
                        training={{
                            blockName: 'Acumulación',
                            programWeek: 6,
                            totalWeeks: 12,
                            reason: 'rest',
                            session: null,
                        }}
                    />
                    <TrainingCard
                        loading={false}
                        locked={false}
                        onOpen={() => {}}
                        training={{
                            blockName: 'Acumulación',
                            programWeek: 12,
                            totalWeeks: 12,
                            reason: null,
                            session: {
                                id: 'demo2',
                                title: 'Día 1',
                                dayNumber: 1,
                                weekday: null,
                                completed: true,
                                hasWarmup: false,
                                considerations: null,
                                exerciseNames: ['Press militar'],
                                totalSets: 4,
                                completedSets: 4,
                            },
                        }}
                    />
                </div>

                {/* INFORMACIÓN PERSONAL, en modo entrenador.
                    Sin sesión no hay plantilla que leer, así que cae al juego
                    predefinido y se puede medir la rejilla de campos —que es
                    lo que se estrecha— y el editor de "qué le pido". */}
                <p className="pt-4 text-t-2xs font-bold uppercase tracking-widest text-ink-faint">
                    Información personal · vista del entrenador
                </p>
                <PersonalInfoSection
                    athleteId="00000000-0000-0000-0000-000000000000"
                    mode="coach"
                    // Un entrenador de mentira, pero informado: es lo que hace
                    // aparecer el botón de "Qué le pido", que es la mitad de
                    // esta pantalla y la que más se estrecha.
                    coachId="00000000-0000-0000-0000-000000000001"
                    editorId="00000000-0000-0000-0000-000000000000"
                />

                <p className="pt-4 text-t-2xs font-bold uppercase tracking-widest text-ink-faint">
                    Perfil · qué eres en Anvil
                </p>
                <RolesSection
                    user={{
                        id: 'demo',
                        full_name: 'Marc Alonso',
                        role: 'coach',
                        roles: ['athlete', 'coach', 'nutritionist', 'developer'],
                        has_access: true,
                    } as UserProfile}
                />
            </div>

            <div className="mx-auto w-full max-w-md">
                <div data-probe="cabecera" className="sticky top-0 z-sticky border-b border-subtle bg-surface-canvas/95 pb-2 backdrop-blur">
                    <div className="p-4">
                        <h1 className="text-t-2xs font-bold uppercase tracking-wider text-anvil-red">Bloque de fuerza</h1>
                    </div>
                    <div data-probe="progreso" className="flex items-center gap-2.5 px-4 pt-1">
                        <div className="h-1 flex-1 overflow-hidden rounded-pill bg-surface-sunken">
                            <div className="h-full w-1/6 bg-brand" />
                        </div>
                        <span className="shrink-0 text-t-2xs font-bold uppercase tracking-widest tabular-nums text-ink-subtle">1/6</span>
                        <SaveIndicator />
                    </div>
                </div>

                <div className="space-y-4 p-4 pb-[calc(env(safe-area-inset-bottom)+2rem)] md:pb-8">
                    <div data-probe="tarjeta-ejercicio" className="overflow-hidden rounded-card border border-subtle bg-surface-canvas">
                        {/* Cinta de encadenado, a ancho completo y arriba del
                            todo, igual que en la tarjeta real. */}
                        <div className="flex items-center gap-2 bg-[var(--info-quiet)] px-4 py-1.5">
                            <span className="text-t-2xs font-black uppercase tracking-widest text-info">Superserie A</span>
                            <span className="text-t-2xs text-info/70">· 1 de 2 · sin descanso, sigue al siguiente</span>
                        </div>
                        <div className="flex items-start justify-between gap-2 bg-surface-raised p-4">
                            <h3 className="text-t-lg font-bold leading-tight text-ink">Sentadilla trasera</h3>
                        </div>

                        <div className="grid grid-cols-[1rem_1fr_1fr_2.75rem_2.25rem_2.75rem] gap-1 border-b border-subtle bg-surface-overlay/40 px-2.5 py-2 text-center text-t-2xs font-bold uppercase tracking-wide text-ink-subtle sm:gap-1.5 sm:px-3">
                            <span className="text-left">#</span>
                            <span>Reps</span>
                            <span>Kg</span>
                            <span>RPE</span>
                            <span />
                            <span />
                        </div>

                        <div className="divide-y divide-[var(--border-subtle)]">
                            {sets.map((s, i) => (
                                <LoggerSetRow
                                    key={s.id}
                                    set={s}
                                    displayIndex={i + 1}
                                    targetReps={s.target_reps ?? null}
                                    onStartTimer={() => {}}
                                    defaultRestSeconds={180}
                                />
                            ))}
                        </div>
                    </div>

                    {/* CIERRE DEL DÍA, EN SUS DOS ESTADOS.
                        Es la última tarjeta del scroll de la sesión y la que
                        más piezas mete a la vez —cifras, comparación de RPE,
                        caja de notas y la recomendación de check-in—, así que
                        a 375px es donde antes se rompe algo.

                        Habla con la base de datos, igual que `RolesSection` de
                        arriba, y aquí eso es lo que se quiere ver: sin sesión,
                        la consulta del check-in falla y cae a "no contestado",
                        que es justo el estado con la franja de recomendación
                        desplegada. */}
                    {/* PROPUESTA DE CONVERSIÓN DE CALENTAMIENTO.
                        Es la pieza con más elementos por fila de todo lo
                        nuevo: etiqueta de circuito, nombre truncado y resumen
                        de series en la misma línea. Con "Rotación externa de
                        hombro con banda elástica" —un nombre largo de
                        verdad— es donde el truncado se pone a prueba. */}
                    <p className="pt-2 text-t-2xs font-bold uppercase tracking-widest text-ink-faint">
                        Propuesta de calentamiento estructurado
                    </p>
                    <WarmupConversionPanel
                        text={`Circuito A - 3 rondas
Rotación externa de hombro con banda elástica larga 2x15
Band Pull Apart 2 x 20
Movilidad torácica en cuadrupedia 2x10
Sentadilla con barra 2x10
Barra 20kg x10, 60x5, 80x3
Movilidad de cadera 5'`}
                        onCancel={() => {}}
                        onConvert={() => {}}
                    />

                    {/* FICHA DEL EJERCICIO con enlace externo.
                        Sin sesión, `resolve_exercise_video` no devuelve nada y
                        el panel cae al enlace de la biblioteca — que es
                        exactamente el camino que se quiere comprobar, y el
                        único que hay hoy en producción mientras
                        `exercise_videos.sql` siga sin ejecutarse. */}
                    <p className="pt-2 text-t-2xs font-bold uppercase tracking-widest text-ink-faint">
                        Ficha de ejercicio · respaldo al enlace externo
                    </p>
                    <ExerciseVideoPanel
                        exerciseId="00000000-0000-0000-0000-000000000000"
                        exerciseName="Sentadilla trasera"
                        athleteId="demo"
                        prescription="3x5 @180kg"
                        coachNotes="Para un segundo en el agujero."
                        externalVideoUrl="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
                    />

                    <p className="pt-2 text-t-2xs font-bold uppercase tracking-widest text-ink-faint">
                        Cierre del día · sin terminar
                    </p>
                    <SessionFinish
                        sessionId="demo-abierto"
                        athleteId="demo"
                        exercises={[{ sets }]}
                        completedAt={null}
                        athleteNotes={null}
                        onChange={() => {}}
                    />

                    <p className="pt-2 text-t-2xs font-bold uppercase tracking-widest text-ink-faint">
                        Cierre del día · terminado
                    </p>
                    <SessionFinish
                        sessionId="demo-cerrado"
                        athleteId="demo"
                        exercises={[{ sets: sets.map(s => ({ ...s, is_completed: true, actual_reps: 5, actual_load: 145, actual_rpe: 9 })) }]}
                        completedAt={new Date(0).toISOString()}
                        athleteNotes="La cadera se me iba a la derecha en las dos últimas."
                        onChange={() => {}}
                    />

                    <button
                        onClick={() => setDanger(true)}
                        className="w-full rounded-field border border-subtle py-3 text-t-sm font-bold text-ink-muted"
                    >
                        Probar diálogo de borrado
                    </button>

                    {/* MENÚ ANCLADO DENTRO DE UN CONTENEDOR QUE RECORTA.
                        El `overflow-hidden` de aquí reproduce el del acordeón
                        de semana del constructor, que es lo que recortaba el
                        desplegable de "agendar día" y dejaba los últimos días
                        sin poder pulsarse. Si el menú vuelve a ser `absolute`,
                        esta caja lo vuelve a partir y se ve al instante. */}
                    <div data-probe="caja-que-recorta" className="h-16 overflow-hidden rounded-card border border-subtle p-3">
                        <button
                            ref={menuAnchor}
                            onClick={() => setMenuOpen(v => !v)}
                            aria-expanded={menuOpen}
                            className="rounded-chip bg-brand-quiet px-2 py-1 text-t-2xs font-semibold uppercase tracking-wide text-brand"
                        >
                            Agendar día
                        </button>
                        <AnchoredMenu open={menuOpen} onClose={() => setMenuOpen(false)} anchorRef={menuAnchor}>
                            {WEEKDAYS.map(d => (
                                <button
                                    key={d.key}
                                    role="menuitem"
                                    onClick={() => setMenuOpen(false)}
                                    className="flex w-full rounded-field px-2.5 py-2 text-left text-t-sm text-ink-muted hover:bg-brand hover:text-brand-ink"
                                >
                                    {d.label}
                                </button>
                            ))}
                        </AnchoredMenu>
                    </div>
                </div>

            </div>

            <DangerConfirmModal
                open={danger}
                onClose={() => setDanger(false)}
                onConfirm={() => setDanger(false)}
                title="Sacar del equipo"
                confirmLabel="Sacar del equipo"
                description={<>Marc Alonso dejará de aparecer en tu lista.</>}
            />
        </DashboardLayout>
    );
}
