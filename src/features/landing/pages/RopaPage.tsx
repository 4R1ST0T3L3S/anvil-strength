
import { motion, Variants } from 'framer-motion';
import { PublicHeader } from '../../../components/layout/PublicHeader';
import { PublicFooter } from '../../../components/layout/PublicFooter';
import { ShoppingBag, ArrowRight, X as XIcon, Zap, Crown } from 'lucide-react';
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
        image: '/ropa/podium-tee.jpg',
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

            {/* --- HERO SECTION: EPIC & CINEMATIC --- */}
            <section className="relative h-screen min-h-[800px] flex items-center justify-center overflow-hidden">
                {/* Background Video/Image Placeholder with Parallax-like feel */}
                <div className="absolute inset-0 bg-[#0a0a0a]">
                    {/* Abstract Grunge/Texture Background */}
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-red-900/20 via-[#0a0a0a] to-[#0a0a0a]" />
                    <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/wall-4-light.png')] mix-blend-overlay" />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-[#0a0a0a]" />

                    {/* Dynamic Red Accents */}
                    <motion.div
                        animate={{ opacity: [0.3, 0.5, 0.3] }}
                        transition={{ duration: 5, repeat: Infinity, repeatType: "reverse" }}
                        className="absolute top-0 right-0 w-full h-full bg-gradient-to-bl from-red-900/10 via-transparent to-transparent"
                    />
                    <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-red-900/10 to-transparent" />
                    {/* Smooth Transition Fade */}
                    <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/80 to-transparent z-10" />
                </div>

                <div className="relative z-20 max-w-[1600px] mx-auto px-6 w-full text-center flex flex-col items-center justify-center h-full">

                    {/* Logos Container */}
                    {/* Logos Container */}
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 1, ease: "easeOut" }}
                        className="flex items-center justify-center gap-6 md:gap-12 mb-12 md:mb-20 relative"
                    >
                        {/* Steezy Logo - Offset Higher */}
                        {/* Steezy Logo - Offset Higher */}
                        <motion.a
                            href="https://steezylifts.com/password"
                            target="_blank"
                            rel="noopener noreferrer"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="w-56 md:w-80 opacity-90 filter drop-shadow-[0_0_20px_rgba(255,255,255,0.1)] -mt-16 md:-mt-24 cursor-pointer"
                        >
                            <img src="/steezy_sin_fonfo.png" alt="Steezy Lifts" className="w-full h-auto object-contain invert" />
                        </motion.a>

                        {/* X Separator */}
                        <motion.div
                            initial={{ rotate: -45, opacity: 0 }}
                            animate={{ rotate: 0, opacity: 1 }}
                            transition={{ delay: 0.5, duration: 0.8 }}
                            className="text-5xl md:text-8xl text-anvil-red font-black z-10"
                        >
                            <XIcon size={56} strokeWidth={3} className="w-12 h-12 md:w-20 md:h-20" />
                        </motion.div>

                        {/* Anvil Logo */}
                        <div className="w-40 md:w-64 opacity-90 filter drop-shadow-[0_0_20px_rgba(255,255,255,0.1)] mt-2">
                            <img src="/logo-dark-removebg-preview.png" alt="Anvil Strength" className="w-full h-auto object-contain" />
                        </div>
                    </motion.div>

                    {/* Main Headline */}
                    <motion.h1
                        variants={staggerContainer}
                        initial="hidden"
                        animate="visible"
                        className="text-6xl sm:text-7xl md:text-[8rem] leading-[0.85] font-black tracking-tighter text-white uppercase italic mb-10"
                    >
                        <motion.span variants={fadeInUp} className="block text-transparent bg-clip-text bg-gradient-to-r from-gray-100 to-gray-500 mb-2">STREETWEAR</motion.span>
                        <motion.span variants={fadeInUp} className="block text-anvil-red drop-shadow-[0_0_25px_rgba(220,38,38,0.6)]">POWERLIFTING</motion.span>
                    </motion.h1>

                    {/* Subtitle / Slogan */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 1.2, duration: 1 }}
                        className="space-y-4 max-w-4xl mx-auto"
                    >
                        <p className="text-lg md:text-2xl text-white font-bold tracking-widest uppercase">
                            EL ÚNICO CLUB DONDE EL ESTILO LO LLEVAS EN TARIMA Y EN EL PODIO.
                        </p>
                        <p className="text-sm md:text-lg text-gray-400 font-mono tracking-[0.2em] uppercase">
                            The First Spanish Powerlifting Streetwear Brand
                        </p>
                    </motion.div>
                    {/* Scroll Indicator */}
                </div>
                {/* Scroll Indicator */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 2, duration: 1, repeat: Infinity, repeatType: "reverse" }}
                    className="absolute bottom-12 left-1/2 transform -translate-x-1/2 text-gray-500"
                >
                    <ArrowRight className="transform rotate-90" size={32} />
                </motion.div>
            </section>

            {/* --- MANIFESTO / STORYTELLING SECTION --- */}
            <section className="py-24 bg-[#0a0a0a] relative overflow-hidden">
                <div className="absolute top-0 right-0 w-1/2 h-full bg-anvil-red/5 blur-[150px] rounded-full pointer-events-none" />

                <div className="max-w-[1200px] mx-auto px-6 flex flex-col items-center text-center">
                    <motion.div
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true }}
                        variants={fadeInUp}
                        className="max-w-4xl"
                    >
                        <div className="flex items-center justify-center gap-4 mb-8">
                            <span className="w-12 h-1 bg-anvil-red"></span>
                            <span className="text-anvil-red font-bold tracking-widest uppercase">The Collaboration</span>
                            <span className="w-12 h-1 bg-anvil-red"></span>
                        </div>
                        <h2 className="text-4xl md:text-7xl font-black uppercase italic tracking-tighter leading-none mb-10">
                            MORE THAN <br /> <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-600">JUST FABRIC.</span>
                        </h2>
                        <div className="space-y-6 text-lg md:text-xl text-gray-400 font-medium leading-relaxed max-w-3xl mx-auto">
                            <p>
                                <strong className="text-white">Steezy Lifts</strong> no hace ropa de gimnasio. Crea cultura. Nacida en 2026, es la primera marca en fusionar la estética <span className="text-white">Streetwear</span> con la brutalidad del <span className="text-anvil-red">Powerlifting</span>.
                            </p>
                            <p>
                                Una colección exclusiva para <strong>Anvil Strength</strong>. Únete a la cultura.
                            </p>
                            <p className="text-white italic pt-4">
                                "No es solo una camiseta negra. Es una declaración de intenciones."
                            </p>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* --- EDITORIAL PRODUCT SHOWCASE --- */}
            <section className="py-20 bg-[#0a0a0a]">
                <div className="max-w-[1600px] mx-auto px-6">
                    <motion.div
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true }}
                        variants={fadeInUp}
                        className="flex flex-col md:flex-row justify-between items-end mb-16 border-b border-white/10 pb-8"
                    >
                        <h2 className="text-5xl md:text-8xl font-black uppercase italic tracking-tighter text-outline-hover">
                            THE <span className="text-anvil-red">COLLECTION</span>
                        </h2>
                        <div className="mt-6 md:mt-0 text-right">
                            <p className="text-gray-400 font-mono text-sm">STEEZY LIFTS x ANVIL STRENGTH</p>
                            <p className="text-white font-bold text-xl tracking-widest">OFFICIAL GEAR</p>
                        </div>
                    </motion.div>

                    {/* FEATURED PRODUCT (SINGLET) */}
                    {products.filter(p => p.id === 4).map((product) => (
                        <motion.div
                            key={product.id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true }}
                            className="mb-24 relative group cursor-pointer"
                        >
                            <div className="relative h-[600px] md:h-[800px] w-full overflow-hidden bg-[#111] border border-white/10">
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#151515]">
                                    {/* Placeholder Content */}
                                    <div className="text-center group-hover:scale-105 transition-transform duration-700">
                                        <Crown size={80} className="text-anvil-red mb-6 mx-auto opacity-80" />
                                        <span className="text-6xl md:text-9xl font-black text-white/10 uppercase tracking-tighter">
                                            PIEZA<br />ANGULAR
                                        </span>
                                    </div>

                                    {/* Overlay Info */}
                                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/80 to-transparent p-12 flex flex-col md:flex-row items-end justify-between">
                                        <div className="max-w-2xl">
                                            <div className="bg-anvil-red text-white text-xs font-black uppercase px-3 py-1 tracking-widest inline-block mb-4">
                                                {product.tag}
                                            </div>
                                            <h3 className="text-4xl md:text-7xl font-black uppercase italic text-white mb-4 leading-none">
                                                {product.name}
                                            </h3>
                                            <p className="text-gray-300 text-lg md:text-xl max-w-xl">{product.description}</p>
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

                    {/* 3-COLUMN GRID FOR THE REST */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {products.filter(p => p.id !== 4).map((product, index) => (
                            <motion.div
                                key={product.id}
                                initial={{ opacity: 0, y: 50 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: index * 0.1 }}
                                viewport={{ once: true }}
                                className="group cursor-pointer"
                            >
                                <div className="relative aspect-[3/4] bg-[#111] overflow-hidden mb-6 border border-white/5">
                                    {/* Working On It Placeholder */}
                                    <div className="absolute inset-0 flex items-center justify-center bg-[#151515] group-hover:bg-[#1a1a1a] transition-colors">
                                        <span className="text-3xl font-black text-white/10 uppercase tracking-tighter -rotate-12 group-hover:text-white/20 transition-colors">
                                            WORKING<br />ON IT
                                        </span>
                                    </div>

                                    {/* Tag */}
                                    {product.tag && (
                                        <div className="absolute top-4 left-4 bg-white/10 backdrop-blur-md text-white text-[10px] font-bold uppercase px-2 py-1 tracking-widest">
                                            {product.tag}
                                        </div>
                                    )}

                                    {/* Hover Overlay */}
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <span className="border border-white text-white px-6 py-2 uppercase font-bold tracking-widest text-sm hover:bg-white hover:text-black transition-colors">Ver Producto</span>
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <h3 className="text-xl font-black uppercase italic group-hover:text-anvil-red transition-colors">
                                        {product.name}
                                    </h3>
                                    <p className="text-gray-500 text-xs font-mono uppercase tracking-wide leading-relaxed">
                                        {product.description}
                                    </p>
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

            {/* --- NEWSLETTER: HYPE STYLE --- */}
            <section className="py-40 bg-anvil-red relative overflow-hidden flex items-center justify-center">
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] opacity-30 mix-blend-multiply"></div>
                <div className="absolute -inset-10 bg-gradient-to-r from-black/20 to-transparent transform -skew-y-3"></div>

                <div className="max-w-5xl mx-auto px-6 text-center relative z-10">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.8 }}
                        viewport={{ once: true }}
                    >
                        <Zap size={64} className="text-black mx-auto mb-6 fill-current animate-pulse" />
                        <h2 className="text-5xl md:text-8xl font-black tracking-tighter mb-8 text-white uppercase italic leading-none drop-shadow-xl">
                            DON'T MISS THE DROP
                        </h2>
                        <p className="text-black/80 text-xl md:text-2xl mb-12 font-bold max-w-2xl mx-auto uppercase tracking-wide">
                            Exclusivo para miembros de Anvil Strength. Nunca en tarima y en el podio alguien había tenido tanto estilo.
                        </p>

                        <div className="flex flex-col md:flex-row gap-0 max-w-xl mx-auto shadow-2xl">
                            <input
                                type="email"
                                placeholder="TU EMAIL"
                                className="bg-white border-0 text-black placeholder-gray-500 px-8 py-5 font-bold uppercase outline-none focus:border-white flex-1"
                            />
                            <button className="bg-white text-black hover:bg-gray-900 hover:text-white px-10 py-5 font-black uppercase transition-all flex items-center justify-center gap-3 whitespace-nowrap">
                                UNIRME <ArrowRight size={20} />
                            </button>
                        </div>
                        <p className="mt-6 text-black/50 text-xs font-mono uppercase">
                            * No spam. Solo fuego.
                        </p>
                    </motion.div>
                </div>
            </section>
            <PublicFooter />
        </div>
    );
}
