import { useNavigate } from 'react-router-dom';
import { useUser } from '../../hooks/useUser';
import { Loader } from 'lucide-react';

interface SmartAuthButtonProps {
    variant?: 'primary' | 'secondary' | 'ghost';
    className?: string;
    onLoginClick?: () => void;
}

export function SmartAuthButton({
    variant = 'primary',
    className = '',
    onLoginClick
}: SmartAuthButtonProps) {
    const { data: user, isLoading } = useUser();
    const navigate = useNavigate();

    const handleClick = () => {
        if (isLoading) return;

        // No user -> trigger login modal
        if (!user) {
            if (onLoginClick) {
                onLoginClick();
            }
            return;
        }

        // User exists -> navigate to their dashboard
        const destination = user.role === 'coach' ? '/coach-dashboard' : '/dashboard';
        navigate(destination);
    };

    // Variant styles
    const baseStyles = 'inline-flex items-center justify-center gap-2 font-black uppercase tracking-wider transition-all rounded-lg disabled:opacity-50 disabled:cursor-not-allowed';

    const variantStyles = {
        primary: 'bg-anvil-red hover:bg-red-700 text-white px-8 py-4 text-lg shadow-lg shadow-anvil-red/20 hover:shadow-anvil-red/40',
        secondary: 'bg-white hover:bg-gray-200 text-black px-6 py-3 text-base',
        ghost: 'bg-transparent hover:bg-white/10 text-white border-2 border-white/20 hover:border-white px-6 py-2 text-sm'
    };

    const buttonText = isLoading
        ? 'Cargando...'
        : !user
            ? 'Iniciar Sesión'
            : 'Ir a mi Panel';

    return (
        <button
            onClick={handleClick}
            disabled={isLoading}
            className={`${baseStyles} ${variantStyles[variant]} ${className}`}
        >
            {isLoading && <Loader className="animate-spin" size={18} />}
            <span>{buttonText}</span>
        </button>
    );
}
