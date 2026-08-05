import { Fold, PressButton, StaggerList, StaggerItem } from './landingKit';

/**
 * CÓMO SE ENTRA AL CLUB
 *
 * Los números (1, 2, 3) se quedan porque aquí SÍ son una secuencia real: no
 * se puede competir antes de que te asignen entrenador. Ese es el único caso
 * en que numerar una sección aporta algo — en el resto de la página no hay
 * ni un "01 · Sobre nosotros", que es puro andamiaje.
 *
 * Antes cada paso era un círculo de 112px con un icono dentro, una insignia
 * numerada encima y una línea de conexión con degradado. Cuatro elementos
 * decorativos para decir "primero", "segundo" y "tercero".
 */
export function HowItWorksSection() {
    const steps = [
        {
            title: 'Te creas la cuenta',
            desc: 'Apodo, email y contraseña. Nada más. Ya puedes entrar y ver la aplicación por dentro.',
        },
        {
            title: 'Te asignamos entrenador',
            desc: 'Rellenas la ficha de inscripción y revisamos tu caso. Te asignamos entrenador y, si lo necesitas, nutricionista.',
        },
        {
            title: 'Compites con Anvil',
            desc: 'Tu bloque de entrenamiento, el calendario de competiciones y la tramitación con la AEP, desde el primer día.',
        },
    ];

    return (
        <Fold tone="dark" className="py-24 md:py-32">
            <h2 className="text-d-md font-black uppercase leading-[0.95] text-ink text-balance">
                Cómo se entra
            </h2>
            <p className="mt-5 max-w-[52ch] text-t-lg leading-relaxed text-ink-muted">
                Tres pasos. Sin letra pequeña y sin nivel mínimo.
            </p>

            <StaggerList className="mt-14 grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-8">
                {steps.map((step, i) => (
                    <StaggerItem key={step.title}>
                        {/* El número va ENORME y en el color de fondo del propio
                            fold, oscurecido: estructura la lectura sin competir
                            con el titular del paso. */}
                        <span
                            aria-hidden="true"
                            className="block text-[4rem] font-black leading-none tracking-display text-ink/15"
                        >
                            {i + 1}
                        </span>
                        <h3 className="mt-3 text-t-2xl font-black uppercase leading-tight tracking-display text-ink">
                            {step.title}
                        </h3>
                        <p className="mt-3 max-w-[46ch] text-t-base leading-relaxed text-ink-muted">
                            {step.desc}
                        </p>
                    </StaggerItem>
                ))}
            </StaggerList>

            <div className="mt-16 flex flex-wrap items-center gap-x-6 gap-y-4">
                <PressButton
                    tone="brand"
                    onClick={() =>
                        document.querySelector('#afiliacion')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                    }
                >
                    Empezar — es gratis
                </PressButton>
                <p className="text-t-sm font-medium text-ink-muted">
                    Sin cuota · Sin compromiso · Sin nivel mínimo
                </p>
            </div>
        </Fold>
    );
}
