export interface Achievement {
    id: number;
    title: string;
    result: string;
    images: string[];
    desc: string;
}

export const achievements: Achievement[] = [
    {
        id: 1,
        title: "Campeonato Nacional SBJ 2026",
        result: "Primer puesto -105Kg",
        images: ["/Logros/PAU RODRIGUEZ-44.jpg", "/Logros/PODIO_SBJ26.jpg"],
        desc: "Campeón de España en los 3 movimientos y pase directo para competir en el Europeo Subjunior para Pau Rodríguez."
    },
    {
        id: 2,
        title: "SBD CUP 2025",
        result: "2 Segundos puestos",
        images: ["/Logros/podio_sbd.jpg"],
        desc: "Plata en la categoría de -83Kg y -105Kg. En esta última, un record de España (no oficial) en press banca con 192.5kg."
    },
    {
        id: 3,
        title: "Campeonato Nacional SBJ 2026",
        result: "Tercer puesto -105Kg",
        images: ["/Logros/Santiago_sbj26.jpg"],
        desc: "Tercero de España en los 3 movimientos para Santiago Badía."
    },
    {
        id: 4,
        title: "Black Oni VI",
        result: "Podio Absoluto",
        images: ["/logro3_1.jpg"],
        desc: "Tercer puesto absoluto de nuestro atleta Pau Camacho, además de hacerse con el oro en la categoría de 83Kg"
    },
    {
        id: 5,
        title: "Campeonato Nacional SBJ 2026",
        result: "2do puesto por clubes",
        images: ["/logro1_1.jpg", "/logro1_2.jpg"],
        desc: "Segundo mejor club del campeonato de España Subjunior 2026 gracias a las actuaciones de Pau Rodriguez y Santi!"
    },
    {
        id: 6,
        title: "Regional ESTE 2 · Chiva 2026",
        result: "Campeón -74Kg",
        images: ["/Logros/fernando_chiva26.jpg"],
        desc: "Fernando Alexander se proclamó campeón de la categoría de -74Kg en el Campeonato Regional ESTE 2 celebrado en Chiva."
    },
    {
        id: 7,
        title: "Campeonato de España Junior 2026",
        result: "Campeón -105Kg · 2º Absoluto",
        images: ["/Logros/junior26_105.jpg"],
        desc: "Campeón de España Junior en la categoría de -105Kg y segundo puesto absoluto del campeonato."
    },
];
