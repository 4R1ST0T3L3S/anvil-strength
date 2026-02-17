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
    logoClassName: "w-[56px] h-[56px] bottom-4 right-4 object-right-bottom",
    instagram: "https://www.instagram.com/javierestelles?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==",
    bio: "CIENCIA. RENDIMIENTO. PASIÓN.\n\nDoctorando en Ciencias de la Actividad Física y del Deporte (UV).\nMáster Oficial en Alto Rendimiento Deportivo (UCAM).\nGrado en Ciencias de la Actividad Física y del Deporte (UCV).\n\nProfesor en Apta Vital Sport.\nEntrenador especialista en Powerlifting y Halterofilia.\n\nFusiono el rigor académico con la experiencia práctica para llevar tu rendimiento al siguiente nivel."
  },
  {
    id: 2,
    name: "Javier Bou",
    role: "ENTRENADOR DE POWERLIFTING",
    image: "/javier-bou.jpeg",
    logo: "/Logotipo - sin fondo.png",
    logoClassName: "w-[70px] h-[70px] bottom-4 right-4",
    instagram: "https://www.instagram.com/boustrength?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==",
    contactForm: "https://docs.google.com/forms/d/e/1FAIpQLSfACXcjom-FbRi1a-PNyrJdvY_wAO9Hpa3_hktaNY82QDx4tg/viewform",
    bio: "Apasionado del powerlifting y cansado de un mundo donde a todo el mundo le dan una programación de copiar y pegar, donde todo se basa en una escala de RPE del 1 al 10 sin baremos intermedios y sin datos confiables. Por ello, implemento las técnicas más avanzadas con tal de recopilar todos los datos posibles de ti y tus levantamientos, convirtiendo una sensación en números que se pueden tratar para conocerte mejor como atleta. No dejes ningún entrenamiento al azar. En un deporte con normas de competición, entrena con ellas."
  },
  {
    id: 3,
    name: "Javier Rubio",
    role: "NUTRICIONISTA DEPORTIVO",
    image: "/Nutricionistas/Javier Rubio Nutricionista Foto Presentacion.jpeg",
    instagram: "https://www.instagram.com/javitenutre?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==",
    contactForm: "https://docs.google.com/forms/d/e/1FAIpQLSdvFzfh0A97R6U3zXbllOsDgSEP-KTs6zQi8RKtDcWlBZ_nTQ/viewform?usp=sf_link",
    bio: "Especialista en nutrición deportiva enfocada al rendimiento y la composición corporal. Ayudo a atletas de fuerza a maximizar sus resultados a través de estrategias nutricionales personalizadas y basadas en la evidencia.",
  }
];