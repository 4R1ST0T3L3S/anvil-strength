import { Monitor, Share, Plus, Download } from 'lucide-react';
import { Fold, Reveal, PressButton } from './landingKit';
import { SmartAuthButton } from '../../../components/ui/SmartAuthButton';
import type { UserProfile } from '../../../hooks/useUser';

/**
 * ENTRAR A LA PLATAFORMA — EL SEGUNDO FOLD DE LA PORTADA.
 * =====================================================================
 *
 * Estaba a media página de scroll, dentro del fold de "qué trae la app",
 * como una rejilla de cuatro descargas iguales. Quien venía a entrar tenía
 * que atravesar la filosofía, las cifras y el "cómo funciona" para
 * encontrar la puerta. Ahora es lo primero después de la portada.
 *
 * POR QUÉ LA VERSIÓN WEB MANDA, Y NO ES SOLO UNA PREFERENCIA DE DISEÑO
 *
 * Desde que anvilstrength.es sirve la aplicación entera y no solo la
 * página promocional (ver el prólogo de src/routes/AppRoutes.tsx), "abrir
 * la versión web" NO es irse a ningún sitio: es entrar aquí mismo. Por eso
 * el botón principal es `SmartAuthButton` —el mismo de la cabecera— y no
 * un enlace: abre el formulario si no hay sesión y lleva al panel que
 * toque si la hay. La sesión se queda en este dominio, que es lo que hacía
 * imposible que "iniciar sesión en la web" sirviera de algo cuando el
 * panel vivía en otro.
 *
 * POR QUÉ NO PONE "iOS"
 *
 * Porque no hay aplicación nativa de iOS, y presentarla como si la hubiera
 * promete una descarga de la App Store que no existe. En iPhone se usa
 * esta misma versión web; lo único propio de ese dispositivo es cómo se
 * ancla a la pantalla de inicio, y eso se explica donde toca —debajo de la
 * versión web— en vez de fingir una cuarta plataforma.
 *
 * Android y Windows siguen estando: son instalables de verdad. Pero van a
 * un lado, en dos fichas pequeñas, porque son el camino largo.
 */

/** APK de Android: nombre del fichero en /public/downloads y lo que pesa. */
const ANDROID = { archivo: 'anvil-strength-1.3.0.apk', version: '1.3.0', peso: '11 MB' };
/** Instalador de Windows, mismo sitio. */
const WINDOWS = { archivo: 'AnvilStrength-Setup-1.0.0.exe', version: '1.0.0', peso: '101 MB' };

