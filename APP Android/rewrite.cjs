const fs = require('fs');

let content = fs.readFileSync('src/features/coach/components/CoachHome.tsx', 'utf-8');

// 1. Replace NavTile and SectionLabel
const newNavTile = `
const AREA = {
    train: { icon: 'text-brand-text', chip: 'bg-brand-quiet', ring: 'group-hover:border-[var(--brand-line)]' },
    food: { icon: 'text-success', chip: 'bg-success-quiet', ring: 'group-hover:border-[var(--border-strong)]' },
    club: { icon: 'text-warning', chip: 'bg-warning-quiet', ring: 'group-hover:border-[var(--border-strong)]' },
    tool: { icon: 'text-ink-muted', chip: 'bg-surface-overlay', ring: 'group-hover:border-[var(--border-strong)]' },
} as const;

type AreaKey = keyof typeof AREA;

function SectionLabel({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
    return (
        <h2 className="mb-3 flex items-center gap-2 text-t-2xs font-bold uppercase tracking-widest text-ink-subtle">
            <Icon size={14} aria-hidden="true" className="text-ink-faint" />
            {children}
        </h2>
    );
}

function NavTile({
    icon: Icon,
    title,
    hint,
    onClick,
    area = 'tool',
    disabled = false,
}: {
    icon: LucideIcon;
    title: string;
    hint: string;
    onClick: () => void;
    area?: AreaKey;
    disabled?: boolean;
}) {
    const a = AREA[area];
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={\`group relative flex min-h-[104px] flex-col justify-between overflow-hidden rounded-card border border-[var(--border-default)] bg-surface-raised p-4 text-left transition-colors duration-fast ease-snap hover:bg-surface-overlay active:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-surface-raised \${a.ring}\`}
        >
            <Icon
                size={72}
                aria-hidden="true"
                className="pointer-events-none absolute -right-4 -top-3 text-ink opacity-[0.04] transition-transform duration-base ease-snap group-hover:scale-110"
            />
            <span className={\`flex h-9 w-9 items-center justify-center rounded-field \${a.chip}\`}>
                <Icon size={17} className={a.icon} aria-hidden="true" />
            </span>
            <span className="relative">
                <span className="block text-t-base font-bold leading-tight text-ink">{title}</span>
                <span className="mt-0.5 flex items-center gap-1 text-t-xs text-ink-subtle">
                    {hint}
                    {!disabled && (
                        <ChevronRight
                            size={12}
                            aria-hidden="true"
                            className="transition-transform duration-fast ease-snap group-hover:translate-x-0.5"
                        />
                    )}
                </span>
            </span>
        </button>
    );
}
`;

// Regex to replace SectionLabel and NavTile
content = content.replace(/function SectionLabel[\s\S]*?function NavTile[\s\S]*?\n\}\n/m, newNavTile);

// 2. Replace layout wrapper
content = content.replace(
    /<div className="mx-auto flex min-h-full xl:h-\[calc\(100vh-64px\)\] w-full max-w-none flex-col px-4 py-4 md:px-8 xl:px-12 xl:py-4 xl:overflow-hidden">/g,
    '<div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6 pb-24 md:px-8 md:py-10">'
);

