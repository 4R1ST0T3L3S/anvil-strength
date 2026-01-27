/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'anvil-black': '#0a0a0a',
        'anvil-red': '#e63946',
        'anvil-gray': '#2b2d42',
      },
    },
  },
  plugins: [],
}
