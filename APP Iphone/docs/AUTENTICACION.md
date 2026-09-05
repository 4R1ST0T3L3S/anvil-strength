# Autenticación — por qué el login acababa en vercel.app

## El problema

Al entrar con Google (o al confirmar el email de un registro), el usuario
terminaba en la URL `…vercel.app` en lugar de volver a la web.

La causa **no está en el código**. Supabase acepta la URL de retorno que le
manda el cliente, pero solo la respeta si está en su lista blanca. Si no lo
está, la ignora sin avisar y devuelve al usuario a la **Site URL** del
proyecto — que es la de Vercel.

## Lo que se ha cambiado en el código

- `src/lib/authRedirect.ts` calcula siempre la URL de retorno a partir del
  origen desde el que se ha iniciado sesión (o de `VITE_PUBLIC_SITE_URL`
  si se define).
- El retorno apunta a una ruta fija, `/auth/callback`
  (`src/features/auth/pages/AuthCallback.tsx`), que espera a que la sesión
  esté lista y manda a cada rol a su panel.
- El registro por email manda `emailRedirectTo` a esa misma ruta.

## Lo que hay que configurar A MANO en Supabase

Panel de Supabase → **Authentication → URL Configuration**:

**Site URL**

```
https://anvilstrength.es
```

**Redirect URLs** (una por línea; hay que incluir todas las que se usen)

```
https://anvilstrength.es/auth/callback
https://www.anvilstrength.es/auth/callback
http://localhost:4321/auth/callback
https://*.vercel.app/auth/callback
```

Mientras `/auth/callback` del dominio real no esté en esa lista, el login
seguirá saliendo por la Site URL, haga lo que haga el código.

### Entrar sin confirmar el email

Si se quiere que el registro con email deje pasar directamente, sin correo de
confirmación: **Authentication → Providers → Email → Confirm email → OFF**.

Con la confirmación activada, el registro es correcto pero el usuario ve
"Revisa tu email para confirmarla y entrar" y no entra hasta que pulse el
enlace.

### Google

**Authentication → Providers → Google**: el *Authorized redirect URI* que hay
que pegar en la consola de Google Cloud es el que muestra el propio panel de
Supabase (`https://<proyecto>.supabase.co/auth/v1/callback`), no el de la web.
Ese no cambia.

## Acceso de los usuarios nuevos

`profiles.has_access` valía FALSE por defecto y la aplicación devolvía a la
portada a quien no lo tuviera: registrarse acababa en el mismo sitio donde
había empezado. Se corrige en `database/open_signup.sql`, que lo pone a TRUE
y abre las cuentas que quedaron bloqueadas por ese motivo.
