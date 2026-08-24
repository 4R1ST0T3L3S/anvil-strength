import { PublicHeader } from '../../../components/layout/PublicHeader';
import { PublicFooter } from '../../../components/layout/PublicFooter';
import { useSeo } from '../../../hooks/useSeo';

interface LegalPageProps {
    onLoginClick: () => void;
}

export function AvisoLegal({ onLoginClick }: LegalPageProps) {
    useSeo({
        title: 'Aviso Legal | Anvil Strength',
        description: 'Aviso legal del sitio web de Anvil Strength, club de powerlifting federado AEP e IPF.',
        canonical: 'https://anvilstrength.es/legal/aviso-legal'
    });
    return (
        <div className="font-sans min-h-[100dvh] bg-surface-sunken text-ink">
            <PublicHeader onLoginClick={onLoginClick} />
            <div className="max-w-3xl mx-auto px-6 pt-40 pb-24">
                <h1 className="text-4xl font-black text-ink uppercase tracking-tighter mb-12">Aviso Legal</h1>

                <div className="space-y-8 text-sm leading-relaxed">
                    <section>
                        <h2 className="text-lg font-bold text-ink uppercase mb-3">1. Datos identificativos</h2>
                        <p>En cumplimiento del artículo 10 de la Ley 34/2002, de 11 de julio, de Servicios de la Sociedad de la Información y de Comercio Electrónico (LSSI-CE), se informa al usuario de los datos del titular:</p>
                        <ul className="mt-3 space-y-1 list-disc pl-5">
                            <li><strong className="text-ink">Denominación:</strong> Grupo de Recreación Deportiva de Halterofilia Anvil Strength</li>
                            <li><strong className="text-ink">CIF:</strong> G23890999</li>
                            <li><strong className="text-ink">Domicilio:</strong> Calle Pablo Neruda 47, Puerto de Sagunto, Valencia (España)</li>
                            <li><strong className="text-ink">Email de contacto:</strong> anvilstrengthclub@gmail.com</li>
                            <li><strong className="text-ink">Sitio web:</strong> https://anvilstrength.es</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-ink uppercase mb-3">2. Objeto</h2>
                        <p>Este sitio web tiene por objeto facilitar información sobre el club deportivo Anvil Strength, sus servicios de entrenamiento de powerlifting, su equipo técnico, atletas y actividades. Asimismo, permite a sus miembros acceder a una plataforma de gestión de entrenamiento.</p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-ink uppercase mb-3">3. Propiedad intelectual e industrial</h2>
                        <p>Todos los contenidos del sitio web (textos, imágenes, logotipos, diseño gráfico, código fuente) son propiedad del titular o de terceros que han autorizado su uso, y están protegidos por las leyes de propiedad intelectual e industrial vigentes. Queda prohibida su reproducción, distribución o transformación sin autorización expresa.</p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-ink uppercase mb-3">4. Condiciones de uso</h2>
                        <p>El usuario se compromete a utilizar el sitio web de forma diligente, correcta y lícita, absteniéndose de realizar cualquier actividad que pueda ser contraria a la legislación vigente, a los derechos de terceros, o que pueda dañar, inutilizar o deteriorar el sitio web.</p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-ink uppercase mb-3">5. Responsabilidad</h2>
                        <p>El titular no se hace responsable de los daños que pudieran derivarse del uso del sitio web, ni de la información proporcionada por terceros a través de enlaces externos. El titular se reserva el derecho de modificar el contenido del sitio web sin previo aviso.</p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-ink uppercase mb-3">6. Legislación aplicable y jurisdicción</h2>
                        <p>El presente aviso legal se rige por la legislación española. Para cualquier controversia que pudiera derivarse del acceso o uso del sitio web, las partes se someten a los Juzgados y Tribunales del domicilio del usuario, de conformidad con la legislación vigente.</p>
                    </section>
                </div>
            </div>
            <PublicFooter />
        </div>
    );
}
