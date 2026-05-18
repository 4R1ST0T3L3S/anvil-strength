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
        <section id="beneficios" className="py-32 bg-[#050505] relative overflow-hidden">
            {/* Background Accents removed for uniform background */}

            <div className="max-w-[1400px] mx-auto px-6 relative z-10">
                <div className="text-center mb-20">
                    <h2 className="text-5xl md:text-8xl font-black tracking-tighter uppercase mb-6 text-white font-bebas italic">
                        ¿Por qué <span className="text-anvil-red drop-shadow-[0_0_15px_rgba(220,38,38,0.4)]">Anvil?</span>
                    </h2>
                    <div className="w-24 h-1 bg-anvil-red mx-auto mb-8 shadow-[0_0_10px_rgba(220,38,38,0.5)]"></div>
                    <p className="text-gray-400 max-w-2xl mx-auto text-lg md:text-xl font-medium">
                        Más que un club, somos el entorno donde el talento se convierte en resultado.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {features.map((feature, index) => (
                        <div
                            key={index}
                            className="bg-[#111111]/50 backdrop-blur-sm p-10 rounded-3xl border border-white/5 hover:border-anvil-red/40 transition-all duration-500 group hover:-translate-y-3 shadow-2xl overflow-hidden relative"
                        >
                            {/* Inner Glow on Hover */}
                            <div className="absolute inset-0 bg-gradient-to-br from-anvil-red/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                            
                            <div className="bg-[#050505] w-16 h-16 rounded-2xl flex items-center justify-center mb-8 group-hover:scale-110 transition-transform duration-500 border border-white/10 group-hover:border-anvil-red/30 shadow-xl relative z-10">
                                {feature.icon}
                            </div>
                            
                            <h3 className="text-2xl font-black text-white uppercase mb-4 group-hover:text-anvil-red transition-colors font-bebas italic tracking-wider relative z-10">
                                {feature.title}
                            </h3>
                            
                            <p className="text-gray-400 leading-relaxed text-sm relative z-10">
                                {feature.description}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
