import { useState } from 'react';
import { motion } from 'framer-motion';
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

const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.15 },
    },
};

const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.4, 0, 0.2, 1] } },
};

export function SoftwareSection() {
    const [activeApp, setActiveApp] = useState<string>(apps[0].id);

    const selected = apps.find((a) => a.id === activeApp) ?? apps[0];

    return (
        <section id="software" className="py-32 bg-[#0f0f0f] relative overflow-hidden">

            {/* Ambient glow effects */}
            <div className="absolute top-1/4 -left-40 w-[500px] h-[500px] bg-anvil-red/8 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-1/4 -right-40 w-[400px] h-[400px] bg-anvil-red/5 rounded-full blur-[100px] pointer-events-none" />

            {/* Grid pattern overlay */}
            <div
                className="absolute inset-0 pointer-events-none opacity-[0.03]"
                style={{
                    backgroundImage:
                        'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
                    backgroundSize: '60px 60px',
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
                    <div className="inline-flex items-center gap-2 bg-anvil-red/10 border border-anvil-red/20 text-anvil-red text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-full mb-6">
                        <Cpu className="w-3.5 h-3.5" />
                        Tecnología Anvil
                    </div>
                    <h2 className="text-4xl md:text-6xl font-black tracking-tighter uppercase mb-6 text-white">
                        Software{' '}
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-anvil-red to-red-400">
                            Powerlifting
                        </span>
                    </h2>
                    <p className="text-gray-400 max-w-2xl mx-auto text-lg leading-relaxed">
                        Herramientas diseñadas por atletas, para atletas. Tecnología de alto rendimiento al alcance de tu equipo.
                    </p>
                </motion.div>

                {/* App Selector (if multiple apps in the future) */}
                {apps.length > 1 && (
                    <div className="flex gap-3 justify-center mb-12 flex-wrap">
                        {apps.map((app) => (
                            <button
                                key={app.id}
                                onClick={() => setActiveApp(app.id)}
                                className={`px-6 py-3 rounded-xl font-bold uppercase tracking-wider text-sm transition-all duration-300 ${activeApp === app.id
                                    ? 'bg-anvil-red text-white shadow-lg shadow-anvil-red/30'
                                    : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
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
                    className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch"
                >
                    {/* Left: App Info */}
                    <motion.div
                        variants={itemVariants}
                        className="bg-[#1a1a1a] border border-white/8 rounded-3xl p-10 flex flex-col justify-between"
                    >
                        {/* App Header */}
                        <div>
                            <div className="flex items-start justify-between mb-8">
                                <div className="flex items-center gap-5">
                                    <div className="w-16 h-16 bg-anvil-red/15 border border-anvil-red/30 rounded-2xl flex items-center justify-center text-anvil-red">
                                        {selected.icon}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-3 mb-1">
                                            <h3 className="text-2xl font-black tracking-tight text-white uppercase">
                                                {selected.name}
                                            </h3>
                                            {selected.badge && (
                                                <span className="bg-anvil-red text-white text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full">
                                                    {selected.badge}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-anvil-red text-sm font-bold tracking-wide">
                                            {selected.tagline}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <p className="text-gray-400 text-base leading-relaxed mb-10">
                                {selected.description}
                            </p>

                            {/* Features */}
                            <ul className="space-y-3 mb-10">
                                {selected.features.map((feat, i) => (
                                    <li key={i} className="flex items-start gap-3 text-sm text-gray-300">
                                        <ChevronRight className="w-4 h-4 text-anvil-red flex-shrink-0 mt-0.5" />
                                        <span>{feat}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Meta info + Download */}
                        <div>
                            {/* Version & Platform badges */}
                            <div className="flex flex-wrap gap-3 mb-8">
                                <span className="flex items-center gap-1.5 bg-white/5 border border-white/10 text-gray-300 text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg">
                                    <Star className="w-3.5 h-3.5 text-yellow-400" />
                                    v{selected.version}
                                </span>
                                {selected.platform.map((p) => (
                                    <span
                                        key={p}
                                        className="flex items-center gap-1.5 bg-white/5 border border-white/10 text-gray-300 text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg"
                                    >
                                        <MonitorDown className="w-3.5 h-3.5 text-blue-400" />
                                        {p}
                                    </span>
                                ))}
                                <span className="flex items-center gap-1.5 bg-white/5 border border-white/10 text-gray-300 text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg">
                                    <Shield className="w-3.5 h-3.5 text-green-400" />
                                    Gratuito
                                </span>
                            </div>

                            {/* Download Button */}
                            {selected.isAvailable ? (
                                <a
                                    href={selected.downloadUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    id={`download-${selected.id}`}
                                    className="group w-full flex items-center justify-center gap-3 bg-anvil-red hover:bg-red-600 text-white font-black uppercase tracking-wider text-lg py-5 px-8 rounded-2xl transition-all duration-300 shadow-lg shadow-anvil-red/25 hover:shadow-anvil-red/50 hover:-translate-y-1"
                                >
                                    <Download className="w-6 h-6 group-hover:animate-bounce" />
                                    Descargar Gratis
                                </a>
                            ) : (
                                <div className="w-full flex items-center justify-center gap-3 bg-white/5 border border-white/10 text-gray-500 font-black uppercase tracking-wider text-lg py-5 px-8 rounded-2xl cursor-not-allowed">
                                    <Zap className="w-6 h-6" />
                                    Próximamente
                                </div>
                            )}
                        </div>
                    </motion.div>

                    {/* Right: Visual / Mockup Panel */}
                    <motion.div
                        variants={itemVariants}
                        className="bg-[#1a1a1a] border border-white/8 rounded-3xl overflow-hidden relative flex flex-col min-h-[500px]"
                    >
                        {/* Simulated App Window Chrome */}
                        <div className="bg-[#141414] border-b border-white/8 px-4 py-3 flex items-center gap-2 flex-shrink-0">
                            <div className="w-3 h-3 rounded-full bg-red-500/70" />
                            <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
                            <div className="w-3 h-3 rounded-full bg-green-500/70" />
                            <span className="ml-4 text-xs text-gray-600 font-mono uppercase tracking-widest">
                                PWR Análisis — v{selected.version}
                            </span>
                        </div>

                        {/* App Preview Content */}
                        <div className="flex-1 flex flex-col items-center justify-center p-10 relative">

                            {/* Animated graph visualization */}
                            <div className="w-full max-w-sm">

                                {/* Fake graph header */}
                                <div className="flex items-center justify-between mb-6">
                                    <span className="text-xs text-gray-500 font-bold uppercase tracking-widest">Velocidad Media (m/s)</span>
                                    <span className="text-anvil-red text-xs font-black">SQUAT — Serie 3</span>
                                </div>

                                {/* Animated bar chart */}
                                <div className="flex items-end justify-between gap-2 h-40 mb-6">
                                    {[0.72, 0.68, 0.65, 0.61, 0.59, 0.54, 0.50, 0.48].map((val, i) => (
                                        <motion.div
                                            key={i}
                                            className="flex-1 rounded-t-md relative group"
                                            style={{
                                                background: `linear-gradient(to top, #e63946, #e63946aa)`,
                                                height: `${(val / 0.8) * 100}%`,
                                            }}
                                            initial={{ scaleY: 0, originY: 1 }}
                                            whileInView={{ scaleY: 1 }}
                                            viewport={{ once: true }}
                                            transition={{ delay: 0.1 + i * 0.07, duration: 0.5, ease: 'easeOut' }}
                                        >
                                            <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[9px] text-gray-500 font-mono whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                                                {val}
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>

                                {/* Rep labels */}
                                <div className="flex justify-between text-[10px] text-gray-600 font-bold uppercase tracking-widest mb-8">
                                    {['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8'].map((r) => (
                                        <span key={r} className="flex-1 text-center">{r}</span>
                                    ))}
                                </div>

                                {/* Stats row */}
                                <div className="grid grid-cols-3 gap-3">
                                    {[
                                        { label: 'Vmáx', value: '0.72 m/s' },
                                        { label: 'Vmedia', value: '0.60 m/s' },
                                        { label: 'Pérdida V', value: '33%' },
                                    ].map((stat) => (
                                        <div
                                            key={stat.label}
                                            className="bg-black/40 border border-white/5 rounded-xl p-3 text-center"
                                        >
                                            <div className="text-gray-500 text-[9px] font-bold uppercase tracking-widest mb-1">
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
                        <div className="bg-[#141414] border-t border-white/5 px-6 py-4 flex items-center justify-between flex-shrink-0">
                            <div className="flex items-center gap-2">
                                <BarChart3 className="w-4 h-4 text-anvil-red" />
                                <span className="text-xs text-gray-500 font-bold uppercase tracking-widest">Análisis completado</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                                <span className="text-[10px] text-gray-600 font-mono">Sistema activo</span>
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
