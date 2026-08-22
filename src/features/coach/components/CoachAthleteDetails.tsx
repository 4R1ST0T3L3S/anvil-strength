import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { UserProfile } from '../../../hooks/useUser';
import { ArrowLeft, ChevronDown, FileText, Trophy, Trash2, Calendar, MapPin, Apple, MessageSquare, BarChart3, IdCard, Plus, Search } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useUser } from '../../../hooks/useUser';
import { WorkoutBuilder } from '../../planning/components/WorkoutBuilder';
import { TrainingBlockList } from './TrainingBlockList';
import { CoachAthleteStatsTab } from './CoachAthleteStatsTab';
import { NutritionPlanEditor } from '../../nutrition/components/NutritionPlanEditor';
import { PersonalInfoSection } from '../../profile/components/PersonalInfoSection';
import { PaymentPanel } from './PaymentPanel';
import { CoachNotesPanel } from './CoachNotesPanel';
import { TrainingBlock } from '../../../types/training';
import { competitionsService, CompetitionAssignment, CompetitionResult } from '../../../services/competitionsService';
import { ConfirmationModal } from '../../../components/modals/ConfirmationModal';
import { Button } from '../../../components/ui/Button';
import { AnchoredMenu } from '../../../components/ui/AnchoredMenu';
import { SafeImage } from '../../../components/ui/SafeImage';
import { useCoachRoster } from '../hooks/useCoachRoster';
import { puede, type Capacidad } from '../../../lib/roles';

interface CoachAthleteDetailsProps {
    athleteId: string;
    onOpenChat: (athlete: { id: string; full_name: string; avatar_url?: string }) => void;
    onBack: () => void;
}

type Tab = 'planning' | 'stats' | 'competitions' | 'nutrition' | 'personal';

/**
 * CUATRO APARTADOS DE ENTRENAMIENTO, MÁS UNO CONDICIONAL.
 * =====================================================================
 * Rediseño del 12/08/2026 (docs/PLAN_REESTRUCTURACION_2026-08-12.md §C).
 * Antes eran siete pestañas planas: Planning, Registro, VBT, Nutrición,
 * Check-ins, Competición, Datos. Registro, VBT y Check-ins eran la misma
 * pregunta —"¿qué dicen los datos de este atleta?"— repartida en tres
 * sitios, que es la razón de que nadie mirara ninguno con regularidad.
 * Ahora viven juntas dentro de ESTADÍSTICAS, con su propia sub-navegación
 * (ver `CoachAthleteStatsTab`).
 *
 * Cada pestaña declara QUÉ hace falta poder hacer para verla, no QUIÉN eres.
 * Así el mismo panel se recorta solo: un entrenador ve la parte de
 * entrenamiento, un nutricionista solo Nutrición y Datos, y quien es las dos
 * cosas las ve todas —el caso que motivó los roles múltiples—.
 *
 * `caps` es un O: basta con una de las capacidades. Los datos personales
 * —altura, peso, patologías, pagos, notas del entrenador— los mira tanto
 * quien programa como quien pauta comidas, así que llevan las dos.
 */
const TABS: { key: Tab; label: string; icon: LucideIcon; caps: Capacidad[] }[] = [
    { key: 'planning', label: 'Programación', icon: FileText, caps: ['planificar_entrenamiento'] },
    { key: 'stats', label: 'Estadísticas', icon: BarChart3, caps: ['planificar_entrenamiento'] },
    { key: 'competitions', label: 'Competición', icon: Trophy, caps: ['planificar_entrenamiento'] },
    { key: 'personal', label: 'Datos', icon: IdCard, caps: ['planificar_entrenamiento', 'pautar_nutricion'] },
    { key: 'nutrition', label: 'Nutrición', icon: Apple, caps: ['pautar_nutricion'] },
];

/**
 * UN SOLO ANCHO PARA TODA LA FICHA.
 *
 * Cada pestaña traía el suyo —7xl en planificación, 6xl en registro, 4xl en
 * competiciones—, así que las tarjetas cambiaban de anchura al cambiar de
 * pestaña y la lista de bloques se veía notablemente más ancha que todo lo
 * demás. Con una sola constante, la columna de contenido es la misma en las
 * seis y coincide además con la de los dos paneles de inicio.
 */
