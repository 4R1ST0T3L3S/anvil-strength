import { PublicHeader } from '../../../components/layout/PublicHeader';
import { PublicFooter } from '../../../components/layout/PublicFooter';
import { useSeo } from '../../../hooks/useSeo';

interface LegalPageProps {
    onLoginClick: () => void;
}

export function PoliticaPrivacidad({ onLoginClick }: LegalPageProps) {
    useSeo({
        title: 'Política de Privacidad | Anvil Strength',
        description: 'Política de privacidad y protección de datos (RGPD) del club de powerlifting Anvil Strength.',
        canonical: 'https://anvilstrength.es/legal/privacidad'
    });
    return (
        <div className="font-sans min-h-[100dvh] bg-[#0a0a0a] text-gray-300">
            <PublicHeader onLoginClick={onLoginClick} />
            <div className="max-w-3xl mx-auto px-6 pt-40 pb-24">
                <h1 className="text-4xl font-black text-white uppercase tracking-tighter mb-12">Política de Privacidad</h1>

                <div className="space-y-8 text-sm leading-relaxed">
                    <section>
                        <h2 className="text-lg font-bold text-white uppercase mb-3">1. Responsable del tratamiento</h2>
                        <ul className="space-y-1 list-disc pl-5">
                            <li><strong className="text-white">Responsable:</strong> Grupo de Recreación Deportiva de Halterofilia Anvil Strength</li>
                            <li><strong className="text-white">CIF:</strong> G23890999</li>
                            <li><strong className="text-white">Domicilio:</strong> Calle Pablo Neruda 47, Puerto de Sagunto, Valencia (España)</li>
                            <li><strong className="text-white">Email:</strong> anvilstrengthclub@gmail.com</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-white uppercase mb-3">2. Datos que recogemos</h2>
                        <p>A través del sitio web y la plataforma de entrenamiento, podemos recoger los siguientes datos personales:</p>
                        <ul className="mt-3 space-y-1 list-disc pl-5">
                            <li><strong className="text-white">Registro de usuario:</strong> nombre, apellidos, dirección de correo electrónico, contraseña (cifrada), foto de perfil (opcional).</li>
                            <li><strong className="text-white">Formulario de inscripción:</strong> nombre, email, nivel de experiencia deportiva y otra información que el usuario proporcione voluntariamente.</li>
                            <li><strong className="text-white">Plataforma de entrenamiento:</strong> datos de rendimiento deportivo (cargas, repeticiones, velocidad de barra, vídeos de entrenamiento), bloque de entrenamiento y notas del entrenador.</li>
                            <li><strong className="text-white">Reseñas:</strong> nombre del atleta y texto de la reseña publicada.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-white uppercase mb-3">3. Finalidad del tratamiento</h2>
                        <ul className="space-y-1 list-disc pl-5">
                            <li>Gestionar el registro y la cuenta de usuario en la plataforma.</li>
                            <li>Prestar los servicios de entrenamiento y seguimiento deportivo.</li>
                            <li>Gestionar la inscripción al club y la afiliación federativa (AEP/IPF).</li>
                            <li>Comunicar información relevante sobre el club, competiciones y actividades.</li>
                            <li>Publicar las reseñas proporcionadas por los usuarios en la web pública.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-white uppercase mb-3">4. Base legal</h2>
                        <p>El tratamiento de los datos se basa en:</p>
                        <ul className="mt-3 space-y-1 list-disc pl-5">
                            <li><strong className="text-white">Consentimiento:</strong> al registrarse o enviar el formulario de inscripción, el usuario consiente el tratamiento de sus datos para las finalidades indicadas.</li>
                            <li><strong className="text-white">Ejecución de contrato:</strong> el tratamiento es necesario para la prestación de los servicios de entrenamiento solicitados.</li>
                            <li><strong className="text-white">Interés legítimo:</strong> comunicaciones sobre actividades del club y competiciones relevantes para el usuario.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-white uppercase mb-3">5. Datos de categoría especial</h2>
                        <p>Las marcas, cargas de entrenamiento, vídeos de series y respuestas a cuestionarios de bienestar (check-ins) pueden constituir <strong className="text-white">datos relativos a la salud</strong> en el sentido del artículo 9 del RGPD. Su tratamiento se basa en el <strong className="text-white">consentimiento explícito</strong> del usuario, prestado al completar estos campos de forma voluntaria, y tiene como única finalidad la prestación del servicio de entrenamiento por parte del entrenador asignado. El usuario puede retirar este consentimiento en cualquier momento, lo que puede implicar que el entrenador deje de poder prestar el servicio de programación.</p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-white uppercase mb-3">6. Destinatarios y transferencias internacionales</h2>
                        <p>Los datos personales podrán ser comunicados a:</p>
                        <ul className="mt-3 space-y-1 list-disc pl-5">
                            <li><strong className="text-white">Supabase Inc.</strong> (proveedor de base de datos y autenticación). Los datos se alojan en un centro de datos ubicado en la Unión Europea.</li>
                            <li><strong className="text-white">Vercel Inc.</strong> (proveedor de alojamiento web, con sede en EE. UU.). La transferencia de datos fuera del Espacio Económico Europeo que esto pueda implicar se ampara en las Cláusulas Contractuales Tipo de la Comisión Europea suscritas por el proveedor.</li>
                            <li><strong className="text-white">Google LLC</strong>, únicamente si el usuario elige iniciar sesión con su cuenta de Google (autenticación OAuth).</li>
                            <li><strong className="text-white">Asociación Española de Powerlifting (AEP)</strong> para la tramitación de licencias federativas, previa autorización del usuario.</li>
                        </ul>
                        <p className="mt-3">No se venden ni se ceden datos a terceros con fines publicitarios. Solo se comunican los estrictamente necesarios para prestar el servicio.</p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-white uppercase mb-3">7. Conservación de los datos</h2>
                        <ul className="space-y-1 list-disc pl-5">
                            <li><strong className="text-white">Datos de cuenta y entrenamiento:</strong> mientras el usuario mantenga su cuenta activa y, una vez solicitada la baja, hasta 6 meses adicionales por si se solicita su recuperación, salvo que la ley exija un plazo distinto.</li>
                            <li><strong className="text-white">Reseñas públicas:</strong> hasta que el usuario solicite su eliminación.</li>
                            <li><strong className="text-white">Datos fiscales o de facturación</strong> (si los hubiera): 5 años, conforme a la normativa tributaria.</li>
                        </ul>
                        <p className="mt-3">Transcurridos los plazos, los datos se eliminan o se anonimizan de forma irreversible.</p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-white uppercase mb-3">8. Derechos del usuario</h2>
                        <p>El usuario puede ejercer los siguientes derechos en cualquier momento, dirigiendo su solicitud a <a href="mailto:anvilstrengthclub@gmail.com" className="text-anvil-red hover:underline">anvilstrengthclub@gmail.com</a>:</p>
                        <ul className="mt-3 space-y-1 list-disc pl-5">
                            <li><strong className="text-white">Acceso:</strong> conocer qué datos personales tratamos.</li>
                            <li><strong className="text-white">Rectificación:</strong> corregir datos inexactos.</li>
                            <li><strong className="text-white">Supresión:</strong> solicitar la eliminación de sus datos.</li>
                            <li><strong className="text-white">Oposición:</strong> oponerse a un tratamiento específico.</li>
                            <li><strong className="text-white">Limitación:</strong> solicitar la limitación del tratamiento.</li>
                            <li><strong className="text-white">Portabilidad:</strong> recibir sus datos en formato electrónico.</li>
                        </ul>
                        <p className="mt-3">Si considera que sus derechos no han sido debidamente atendidos, puede presentar una reclamación ante la <strong className="text-white">Agencia Española de Protección de Datos (AEPD)</strong> — <a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer" className="text-anvil-red hover:underline">www.aepd.es</a>.</p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-white uppercase mb-3">9. Seguridad</h2>
                        <p>Aplicamos medidas técnicas y organizativas para proteger los datos personales: cifrado en tránsito (HTTPS/TLS), autenticación segura, control de acceso basado en roles (entrenador, atleta, administrador) y almacenamiento en servidores de Supabase con cifrado en reposo.</p>
                    </section>

                    <p className="text-gray-600 text-xs mt-12">Última actualización: agosto 2026</p>
                </div>
            </div>
            <PublicFooter />
        </div>
    );
}
