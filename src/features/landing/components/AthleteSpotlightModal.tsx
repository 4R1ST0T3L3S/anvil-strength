import { useEffect } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { X, MapPin, Calendar } from 'lucide-react';
import { athletes as clubAthletes } from '../../../data/athletes';
import { lockBodyScroll } from '../../../lib/scrollLock';

export interface SpotlightData {
    athleteName: string;
    avatarUrl: string | null;
    competitionName: string;
    date: string;
    location?: string;
    level?: string;
    description?: string;
}

/** Normaliza para comparar: minúsculas, sin tildes, espacios colapsados. */
function normalizeName(name: string): string {
    return name
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, ' ');
}

/** Busca la foto "buena" del atleta en los datos de la landing por coincidencia de nombre. */
function findClubPhoto(fullName: string): { image: string; category?: string } | null {
    const target = normalizeName(fullName);
    const match = clubAthletes.find(a => {
        const n = normalizeName(a.name);
        // Coincidencia exacta, o un nombre contiene al otro
        // (cubre "Alejandro Hermosilla Sánchez" vs "Alejandro Hermosilla")
        return n === target || target.startsWith(n + ' ') || n.startsWith(target + ' ') || target === n || target.includes(n) || n.includes(target);
    });
    return match ? { image: match.image, category: match.category } : null;
}

/** Columnas de humo animadas con CSS/Framer (sin assets externos). */
function SmokeLayer() {
    const plumes = [
        { left: '5%', size: 420, duration: 9, delay: 0, opacity: 0.20 },
        { left: '25%', size: 520, duration: 12, delay: 1.5, opacity: 0.14 },
        { left: '45%', size: 460, duration: 10, delay: 0.8, opacity: 0.18 },
        { left: '62%', size: 560, duration: 13, delay: 2.2, opacity: 0.12 },
        { left: '78%', size: 440, duration: 11, delay: 0.4, opacity: 0.16 },
    ];

    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {plumes.map((p, i) => (
                <m.div
                    key={i}
                    className="absolute rounded-full"
                    style={{
                        left: p.left,
                        bottom: '-30%',
                        width: p.size,
                        height: p.size,
                        background: `radial-gradient(circle, rgba(180,180,190,${p.opacity}) 0%, rgba(120,120,130,${p.opacity * 0.5}) 40%, transparent 70%)`,
                        filter: 'blur(40px)',
                    }}
                    animate={{
                        y: [0, -180, -60, -220],
                        x: [0, 40, -30, 20],
                        scale: [1, 1.25, 1.1, 1.35],
                        opacity: [0.6, 1, 0.7, 0.5],
                    }}
                    transition={{
                        duration: p.duration,
                        delay: p.delay,
                        repeat: Infinity,
                        repeatType: 'mirror',
                        ease: 'easeInOut',
                    }}
                />
            ))}
            {/* Resplandor rojo desde abajo */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[80%] h-[40%] bg-anvil-red/15 blur-[100px] rounded-full" />
        </div>
    );
}

export function AthleteSpotlightModal({ data, onClose }: { data: SpotlightData | null; onClose: () => void }) {
    // Bloquear scroll del body mientras está abierto
    useEffect(() => {
        if (!data) return;
        return lockBodyScroll();
    }, [data]);

    // Cerrar con Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    const clubPhoto = data ? findClubPhoto(data.athleteName) : null;
    const photo = clubPhoto?.image || data?.avatarUrl || null;

    const formatDate = (dateStr: string) => {
        try {
            return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(dateStr));
        } catch {
            return dateStr;
        }
    };

    return (
        <AnimatePresence>
            {data && (
                <m.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[300] bg-black/95 backdrop-blur-md flex items-center justify-center overflow-hidden"
                    onClick={onClose}
                >
                    <SmokeLayer />

                    {/* Botón cerrar */}
                    <button
                        onClick={onClose}
                        className="absolute top-6 right-6 z-30 p-3 bg-white/5 hover:bg-anvil-red rounded-full text-ink transition-colors"
                        aria-label="Cerrar"
                    >
                        <X size={22} />
                    </button>

                    <div
                        className="relative z-20 w-full h-full max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-end md:justify-center px-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Foto del atleta */}
                        <m.div
                            initial={{ opacity: 0, y: 80, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 40 }}
                            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                            className="relative order-2 md:order-1 w-full md:w-1/2 h-[45vh] md:h-[85vh] flex items-end justify-center shrink-0"
                        >
                            {photo ? (
                                <img
                                    src={photo}
                                    alt={data.athleteName}
                                    className="h-full w-auto max-w-full object-contain object-bottom drop-shadow-[0_0_60px_rgba(220,38,38,0.25)]"
                                    style={{ maskImage: 'linear-gradient(to top, transparent 0%, black 12%)', WebkitMaskImage: 'linear-gradient(to top, transparent 0%, black 12%)' }}
                                />
                            ) : (
                                <div className="w-64 h-64 md:w-96 md:h-96 rounded-full bg-gradient-to-br from-surface-raised to-surface-sunken border border-line flex items-center justify-center mb-12">
                                    <span className="text-7xl md:text-9xl font-black text-brand-text italic">
                                        {data.athleteName.split(' ').map(w => w[0]).slice(0, 2).join('')}
                                    </span>
                                </div>
                            )}
                        </m.div>

                        {/* Info */}
                        <m.div
                            initial={{ opacity: 0, x: 40 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ delay: 0.25, duration: 0.6 }}
                            className="order-1 md:order-2 w-full md:w-1/2 text-center md:text-left pt-24 md:pt-0 md:pl-12"
                        >
                            <p className="text-brand-text font-black uppercase tracking-[0.3em] text-xs md:text-sm mb-3">
                                {data.level || 'Competición'} · {formatDate(data.date)}
                            </p>
                            <h2 className="text-4xl md:text-7xl font-black text-ink uppercase italic tracking-tighter leading-[0.9] mb-2">
                                {data.athleteName}
                            </h2>
                            {clubPhoto?.category && (
                                <p className="text-gray-400 font-bold uppercase tracking-widest text-sm mb-6">{clubPhoto.category}</p>
                            )}

                            <div className="w-20 h-1 bg-anvil-red mx-auto md:mx-0 my-6" />

                            <h3 className="text-xl md:text-2xl font-black text-ink uppercase mb-3">{data.competitionName}</h3>

                            <div className="flex items-center justify-center md:justify-start gap-5 text-gray-400 text-sm font-bold mb-6">
                                <span className="flex items-center gap-2"><Calendar size={15} /> {formatDate(data.date)}</span>
                                {data.location && <span className="flex items-center gap-2"><MapPin size={15} /> {data.location}</span>}
                            </div>

                            {data.description && (
                                <p className="text-gray-300 leading-relaxed text-base md:text-lg max-w-md mx-auto md:mx-0">
                                    {data.description}
                                </p>
                            )}
                        </m.div>
                    </div>
                </m.div>
            )}
        </AnimatePresence>
    );
}
