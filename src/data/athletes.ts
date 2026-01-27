export interface Athlete {
  id: number;
  name: string;
  category: string;
  image: string;
}

export const athletes: Athlete[] = [
  {
    id: 1,
    name: "Gema Cruz",
    category: "-63kg JNR",
    image: "/athletes/gema.jpeg"
  },
  {
    id: 2,
    name: "Alejandro Hermosilla",
    category: "-83kg Open",
    image: "/athletes/alejandro.jpg"
  },
  {
    id: 3,
    name: "Marc Alonso",
    category: "-105kg JNR",
    image: "/athletes/marc.png"
  },
  {
    id: 4,
    name: "Pau",
    category: "-105kg SBJ",
    image: "/athletes/Pau.png"
  }
];
