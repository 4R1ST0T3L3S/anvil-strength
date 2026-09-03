const fs = require('fs');
const path = require('path');

const files = [
    'src/features/coach/components/CoachHome.tsx',
    'src/features/athlete/components/AthleteHome.tsx'
];

files.forEach(file => {
    let content = fs.readFileSync(path.resolve(file), 'utf8');

    // 1. Replace the Mobile Icon Wrapper
    // From: <div className="bg-[COLOR]/10 w-10 h-10 rounded-xl flex items-center justify-center text-[COLOR] mb-auto group-hover:scale-110 transition-transform">\n<Icon size={20} />\n</div>
    // To: <div className="text-[COLOR] mb-auto group-hover:scale-110 transition-transform origin-left">\n<Icon size={28} strokeWidth={1.5} />\n</div>
    content = content.replace(
        /<div className="bg-[^"]+ w-10 h-10 rounded-xl flex items-center justify-center text-([a-zA-Z0-9-]+) mb-auto group-hover:scale-110 transition-transform">\s*<([A-Za-z0-9]+) size=\{20\} \/>\s*<\/div>/g,
        '<div className="text-$1 mb-auto group-hover:scale-110 transition-transform origin-left">\n                                    <$2 size={28} strokeWidth={1.5} />\n                                </div>'
    );

    // 2. Replace the Desktop Icon Wrapper
    // From: <div className="bg-[COLOR]/10 w-12 h-12 lg:w-14 lg:h-14 rounded-2xl flex items-center justify-center text-[COLOR] mb-auto group-hover:scale-110 transition-transform">\n<Icon size={24} className="lg:w-7 lg:h-7" />\n</div>
    // To: <div className="text-[COLOR] mb-auto group-hover:scale-110 transition-transform origin-left">\n<Icon size={32} strokeWidth={1.5} className="lg:w-10 lg:h-10" />\n</div>
    content = content.replace(
        /<div className="bg-[^"]+ w-12 h-12 lg:w-14 lg:h-14 rounded-2xl flex items-center justify-center text-([a-zA-Z0-9-]+) mb-auto group-hover:scale-110 transition-transform">\s*<([A-Za-z0-9]+) size=\{24\} className="lg:w-7 lg:h-7" \/>\s*<\/div>/g,
        '<div className="text-$1 mb-auto group-hover:scale-110 transition-transform origin-left">\n                                    <$2 size={32} strokeWidth={1.5} className="lg:w-10 lg:h-10" />\n                                </div>'
    );

    // 3. Replace Mobile Title Wrapper
    // From: <div className="mt-4">\n<span className="font-bold text-white block text-sm leading-tight">Title</span>\n<span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mt-1 block">Subtitle</span>\n</div>
    // To: <div className="mt-auto pt-4">\n<span className="font-black text-white block text-lg leading-tight tracking-tight">Title</span>\n<span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1 block">Subtitle</span>\n</div>
    content = content.replace(
        /<div className="mt-4">\s*<span className="font-bold text-white block text-sm leading-tight">([^<]+)<\/span>\s*<span className="text-\[9px\] text-([a-zA-Z0-9-]+) font-bold uppercase tracking-widest mt-1 block">([^<]+)<\/span>\s*<\/div>/g,
        '<div className="mt-auto pt-4">\n                                    <span className="font-black text-white block text-lg leading-tight tracking-tight">$1</span>\n                                    <span className="text-[10px] text-$2 font-bold uppercase tracking-widest mt-1 block">$3</span>\n                                </div>'
    );

    // 4. Replace Desktop Title Wrapper
    // From: <div className="mt-4">\n<span className="font-bold text-white block text-sm lg:text-lg leading-tight">Title</span>\n<span className="text-[10px] lg:text-[11px] text-gray-500 font-bold uppercase tracking-widest mt-1 block">Subtitle</span>\n</div>
    // To: <div className="mt-auto pt-4">\n<span className="font-black text-white block text-xl lg:text-2xl leading-tight tracking-tight">Title</span>\n<span className="text-[11px] lg:text-[12px] text-gray-500 font-bold uppercase tracking-widest mt-1 block">Subtitle</span>\n</div>
    content = content.replace(
        /<div className="mt-4">\s*<span className="font-bold text-white block text-sm lg:text-lg leading-tight">([^<]+)<\/span>\s*<span className="text-\[10px\] lg:text-\[11px\] text-([a-zA-Z0-9-]+) font-bold uppercase tracking-widest mt-1 block">([^<]+)<\/span>\s*<\/div>/g,
        '<div className="mt-auto pt-4">\n                                    <span className="font-black text-white block text-xl lg:text-2xl leading-tight tracking-tight">$1</span>\n                                    <span className="text-[11px] lg:text-[12px] text-$2 font-bold uppercase tracking-widest mt-1 block">$3</span>\n                                </div>'
    );

    // Some desktop buttons might have a different structure (e.g. Panel de control)
    // Let's also check for Panel de Control structure in DesktopHome / DesktopCoachHome
    // Panel de Control desktop Coach:
    // <div className="bg-blue-500/10 w-12 h-12 rounded-xl flex items-center justify-center text-blue-500 mb-4 group-hover:scale-110 transition-transform">\n<FileText size={24} />\n</div>
    // <div>\n<span className="font-bold text-white block text-lg">Mi Planificación</span>\n<span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1 block">Entrenamientos</span>\n</div>
    content = content.replace(
        /<div className="bg-[^"]+ w-12 h-12 rounded-xl flex items-center justify-center text-([a-zA-Z0-9-]+) mb-4 group-hover:scale-110 transition-transform">\s*<([A-Za-z0-9]+) size=\{24\} \/>\s*<\/div>/g,
        '<div className="text-$1 mb-auto group-hover:scale-110 transition-transform origin-left">\n                            <$2 size={32} strokeWidth={1.5} />\n                        </div>'
    );

    // Panel de Control text desktop:
    // <div>\n<span className="font-bold text-white block text-lg">Title</span>\n<span className="text-[10px] text-[a-z0-9-]+ font-bold uppercase tracking-widest mt-1 block">Subtitle</span>\n</div>
    // We only want to replace this if it is inside the button grid.
    content = content.replace(
        /<div>\s*<span className="font-bold text-white block text-lg">([^<]+)<\/span>\s*<span className="text-\[10px\] text-([a-zA-Z0-9-]+) font-bold uppercase tracking-widest mt-1 block">([^<]+)<\/span>\s*<\/div>/g,
        '<div className="mt-auto pt-4">\n                            <span className="font-black text-white block text-xl leading-tight tracking-tight">$1</span>\n                            <span className="text-[11px] text-$2 font-bold uppercase tracking-widest mt-1 block">$3</span>\n                        </div>'
    );

    fs.writeFileSync(file, content, 'utf8');
});

console.log("Refactoring complete");
