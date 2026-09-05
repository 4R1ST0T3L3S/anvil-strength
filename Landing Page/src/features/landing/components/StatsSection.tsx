import { useRef, useState, useEffect } from 'react';
import { useInView, useReducedMotion } from 'framer-motion';

interface StatItemProps {
    value: number;
    suffix: string;
    label: string;
    duration?: number;
}

/**
 * Cifra que cuenta hacia arriba al entrar en pantalla.
 *
 * Con `prefers-reduced-motion` la cifra sale ya puesta. Un contador es
 * movimiento aunque no se desplace nada, y es de los que peor sientan: obliga
 * a esperar para leer un dato.
 */
function StatCounter({ value, suffix, label, duration = 1400 }: StatItemProps) {
    const ref = useRef<HTMLDivElement>(null);
    const inView = useInView(ref, { once: true, margin: '-40px' });
    const reduce = useReducedMotion();
    const [count, setCount] = useState(reduce ? value : 0);

    useEffect(() => {
        if (!inView || reduce) return;
        let raf = 0;
        let startTime: number | null = null;

        const step = (timestamp: number) => {
            if (startTime === null) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.round(eased * value));
            if (progress < 1) raf = requestAnimationFrame(step);
        };

        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [inView, value, duration, reduce]);

    return (
        <div ref={ref} className="px-6 py-8 text-center">
            <div className="text-[clamp(2.5rem,6vw,3.5rem)] font-black leading-none tracking-display text-ink">
                {count}
                {suffix}
            </div>
            <div className="mt-2 text-t-xs font-bold uppercase tracking-widest text-ink-muted">
                {label}
            </div>
        </div>
    );
}

/**
 * Banda de cifras.
 *
 * Va deliberadamente estrecha, no como un fold entero: son un dato de apoyo,
 * no el argumento de venta. Un club de diez atletas que presume de "10+" a
 * pantalla completa se delata solo.
 */
export function StatsSection() {
    const stats = [
        { value: 10, suffix: '+', label: 'Atletas activos' },
        { value: 5, suffix: '+', label: 'Podios' },
        { value: 2, suffix: '', label: 'Nacionales' },
        { value: 0, suffix: '€', label: 'Cuota mensual' },
    ];

    return (
        <section className="bg-surface-canvas">
            <div className="mx-auto grid max-w-[1180px] grid-cols-2 gap-px bg-[var(--border-subtle)] px-6 md:grid-cols-4 md:px-10">
                {stats.map((stat) => (
                    <div key={stat.label} className="bg-surface-canvas">
                        <StatCounter value={stat.value} suffix={stat.suffix} label={stat.label} />
                    </div>
                ))}
            </div>
        </section>
    );
}
