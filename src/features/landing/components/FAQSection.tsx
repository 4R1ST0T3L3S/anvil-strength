import { useState } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { useJsonLd } from '../../../hooks/useJsonLd';
import { Fold } from './landingKit';
import { useTextosWeb } from '../textos';

export function FAQSection() {
    const [activeIndex, setActiveIndex] = useState<number | null>(null);
    // Las preguntas, en el idioma elegido: ver ../textos.ts.
    const c = useTextosWeb().faq;
    const faqs = c.preguntas;

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
                    {c.titulo}
                </h2>
                <p className="mt-5 max-w-[52ch] text-t-lg leading-relaxed text-ink-muted">
                    {c.intro}
                </p>

                {/* Una sola lista con separadores, no seis tarjetas con borde.
                    Un acordeón YA se lee como lista; meter cada fila en su
                    propia caja duplica el contorno sin añadir jerarquía. */}
                <div className="mt-12 divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
                    {faqs.map((faq, i) => {
                        const open = activeIndex === i;
                        return (
                            <div key={i}>
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
                    {c.falta}{' '}
                    <a
                        href="mailto:anvilstrengthclub@gmail.com"
                        className="font-bold text-brand-text underline-offset-4 hover:underline"
                    >
                        {c.escribenos}
                    </a>
                    .
                </p>
            </div>
        </Fold>
    );
}
