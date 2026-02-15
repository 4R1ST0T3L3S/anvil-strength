# ⚒️ Anvil Strength App

> **La plataforma definitiva para la gestión y el entrenamiento de Powerlifting.**
> *Donde la fuerza se encuentra con la tecnología.*

![Anvil Strength Banner](https://img.shields.io/badge/Anvil-Strength-red?style=for-the-badge&logo=dumbbell&logoColor=white) ![Status](https://img.shields.io/badge/Status-Stable-success?style=for-the-badge) ![Version](https://img.shields.io/badge/Version-1.3.0-blue?style=for-the-badge)

**Anvil Strength App** es una aplicación web progresiva (PWA) diseñada para modernizar la experiencia de entrenamiento en clubes de fuerza. Conecta a entrenadores y atletas en un ecosistema digital fluido, permitiendo una planificación precisa, un seguimiento detallado y herramientas avanzadas para maximizar el rendimiento.

---

## 🚀 Características Principales

La aplicación se divide en dos experiencias optimizadas:

### 👨‍🏫 Para el Entrenador (Coach Mode)

*   **Gestión de Equipo**: Visualiza y administra a todos tus atletas desde un panel centralizado.
*   **Workout Builder**: Diseña mesociclos y sesiones de entrenamiento complejas con una interfaz intuitiva de arrastrar y soltar (o selección rápida).
*   **Librería de Ejercicios**: Acceso a una base de datos completa de ejercicios categorizados por patrón de movimiento y grupo muscular.
*   **Seguimiento**: Revisa el cumplimiento de las sesiones de tus atletas.

### 🏋️‍♂️ Para el Atleta (Athlete Mode)

*   **Dashboard Personal**: Todo lo que necesitas en un solo vistazo (Entrenamiento de hoy, Notas del coach, Próximas competiciones).
*   **Workout Logger Interactivo**:
    *   Registra tus series, peso, RPE/RIR y notas en tiempo real.
    *   Interfaz "Mobile-First" diseñada para usarse en el gimnasio.
    *   Visualización clara de objetivos vs. realidad.
*   **Anvil Lab Tools** (Herramientas avanzadas integradas):
    *   🧮 **Calculadora 1RM Pro**: Estima tus máximos usando **RPE** o **Velocidad (VBT)** con coeficientes ajustados por ejercicio.
    *   🧱 **Calculadora de Discos**: Visualización gráfica automática con restricción de carga máxima (510kg).
    *   🔥 **Generador de Calentamiento**: Protocolos de aproximación automáticos basados en tu peso objetivo.
*   **Comunidad**:
    *   ⚔️ **La Arena**: Sistema de apuestas y predicciones con *Anvil Coins*.
    *   🏆 **Anvil Ranking**: Leaderboard del club en tiempo real.
*   **Sección de Nutrición**: Acceso rápido a planes nutricionales y macros.

---

## 💻 Stack Tecnológico

Construido con las últimas tecnologías para garantizar velocidad, escalabilidad y una gran experiencia de usuario (DX/UX).

| Capa | Tecnología | Descripción |
| :--- | :--- | :--- |
| **Frontend** | ![React](https://img.shields.io/badge/React_18-20232A?style=flat-square&logo=react&logoColor=61DAFB) | Librería UI principal. |
| **Lenguaje** | ![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white) | Tipado estático para robustez. |
| **Build Tool** | ![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white) | Entorno de desarrollo ultrarrápido. |
| **Estilos** | ![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white) | Diseño moderno y responsive. |
| **Backend / Auth** | ![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=white) | Base de datos PostgreSQL, Auth y Realtime. |
| **Estado** | ![TanStack Query](https://img.shields.io/badge/TanStack_Query-FF4154?style=flat-square&logo=react-query&logoColor=white) | Gestión de estado asíncrono y caché. |
| **Testing** | ![Playwright](https://img.shields.io/badge/Playwright-45ba4b?style=flat-square&logo=Playwright&logoColor=white) | Pruebas End-to-End fiables. |

---

## 📂 Arquitectura del Proyecto

El proyecto sigue una arquitectura **Feature-Base** para facilitar la escalabilidad y el mantenimiento:

```
src/
├── features/           # Módulos de negocio aislados
│   ├── athlete/        # Vistas y lógica del atleta
│   ├── coach/          # Vistas y lógica del entrenador
│   ├── planning/       # Builder y gestión de planes
│   ├── training/       # Ejecución y logger (WorkoutLogger)
│   └── auth/           # Autenticación
├── components/         # UI Kit compartido (Botones, Inputs, Layouts)
├── hooks/              # Hooks globales (useUser, useAuth)
├── lib/                # Configuración de terceros (supabase.ts)
└── types/              # Definiciones de tipos globales
```

---

## 🛠️ Instalación y Desarrollo Locales

Sigue estos pasos para levantar el proyecto en tu máquina:

### 1. Requisitos Previos
*   Node.js (v18+)
*   Cuenta de Supabase (para las credenciales)

### 2. Clonar e Instalar
```bash
git clone https://github.com/tu-usuario/anvil-strength.git
cd anvil-strength
npm install
```

### 3. Configuración de Entorno
Crea un archivo `.env` en la raíz del proyecto y añade tus claves de API de Supabase:

```env
VITE_SUPABASE_URL=tu_url_de_supabase
VITE_SUPABASE_ANON_KEY=tu_anon_key_de_supabase
```

### 4. Ejecutar
```bash
npm run dev
```
El servidor arrancará en `http://localhost:5173`.

---

## ✨ Scripts Disponibles

*   `npm run dev`: Inicia el servidor de desarrollo.
*   `npm run build`: Compila la aplicación para producción.
*   `npm run lint`: Busca problemas en el código.
*   `npm run update-types`: Sincroniza los tipos con tu base de datos Supabase.

---

<div align="center">
  <p>Desarrollado con 💪 para Anvil Strength</p>
</div>
