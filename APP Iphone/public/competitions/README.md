# Fotos de Portada - Competiciones

Coloca aquí las imágenes de portada de cada competición.

## Estructura de carpetas

Cada competición tiene su propia carpeta con el nombre del slug:

```
/public/competitions/
├── cespjunior/
│   └── cover.jpg          ← Foto de portada del Campeonato de España Junior
├── sbdcup2025/
│   └── cover.jpg          ← Foto de portada de la SBD CUP 2025
├── aep3torrescotillas/
│   └── cover.jpg          ← Foto de portada del AEP3 Las Torres de Cotillas
└── [nueva-competicion]/
    └── cover.jpg          ← Añade nuevas carpetas para nuevas competiciones
```

## Formato recomendado
- **Formato**: JPG o WebP
- **Resolución**: mínimo 1200x800px (ratio 3:2 o 16:9)
- **Peso**: máximo 500KB (comprime en squoosh.app si es necesario)

## Cómo añadir una nueva competición
1. Crea una carpeta con el slug en `/public/competitions/`
2. Añade `cover.jpg` dentro
3. Registra la competición en `/src/data/competitions.ts`
