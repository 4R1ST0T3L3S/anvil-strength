# Correo — por qué llega a spam y cómo se arregla

Escrito el 9 de septiembre de 2026.

## Primero: qué manda correos hoy, exactamente

Hay **dos** caminos por los que un atleta acaba dentro de Anvil Strength, y
solo uno de ellos manda un correo.

### 1. Ficha creada por el entrenador → SÍ manda correo

`supabase/functions/athletes/index.ts`, acción `invite`. El entrenador crea
la ficha de un atleta y le manda el acceso. Por dentro:

```ts
await anon.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${APP_URL}/auth/callback` },
});
```

Eso dispara el correo de **Magic Link** de Supabase Auth. Es el correo de
"asociación entrenador → atleta" del que se queja el encargo, y es el que
llega a spam.

### 2. Enlace de invitación con código → NO manda ningún correo

`invitesService.create()` genera un código y una fila en `coach_invites`. El
entrenador **copia** el enlace `/invitacion/<código>` y lo manda por su
cuenta, normalmente por WhatsApp. Aquí no interviene ningún servidor de
correo, así que no hay nada que pueda caer en spam — pero tampoco hay forma
de mandarlo por correo desde la aplicación. Ver el último apartado.

## Segundo: por qué llega a spam. No es el HTML

El correo del camino 1 lo envía el **servicio de correo integrado de
Supabase**, el que viene puesto cuando no configuras nada. Ese servicio:

- Envía desde `noreply@mail.app.supabase.io`. El remitente **no es tu
  dominio**.
- Por tanto, tu dominio no lo firma. No hay **DKIM** de `anvilstrength.es` ni
  **SPF** que autorice a ese servidor a enviar en tu nombre, así que Gmail no
  puede comprobar que el correo venga de quien dice venir. Un correo que
  habla de Anvil Strength, enlaza a anvilstrength.es y se envía desde un
  dominio ajeno es, para un filtro antispam, exactamente la forma que tiene
  la suplantación.
- Sale por una **IP compartida** con todos los proyectos gratuitos de
  Supabase. La reputación no es tuya y no puedes mejorarla.
- Tiene un **límite de envío muy bajo** —del orden de unos pocos correos por
  hora— porque está pensado para desarrollo, no para producción. El propio
  panel de Supabase lo avisa.

**Conclusión: cambiar el HTML no arregla nada por sí solo.** Un correo
precioso enviado desde un dominio que no es el tuyo sigue yendo a spam. Las
plantillas de `supabase/templates/` son la mitad de imagen; la mitad que
decide si el correo LLEGA es la de abajo.

## Tercero: el arreglo

### Paso 1 — un proveedor de correo transaccional

Hay que dejar de usar el SMTP integrado. Opciones razonables para este
volumen (todas tienen plan gratuito suficiente para un club):

| Proveedor | Nota |
|---|---|
| **Resend** | El más simple de configurar; pensado para esto. |
| **Brevo** (antes Sendinblue) | Plan gratuito generoso, panel en español. |
| **Postmark** | El de mejor entregabilidad, pero de pago antes. |

Da igual cuál: lo que importa es el paso 2.

### Paso 2 — verificar el dominio (ESTO es lo que saca de spam)

En el panel del proveedor, añadir `anvilstrength.es` y seguir su asistente de
verificación. Te dará tres registros DNS que hay que crear donde tengas el
dominio:

- **SPF** — un `TXT` en la raíz que autoriza a los servidores del proveedor a
  enviar en nombre de tu dominio. Si ya tienes un SPF, **no crees un
  segundo**: se fusionan en uno solo. Dos registros SPF invalidan los dos.
- **DKIM** — uno o varios `CNAME`/`TXT` que publican la clave con la que el
  proveedor firma cada correo. Es lo que permite a Gmail comprobar que el
  correo no se ha manipulado y viene de verdad de tu dominio.
- **DMARC** — un `TXT` en `_dmarc.anvilstrength.es` que dice qué hacer con
  los correos que no pasan las comprobaciones. Empieza suave y endurece
  después:

  ```
  v=DMARC1; p=none; rua=mailto:dmarc@anvilstrength.es
  ```

  `p=none` solo observa y te manda informes. Cuando lleves un par de semanas
  sin sorpresas, súbelo a `p=quarantine` y más adelante a `p=reject`. Empezar
  directamente en `reject` con algo mal configurado tira TODO tu correo,
  incluido el que sí es legítimo.

Los valores exactos los da el proveedor. No los inventes ni los copies de
otro sitio: la clave DKIM es única de tu cuenta.

### Paso 3 — enchufarlo a Supabase

Panel de Supabase → **Project Settings → Authentication → SMTP Settings** →
*Enable Custom SMTP*, y rellenar con lo que dé el proveedor:

| Campo | Valor |
|---|---|
| Sender email | `no-responder@anvilstrength.es` |
| Sender name | `Anvil Strength` |
| Host / Port / User / Pass | los del proveedor |

Sobre el remitente: **que sea de tu dominio, y a poder ser que se pueda
responder**. Un `noreply@` que rebota es una señal negativa para los filtros
y una frustración para quien contesta. Si `no-responder@` no acepta
respuestas, pon al menos un **Reply-To** hacia la dirección de contacto real.

Hoy esa dirección es `anvilstrengthclub@gmail.com`: es la que aparece en el
pie de la web, en las FAQ y —lo que más pesa— en el Aviso Legal y en la
Política de Privacidad como dirección para ejercer derechos. Es también la
que llevan las plantillas en su pie.

Cuando montes el buzón del dominio, cambiarla es una tarea de **cinco
sitios**, no de uno: `supabase/templates/_base.html`, `PublicFooter.tsx`,
`FAQSection.tsx`, `AvisoLegal.tsx` y `PoliticaPrivacidad.tsx` (esta última la
menciona dos veces). Cambiarla solo en el correo dejaría dos direcciones
distintas diciendo ser la oficial, y la del aviso legal es la que vale
jurídicamente.

> Nota suelta encontrada al revisar esto: `CountdownPage.tsx` usa
> `info@anvilstrength.com` —con **.com**, no .es—, que no coincide con
> ninguna de las anteriores. Esa página está apagada (`isPreLaunch = false`),
> así que hoy no la ve nadie; conviene arreglarla antes de volver a
> encenderla.

Y sube el límite de envío en **Authentication → Rate Limits**, que sigue
puesto en el del servicio integrado.

### Paso 4 — las plantillas

Panel de Supabase → **Authentication → Emails**. Pegar el contenido de cada
fichero en su plantilla:

| Fichero | Plantilla de Supabase | Cuándo se manda |
|---|---|---|
| `supabase/templates/magic-link.html` | Magic Link | **El entrenador manda el acceso a un atleta** |
| `supabase/templates/invite.html` | Invite user | Alta desde el panel de Supabase |
| `supabase/templates/confirm-signup.html` | Confirm signup | Registro con correo y contraseña |
| `supabase/templates/reset-password.html` | Reset password | "He olvidado mi contraseña" |
| `supabase/templates/change-email.html` | Change email address | Cambio de dirección |

Y los asuntos, que también se editan ahí:

| Plantilla | Asunto |
|---|---|
| Magic Link | `Tu acceso a Anvil Strength` |
| Invite user | `Te han invitado a Anvil Strength` |
| Confirm signup | `Confirma tu correo · Anvil Strength` |
| Reset password | `Cambia tu contraseña · Anvil Strength` |
| Change email | `Confirma tu correo nuevo · Anvil Strength` |

**Los asuntos no llevan emojis ni mayúsculas gritadas.** "🔥 ¡ENTRA YA!" es
una de las señales más directas de spam que existe.

### Paso 5 — comprobar que ha funcionado

Antes de dar nada por bueno:

1. **[mail-tester.com](https://www.mail-tester.com)** — te da una dirección,
   le mandas un correo de prueba (por ejemplo pidiendo un "he olvidado mi
   contraseña" a esa dirección) y te puntúa sobre 10. Por debajo de 8 hay
   algo mal, y te dice qué.
2. En Gmail, abrir el correo recibido → **Mostrar original**. Tiene que poner
   `SPF: PASS`, `DKIM: PASS` y `DMARC: PASS`. Si alguno dice `NEUTRAL` o
   `FAIL`, el DNS no está bien.
3. Mandarse el correo a una cuenta de Gmail, otra de Outlook/Hotmail y otra
   de iCloud. Los tres filtran distinto.

## Cómo están hechas las plantillas

No se editan a mano. El armazón vive una sola vez en
`supabase/templates/_base.html` y las cinco salen de:

```bash
node scripts/generar-correos.mjs
```

Cinco ficheros de 120 líneas escritos a mano se separan solos: se cambia el
rojo de marca en uno y en los otros cuatro no. Para cambiar el **aspecto**,
se toca el armazón; para cambiar el **texto** de un correo concreto, su
entrada en el guion.

Decisiones que hay detrás, y el motivo, en la cabecera de `_base.html`:
tablas y estilos en línea (Outlook de escritorio sigue usando el motor de
Word), sin tipografías web (Gmail bloquea `@font-face`), diseño oscuro de
serie (para que el modo oscuro de Gmail no invierta los colores y arruine el
contraste), el enlace repetido en texto debajo del botón, y el logotipo
nunca como única forma de identificar al remitente porque las imágenes se
bloquean por defecto.

## Lo que sigue SIN estar hecho

**Mandar por correo el enlace de invitación con código.** Hoy el entrenador
lo copia y lo manda por su cuenta. Hacer que la aplicación lo envíe necesita
una función de borde nueva que hable con la API del proveedor —Supabase Auth
solo manda sus propios correos de autenticación, no correo arbitrario— y por
tanto necesita antes que exista la cuenta del proveedor del paso 1.

No es un olvido: es que el paso 1 es una decisión tuya (qué proveedor, con
qué cuenta) y montar la función antes de tenerla sería escribir código contra
una API que a lo mejor no acabas usando.

Cuando esté decidido, el trabajo es: una función `supabase/functions/notificar`
con el secreto de la API, un endpoint que reciba `{ tipo, destinatario,
datos }`, y en el cliente un botón "Enviar por correo" junto al de "Copiar
enlace" que degrade a copiar si la función no responde — igual que ya degrada
todo lo demás cuando falta una migración.
