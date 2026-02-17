import { ReactNode } from 'react';

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
    return (
        <div className="flex h-screen bg-[#1c1c1c] text-white overflow-hidden font-sans">
            {/* Main Content */}
            <main className="flex-1 h-full overflow-y-auto pt-0 pb-20 md:pt-0 md:pb-0 bg-[#1c1c1c] scrollbar-hide">
                {children}
            </main>

            {/* Bottom Navigation */}
            <nav className="fixed bottom-0 w-full bg-[#1c1c1c] border-t border-white/10 z-50 px-6 py-3 flex justify-between items-center pb-safe md:hidden">
                {menuItems.map((item, index) => {
                    if (item.label === 'QA: Test DB') return null;

                    const isActive = item.isActive;

                    return (
                        <button
                            key={index}
                            onClick={item.onClick}
                            className={`flex flex-col items-center justify-center p-2 transition-colors ${isActive ? 'text-anvil-red' : 'text-gray-500 hover:text-white'
                                }`}
                        >
                            <div className={isActive ? "scale-110 transition-transform" : ""}>
                                {item.icon}
                            </div>
                        </button>
                    );
                })}
            </nav>
        </div>
    );
};
