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
    image: "https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?q=80&w=1000&auto=format&fit=crop"
  },
  {
    id: 2,
    name: "Alejandro Hermosilla",
    category: "-83kg Open",
    image: "https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?q=80&w=1000&auto=format&fit=crop"
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
