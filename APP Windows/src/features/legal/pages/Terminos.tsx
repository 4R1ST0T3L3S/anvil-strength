import { CabeceraSimple } from '../../../components/layout/CabeceraSimple';
import { useSeo } from '../../../hooks/useSeo';

export function Terminos() {
    useSeo({
        title: 'Términos y Condiciones de Uso | Anvil Strength',
        description: 'Términos y condiciones de uso de la plataforma de Anvil Strength, club de powerlifting federado AEP e IPF.',
        canonical: 'https://anvilstrength.es/legal/terminos'
    });
    return (
        <div className="font-sans min-h-[100dvh] bg-surface-sunken text-ink">
            <CabeceraSimple />
            <div className="max-w-3xl mx-auto px-6 pt-12 pb-24">
                <h1 className="text-4xl font-black text-ink uppercase tracking-tighter mb-12">Términos y Condiciones de Uso</h1>

                <div className="space-y-8 text-sm leading-relaxed">
                    <section>
                        <h2 className="text-lg font-bold text-ink uppercase mb-3">1. Objeto y aceptación</h2>
                        <p>Estos términos regulan el acceso y uso de la plataforma de Anvil Strength (el "Servicio"), operada por el Grupo de Recreación Deportiva de Halterofilia Anvil Strength (ver identificación completa en el <a href="/legal/aviso-legal" className="text-brand-text hover:underline">Aviso Legal</a>). Al crear una cuenta, el usuario acepta estos términos en su totalidad. Si no está de acuerdo, no debe registrarse ni utilizar el Servicio.</p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-ink uppercase mb-3">2. Qué es el Servicio, y qué no es</h2>
                        <p>Anvil Strength es un club deportivo digital de powerlifting, gratuito en su afiliación, que da acceso a una plataforma de gestión de entrenamiento (programación, registro de series, análisis de velocidad de barra, chat, calendario de competiciones).</p>
                        <p className="mt-3"><strong className="text-ink">El entrenamiento personalizado con un entrenador es un servicio distinto</strong>, prestado por cada entrenador a título individual y acordado directamente entre el entrenador y el atleta (precio, forma de pago y condiciones). La plataforma facilita la relación —programación, seguimiento, comunicación— pero no interviene como parte en ese acuerdo económico ni procesa cobros por él.</p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-ink uppercase mb-3">3. Registro y cuenta de usuario</h2>
                        <ul className="space-y-1 list-disc pl-5">
                            <li>Es necesario proporcionar datos veraces al registrarse.</li>
                            <li>La cuenta es personal e intransferible. El usuario es responsable de mantener la confidencialidad de su contraseña.</li>
                            <li>Un entrenador puede dar de alta la ficha de un atleta antes de que este tenga cuenta propia ("atleta gestionado"). Cuando esa persona reclama su acceso, la cuenta y todo su historial pasan a ser exclusivamente suyos.</li>
                            <li>El usuario puede solicitar la baja de su cuenta en cualquier momento escribiendo a <a href="mailto:anvilstrengthclub@gmail.com" className="text-brand-text hover:underline">anvilstrengthclub@gmail.com</a>.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-ink uppercase mb-3">4. Datos de salud y rendimiento deportivo</h2>
                        <p>El Servicio trata datos relativos a marcas, cargas de entrenamiento, categoría de peso, vídeos de series y respuestas a cuestionarios de bienestar (check-ins), que pueden constituir datos de salud a efectos del artículo 9 del RGPD. Al completar estos campos, el usuario presta su consentimiento explícito para ese tratamiento, con la única finalidad de prestar el servicio de entrenamiento. Puede ampliar esta información en la <a href="/legal/privacidad" className="text-brand-text hover:underline">Política de Privacidad</a>.</p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-ink uppercase mb-3">5. Contenido generado por el usuario</h2>
                        <p>Las reseñas, mensajes de chat, notas y demás contenido que el usuario publique en la plataforma son de su responsabilidad. No se permite contenido difamatorio, falso, discriminatorio o que infrinja derechos de terceros. Anvil Strength se reserva el derecho de eliminar contenido que incumpla estas condiciones.</p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-ink uppercase mb-3">6. Uso aceptable</h2>
                        <p>El usuario se compromete a no utilizar el Servicio para fines distintos a los previstos, no intentar acceder a cuentas ajenas, no interferir con el funcionamiento de la plataforma y no realizar ingeniería inversa sobre el software.</p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-ink uppercase mb-3">7. Limitación de responsabilidad</h2>
                        <p>El Servicio se presta "tal cual". Anvil Strength no garantiza la disponibilidad ininterrumpida de la plataforma ni se responsabiliza de las decisiones de entrenamiento tomadas a partir de los datos mostrados: la programación y su supervisión son responsabilidad del entrenador asignado. El club tampoco es parte del acuerdo económico entre entrenador y atleta y no responde de él.</p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-ink uppercase mb-3">8. Modificación de estos términos</h2>
                        <p>Estos términos pueden actualizarse para reflejar cambios en el Servicio o en la normativa aplicable. Los cambios sustanciales se comunicarán a los usuarios registrados.</p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-ink uppercase mb-3">9. Legislación aplicable</h2>
                        <p>Estos términos se rigen por la legislación española. Para cualquier controversia, las partes se someten a los Juzgados y Tribunales del domicilio del usuario, de conformidad con la legislación de consumidores aplicable.</p>
                    </section>

                    <p className="text-gray-600 text-xs mt-12">Última actualización: agosto 2026</p>
                </div>
            </div>
        </div>
    );
}
