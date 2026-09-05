import { useState, useEffect, useMemo } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { Trophy, MapPin, Settings, X, Calendar, Check, Loader, Flag } from 'lucide-react';
import { LiveCountdown, formatCompetitionName, getCompetitionColorClass } from './CompetitionCountdown';
import { fetchCompetitions } from '../../services/aepService';
import { useQuery } from '@tanstack/react-query';
import { Preferences } from '@capacitor/preferences';

// ============ Temas / Presets visuales ============

export interface CountdownTheme {
    id: string;
    label: string;
    className: string;
    swatch: string;
}

export const COUNTDOWN_THEMES: CountdownTheme[] = [
    { id: 'auto', label: 'Nivel automático', className: '', swatch: 'bg-gradient-to-br from-blue-500 via-[#D4AF37] to-[#FF6B35]' },
    { id: 'anvil', label: 'Anvil Red', className: 'bg-gradient-to-br from-brand to-red-950', swatch: 'bg-gradient-to-br from-brand to-red-950' },
    { id: 'gold', label: 'Oro', className: 'bg-gradient-to-br from-[#D4AF37] to-[#8a6d1f]', swatch: 'bg-gradient-to-br from-[#D4AF37] to-[#8a6d1f]' },
    { id: 'carbon', label: 'Carbón', className: 'bg-gradient-to-br from-[#2a2a2a] to-black border border-line', swatch: 'bg-gradient-to-br from-[#2a2a2a] to-black' },
    { id: 'electric', label: 'Azul eléctrico', className: 'bg-gradient-to-br from-blue-500 to-indigo-900', swatch: 'bg-gradient-to-br from-blue-500 to-indigo-900' },
    { id: 'emerald', label: 'Esmeralda', className: 'bg-gradient-to-br from-emerald-500 to-emerald-950', swatch: 'bg-gradient-to-br from-emerald-500 to-emerald-950' },
    { id: 'royal', label: 'Púrpura', className: 'bg-gradient-to-br from-purple-500 to-purple-950', swatch: 'bg-gradient-to-br from-purple-500 to-purple-950' },
    { id: 'inferno', label: 'Inferno', className: 'bg-gradient-to-br from-orange-500 via-red-600 to-black', swatch: 'bg-gradient-to-br from-orange-500 via-red-600 to-black' },
];

// ============ Preferencias persistidas ============

interface CountdownPrefs {
    source: 'assigned' | 'aep' | 'custom';
    themeId: string;
    aep?: { name: string; date: string; location?: string; level?: string };
    custom?: { name: string; date: string };
}

const DEFAULT_PREFS: CountdownPrefs = { source: 'assigned', themeId: 'auto' };

function loadPrefs(storageKey: string): CountdownPrefs {
    try {
        const raw = localStorage.getItem(storageKey);
        if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
    } catch { /* corrupted prefs -> defaults */ }
    return DEFAULT_PREFS;
}

// ============ Widget principal ============

interface CountdownWidgetProps {
    /** Competición asignada por el coach (si existe) */
    assigned?: { name: string; date: string; location?: string; level?: string } | null;
    /** Clave única por usuario para persistir preferencias */
    userId: string;
}

/**
 * MISMA CUADRÍCULA QUE EL RESTO DE TARJETAS.
 *
 * Este widget se maquetaba por su cuenta: `rounded-[2rem]` donde todo lo demás
 * usa `rounded-card`, `#252525` a pelo en vez de `bg-surface-raised`, un
 * `shadow-xl` que ninguna otra tarjeta lleva y un relleno de 24-32px frente a
 * los 16-20 del resto. Puesto al lado de las demás en el inicio, se leía como
 * un bloque más grande y desalineado aunque ocupara exactamente el mismo
 * ancho: lo que rompía la rejilla no era la anchura, era la geometría.
 *
 * El color SÍ se conserva: el degradado por nivel de competición es
 * intencionado y el atleta puede elegirlo. Lo que se normaliza es la caja.
 *
 * También desaparece la prop `mobile`, que solo se llamaba con `false` y
 * mantenía dos variantes del mismo bloque. Ahora es un único árbol responsive.
 */
