import { useState } from 'react';
import { motion, Variants } from 'framer-motion';
import { Download, BarChart3, Video, Cpu, ChevronRight, Star, Shield, Zap, MonitorDown } from 'lucide-react';

interface SoftwareApp {
    id: string;
    name: string;
    tagline: string;
    description: string;
    version: string;
    platform: string[];
    features: string[];
    downloadUrl: string;
    isAvailable: boolean;
    badge?: string;
    icon: React.ReactNode;
    accentColor: string;
}

const apps: SoftwareApp[] = [
    {
        id: 'pwr-analisis',
        name: 'PWR Análisis',
        tagline: 'Análisis Biomecánico por Visión Artificial',
        description:
            'Software de análisis de video inteligente para powerlifting. Detecta velocidad de barra, ROM, fase excéntrica/concéntrica y genera informes detallados de cada repetición automáticamente.',
        version: '1.4.2',
        platform: ['Windows'],
        features: [
            'Análisis cinemático por visión artificial',
            'Soporte para encoders VBT (ADR, Push, Vald)',
            'Detección automática de repeticiones',
            'Gráficas de velocidad, potencia y ROM',
            'Exportación de informes en PDF y CSV',
            'Modo análisis de video en tiempo diferido',
        ],
        downloadUrl: '#', // Replace with actual download URL
        isAvailable: true,
        badge: 'NUEVO',
        icon: <Video className="w-8 h-8" />,
        accentColor: '#e63946',
    },
];

const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.15 },
    },
};

const itemVariants: Variants = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.4, 0, 0.2, 1] } },
};

