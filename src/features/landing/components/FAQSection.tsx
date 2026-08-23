import { useState } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { useJsonLd } from '../../../hooks/useJsonLd';
import { Fold } from './landingKit';

const faqs = [
    {
        q: '¿Necesito un nivel mínimo para unirme?',
        a: 'No. En Anvil Strength llevamos atletas desde su primera competición hasta el nivel nacional. Lo único que pedimos es ganas de competir y compromiso con el proceso.',
    },
    {
        q: '¿Cuánto cuesta unirse al club?',
        a: 'Unirse al club es completamente gratuito: no hay cuota. Los costes que sí tendrás son las tasas oficiales de la AEP para federarte (una vez al año) y las inscripciones a competiciones, que van por tu cuenta. Aparte de eso, el entrenamiento personalizado con tu entrenador es un servicio de pago que acuerdas directamente con él — el club no cobra ninguna comisión sobre eso.',
    },
    {
        q: '¿Necesito entrenar en un gimnasio específico?',
        a: 'No. Somos un club 100% digital. Puedes estar en cualquier punto de España y entrenar en el gimnasio que prefieras. Tu entrenador trabaja contigo de forma remota con la misma calidad que si estuviera a tu lado.',
    },
    {
        q: '¿Qué son la AEP y la IPF?',
        a: 'La AEP (Asociación Española de Powerlifting) es la federación nacional que organiza los campeonatos en España. La IPF (International Powerlifting Federation) es la federación mundial. Anvil Strength está afiliado a ambas, lo que te permite competir en todos sus campeonatos oficiales.',
    },
    {
        q: '¿Cómo me federo para poder competir?',
        a: 'Una vez que formes parte del equipo, te guiamos en todo el proceso de federación con la AEP. Es más sencillo de lo que parece y el proceso se hace una vez al año. Tu entrenador te acompaña en cada paso.',
    },
    {
        q: '¿Qué incluye el acceso a la app del club?',
        a: 'La app incluye tu bloque de entrenamiento personalizado, chat directo con tu entrenador y nutricionista, seguimiento de tus marcas personales, calendario de competiciones del equipo, análisis de velocidad de barra (VBT), y acceso a la comunidad de atletas.',
    },
];

export function FAQSection() {
    const [activeIndex, setActiveIndex] = useState<number | null>(null);

    const toggle = (i: number) => setActiveIndex(activeIndex === i ? null : i);

    // El esquema se genera a partir del MISMO array que se pinta. Antes vivía
    // suelto en index.html con cinco preguntas redactadas de otra forma frente
    // a las seis de aquí: en cuanto se tocaba una, los datos estructurados
    // dejaban de corresponderse con lo que el usuario leía.
    useJsonLd('ld-faq', {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqs.map((faq) => ({
            '@type': 'Question',
            name: faq.q,
            acceptedAnswer: { '@type': 'Answer', text: faq.a },
        })),
    });

    return (
        <Fold tone="dark" className="py-24 md:py-32">
            <div className="mx-auto max-w-3xl">
                <h2 className="text-d-md font-black uppercase leading-[0.95] text-ink text-balance">
                    Preguntas frecuentes
                </h2>
                <p className="mt-5 max-w-[52ch] text-t-lg leading-relaxed text-ink-muted">
                    Las dudas que salen siempre cuando alguien se acerca al powerlifting por
                    primera vez.
                </p>

                {/* Una sola lista con separadores, no seis tarjetas con borde.
                    Un acordeón YA se lee como lista; meter cada fila en su
                    propia caja duplica el contorno sin añadir jerarquía. */}
                <div className="mt-12 divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
                    {faqs.map((faq, i) => {
                        const open = activeIndex === i;
                        return (
                            <div key={faq.q}>
                                <h3>
                                    <button
                                        onClick={() => toggle(i)}
                                        aria-expanded={open}
                                        className="group flex w-full items-center justify-between gap-6 py-5 text-left"
                                    >
                                        <span className="text-t-lg font-bold leading-snug text-ink">
                                            {faq.q}
                                        </span>
                                        <ChevronDown
                                            size={20}
                                            aria-hidden="true"
                                            className={`shrink-0 text-ink-muted transition-transform duration-base ease-snap ${open ? 'rotate-180' : ''}`}
                                        />
                                    </button>
                                </h3>

                                <AnimatePresence initial={false}>
                                    {open && (
                                        <m.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                                            className="overflow-hidden"
                                        >
                                            <p className="max-w-[68ch] pb-6 text-t-base leading-relaxed text-ink-muted">
                                                {faq.a}
                                            </p>
                                        </m.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        );
                    })}
                </div>

                <p className="mt-10 text-t-sm text-ink-muted">
                    ¿Te falta alguna?{' '}
                    <a
                        href="mailto:anvilstrengthclub@gmail.com"
                        className="font-bold text-brand underline-offset-4 hover:underline"
                    >
                        Escríbenos
                    </a>
                    .
                </p>
            </div>
        </Fold>
    );
}
