import { m, useAnimation } from "framer-motion";
import { useEffect, useState } from "react";

export const AnvilMascot = ({ className = "w-32 h-32" }: { className?: string }) => {
    const controls = useAnimation();
    const [isLifting, setIsLifting] = useState(false);

    useEffect(() => {
        let isMounted = true;

        const sequence = async () => {
            while (isMounted) {
                // Estado Normal (Respirando)
                setIsLifting(false);
                await controls.start({
                    y: [0, -5, 0],
                    transition: { duration: 3, ease: "easeInOut" }
                });

                // Espera aleatoria antes del Deadlift (entre 2 y 5 segundos)
                await new Promise(r => setTimeout(r, Math.random() * 3000 + 4000));

                if (!isMounted) break;

                // --- DEADLIFT TIME ---
                setIsLifting(true);

                // 1. Setup (Bajar a la barra)
                await controls.start({
                    y: 20,
                    scaleY: 0.95,
                    transition: { duration: 0.5, ease: "easeOut" }
                });

                // 2. Lift (Subir explosivo)
                await controls.start({
                    y: -10,
                    scaleY: 1.05,
                    transition: { duration: 0.2, ease: "easeOut" }
                });

                // 3. Lockout (Aguantar arriba)
                await new Promise(r => setTimeout(r, 800));

                // 4. Bajar (Controlado)
                await controls.start({
                    y: 0,
                    scaleY: 1,
                    transition: { type: "spring", bounce: 0.25, duration: 0.8 }
                });
            }
        };

        sequence();

        return () => { isMounted = false; };
    }, [controls]);

    return (
        <div className={`relative flex items-center justify-center ${className}`}>
            <m.div
                className="w-full h-full relative"
                animate={controls}
            >
                <div className="relative w-full h-full">
                    {/* LOGO IMAGE */}
                    <img
                        src="/logo-dark-removebg-preview.png"
                        alt="Anvil Mascot"
                        className="w-full h-full object-contain drop-shadow-[0_10px_10px_rgba(0,0,0,0.5)] z-10 relative"
                    />

                    {/* OVERLAY: OJOS, BOCA, BRAZOS, PIERNAS, BARRA */}
                    <svg
                        className="absolute inset-0 w-full h-full z-20 pointer-events-none overflow-visible"
                        viewBox="0 0 200 200"
                    >
                        {/* --- BARRA DE PESO MUERTO (Solo visible durante el lift) --- */}
                        <m.g
                            initial={{ opacity: 0 }}
                            animate={{
                                opacity: isLifting ? 1 : 0,
                                y: isLifting ? [0, 0, 0] : 0 // Posición relativa
                            }}
                            transition={{ duration: 0.2 }}
                        >
                            {/* Barra */}
                            <rect x="-20" y="160" width="240" height="8" fill="#555" rx="4" />
                            {/* Discos Izquierda */}
                            <rect x="-20" y="130" width="15" height="68" fill="#1c1c1c" rx="2" />
                            <rect x="-5" y="135" width="10" height="58" fill="#dc2626" rx="1" /> {/* Rojo Anvil */}
                            <rect x="5" y="138" width="8" height="52" fill="#1c1c1c" rx="1" />

                            {/* Discos Derecha */}
                            <rect x="205" y="130" width="15" height="68" fill="#1c1c1c" rx="2" />
                            <rect x="195" y="135" width="10" height="58" fill="#dc2626" rx="1" />
                            <rect x="187" y="138" width="8" height="52" fill="#1c1c1c" rx="1" />
                        </m.g>

                        {/* --- OJOS --- */}
                        <m.g
                            // Parpadeo normal, ojos "esforzados" durante el lift
                            animate={isLifting ? { scaleY: 0.8 } : { scaleY: [1, 0.1, 1, 1, 1] }}
                            transition={isLifting ? { duration: 0.2 } : { repeat: Infinity, duration: 4, times: [0, 0.05, 0.1, 0.5, 1] }}
                            style={{ originY: "50%", originX: "50%" }}
                        >
                            <circle cx="70" cy="85" r="8" fill="white" stroke="black" strokeWidth="2" />
                            <circle cx="70" cy="85" r={isLifting ? 2 : 3} fill="black" /> {/* Pupila se contrae con esfuerzo */}

                            <circle cx="130" cy="85" r="8" fill="white" stroke="black" strokeWidth="2" />
                            <circle cx="130" cy="85" r={isLifting ? 2 : 3} fill="black" />
                        </m.g>

                        {/* --- SONRISA / BOCA DE ESFUERZO --- */}
                        {/* Se transforma de sonrisa curva a linea recta de esfuerzo */}
                        {/* `path` normal, NO `m.path`.
                            framer-motion NO sabe animar el atributo `d` de un
                            SVG: no interpola trazados (para eso hace falta algo
                            como flubber). Lo que hacía era peor que no animar
                            —tomaba el control de `d` y escribía la cadena
                            "undefined" ENCIMA del valor estático—, así que el
                            navegador rechazaba el trazado entero:
                            «Expected moveto path command ('M' or 'm')».
                            Resultado: la boca, los brazos y las piernas del
                            muñeco no se dibujaban NUNCA. No era una animación
                            que fallara, era el dibujo que no existía.
                            El cambio de pose es ahora instantáneo. Es lo que
                            hay sin una librería de morphing, y para un guiño de
                            la portada sobra: lo que se lee es que cambia de
                            cara al levantar, no cuánto tarda en cambiarla. */}
                        <path
                            d={isLifting ? "M85 115 Q100 115 115 115" : "M80 110 Q100 125 120 110"}
                            stroke="black"
                            strokeWidth="4"
                            strokeLinecap="round"
                            fill="none"
                        />

                        {/* --- BRAZOS --- */}
                        {/* Izquierdo */}
                        {/* Ver la nota de la boca: `path`, no `m.path`.
                            Aquí el estado de reposo era además un array de
                            fotogramas (un vaivén de respiración) que tampoco
                            llegó a moverse nunca; se queda su primer fotograma. */}
                        <path
                            d={isLifting
                                ? "M40 100 L40 160"          // estirado, agarrando la barra
                                : "M40 100 Q20 100 20 60"}   // flexionado
                            stroke="white"
                            strokeWidth="5"
                            strokeLinecap="round"
                            fill="none"
                        />
                        {/* Derecho */}
                        <path
                            d={isLifting
                                ? "M160 100 L160 160"
                                : "M160 100 Q180 100 180 60"}
                            stroke="white"
                            strokeWidth="5"
                            strokeLinecap="round"
                            fill="none"
                        />

                        {/* --- PIERNAS (Se comprimen al bajar) --- */}
                        <path
                            d={isLifting ? "M80 150 L80 160 L70 160" : "M80 150 L80 185 L70 185"}
                            stroke="white" strokeWidth="5" strokeLinecap="round" fill="none"
                        />
                        <path
                            d={isLifting ? "M120 150 L120 160 L130 160" : "M120 150 L120 185 L130 185"}
                            stroke="white" strokeWidth="5" strokeLinecap="round" fill="none"
                        />
                    </svg>
                </div>

                {/* --- SOMBRA DEL SUELO --- */}
                <m.div
                    className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-2/3 h-2 bg-black/40 blur-sm rounded-[100%]"
                    animate={{ scaleX: [1, 0.8, 1], opacity: [0.4, 0.2, 0.4] }}
                    transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                />
            </m.div>
        </div>
    );
};
