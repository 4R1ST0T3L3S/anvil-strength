import { PublicHeader } from '../../../components/layout/PublicHeader';
import { PublicFooter } from '../../../components/layout/PublicFooter';
import { ProfileSection } from '../components/ProfileSection';
import { UserProfile, useUser } from '../../../hooks/useUser';
import { ShieldAlert } from 'lucide-react';

interface ProfilePageProps {
    user: UserProfile;
    onLoginClick: () => void;
}

export function ProfilePage({ user, onLoginClick }: ProfilePageProps) {
    const { refetch } = useUser();

    return (
        <div className="min-h-screen bg-[#1c1c1c] font-sans selection:bg-anvil-red flex flex-col">
            <PublicHeader onLoginClick={onLoginClick} />
            <div className="flex-1 pt-32 pb-20 px-4">
                <div className="max-w-4xl mx-auto mb-8 bg-[#151515] border border-amber-500/20 rounded-2xl p-6 flex flex-col sm:flex-row items-center gap-6 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500/10 via-amber-500 to-amber-500/10" />
                    <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center border border-amber-500/20 shrink-0">
                        <ShieldAlert className="w-8 h-8 text-amber-500" />
                    </div>
                    <div>
                        <h2 className="text-xl font-black uppercase tracking-tight text-white mb-1">Cuenta en Revisión</h2>
                        <p className="text-gray-400 text-sm">
                            Tu cuenta está pendiente de aprobación por el equipo de Anvil Strength. Mientras tanto, puedes configurar tu perfil.
                        </p>
                    </div>
                </div>
                <ProfileSection user={user} onUpdate={() => refetch()} />
            </div>
            <PublicFooter />
        </div>
    );
}
