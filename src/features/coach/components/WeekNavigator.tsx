import { Plus, Copy, ChevronDown } from 'lucide-react';
import { getDateRangeFromWeek, formatDateRange } from '../../../utils/dateUtils';

interface WeekNavigatorProps {
    weeks: number[];
    currentWeek: number;
    onSelectWeek: (week: number) => void;
    onAddWeek: () => void;
    onCopyWeek: (fromWeek: number) => void;
    blockEndWeek?: number | null;
}

export function WeekNavigator({
    weeks,
    currentWeek,
    onSelectWeek,
    onAddWeek,
    onCopyWeek,
    blockEndWeek
}: WeekNavigatorProps) {
    return (
        <div className="flex items-center gap-2 bg-[#1a1a1a] p-2 rounded-xl border border-white/5">
            {/* Week Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto flex-1 scrollbar-hide">
                {weeks.map((week) => {
                    const isSelected = currentWeek === week;
                    const year = new Date().getFullYear(); // Assuming current year for now, ideally passed from block
                    const { start, end } = getDateRangeFromWeek(week, year);

                    return (
                        <button
                            key={week}
                            onClick={() => onSelectWeek(week)}
                            className={`
                                flex flex-col items-start px-4 py-1.5 rounded-lg transition-all whitespace-nowrap
                                ${isSelected
                                    ? 'bg-anvil-red text-white shadow-lg shadow-anvil-red/20'
                                    : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'}
                            `}
                        >
                            <span className="text-xs font-bold uppercase tracking-wide flex items-center gap-2">
                                Semana {week}
                                {isSelected && <ChevronDown size={10} />}
                            </span>
                            <span className={`text-[10px] font-mono ${isSelected ? 'text-white/80' : 'text-gray-600'}`}>
                                {formatDateRange(start, end)}
                            </span>
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
                    className="p-2 rounded-lg bg-white/5 hover:bg-anvil-red/20 text-gray-400 hover:text-anvil-red transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-gray-400"
                    title={blockEndWeek && Math.max(...weeks, currentWeek) >= blockEndWeek ? "Añadir semana (Extender bloque)" : "Añadir semana"}
                >
                    <Plus size={16} />
                </button>
            </div>
        </div>
    );
}
