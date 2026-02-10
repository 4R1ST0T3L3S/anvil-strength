import { Bell } from 'lucide-react';

export function NotificationBell() {
    return (
        <button className="relative p-2 text-gray-400 hover:text-white transition-colors">
            <Bell size={20} />
            <span className="absolute top-1 right-1 w-2 h-2 bg-anvil-red rounded-full"></span>
        </button>
    );
}
