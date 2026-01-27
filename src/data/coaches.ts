export interface Coach {
  id: number;
  name: string;
  role: string;
  image: string;
  instagram: string;
  email?: string;
  contactForm?: string;
  bio: string;
}

export const coaches: Coach[] = [
  {
    id: 1,
    name: "Javier Estelles",
    role: "ENTRENADOR Y NUTRICIONISTA",
    image: "/coaches/estelles.png",
    instagram: "https://www.instagram.com/javierestelles?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==",
    contactForm: "https://docs.google.com/forms/d/e/1FAIpQLSf0F6_yqJ0_7_xJ0_7_xJ0_7_xJ0_7_xJ0_7/viewform", // Reemplazar con el enlace real
    bio: "Graduado en Ciencias de la Actividad Física y el Deporte, y en Nutrición Humana y Dietética. Especialista en rendimiento deportivo y composición corporal. Mi enfoque combina la ciencia del entrenamiento con estrategias nutricionales optimizadas para sacar el máximo potencial de cada atleta."
  },
  {
    id: 2,
    name: "Javier Bou",
    role: "ENTRENADOR DE POWERLIFTING",
    image: "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?q=80&w=2070&auto=format&fit=crop", // Placeholder until updated
    instagram: "https://www.instagram.com/boustrength?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==",
    contactForm: "https://docs.google.com/forms/d/e/1FAIpQLSf0F6_yqJ0_7_xJ0_7_xJ0_7_xJ0_7_xJ0_7/viewform", // Reemplazar con el enlace real
    bio: "Apasionado del Powerlifting y el entrenamiento de fuerza. Con años de experiencia en competición y preparación de atletas, mi objetivo es perfeccionar la técnica y la programación para alcanzar números de élite. La disciplina y la constancia son los pilares de mi metodología."
  }
];
