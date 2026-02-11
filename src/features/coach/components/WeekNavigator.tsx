import { Plus, Copy, ChevronDown, Trash2 } from 'lucide-react';
import { getDateRangeFromWeek, formatDateRange } from '../../../utils/dateUtils';

interface WeekNavigatorProps {
    weeks: number[];
    currentWeek: number;
    onSelectWeek: (week: number) => void;
    onAddWeek: () => void;
    onCopyWeek: (fromWeek: number) => void;
    onDeleteWeek: (week: number) => void;
    blockEndWeek?: number | null;
}

export function WeekNavigator({
    weeks,
    currentWeek,
    onSelectWeek,
    onAddWeek,
    onCopyWeek,
    onDeleteWeek,
    blockEndWeek
}: WeekNavigatorProps) {
    return (
        <div className="flex items-center gap-2 bg-[#1a1a1a] p-2 rounded-xl border border-white/5 overflow-hidden">
            {/* Week Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto flex-1 scrollbar-hide mask-fade-right py-1">
                {weeks.map((week) => {
                    const isSelected = currentWeek === week;
                    const year = new Date().getFullYear();
                    const { start, end } = getDateRangeFromWeek(week, year);

                    return (
                        <button
                            key={week}
                            onClick={() => onSelectWeek(week)}
                            className={`
                                flex flex-col items-start px-4 py-2 rounded-lg transition-all whitespace-nowrap min-w-[120px]
                                ${isSelected
                                    ? 'bg-anvil-red text-white shadow-lg shadow-anvil-red/20 scale-[1.02]'
                                    : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'}
                            `}
                        >
                            <span className="text-xs font-bold uppercase tracking-wide flex items-center gap-2 mb-0.5">
                                Semana {week}
                                {isSelected && <ChevronDown size={12} />}
                            </span>
                            <span className={`text-[10px] font-mono ${isSelected ? 'text-white/80' : 'text-gray-500'}`}>
                                {formatDateRange(start, end)}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 border-l border-white/10 pl-2 ml-2 shrink-0">
                {/* Delete Current Week */}
                <button
                    onClick={() => onDeleteWeek(currentWeek)}
                    className="p-3 md:p-2 rounded-lg bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-500 transition-all active:scale-90"
                    title="Eliminar semana actual"
                >
                    <Trash2 size={18} />
                </button>

                {/* Copy Current Week */}
                <button
                    onClick={() => onCopyWeek(currentWeek)}
                    className="p-3 md:p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all active:scale-90"
                    title="Copiar semana actual"
                >
                    <Copy size={18} />
                </button>

                {/* Add New Week */}
                <button
                    onClick={onAddWeek}
                    disabled={blockEndWeek ? Math.max(...weeks) >= blockEndWeek : false}
                    className="p-3 md:p-2 rounded-lg bg-white/5 hover:bg-anvil-red/20 text-gray-400 hover:text-anvil-red transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-gray-400 active:scale-90"
                    title={blockEndWeek && Math.max(...weeks) >= blockEndWeek ? "Límite de semanas alcanzado" : "Añadir semana"}
                >
                    <Plus size={18} />
                </button>
            </div>
        </div>
    );
}
