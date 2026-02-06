
const dateUtils = {
    getDaysRemaining: (targetDate) => {
        // Current logic in dateUtils.ts
        const target = new Date(targetDate);
        const today = new Date();

        target.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);

        const diffTime = target.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    },
    getDaysRemainingSafe: (targetDate) => {
        // My proposed safe logic
        const target = new Date(targetDate + 'T00:00:00');
        const today = new Date();

        target.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);

        const diffTime = target.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    }
};

const homeLogic = (dateStr) => {
    const today = new Date();
    const target = new Date(dateStr + 'T00:00:00');

    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);

    const diffTime = target.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
};

// Test
const today = new Date();
const tomorrow = new Date(today);
tomorrow.setDate(today.getDate() + 1);
const tomorrowStr = tomorrow.toISOString().split('T')[0];

console.log(`Today: ${today.toLocaleDateString()}`);
console.log(`Target (Tomorrow): ${tomorrowStr}`);

console.log('utils (current):', dateUtils.getDaysRemaining(tomorrowStr));
console.log('utils (safe):', dateUtils.getDaysRemainingSafe(tomorrowStr));
console.log('homeLogic:', homeLogic(tomorrowStr));

// Test Chiva date (June 20, 2026)
const chiva = "2026-06-20";
console.log('\nTarget Chiva:', chiva);
console.log('utils (current):', dateUtils.getDaysRemaining(chiva));
console.log('utils (safe):', dateUtils.getDaysRemainingSafe(chiva));

// Ensure consistent results
const diff = dateUtils.getDaysRemainingSafe(chiva);
console.log(`\nIf today is Feb 6, 2026 (approx), June 20 is about 4 months away.`);
console.log(`Calculated days: ${diff}`);
const manualStart = new Date("2026-02-06T00:00:00");
const manualTarget = new Date("2026-06-20T00:00:00");
const manualDiff = (manualTarget - manualStart) / (1000 * 3600 * 24);
console.log(`Manual calc (from Feb 6): ${manualDiff}`);
