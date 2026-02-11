export interface Coach {
  id: number;
  name: string;
  role: string;
  image: string;
  instagram: string;
  email?: string;
  contactForm?: string;
  bio: string;
  logo?: string;
  logoClassName?: string;
}

export const coaches: Coach[] = [
  {
    id: 1,
    name: "Javier Estelles",
    role: "ENTRENADOR DE POWERLIFTING",
    image: "/javier-estelles-new.jpg",
    logo: "/javier-estelles-logo.png",
    logoClassName: "w-40 h-40 bottom-0 right-0",
    instagram: "https://www.instagram.com/javierestelles?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==",
    contactForm: "https://docs.google.com/forms/d/e/1FAIpQLSfACXcjom-FbRi1a-PNyrJdvY_wAO9Hpa3_hktaNY82QDx4tg/viewform",
    bio: "CIENCIA. RENDIMIENTO. PASIÓN.\n\nDoctorando en Ciencias de la Actividad Física y del Deporte (UV).\nMáster Oficial en Alto Rendimiento Deportivo (UCAM).\nGrado en Ciencias de la Actividad Física y del Deporte (UCV).\n\nProfesor en Apta Vital Sport.\nEntrenador especialista en Powerlifting y Halterofilia.\n\nFusiono el rigor académico con la experiencia práctica para llevar tu rendimiento al siguiente nivel."
  },
  {
    id: 2,
    name: "Javier Bou",
    role: "ENTRENADOR DE POWERLIFTING",
    image: "/javier-bou.jpeg",
    logo: "/Logotipo - sin fondo.png",
    logoClassName: "w-20 h-20 bottom-4 right-4",
    instagram: "https://www.instagram.com/boustrength?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==",
    contactForm: "https://docs.google.com/forms/d/e/1FAIpQLSfACXcjom-FbRi1a-PNyrJdvY_wAO9Hpa3_hktaNY82QDx4tg/viewform",
    bio: "Apasionado del Powerlifting y el entrenamiento de fuerza. Con años de experiencia en competición y preparación de atletas, mi objetivo es perfeccionar la técnica y la programación para alcanzar números de élite. La disciplina y la constancia son los pilares de mi metodología."
  }
];