const TAB_WIDTH = 'mx-auto w-full max-w-6xl pb-6';

/**
 * La única excepción, y a propósito: el constructor de rutinas es una tabla
 * de semanas por días. Ahí el ancho no es estética, es cuántos días caben sin
 * desplazamiento lateral.
 */
const BUILDER_WIDTH = 'mx-auto w-full max-w-7xl pb-6';

export function CoachAthleteDetails({ athleteId, onOpenChat, onBack }: CoachAthleteDetailsProps) {
    const navigate = useNavigate();
    const { data: currentUser } = useUser();
    const [athlete, setAthlete] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<Tab>('planning');

    // NAVEGACIÓN RÁPIDA ENTRE ATLETAS. El nombre de la cabecera se convierte
    // en el disparador de un desplegable con el resto del equipo: antes,
    // saltar a otro atleta obligaba a volver a la lista, buscarlo y volver a
    // entrar. `useCoachRoster` es una consulta ligera y con caché —no
    // repite lo que ya pidió la pestaña "Atletas" si el coach vino de ahí.
    const { athletes: roster, loading: rosterLoading } = useCoachRoster(currentUser?.id);
    const [rosterOpen, setRosterOpen] = useState(false);
    const [rosterSearch, setRosterSearch] = useState('');
    const rosterAnchorRef = useRef<HTMLButtonElement>(null);
    const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
    const [competitions, setCompetitions] = useState<CompetitionAssignment[]>([]);
    const [results, setResults] = useState<Record<string, CompetitionResult>>({});
    const [addingCompetition, setAddingCompetition] = useState(false);
    const [newCompetition, setNewCompetition] = useState({ name: '', date: '', location: '' });
    const [savingCompetition, setSavingCompetition] = useState(false);

    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        title: string;
        description: string;
        onConfirm: () => void;
    }>({ isOpen: false, title: '', description: '', onConfirm: () => { } });

    const fetchCompetitions = useCallback(async () => {
        if (!athleteId) return;
        try {
            const data = await competitionsService.getAthleteCompetitions(athleteId);
            setCompetitions(data || []);
            const resultRows = await competitionsService.getResults(athleteId);
            setResults(Object.fromEntries(resultRows.map(r => [r.competition_id, r])));
        } catch (error) {
            console.error('Error fetching competitions:', error);
        }
    }, [athleteId]);

    const handleAddCompetition = async () => {
        if (!newCompetition.name.trim() || !newCompetition.date || !currentUser) {
            toast.error('Indica al menos nombre y fecha');
            return;
        }
        setSavingCompetition(true);
        try {
            await competitionsService.assignCompetition(
                { name: newCompetition.name.trim(), date: newCompetition.date, location: newCompetition.location.trim() || undefined },
                [athleteId],
                currentUser.id
            );
            toast.success('Competición añadida');
            setNewCompetition({ name: '', date: '', location: '' });
            setAddingCompetition(false);
            fetchCompetitions();
        } catch (err) {
            console.error(err);
            toast.error('No se pudo añadir la competición');
        } finally {
            setSavingCompetition(false);
        }
    };

    const handleSaveResult = async (competitionId: string, patch: Partial<CompetitionResult>) => {
        if (!currentUser) return;
        try {
            await competitionsService.upsertResult({
                ...results[competitionId],
                competition_id: competitionId,
                athlete_id: athleteId,
                created_by: currentUser.id,
                ...patch,
            });
            fetchCompetitions();
        } catch (err) {
            console.error(err);
            toast.error('No se pudo guardar el resultado. ¿Ejecutaste database/REESTRUCTURACION_2026-08.sql?');
        }
    };

    const handleRemoveCompetition = (id: string, name: string) => {
        setConfirmModal({
            isOpen: true,
            title: 'Eliminar Asignación',
            description: `¿Estás seguro de que quieres eliminar la asignación a "${name}"?`,
            onConfirm: async () => {
                try {
                    await competitionsService.removeAssignment(id);
                    setCompetitions(prev => prev.filter(c => c.id !== id));
                } catch (error) {
                    console.error('Error removing competition:', error);
                    // alert('Error al eliminar la competición');
                }
            }
        });
    };


    useEffect(() => {
        setSelectedBlockId(null);
        setActiveTab('planning');
    }, [athleteId]);

    useEffect(() => {
        const fetchAthlete = async () => {
            try {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', athleteId)
                    .single();

                if (error) throw error;
                setAthlete(data);
            } catch (err) {
                console.error('Error fetching athlete details:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchAthlete();
        fetchCompetitions();
    }, [athleteId, fetchCompetitions]);

    if (loading) return <div className="p-8 text-center">Cargando perfil...</div>;
    if (!athlete) return <div className="p-8 text-center text-danger">Atleta no encontrado</div>;

    // El panel se recorta a lo que ESTE profesional puede hacer con el
    // atleta. `activeTab` arranca en 'planning', que un nutricionista puro no
    // ve; `shownTab` cae a la primera pestaña visible en vez de dejar la
    // ficha en blanco.
    const visibleTabs = TABS.filter(t => t.caps.some(c => puede(currentUser, c)));
    const shownTab: Tab | undefined = visibleTabs.some(t => t.key === activeTab)
        ? activeTab
        : visibleTabs[0]?.key;

    const athleteTotal = (athlete.squat_pr || 0) + (athlete.bench_pr || 0) + (athlete.deadlift_pr || 0);
    const filteredRoster = rosterSearch.trim()
        ? roster.filter(a => (a.full_name ?? '').toLowerCase().includes(rosterSearch.trim().toLowerCase()))
        : roster;

    return (
        <div className="flex flex-col h-full">
            {/* Header.
                Solo la identidad del atleta y el acceso al chat: las
                pestañas se sacaron a su propia fila (ver más abajo), así que
                aquí ya no hace falta apilar en móvil — cabecera y contenido
                dejan de competir por la misma línea. */}
            <div className="flex items-center justify-between gap-3 p-4 md:p-6 border-b border-subtle bg-surface-sunken shrink-0">
                <div className="flex min-w-0 items-center gap-2 md:gap-3">
                    <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-lg text-ink-muted hover:text-white transition-colors shrink-0">
                        <ArrowLeft size={20} />
                    </button>

                    {/* NOMBRE COMO DESPLEGABLE.
                        Antes era un bloque de solo lectura; saltar a otro
                        atleta obligaba a volver a la lista, buscarlo y volver
                        a entrar. Ahora es el disparador de un desplegable con
                        el resto del equipo — misma información en pantalla,
                        y además navegable. */}
                    <button
                        ref={rosterAnchorRef}
                        onClick={() => setRosterOpen(v => !v)}
                        aria-haspopup="menu"
                        aria-expanded={rosterOpen}
                        aria-label={`${athlete.full_name ?? 'Atleta'}. Abrir para cambiar de atleta`}
                        className="group flex min-w-0 flex-1 items-center gap-3 rounded-field px-1.5 py-1 -ml-1.5 text-left transition-colors duration-fast ease-snap hover:bg-surface-raised md:gap-4"
                    >
                        {athlete.avatar_url ? (
                            <img src={athlete.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                        ) : (
                            <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center font-bold shrink-0">
                                {athlete.full_name?.[0]}
                            </div>
                        )}
                        <div className="min-w-0">
                            <span className="flex items-center gap-1.5">
                                <h2 className="text-lg md:text-xl font-black uppercase tracking-tight truncate">{athlete.full_name}</h2>
                                <ChevronDown
                                    size={16}
                                    aria-hidden="true"
                                    className={`shrink-0 text-ink-faint transition-transform duration-fast ease-snap group-hover:text-ink ${rosterOpen ? 'rotate-180' : ''}`}
                                />
                            </span>
                            <p className="text-xs md:text-sm text-ink-muted flex flex-wrap items-center gap-2">
                                <span className="whitespace-nowrap">{athlete.weight_category || '-'}</span>
                                <span className="w-1 h-1 bg-gray-500 rounded-full"></span>
                                <span className="whitespace-nowrap">{athlete.age_category || '-'}</span>
                                <span className="w-1 h-1 bg-gray-500 rounded-full"></span>
                                <span className="whitespace-nowrap">Total: {athleteTotal}kg</span>
                            </p>
                        </div>
                    </button>
                </div>

                <button
                    onClick={() => athlete && onOpenChat({ id: athlete.id, full_name: athlete.full_name || '', avatar_url: athlete.avatar_url })}
                    aria-label={`Mensaje directo con ${athlete.full_name ?? 'el atleta'}`}
                    // Azul suelto con sombra de color propia: era el único elemento
                    // del panel con ese tratamiento. Pasa a acción secundaria
                    // del sistema —la primaria de esta pantalla es programar,
                    // no escribir— y deja de competir con las pestañas.
                    className="flex h-11 shrink-0 items-center gap-2 rounded-field border border-[var(--border-default)] px-3 text-t-sm font-semibold text-ink-muted transition-colors duration-fast ease-snap hover:border-[var(--border-strong)] hover:bg-surface-raised hover:text-ink"
                >
                    <MessageSquare size={16} className="shrink-0" />
                    <span className="hidden lg:inline">Mensaje Directo</span>
                </button>
            </div>

            <AnchoredMenu
                open={rosterOpen}
                onClose={() => setRosterOpen(false)}
                anchorRef={rosterAnchorRef}
                align="start"
                width={320}
                role="menu"
            >
                <div className="flex flex-col">
                    {roster.length > 6 && (
                        <div className="relative border-b border-[var(--border-subtle)] p-2">
                            <Search size={14} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
                            <input
                                autoFocus
                                type="text"
                                value={rosterSearch}
                                onChange={(e) => setRosterSearch(e.target.value)}
                                placeholder="Buscar atleta…"
                                className="w-full rounded-field bg-surface-sunken py-2 pl-8 pr-2 text-t-sm text-ink outline-none placeholder:text-ink-faint"
                            />
                        </div>
                    )}
                    <div className="max-h-[min(50vh,22rem)] overflow-y-auto p-1">
                        {rosterLoading ? (
                            <p className="px-3 py-4 text-center text-t-sm text-ink-subtle">Cargando atletas…</p>
                        ) : filteredRoster.length === 0 ? (
                            <p className="px-3 py-4 text-center text-t-sm text-ink-subtle">Sin resultados.</p>
                        ) : (
                            filteredRoster.map((a) => {
                                const isCurrent = a.id === athleteId;
                                return (
                                    <button
                                        key={a.id}
                                        role="menuitem"
                                        onClick={() => {
                                            setRosterOpen(false);
                                            if (!isCurrent) navigate(`/coach-dashboard/atletas/${a.id}`);
                                        }}
                                        className={`flex w-full items-center gap-3 rounded-field px-2.5 py-2 text-left transition-colors duration-fast ease-snap ${
                                            isCurrent ? 'bg-[var(--brand-quiet)]' : 'hover:bg-surface-raised'
                                        }`}
                                    >
                                        <SafeImage
                                            src={a.avatar_url ?? undefined}
                                            alt=""
                                            className="h-8 w-8 shrink-0 rounded-full object-cover"
                                            fallback={
                                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-t-xs font-bold text-ink-faint">
                                                    {a.full_name?.[0] ?? '?'}
                                                </div>
                                            }
                                        />
                                        <div className="min-w-0 flex-1">
                                            <p className={`truncate text-t-sm font-semibold ${isCurrent ? 'text-brand' : 'text-ink'}`}>
                                                {a.full_name ?? 'Sin nombre'}
                                            </p>
                                            <p className="truncate text-t-2xs text-ink-subtle">
                                                {[a.weight_category, a.age_category].filter(Boolean).join(' · ') || '—'}
                                            </p>
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>
            </AnchoredMenu>

            {/* PESTAÑAS DE LA FICHA — fila propia, ancho completo.
                ==================================================
                Antes vivían apretadas en la misma línea que la cabecera,
                empujadas a la derecha y en texto pequeño (11px): la
                navegación principal de la ficha quedaba semi-escondida.
                Ahora tienen su propia franja, controles de tamaño real
                (44px) y se centran en escritorio — en móvil siguen
                deslizándose en horizontal, pero ya no comparten sitio con
                nada más. */}
            <div className="border-b border-subtle bg-surface-sunken px-3 pb-3 shrink-0 md:px-6">
                <div className="-mx-1 overflow-x-auto px-1 scrollbar-hide">
                    <div
                        role="tablist"
                        aria-label="Secciones del atleta"
                        className="mx-auto flex w-full max-w-2xl min-w-max items-stretch justify-center gap-1 rounded-field bg-surface-canvas p-1"
                    >
                        {visibleTabs.map(({ key, label, icon: Icon }) => {
                            const active = shownTab === key;
                            return (
                                <button
                                    key={key}
                                    role="tab"
                                    aria-selected={active}
                                    onClick={() => setActiveTab(key)}
                                    className={`flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-field px-4 text-t-sm font-bold transition-colors duration-fast ease-snap md:px-6 ${
                                        active
                                            ? 'bg-brand text-brand-ink'
                                            : 'text-ink-subtle hover:bg-surface-raised hover:text-ink'
                                    }`}
                                >
                                    <Icon size={17} aria-hidden="true" className="shrink-0" />
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Contenido.
                `overflow-x-hidden` es el corte de seguridad: dentro viven el
                constructor de bloques y el analisis, con rejillas y tablas
                anchas, y en un movil de 375px cualquiera de ellas arrastraba la
                PAGINA ENTERA hacia la derecha -cabecera y pestanas incluidas-
                dejando media pantalla en negro.
                El relleno lateral baja a 12px en movil: los hijos ya traen el
                suyo, y sumar los dos dejaba las tarjetas de bloque en una
                columna de poco mas de 200px. */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden bg-surface-sunken p-3 md:p-6">

                {/* 1. PLANIFICACIÓN */}
                {shownTab === 'planning' && (
                    <div className={selectedBlockId ? BUILDER_WIDTH : TAB_WIDTH}>
                        {selectedBlockId ? (
                            <div className="h-full flex flex-col">
                                <button
                                    onClick={() => setSelectedBlockId(null)}
                                    className="self-start mb-2 text-sm text-ink-subtle hover:text-white flex items-center gap-1 transition-colors"
                                >
                                    &larr; Ver todos los bloques
                                </button>
                                <WorkoutBuilder
                                    athleteId={athleteId}
                                    blockId={selectedBlockId}
                                    athleteName={athlete.full_name}
                                />
                            </div>
                        ) : (
                            <TrainingBlockList
                                athleteId={athleteId}
                                onSelectBlock={(block: TrainingBlock) => setSelectedBlockId(block.id)}
                            />
                        )}
                    </div>
                )}

                {/* 2. ESTADÍSTICAS: Resumen, Registro, Velocidad y Check-ins,
                    unificados. Ver CoachAthleteStatsTab. */}
                {shownTab === 'stats' && currentUser && (
                    <div className={TAB_WIDTH}>
                        <CoachAthleteStatsTab athleteId={athleteId} athleteName={athlete.full_name} coachId={currentUser.id} />
                    </div>
                )}

                {/* 3. COMPETICIONES: asignadas, con alta rápida y resultado
                    de las ya disputadas. */}
                {shownTab === 'competitions' && (
                    <div className={`${TAB_WIDTH} space-y-6`}>
                        <div className="flex items-center justify-between">
                            <h3 className="text-xl font-black uppercase tracking-tight text-white flex items-center gap-2">
                                <Trophy className="text-anvil-red" />
                                Competiciones
                            </h3>
                            <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setAddingCompetition(v => !v)}>
                                Añadir
                            </Button>
                        </div>

                        {addingCompetition && (
                            <div className="space-y-3 rounded-xl border border-subtle bg-surface-sunken p-4">
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                    <input
                                        type="text"
                                        placeholder="Nombre de la competición"
                                        value={newCompetition.name}
                                        onChange={(e) => setNewCompetition(v => ({ ...v, name: e.target.value }))}
                                        className="rounded-field border border-[var(--border-default)] bg-surface-raised px-3 py-2 text-t-sm text-ink sm:col-span-1"
                                    />
                                    <input
                                        type="date"
                                        value={newCompetition.date}
                                        onChange={(e) => setNewCompetition(v => ({ ...v, date: e.target.value }))}
                                        className="rounded-field border border-[var(--border-default)] bg-surface-raised px-3 py-2 text-t-sm text-ink"
                                    />
                                    <input
                                        type="text"
                                        placeholder="Lugar (opcional)"
                                        value={newCompetition.location}
                                        onChange={(e) => setNewCompetition(v => ({ ...v, location: e.target.value }))}
                                        className="rounded-field border border-[var(--border-default)] bg-surface-raised px-3 py-2 text-t-sm text-ink"
                                    />
                                </div>
                                <Button size="sm" variant="primary" loading={savingCompetition} onClick={handleAddCompetition}>
                                    Guardar
                                </Button>
                            </div>
                        )}

                        {competitions.length === 0 ? (
                            <div className="text-center py-12 bg-surface-sunken border border-subtle rounded-xl">
                                <Trophy size={48} className="mx-auto text-ink-subtle mb-4" />
                                <p className="text-ink-muted font-medium">No hay competiciones asignadas.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-4">
                                {[...competitions]
                                    .sort((a, b) => b.date.localeCompare(a.date))
                                    .map((comp) => {
                                    const level = comp.level || 'COMPETICIÓN';
                                    const isPast = comp.date < new Date().toISOString().slice(0, 10);
                                    let meta: { color: string; border: string; bg: string };
                                    switch (level) {
                                        case 'AEP 3': meta = { color: 'text-orange-400', border: 'border-orange-500/50', bg: 'bg-orange-500/10' }; break;
                                        case 'AEP 2': meta = { color: 'text-yellow-400', border: 'border-yellow-500/50', bg: 'bg-yellow-500/10' }; break;
                                        case 'AEP 1': meta = { color: 'text-blue-400', border: 'border-blue-500/50', bg: 'bg-blue-500/10' }; break;
                                        case 'NACIONAL': meta = { color: 'text-purple-400', border: 'border-purple-500/50', bg: 'bg-purple-500/10' }; break;
                                        case 'EPF': meta = { color: 'text-green-400', border: 'border-green-500/50', bg: 'bg-green-500/10' }; break;
                                        case 'IPF': meta = { color: 'text-[#e6c2a5]', border: 'border-[#e6c2a5]/50', bg: 'bg-[#e6c2a5]/10' }; break;
                                        default: meta = { color: 'text-anvil-red', border: 'border-anvil-red/50', bg: 'bg-anvil-red/10' }; break;
                                    }
                                    const result = results[comp.id];

                                    return (
                                        <div key={comp.id} className={`bg-surface-sunken border ${meta.border} rounded-xl p-6 space-y-4 hover:border-[var(--border-strong)] transition-colors`}>
                                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                                <div className="space-y-2">
                                                    <div className="flex flex-wrap items-center gap-3">
                                                        {comp.level && (
                                                            <span className={`text-[10px] font-black uppercase tracking-widest ${meta.bg} ${meta.color} px-2 py-1 rounded`}>
                                                                {comp.level}
                                                            </span>
                                                        )}
                                                        {isPast && (
                                                            <span className="text-[10px] font-black uppercase tracking-widest text-ink-faint px-2 py-1 rounded bg-surface-raised">
                                                                Disputada
                                                            </span>
                                                        )}
                                                        <h4 className="text-lg font-bold text-white uppercase leading-tight">
                                                            {comp.name}
                                                        </h4>
                                                    </div>
                                                    <div className="flex items-center gap-4 text-sm text-ink-muted">
                                                        <div className="flex items-center gap-1.5">
                                                            <Calendar size={14} className={meta.color} />
                                                            <span>
                                                                {new Date(comp.date).toLocaleDateString('es-ES', {
                                                                    year: 'numeric',
                                                                    month: 'long',
                                                                    day: 'numeric'
                                                                })}
                                                            </span>
                                                        </div>
                                                        {comp.location && (
                                                            <div className="flex items-center gap-1.5">
                                                                <MapPin size={14} className={meta.color} />
                                                                <span>{comp.location}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={() => handleRemoveCompetition(comp.id, comp.name)}
                                                    className="self-end md:self-center flex items-center gap-2 px-4 py-2 bg-[var(--danger-quiet)] hover:bg-[var(--danger-quiet)] text-danger rounded-lg transition-colors text-sm font-bold uppercase tracking-wide group shrink-0"
                                                >
                                                    <Trash2 size={16} className="group-hover:scale-110 transition-transform" />
                                                    Eliminar
                                                </button>
                                            </div>

                                            {isPast && (
                                                <CompetitionResultRow
                                                    result={result}
                                                    onSave={(patch) => handleSaveResult(comp.id, patch)}
                                                />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* 4. NUTRICIÓN — solo para quien puede pautarla. */}
                {shownTab === 'nutrition' && (
                    <div className={TAB_WIDTH}>
                        <NutritionPlanEditor athleteId={athleteId} />
                    </div>
                )}

                {/* 5. DATOS.
                    El MISMO componente de información personal que el atleta
                    ve en su perfil, en modo entrenador, más pagos y notas
                    privadas — que el atleta no ve. */}
                {shownTab === 'personal' && currentUser && (
                    <div className={`${TAB_WIDTH} space-y-6`}>
                        <PaymentPanel athleteId={athleteId} coachId={currentUser.id} />
                        <CoachNotesPanel athleteId={athleteId} coachId={currentUser.id} />
                        <PersonalInfoSection
                            athleteId={athleteId}
                            mode="coach"
                            coachId={currentUser.id}
                            editorId={currentUser.id}
                        />
                    </div>
                )}

            </div>
            <ConfirmationModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                onConfirm={confirmModal.onConfirm}
                title={confirmModal.title}
                description={confirmModal.description}
                confirmText="Eliminar"
                cancelText="Cancelar"
                variant="danger"
            />
        </div>
    );
}

/**
 * RESULTADO DE UNA COMPETICIÓN YA DISPUTADA.
 * Guarda al salir del campo (blur), como los apéndices del día en el
 * constructor: sin botón de guardar propio, para que anotar seis cifras
 * después de un campeonato no sea un formulario con submit.
 */
function CompetitionResultRow({ result, onSave }: {
    result: CompetitionResult | undefined;
    onSave: (patch: Partial<CompetitionResult>) => void;
}) {
    const [draft, setDraft] = useState<Partial<CompetitionResult>>(result ?? {});

    useEffect(() => { setDraft(result ?? {}); }, [result]);

    const field = (key: keyof CompetitionResult, label: string, placeholder: string) => (
        <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-ink-subtle">{label}</span>
            <input
                type="text"
                inputMode="decimal"
                value={(draft[key] as string | number | null) ?? ''}
                onChange={(e) => setDraft(d => ({ ...d, [key]: e.target.value === '' ? null : (key === 'place' || key === 'notes' ? e.target.value : Number(e.target.value)) }))}
                onBlur={() => onSave({ [key]: draft[key] })}
                placeholder={placeholder}
                className="w-full rounded-field border border-[var(--border-default)] bg-surface-raised px-2.5 py-1.5 text-t-sm tabular-nums text-ink"
            />
        </label>
    );

    return (
        <div className="border-t border-subtle pt-4">
            <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-ink-subtle">Resultado</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {field('bodyweight_kg', 'Peso', 'kg')}
                {field('squat_kg', 'Sentadilla', 'kg')}
                {field('bench_kg', 'Banca', 'kg')}
                {field('deadlift_kg', 'Muerto', 'kg')}
                {field('total_kg', 'Total', 'kg')}
                {field('place', 'Puesto', '1º')}
            </div>
        </div>
    );
}
