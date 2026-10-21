/**
 * EL RECORTE DE UN ATLETA — la foto sin fondo de la convocatoria y de la
 * portada.
 *
 * Se sirve en WebP con transparencia y en dos alturas (1600px y 800px): la
 * grande para pantallas de alta densidad, la pequeña para el móvil. Cómo se
 * generan: public/athletes/roster/README.md.
 *
 * `encuadre` corrige fotos que no están cortadas igual: no es lo mismo un
 * atleta de cuerpo entero que uno cortado por la cintura. `escala` multiplica
 * la altura en escena (1 = alto completo del escenario) y `bajar` lo desplaza
 * hacia abajo en tanto por uno de su propia altura.
 */
export interface RecorteAtleta {
  src: string;
  src800: string;
  ancho: number;
  alto: number;
  encuadre?: { escala?: number; bajar?: number };
}

/**
 * VÍDEO DE PRESENTACIÓN (opcional) — el atleta cruzando los brazos.
 *
 * Si existe, la convocatoria lo reproduce UNA vez en lugar del recorte y se
 * queda en el último fotograma. Con fondo transparente hacen falta dos
 * ficheros, porque no hay un formato que lean todos los navegadores:
 *
 *   · `webm` — VP9 con canal alfa (Chrome, Edge, Firefox, Android).
 *   · `mov`  — HEVC con canal alfa (Safari, iPhone).
 *
 * Sin `mov`, Safari enseña el recorte, que es exactamente lo que se quiere.
 */
export interface VideoAtleta {
  webm?: string;
  mov?: string;
}

export interface Athlete {
  /** Número en los datos de respaldo; uuid cuando viene de `club_athletes`. */
  id: number | string;
  name: string;
  /** Identificador en la URL de la convocatoria. Sin tildes ni espacios. */
  slug?: string;
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
  description?: string;
  instagram?: string;
  competitionDate?: string;
  recorte?: RecorteAtleta;
  video?: VideoAtleta;
}

const recorte = (slug: string, ancho: number, alto: number, encuadre?: RecorteAtleta['encuadre']): RecorteAtleta => ({
  src: `/athletes/roster/${slug}.webp`,
  src800: `/athletes/roster/${slug}-800.webp`,
  ancho,
  alto,
  encuadre,
});

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
    },
    description: "Atleta de élite en la categoría -63kg. Constancia y técnica impecable en cada levantamiento.",
    instagram: "https://www.instagram.com/gemacruz_"
  },
  {
    id: 2,
    name: "Alejandro Hermosilla",
    slug: "alejandro-hermosilla",
    recorte: recorte("alejandro-hermosilla", 882, 1600, { escala: 1.08, bajar: 0.04 }),
    category: "-83kg Open",
    image: "/athletes/alejandro.jpg",
    stats: {
      lastCompetition: "AEP3 Las Torres De Cotilla",
      glPoints: 84.88,
      total: 602.5,
      squat: 250,
      bench: 127.5,
      deadlift: 225
    },
    description: "Especialista en sentadilla pesada y referente de fuerza en la categoría -83kg.",
    instagram: "https://www.instagram.com/alejandrohermosilla"
  },
  {
    id: 3,
    name: "Marc Alonso",
    slug: "marc-alonso",
    recorte: recorte("marc-alonso", 1064, 1600, { escala: 0.86, bajar: 0 }),
    category: "-105kg JNR",
    image: "/athletes/marc.png",
    competitionDate: "Sábado 16 de Mayo, 12:45",
    description: "Compitiendo al más alto nivel por el club Anvil Strength. Superando límites y forjando una nueva historia de éxito en la plataforma.",
    instagram: "https://www.instagram.com/mar_alonsoo_",
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
    slug: "pau-rodriguez",
    recorte: recorte("pau-rodriguez", 763, 1600, { escala: 1.42, bajar: 0.24 }),
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
    slug: "pau-camacho",
    recorte: recorte("pau-camacho", 526, 1600, { escala: 1.3, bajar: 0.2 }),
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
  },
  {
    id: 12,
    name: "Masoko",
    category: "+120kg Open",
    image: "/athletes/Masoko.jpeg",
    stats: {
      lastCompetition: " ",
      glPoints: 0,
      total: 675,
      squat: 280,
      bench: 165,
      deadlift: 230
    }
  },
  {
    id: 13,
    name: "Alejandro",
    category: "-66Kg Junior",
    image: "/athletes/Alejandro_malaga.jpg",
    stats: {
      lastCompetition: " ",
      glPoints: 0,
      total: 0,
      squat: 0,
      bench: 0,
      deadlift: 0
    }
  }
];
