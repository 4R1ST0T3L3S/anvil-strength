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
    image: "https://images.unsplash.com/photo-1599058945522-28d584b6f0ff?q=80&w=1000&auto=format&fit=crop"
  },
  {
    id: 4,
    name: "Pau",
    category: "-105kg SBJ",
    image: "https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?q=80&w=1000&auto=format&fit=crop"
  }
];
