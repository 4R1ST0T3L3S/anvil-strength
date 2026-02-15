import { motion, Variants } from 'framer-motion';
import { PublicHeader } from '../../../components/layout/PublicHeader';
import { PublicFooter } from '../../../components/layout/PublicFooter';
import { ShoppingBag, ArrowRight, X as XIcon, Zap, Crown, MessageCircle } from 'lucide-react';
import { UserProfile } from '../../../hooks/useUser';

// Placeholder data for clothing items
const products = [
    {
        id: 1,
        name: 'Chándal Anvil x Steezy Lifts',
        price: 'Working On It',
        image: '/ropa/chandal.jpg',
        tag: 'STREETWEAR FIT',
        description: 'Corte boxy y pantalón stacked. La estética de la calle llevada al calentamiento.'
    },
    {
        id: 2,
        name: 'Camiseta Comp. Anvil x Steezy Lifts',
        price: 'Working On It',
        image: '/ropa/comp-tee.jpg',
        tag: 'OFFICIAL KIT',
        description: 'Tejido transpirable de alto rendimiento. Diseñada para soportar la presión de la plataforma.'
    },
    {
        id: 3,
        name: 'Camiseta Podio Anvil x Steezy Lifts',
        price: 'Working On It',
        image: '/ropa/podium-tee.webp',
        tag: 'VICTORY LAP',
        description: 'Para cuando te cuelgan la medalla. Algodón premium y corte relajado.'
    },
    {
        id: 4,
        name: 'Singlet Anvil x Steezy Lifts',
        price: '95.00€',
        image: '/ropa/singlet.jpg',
        tag: 'PRO EQUIPMENT',
        description: 'Olvida los singlets básicos. Aquí el estilo en tarima es lo único que importa.'
    }
];

interface RopaPageProps {
    onLoginClick: () => void;
    user?: UserProfile | null;
}

