export interface Athlete {
  id: number;
  name: string;
  category: string;
  image: string;
  stats: {
    lastCompetition: string;
    glsPoints: number;
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
      glsPoints: 85.0,
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
      glsPoints: 92.0,
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
      lastCompetition: "AEP2 SBD Cup",
      glsPoints: 108.5,
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
      lastCompetition: "AEP2 SBD Cup",
      glsPoints: 85.5,
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
      lastCompetition: "AEP2 SBD Cup",
      glsPoints: 0,
      total: 675,
      squat: 270,
      bench: 135,
      deadlift: 270
    }
  }
];
