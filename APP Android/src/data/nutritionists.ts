export interface Nutritionist {
    id: string;
    name: string;
    role: string;
    image: string;
    instagram: string;
    contactForm: string;
    bio: string; // Importante: el modal de coaches la necesita
}

export const nutritionists: Nutritionist[] = [
  {
    id: "1",
    name: "Javier Rubio",
    role: "NUTRICIONISTA DEPORTIVO",
    image: "/Nutricionistas/Javier Rubio Nutricionista Foto Presentacion.jpeg",
    instagram: "https://www.instagram.com/javitenutre?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==",
    contactForm: "https://docs.google.com/forms/d/e/1FAIpQLSdvFzfh0A97R6U3zXbllOsDgSEP-KTs6zQi8RKtDcWlBZ_nTQ/viewform?usp=sf_link",
    bio: "Especialista en nutrición deportiva enfocada al rendimiento y la composición corporal. Ayudo a atletas de fuerza a maximizar sus resultados a través de estrategias nutricionales personalizadas y basadas en la evidencia.",
  }
];