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
      lastCompetition: "Campeonato Nacional 2024",
      glsPoints: 95.5,
      total: 380,
      squat: 135,
      bench: 75,
      deadlift: 170
    }
  },
  {
    id: 2,
    name: "Alejandro Hermosilla",
    category: "-83kg Open",
    image: "/athletes/alejandro.jpg",
    stats: {
      lastCompetition: "AEP 3 Black On",
      glsPoints: 102.3,
      total: 650,
      squat: 230,
      bench: 150,
      deadlift: 270
    }
  },
  {
    id: 3,
    name: "Marc Alonso",
    category: "-105kg JNR",
    image: "/athletes/marc.png",
    stats: {
      lastCompetition: "Copa Regional Norte",
      glsPoints: 98.7,
      total: 700,
      squat: 250,
      bench: 160,
      deadlift: 290
    }
  },
  {
    id: 4,
    name: "Pau",
    category: "-105kg SBJ",
    image: "/athletes/Pau.png",
    stats: {
      lastCompetition: "Debutante",
      glsPoints: 0,
      total: 0,
      squat: 0,
      bench: 0,
      deadlift: 0
    }
  }
];
