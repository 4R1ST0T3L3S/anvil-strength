import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getWeekNumber } from '../../../utils/dateUtils';

interface CalendarWeekPickerProps {
    startWeek: number;
    endWeek: number;
    onChange: (start: number, end: number) => void;
    selectedColor?: string;
}

export function CalendarWeekPicker({ startWeek, endWeek, onChange, selectedColor = '#ef4444' }: CalendarWeekPickerProps) {
    // Start with current month or the month of the start week if available
    const [viewDate, setViewDate] = useState(() => {
        // Simple heuristic: if we have a start week, try to approximate the month
        // But for simplicity, let's start at current date for now, 
        // or navigate to the start week's month if it's far.
        // Actually, let's just default to today for navigation.
        return new Date();
    });

    const monthData = useMemo(() => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();

        // First day of the month
        const firstDay = new Date(year, month, 1);
        // Last day of the month
        const lastDay = new Date(year, month + 1, 0);

        // Days to pad at the start (Monday based)
        // getDay returns 0 for Sunday. We want 0 for Monday.
        // standard getDay: Sun=0, Mon=1, Tue=2...
        // our target: Mon=0, Tue=1... Sun=6
        let startPadding = firstDay.getDay() - 1;
        if (startPadding < 0) startPadding = 6;

        const days = [];

        // Previous month padding
        const prevMonthLastDay = new Date(year, month, 0).getDate();
        for (let i = 0; i < startPadding; i++) {
            const day = prevMonthLastDay - startPadding + i + 1;
            const date = new Date(year, month - 1, day);
            days.push({ date, isCurrentMonth: false, week: getWeekNumber(date) });
        }

        // Current month days
        for (let i = 1; i <= lastDay.getDate(); i++) {
            const date = new Date(year, month, i);
            days.push({ date, isCurrentMonth: true, week: getWeekNumber(date) });
        }

        // Next month padding to fill grid (6 rows * 7 cols = 42 cells)
        const totalCells = 42;
        const currentLength = days.length;
        for (let i = 1; i <= totalCells - currentLength; i++) {
            const date = new Date(year, month + 1, i);
            days.push({ date, isCurrentMonth: false, week: getWeekNumber(date) });
        }

        return days;
    }, [viewDate]);

    // Handle clicking a day/week
    const handleWeekClick = (week: number) => {
        if (startWeek === week && endWeek === week) {
            // Deselect? No, must have at least one. Maybe do nothing or reset.
            // Let's just keep it selected.
            return;
        }

        if (startWeek === 0 || (startWeek === endWeek && week !== startWeek)) {
            // If we have a single selection and click another, define range
            if (week < startWeek) {
                onChange(week, startWeek);
            } else {
                onChange(startWeek, week);
            }
        } else {
            // If we have a range (or just starting fresh logic), distinct click behavior
            // Let's implement a smart selection:
            // 1. If clicking before start, extend start.
            // 2. If clicking after end, extend end.
            // 3. If clicking inside, maybe shrink? 
            // Simpler approach: 
            // - If user clicks a week, set it as START and END (single week selection).
            // - Then next click defines the range.
            onChange(week, week);
        }
    };

    const navigateMonth = (direction: 'prev' | 'next') => {
        const newDate = new Date(viewDate);
        if (direction === 'prev') {
            newDate.setMonth(newDate.getMonth() - 1);
        } else {
            newDate.setMonth(newDate.getMonth() + 1);
        }
        setViewDate(newDate);
    };

    // Group days by week for rendering rows
    const weeks = useMemo(() => {
        const rows = [];
        for (let i = 0; i < monthData.length; i += 7) {
            rows.push(monthData.slice(i, i + 7));
        }
        return rows;
    }, [monthData]);

    const MONTHS = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    return (
        <div className="bg-[#1c1c1c] rounded-xl border border-white/10 p-4 select-none h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 shrink-0">
                <button
                    type="button"
                    onClick={() => navigateMonth('prev')}
                    className="p-1 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
                >
                    <ChevronLeft size={20} />
                </button>
                <div className="font-bold text-white uppercase tracking-wider">
                    {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
                </div>
                <button
                    type="button"
                    onClick={() => navigateMonth('next')}
                    className="p-1 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
                >
                    <ChevronRight size={20} />
                </button>
            </div>

            {/* Grid Header */}
            <div className="grid grid-cols-[30px_1fr] gap-2 mb-2 shrink-0">
                <div className="text-[10px] font-bold text-gray-500 uppercase text-center self-center">Sem</div>
                <div className="grid grid-cols-7 text-center">
                    {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
                        <div key={d} className="text-[10px] font-bold text-gray-500">{d}</div>
                    ))}
                </div>
            </div>

            {/* Calendar Grid */}
            <div className="space-y-1 flex-1">
                {weeks.map((weekDays, wIndex) => {
                    const weekNum = weekDays[0].week; // Use first day's week map
                    // Check if this week is selected/in-range
                    const isStart = weekNum === startWeek;
                    const isEnd = weekNum === endWeek;
                    const inRange = weekNum >= startWeek && weekNum <= endWeek;

                    return (
                        <div key={wIndex} className="grid grid-cols-[30px_1fr] gap-2 group">
                            {/* Week Number (Clickable row trigger) */}
                            <button
                                type="button"
                                onClick={() => handleWeekClick(weekNum)}
                                className={`
                                    text-[10px] font-bold rounded flex items-center justify-center transition-colors
                                    ${inRange ? 'text-white' : 'text-gray-600 group-hover:text-gray-300'}
                                    ${inRange && !isStart && !isEnd ? 'bg-white/10' : ''}
                                `}
                                style={isStart || isEnd ? { backgroundColor: selectedColor } : undefined}
                            >
                                W{weekNum}
                            </button>

                            {/* Days */}
                            <div
                                className={`
                                    grid grid-cols-7 rounded-lg overflow-hidden cursor-pointer transition-colors border border-transparent
                                    ${inRange ? 'bg-white/5 border-white/5' : 'hover:bg-white/5 hover:border-white/10'}
                                `}
                                style={{
                                    ...(isStart || isEnd ? { borderColor: selectedColor, backgroundColor: `${selectedColor}20` } : {}),
                                    ...(inRange && !isStart && !isEnd ? {} : {}) // Middle range keeps default/class style or could inherit light tint
                                }}
                                onClick={() => handleWeekClick(weekNum)}
                            >
                                {weekDays.map((day, dIndex) => (
                                    <div
                                        key={dIndex}
                                        className={`
                                            h-8 flex items-center justify-center text-xs font-medium
                                            ${day.isCurrentMonth ? 'text-gray-300' : 'text-gray-700'}
                                            ${inRange ? 'text-white' : ''}
                                        `}
                                    >
                                        {day.date.getDate()}
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Footer Helper */}
            <div className="mt-4 flex items-center justify-between text-[10px] text-gray-500 uppercase font-bold tracking-wider shrink-0">
                <div>Clic: Seleccionar / Rango</div>
                <div>
                    Seleccionado: <span className="text-white">{startWeek} - {endWeek}</span> ({endWeek - startWeek + 1} semanas)
                </div>
            </div>
        </div>
    );
}
