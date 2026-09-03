import { AuthModal } from '../components/AuthModal';

/**
 * Pantalla de entrada de la aplicación de escritorio.
 *
 * Aquí no hay web pública: la portada publicitaria vive en su propio
 * producto (carpeta `Landing Page`). Quien abre la app sin sesión ve esto, y
 * en cuanto entra `AppRoutes` lo manda a su panel.
 *
 * Reutiliza el formulario de `AuthModal` en modo `inline`: mismo login,
 * mismo alta, mismo Google, sin la capa oscura ni el botón de cerrar (no hay
 * nada detrás a lo que volver).
 */
export function LoginPage() {
    return (
        <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-10 bg-surface-sunken p-8 text-ink">
            <img
                src="/logo-dark-removebg-preview.png"
                alt="Anvil Strength"
                width={200}
                height={80}
                className="h-20 w-auto object-contain"
            />
            <AuthModal isOpen onClose={() => {}} inline />
        </div>
    );
}
