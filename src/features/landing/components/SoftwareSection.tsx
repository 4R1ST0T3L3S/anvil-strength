import { motion } from 'framer-motion';
import { MessageCircle } from 'lucide-react';

export function SoftwareSection() {
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

            <div className="max-w-[1400px] mx-auto px-6 relative z-10 flex flex-col items-center">
                {/* Header */}
                <motion.div
                    className="text-center mb-16"
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6 }}
                >
                    <h2 className="text-5xl md:text-8xl font-black tracking-[0.05em] uppercase mb-6 text-white font-bebas italic leading-[1.1] py-4">
                        VISION{' '}
                        <span className="text-anvil-red drop-shadow-[0_0_20px_rgba(220,38,38,0.3)]">
                            VBT
                        </span>
                    </h2>
                    <div className="text-gray-400 max-w-2xl mx-auto text-lg md:text-xl font-medium leading-relaxed flex flex-col gap-2">
                        <p>Elevando el estándar del powerlifting mediante innovación.</p>
                        <p>Análisis VBT y gestión integral en una sola app.</p>
                    </div>
                </motion.div>

                {/* Software Image Showcase */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 30 }}
                    whileInView={{ opacity: 1, scale: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="w-full max-w-5xl mb-24 relative group"
                >
                    <div className="absolute inset-0 bg-anvil-red/10 blur-[100px] rounded-[3rem] pointer-events-none group-hover:bg-anvil-red/20 transition-colors duration-700" />
                    <img 
                        src="/image.png" 
                        alt="VISION Software Interface" 
                        className="w-full h-auto shadow-2xl relative z-10"
                        style={{ clipPath: 'inset(3px)' }}
                        onError={(e) => {
                            (e.target as HTMLImageElement).src = '/portadaanvil2.jpg';
                        }}
                    />
                </motion.div>

                {/* Downloads & Platforms */}
                <div className="w-full max-w-5xl">
                    <div className="text-center mb-10">
                        <h3 className="text-2xl font-black text-white uppercase font-bebas italic tracking-widest">
                            Plataformas Soportadas
                        </h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
                        {/* Windows */}
                        <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl p-6 flex flex-col items-center justify-center gap-4 relative overflow-hidden group">
                            <svg viewBox="-3 -3 30 30" fill="currentColor" className="w-10 h-10 text-[#0078D4] transition-transform duration-500 group-hover:scale-110">
                                <path d="M11 11H0V0h11v11zm13 0H12V0h11v11zM11 24H0V13h11v11zm13 0H12V13h11v11z"/>
                            </svg>
                            <span className="text-white font-black uppercase tracking-widest text-sm">Windows</span>
                            <div className="bg-anvil-red/10 border border-anvil-red/30 text-anvil-red text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full w-max mt-2">
                                Próximamente
                            </div>
                        </div>

                        {/* macOS */}
                        <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl p-6 flex flex-col items-center justify-center gap-4 relative overflow-hidden group">
                            <svg viewBox="-1 -1 26 26" fill="currentColor" className="w-10 h-10 text-gray-200 transition-transform duration-500 group-hover:scale-110">
                                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-1 .04-2.22.67-2.94 1.5-.62.71-1.16 1.85-1.01 2.96 1.12.09 2.27-.59 2.96-1.4"/>
                            </svg>
                            <span className="text-white font-black uppercase tracking-widest text-sm">macOS</span>
                            <div className="bg-anvil-red/10 border border-anvil-red/30 text-anvil-red text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full w-max mt-2">
                                Próximamente
                            </div>
                        </div>

                        {/* iOS */}
                        <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl p-6 flex flex-col items-center justify-center gap-4 relative overflow-hidden group">
                            <svg viewBox="-1 -1 26 26" fill="currentColor" className="w-10 h-10 text-gray-200 transition-transform duration-500 group-hover:scale-110">
                                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-1 .04-2.22.67-2.94 1.5-.62.71-1.16 1.85-1.01 2.96 1.12.09 2.27-.59 2.96-1.4"/>
                            </svg>
                            <span className="text-white font-black uppercase tracking-widest text-sm">iOS</span>
                            <div className="bg-anvil-red/10 border border-anvil-red/30 text-anvil-red text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full w-max mt-2">
                                Próximamente
                            </div>
                        </div>

                        {/* Android */}
                        <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl p-6 flex flex-col items-center justify-center gap-4 relative overflow-hidden group">
                            <svg viewBox="-2 -2 28 28" fill="currentColor" className="w-10 h-10 text-[#3DDC84] transition-transform duration-500 group-hover:scale-110">
                                <path d="M6 18c0 .55.45 1 1 1h1v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h2v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h1c.55 0 1-.45 1-1V8H6v10zM3.5 8C2.67 8 2 8.67 2 9.5v5C2 15.33 2.67 16 3.5 16S5 15.33 5 14.5v-5C5 8.67 4.33 8 3.5 8zm17 0c-.83 0-1.5.67-1.5 1.5v5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5v-5c0-.83-.67-1.5-1.5-1.5zM15.53 2.16l1.3-1.3c.2-.2.2-.51 0-.71-.2-.2-.51-.2-.71 0-.2.2-.2.51 0 .71l1.31 1.31C6.97 3.26 6 5.01 6 7h12c0-1.99-.97-3.75-2.47-4.84zM10 5H9V4h1v1zm5 0h-1V4h1v1z"/>
                            </svg>
                            <span className="text-white font-black uppercase tracking-widest text-sm">Android</span>
                            <div className="bg-anvil-red/10 border border-anvil-red/30 text-anvil-red text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full w-max mt-2">
                                Próximamente
                            </div>
                        </div>
                    </div>

                    {/* CTAs */}
                    <div className="flex justify-center">
                        <a 
                            href="https://chat.whatsapp.com/CWQrqdtLxoH2l31L3Coegb"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-3 bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/30 text-[#25D366] font-black uppercase tracking-widest text-xs py-5 px-12 rounded-2xl transition-all duration-300 shadow-[0_0_20px_rgba(37,211,102,0.1)] hover:shadow-[0_0_30px_rgba(37,211,102,0.3)]"
                        >
                            <MessageCircle className="w-5 h-5" />
                            Unirme a Testers
                        </a>
                    </div>
                </div>
            </div>
        </section>
    );
}
