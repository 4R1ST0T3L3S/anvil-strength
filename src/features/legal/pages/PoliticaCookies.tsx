import { PublicHeader } from '../../../components/layout/PublicHeader';
import { PublicFooter } from '../../../components/layout/PublicFooter';
import { useSeo } from '../../../hooks/useSeo';

interface LegalPageProps {
    onLoginClick: () => void;
}

export function PoliticaCookies({ onLoginClick }: LegalPageProps) {
    useSeo({
        title: 'Política de Cookies | Anvil Strength',
        description: 'Política de cookies del sitio web del club de powerlifting Anvil Strength.',
        canonical: 'https://anvilstrength.es/legal/cookies'
    });
    return (
        <div className="font-sans min-h-[100dvh] bg-surface-sunken text-ink">
            <PublicHeader onLoginClick={onLoginClick} />
            <div className="max-w-3xl mx-auto px-6 pt-40 pb-24">
                <h1 className="text-4xl font-black text-ink uppercase tracking-tighter mb-12">Política de Cookies</h1>

                <div className="space-y-8 text-sm leading-relaxed">
                    <section>
                        <h2 className="text-lg font-bold text-ink uppercase mb-3">1. ¿Qué son las cookies?</h2>
                        <p>Las cookies son pequeños archivos de texto que los sitios web almacenan en el dispositivo del usuario para recordar información sobre su visita, como preferencias de idioma, datos de sesión u otros.</p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-ink uppercase mb-3">2. Cookies que utilizamos</h2>
                        <p>Este sitio web utiliza exclusivamente las siguientes cookies:</p>
                        <div className="mt-4 overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-line text-left">
                                        <th className="text-ink font-bold py-2 pr-4">Cookie</th>
                                        <th className="text-ink font-bold py-2 pr-4">Tipo</th>
                                        <th className="text-ink font-bold py-2 pr-4">Finalidad</th>
                                        <th className="text-ink font-bold py-2">Duración</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-subtle">
                                    <tr>
                                        <td className="py-2 pr-4 font-mono text-brand-text">sb-*-auth-token</td>
                                        <td className="py-2 pr-4">Técnica (necesaria)</td>
                                        <td className="py-2 pr-4">Sesión de autenticación de Supabase. Necesaria para mantener al usuario conectado.</td>
                                        <td className="py-2">Sesión / 1 año</td>
                                    </tr>
                                    <tr>
                                        <td className="py-2 pr-4 font-mono text-brand-text">aep_calendar_data</td>
                                        <td className="py-2 pr-4">Técnica (caché)</td>
                                        <td className="py-2 pr-4">Almacena en localStorage el calendario de competiciones de la AEP para evitar consultas repetidas.</td>
                                        <td className="py-2">24 horas</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-ink uppercase mb-3">3. Cookies de terceros</h2>
                        <p>Utilizamos <strong className="text-ink">Vercel Analytics</strong> para medir el rendimiento del sitio web. Vercel Analytics <strong className="text-ink">no utiliza cookies</strong> y no recopila datos personales identificables; funciona exclusivamente con datos agregados y anonimizados del lado del servidor.</p>
                        <p className="mt-3">No utilizamos Google Analytics, Facebook Pixel ni ningún otro servicio de seguimiento basado en cookies de terceros.</p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-ink uppercase mb-3">4. Gestión de cookies</h2>
                        <p>Dado que este sitio web utiliza únicamente cookies técnicas estrictamente necesarias para el funcionamiento del servicio (sesión de usuario), no se requiere consentimiento previo conforme al artículo 22.2 de la LSSI-CE. No obstante, el usuario puede configurar su navegador para bloquear o eliminar cookies, aunque esto podría impedir el funcionamiento correcto de la plataforma.</p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-ink uppercase mb-3">5. Más información</h2>
                        <p>Para cualquier consulta sobre el uso de cookies, puede escribirnos a <a href="mailto:anvilstrengthclub@gmail.com" className="text-brand-text hover:underline">anvilstrengthclub@gmail.com</a>.</p>
                    </section>

                    <p className="text-gray-600 text-xs mt-12">Última actualización: julio 2026</p>
                </div>
            </div>
            <PublicFooter />
        </div>
    );
}
