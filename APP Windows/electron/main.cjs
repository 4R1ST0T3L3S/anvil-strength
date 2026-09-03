/**
 * ANVIL STRENGTH — PROCESO PRINCIPAL DE ELECTRON
 * =====================================================================
 *
 * La aplicación de escritorio es la misma web (`dist/`) dentro de una
 * ventana. Este fichero solo hace tres cosas:
 *
 *   1. Servir `dist/` bajo el esquema `app://anvil/` con RESPALDO A
 *      `index.html` para cualquier ruta. React Router usa rutas reales
 *      (`/dashboard`, `/coach-dashboard/atletas/…`), y cargar la app desde
 *      `file://` las rompería: no hay servidor que devuelva `index.html` para
 *      una ruta que no es un fichero. El esquema propio hace de ese servidor.
 *
 *   2. Abrir la ventana con el tamaño mínimo para el que se ha diseñado la
 *      interfaz (1280 de ancho) y el fondo del tema, para que no haya un
 *      fogonazo blanco antes de que cargue el CSS.
 *
 *   3. Mandar al navegador del sistema cualquier enlace externo (los
 *      términos legales con `target="_blank"`, enlaces a webs). Una app de
 *      escritorio no debe abrir pestañas dentro de sí misma.
 *
 * `.cjs` y no `.js`: el `package.json` declara `"type": "module"` para Vite,
 * y Electron carga el proceso principal con `require`.
 */
const { app, BrowserWindow, protocol, shell, net, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const DIST = path.join(__dirname, '..', 'dist');
const ORIGEN = 'app://anvil';

/**
 * En desarrollo se puede apuntar al servidor de Vite con
 * `ANVIL_DEV_URL=http://localhost:5173 npx electron .` y tener recarga en
 * caliente. Sin la variable, se sirve `dist/` (hay que haber hecho `vite build`).
 */
const DEV_URL = process.env.ANVIL_DEV_URL;

// Tiene que ir ANTES de `app.whenReady()`. `standard` hace que las URL
// relativas y absolutas (`/assets/...`) se resuelvan como en http; `secure`
// da contexto seguro (crypto, service worker); `supportFetchAPI` permite
// `fetch()` contra el propio esquema (lo usa el worker de OpenCV).
protocol.registerSchemesAsPrivileged([
    {
        scheme: 'app',
        privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true,
            corsEnabled: true,
            stream: true,
            allowServiceWorkers: true,
        },
    },
]);

function servirDist() {
    protocol.handle('app', (request) => {
        const url = new URL(request.url);
        const ruta = decodeURIComponent(url.pathname);
        let fichero = path.normalize(path.join(DIST, ruta));

        // Nunca fuera de `dist/`.
        if (!fichero.startsWith(DIST)) {
            return new Response('Forbidden', { status: 403 });
        }

        // Respaldo de SPA: lo que no es un fichero real es una ruta de React
        // Router y se sirve `index.html`.
        let existe = false;
        try { existe = fs.statSync(fichero).isFile(); } catch { existe = false; }
        if (!existe) fichero = path.join(DIST, 'index.html');

        return net.fetch(pathToFileURL(fichero).toString());
    });
}

function crearVentana() {
    const ventana = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1280,
        minHeight: 720,
        show: false,
        autoHideMenuBar: true,
        // `--surface-sunken` de tokens.css: el mismo negro que el primer pintado.
        backgroundColor: '#0a0a0a',
        title: 'Anvil Strength',
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
        },
    });

    // Sin barra de menú: la app no tiene nada que ofrecer ahí y con
    // `autoHideMenuBar` seguiría apareciendo al pulsar Alt.
    Menu.setApplicationMenu(null);

    // Enlaces externos → navegador del sistema. Dentro de la app, nada.
    ventana.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//.test(url)) shell.openExternal(url);
        return { action: 'deny' };
    });

    // Una navegación a otro origen (por ejemplo, el OAuth de Google) también
    // sale fuera en vez de reemplazar la app.
    ventana.webContents.on('will-navigate', (event, url) => {
        const propio = url.startsWith(ORIGEN + '/') || (DEV_URL && url.startsWith(DEV_URL));
        if (!propio) {
            event.preventDefault();
            shell.openExternal(url);
        }
    });

    ventana.once('ready-to-show', () => ventana.show());

    // Prueba automática: con `ANVIL_CAPTURA=ruta.png` la app arranca, espera
    // a que pinte, guarda una captura de la ventana y se cierra. Sirve para
    // comprobar el empaquetado sin tener a nadie delante de la pantalla.
    const captura = process.env.ANVIL_CAPTURA;
    if (captura) {
        ventana.webContents.once('did-finish-load', () => {
            setTimeout(async () => {
                try {
                    const imagen = await ventana.webContents.capturePage();
                    fs.writeFileSync(captura, imagen.toPNG());
                    console.log(`captura guardada en ${captura}`);
                } catch (error) {
                    console.error('no se pudo capturar la ventana:', error);
                } finally {
                    app.quit();
                }
            }, 6000);
        });
    }

    if (DEV_URL) {
        ventana.loadURL(DEV_URL);
    } else {
        ventana.loadURL(`${ORIGEN}/`);
    }

    return ventana;
}

app.whenReady().then(() => {
    if (!DEV_URL) servirDist();
    crearVentana();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) crearVentana();
    });
});

app.on('window-all-closed', () => {
    app.quit();
});
