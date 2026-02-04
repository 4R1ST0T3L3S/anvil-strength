import { Plus, Copy, ChevronDown, ChevronRight, FoldVertical, UnfoldVertical } from 'lucide-react';

interface WeekNavigatorProps {
    weeks: number[];
    currentWeek: number;
    expandedWeeks: Set<number>;
    onSelectWeek: (week: number) => void;
    onToggleExpand: (week: number) => void;
    onExpandAll: () => void;
    onCollapseAll: () => void;
    onAddWeek: () => void;
    onCopyWeek: (fromWeek: number) => void;
}

export function WeekNavigator({
    weeks,
    currentWeek,
    expandedWeeks,
    onSelectWeek,
    onToggleExpand,
    onExpandAll,
    onCollapseAll,
    onAddWeek,
    onCopyWeek
}: WeekNavigatorProps) {
    return (
        <div className="flex items-center gap-2 bg-[#1a1a1a] p-2 rounded-xl border border-white/5">
            {/* Expand/Collapse All */}
            <div className="flex items-center gap-1 border-r border-white/10 pr-2 mr-1">
                <button
                    onClick={onExpandAll}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-500 hover:text-white transition-all"
                    title="Expandir todas"
                >
                    <UnfoldVertical size={14} />
                </button>
                <button
                    onClick={onCollapseAll}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-500 hover:text-white transition-all"
                    title="Colapsar todas"
                >
                    <FoldVertical size={14} />
                </button>
            </div>

            {/* Week Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto flex-1 scrollbar-hide">
                {weeks.map((week) => {
                    const isExpanded = expandedWeeks.has(week);
                    const isSelected = currentWeek === week;

                    return (
                        <div key={week} className="flex items-center">
                            {/* Expand/Collapse Toggle */}
                            <button
                                onClick={() => onToggleExpand(week)}
                                className={`p-1 rounded-l-lg transition-all ${isSelected ? 'bg-anvil-red/80 text-white' : 'bg-white/5 text-gray-500 hover:text-white'
                                    }`}
                            >
                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>

                            {/* Week Button */}
                            <button
                                onClick={() => onSelectWeek(week)}
                                className={`
                                    px-3 py-2 rounded-r-lg font-bold text-sm uppercase tracking-wide
                                    transition-all whitespace-nowrap
                                    ${isSelected
                                        ? 'bg-anvil-red text-white shadow-lg shadow-anvil-red/20'
                                        : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'}
                                `}
                            >
                                S{week}
                            </button>
                        </div>
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
