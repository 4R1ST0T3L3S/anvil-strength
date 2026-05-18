import React, { useState, useRef } from 'react';
import { X, Download, Palette, Type, Image, Loader2, LayoutTemplate, Sparkles } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { TrainingBlock, TrainingSession, SessionExercise, TrainingSet, ExerciseLibrary } from '../../../types/training';

// Extended types for rendering
interface ExtendedSessionExercise extends Omit<SessionExercise, 'exercise'> {
    exercise?: ExerciseLibrary | { name: string };
    sets: TrainingSet[];
}
interface ExtendedSession extends Omit<TrainingSession, 'exercises'> {
    exercises: ExtendedSessionExercise[];
}
interface FullBlockData extends Omit<TrainingBlock, 'sessions'> {
    sessions: ExtendedSession[];
}

interface Props {
    block: FullBlockData;
    weekNumber: number;
    weekName?: string;
    athleteName?: string;
    onClose: () => void;
}

interface PDFSettings {
    clubName: string;
    accentColor: string;
    bgColor: string;
    textColor: string;
    fontFamily: string;
    showLogo: boolean;
    logoUrl: string | null;
    borderRadius: number;
    tablePadding: 'compact' | 'normal' | 'relaxed';
}

const DEFAULT: PDFSettings = {
    clubName: 'ANVIL POWER CLUB',
    accentColor: '#ef4444',
    bgColor: '#111111',
    textColor: '#ffffff',
    fontFamily: 'Inter',
    showLogo: false,
    logoUrl: null,
    borderRadius: 8,
    tablePadding: 'normal',
};

const PRESETS = [
    { label: 'Anvil Dark', bg: '#111111', accent: '#ef4444', text: '#ffffff' },
    { label: 'Clean White', bg: '#ffffff', accent: '#000000', text: '#111111' },
    { label: 'Slate Blue', bg: '#0f172a', accent: '#3b82f6', text: '#ffffff' },
];

