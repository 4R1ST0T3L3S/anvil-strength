import { ReactNode } from 'react';
import { LogOut, Globe } from 'lucide-react';

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
    const logoutItem = menuItems.find(item => item.label === 'Salir');
    const webItem = menuItems.find(item => item.label === 'Ver Web');

    return (
        <div className="flex flex-col h-screen bg-[#1c1c1c] text-white overflow-hidden font-sans">
            {/* Desktop Top Bar */}
            <div className="hidden md:flex items-center justify-end gap-2 px-6 py-2 border-b border-white/5 bg-[#1a1a1a] shrink-0">
                {webItem && (
                    <button
                        onClick={webItem.onClick}
                        className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-lg transition-all"
                    >
                        <Globe size={14} />
                        Ver Web
                    </button>
                )}
                {logoutItem && (
                    <button
                        onClick={logoutItem.onClick}
                        className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-all"
                    >
                        <LogOut size={14} />
                        Cerrar Sesión
                    </button>
                )}
            </div>

            {/* Main Content */}
            <main className="flex-1 h-full overflow-y-auto pt-0 pb-20 md:pt-0 md:pb-0 bg-[#1c1c1c] scrollbar-hide">
                {children}
            </main>

            {/* Bottom Navigation (Mobile) */}
            <nav className="fixed bottom-0 w-full bg-[#1c1c1c]/95 backdrop-blur-lg border-t border-white/10 z-50 px-4 py-2 flex justify-around items-center pb-safe md:hidden">
                {menuItems
                    .filter(item => !['Ver Web', 'Salir'].includes(item.label))
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
