# APK Android — qué hay hecho y qué queda a mano

Esta carpeta (`APP Android/`) es la variante nativa: la misma aplicación web
envuelta en un WebView de Capacitor 8. Este documento es la lista de lo que
**no puede hacer el código solo** y hay que configurar una vez en los paneles
de Supabase, Firebase y Google Play.

```bash
npm run build && npx cap sync android          # web → android/app/src/main/assets
cd android && ./gradlew assembleDebug          # APK de pruebas
cd android && ./gradlew bundleRelease          # AAB para Google Play (necesita firma)
```

---

## 1. Login con Google (obligatorio — sin esto no entra nadie con Google)

Dentro del APK el navegador del sistema no puede "volver" a `https://localhost`,
así que la vuelta usa un esquema propio: `com.anvilstrength.app://auth/callback`.
El `<intent-filter>` del manifiesto lo reconoce y `useNativeFeatures` recoge la
sesión (`appUrlOpen`).

**En Supabase → Authentication → URL Configuration → Redirect URLs, añadir:**

```
com.anvilstrength.app://auth/callback
```

Las de la web (`https://anvilstrength.es/auth/callback`) siguen haciendo
falta: los enlaces de **confirmación de email** y **recuperar contraseña** van a
la web, no a la app — un cliente de correo no abre esquemas propios.

### App Links (opcional, mejora)

El manifiesto declara también `https://anvilstrength.es/auth/callback`,
`/invitacion/*` y `/reclamar/*`. Para que Android abra la app con esos enlaces
sin preguntar, la web tiene que publicar
`https://anvilstrength.es/.well-known/assetlinks.json`:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.anvilstrength.app",
    "sha256_cert_fingerprints": ["<huella SHA-256 del certificado de firma>"]
  }
}]
```

La huella sale de `keytool -list -v -keystore anvil-release.jks`. Sin este
fichero los enlaces siguen funcionando: abren el navegador y desde ahí la web.

---

## 2. Notificaciones push (Firebase Cloud Messaging)

Web Push no existe en el WebView. El APK usa el plugin nativo, que necesita
Firebase. Hasta que se configure, el botón "Activar avisos push" de la campana
**no aparece** (no falla: se esconde) y las notificaciones locales siguen
funcionando.

1. Firebase Console → crear proyecto → añadir app Android con el paquete
   `com.anvilstrength.app`. Descargar `google-services.json` y dejarlo en
   **`android/app/google-services.json`** (está en .gitignore).
2. Firebase → Configuración del proyecto → Cuentas de servicio → *Generar nueva
   clave privada*. Es un JSON. Va como secreto de la función de borde:
   ```bash
   supabase secrets set FCM_SERVICE_ACCOUNT_JSON="$(cat cuenta-servicio.json)"
   supabase functions deploy send-push --no-verify-jwt
   ```
3. Ejecutar `database/PUSH_NATIVO_2026-09-03.sql` en el editor SQL de Supabase
   (crea `device_push_tokens`).
4. En `.env.local` de esta carpeta:
   ```
   VITE_FCM_ENABLED=true
   ```
   y reconstruir (`npm run build && npx cap sync android`).

`PushNotifications.register()` **falla si no está `google-services.json`**, por
eso el paso 4 es un interruptor explícito y no se intenta a ciegas.

Cuando llega un aviso con la app cerrada y la persona lo toca, la app abre en
`data.link` (la misma ruta interna que ya lleva cada notificación).

---

## 3. Firma y Google Play

`assembleRelease` sin firma produce un APK que Android no instala. La firma se
lee de `android/keystore.properties` (**no se versiona**; ver
`android/keystore.properties.example`).

```bash
cd android
keytool -genkey -v -keystore anvil-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias anvil
cp keystore.properties.example keystore.properties   # y rellenar
./gradlew bundleRelease
# → app/build/outputs/bundle/release/app-release.aab
```

**Guarda el `.jks` y las contraseñas en un gestor de contraseñas.** Sin ese
fichero no se puede volver a publicar una actualización con el mismo
identificador de aplicación. Jamás.

Cada subida a Play necesita un `versionCode` mayor que el anterior:

```bash
./gradlew bundleRelease -PversionCode=3 -PversionName=1.3.1
```

(sin parámetros usa los valores por defecto de `app/build.gradle`).

`minifyEnabled true` + `shrinkResources true` están activados en release: el
APK encoge y el código queda ofuscado. Si alguna pantalla falla SOLO en release,
lo primero es `proguard-rules.pro`.

### Ficha de Play (lo que pide el formulario)

- Política de privacidad: `https://anvilstrength.es/legal/privacidad`.
- *Data safety*: se recogen email, nombre, datos de entrenamiento/salud y
  **vídeo** (análisis de barra). Declararlo tal cual; el vídeo de
  levantamientos es lo que más preguntas genera.
- Icono 512×512 y *feature graphic* 1024×500 (los de `public/` no sirven por
  tamaño).

---

## 4. Qué se ha quitado del APK y por qué

| Fuera | Peso | Ahora |
|---|---|---|
| `public/opencv.js` | 10,4 MB | Se descarga de `https://anvilstrength.es/opencv.js` la primera vez que se abre el análisis de vídeo (`src/lib/cv/tracker.ts`). |
| `public/normativa_equipo.pdf` | 13,4 MB | Enlace a la web. |
| `vite-plugin-pwa` (service worker) | 3,8 MB de precaché duplicada | Desactivado (`disable: true`). Los ficheros ya van dentro del APK; el aviso "hay una versión nueva" no tiene sentido cuando se actualiza por Play. La cola de escrituras sin red (`src/lib/offlineQueue.ts`) sigue igual. |
| `@vercel/analytics` | — | Telemetría web en app nativa; quitado. |

El calendario AEP (`/api/aep`) no existe dentro del APK: `aepService` lo pide a
la web con `CapacitorHttp` (petición nativa, sin CORS) y cae al respaldo local
si no responde.

---

## 5. Checklist antes de subir

- [ ] `npm run typecheck` y `npm run lint` limpios
- [ ] `npm run build && npx cap sync android`
- [ ] `./gradlew bundleRelease` con `keystore.properties` en su sitio
- [ ] Redirect URL del esquema propio en Supabase (§1)
- [ ] `versionCode` mayor que el publicado
- [ ] Probado en un móvil real: login con Google, botón atrás, vídeo (descarga de opencv), avisos