// Header adjustments
content = content.replace(
    /<header className="mb-4 shrink-0 flex items-start justify-between gap-4">/g,
    '<header className="flex items-start justify-between gap-4">'
);
content = content.replace(
    /<h1 className="text-t-xl md:text-t-2xl font-black uppercase tracking-display text-ink">/g,
    '<h1 className="text-t-3xl font-black uppercase tracking-display text-ink md:text-t-4xl">'
);
content = content.replace(
    /<p className="mt-0\.5 flex items-center gap-2 text-t-xs capitalize text-ink-muted">/g,
    '<p className="mt-1.5 flex items-center gap-2 text-t-sm capitalize text-ink-muted">'
);
content = content.replace(
    /\{headerActions && \(\s*<div className="flex items-center gap-1">/g,
    '{headerActions && (\n                        <div className="flex shrink-0 items-center gap-1">'
);


// Columns container
content = content.replace(
    /<div className="flex flex-1 flex-col xl:flex-row gap-4 min-h-0">/g,
    '<div className="flex flex-col gap-8 xl:flex-row xl:items-start">'
);

// Left column
content = content.replace(
    /<div className="flex flex-1 flex-col gap-4 min-w-0 overflow-hidden">/g,
    '<div className="min-w-0 flex-1 space-y-8">'
);

// Tu equipo section
content = content.replace(
    /<section className="flex shrink-0 flex-col">/g,
    '<section>'
);
content = content.replace(
    /<SectionLabel icon=\{Users\} colorClass="text-brand">Tu equipo<\/SectionLabel>/g,
    "<SectionLabel icon={Users}>Tu equipo</SectionLabel>"
);
content = content.replace(
    /<div className="grid grid-cols-2 gap-2 xl:h-52 2xl:h-60">/g,
    '<div className="grid grid-cols-2 gap-2.5">'
);

// Replace Tu equipo tiles
content = content.replace(/<NavTile\s+icon=\{Users\}[\s\S]*?\/>/, 
    `<NavTile area="train" icon={Users} title="Mis atletas" hint="Programación y seguimiento" onClick={() => onNavigate('athletes')} />`
);
content = content.replace(/<NavTile\s+icon=\{Apple\}[\s\S]*?\/>/, 
    `<NavTile area="food" icon={Apple} title="Dietas" hint="Planes nutricionales del equipo" onClick={() => onNavigate('diets')} />`
);

// Anvil lessons / next comp section
content = content.replace(
    /<section className="flex flex-1 grid gap-2 min-h-0 lg:grid-cols-\[1\.6fr_1fr\]">/g,
    '<section className={`grid gap-3 ${nextComp ? \'lg:grid-cols-[1.6fr_1fr]\' : \'\'}`}>'
);
content = content.replace(
    /<div className="flex flex-col h-full min-h-0">/g,
    '<div>'
);
content = content.replace(
    /<div className="flex flex-col h-full min-h-0">/g,
    '<div>'
);
content = content.replace(
    /<SectionLabel icon=\{BookOpen\} colorClass="text-\[#eab308\]">Anvil Lessons<\/SectionLabel>/g,
    '<SectionLabel icon={BookOpen}>Anvil Lessons</SectionLabel>'
);
content = content.replace(
    /<div className="relative flex-1 flex flex-col justify-center overflow-hidden rounded-card border border-\[var\(--border-default\)\] bg-surface-raised p-5 md:p-6">/g,
    '<div className="relative flex min-h-[160px] flex-col justify-center overflow-hidden rounded-card border border-[var(--border-default)] bg-surface-raised p-5 md:p-6">'
);

// Next comp condition
content = content.replace(
    /<SectionLabel icon=\{Trophy\} colorClass="text-\[#f59e0b\]">Próxima competición<\/SectionLabel>\s*<div className="flex flex-1 flex-col">/m,
    `{nextComp && (
                                <>
                                    <SectionLabel icon={Trophy}>Próxima competición</SectionLabel>
                                    <div>`
);
// Now handle the closing div for next comp
content = content.replace(
    /<\/div>\s*<\/section>/,
    `</div>\n                                </>\n                            )}\n                        </section>`
);


// Right column
content = content.replace(
    /<div className="flex shrink-0 flex-col gap-4 xl:w-\[50%\] 2xl:w-\[45%\] min-h-0 xl:overflow-hidden">/g,
    '<div className="flex flex-col gap-8 xl:w-[400px] xl:shrink-0 2xl:w-[440px]">'
);

// Gestión section
content = content.replace(
    /<section className="flex flex-\[3\] flex-col min-h-0">/g,
    '<section>'
);
content = content.replace(
    /<SectionLabel icon=\{LayoutDashboard\} colorClass="text-\[#3b82f6\]">Gestión<\/SectionLabel>/g,
    '<SectionLabel icon={LayoutDashboard}>Gestión</SectionLabel>'
);
content = content.replace(
    /<div className="grid flex-1 grid-cols-2 gap-2 min-h-0">/g,
    '<div className="grid grid-cols-2 gap-2.5">'
);

// Replace Gestión tiles
content = content.replace(/<NavTile icon=\{MessageCircle\}[\s\S]*?\/>/, 
    `<NavTile area="tool" icon={MessageCircle} title="Mensajes" hint="Próximamente..." onClick={() => {}} disabled />`
);
content = content.replace(/<NavTile icon=\{Trophy\}[\s\S]*?\/>/, 
    `<NavTile area="club" icon={Trophy} title="Competiciones" hint="Calendario anual" onClick={() => onNavigate('calendar')} />`
);
content = content.replace(/<NavTile icon=\{Swords\}[\s\S]*?\/>/, 
    `<NavTile area="club" icon={Swords} title="La Arena" hint="Comunidad del club" onClick={() => navigate('/dashboard/community')} />`
);
content = content.replace(/<NavTile icon=\{Users\} title="Ranking"[\s\S]*?\/>/, 
    `<NavTile area="club" icon={Users} title="Ranking" hint="Clasificación de atletas" onClick={() => setIsRankingOpen(true)} />`
);


// Anvil lab section
content = content.replace(
    /<section className="flex flex-\[2\] flex-col min-h-0">/g,
    '<section>'
);
content = content.replace(
    /<SectionLabel icon=\{FlaskConical\} colorClass="text-\[#10b981\]">Anvil Lab Tools<\/SectionLabel>/g,
    '<SectionLabel icon={Calculator}>Anvil Lab</SectionLabel>'
);

// Replace Lab tiles
content = content.replace(/<NavTile icon=\{Weight\}[\s\S]*?\/>/, 
    `<NavTile area="tool" icon={Weight} title="Carga de barra" hint="Qué discos poner" onClick={() => setIsPlateCalcOpen(true)} />`
);
content = content.replace(/<NavTile icon=\{List\}[\s\S]*?\/>/, 
    `<NavTile area="tool" icon={List} title="Aproximaciones" hint="Escalera de calentamiento" onClick={() => setIsWarmUpCalcOpen(true)} />`
);
content = content.replace(/<NavTile icon=\{Calculator\} title="1RM"[\s\S]*?\/>/, 
    `<NavTile area="tool" icon={Calculator} title="1RM" hint="Desde RPE o velocidad" onClick={() => setIs1RMCalcOpen(true)} />`
);
content = content.replace(/<NavTile icon=\{Fish\}[\s\S]*?\/>/, 
    `<NavTile area="tool" icon={Fish} title="Sushi" hint="Recuento post-competición" onClick={() => setIsSushiCounterOpen(true)} />`
);


// Remove the loading wrapper logic for nextComp, because we use {nextComp && ...} now
content = content.replace(
    /\{loading \? \([\s\S]*?\) : \(/,
    ''
);
content = content.replace(
    /<CountdownWidget assigned=\{nextComp\} userId=\{user\.id\} \/>\s*\)/,
    '<CountdownWidget assigned={nextComp} userId={user.id} />'
);



fs.writeFileSync('src/features/coach/components/CoachHome.tsx', content, 'utf-8');
console.log('Done!');
