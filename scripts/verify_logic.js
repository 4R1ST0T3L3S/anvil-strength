
// Mock of parseBestDate from aepService.ts
const parseBestDate = (dateStr, level) => {
    try {
        const year = 2026;
        const months = {
            'ene': 0, 'feb': 1, 'mar': 2, 'abr': 3, 'may': 4, 'jun': 5,
            'jul': 6, 'ago': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dic': 11
        };

        const cleanStr = dateStr.toLowerCase().trim();
        const foundMonths = Object.keys(months).filter(m => cleanStr.includes(m));

        if (foundMonths.length === 0) return { str: dateStr };

        const lastMonthStr = foundMonths[foundMonths.length - 1];
        const monthIndex = months[lastMonthStr];

        const numbers = cleanStr.match(/\d+/g);
        if (!numbers) return { str: dateStr };

        const dayCandidates = numbers.map(n => parseInt(n)).filter(n => n >= 1 && n <= 31);

        if (dayCandidates.length === 0) return { str: dateStr };

        if (dayCandidates.length === 1) {
            return {
                str: `${dayCandidates[0]} ${lastMonthStr.charAt(0).toUpperCase() + lastMonthStr.slice(1)}`,
                iso: `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(dayCandidates[0]).padStart(2, '0')}`
            };
        }

        // Multiple days
        const targetDay = (level === 'AEP 3') ? 0 : 6;
        let bestDay = dayCandidates[dayCandidates.length - 1];

        console.log(`Candidates: ${dayCandidates}, TargetDay (0=Sun, 6=Sat): ${targetDay}`);

        for (const day of dayCandidates) {
            const dateObj = new Date(year, monthIndex, day);
            const dow = dateObj.getDay();
            console.log(`Day ${day}: DOW ${dow}`);
            if (dow === targetDay) {
                bestDay = day;
                break;
            }
        }

        // Fix logic from aepService
        const iso = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(bestDay).padStart(2, '0')}`;

        return {
            str: `${bestDay} ${lastMonthStr.charAt(0).toUpperCase() + lastMonthStr.slice(1)}`,
            iso: iso
        };

    } catch (e) {
        console.log(e);
        return { str: dateStr };
    }
};

const dateStr = "19-20 Junio"; // From CSV? Need to confirm exact string.
const level = "AEP 2";

console.log("Testing with:", dateStr, level);
const result = parseBestDate(dateStr, level);
console.log("Result:", result);

// Check June 2026 calendar
const d19 = new Date(2026, 5, 19);
const d20 = new Date(2026, 5, 20);
console.log("June 19, 2026 is:", d19.toDateString());
console.log("June 20, 2026 is:", d20.toDateString());
