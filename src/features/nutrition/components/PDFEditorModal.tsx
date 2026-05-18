import React, { useState, useRef } from 'react';
import { X, Download, Palette, Type, Image, LayoutTemplate, Loader2, Sparkles } from 'lucide-react';
import { NutritionPlan } from '../../../types/nutrition';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface PDFSettings {
    accentColor: string;
    bgColor: string;
    textColor: string;
    fontFamily: string;
    showLogo: boolean;
    logoUrl: string;
    clubName: string;
    layout: 'classic' | 'modern' | 'minimal';
    showMacroBar: boolean;
    showAlternatives: boolean;
    footerText: string;
}

const DEFAULT: PDFSettings = {
    accentColor: '#e11d48',
    bgColor: '#ffffff',
    textColor: '#111111',
    fontFamily: 'Inter, sans-serif',
    clubName: 'ANVIL POWER CLUB',
    showLogo: false,
    logoUrl: '',
    layout: 'modern',
    showMacroBar: true,
    showAlternatives: true,
    footerText: '',
};

const FONTS = [
    { label: 'Inter', value: 'Inter, sans-serif' },
    { label: 'Arial', value: 'Arial, sans-serif' },
    { label: 'Georgia', value: 'Georgia, serif' },
    { label: 'Courier', value: '"Courier New", monospace' },
    { label: 'Verdana', value: 'Verdana, sans-serif' },
];

const PRESETS = [
    { label: 'Anvil Dark', accent: '#e11d48', bg: '#1c1c1c', text: '#ffffff' },
    { label: 'Clásico Blanco', accent: '#e11d48', bg: '#ffffff', text: '#111111' },
    { label: 'Azul Pro', accent: '#3b82f6', bg: '#ffffff', text: '#1e293b' },
    { label: 'Verde Salud', accent: '#22c55e', bg: '#f0fdf4', text: '#14532d' },
    { label: 'Naranja Energy', accent: '#f97316', bg: '#fff7ed', text: '#431407' },
];

interface Props { plan: NutritionPlan; onClose: () => void; }