export function AccesoAppSection({
    user,
    onLoginClick,
    onSignupClick,
}: {
    user?: UserProfile | null;
    onLoginClick: () => void;
    onSignupClick?: () => void;
}) {
    return (
        <Fold id="app" tone="black" className="border-b border-subtle py-20 md:py-24">
            <Reveal className="max-w-2xl">
                <p className="text-t-xs font-black uppercase tracking-widest text-brand-text">
                    La plataforma
                </p>
                <h2 className="mt-4 text-d-sm font-black uppercase leading-[1.02] text-ink text-balance">
                    Entra a entrenar
                </h2>
                <p className="mt-5 text-t-lg leading-relaxed text-ink-muted">
                    La misma aplicación que usan los entrenadores del club para programar.
                    No hace falta instalar nada.
                </p>
            </Reveal>

            {/* La rejilla: la versión web ocupa dos tercios en escritorio y va
                primera en el orden del DOM, así que en móvil —donde todo se
                apila— también es lo primero. Sin `order-*` que separe lo que se
                ve de lo que se lee. */}
            <div className="mt-12 grid grid-cols-1 gap-4 lg:grid-cols-3 md:gap-5">
                {/* ---------- VERSIÓN WEB ---------- */}
                <Reveal className="lg:col-span-2">
                    <div className="relative h-full overflow-hidden rounded-card border border-brand/40 bg-surface-raised p-7 md:p-9">
                        {/* El degradado es lo único que distingue esta ficha de
                            las otras dos sin cambiarles la forma: mismo lenguaje,
                            distinto peso. */}
                        <div
                            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand/12 to-transparent"
                            aria-hidden="true"
                        />

                        <div className="relative">
                            <div className="flex items-center gap-3">
                                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-brand-ink">
                                    <Monitor className="h-5 w-5" aria-hidden="true" />
                                </span>
                                <div>
                                    <h3 className="text-t-xl font-black uppercase tracking-display text-ink">
                                        Versión web
                                    </h3>
                                    <p className="text-t-xs font-bold uppercase tracking-widest text-brand-text">
                                        Recomendada
                                    </p>
                                </div>
                            </div>

                            <p className="mt-5 max-w-lg text-t-base leading-relaxed text-ink-muted">
                                Funciona en cualquier navegador, en el móvil y en el ordenador.
                                Se abre aquí mismo, con tu cuenta de Anvil Strength, y siempre
                                está en la última versión.
                            </p>

                            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                                {/* Dice "Iniciar sesión" o "Ir a mi panel" según
                                    haya sesión. Ver SmartAuthButton. */}
                                <SmartAuthButton
                                    variant="primary"
                                    onLoginClick={onLoginClick}
                                    className="w-full sm:w-auto"
                                />
                                {!user && onSignupClick && (
                                    <button
                                        type="button"
                                        onClick={onSignupClick}
                                        // `min-h-11` y no solo texto: como enlace suelto medía
                                        // 22px de alto, la mitad del mínimo que se puede acertar
                                        // con el pulgar. En escritorio no cambia nada porque
                                        // sigue sin fondo ni borde; solo ocupa el sitio que
                                        // necesita para ser pulsable.
                                        className="inline-flex min-h-11 items-center justify-center px-2 text-t-sm font-bold uppercase tracking-wide text-ink-muted underline-offset-8 transition-colors duration-fast hover:text-ink hover:underline sm:justify-start"
                                    >
                                        Crear cuenta gratis
                                    </button>
                                )}
                            </div>

                            {/* EL CASO DEL iPHONE, DONDE ANTES PONÍA "iOS".
                                No es una plataforma aparte: es esta misma
                                pantalla anclada al escritorio del teléfono. Se
                                explica con los dos iconos que salen en el
                                propio Safari para que se reconozcan. */}
                            <div className="mt-8 flex items-start gap-3 rounded-field border border-subtle bg-surface-sunken/60 p-4">
                                <span className="mt-0.5 flex shrink-0 items-center gap-1 text-ink-subtle" aria-hidden="true">
                                    <Share className="h-4 w-4" />
                                    <Plus className="h-3.5 w-3.5" />
                                </span>
                                <p className="text-t-xs leading-relaxed text-ink-muted">
                                    <span className="font-bold text-ink">¿iPhone o iPad?</span>{' '}
                                    Esta es tu versión. Para tenerla como una app más, abre el
                                    menú <span className="font-semibold text-ink">Compartir</span> de
                                    Safari y elige{' '}
                                    <span className="font-semibold text-ink">Añadir a pantalla de inicio</span>.
                                </p>
                            </div>
                        </div>
                    </div>
                </Reveal>

                {/* ---------- INSTALABLES ---------- */}
                <Reveal delay={0.1}>
                    <div className="flex h-full flex-col gap-4">
                        <FichaDeDescarga
                            nombre="Android"
                            detalle={`APK v${ANDROID.version} · ${ANDROID.peso}`}
                            archivo={ANDROID.archivo}
                            icono={
                                <svg viewBox="-2 -2 28 28" fill="currentColor" className="h-5 w-5 text-[#3DDC84]" aria-hidden="true">
                                    <path d="M6 18c0 .55.45 1 1 1h1v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h2v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h1c.55 0 1-.45 1-1V8H6v10zM3.5 8C2.67 8 2 8.67 2 9.5v5C2 15.33 2.67 16 3.5 16S5 15.33 5 14.5v-5C5 8.67 4.33 8 3.5 8zm17 0c-.83 0-1.5.67-1.5 1.5v5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5v-5c0-.83-.67-1.5-1.5-1.5zM15.53 2.16l1.3-1.3c.2-.2.2-.51 0-.71-.2-.2-.51-.2-.71 0-.2.2-.2.51 0 .71l1.31 1.31C6.97 3.26 6 5.01 6 7h12c0-1.99-.97-3.75-2.47-4.84zM10 5H9V4h1v1zm5 0h-1V4h1v1z" />
                                </svg>
                            }
                        />
                        <FichaDeDescarga
                            nombre="Windows"
                            detalle={`Instalador v${WINDOWS.version} · ${WINDOWS.peso}`}
                            archivo={WINDOWS.archivo}
                            icono={
                                <svg viewBox="-3 -3 30 30" fill="currentColor" className="h-5 w-5 text-[#0078D4]" aria-hidden="true">
                                    <path d="M11 11H0V0h11v11zm13 0H12V0h11v11zM11 24H0V13h11v11zm13 0H12V13h11v11z" />
                                </svg>
                            }
                        />

                        <p className="mt-auto pt-2 text-t-2xs leading-relaxed text-ink-subtle">
                            Las versiones instalables son la misma aplicación empaquetada.
                            Útiles si entrenas sin cobertura en el gimnasio; para todo lo
                            demás, la versión web va igual.
                        </p>
                    </div>
                </Reveal>
            </div>
        </Fold>
    );
}

/**
 * Ficha de una descarga.
 *
 * `download` con el nombre del fichero, y no un `target="_blank"`: el
 * `vercel.json` ya manda `Content-Disposition: attachment` para .apk y
 * .exe, pero el atributo hace que el navegador conserve el nombre bueno si
 * algún día se sirve desde otro sitio.
 */
function FichaDeDescarga({
    nombre,
    detalle,
    archivo,
    icono,
}: {
    nombre: string;
    detalle: string;
    archivo: string;
    icono: React.ReactNode;
}) {
    return (
        <a
            href={`/downloads/${archivo}`}
            download={archivo}
            className="group flex items-center gap-4 rounded-card border border-subtle bg-surface-raised px-5 py-4 transition-colors duration-fast ease-snap hover:border-brand/50"
        >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-sunken">
                {icono}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-t-sm font-black uppercase tracking-widest text-ink">
                    {nombre}
                </span>
                <span className="mt-0.5 block truncate text-t-xs text-ink-muted">{detalle}</span>
            </span>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-brand-ink transition-transform duration-fast ease-snap group-hover:scale-110">
                <Download className="h-4 w-4" aria-hidden="true" />
            </span>
        </a>
    );
}

/**
 * El enlace que sustituye a la rejilla de descargas dentro del fold
 * "software". Vive aquí para que el texto y el destino no se separen.
 */
export function VolverAlAcceso({ onIrAlAcceso }: { onIrAlAcceso: () => void }) {
    return (
        <Reveal delay={0.2} className="mt-20 border-t border-subtle pt-12">
            <div className="flex flex-col items-start gap-5 md:flex-row md:items-center md:justify-between">
                <div>
                    <h3 className="text-t-xl font-black uppercase tracking-display text-ink">
                        Todo esto, ahora
                    </h3>
                    <p className="mt-2 text-t-base text-ink-muted">
                        Versión web, Android o Windows — arriba del todo.
                    </p>
                </div>
                <PressButton onClick={onIrAlAcceso} size="md" className="w-full md:w-auto">
                    Entrar a la app
                </PressButton>
            </div>
        </Reveal>
    );
}
