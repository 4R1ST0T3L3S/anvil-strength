# Changelog

Todos los cambios destacables de Anvil Strength App.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## 25-02-2026
* **Refactor de Acceso y Rutas (`AppRoutes.tsx`, `SmartAuthButton.tsx`)**: Los usuarios sin acceso a la aplicación (`has_access === false`) ahora pueden permanecer en la web pública visualizando la publicidad, en lugar de ser forzosamente redirigidos a la página de pendiente.
* **Nueva Pagina de Perfil (`ProfilePage.tsx`)**: Al hacer clic en "Mi perfil", los usuarios pendientes de validación son dirigidos a una nueva vista donde pueden revisar su estado ("Cuenta en Revisión") y modificar libremente todos sus datos personales, sin acceder al resto de áreas privadas del Coach o Atleta.
* **Limpieza de Código (Linter & TS)**: Se resolvieron 7 errores y advertencias de TypeScript y react-hooks en toda la web, incluyendo `App.tsx`, `PDFModal.tsx`, `AuthModal.tsx` y `CompetitionsPage.tsx`. El proyecto compila limpiamente a nivel estricto.

## 24-02-2026
* **Autenticación Restaurada**: Se ha vuelto a habilitar el inicio de sesión y registro en toda la plataforma (`App.tsx`, `AppRoutes.tsx`, y vistas públicas).
* **Google Login**: Integración del botón oficial de "Continuar con Google" en el `AuthModal` utilizando OAuth de Supabase.
* **Acceso Restringido (Gated Registration)**: Todos los usuarios pueden registrarse, pero el acceso a las funciones internas queda pendiente hasta que el administrador otorgue acceso manual cambiando la propiedad `has_access` a `TRUE` en la tabla `profiles` de Supabase. Añadida nueva interfaz de "Cuenta Pendiente" (`PendingApprovalPage.tsx`).
