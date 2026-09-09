# Autenticación — por qué el login acababa en una página de Vercel

Revisado el 7 de septiembre de 2026. Sustituye a la versión anterior, que
describía un despliegue que ya no existe.

## Los DOS fallos, que no son el mismo

El síntoma que se reportaba ("entro con Google y acabo en una página de
Vercel, no en Anvil Strength") tapaba dos causas distintas. Las dos hacían
falta para explicar todo lo que se veía.

### Fallo 1 — anvilstrength.es no tenía panel al que ir (ARREGLADO en código)

El 3 de septiembre de 2026 el repositorio se partió en copias por producto y
la carpeta `Landing Page/` —la que construye anvilstrength.es— se recortó a
"solo promocional": se le quitaron del enrutado `/dashboard`,
`/coach-dashboard` y todo lo demás.

Pero `/auth/callback` **se quedó**. Y esa pantalla termina en

```tsx
<Navigate to={homeRouteFor(user)} replace />   // → /dashboard o /coach-dashboard
```

Ninguna de las dos existía en esa build, así que la navegación caía en el
comodín `*` y rebotaba a la portada. **El login funcionaba perfectamente y
parecía que no.**

Arreglado devolviéndole a esa copia el enrutado completo
(`Landing Page/src/routes/AppRoutes.tsx`). Desde ahora anvilstrength.es sirve
la aplicación entera: `/` es la portada para quien no tiene sesión y el panel
para quien la tiene, **en la misma dirección**. No hace falta tocar nada en
Vercel: el `vercel.json` de la raíz ya construía esa carpeta.

### Fallo 2 — la URL de retorno no está en la lista blanca (HAY QUE TOCARLO A MANO)

Supabase acepta la URL de retorno que le manda el cliente, pero **solo la
respeta si está en su lista blanca**. Si no lo está, la ignora sin avisar y
devuelve al usuario a la **Site URL** del proyecto. Si esa Site URL es la de
`*.vercel.app`, eso es exactamente la página de Vercel que aparecía.

Esto **no se puede arreglar desde el código**: el navegador ni siquiera vuelve
a nuestro origen, así que no hay nada nuestro ejecutándose para detectarlo.

## Lo que hay que configurar A MANO en Supabase

Panel de Supabase → **Authentication → URL Configuration**

### Site URL

```
https://anvilstrength.es
```

Este es el valor al que Supabase manda a alguien cuando **no** reconoce la URL
de retorno. Mientras sea una dirección de vercel.app, cualquier fallo de lista
blanca se ve como "me ha echado a una página de Vercel".

### Redirect URLs

Una por línea. Tienen que estar **todas** las direcciones desde las que
alguien puede iniciar sesión:

```
https://anvilstrength.es/auth/callback
https://www.anvilstrength.es/auth/callback
https://ios.anvilstrength.es/auth/callback
http://localhost:4321/auth/callback
http://localhost:4322/auth/callback
https://*.vercel.app/auth/callback
```

- `ios.anvilstrength.es` es el proyecto de Vercel `anvil_strength_iphone_app`,
  que sirve la carpeta `APP Iphone/`. Sigue existiendo.
- `localhost:4321` es el servidor de desarrollo de la raíz y `4322` la vista
  previa de la copia Landing (ver `.claude/launch.json`).
- El comodín de vercel.app cubre las previsualizaciones de rama.

### Cómo comprobar que ha quedado bien

Sin credenciales ni consola, desde cualquier terminal:

```bash
curl -s -o /dev/null -w '%{redirect_url}\n' \
  "https://ihcyuoczbmjxfinxvzra.supabase.co/auth/v1/authorize?provider=google&redirect_to=https%3A%2F%2Fanvilstrength.es%2Fauth%2Fcallback"
```

En la URL de Google que devuelve, mira el parámetro `redirect_uri` y, dentro
de `state`, a dónde dice que volverá. Si la lista blanca **no** acepta nuestra
dirección, Supabase ya habrá sustituido el destino por la Site URL en este
primer salto — antes de que el usuario vea nada de Google. Es la forma más
rápida de distinguir "está mal configurado" de "falla más adelante".

Y desde la propia aplicación: `/auth/callback` ahora **explica** lo que ha
pasado en vez de girar ocho segundos y rebotar. Enseña el código de error del
proveedor y desde qué origen se entró, que son los dos datos que hacían falta
para diagnosticar esto y que nadie sabía dar. Ver
`src/features/auth/pages/AuthCallback.tsx`.

### Google

**Authentication → Providers → Google**: el *Authorized redirect URI* que hay
que pegar en la consola de Google Cloud es el que muestra el propio panel de
Supabase (`https://ihcyuoczbmjxfinxvzra.supabase.co/auth/v1/callback`), **no**
el de la web. Ese no cambia nunca y no tiene nada que ver con la lista de
arriba: son dos saltos distintos del mismo viaje.

```
navegador → Google → Supabase (/auth/v1/callback) → nuestra web (/auth/callback)
            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
            lo configura Google Cloud              lo configura la lista blanca
```

Confundir los dos es el error clásico: poner la URL de la web en Google Cloud
da `redirect_uri_mismatch` de Google, que es un error DISTINTO al de acabar en
la Site URL.

## `VITE_PUBLIC_SITE_URL`

`src/lib/authRedirect.ts` calcula la URL de retorno desde el origen actual,
salvo que se defina esta variable, que manda sobre todo lo demás.

- **En la web no hace falta** y es mejor no ponerla: sin ella, entrar desde una
  previsualización de Vercel te devuelve a esa previsualización, que es lo
  correcto para probar.
- **En las apps empaquetadas sí importa**: dentro del APK o del envoltorio de
  escritorio, `window.location.origin` vale `app://anvil`, una dirección que
  solo existe dentro del dispositivo. Ahí `authRedirect.ts` ya cae al dominio
  público por su cuenta (`esAppEmpaquetada()`), y esta variable solo sirve para
  apuntar a otro sitio en pruebas.

## Entrar sin confirmar el email

**Authentication → Providers → Email → Confirm email → OFF** si se quiere que
el registro con email deje pasar directamente. Con la confirmación activada el
registro es correcto, pero el usuario ve "Revisa tu email para confirmarla y
entrar" y no entra hasta que pulse el enlace — y ese correo es el que llega a
spam. Ver `docs/EMAILS.md`.

## Acceso de los usuarios nuevos

`profiles.has_access` valía FALSE por defecto y la aplicación devolvía a la
portada a quien no lo tuviera: registrarse acababa en el mismo sitio donde
había empezado. Se corrige en `database/open_signup.sql`, que lo pone a TRUE y
abre las cuentas que quedaron bloqueadas por ese motivo.

## Cerrar sesión

Vive en `src/lib/sesion.ts`, en una sola copia. Antes había tres y las tres
fallaban igual: `supabase.auth.signOut()` sin argumentos revoca en el
**servidor**, y cuando esa petición fallaba —token caducado, o sin red— la
promesa se rechazaba, la navegación posterior no llegaba a ejecutarse y la
sesión seguía en `localStorage`. Pulsabas "Cerrar sesión" y no pasaba nada.

Ahora la revocación en el servidor es un intento, el borrado local se hace
pase lo que pase, y se limpian además las claves que no conoce la librería
—entre ellas `anvil:write-queue:v1`, la cola de escrituras pendientes, que de
otro modo se vaciaría contra la sesión de la siguiente persona que entrase en
ese dispositivo—.
