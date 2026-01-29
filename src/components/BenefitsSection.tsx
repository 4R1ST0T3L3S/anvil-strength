import { BadgePercent, Smartphone, Users, Calendar, Trophy, BarChart3 } from 'lucide-react';

export function BenefitsSection() {
    const features = [
        {
            icon: <BadgePercent className="w-8 h-8 text-anvil-red" />,
            title: "0% Comisiones",
            description: "Solo pagas las tasas oficiales de la AEP. Nos llevamos un 0% de comisión. Tu dinero va a tu deporte.",
        },
        {
            icon: <Smartphone className="w-8 h-8 text-anvil-red" />,
            title: "App Exclusiva",
            description: "Acceso a nuestra plataforma privada para gestionar toda tu carrera deportiva desde el bolsillo.",
        },
        {
            icon: <Users className="w-8 h-8 text-anvil-red" />,
            title: "Comunidad",
            description: "Chat directo con tu entrenador, dietista y compañeros de equipo. Nunca entrenarás solo.",
        },
        {
            icon: <Calendar className="w-8 h-8 text-anvil-red" />,
            title: "Calendario",
            description: "Visualiza tus competiciones, eventos de equipo y planificación anual de un vistazo.",
        },
        {
            icon: <Trophy className="w-8 h-8 text-anvil-red" />,
            title: "Competiciones",
            description: "Gestión de inscripciones y seguimiento de tus marcas en cada campeonato.",
        },
        {
            icon: <BarChart3 className="w-8 h-8 text-anvil-red" />,
            title: "Planificación",
            description: "Recibe y visualiza tu programación de entrenamiento detallada semana a semana.",
        },
    ];

    return (
        <section id="beneficios" className="py-24 bg-[#1c1c1c] relative overflow-hidden">
            {/* Background Accents */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-anvil-red/5 rounded-full blur-[100px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-full blur-[80px] pointer-events-none" />

            <div className="max-w-[1400px] mx-auto px-6 relative z-10">
                <div className="text-center mb-16">
                    <h2 className="text-4xl md:text-5xl font-black tracking-tighter uppercase mb-4 text-white">
                        ¿Por qué <span className="text-anvil-red">Anvil?</span>
                    </h2>
                    <p className="text-gray-400 max-w-2xl mx-auto text-lg">
                        Más que un club, somos una herramienta para tu éxito. Sin costes ocultos, con tecnología punta.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {features.map((feature, index) => (
                        <div
                            key={index}
                            className="bg-[#252525] p-8 rounded-2xl border border-white/5 hover:border-anvil-red/50 transition-all duration-300 group hover:-translate-y-2 hover:shadow-2xl hover:shadow-anvil-red/10"
                        >
                            <div className="bg-[#1c1c1c] w-14 h-14 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 border border-white/5">
                                {feature.icon}
                            </div>
                            <h3 className="text-xl font-bold text-white uppercase mb-3 group-hover:text-anvil-red transition-colors">
                                {feature.title}
                            </h3>
                            <p className="text-gray-400 leading-relaxed text-sm">
                                {feature.description}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