export function TrainingPDFEditorModal({ block, weekNumber, weekName, athleteName = 'Atleta', onClose }: Props) {
    const [settings, setSettings] = useState<PDFSettings>(() => {
        const saved = localStorage.getItem('anvil_training_pdf_settings');
        return saved ? { ...DEFAULT, ...JSON.parse(saved) } : DEFAULT;
    });
    const [activeTab, setActiveTab] = useState<'colors' | 'fonts' | 'image' | 'advanced' | 'ai'>('colors');
    const [isGenerating, setIsGenerating] = useState(false);
    const [pdfFileName, setPdfFileName] = useState(`Semana_${weekNumber}_${athleteName.replace(/\\s+/g, '_')}`);
    const printRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const getLuminance = (hex: string) => {
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        return 0.299 * r + 0.587 * g + 0.114 * b;
    };

    const update = (patch: Partial<PDFSettings>) => {
        const next = { ...settings, ...patch };
        if (patch.bgColor && !patch.textColor) {
            next.textColor = getLuminance(patch.bgColor) > 0.5 ? '#111111' : '#ffffff';
        }
        setSettings(next);
        localStorage.setItem('anvil_training_pdf_settings', JSON.stringify(next));
    };

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => update({ logoUrl: ev.target?.result as string, showLogo: true });
        reader.readAsDataURL(file);
    };

    const handleDownloadPDF = async () => {
        const content = printRef.current;
        if (!content || isGenerating) return;
        setIsGenerating(true);
        try {
            const canvas = await html2canvas(content, {
                scale: 2,
                useCORS: true,
                backgroundColor: settings.bgColor,
                logging: false,
            });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pdfW = pdf.internal.pageSize.getWidth();
            const pdfH = pdf.internal.pageSize.getHeight();
            const imgW = canvas.width;
            const imgH = canvas.height;
            const ratio = pdfW / imgW;
            const scaledH = imgH * ratio;
            
            let position = 0;
            if (scaledH <= pdfH) {
                pdf.addImage(imgData, 'PNG', 0, 0, pdfW, scaledH);
            } else {
                let remaining = scaledH;
                let first = true;
                while (remaining > 0) {
                    if (!first) pdf.addPage();
                    pdf.addImage(imgData, 'PNG', 0, position, pdfW, scaledH);
                    remaining -= pdfH;
                    position -= pdfH;
                    first = false;
                }
            }
            const safeName = (pdfFileName.trim() || 'Plan_Entrenamiento').replace(/\\s+/g, '_');
            pdf.save(`${safeName}.pdf`);
            setTimeout(() => onClose(), 500);
        } catch (err) {
            console.error('Error generating PDF:', err);
        } finally {
            setIsGenerating(false);
        }
    };

    const s = settings;
    const isDark = s.bgColor !== '#ffffff' && s.bgColor !== '#f0fdf4' && s.bgColor !== '#fff7ed';

    // Filter sessions for the selected week
    const weekSessions = block.sessions.filter(session => session.week_number === weekNumber).sort((a, b) => a.day_number - b.day_number);

    const getSetsSummary = (sets: TrainingSet[], field: keyof TrainingSet) => {
        const vals = sets.map(set => set[field]).filter(v => v !== null && v !== undefined && v !== '');
        if (vals.length === 0) return '-';
        const allSame = vals.every(v => v === vals[0]);
        if (allSame && field === 'target_reps' && sets.length > 0) return `${sets.length} x ${vals[0]}`;
        if (allSame) return String(vals[0]);
        return vals.join(' / ');
    };

    return (
        <div className="fixed inset-0 z-[9999] flex bg-black/80 backdrop-blur-sm">
            {/* Left: Settings Panel */}
            <div className="w-80 bg-[#0a0a0a] border-r border-zinc-800 flex flex-col h-full overflow-hidden shrink-0">
                <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
                    <h2 className="text-white font-black uppercase text-sm tracking-wider">Editor PDF (Entrenamiento)</h2>
                    <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={20} /></button>
                </div>

                <div className="flex flex-wrap border-b border-zinc-800">
                    {([
                        ['colors', Palette, 'Color'], 
                        ['fonts', Type, 'Fuente'], 
                        ['image', Image, 'Logo'],
                        ['advanced', LayoutTemplate, 'Estilo'],
                        ['ai', Sparkles, 'IA']
                    ] as const).map(([key, Icon, label]) => (
                        <button key={key} onClick={() => setActiveTab(key as any)} className={`flex-1 min-w-[60px] py-2.5 text-[10px] font-black tracking-widest uppercase flex flex-col items-center gap-1 transition-colors ${activeTab === key ? 'text-anvil-red bg-zinc-800/50 border-b-2 border-anvil-red' : 'text-zinc-500 hover:text-white'}`}>
                            <Icon size={16} />{label}
                        </button>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {activeTab === 'colors' && (<>
                        <p className="text-xs text-zinc-500 uppercase font-bold">Presets</p>
                        <div className="grid grid-cols-1 gap-2">
                            {PRESETS.map(p => (
                                <button key={p.label} onClick={() => update({ accentColor: p.accent, bgColor: p.bg, textColor: p.text })}
                                    className="flex items-center gap-3 bg-zinc-900 hover:bg-zinc-800 p-2.5 rounded-lg border border-zinc-800 transition-colors text-left">
                                    <div className="flex gap-1">
                                        <div className="w-4 h-4 rounded-full border border-zinc-700" style={{ background: p.bg }} />
                                        <div className="w-4 h-4 rounded-full" style={{ background: p.accent }} />
                                    </div>
                                    <span className="text-sm font-bold text-white">{p.label}</span>
                                </button>
                            ))}
                        </div>
                    </>)}
                    {activeTab === 'fonts' && (<>
                        <p className="text-xs text-zinc-500 uppercase font-bold mb-2">Nombre del Club / Entrenador</p>
                        <input type="text" value={s.clubName} onChange={e => update({ clubName: e.target.value })}
                            className="w-full bg-zinc-900 text-white text-sm px-3 py-2 rounded border border-zinc-800 focus:border-anvil-red outline-none" />
                        <p className="text-xs text-zinc-500 uppercase font-bold mt-4 mb-2">Tipografía Principal</p>
                        <div className="grid grid-cols-2 gap-2">
                            {['Inter', 'Roboto', 'Outfit', 'Montserrat'].map(f => (
                                <button key={f} onClick={() => update({ fontFamily: f })}
                                    className={`py-2 px-3 rounded border text-sm ${s.fontFamily === f ? 'bg-anvil-red/10 border-anvil-red text-anvil-red' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'}`}
                                    style={{ fontFamily: f }}>{f}</button>
                            ))}
                        </div>
                    </>)}
                    {activeTab === 'image' && (<>
                        <p className="text-xs text-zinc-500 uppercase font-bold mb-2">Logo de Portada</p>
                        <input type="file" ref={fileInputRef} onChange={handleLogoUpload} accept="image/*" className="hidden" />
                        <button onClick={() => fileInputRef.current?.click()} className="w-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-white py-3 rounded-lg text-sm font-bold transition-colors">
                            Subir Logo
                        </button>
                        {s.logoUrl && (
                            <div className="mt-4 relative bg-zinc-900 p-2 rounded-lg border border-zinc-800">
                                <img src={s.logoUrl} alt="Logo" className="w-full h-32 object-contain" />
                                <button onClick={() => update({ logoUrl: null, showLogo: false })} className="absolute top-1 right-1 bg-black/50 p-1 rounded-full text-white hover:bg-red-500"><X size={14} /></button>
                            </div>
                        )}
                    </>)}
                    {activeTab === 'advanced' && (<>
                        <p className="text-xs text-zinc-500 uppercase font-bold mb-2">Redondeo de Bordes (px)</p>
                        <input type="range" min="0" max="32" value={s.borderRadius} onChange={e => update({ borderRadius: parseInt(e.target.value) })}
                            className="w-full accent-anvil-red mb-2" />
                        <div className="text-right text-xs text-zinc-400 font-mono mb-4">{s.borderRadius}px</div>
                        
                        <p className="text-xs text-zinc-500 uppercase font-bold mb-2">Espaciado de Tabla</p>
                        <div className="grid grid-cols-3 gap-2">
                            {['compact', 'normal', 'relaxed'].map(pad => (
                                <button key={pad} onClick={() => update({ tablePadding: pad as any })}
                                    className={`py-2 px-1 text-[10px] font-bold uppercase rounded border transition-colors ${s.tablePadding === pad ? 'bg-anvil-red/10 border-anvil-red text-anvil-red' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'}`}>
                                    {pad}
                                </button>
                            ))}
                        </div>
                    </>)}
                    {activeTab === 'ai' && (<>
                        <div className="bg-anvil-red/5 border border-anvil-red/20 p-4 rounded-xl text-center">
                            <Sparkles className="mx-auto text-anvil-red mb-3" size={32} />
                            <h3 className="text-anvil-red font-black uppercase tracking-widest text-sm mb-2">Analizador IA</h3>
                            <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
                                Sube un PDF antiguo que tengas y nuestra IA extraerá automáticamente la paleta de colores y configuración de fuentes para replicar tu estilo exacto.
                            </p>
                            <button className="w-full bg-anvil-red hover:bg-red-600 text-black py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-colors">
                                Subir mi PDF (Próximamente)
                            </button>
                        </div>
                    </>)}
                </div>

                <div className="p-4 border-t border-zinc-800 space-y-3">
                    <div>
                        <label className="block text-xs text-zinc-500 uppercase font-bold mb-1">Nombre del archivo</label>
                        <input type="text" value={pdfFileName} onChange={e => setPdfFileName(e.target.value)} placeholder="Plan_Entrenamiento"
                            className="w-full bg-zinc-900 text-white text-sm px-3 py-2 rounded border border-zinc-800 focus:border-anvil-red outline-none" />
                    </div>
                    <button onClick={handleDownloadPDF} disabled={isGenerating} className="w-full bg-anvil-red hover:bg-red-600 text-black font-black py-3 rounded-lg transition-colors uppercase tracking-wider flex items-center justify-center gap-2 text-sm disabled:opacity-50">
                        {isGenerating ? <><Loader2 size={18} className="animate-spin" /> Generando...</> : <><Download size={18} /> Descargar PDF</>}
                    </button>
                </div>
            </div>

            {/* Right: PDF Preview (A4 ratio) */}
            <div className="flex-1 overflow-y-auto p-8 flex justify-center items-start bg-[#0a0a0a]">
                <style>{`
                    .pdf-preview * { font-family: '${s.fontFamily}', sans-serif; color: ${s.textColor}; }
                    .pdf-accent { color: ${s.accentColor} !important; }
                    .pdf-subtle { color: ${isDark ? '#888' : '#666'} !important; }
                    .pdf-page-break { page-break-before: always; break-before: page; }
                `}</style>
                
                {/* PDF Container - A4 Width (794px = 210mm at 96dpi) */}
                <div ref={printRef} className="pdf-preview w-[794px] min-h-[1123px] shadow-2xl relative flex flex-col" style={{ backgroundColor: s.bgColor }}>
                    
                    {/* Page 1: Cover */}
                    <div className="w-full h-[1123px] flex flex-col justify-center items-center p-16 text-center relative border-b-8" style={{ borderColor: s.accentColor, breakInside: 'avoid' }}>
                        {s.logoUrl && <img src={s.logoUrl} alt="Logo" className="w-48 h-48 object-contain mb-12" />}
                        <h1 className="text-4xl font-black uppercase tracking-widest mb-4" style={{ letterSpacing: '0.2em' }}>{s.clubName}</h1>
                        <div className="w-16 h-1 my-8" style={{ backgroundColor: s.accentColor, borderRadius: s.borderRadius }}></div>
                        <h2 className="text-6xl font-black uppercase italic tracking-tighter leading-none mb-6">Plan de Entrenamiento</h2>
                        <h3 className="text-3xl font-bold uppercase mb-12" style={{ color: s.accentColor }}>{block.name}</h3>
                        
                        <div className="mt-auto flex flex-col gap-4 border border-zinc-800/50 p-6 w-full max-w-md" style={{ background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', borderRadius: s.borderRadius }}>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-widest pdf-subtle mb-1">Atleta</p>
                                <p className="text-xl font-black">{athleteName}</p>
                            </div>
                            <div className="h-px w-full" style={{ background: isDark ? '#333' : '#ddd' }}></div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-widest pdf-subtle mb-1">Semana</p>
                                <p className="text-xl font-black">Semana {weekNumber} {weekName ? `- ${weekName}` : ''}</p>
                            </div>
                        </div>
                    </div>

                    {/* Pages 2+: Sessions */}
                    <div className="p-10 flex-1 w-full">
                        {weekSessions.map((session, sIdx) => {
                            const exercises = session.exercises || [];
                            return (
                                <div key={session.id} className={`mb-12 ${sIdx > 0 ? 'pdf-page-break mt-10' : ''}`} style={{ breakInside: 'avoid' }}>
                                    
                                    {/* Session Header */}
                                    <div className="flex justify-between items-end mb-6 border-b-2 pb-3" style={{ borderColor: s.accentColor }}>
                                        <div>
                                            <p className="text-xs font-bold uppercase tracking-widest pdf-subtle mb-1">Día {session.day_number}</p>
                                            <h3 className="text-2xl font-black uppercase">{session.name || `Entrenamiento Día ${session.day_number}`}</h3>
                                        </div>
                                    </div>

                                    {/* Exercises Table */}
                                    {exercises.length > 0 ? (
                                        <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr style={{ background: isDark ? '#1a1a1a' : '#f5f5f5' }}>
                                                    <th className="text-xs pdf-subtle uppercase font-bold px-3 py-2 text-left" style={{ borderBottom: `1px solid ${isDark ? '#333' : '#ddd'}` }}>Ejercicio</th>
                                                    <th className="text-xs pdf-subtle uppercase font-bold px-3 py-2 text-center" style={{ borderBottom: `1px solid ${isDark ? '#333' : '#ddd'}` }}>Series x Reps</th>
                                                    <th className="text-xs pdf-subtle uppercase font-bold px-3 py-2 text-center" style={{ borderBottom: `1px solid ${isDark ? '#333' : '#ddd'}` }}>RPE</th>
                                                    <th className="text-xs pdf-subtle uppercase font-bold px-3 py-2 text-center" style={{ borderBottom: `1px solid ${isDark ? '#333' : '#ddd'}` }}>Carga</th>
                                                    <th className="text-xs pdf-subtle uppercase font-bold px-3 py-2 text-center" style={{ borderBottom: `1px solid ${isDark ? '#333' : '#ddd'}` }}>Descanso</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {exercises.map((ex, idx) => {
                                                    const bg = idx % 2 === 0 ? 'transparent' : (isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)');
                                                    const seriesReps = getSetsSummary(ex.sets, 'target_reps');
                                                    const rpe = getSetsSummary(ex.sets, 'target_rpe');
                                                    const load = getSetsSummary(ex.sets, 'target_load');
                                                    const rest = getSetsSummary(ex.sets, 'rest_seconds');
                                                    const padY = s.tablePadding === 'compact' ? 'py-2' : (s.tablePadding === 'relaxed' ? 'py-6' : 'py-4');
                                                    
                                                    // Assert type to access modifiers
                                                    const extendedEx = ex as ExtendedSessionExercise & { modifiers?: string[] };
                                                    
                                                    return (
                                                        <tr key={ex.id} style={{ background: bg, borderBottom: `1px solid ${isDark ? '#262626' : '#eee'}` }}>
                                                            <td className={`px-3 ${padY} font-bold max-w-[200px]`}>
                                                                <span className="block">{ex.exercise?.name || 'Ejercicio'}</span>
                                                                {ex.notes && <span className="block text-[10px] font-normal pdf-subtle mt-1">{ex.notes}</span>}
                                                                {extendedEx.modifiers && extendedEx.modifiers.length > 0 && (
                                                                    <div className="mt-1 flex flex-wrap gap-1">
                                                                        {extendedEx.modifiers.map((mod, i) => (
                                                                            <span key={i} className="text-[8px] font-black tracking-widest uppercase px-1.5 py-0.5 rounded-sm border" style={{ color: s.accentColor, borderColor: s.accentColor, borderRadius: Math.min(s.borderRadius, 4) }}>{mod}</span>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td className={`px-3 ${padY} text-center font-bold`} style={{ color: s.accentColor }}>{seriesReps}</td>
                                                            <td className={`px-3 ${padY} text-center font-bold`}>{rpe}</td>
                                                            <td className={`px-3 ${padY} text-center`}>{load !== '-' ? `${load} kg` : '-'}</td>
                                                            <td className={`px-3 ${padY} text-center pdf-subtle`}>{rest !== '-' ? `${rest}s` : '-'}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    ) : (
                                        <div className="p-6 text-center border-2 border-dashed rounded-lg" style={{ borderColor: isDark ? '#333' : '#ddd' }}>
                                            <p className="pdf-subtle font-bold uppercase text-xs">No hay ejercicios asignados a este día</p>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    
                    {/* Footer for last page just in case */}
                    <div className="mt-auto py-6 text-center text-xs pdf-subtle" style={{ borderTop: `1px solid ${isDark ? '#333' : '#ddd'}` }}>
                        <p>Generado por <strong>{s.clubName}</strong> — {new Date().toLocaleDateString('es-ES')}</p>
                    </div>

                </div>
            </div>
        </div>
    );
}