export function RopaPage({ onLoginClick }: RopaPageProps) {
    const fadeInUp: Variants = {
        hidden: { opacity: 0, y: 60 },
        visible: {
            opacity: 1,
            y: 0,
            transition: {
                duration: 0.8,
                ease: "easeOut"
            }
        }
    };

    const staggerContainer: Variants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.2
            }
        }
    };

    return (
        <div className="font-sans min-h-screen bg-[#0a0a0a] text-white selection:bg-anvil-red selection:text-white overflow-x-hidden">
            <PublicHeader onLoginClick={onLoginClick} />

            {/* --- HERO SECTION --- */}
            <section className="relative h-screen min-h-[700px] flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0 bg-[#0a0a0a]">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-red-900/20 via-[#0a0a0a] to-[#0a0a0a]" />
                    <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/wall-4-light.png')] mix-blend-overlay" />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-[#0a0a0a]" />
                    <motion.div animate={{ opacity: [0.3, 0.5, 0.3] }} transition={{ duration: 5, repeat: Infinity, repeatType: "reverse" }} className="absolute top-0 right-0 w-full h-full bg-gradient-to-bl from-red-900/10 via-transparent to-transparent" />
                    <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/80 to-transparent z-10" />
                </div>

                <div className="relative z-20 max-w-[1600px] mx-auto px-6 w-full text-center flex flex-col items-center justify-center h-full">
                    {/* Logos Container - Responsive Fix */}
                    {/* --- LOGOS CONTAINER: POSICIÓN AJUSTADA --- */}
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 1, ease: "easeOut" }}
                        /* Añadimos pt-12 en móvil y pt-24 en escritorio para empujar TODO el grupo hacia abajo */
                        className="flex items-center justify-center gap-3 sm:gap-6 md:gap-12 mb-8 md:mb-20 pt-12 sm:pt-16 md:pt-24 relative"
                    >
                        {/* Steezy Logo - Reducimos el margen negativo para que no suba tanto */}
                        <motion.a
                            href="https://steezylifts.com/password"
                            target="_blank"
                            rel="noopener noreferrer"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            /* Cambiado: de -mt-8/-mt-24 a -mt-4/-mt-12 */
                            className="w-32 sm:w-48 md:w-80 opacity-90 filter drop-shadow-[0_0_20px_rgba(255,255,255,0.1)] -mt-4 sm:-mt-8 md:-mt-12 cursor-pointer"
                        >
                            <img src="/steezy_sin_fonfo.png" alt="Steezy Lifts" className="w-full h-auto object-contain invert" />
                        </motion.a>

                        {/* X Separator - Ajustamos un poco el tamaño para que encuadre */}
                        <motion.div
                            initial={{ rotate: -25, opacity: 0 }}
                            animate={{ rotate: 0, opacity: 1 }}
                            transition={{ delay: 0.5, duration: 0.8 }}
                            className="text-3xl md:text-8xl text-anvil-red font-black z-10 flex items-center"
                        >
                            <XIcon strokeWidth={3} className="w-6 h-6 sm:w-10 sm:h-10 md:w-16 md:h-16" />
                        </motion.div>

                        {/* Anvil Logo - Mantenemos un margen superior mínimo para equilibrio visual */}
                        <div className="w-24 sm:w-40 md:w-64 opacity-90 filter drop-shadow-[0_0_20px_rgba(255,255,255,0.1)] mt-2 md:mt-4">
                            <img src="/logo-dark-removebg-preview.png" alt="Anvil Strength" className="w-full h-auto object-contain" />
                        </div>
                    </motion.div>

                    <motion.h1 variants={staggerContainer} initial="hidden" animate="visible" className="text-5xl sm:text-7xl md:text-[8rem] leading-[0.85] font-black tracking-tighter text-white uppercase italic mb-8 sm:mb-10">
                        <motion.span variants={fadeInUp} className="block text-transparent bg-clip-text bg-gradient-to-r from-gray-100 to-gray-500 mb-2">STREETWEAR</motion.span>
                        <motion.span variants={fadeInUp} className="block text-anvil-red drop-shadow-[0_0_25px_rgba(220,38,38,0.6)]">POWERLIFTING</motion.span>
                    </motion.h1>

                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2, duration: 1 }} className="space-y-4 max-w-4xl mx-auto px-4">
                        <p className="text-sm sm:text-lg md:text-2xl text-white font-bold tracking-widest uppercase">EL ÚNICO CLUB DONDE EL ESTILO LO LLEVAS EN TARIMA Y EN EL PODIO.</p>
                        <p className="text-[10px] sm:text-sm md:text-lg text-gray-400 font-mono tracking-[0.2em] uppercase">The First Spanish Powerlifting Streetwear Brand</p>
                    </motion.div>
                </div>
            </section>

            {/* --- MANIFESTO --- */}
            <section className="py-16 sm:py-24 bg-[#0a0a0a] relative overflow-hidden">
                <div className="max-w-[1200px] mx-auto px-6 flex flex-col items-center text-center">
                    <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp} className="max-w-4xl">
                        <h2 className="text-3xl sm:text-4xl md:text-7xl font-black uppercase italic tracking-tighter leading-none mb-10">MORE THAN <br /> <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-600">JUST FABRIC.</span></h2>
                        <div className="space-y-6 text-base sm:text-lg md:text-xl text-gray-400 font-medium leading-relaxed">
                            <p><strong className="text-white">Steezy Lifts</strong> no hace ropa de gimnasio. Crea cultura. Una colección exclusiva para <strong>Anvil Strength</strong>. Únete a la cultura.</p>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* --- PRODUCT SHOWCASE --- */}
            <section className="py-20 bg-[#0a0a0a]">
                <div className="max-w-[1600px] mx-auto px-6">
                    <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp} className="flex flex-col md:flex-row justify-between items-end mb-16 border-b border-white/10 pb-8 text-left">
                        <h2 className="text-4xl sm:text-5xl md:text-8xl font-black uppercase italic tracking-tighter">THE <span className="text-anvil-red">COLLECTION</span></h2>
                        <div className="mt-4 md:mt-0 text-right"><p className="text-gray-400 font-mono text-[10px] sm:text-sm">STEEZY LIFTS x ANVIL STRENGTH</p><p className="text-white font-bold text-lg sm:text-xl tracking-widest">OFFICIAL GEAR</p></div>
                    </motion.div>

                    {/* --- PIEZA ANGULAR (SINGLET - ID 4) RESTAURADA --- */}
                    {products.filter(p => p.id === 4).map((product) => (
                        <motion.div key={product.id} initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} className="mb-24 relative group cursor-pointer">
                            <div className="relative h-[500px] sm:h-[600px] md:h-[800px] w-full overflow-hidden bg-[#111] border border-white/10">
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#151515]">
                                    {/* Placeholder Content */}
                                    <div className="text-center group-hover:scale-105 transition-transform duration-700">
                                        <Crown size={60} className="text-anvil-red mb-6 mx-auto opacity-80 sm:w-20 sm:h-20" />
                                        <span className="text-5xl sm:text-6xl md:text-9xl font-black text-white/10 uppercase tracking-tighter">
                                            PIEZA<br />ANGULAR
                                        </span>
                                    </div>

                                    {/* Overlay Info */}
                                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/80 to-transparent p-6 sm:p-12 flex flex-col md:flex-row items-end justify-between">
                                        <div className="max-w-2xl text-left">
                                            <div className="bg-anvil-red text-white text-[10px] font-black uppercase px-3 py-1 tracking-widest inline-block mb-4">
                                                {product.tag}
                                            </div>
                                            <h3 className="text-3xl sm:text-4xl md:text-7xl font-black uppercase italic text-white mb-4 leading-none">
                                                {product.name}
                                            </h3>
                                            <p className="text-gray-300 text-sm sm:text-lg md:text-xl max-w-xl">{product.description}</p>
                                        </div>
                                        <button className="hidden md:flex bg-white text-black font-black uppercase px-10 py-5 hover:bg-anvil-red hover:text-white transition-colors items-center gap-4">
                                            <span>Ver Detalles</span>
                                            <ArrowRight size={24} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ))}

                    {/* GRID PRODUCTS (ID 1, 2, 3) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8 mb-24">
                        {products.filter(p => p.id !== 4).map((product, index) => (
                            <motion.div key={product.id} initial={{ opacity: 0, y: 50 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: index * 0.1 }} viewport={{ once: true }} className="group cursor-pointer">
                                <div className="relative aspect-[3/4] bg-[#111] overflow-hidden mb-6 border border-white/5">
                                    {product.id === 3 ? (
                                        <img src={product.image} alt={product.name} className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-700" />
                                    ) : (
                                        <div className="absolute inset-0 flex items-center justify-center bg-[#151515] group-hover:bg-[#1a1a1a] transition-colors">
                                            <span className="text-2xl sm:text-3xl font-black text-white/10 uppercase tracking-tighter -rotate-12">WORKING<br />ON IT</span>
                                        </div>
                                    )}
                                    <div className="absolute top-4 left-4 bg-white/10 backdrop-blur-md text-white text-[9px] sm:text-[10px] font-bold uppercase px-2 py-1 tracking-widest">{product.tag}</div>
                                </div>
                                <div className="space-y-1 text-left">
                                    <h3 className="text-lg sm:text-xl font-black uppercase italic group-hover:text-anvil-red transition-colors">{product.name}</h3>
                                    <p className="text-gray-500 text-[10px] sm:text-xs font-mono uppercase tracking-wide">{product.description}</p>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* --- STEEZY STORE BANNER --- */}
            <section className="py-12 bg-white text-black border-y-4 border-anvil-red overflow-hidden relative group cursor-pointer">
                <a href="https://steezylifts.com/password" target="_blank" rel="noopener noreferrer" className="absolute inset-0 z-20"></a>
                <div className="absolute inset-0 bg-anvil-red/10 transform -skew-x-12 translate-x-full group-hover:translate-x-0 transition-transform duration-500 z-10" />

                <div className="max-w-[1600px] mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
                    <div className="flex items-center gap-6">
                        <Crown size={42} className="text-anvil-red animate-pulse" />
                        <div className="text-left">
                            <h3 className="text-3xl md:text-5xl font-black uppercase italic tracking-tighter leading-none">
                                TIENDA OFICIAL
                            </h3>
                            <p className="text-black/60 font-bold uppercase tracking-widest text-sm">
                                STEEZY LIFTS // LIMITED STOCK
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 group-hover:gap-8 transition-all duration-300">
                        <span className="text-xl md:text-2xl font-black uppercase tracking-tight">VISITAR WEB</span>
                        <ArrowRight size={32} className="text-anvil-red" />
                    </div>
                </div>
            </section>

            {/* --- NEWSLETTER: HYPE STYLE (RESTAURADO) --- */}
            <section className="py-24 sm:py-40 bg-anvil-red relative overflow-hidden flex items-center justify-center text-center">
                {/* Textura sutil de fondo para profundidad */}
                <div className="absolute inset-0 bg-black/5 opacity-10"></div>

                <div className="max-w-5xl mx-auto px-6 relative z-10">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.8 }}
                        viewport={{ once: true }}
                    >
                        {/* Icono de rayo */}
                        <Zap size={48} className="text-black mx-auto mb-6 fill-current animate-pulse sm:w-16 sm:h-16" />

                        {/* Titular Principal */}
                        <h2 className="text-5xl sm:text-7xl md:text-[8.5rem] font-black tracking-tighter mb-8 text-white uppercase italic leading-[0.85]">
                            DON'T MISS THE DROP <br />
                        </h2>

                        {/* Subtítulo: Texto en negro, muy negrita y tracking ajustado como en la imagen */}
                        <p className="text-black text-lg sm:text-xl md:text-2xl mb-12 font-[900] max-w-3xl mx-auto uppercase tracking-tighter leading-[1.1]">
                            EXCLUSIVO PARA MIEMBROS DE ANVIL STRENGTH. <br className="hidden md:block" />
                            NUNCA NADIE EN TARIMA Y EN EL PODIO ALGUIEN<br className="hidden md:block" />
                            HABÍA TENIDO TANTO ESTILO.
                        </p>

                        {/* Contenedor del Formulario: Barra blanca única */}
                        <div className="max-w-2xl mx-auto">
                            <div className="flex bg-white items-center p-1 shadow-2xl">
                                <input
                                    type="email"
                                    placeholder="TU EMAIL"
                                    className="bg-transparent border-0 text-black placeholder-gray-400 px-6 sm:px-8 py-4 sm:py-5 font-bold uppercase outline-none flex-1 text-sm sm:text-base focus:ring-0"
                                />
                                <button className="bg-transparent text-black px-6 sm:px-10 py-4 sm:py-5 font-black uppercase transition-all flex items-center justify-center gap-3 whitespace-nowrap text-sm sm:text-base hover:opacity-60">
                                    UNIRME <ArrowRight size={22} strokeWidth={3} />
                                </button>
                            </div>

                            {/* Texto pequeño inferior */}
                            <p className="mt-6 text-black/60 text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em]">
                                * NO SPAM. SOLO FUEGO.
                            </p>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* --- WHATSAPP CTA BANNER --- */}
            <section className="py-24 bg-[#0a0a0a] border-t border-white/5 relative overflow-hidden flex items-center justify-center">
                <div className="absolute top-0 left-0 w-full h-full opacity-[0.03] bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]"></div>
                <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-anvil-red/10 blur-[120px] rounded-full"></div>

                <div className="max-w-7xl mx-auto px-6 relative z-10 text-center">
                    <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }}>
                        <h2 className="text-5xl sm:text-7xl md:text-[9rem] font-black italic uppercase tracking-tighter mb-6 leading-[0.85] text-white">
                            ¿Juan, <span className="text-anvil-red drop-shadow-[0_0_15px_rgba(220,38,38,0.3)]">te animas?</span>
                        </h2>
                        <p className="text-gray-500 text-sm sm:text-lg md:text-xl font-bold uppercase tracking-[0.3em] mb-12 max-w-2xl mx-auto">HAGAMOS HISTORIA JUAN, REVOLUCIONEMOS EL POWERLIFTING.</p>
                        <a href="https://chat.whatsapp.com/HbeNPSfeFceF7yTndQWUGc" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-4 bg-white text-black hover:bg-anvil-red hover:text-white px-8 sm:px-12 py-5 sm:py-6 font-black uppercase italic text-lg sm:text-2xl transition-all duration-500 group shadow-2xl">
                            <span>HAZ CLICK SI TE GUSTA LA IDEA</span>
                            <MessageCircle size={28} className="fill-current group-hover:rotate-12 transition-transform" />
                        </a>
                    </motion.div>
                </div>
            </section>

            <PublicFooter />
        </div>
    );
}