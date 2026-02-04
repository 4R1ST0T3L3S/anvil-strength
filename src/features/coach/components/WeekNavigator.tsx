import { Plus, Copy, ChevronDown } from 'lucide-react';

interface WeekNavigatorProps {
    weeks: number[];
    currentWeek: number;
    onSelectWeek: (week: number) => void;
    onAddWeek: () => void;
    onCopyWeek: (fromWeek: number) => void;
}

export function WeekNavigator({
    weeks,
    currentWeek,
    onSelectWeek,
    onAddWeek,
    onCopyWeek
}: WeekNavigatorProps) {
    return (
        <div className="flex items-center gap-2 bg-[#1a1a1a] p-2 rounded-xl border border-white/5">
            {/* Week Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto flex-1 scrollbar-hide">
                {weeks.map((week) => {
                    const isSelected = currentWeek === week;

                    return (
                        <button
                            key={week}
                            onClick={() => onSelectWeek(week)}
                            className={`
                                flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm uppercase tracking-wide
                                transition-all whitespace-nowrap
                                ${isSelected
                                    ? 'bg-anvil-red text-white shadow-lg shadow-anvil-red/20'
                                    : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'}
                            `}
                        >
                            Semana {week}
                            <ChevronDown
                                size={14}
                                className={`transition-transform duration-200 ${isSelected ? 'rotate-180' : ''}`}
                            />
                        </button>
                    );
                })}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 border-l border-white/10 pl-2 ml-2">
                {/* Copy Current Week */}
                <button
                    onClick={() => onCopyWeek(currentWeek)}
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all"
                    title="Copiar semana actual"
                >
                    <Copy size={16} />
                </button>

                {/* Add New Week */}
                <button
                    onClick={onAddWeek}
                    className="p-2 rounded-lg bg-white/5 hover:bg-anvil-red/20 text-gray-400 hover:text-anvil-red transition-all"
                    title="Añadir semana"
                >
                    <Plus size={16} />
                </button>
            </div>
        </div>
    );
}
