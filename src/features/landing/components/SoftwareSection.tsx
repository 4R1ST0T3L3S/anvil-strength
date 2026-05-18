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
                        <div className="bg-[#111] border border-white/5 rounded-2xl p-6 flex flex-col items-center justify-center gap-4 relative overflow-hidden group">
                            <svg viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10 text-gray-500 group-hover:text-white transition-colors">
                                <path d="M0 3.449L9.75 2.1v9.45H0V3.449zM0 12.45h9.75v9.45L0 20.551v-8.1zM11.25 1.899L24 0v11.55H11.25V1.899zM11.25 12.45H24v11.55l-12.75-1.9v-9.65z"/>
                            </svg>
                            <span className="text-white font-black uppercase tracking-widest text-sm">Windows</span>
                            <div className="bg-anvil-red/10 border border-anvil-red/30 text-anvil-red text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full w-max mt-2">
                                Próximamente
                            </div>
                        </div>

                        {/* macOS */}
                        <div className="bg-[#111] border border-white/5 rounded-2xl p-6 flex flex-col items-center justify-center gap-4 relative overflow-hidden group">
                            <svg viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10 text-gray-500 group-hover:text-white transition-colors">
                                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-1 .04-2.22.67-2.94 1.5-.62.71-1.16 1.85-1.01 2.96 1.12.09 2.27-.59 2.96-1.4"/>
                            </svg>
                            <span className="text-white font-black uppercase tracking-widest text-sm">macOS</span>
                            <div className="bg-anvil-red/10 border border-anvil-red/30 text-anvil-red text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full w-max mt-2">
                                Próximamente
                            </div>
                        </div>

                        {/* iOS */}
                        <div className="bg-[#111] border border-white/5 rounded-2xl p-6 flex flex-col items-center justify-center gap-4 relative overflow-hidden group">
                            <svg viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10 text-gray-500 group-hover:text-white transition-colors">
                                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-1 .04-2.22.67-2.94 1.5-.62.71-1.16 1.85-1.01 2.96 1.12.09 2.27-.59 2.96-1.4"/>
                            </svg>
                            <span className="text-white font-black uppercase tracking-widest text-sm">iOS</span>
                            <div className="bg-anvil-red/10 border border-anvil-red/30 text-anvil-red text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full w-max mt-2">
                                Próximamente
                            </div>
                        </div>

                        {/* Android */}
                        <div className="bg-[#111] border border-white/5 rounded-2xl p-6 flex flex-col items-center justify-center gap-4 relative overflow-hidden group">
                            <svg viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10 text-gray-500 group-hover:text-white transition-colors">
                                <path d="M17.523 15.3414c-.5511 0-1-.4489-1-1s.4489-1 1-1 1 .4489 1 1-.4489 1-1 1zm-11.046 0c-.5511 0-1-.4489-1-1s.4489-1 1-1 1 .4489 1 1-.4489 1-1 1zm11.445-5.9181l1.9202-3.3258c.1158-.2005.0471-.4567-.1534-.5725-.2004-.1158-.4567-.0472-.5725.1534l-1.9535 3.3835C15.8284 8.4478 13.9926 8 12 8s-3.8284.4478-5.3168 1.1119L4.7297 5.7284c-.1158-.2006-.3721-.2692-.5725-.1534-.2005.1158-.2692.372-.1534.5725l1.9202 3.3258C2.7483 11.2383 1 13.9103 1 17h22c0-3.0897-1.7483-5.7617-4.922-7.5767z"/>
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
