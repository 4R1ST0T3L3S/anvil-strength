import React, { ReactNode } from 'react';
import { LogOut, Globe } from 'lucide-react';
import { useUser } from '../../hooks/useUser';
import { NotificationsPopover } from '../ui/NotificationsPopover';

interface MenuItem {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    isActive: boolean;
    isExternal?: boolean;
    href?: string;
}

interface DashboardLayoutProps {
    menuItems: MenuItem[];
    children: ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
    menuItems,
    children,
}) => {
    const { data: user } = useUser();
    const logoutItem = menuItems.find(item => item.label === 'Salir');
    const webItem = menuItems.find(item => item.label === 'Ver Web');

    return (
        <div className="flex h-screen bg-black text-white overflow-hidden font-sans">
            {/* Desktop Sidebar */}
            <aside className="hidden md:flex flex-col w-64 bg-black border-r border-white/5 shrink-0">
                <div className="p-8">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-anvil-red rounded-xl flex items-center justify-center font-black text-white text-2xl italic shadow-[0_0_20px_rgba(220,38,38,0.4)]">A</div>
                        <span className="font-black uppercase tracking-tighter text-xl italic">Anvil <span className="text-anvil-red">Strength</span></span>
                    </div>
                </div>

                <nav className="flex-1 px-4 space-y-2 py-4">
                    {menuItems
                        .filter(item => !['Ver Web', 'Salir'].includes(item.label))
                        .map((item, index) => (
                            <button
                                key={index}
                                onClick={item.onClick}
                                className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl font-bold text-sm transition-all group ${item.isActive
                                    ? 'bg-anvil-red text-white shadow-lg shadow-anvil-red/20'
                                    : 'text-gray-500 hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                <div className={`${item.isActive ? 'text-white' : 'text-gray-500 group-hover:text-anvil-red transition-colors'}`}>
                                    {item.icon}
                                </div>
                                <span className="uppercase tracking-widest text-[10px]">{item.label}</span>
                            </button>
                        ))}
                </nav>

                <div className="p-4 border-t border-white/5 space-y-2">
                    {user && (
                        <div className="flex items-center justify-between px-3 py-2 border border-white/5 bg-white/5 rounded-xl mb-2">
                            <div className="flex items-center gap-2 overflow-hidden">
                                <div className="w-8 h-8 rounded-lg bg-anvil-red flex items-center justify-center font-black text-xs text-white shrink-0">
                                    {user.full_name?.charAt(0).toUpperCase() || '?'}
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <span className="text-[10px] font-black uppercase truncate text-white leading-tight">{user.nickname || user.full_name}</span>
                                    <span className="text-[8px] font-bold text-gray-500 uppercase tracking-widest leading-none mt-0.5">{user.role}</span>
                                </div>
                            </div>
                            <NotificationsPopover userId={user.id} />
                        </div>
                    )}
                    {webItem && (
                        <button
                            onClick={webItem.onClick}
                            className="w-full flex items-center gap-4 px-4 py-3 rounded-xl font-bold text-[10px] uppercase tracking-widest text-blue-400 hover:bg-blue-500/10 transition-all"
                        >
                            <Globe size={18} />
                            Ver Web
                        </button>
                    )}
                    {logoutItem && (
                        <button
                            onClick={logoutItem.onClick}
                            className="w-full flex items-center gap-4 px-4 py-3 rounded-xl font-bold text-[10px] uppercase tracking-widest text-red-500 hover:bg-red-500/10 transition-all"
                        >
                            <LogOut size={18} />
                            Cerrar Sesión
                        </button>
                    )}
                </div>
            </aside>

            <div className="flex-1 flex flex-col min-w-0">
                {/* Main Content */}
                <main className="flex-1 overflow-y-auto bg-black scrollbar-hide pb-20 md:pb-0">
                    {children}
                </main>
            </div>

            {/* Bottom Navigation (Mobile) */}
            <nav className="fixed bottom-0 w-full bg-black/95 backdrop-blur-lg border-t border-white/10 z-50 px-4 py-2 flex justify-around items-center pb-safe md:hidden">
                {menuItems
                    .filter(item => !['Ver Web', 'Salir', 'PWR Análisis'].includes(item.label))
                    .slice(0, 6)
                    .map((item, index) => {
                        const isActive = item.isActive;

                        return (
                            <button
                                key={index}
                                onClick={item.onClick}
                                className={`flex flex-col items-center justify-center p-1.5 transition-colors ${isActive ? 'text-anvil-red' : 'text-gray-500 hover:text-white'
                                    }`}
                            >
                                <div className={isActive ? "scale-110 transition-transform" : ""}>
                                    {item.icon}
                                </div>
                                <span className={`text-[9px] font-bold mt-0.5 ${isActive ? 'text-anvil-red' : 'text-gray-600'}`}>
                                    {item.label.length > 10 ? item.label.substring(0, 8) + '…' : item.label}
                                </span>
                            </button>
                        );
                    })}
            </nav>
        </div>
    );
};