export function SoftwareSection() {
    const [activeApp, setActiveApp] = useState<string>(apps[0].id);

    const selected = apps.find((a) => a.id === activeApp) ?? apps[0];

    return (
        <section id="software" className="py-32 bg-[#050505] relative overflow-hidden">

            {/* Ambient glow effects */}
            <div className="absolute top-1/4 -left-40 w-[600px] h-[600px] bg-anvil-red/5 rounded-full blur-[130px] pointer-events-none" />
            <div className="absolute bottom-1/4 -right-40 w-[500px] h-[500px] bg-anvil-red/5 rounded-full blur-[110px] pointer-events-none" />

            {/* Grid pattern overlay */}
            <div
                className="absolute inset-0 pointer-events-none opacity-[0.02]"
                style={{
                    backgroundImage:
                        'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
                    backgroundSize: '80px 80px',
                }}
            />

            <div className="max-w-[1400px] mx-auto px-6 relative z-10">

                {/* Header */}
                <motion.div
                    className="text-center mb-20"
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6 }}
                >
                    <div className="inline-flex items-center gap-2 bg-anvil-red/10 border border-anvil-red/20 text-anvil-red text-[10px] font-black uppercase tracking-[0.2em] px-4 py-2 rounded-full mb-8">
                        <Cpu className="w-3.5 h-3.5" />
                        Tecnología Anvil
                    </div>
                    <h2 className="text-5xl md:text-8xl font-black tracking-[0.05em] uppercase mb-6 text-white font-bebas italic leading-[1.1] py-4">
                        Software Propio{' '}
                        <span className="text-anvil-red drop-shadow-[0_0_20px_rgba(220,38,38,0.3)]">
                            VBT
                        </span>
                    </h2>
                    <p className="text-gray-400 max-w-2xl mx-auto text-lg md:text-xl font-medium leading-relaxed">
                        Herramientas diseñadas por atletas para atletas. Tecnología de alto rendimiento.
                    </p>
                </motion.div>

                {/* App Selector (if multiple apps in the future) */}
                {apps.length > 1 && (
                    <div className="flex gap-4 justify-center mb-16 flex-wrap">
                        {apps.map((app) => (
                            <button
                                key={app.id}
                                onClick={() => setActiveApp(app.id)}
                                className={`px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all duration-500 border ${activeApp === app.id
                                    ? 'bg-anvil-red border-anvil-red text-white shadow-2xl shadow-anvil-red/30'
                                    : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white'
                                    }`}
                            >
                                {app.name}
                            </button>
                        ))}
                    </div>
                )}

                {/* Main App Card */}
                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    key={selected.id}
                    className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-stretch"
                >
                    {/* Left: App Info */}
                    <motion.div
                        variants={itemVariants}
                        className="bg-[#111111]/80 backdrop-blur-xl border border-white/5 rounded-[2.5rem] p-10 md:p-14 flex flex-col justify-between shadow-2xl"
                    >
                        {/* App Header */}
                        <div>
                            <div className="flex items-start justify-between mb-10">
                                <div className="flex items-center gap-6">
                                    <div className="w-20 h-20 bg-[#050505] border border-white/10 rounded-2xl flex items-center justify-center text-anvil-red shadow-2xl group-hover:border-anvil-red/50 transition-colors">
                                        {selected.icon}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-4 mb-2">
                                            <h3 className="text-3xl md:text-4xl font-black tracking-tight text-white uppercase font-bebas italic">
                                                {selected.name}
                                            </h3>
                                            {selected.badge && (
                                                <span className="bg-anvil-red text-white text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full animate-pulse">
                                                    {selected.badge}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-anvil-red text-xs font-black uppercase tracking-widest opacity-80">
                                            {selected.tagline}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <p className="text-gray-400 text-lg leading-relaxed mb-10 font-medium">
                                {selected.description}
                            </p>

                            {/* Features */}
                            <ul className="space-y-4 mb-12">
                                {selected.features.map((feat, i) => (
                                    <li key={i} className="flex items-start gap-4 text-sm text-gray-300 font-medium">
                                        <div className="mt-1.5 w-1.5 h-1.5 bg-anvil-red rounded-full shadow-[0_0_8px_rgba(220,38,38,0.8)] flex-shrink-0" />
                                        <span>{feat}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Meta info + Download */}
                        <div>
                            {/* Version & Platform badges */}
                            <div className="flex flex-wrap gap-4 mb-10">
                                <span className="flex items-center gap-2 bg-[#050505] border border-white/10 text-gray-300 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl">
                                    <Star className="w-3.5 h-3.5 text-yellow-400" />
                                    v{selected.version}
                                </span>
                                {selected.platform.map((p) => (
                                    <span
                                        key={p}
                                        className="flex items-center gap-2 bg-[#050505] border border-white/10 text-gray-300 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl"
                                    >
                                        <MonitorDown className="w-3.5 h-3.5 text-blue-400" />
                                        {p}
                                    </span>
                                ))}
                            </div>

                            {/* Download Button */}
                            {selected.isAvailable ? (
                                <motion.a
                                    href={selected.downloadUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    id={`download-${selected.id}`}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="group w-full flex items-center justify-center gap-4 bg-white text-black hover:bg-anvil-red hover:text-white font-black uppercase tracking-[0.2em] text-sm py-6 px-8 rounded-2xl transition-all duration-500 shadow-2xl relative overflow-hidden"
                                >
                                    <span className="relative z-10 flex items-center gap-3">
                                        <Download className="w-5 h-5" />
                                        Descargar Gratis
                                    </span>
                                </motion.a>
                            ) : (
                                <div className="w-full flex items-center justify-center gap-3 bg-white/5 border border-white/10 text-gray-600 font-black uppercase tracking-widest text-sm py-6 px-8 rounded-2xl cursor-not-allowed italic">
                                    <Zap className="w-5 h-5" />
                                    Próximamente
                                </div>
                            )}
                        </div>
                    </motion.div>

                    {/* Right: Visual / Mockup Panel */}
                    <motion.div
                        variants={itemVariants}
                        className="bg-[#111111] border border-white/5 rounded-[2.5rem] overflow-hidden relative flex flex-col min-h-[500px] shadow-2xl"
                    >
                        {/* Simulated App Window Chrome */}
                        <div className="bg-[#0a0a0a] border-b border-white/5 px-6 py-4 flex items-center gap-3 flex-shrink-0">
                            <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                            <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                            <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                            <span className="ml-4 text-[9px] text-gray-600 font-black uppercase tracking-[0.3em]">
                                PWR Análisis — v{selected.version}
                            </span>
                        </div>

                        {/* App Preview Content */}
                        <div className="flex-1 flex flex-col items-center justify-center p-12 relative">

                            {/* Animated graph visualization */}
                            <div className="w-full max-w-sm">

                                {/* Fake graph header */}
                                <div className="flex items-center justify-between mb-8">
                                    <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Velocidad Media (m/s)</span>
                                    <span className="text-anvil-red text-[10px] font-black uppercase tracking-widest">SQUAT — Serie 3</span>
                                </div>

                                {/* Animated bar chart */}
                                <div className="flex items-end justify-between gap-3 h-48 mb-8">
                                    {[0.72, 0.68, 0.65, 0.61, 0.59, 0.54, 0.50, 0.48].map((val, i) => (
                                        <motion.div
                                            key={i}
                                            className="flex-1 rounded-t-xl relative group overflow-hidden"
                                            style={{
                                                background: `linear-gradient(to top, #dc2626, #dc262644)`,
                                                height: `${(val / 0.8) * 100}%`,
                                            }}
                                            initial={{ scaleY: 0, originY: 1 }}
                                            whileInView={{ scaleY: 1 }}
                                            viewport={{ once: true }}
                                            transition={{ delay: 0.2 + i * 0.1, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                                        >
                                            <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                                            <div className="absolute -top-8 left-1/2 -translate-x-1/2 text-[10px] text-white font-black whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                                                {val}
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>

                                {/* Rep labels */}
                                <div className="flex justify-between text-[9px] text-gray-700 font-black uppercase tracking-[0.2em] mb-10">
                                    {['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8'].map((r) => (
                                        <span key={r} className="flex-1 text-center">{r}</span>
                                    ))}
                                </div>

                                {/* Stats row */}
                                <div className="grid grid-cols-3 gap-4">
                                    {[
                                        { label: 'Vmáx', value: '0.72' },
                                        { label: 'Vmedia', value: '0.60' },
                                        { label: 'Pérdida V', value: '33%' },
                                    ].map((stat) => (
                                        <div
                                            key={stat.label}
                                            className="bg-[#050505] border border-white/5 rounded-2xl p-4 text-center group/stat hover:border-anvil-red/30 transition-colors"
                                        >
                                            <div className="text-gray-600 text-[9px] font-black uppercase tracking-widest mb-1 group-hover/stat:text-anvil-red transition-colors">
                                                {stat.label}
                                            </div>
                                            <div className="text-white font-black text-sm">
                                                {stat.value}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Decorative overlay glow */}
                            <div className="absolute inset-0 bg-gradient-to-br from-anvil-red/5 via-transparent to-transparent pointer-events-none" />
                        </div>

                        {/* Bottom bar */}
                        <div className="bg-[#0a0a0a] border-t border-white/5 px-8 py-5 flex items-center justify-between flex-shrink-0">
                            <div className="flex items-center gap-3">
                                <BarChart3 className="w-4 h-4 text-anvil-red" />
                                <span className="text-[10px] text-gray-600 font-black uppercase tracking-widest">Análisis completado</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse" />
                                <span className="text-[9px] text-gray-700 font-black uppercase tracking-widest">Sistema activo</span>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>

                {/* Coming Soon Cards */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.3, duration: 0.6 }}
                    className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6"
                >
                    {[
                        {
                            title: 'PWR Planner',
                            desc: 'Planificación de entrenamiento inteligente con periodización automática basada en tu historial de rendimiento.',
                            eta: 'En desarrollo',
                        },
                        {
                            title: 'Anvil Meet Manager',
                            desc: 'Gestión de competiciones y ranking en tiempo real para organizadores de meets de powerlifting.',
                            eta: 'Próximamente',
                        },
                    ].map((app) => (
                        <div
                            key={app.title}
                            className="bg-[#1a1a1a] border border-dashed border-white/10 rounded-2xl p-8 flex items-start gap-6 hover:border-anvil-red/20 transition-colors group"
                        >
                            <div className="w-12 h-12 bg-white/3 border border-white/8 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:border-anvil-red/20 transition-colors">
                                <Zap className="w-5 h-5 text-gray-600 group-hover:text-anvil-red transition-colors" />
                            </div>
                            <div>
                                <div className="flex items-center gap-3 mb-2">
                                    <h4 className="text-white font-black uppercase tracking-tight">{app.title}</h4>
                                    <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest border border-white/10 px-2 py-0.5 rounded-full">
                                        {app.eta}
                                    </span>
                                </div>
                                <p className="text-gray-500 text-sm leading-relaxed">{app.desc}</p>
                            </div>
                        </div>
                    ))}
                </motion.div>
            </div>
        </section>
    );
}
