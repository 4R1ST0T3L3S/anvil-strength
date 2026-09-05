/**
 * Puente entre el proceso principal y la página. De momento solo deja una
 * marca para que la web sepa que corre dentro de la app de escritorio
 * (`window.anvilDesktop`), por si alguna pantalla necesita distinguirlo.
 * Cualquier API nativa futura (notificaciones, ficheros) se expone aquí y
 * solo aquí, con `contextBridge`.
 */
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('anvilDesktop', {
    plataforma: 'windows',
    version: process.versions.electron,
});