export function CountdownWidget({ assigned, userId }: CountdownWidgetProps) {
    const storageKey = `countdown_prefs_${userId}`;
    
        const [prefs, setPrefs] = useState<CountdownPrefs>(() => loadPrefs(storageKey));
    const [settingsOpen, setSettingsOpen] = useState(false);

    const savePrefs = (next: CountdownPrefs) => {
        setPrefs(next);
        try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* quota */ }
    };

    // Resolver el evento activo según la fuente elegida
    const event = useMemo(() => {
        if (prefs.source === 'aep' && prefs.aep?.date) return prefs.aep;
        if (prefs.source === 'custom' && prefs.custom?.date) return { ...prefs.custom, location: undefined, level: undefined };
        return assigned || null;
    }, [prefs, assigned]);
    
    // GUARDAR EN NATIVO PARA EL WIDGET
    useEffect(() => {
        if (event && event.name && event.date) {
            Preferences.set({ key: 'widget_comp_name', value: event.name }).catch(console.error);
            Preferences.set({ key: 'widget_comp_date', value: event.date }).catch(console.error);
        } else {
            Preferences.remove({ key: 'widget_comp_name' }).catch(console.error);
            Preferences.remove({ key: 'widget_comp_date' }).catch(console.error);
        }
    }, [event]);

    /*
     * Si el evento elegido ya pasó (más de un día), se vuelve a la convocatoria
     * asignada.
     *
     * ESTE SÍ ES UN EFECTO LEGÍTIMO, y por eso lleva la regla desactivada en
     * vez de convertirse en un ajuste durante el render: `savePrefs` escribe
     * en `localStorage`, que es un sistema externo. Un ajuste durante el render
     * se ejecutaría también en los intentos de render que React descarta, y
     * eso son escrituras al disco que nadie ha pedido. Sincronizar un sistema
     * externo con el estado es literalmente para lo que existen los efectos.
     *
     * El coste —un render de más— se paga una vez, el día siguiente a una
     * competición, y no en cada interacción.
     */
    useEffect(() => {
        if (!event || prefs.source === 'assigned') return;
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        if (new Date(event.date + 'T00:00:00') < yesterday) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            savePrefs({ ...prefs, source: 'assigned' });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [event?.date]);

    const theme = COUNTDOWN_THEMES.find(t => t.id === prefs.themeId) || COUNTDOWN_THEMES[0];
    const colorClass = theme.id === 'auto' ? getCompetitionColorClass(event?.level) : theme.className;

    if (!event) {
        return (
            <div className="relative flex h-full min-h-[160px] flex-col items-center justify-center overflow-hidden rounded-card border border-[var(--border-default)] bg-surface-raised p-5 text-center md:p-6">
                <Trophy size={32} className="text-ink-faint mb-3" />
                <h3 className="text-sm font-bold text-ink-muted italic leading-tight mb-1">No hay competiciones a la vista.</h3>
                <button
                    onClick={() => setSettingsOpen(true)}
                    className="text-xs text-brand-text font-bold mt-2 uppercase tracking-wider hover:text-ink transition-colors"
                >
                    Elegir del calendario AEP →
                </button>
                <CountdownSettings
                    isOpen={settingsOpen}
                    onClose={() => setSettingsOpen(false)}
                    prefs={prefs}
                    onSave={savePrefs}
                    hasAssigned={!!assigned}
                />
            </div>
        );
    }

    return (
        <div className={`${colorClass} relative flex h-full min-h-[160px] flex-col items-center justify-center overflow-hidden rounded-card p-5 text-center text-ink md:p-6`}>
            <div className="pointer-events-none absolute -mr-24 -mt-24 right-0 top-0 h-56 w-56 rounded-full bg-white/10"></div>

            {/* Botón de ajustes */}
            <button
                onClick={() => setSettingsOpen(true)}
                className="absolute top-3 right-3 z-20 p-2 bg-black/20 hover:bg-black/40 rounded-full text-ink-muted hover:text-ink transition-colors"
                aria-label="Personalizar contador"
            >
                <Settings size={16} />
            </button>

            <div className="relative z-10 flex flex-col items-center w-full">
                <div className="flex items-center justify-center gap-2 text-white/80 font-bold text-t-2xs md:text-xs uppercase tracking-widest mb-2">
                    <Trophy size={14} /> {prefs.source === 'custom' ? 'TU OBJETIVO' : prefs.source === 'aep' ? 'CALENDARIO AEP' : 'TU PRÓXIMO RETO'}
                </div>
                <h3 className="mb-2 text-t-xl font-black uppercase italic leading-tight drop-shadow-lg md:text-t-2xl">
                    {formatCompetitionName(event.name, event.location, event.level)}
                </h3>
                {event.location && (
                    <div className="mt-1 flex items-center justify-center gap-2 text-white/90 font-bold text-xs">
                        <MapPin size={12} /> {event.location}
                    </div>
                )}
                <div className="mt-4 w-full max-w-xl bg-black/10 rounded-2xl pb-2 px-2 border border-subtle flex justify-center">
                    <LiveCountdown targetDate={event.date} />
                </div>
            </div>

            <CountdownSettings
                isOpen={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                prefs={prefs}
                onSave={savePrefs}
                hasAssigned={!!assigned}
            />
        </div>
    );
}

// ============ Panel de ajustes ============

function CountdownSettings({
    isOpen,
    onClose,
    prefs,
    onSave,
    hasAssigned
}: {
    isOpen: boolean;
    onClose: () => void;
    prefs: CountdownPrefs;
    onSave: (p: CountdownPrefs) => void;
    hasAssigned: boolean;
}) {
    const [draft, setDraft] = useState<CountdownPrefs>(prefs);

    // Ajuste durante el render en vez de un efecto. Ademas arregla un fallo
    // real: el efecto dependia de `prefs`, que es un objeto nuevo en cada
    // render del padre, asi que se reejecutaba sin parar y PISABA el borrador
    // mientras se tocaban los ajustes. Mirando solo la apertura, el borrador
    // se toma una vez, al abrir.
    const [abiertoAntes, setAbiertoAntes] = useState(isOpen);
    if (abiertoAntes !== isOpen) {
        setAbiertoAntes(isOpen);
        if (isOpen) setDraft(prefs);
    }

    /*
     * El calendario de la AEP, por consulta.
     *
     * El efecto que había dependía de `aepCompetitions.length` y de
     * `loadingAep`, o sea de su propio resultado, y se protegía con una
     * guarda al principio para no repetirse. Es el patrón que `enabled` y la
     * caché hacen innecesario: se pide una vez, se guarda, y al volver a la
     * pestaña ya está.
     */
    const { data: aepCompetitions = [], isPending: loadingAep, isError: aepFallo } = useQuery({
        queryKey: ['calendario-aep'],
        queryFn: () => fetchCompetitions().then(comps => comps.filter(c => c.dateIso)),
        enabled: isOpen && draft.source === 'aep',
        // El calendario federativo se publica una vez y cambia poco.
        staleTime: 1000 * 60 * 60,
    });
    const aepError = aepFallo ? 'No se pudo cargar el calendario AEP. Inténtalo más tarde.' : null;

    const handleSave = () => {
        onSave(draft);
        onClose();
    };

    if (!isOpen) return null;

    const sourceTabs: { id: CountdownPrefs['source']; label: string; disabled?: boolean }[] = [
        { id: 'assigned', label: 'Mi convocatoria', disabled: !hasAssigned },
        { id: 'aep', label: 'Calendario AEP' },
        { id: 'custom', label: 'Personalizado' },
    ];

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center p-0 md:p-4" onClick={(e) => e.stopPropagation()}>
                <m.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                />
                <m.div
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 40 }}
                    className="relative bg-surface-canvas w-full md:max-w-lg rounded-t-3xl md:rounded-2xl border border-line shadow-2xl flex flex-col max-h-[85vh] text-left"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between p-5 border-b border-subtle shrink-0">
                        <h2 className="text-lg font-black uppercase text-ink flex items-center gap-2">
                            <Settings className="text-brand-text" size={18} /> Personalizar contador
                        </h2>
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-ink-muted hover:text-ink transition-colors">
                            <X size={18} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-5 space-y-6">
                        {/* Fuente del evento */}
                        <div>
                            <p className="text-t-2xs font-black uppercase tracking-[0.2em] text-ink-subtle mb-3">¿A qué cuenta atrás?</p>
                            <div className="grid grid-cols-3 gap-2">
                                {sourceTabs.map(tab => (
                                    <button
                                        key={tab.id}
                                        disabled={tab.disabled}
                                        onClick={() => setDraft({ ...draft, source: tab.id })}
                                        className={`py-2.5 px-2 rounded-xl text-t-2xs font-black uppercase tracking-wide transition-colors border ${
 draft.source === tab.id
 ? 'bg-brand border-brand text-ink'
 : 'bg-surface-raised border-subtle text-ink-muted hover:text-ink hover:border-strong'
 } disabled:opacity-30 disabled:cursor-not-allowed`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Lista AEP */}
                        {draft.source === 'aep' && (
                            <div>
                                <p className="text-t-2xs font-black uppercase tracking-[0.2em] text-ink-subtle mb-3">Calendario oficial AEP</p>
                                {loadingAep ? (
                                    <div className="flex justify-center py-8"><Loader className="animate-spin text-brand-text" size={24} /></div>
                                ) : aepError ? (
                                    <p className="text-sm text-danger-text py-4">{aepError}</p>
                                ) : (
                                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                                        {aepCompetitions.map((comp, i) => {
                                            const isSelected = draft.aep?.name === comp.campeonato && draft.aep?.date === comp.dateIso;
                                            return (
                                                <button
                                                    key={i}
                                                    onClick={() => setDraft({
                                                        ...draft,
                                                        aep: { name: comp.campeonato, date: comp.dateIso!, location: comp.sede, level: comp.level }
                                                    })}
                                                    className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
 isSelected
 ? 'bg-brand/10 border-brand'
 : 'bg-surface-raised border-subtle hover:border-strong'
 }`}
                                                >
                                                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${isSelected ? 'bg-brand border-brand' : 'border-gray-600'}`}>
                                                        {isSelected && <Check size={10} className="text-ink" />}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-sm font-bold text-ink truncate">{comp.campeonato}</p>
                                                        <p className="text-t-2xs text-ink-subtle font-bold flex items-center gap-2">
                                                            <span className="flex items-center gap-1"><Calendar size={10} /> {comp.fecha}</span>
                                                            <span className="flex items-center gap-1 truncate"><MapPin size={10} /> {comp.sede}</span>
                                                        </p>
                                                    </div>
                                                    <span className="text-t-2xs font-black uppercase px-2 py-0.5 rounded bg-white/5 text-ink-muted shrink-0">{comp.level}</span>
                                                </button>
                                            );
                                        })}
                                        {aepCompetitions.length === 0 && (
                                            <p className="text-sm text-ink-subtle py-4 text-center">No hay competiciones próximas en el calendario.</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Evento personalizado */}
                        {draft.source === 'custom' && (
                            <div className="space-y-3">
                                <p className="text-t-2xs font-black uppercase tracking-[0.2em] text-ink-subtle">Tu propio objetivo</p>
                                <div className="relative">
                                    <Flag className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" size={16} />
                                    <input
                                        type="text"
                                        placeholder="Nombre (ej: Mock meet, Test de fuerza...)"
                                        maxLength={60}
                                        value={draft.custom?.name || ''}
                                        onChange={(e) => setDraft({ ...draft, custom: { name: e.target.value, date: draft.custom?.date || '' } })}
                                        className="w-full bg-surface-sunken border border-line rounded-xl py-3 pl-10 pr-4 text-ink text-sm focus:border-brand/50 transition-colors"
                                    />
                                </div>
                                <div className="relative">
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" size={16} />
                                    <input
                                        type="date"
                                        min={new Date().toISOString().split('T')[0]}
                                        value={draft.custom?.date || ''}
                                        onChange={(e) => setDraft({ ...draft, custom: { name: draft.custom?.name || '', date: e.target.value } })}
                                        className="w-full bg-surface-sunken border border-line rounded-xl py-3 pl-10 pr-4 text-ink text-sm focus:border-brand/50 transition-colors [color-scheme:dark]"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Temas */}
                        <div>
                            <p className="text-t-2xs font-black uppercase tracking-[0.2em] text-ink-subtle mb-3">Estilo</p>
                            <div className="grid grid-cols-4 gap-3">
                                {COUNTDOWN_THEMES.map(theme => (
                                    <button
                                        key={theme.id}
                                        onClick={() => setDraft({ ...draft, themeId: theme.id })}
                                        className="flex flex-col items-center gap-1.5 group"
                                    >
                                        <div className={`w-full aspect-square rounded-xl ${theme.swatch} border-2 transition-[border-color,box-shadow,transform] ${
 draft.themeId === theme.id ? 'border-white scale-105 shadow-lg' : 'border-transparent group-hover:border-white/30'
 } flex items-center justify-center`}>
                                            {draft.themeId === theme.id && <Check size={16} className="text-ink drop-shadow" />}
                                        </div>
                                        <span className={`text-t-2xs font-bold uppercase tracking-wide text-center leading-tight ${draft.themeId === theme.id ? 'text-ink' : 'text-ink-subtle'}`}>
                                            {theme.label}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="p-5 border-t border-subtle shrink-0 flex justify-end gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-ink font-bold uppercase tracking-wider text-xs transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={
                                (draft.source === 'aep' && !draft.aep) ||
                                (draft.source === 'custom' && (!draft.custom?.name || !draft.custom?.date))
                            }
                            className="px-6 py-2.5 rounded-lg bg-brand hover:bg-red-700 text-ink font-black uppercase tracking-wider text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Guardar
                        </button>
                    </div>
                </m.div>
            </div>
        </AnimatePresence>
    );
}




