import React, { useState } from 'react';
import { LogOut, Menu, X } from 'lucide-react';

interface MenuItem {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    isActive: boolean;
    isExternal?: boolean;
    href?: string;
}

interface DashboardLayoutProps {
    user: any;
    onLogout: () => void;
    onOpenSettings?: () => void;
    menuItems: MenuItem[];
    children: React.ReactNode;
    roleLabel: string; // 'Athlete' or 'Coach'
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
    user,
    onLogout,
    onOpenSettings,
    menuItems,
    children,
    roleLabel
}) => {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

    const SidebarContent = () => (
        <div className="flex flex-col h-full bg-[#252525] border-r border-white/5">
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <img src="/logo.svg" alt="Anvil" className="h-8 w-auto" />
                    <span className="font-black text-xl tracking-tighter uppercase">{roleLabel}</span>
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
                                onClick={() => setIsMobileMenuOpen(false)}
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
                                setIsMobileMenuOpen(false);
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
                            {user.nickname?.[0]?.toUpperCase() || user.name?.[0]?.toUpperCase() || 'U'}
                        </div>
                    )}
                    <div className="overflow-hidden">
                        <p className="text-sm font-bold truncate text-white">{user.nickname || user.name}</p>
                        <p className="text-xs text-gray-500 truncate">
                            {onOpenSettings ? 'Editar Perfil' : roleLabel === 'Coach' ? 'Entrenador' : 'Atleta'}
                        </p>
                    </div>
                </div>
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

    return (
        <div className="flex h-screen bg-[#1c1c1c] text-white overflow-hidden font-sans">
            {/* Desktop Sidebar */}
            <aside className="hidden md:flex w-64 flex-col fixed inset-y-0 z-50">
                <SidebarContent />
            </aside>

            {/* Mobile Header */}
            <div className="md:hidden fixed top-0 w-full bg-[#252525] border-b border-white/5 z-40 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <img src="/logo.svg" alt="Anvil" className="h-8 w-auto" />
                </div>
                <button onClick={toggleMobileMenu} className="text-white">
                    <Menu size={28} />
                </button>
            </div>

            {/* Mobile Sidebar Overlay */}
            {isMobileMenuOpen && (
                <div className="fixed inset-0 z-50 md:hidden">
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={toggleMobileMenu} />
                    <div className="fixed inset-y-0 left-0 w-64 shadow-xl z-50">
                        <SidebarContent />
                    </div>
                </div>
            )}

            {/* Main Content */}
            <main className="flex-1 md:ml-64 h-full overflow-y-auto pt-16 md:pt-0 bg-[#1c1c1c]">
                {children}
            </main>
        </div>
    );
};