export function PDFEditorModal({ plan, onClose }: Props) {
    const [settings, setSettings] = useState<PDFSettings>(() => {
        const saved = localStorage.getItem('anvil_pdf_settings');
        return saved ? { ...DEFAULT, ...JSON.parse(saved) } : DEFAULT;
    });
    const [activeTab, setActiveTab] = useState<'colors' | 'fonts' | 'image' | 'layout' | 'ai'>('colors');
    const [isGenerating, setIsGenerating] = useState(false);
    const [pdfFileName, setPdfFileName] = useState('Plan_Nutricional');
    const printRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Auto-contrast: detect if bg is light or dark and set text accordingly
    const getLuminance = (hex: string) => {
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        return 0.299 * r + 0.587 * g + 0.114 * b;
    };

    const update = (patch: Partial<PDFSettings>) => {
        const next = { ...settings, ...patch };
        // Auto-contrast when changing bgColor
        if (patch.bgColor && !patch.textColor) {
            next.textColor = getLuminance(patch.bgColor) > 0.5 ? '#111111' : '#ffffff';
        }
        setSettings(next);
        localStorage.setItem('anvil_pdf_settings', JSON.stringify(next));
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
            // Multi-page support — avoid trailing blank page
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
            const safeName = (pdfFileName.trim() || 'Plan_Nutricional').replace(/\s+/g, '_');
            pdf.save(`${safeName}.pdf`);
            // Close modal after download
            setTimeout(() => onClose(), 500);
        } catch (err) {
            console.error('Error generating PDF:', err);
        } finally {
            setIsGenerating(false);
        }
    };

    const meals = plan.meals || [];
    const s = settings;
    const isDark = s.bgColor !== '#ffffff' && s.bgColor !== '#f0fdf4' && s.bgColor !== '#fff7ed';

    const groupFoods = (foods: any[]) => {
        const groups: Record<string, { groupId: string, category: string, items: any[] }> = {};
        foods.forEach(mf => {
            const gid = mf.alternative_group_id || mf.id;
            if (!groups[gid]) groups[gid] = { groupId: gid, category: mf.category || 'Otros', items: [] };
            groups[gid].items.push(mf);
        });
        
        const catCounts: Record<string, number> = {};
        const values = Object.values(groups);
        
        values.forEach(g => {
            catCounts[g.category] = (catCounts[g.category] || 0) + 1;
        });

        const currentCounts: Record<string, number> = {};
        return {
            totalCounts: catCounts,
            grouped: values.map(g => {
                currentCounts[g.category] = (currentCounts[g.category] || 0) + 1;
                return { ...g, catIndex: currentCounts[g.category] };
            })
        };
    };

    return (
        <div className="fixed inset-0 z-[9999] flex bg-black/80 backdrop-blur-sm">
            {/* Left: Settings Panel */}
            <div className="w-80 bg-[#111] border-r border-zinc-800 flex flex-col h-full overflow-hidden shrink-0">
                <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
                    <h2 className="text-white font-black uppercase text-sm tracking-wider">Editor PDF</h2>
                    <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={20} /></button>
                </div>

                {/* Tabs */}
                <div className="flex flex-wrap border-b border-zinc-800">
                    {([['colors', Palette, 'Color'], ['fonts', Type, 'Fuente'], ['image', Image, 'Logo'], ['layout', LayoutTemplate, 'Layout'], ['ai', Sparkles, 'IA']] as const).map(([key, Icon, label]) => (
                        <button key={key} onClick={() => setActiveTab(key)} className={`flex-1 min-w-[56px] py-2.5 text-[10px] font-black tracking-widest uppercase flex flex-col items-center gap-1 transition-colors ${activeTab === key ? 'text-anvil-red bg-zinc-800/50 border-b-2 border-anvil-red' : 'text-zinc-500 hover:text-white'}`}>
                            <Icon size={16} />{label}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
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
                                        <div className="w-4 h-4 rounded-full" style={{ background: p.text }} />
                                    </div>
                                    <span className="text-white text-xs font-bold">{p.label}</span>
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-zinc-500 uppercase font-bold mt-4">Personalizado</p>
                        {[['Acento', 'accentColor'], ['Fondo', 'bgColor'], ['Texto', 'textColor']].map(([label, key]) => (
                            <div key={key} className="flex items-center gap-3">
                                <input type="color" value={(s as any)[key]} onChange={e => update({ [key]: e.target.value })} className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent" />
                                <span className="text-zinc-300 text-sm">{label}</span>
                            </div>
                        ))}
                    </>)}

                    {activeTab === 'fonts' && (<>
                        <p className="text-xs text-zinc-500 uppercase font-bold">Tipografía</p>
                        {FONTS.map(f => (
                            <button key={f.value} onClick={() => update({ fontFamily: f.value })}
                                className={`w-full text-left p-3 rounded-lg border transition-colors ${s.fontFamily === f.value ? 'border-anvil-red bg-anvil-red/10 text-white' : 'border-zinc-800 text-zinc-400 hover:text-white'}`}
                                style={{ fontFamily: f.value }}>
                                {f.label} — Aa Bb 123
                            </button>
                        ))}
                        <p className="text-xs text-zinc-500 uppercase font-bold mt-4">Nombre del Club</p>
                        <input type="text" value={s.clubName} onChange={e => update({ clubName: e.target.value })}
                            className="w-full bg-zinc-900 text-white px-3 py-2 rounded border border-zinc-800 focus:border-anvil-red outline-none text-sm" />
                        <p className="text-xs text-zinc-500 uppercase font-bold mt-4">Texto de Pie</p>
                        <input type="text" value={s.footerText} onChange={e => update({ footerText: e.target.value })} placeholder="Ej. Preparado por Dr. García"
                            className="w-full bg-zinc-900 text-white px-3 py-2 rounded border border-zinc-800 focus:border-anvil-red outline-none text-sm" />
                    </>)}

                    {activeTab === 'image' && (<>
                        <p className="text-xs text-zinc-500 uppercase font-bold">Logo / Imagen de Cabecera</p>
                        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                        <button onClick={() => fileInputRef.current?.click()}
                            className="w-full py-8 border-2 border-dashed border-zinc-700 rounded-lg text-zinc-400 hover:text-white hover:border-anvil-red transition-colors text-sm text-center">
                            {s.showLogo && s.logoUrl ? 'Cambiar imagen' : 'Subir imagen'}
                        </button>
                        {s.showLogo && s.logoUrl && (
                            <div className="relative">
                                <img src={s.logoUrl} alt="Logo" className="w-full h-24 object-contain bg-zinc-900 rounded-lg p-2" />
                                <button onClick={() => update({ showLogo: false, logoUrl: '' })} className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full"><X size={12} /></button>
                            </div>
                        )}
                    </>)}

                    {activeTab === 'layout' && (<>
                        <p className="text-xs text-zinc-500 uppercase font-bold">Distribución</p>
                        {(['modern', 'classic', 'minimal'] as const).map(l => (
                            <button key={l} onClick={() => update({ layout: l })}
                                className={`w-full text-left p-3 rounded-lg border transition-colors ${s.layout === l ? 'border-anvil-red bg-anvil-red/10 text-white' : 'border-zinc-800 text-zinc-400 hover:text-white'}`}>
                                <span className="font-bold capitalize">{l}</span>
                                <span className="block text-xs text-zinc-500 mt-0.5">
                                    {l === 'modern' && 'Tabla compacta con barras de macros'}
                                    {l === 'classic' && 'Tabla tradicional con bordes'}
                                    {l === 'minimal' && 'Listado limpio sin bordes'}
                                </span>
                            </button>
                        ))}
                        <p className="text-xs text-zinc-500 uppercase font-bold mt-4">Opciones</p>
                        {[['showMacroBar', 'Barras de macros'], ['showAlternatives', 'Mostrar alternativas']].map(([key, label]) => (
                            <label key={key} className="flex items-center gap-3 cursor-pointer">
                                <input type="checkbox" checked={(s as any)[key]} onChange={e => update({ [key]: e.target.checked })} className="accent-red-500 w-4 h-4" />
                                <span className="text-zinc-300 text-sm">{label}</span>
                            </label>
                        ))}
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

                {/* Filename + Download */}
                <div className="p-4 border-t border-zinc-800 space-y-3">
                    <div>
                        <label className="block text-xs text-zinc-500 uppercase font-bold mb-1">Nombre del archivo</label>
                        <input type="text" value={pdfFileName} onChange={e => setPdfFileName(e.target.value)} placeholder="Plan_Nutricional"
                            className="w-full bg-zinc-900 text-white text-sm px-3 py-2 rounded border border-zinc-800 focus:border-anvil-red outline-none" />
                    </div>
                    <button onClick={handleDownloadPDF} disabled={isGenerating} className="w-full bg-anvil-red hover:bg-red-600 text-black font-black py-3 rounded-lg transition-colors uppercase tracking-wider flex items-center justify-center gap-2 text-sm disabled:opacity-50">
                        {isGenerating ? <><Loader2 size={18} className="animate-spin" /> Generando...</> : <><Download size={18} /> Descargar PDF</>}
                    </button>
                </div>
            </div>

            {/* Right: Live Preview */}
            <div className="flex-1 overflow-auto p-8 flex justify-center">
                <div ref={printRef} className="w-[210mm] min-h-[297mm] shadow-2xl" style={{ background: s.bgColor, color: s.textColor, fontFamily: s.fontFamily }}>
                    <style>{`
                        .pdf-accent { color: ${s.accentColor}; }
                        .pdf-accent-bg { background: ${s.accentColor}; }
                        .pdf-accent-border { border-color: ${s.accentColor}; }
                        .pdf-subtle { color: ${isDark ? '#999' : '#888'}; }
                    `}</style>

                    <div className="p-10">
                        {/* Header */}
                        <div className="text-center mb-8 pb-6" style={{ borderBottom: `3px solid ${s.accentColor}` }}>
                            {s.showLogo && s.logoUrl && <img src={s.logoUrl} alt="Logo" className="pdf-logo" style={{ maxHeight: '60px', maxWidth: '200px', display: 'block', margin: '0 auto 12px auto', objectFit: 'contain' }} />}
                            <h1 className="text-3xl font-black uppercase tracking-widest">{s.clubName}</h1>
                            <p className="pdf-subtle text-sm uppercase tracking-wider mt-1">Plan Nutricional Personalizado</p>
                            {plan.tags && plan.tags.length > 0 && (
                                <div className="flex justify-center gap-2 mt-3">
                                    {plan.tags.map((tag, i) => (
                                        <span key={i} className="pdf-accent-bg text-xs font-bold px-3 py-1 rounded-full uppercase" style={{ color: s.bgColor }}>{tag}</span>
                                    ))}
                                </div>
                            )}
                            {plan.training_block_id && <p className="pdf-subtle text-xs mt-2">Bloque: <strong style={{ color: s.textColor }}>{plan.training_block_id}</strong></p>}
                        </div>

                        {/* Macros */}
                        <div className="grid grid-cols-4 gap-3 mb-8">
                            {[
                                ['Calorías', plan.calories_target, 'kcal'],
                                ['Proteína', plan.protein_target, 'g'],
                                ['Carbos', plan.carbs_target, 'g'],
                                ['Grasas', plan.fats_target, 'g'],
                            ].map(([label, val, unit], i) => (
                                <div key={i} className="text-center p-3 rounded-lg" style={{ border: `1px solid ${isDark ? '#333' : '#ddd'}` }}>
                                    <p className="pdf-subtle text-xs uppercase font-bold">{label as string}</p>
                                    <p className="text-2xl font-black pdf-accent">{val as number}<span className="text-xs pdf-subtle ml-0.5">{unit as string}</span></p>
                                </div>
                            ))}
                        </div>

                        {/* Guidelines */}
                        {plan.general_guidelines && plan.general_guidelines.length > 0 && (
                            <div className="mb-6 p-4 rounded-lg" style={{ background: isDark ? '#222' : '#f5f5f5', border: `1px solid ${isDark ? '#333' : '#e5e5e5'}` }}>
                                <p className="text-xs font-black uppercase tracking-wider mb-2 pdf-accent">📋 Pautas Generales</p>
                                {plan.general_guidelines.map((g, i) => <p key={i} className="text-sm mb-0.5">• {g}</p>)}
                            </div>
                        )}

                        {/* Supplements */}
                        {plan.global_supplements && plan.global_supplements.length > 0 && (
                            <div className="mb-6 p-4 rounded-lg" style={{ background: isDark ? '#1a1a2e' : '#eff6ff', border: `1px solid ${isDark ? '#2a2a4e' : '#bfdbfe'}` }}>
                                <p className="text-xs font-black uppercase tracking-wider mb-2" style={{ color: '#3b82f6' }}>💊 Suplementación</p>
                                {plan.global_supplements.map((sup, i) => <p key={i} className="text-sm mb-0.5">• {sup}</p>)}
                            </div>
                        )}

                        {/* Meals */}
                        <p className="text-sm font-black uppercase tracking-wider mb-4 pb-2 pdf-accent" style={{ borderBottom: `2px solid ${s.accentColor}` }}>
                            Distribución de Comidas
                        </p>

                        {meals.sort((a, b) => a.order_index - b.order_index).map(meal => {
                            const foods = meal.foods || [];
                            const { grouped, totalCounts } = groupFoods(foods);
                            const totals = foods.reduce((acc, mf) => {
                                if (!mf.food) return acc;
                                const m = mf.amount_g / 100;
                                return { kcal: acc.kcal + mf.food['energy-kcal_100g'] * m, prot: acc.prot + mf.food.proteins_100g * m, carbs: acc.carbs + mf.food.carbohydrates_100g * m, fats: acc.fats + mf.food.fat_100g * m };
                            }, { kcal: 0, prot: 0, carbs: 0, fats: 0 });

                            return (
                                <div key={meal.id} className="mb-5" style={{ breakInside: 'avoid' }}>
                                    <div className="flex justify-between items-center py-2 px-3 rounded-t" style={{ background: s.accentColor, color: s.bgColor }}>
                                        <span className="font-black uppercase text-sm">{meal.name}</span>
                                        <span className="text-xs font-bold">{Math.round(totals.kcal)} kcal · {Math.round(totals.prot)}P · {Math.round(totals.carbs)}HC · {Math.round(totals.fats)}G</span>
                                    </div>

                                    {s.layout !== 'minimal' ? (
                                        <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr style={{ background: isDark ? '#222' : '#f5f5f5' }}>
                                                    {['Alimento', 'g', 'Kcal', 'P', 'HC', 'G'].map(h => (
                                                        <th key={h} className="text-xs pdf-subtle uppercase font-bold px-2 py-1.5 text-left" style={{ borderBottom: `1px solid ${isDark ? '#333' : '#ddd'}` }}>{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {grouped.map(group => (
                                                    <React.Fragment key={group.groupId}>
                                                        {/* Category Header Row */}
                                                        <tr style={{ background: isDark ? '#111' : '#e5e5e5' }}>
                                                            <td colSpan={6} className="px-2 py-1 text-[10px] font-black uppercase tracking-wider" style={{ color: s.accentColor, borderBottom: `1px solid ${isDark ? '#333' : '#ddd'}` }}>
                                                                {group.category} {totalCounts[group.category] > 1 ? `(OPCIÓN ${group.catIndex})` : ''}
                                                                {group.items.length > 1 && <span style={{ color: '#22c55e', marginLeft: '8px' }}>— ELIGE 1 OPCIÓN</span>}
                                                            </td>
                                                        </tr>
                                                        {group.items.map((mf: any, idx: number) => {
                                                            if (!mf.food) return null;
                                                            if (idx > 0 && !s.showAlternatives) return null;
                                                            const m = mf.amount_g / 100;
                                                            return (
                                                                <tr key={mf.id} style={{ borderBottom: `1px solid ${isDark ? '#262626' : '#eee'}`, background: idx > 0 ? (isDark ? '#1a2e1a' : '#f0fdf4') : 'transparent' }}>
                                                                    <td className="px-2 py-1.5 pl-4">{idx > 0 ? <span style={{ color: '#22c55e', fontWeight: 'bold' }}>ó </span> : ''}{mf.food.product_name}</td>
                                                                    <td className="px-2 py-1.5">{mf.amount_g}</td>
                                                                    <td className="px-2 py-1.5">{Math.round(mf.food['energy-kcal_100g'] * m)}</td>
                                                                    <td className="px-2 py-1.5" style={{ color: '#3b82f6' }}>{Math.round(mf.food.proteins_100g * m)}</td>
                                                                    <td className="px-2 py-1.5" style={{ color: '#eab308' }}>{Math.round(mf.food.carbohydrates_100g * m)}</td>
                                                                    <td className="px-2 py-1.5" style={{ color: '#f97316' }}>{Math.round(mf.food.fat_100g * m)}</td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </React.Fragment>
                                                ))}
                                            </tbody>
                                        </table>
                                    ) : (
                                        <div className="px-2 py-2 space-y-2">
                                            {grouped.map(group => (
                                                <div key={group.groupId}>
                                                    <div className="text-[10px] font-black uppercase tracking-wider mb-1" style={{ color: s.accentColor }}>
                                                        {group.category} {totalCounts[group.category] > 1 ? `(OPCIÓN ${group.catIndex})` : ''}
                                                        {group.items.length > 1 && <span style={{ color: '#22c55e', marginLeft: '4px' }}>— ELIGE 1 OPCIÓN</span>}
                                                    </div>
                                                    {group.items.map((mf: any, idx: number) => {
                                                        if (!mf.food || (idx > 0 && !s.showAlternatives)) return null;
                                                        const m = mf.amount_g / 100;
                                                        return (
                                                            <div key={mf.id} className="flex justify-between text-sm py-0.5 pl-2">
                                                                <span>{idx > 0 ? <span style={{ color: '#22c55e', fontWeight: 'bold' }}>ó </span> : ''}{mf.food.product_name} — {mf.amount_g}g</span>
                                                                <span className="pdf-subtle">{Math.round(mf.food['energy-kcal_100g'] * m)} kcal</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {s.showMacroBar && totals.kcal > 0 && (
                                        <div className="flex h-1.5 rounded-b overflow-hidden">
                                            <div style={{ width: `${(totals.prot * 4 / ((totals.prot * 4) + (totals.carbs * 4) + (totals.fats * 9))) * 100}%`, background: '#3b82f6' }} />
                                            <div style={{ width: `${(totals.carbs * 4 / ((totals.prot * 4) + (totals.carbs * 4) + (totals.fats * 9))) * 100}%`, background: '#eab308' }} />
                                            <div style={{ width: `${(totals.fats * 9 / ((totals.prot * 4) + (totals.carbs * 4) + (totals.fats * 9))) * 100}%`, background: '#f97316' }} />
                                        </div>
                                    )}

                                    {meal.meal_supplements && meal.meal_supplements.length > 0 && (
                                        <p className="text-xs px-2 py-1" style={{ color: '#3b82f6' }}>💊 {meal.meal_supplements.join(' · ')}</p>
                                    )}
                                </div>
                            );
                        })}

                        {/* Footer */}
                        <div className="mt-10 pt-4 text-center text-xs pdf-subtle" style={{ borderTop: `1px solid ${isDark ? '#333' : '#ddd'}` }}>
                            {s.footerText && <p className="mb-1">{s.footerText}</p>}
                            <p>Generado por <strong>{s.clubName}</strong> — {new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
