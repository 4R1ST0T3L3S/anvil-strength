import { useState } from 'react';
import { LogOut, X, Home } from 'lucide-react';
import { NotificationBell } from '../ui/NotificationBell';
import { UserProfile } from '../../hooks/useUser';
import { getDisplayName, getUserInitials } from '../../utils/userDisplayName';

interface MenuItem {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    isActive: boolean;
    isExternal?: boolean;
    href?: string;
}

interface DashboardLayoutProps {
    user: UserProfile;
    onLogout: () => void;
    onOpenSettings?: () => void;
    menuItems: MenuItem[];
    children: React.ReactNode;
    roleLabel: string; // 'Athlete' or 'Coach'
    hideSidebarOnDesktop?: boolean;
    hideMobileHeader?: boolean;
}

// Extracted SidebarContent as a separate component to avoid creation during render
interface SidebarContentProps {
    user: UserProfile;
    roleLabel: string;
    menuItems: MenuItem[];
    onLogout: () => void;
    onOpenSettings?: () => void;
    toggleMobileMenu: () => void;
}

const SidebarContent: React.FC<SidebarContentProps> = ({
    user,
    roleLabel,
    menuItems,
    onLogout,
    onOpenSettings,
    toggleMobileMenu
}) => (
    <div className="flex flex-col h-full bg-[#252525] border-r border-white/5">
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <img src="/logo.svg" alt="Anvil" className="h-8 w-auto" />
                <span className="font-black text-xl tracking-tighter uppercase">{roleLabel}</span>
            </div>
            {/* Bell for Desktop in Sidebar (optional, or better in a top bar if existed. Here it fits in header of sidebar) */}
            <div className="md:block hidden">
                <NotificationBell />
            </div>
            {/* Close button for mobile */}
            <button onClick={toggleMobileMenu} className="md:hidden text-gray-400 hover:text-white">
                <X size={24} />
            </button>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
            {menuItems.map((item, index) => {
                const baseClasses = "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all";
                const activeClasses = "bg-anvil-red text-white font-bold";
                const inactiveClasses = "text-gray-400 hover:bg-white/5 hover:text-white";

                if (item.isExternal && item.href) {
                    return (
                        <a
                            key={index}
                            href={item.href}
                            target="_blank"
                            rel="noreferrer"
                            className={`${baseClasses} ${inactiveClasses}`}
                            onClick={() => toggleMobileMenu()}
                        >
                            {item.icon}
                            {item.label}
                        </a>
                    );
                }

                return (
                    <button
                        key={index}
                        onClick={() => {
                            item.onClick();
                            toggleMobileMenu();
                        }}
                        className={`${baseClasses} ${item.isActive ? activeClasses : inactiveClasses}`}
                    >
                        {item.icon}
                        {item.label}
                    </button>
                );
            })}
        </nav>

        <div className="p-4 border-t border-white/5">
            <div
                className={`flex items-center gap-3 px-4 py-3 mb-2 rounded-lg transition-colors ${onOpenSettings ? 'cursor-pointer hover:bg-white/5' : ''}`}
                onClick={() => onOpenSettings && onOpenSettings()}
            >
                {user.profile_image ? (
                    <img src={user.profile_image} alt="" className="w-8 h-8 rounded-full object-cover" />
                ) : (
                    <div className="w-8 h-8 rounded-full bg-anvil-red flex items-center justify-center text-xs font-bold text-white">
                        {getUserInitials(user)}
                    </div>
                )}
                <div className="overflow-hidden">
                    <p className="text-sm font-bold truncate text-white">{getDisplayName(user)}</p>
                    <p className="text-xs text-gray-500 truncate">
                        {onOpenSettings ? 'Editar Perfil' : roleLabel === 'Coach' ? 'Entrenador' : 'Atleta'}
                    </p>
                </div>
            </div>
            <a
                href="https://anvil-strength.vercel.app/"
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors mb-2"
            >
                <Home size={16} />
                Volver a la Web
            </a>
            <button
                onClick={onLogout}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
                <LogOut size={16} />
                Cerrar Sesión
            </button>
        </div>
    </div>
);

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
    user,
    onLogout,
    onOpenSettings,
    menuItems,
    children,
    roleLabel,
    hideSidebarOnDesktop,
    hideMobileHeader
}) => {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

    return (
        <div className="flex h-screen bg-[#1c1c1c] text-white overflow-hidden font-sans">
            {/* Desktop Sidebar */}
            {!hideSidebarOnDesktop && (
                <aside className="hidden md:flex w-64 flex-col fixed inset-y-0 z-50">
                    <SidebarContent
                        user={user}
                        roleLabel={roleLabel}
                        menuItems={menuItems}
                        onLogout={onLogout}
                        onOpenSettings={onOpenSettings}
                        toggleMobileMenu={toggleMobileMenu}
                    />
                </aside>
            )}

            {/* Main Content */}
            <main className={`flex-1 ${!hideSidebarOnDesktop ? 'md:ml-64' : ''} h-full overflow-y-auto pt-0 pb-20 md:pt-0 md:pb-0 bg-[#1c1c1c]`}>
                {children}
            </main>

            {/* Mobile Bottom Navigation (Instagram Style) */}
            <nav className="md:hidden fixed bottom-0 w-full bg-[#1c1c1c] border-t border-white/10 z-50 px-6 py-3 flex justify-between items-center pb-safe">
                {menuItems.map((item, index) => {
                    // Filter out items that shouldn't appear in bottom nav (like profile if handled separately, but user asked for all icons)
                    // Usually Bottom Nav has 4-5 items max. We have ~6. 
                    // Let's render them all but they might be tight.
                    // The user explicitly asked for "icons situated in the inferior zone".

                    // We should exclude external links if they are not primary navigation, 
                    // or the "Profile" if we want to use the avatar. 
                    // For now, I'll render the passed menuItems.

                    if (item.label === 'QA: Test DB') return null; // Ensure this is definitely gone

                    const isActive = item.isActive;

                    return (
                        <button
                            key={index}
                            onClick={item.onClick}
                            className={`flex flex-col items-center justify-center p-2 transition-colors ${isActive ? 'text-anvil-red' : 'text-gray-500 hover:text-white'
                                }`}
                        >
                            {/* Force icon size for mobile consistency */}
                            <div className={isActive ? "scale-110 transition-transform" : ""}>
                                {item.icon}
                            </div>
                            {/* Optional: No labels for pure "Instagram" look, or tiny labels? 
                                User said "navigation done via icons". Usually implied no text or very small.
                                I will hide text so it fits multiple icons.
                            */}
                        </button>
                    );
                })}

                {/* Profile Avatar as last item if not present in menuItems? 
                   In UserDashboard, "Mi Perfil" is a menu item. So it will be rendered above.
                */}
            </nav>
        </div>
    );
};
