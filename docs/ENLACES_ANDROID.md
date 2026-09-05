# `.well-known/assetlinks.json` — por qué existe este fichero

## Qué hace

El `AndroidManifest.xml` de la app declara que sabe abrir estas direcciones:

    https://anvilstrength.es/reclamar/...
    https://anvilstrength.es/invitacion/...
    https://anvilstrength.es/auth/callback

y lo declara con `android:autoVerify="true"`. Eso es una PETICIÓN, no un
permiso: Android no se fía de la palabra de una app. Al instalarla, el sistema
descarga `https://anvilstrength.es/.well-known/assetlinks.json` y solo le
concede el enlace si este fichero nombra su paquete y su huella de firma.

Sin este fichero la verificación falla en silencio y el resultado es el que se
veía: el enlace de invitación abre el navegador en vez de la aplicación
instalada. Funciona —la web sirve las mismas pantallas— pero el atleta que ya
tiene la app se queda fuera de ella.

## La huella que hay aquí

La de `appdebug.apk` (`CN=Android Debug`), que es lo que se está repartiendo
hoy. **Es una firma de depuración y cambia de máquina en máquina.**

Cuando se genere una compilación de verdad (firmada con un almacén propio, o
subida a Google Play con App Signing) hay que AÑADIR su huella al array
`sha256_cert_fingerprints` — añadir, no sustituir, mientras convivan las dos.

Para sacarla:

    keytool -list -v -keystore <almacen.jks> -alias <alias>

Con Google Play App Signing, la buena es la que aparece en
*Play Console → Configuración → Integridad de la app → Certificado de firma
de la app*, no la de subida.

## Comprobar que ha quedado bien

    curl https://anvilstrength.es/.well-known/assetlinks.json

Tiene que responder 200 y `Content-Type: application/json`. Y en un móvil con
la app instalada:

    adb shell pm verify-app-links --re-verify com.anvilstrength.app
    adb shell pm get-app-links com.anvilstrength.app

El dominio debe salir como `verified`.
