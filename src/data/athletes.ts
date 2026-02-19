export interface Athlete {
  id: number;
  name: string;
  category: string;
  image: string;
  stats: {
    lastCompetition: string;
    glPoints: number;
    total: number;
    squat: number;
    bench: number;
    deadlift: number;
  };
}

export const athletes: Athlete[] = [
  {
    id: 1,
    name: "Gema Cruz",
    category: "-63kg JNR",
    image: "/athletes/gema.jpeg",
    stats: {
      lastCompetition: "AEP3 Las Torres De Cotilla",
      glPoints: 66.2,
      total: 297.5,
      squat: 120,
      bench: 52.5,
      deadlift: 125
    }
  },
  {
    id: 2,
    name: "Alejandro Hermosilla",
    category: "-83kg Open",
    image: "/athletes/alejandro.jpg",
    stats: {
      lastCompetition: "AEP3 Las Torres De Cotilla",
      glPoints: 84.88,
      total: 602.5,
      squat: 250,
      bench: 127.5,
      deadlift: 225
    }
  },
  {
    id: 3,
    name: "Marc Alonso",
    category: "-105kg JNR",
    image: "/athletes/marc.png",
    stats: {
      lastCompetition: "SBD Cup 2025",
      glPoints: 100.06,
      total: 800,
      squat: 295,
      bench: 192.5,
      deadlift: 312.5
    }
  },
  {
    id: 4,
    name: "Pau Rodriguez",
    category: "-105kg SBJ",
    image: "/athletes/Pau.png",
    stats: {
      lastCompetition: "SBD Cup 2025",
      glPoints: 79.65,
      total: 640,
      squat: 270,
      bench: 140,
      deadlift: 230
    }
  },
  {
    id: 5,
    name: "Josep Lopez",
    category: "-83kg Open",
    image: "/athletes/josep.png",
    stats: {
      lastCompetition: "SBD Cup 2025",
      glPoints: 94.15,
      total: 675,
      squat: 270,
      bench: 135,
      deadlift: 270
    }
  },
  {
    id: 6,
    name: "Carlos Villena",
    category: "-93kg JNR",
    image: "/athletes/villena.png",
    stats: {
      lastCompetition: "AEP3 Las Torres De Cotilla",
      glPoints: 61.16,
      total: 465,
      squat: 182.5,
      bench: 117.5,
      deadlift: 165
    }
  },
  {
    id: 7,
    name: "Marina Rico",
    category: "-69 JNR",
    image: "/athletes/marina.jpg",
    stats: {
      lastCompetition: "III Project Energy Cup",
      glPoints: 71.49,
      total: 340,
      squat: 127.5,
      bench: 67.5,
      deadlift: 145
    }
  },
  {
    id: 8,
    name: "Elsa Fernandez-Arenas",
    category: "-69 JNR",
    image: "/athletes/elsa.jpeg",
    stats: {
      lastCompetition: "Campeonato de España Subjunior 2024",
      glPoints: 55.41,
      total: 262.5,
      squat: 87.5,
      bench: 52.5,
      deadlift: 120
    }
  },
  {
    id: 9,
    name: "Pau Camacho",
    category: "-83kg JNR",
    image: "/athletes/pauca.jpg",
    stats: {
      lastCompetition: "AEP2 Chiva 2025",
      glPoints: 81.41,
      total: 577.5,
      squat: 212.5,
      bench: 135,
      deadlift: 230
    }
  },
  {
    id: 10,
    name: "Santiago Badia",
    category: "-105 SBJ",
    image: "/athletes/santi.jpg",
    stats: {
      lastCompetition: "AEP2 Chiva 2025",
      glPoints: 62.28,
      total: 470,
      squat: 165,
      bench: 85,
      deadlift: 220
    }
  },
  {
    id: 11,
    name: "Javier Rubio",
    category: "-83kg Open",
    image: "/Nutricionistas/Javier Rubio Nutricionista Foto Presentacion.jpeg",
    stats: {
      lastCompetition: "Nacional 2024",
      glPoints: 99.00,
      total: 715,
      squat: 262.5,
      bench: 162.5,
      deadlift: 290
    }
  }
];
