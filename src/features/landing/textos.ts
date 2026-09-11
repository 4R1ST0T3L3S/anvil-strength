import { useIdioma } from '../../hooks/useIdioma';
import type { Idioma } from '../../lib/i18n';
import type { Coach } from '../../data/coaches';
import type { Nutritionist } from '../../data/nutritionists';
import type { Achievement } from '../../data/achievements';

/**
 * LOS TEXTOS DE LA WEB PÚBLICA, EN ESPAÑOL Y EN INGLÉS
 * =====================================================================
 *
 * POR QUÉ EL SELECTOR DE IDIOMA NO CAMBIABA LA PORTADA
 *
 * El botón «ES / EN» de la cabecera guardaba el idioma y recargaba, pero la
 * portada no leía el idioma en ningún sitio: todas sus frases estaban
 * escritas a mano en español dentro de los componentes. Los únicos textos que
 * cambiaban eran los pocos que ya pasaban por `t()` —y esos vivían casi todos
 * en el PANEL (saludo, accesos del inicio…)—. Resultado: la portada seguía en
 * español y el panel se quedaba a medias entre los dos idiomas.
 *
 * Ahora la portada entera sale de aquí, y el panel se queda siempre en
 * español (ver `IdiomaFijo` en hooks/useIdioma.ts y AppRoutes).
 *
 *
 * POR QUÉ NO VA EN lib/i18n/es.ts
 *
 * Aquel diccionario es plano (`zona.pieza` → cadena) y es lo correcto para la
 * voz de la aplicación: botones, estados, errores. Esto es otra cosa —copia
 * de marketing con listas (preguntas frecuentes, pasos, funciones)—, y
 * aplanarla en doscientas claves sueltas la haría imposible de leer como
 * texto. Aquí se conserva la forma de cada sección.
 *
 * El contrato es el mismo: `textos(es, en)` exige que el inglés tenga
 * EXACTAMENTE la misma forma que el español. Falta una frase o sobra una
 * sección, y no compila.
 *
 *
 * LO QUE NO SE TRADUCE
 *
 * Nombres propios (atletas, entrenadores, competiciones, federaciones) y las
 * categorías de peso («-83kg JNR»): son iguales en los dos idiomas. Las
 * páginas legales tampoco: un aviso legal traducido sin revisión jurídica
 * compromete más de lo que ayuda.
 */

/** La misma forma que `T`, con cualquier texto en cada hoja. */
type Traducido<T> = T extends string
    ? string
    : T extends readonly (infer U)[]
        ? readonly Traducido<U>[]
        : { readonly [K in keyof T]: Traducido<T[K]> };

function textos<T>(es: T, en: Traducido<T>): Record<Idioma, Traducido<T>> {
    return { es: es as unknown as Traducido<T>, en };
}

/** Rellena `{hueco}` en una frase. Un hueco sin valor se queda a la vista, a propósito. */
export function rellenar(frase: string, valores: Record<string, string | number>): string {
    return frase.replace(/\{(\w+)\}/g, (entero, nombre: string) =>
        nombre in valores ? String(valores[nombre]) : entero
    );
}

const WEB = textos(
    {
        seo: {
            titulo: 'Anvil Strength | Club de Powerlifting Online en España — Gratis',
            descripcion: 'Anvil Strength es el club de powerlifting digital de España. Gratis, sin sede física, afiliado AEP e IPF. Entrenadores de élite, app exclusiva y comunidad real. ¿Empezamos?',
        },
        cabecera: {
            nav: {
                app: 'LA APP',
                filosofia: 'FILOSOFÍA',
                software: 'SOFTWARE',
                equipo: 'EQUIPO',
                atletas: 'ATLETAS',
                competiciones: 'COMPETICIONES',
                logros: 'LOGROS',
                opiniones: 'OPINIONES',
                afiliate: 'AFÍLIATE',
                contacto: 'CONTACTO',
            },
            mas: 'MÁS',
            crearCuenta: 'Crear cuenta',
            irAlInicio: 'Anvil Strength — ir al inicio',
            secciones: 'Secciones del sitio',
            abrirMenu: 'Abrir el menú',
            cerrarMenu: 'Cerrar el menú',
            menu: 'Menú de navegación',
            idioma: 'Idioma',
            tema: 'Tema',
        },
        auth: {
            cargando: 'Cargando...',
            iniciarSesion: 'Iniciar sesión',
            panelAdmin: 'Panel admin',
            miPerfil: 'Mi perfil',
            irAMiPanel: 'Ir a mi panel',
        },
        portada: {
            fotoAlt: 'Atleta de Anvil Strength en plena sentadilla durante una competición',
            lema: 'Where champions are forged',
            crearCuenta: 'Crear cuenta gratis',
            yaTengoCuenta: 'Ya tengo cuenta',
        },
        acceso: {
            antetitulo: 'La plataforma',
            titulo: 'Entra a entrenar',
            intro: 'La misma aplicación que usan los entrenadores del club para programar. No hace falta instalar nada.',
            web: 'Versión web',
            recomendada: 'Recomendada',
            webTexto: 'Funciona en cualquier navegador, en el móvil y en el ordenador. Se abre aquí mismo, con tu cuenta de Anvil Strength, y siempre está en la última versión.',
            crearCuenta: 'Crear cuenta gratis',
            iphoneTitulo: '¿iPhone o iPad?',
            iphoneAntes: 'Esta es tu versión. Para tenerla como una app más, abre el menú',
            iphoneCompartir: 'Compartir',
            iphoneEntre: 'de Safari y elige',
            iphoneAnadir: 'Añadir a pantalla de inicio',
            apk: 'APK v{version} · {peso}',
            instalador: 'Instalador v{version} · {peso}',
            instalablesNota: 'Las versiones instalables son la misma aplicación empaquetada. Útiles si entrenas sin cobertura en el gimnasio; para todo lo demás, la versión web va igual.',
            volverTitulo: 'Todo esto, ahora',
            volverTexto: 'Versión web, Android o Windows — arriba del todo.',
            volverBoton: 'Entrar a la app',
        },
        filosofia: {
            titulo1: 'Un club sin',
            titulo2: 'puerta de entrada',
            intro: 'Anvil Strength nació de una idea sencilla: el powerlifting no debería ser un deporte cerrado. Si quieres competir, ya tienes sitio. No hace falta que muevas ningún número concreto ni que vengas de ningún lado.',
            puntos: [
                { t: 'No tiene sede, y es a propósito', d: 'Entrenas en tu gimnasio, estés donde estés, y compites bajo el nombre del club. Nadie se muda por entrenar.' },
                { t: 'Cuesta cero euros', d: 'Unirse no tiene coste. Solo pagas las tasas oficiales de federación y las inscripciones a cada competición, que van íntegras a la AEP.' },
                { t: 'Federados en AEP e IPF', d: 'Compites en campeonatos oficiales, con marcas homologadas y ranking que cuenta.' },
                { t: 'Entrenador y nutricionista', d: 'Asignados de verdad, con la programación dentro de la app y contacto directo por chat.' },
            ],
            fotoAlt: 'Un atleta del club bloquea un peso muerto ante los tres jueces',
            pie: 'En un deporte con normas de competición, entrena con normas de competición. Tú pones el esfuerzo; nosotros, la estructura.',
        },
        cifras: {
            atletas: 'Atletas activos',
            podios: 'Podios',
            nacionales: 'Nacionales',
            cuota: 'Cuota mensual',
        },
        pasos: {
            titulo: 'Cómo se entra',
            intro: 'Tres pasos. Sin letra pequeña y sin nivel mínimo.',
            lista: [
                { t: 'Te creas la cuenta', d: 'Apodo, email y contraseña. Nada más. Ya puedes entrar y ver la aplicación por dentro.' },
                { t: 'Te asignamos entrenador', d: 'Rellenas la ficha de inscripción y revisamos tu caso. Te asignamos entrenador y, si lo necesitas, nutricionista: el entrenamiento personalizado es un servicio de pago que acuerdas directamente con él.' },
                { t: 'Compites con Anvil', d: 'Tu bloque de entrenamiento, el calendario de competiciones y la tramitación con la AEP, desde el primer día.' },
            ],
            boton: 'Empezar — es gratis',
            nota: 'Sin cuota · Sin compromiso · Sin nivel mínimo',
        },
        software: {
            etiqueta: 'Anvil APP',
            titulo: 'Y una aplicación que hace el trabajo aburrido',
            intro: 'La misma que usan los entrenadores del club para programar. Incluida.',
            funciones: [
                { t: 'Programación semanal', d: 'Tu entrenador publica la semana y la ves con sus series, kilos y RPE. Registras desde el móvil entre series.' },
                { t: 'Vídeo y VBT', d: 'Subes la serie, tu entrenador la corrige. Si usas encoder, el archivo se asocia a la serie que toca.' },
                { t: 'Estadísticas reales', d: 'Tonelaje, intensidad y progresión por ejercicio. Sin hojas de cálculo.' },
                { t: 'Chat directo', d: 'Con tu entrenador y tu nutricionista. Sin buscar el mensaje entre cien de un grupo.' },
                { t: 'Calendario', d: 'Competiciones, inscripciones y la planificación del año de un vistazo.' },
                { t: 'Comunidad', d: 'Ranking del club, logros y la Arena. Entrenas solo, pero no estás solo.' },
            ],
        },
        equipo: {
            titulo: 'Quién te entrena',
            intro: 'Personas concretas, con nombre y con historial. Pulsa para ver el suyo.',
            nota: 'El club no cobra cuota. El entrenamiento personalizado con cualquiera de ellos es un servicio de pago que se acuerda directamente con el entrenador.',
            entrenador: 'Entrenador',
            nutricion: 'Nutrición',
            fotoAlt: '{nombre}, {rol} de Anvil Strength',
            instagramDe: 'Instagram de {nombre}',
            formularioDe: 'Formulario de contacto de {nombre}',
        },
        banda: {
            texto: '¿Te has visto ahí?',
            remate: 'Se entra gratis y se sale cuando quieras.',
            ficha: 'Ficha de inscripción',
        },
        atletas: {
            titulo: 'Nuestros atletas',
            verEquipo: 'Ver equipo',
            anteriores: 'Atletas anteriores',
            siguientes: 'Atletas siguientes',
            fotoAlt: '{nombre}, categoría {categoria}',
        },
        logros: {
            titulo1: 'Lo que ha ganado',
            titulo2: 'el club',
            historial: 'Historial completo',
            historialTitulo: 'Historial del club',
            resultados: '{n} resultados en competición oficial.',
            fotoAnterior: 'Foto anterior',
            fotoSiguiente: 'Foto siguiente',
            verFoto: 'Ver foto {i} de {n}',
        },
        afiliacion: {
            antetitulo: 'Gratis · Sin cuota · Sin compromiso',
            titulo: '¿Te vienes?',
            texto: 'Créate la cuenta y entra a ver la app. Si luego quieres competir con nosotros, rellenas la ficha de inscripción y listo.',
            nota: 'El club es gratis. El entrenamiento con tu entrenador se paga aparte, directamente con él.',
            ficha: 'Ficha de inscripción',
            normativa: 'Normativa del equipo',
        },
        faq: {
            titulo: 'Preguntas frecuentes',
            intro: 'Las dudas que salen siempre cuando alguien se acerca al powerlifting por primera vez.',
            preguntas: [
                { q: '¿Necesito un nivel mínimo para unirme?', a: 'No. En Anvil Strength llevamos atletas desde su primera competición hasta el nivel nacional. Lo único que pedimos es ganas de competir y compromiso con el proceso.' },
                { q: '¿Cuánto cuesta unirse al club?', a: 'Unirse al club es completamente gratuito: no hay cuota. Los costes que sí tendrás son las tasas oficiales de la AEP para federarte (una vez al año) y las inscripciones a competiciones, que van por tu cuenta. Aparte de eso, el entrenamiento personalizado con tu entrenador es un servicio de pago que acuerdas directamente con él — el club no cobra ninguna comisión sobre eso.' },
                { q: '¿Necesito entrenar en un gimnasio específico?', a: 'No. Somos un club 100% digital. Puedes estar en cualquier punto de España y entrenar en el gimnasio que prefieras. Tu entrenador trabaja contigo de forma remota con la misma calidad que si estuviera a tu lado.' },
                { q: '¿Qué son la AEP y la IPF?', a: 'La AEP (Asociación Española de Powerlifting) es la federación nacional que organiza los campeonatos en España. La IPF (International Powerlifting Federation) es la federación mundial. Anvil Strength está afiliado a ambas, lo que te permite competir en todos sus campeonatos oficiales.' },
                { q: '¿Cómo me federo para poder competir?', a: 'Una vez que formes parte del equipo, te guiamos en todo el proceso de federación con la AEP. Es más sencillo de lo que parece y el proceso se hace una vez al año. Tu entrenador te acompaña en cada paso.' },
                { q: '¿Qué incluye el acceso a la app del club?', a: 'La app incluye tu bloque de entrenamiento personalizado, chat directo con tu entrenador y nutricionista, seguimiento de tus marcas personales, calendario de competiciones del equipo, análisis de velocidad de barra (VBT), y acceso a la comunidad de atletas.' },
            ],
            falta: '¿Te falta alguna?',
            escribenos: 'Escríbenos',
        },
        contacto: {
            titulo: 'Hablamos',
        },
        mascota: {
            abrir: 'Abrir el chat de Anvil Strength',
            burbuja: '¿Hablamos?',
        },
        pie: {
            lema: 'Club de powerlifting digital de España. Afiliado AEP e IPF. Gratuito, para toda España.',
            instagram: 'Instagram de Anvil Strength',
            email: 'Email de Anvil Strength',
            whatsapp: 'WhatsApp de Anvil Strength',
            navegacion: 'Navegación',
            enlaces: {
                filosofia: 'Filosofía',
                staff: 'Staff técnico',
                atletas: 'Nuestros atletas',
                logros: 'Logros del club',
                competiciones: 'Competiciones',
                unete: 'Únete al equipo',
            },
            federaciones: 'Federaciones',
            legal: 'Legal',
            avisoLegal: 'Aviso legal',
            privacidad: 'Política de privacidad',
            cookies: 'Política de cookies',
            terminos: 'Términos y condiciones',
            normativa: 'Normativa del equipo',
            derechos: '© 2026 Anvil Strength Powerlifting Club. Todos los derechos reservados.',
            grupo: 'Grupo de Recreación Deportiva · Afiliado AEP + IPF',
        },
        cookies: {
            region: 'Aviso de cookies',
            texto: 'Usamos solo las cookies técnicas necesarias para que la sesión funcione — ninguna de seguimiento ni publicidad.',
            mas: 'Más información',
            entendido: 'Entendido',
        },
        resenas: {
            titulo1: 'Opiniones de',
            titulo2: 'nuestros atletas',
            intro: 'Descubre lo que nuestros atletas piensan sobre su experiencia con Anvil Strength',
            resena: 'reseña',
            resenas: 'reseñas',
            error: 'Error al cargar las reseñas',
            quieresOpinar: '¿Quieres dejar tu opinión?',
            inicia: 'Inicia sesión o regístrate para compartir tu experiencia con la comunidad',
            iniciarSesion: 'Iniciar sesión',
            cargando: 'Cargando reseñas...',
            reintentar: 'Reintentar',
            vacio: 'Aún no hay reseñas.',
            primero: '¡Sé el primero en compartir tu experiencia!',
        },
        formulario: {
            titulo1: 'Comparte tu',
            titulo2: 'experiencia',
            calificacion: 'Tu calificación',
            niveles: ['Necesita mejorar', 'Regular', 'Bueno', 'Muy bueno', '¡Excelente!'],
            opinion: 'Tu opinión',
            placeholder: 'Cuéntanos sobre tu experiencia con Anvil Strength. ¿Qué te ha parecido el entrenamiento? ¿Los resultados? ¿El equipo?',
            caracteres: '{n}/1000 caracteres',
            minimo: '(mínimo 10)',
            exito: '¡Reseña publicada con éxito! Gracias por compartir tu experiencia.',
            publicando: 'Publicando...',
            publicar: 'Publicar reseña',
            errorPublicar: 'Error al publicar la reseña',
        },
        modales: {
            cerrar: 'Cerrar',
            equipoTitulo: 'Nuestro equipo',
            mejoresMarcas: 'Mejores marcas',
            ultimaCompeticion: 'Última competición',
            presentacion: 'Presentación',
            contactoDirecto: 'Contacto directo',
            formulario: 'Formulario',
        },
    },
    {
        seo: {
            titulo: 'Anvil Strength | Online Powerlifting Club in Spain — Free',
            descripcion: 'Anvil Strength is Spain’s digital powerlifting club. Free, no physical gym, affiliated with the AEP and IPF. Elite coaches, our own app and a real community. Shall we start?',
        },
        cabecera: {
            nav: {
                app: 'THE APP',
                filosofia: 'PHILOSOPHY',
                software: 'SOFTWARE',
                equipo: 'TEAM',
                atletas: 'ATHLETES',
                competiciones: 'COMPETITIONS',
                logros: 'ACHIEVEMENTS',
                opiniones: 'REVIEWS',
                afiliate: 'JOIN US',
                contacto: 'CONTACT',
            },
            mas: 'MORE',
            crearCuenta: 'Sign up',
            irAlInicio: 'Anvil Strength — go to the home page',
            secciones: 'Site sections',
            abrirMenu: 'Open the menu',
            cerrarMenu: 'Close the menu',
            menu: 'Navigation menu',
            idioma: 'Language',
            tema: 'Theme',
        },
        auth: {
            cargando: 'Loading...',
            iniciarSesion: 'Log in',
            panelAdmin: 'Admin panel',
            miPerfil: 'My profile',
            irAMiPanel: 'Go to my dashboard',
        },
        portada: {
            fotoAlt: 'Anvil Strength athlete mid-squat at a competition',
            lema: 'Where champions are forged',
            crearCuenta: 'Create a free account',
            yaTengoCuenta: 'I already have an account',
        },
        acceso: {
            antetitulo: 'The platform',
            titulo: 'Come in and train',
            intro: 'The same app the club’s coaches use to write your programme. Nothing to install.',
            web: 'Web version',
            recomendada: 'Recommended',
            webTexto: 'Works in any browser, on your phone and on your computer. It opens right here, with your Anvil Strength account, and it’s always the latest version.',
            crearCuenta: 'Create a free account',
            iphoneTitulo: 'iPhone or iPad?',
            iphoneAntes: 'This is your version. To keep it like any other app, open Safari’s',
            iphoneCompartir: 'Share',
            iphoneEntre: 'menu and choose',
            iphoneAnadir: 'Add to Home Screen',
            apk: 'APK v{version} · {peso}',
            instalador: 'Installer v{version} · {peso}',
            instalablesNota: 'The installable versions are the same app, packaged. Handy if you train with no signal at the gym; for everything else, the web version works just the same.',
            volverTitulo: 'All of this, right now',
            volverTexto: 'Web, Android or Windows — at the top of the page.',
            volverBoton: 'Open the app',
        },
        filosofia: {
            titulo1: 'A club with',
            titulo2: 'no entry bar',
            intro: 'Anvil Strength was born from a simple idea: powerlifting shouldn’t be a closed sport. If you want to compete, there’s already a place for you. You don’t need to lift any particular number or come from anywhere in particular.',
            puntos: [
                { t: 'No gym of its own, on purpose', d: 'You train at your own gym, wherever you are, and compete under the club’s name. Nobody has to move to train.' },
                { t: 'It costs zero euros', d: 'Joining is free. You only pay the official federation fees and the entry fee for each competition, which go straight to the AEP.' },
                { t: 'Registered with the AEP and IPF', d: 'You compete in official championships, with ratified lifts and a ranking that counts.' },
                { t: 'A coach and a nutritionist', d: 'Genuinely assigned to you, with your programme inside the app and direct contact by chat.' },
            ],
            fotoAlt: 'A club athlete locks out a deadlift in front of the three referees',
            pie: 'In a sport with competition rules, train by competition rules. You bring the effort; we bring the structure.',
        },
        cifras: {
            atletas: 'Active athletes',
            podios: 'Podiums',
            nacionales: 'National titles',
            cuota: 'Monthly fee',
        },
        pasos: {
            titulo: 'How to join',
            intro: 'Three steps. No small print and no minimum level.',
            lista: [
                { t: 'Create your account', d: 'Nickname, email and password. That’s it. You can already log in and look around the app.' },
                { t: 'We assign you a coach', d: 'You fill in the registration form and we review your case. We assign you a coach and, if you need one, a nutritionist: personalised coaching is a paid service you agree directly with them.' },
                { t: 'You compete with Anvil', d: 'Your training block, the competition calendar and your AEP paperwork, from day one.' },
            ],
            boton: 'Get started — it’s free',
            nota: 'No fee · No commitment · No minimum level',
        },
        software: {
            etiqueta: 'Anvil APP',
            titulo: 'And an app that does the boring work',
            intro: 'The same one the club’s coaches use to programme. Included.',
            funciones: [
                { t: 'Weekly programming', d: 'Your coach publishes the week and you see it with its sets, weights and RPE. You log from your phone between sets.' },
                { t: 'Video and VBT', d: 'Upload the set and your coach reviews it. If you use an encoder, the file is linked to the right set.' },
                { t: 'Real statistics', d: 'Tonnage, intensity and progression per exercise. No spreadsheets.' },
                { t: 'Direct chat', d: 'With your coach and your nutritionist. No digging for a message among a hundred in a group.' },
                { t: 'Calendar', d: 'Competitions, entries and the whole year’s plan at a glance.' },
                { t: 'Community', d: 'The club ranking, achievements and the Arena. You train alone, but you’re not alone.' },
            ],
        },
        equipo: {
            titulo: 'Who coaches you',
            intro: 'Real people, with names and track records. Tap to see theirs.',
            nota: 'The club charges no fee. Personalised coaching with any of them is a paid service agreed directly with the coach.',
            entrenador: 'Coach',
            nutricion: 'Nutrition',
            fotoAlt: '{nombre}, {rol} at Anvil Strength',
            instagramDe: '{nombre} on Instagram',
            formularioDe: 'Contact form for {nombre}',
        },
        banda: {
            texto: 'Can you see yourself there?',
            remate: 'Joining is free and you can leave whenever you like.',
            ficha: 'Registration form',
        },
        atletas: {
            titulo: 'Our athletes',
            verEquipo: 'See the team',
            anteriores: 'Previous athletes',
            siguientes: 'Next athletes',
            fotoAlt: '{nombre}, {categoria} category',
        },
        logros: {
            titulo1: 'What the club',
            titulo2: 'has won',
            historial: 'Full record',
            historialTitulo: 'Club record',
            resultados: '{n} results in official competition.',
            fotoAnterior: 'Previous photo',
            fotoSiguiente: 'Next photo',
            verFoto: 'See photo {i} of {n}',
        },
        afiliacion: {
            antetitulo: 'Free · No fee · No commitment',
            titulo: 'Are you in?',
            texto: 'Create your account and have a look around the app. If you then want to compete with us, fill in the registration form and you’re done.',
            nota: 'The club is free. Training with your coach is paid separately, directly to them.',
            ficha: 'Registration form',
            normativa: 'Team rules',
        },
        faq: {
            titulo: 'Frequently asked questions',
            intro: 'The questions that always come up when someone gets into powerlifting for the first time.',
            preguntas: [
                { q: 'Do I need a minimum level to join?', a: 'No. At Anvil Strength we coach athletes from their very first competition up to national level. All we ask for is the drive to compete and commitment to the process.' },
                { q: 'How much does it cost to join the club?', a: 'Joining the club is completely free: there is no fee. The costs you will have are the official AEP fees to register (once a year) and competition entries, which you pay yourself. Apart from that, personalised coaching with your coach is a paid service you agree directly with them — the club takes no commission on it.' },
                { q: 'Do I have to train at a specific gym?', a: 'No. We are a 100% digital club. You can be anywhere in Spain and train at whichever gym you like. Your coach works with you remotely, with the same quality as if they were standing next to you.' },
                { q: 'What are the AEP and the IPF?', a: 'The AEP (Asociación Española de Powerlifting) is the national federation that runs the championships in Spain. The IPF (International Powerlifting Federation) is the world federation. Anvil Strength is affiliated with both, so you can compete in all of their official championships.' },
                { q: 'How do I register so I can compete?', a: 'Once you are part of the team, we guide you through the whole AEP registration process. It is simpler than it looks and it is done once a year. Your coach is with you every step of the way.' },
                { q: 'What does access to the club app include?', a: 'The app includes your personalised training block, direct chat with your coach and nutritionist, tracking of your personal bests, the team’s competition calendar, bar velocity analysis (VBT), and access to the athlete community.' },
            ],
            falta: 'Missing a question?',
            escribenos: 'Write to us',
        },
        contacto: {
            titulo: 'Let’s talk',
        },
        mascota: {
            abrir: 'Open the Anvil Strength chat',
            burbuja: 'Let’s talk?',
        },
        pie: {
            lema: 'Spain’s digital powerlifting club. Affiliated with the AEP and IPF. Free, for all of Spain.',
            instagram: 'Anvil Strength on Instagram',
            email: 'Email Anvil Strength',
            whatsapp: 'Anvil Strength on WhatsApp',
            navegacion: 'Navigation',
            enlaces: {
                filosofia: 'Philosophy',
                staff: 'Coaching staff',
                atletas: 'Our athletes',
                logros: 'Club achievements',
                competiciones: 'Competitions',
                unete: 'Join the team',
            },
            federaciones: 'Federations',
            legal: 'Legal',
            avisoLegal: 'Legal notice (ES)',
            privacidad: 'Privacy policy (ES)',
            cookies: 'Cookie policy (ES)',
            terminos: 'Terms and conditions (ES)',
            normativa: 'Team rules (ES)',
            derechos: '© 2026 Anvil Strength Powerlifting Club. All rights reserved.',
            grupo: 'Grupo de Recreación Deportiva · Affiliated with AEP + IPF',
        },
        cookies: {
            region: 'Cookie notice',
            texto: 'We only use the technical cookies needed to keep you logged in — no tracking and no advertising.',
            mas: 'More information',
            entendido: 'Got it',
        },
        resenas: {
            titulo1: 'What our',
            titulo2: 'athletes say',
            intro: 'Find out what our athletes think about their experience with Anvil Strength',
            resena: 'review',
            resenas: 'reviews',
            error: 'Could not load the reviews',
            quieresOpinar: 'Want to leave a review?',
            inicia: 'Log in or sign up to share your experience with the community',
            iniciarSesion: 'Log in',
            cargando: 'Loading reviews...',
            reintentar: 'Try again',
            vacio: 'No reviews yet.',
            primero: 'Be the first to share your experience!',
        },
        formulario: {
            titulo1: 'Share your',
            titulo2: 'experience',
            calificacion: 'Your rating',
            niveles: ['Needs work', 'Fair', 'Good', 'Very good', 'Excellent!'],
            opinion: 'Your review',
            placeholder: 'Tell us about your experience with Anvil Strength. What did you think of the training? The results? The team?',
            caracteres: '{n}/1000 characters',
            minimo: '(10 minimum)',
            exito: 'Review published! Thanks for sharing your experience.',
            publicando: 'Publishing...',
            publicar: 'Publish review',
            errorPublicar: 'Could not publish the review',
        },
        modales: {
            cerrar: 'Close',
            equipoTitulo: 'Our team',
            mejoresMarcas: 'Best lifts',
            ultimaCompeticion: 'Latest competition',
            presentacion: 'About',
            contactoDirecto: 'Direct contact',
            formulario: 'Form',
        },
    }
);

/** Los textos de la web en el idioma que ha elegido quien la visita. */
export function useTextosWeb() {
    const { idioma } = useIdioma();
    return WEB[idioma];
}

export type TextosWeb = ReturnType<typeof useTextosWeb>;

/* =====================================================================
   DATOS DEL CLUB EN INGLÉS
   =====================================================================
   Los ficheros de `data/` son del club, no de usuarios: se escriben en el
   código y por tanto SÍ se traducen (la frontera de lib/i18n/es.ts). Van
   aparte, indexados por id, para que añadir un entrenador o un logro en
   español siga siendo tocar un solo sitio; si falta su traducción, sale en
   español en vez de romperse.                                               */

const COACHES_EN: Record<number, Pick<Coach, 'role' | 'bio'>> = {
    1: {
        role: 'POWERLIFTING COACH',
        bio: 'SCIENCE. PERFORMANCE. PASSION.\n\nPhD candidate in Physical Activity and Sport Sciences (UV).\nOfficial Master’s in High-Performance Sport (UCAM).\nDegree in Physical Activity and Sport Sciences (UCV).\n\nLecturer at Apta Vital Sport.\nCoach specialising in Powerlifting and Weightlifting.\n\nI combine academic rigour with hands-on experience to take your performance to the next level.',
    },
    2: {
        role: 'POWERLIFTING COACH',
        bio: 'Passionate about powerlifting and tired of a world where everyone gets a copy-and-paste programme, where everything relies on a 1-to-10 RPE scale with nothing in between and no reliable data. That’s why I use the most advanced techniques to gather every possible piece of data about you and your lifts, turning a feeling into numbers that can be worked with to understand you better as an athlete. Leave no session to chance. In a sport with competition rules, train by them.',
    },
    3: {
        role: 'POWERLIFTING COACH',
        bio: 'Spanish Junior powerlifting champion.\n\nCompeting at the highest level taught me what separates one lift from another: it isn’t genetics or luck, it’s data. Now I take my athletes to their true best based on what their own training shows, not on what it looks like they’re doing.\n\nBeing objective isn’t optional in this sport. Every set tells you something, and my job is to listen to it.',
    },
};

const NUTRICIONISTAS_EN: Record<string, Pick<Nutritionist, 'role' | 'bio'>> = {
    '1': {
        role: 'SPORTS NUTRITIONIST',
        bio: 'Specialist in sports nutrition focused on performance and body composition. I help strength athletes get the most out of their results through personalised, evidence-based nutrition strategies.',
    },
};

const LOGROS_EN: Record<number, Pick<Achievement, 'title' | 'result' | 'desc'>> = {
    1: {
        title: 'SBJ National Championship 2026',
        result: 'First place -105kg',
        desc: 'Spanish champion in all three lifts and a direct ticket to the European Sub-Junior Championships for Pau Rodríguez.',
    },
    2: {
        title: 'SBD CUP 2025',
        result: 'Two second places',
        desc: 'Silver in the -83kg and -105kg categories. In the latter, an (unofficial) Spanish bench press record of 192.5kg.',
    },
    3: {
        title: 'SBJ National Championship 2026',
        result: 'Third place -105kg',
        desc: 'Third in Spain across the three lifts for Santiago Badía.',
    },
    4: {
        title: 'Black Oni VI',
        result: 'Overall podium',
        desc: 'Third place overall for our athlete Pau Camacho, who also took gold in the 83kg category.',
    },
    5: {
        title: 'SBJ National Championship 2026',
        result: '2nd place in the club standings',
        desc: 'Second-best club at the 2026 Spanish Sub-Junior Championships, thanks to the performances of Pau Rodríguez and Santi!',
    },
    6: {
        title: 'ESTE 2 Regional · Chiva 2026',
        result: 'Champion -74kg',
        desc: 'Fernando Alexander was crowned -74kg champion at the ESTE 2 Regional Championship held in Chiva.',
    },
    7: {
        title: 'Spanish Junior Championship 2026',
        result: 'Champion -105kg · 2nd overall',
        desc: 'Spanish Junior champion in the -105kg category and second place overall at the championship.',
    },
};

export function coachEn<T extends Coach>(coach: T, idioma: Idioma): T {
    const en = idioma === 'en' ? COACHES_EN[coach.id] : undefined;
    return en ? { ...coach, ...en } : coach;
}

export function nutricionistaEn<T extends Nutritionist>(nutri: T, idioma: Idioma): T {
    const en = idioma === 'en' ? NUTRICIONISTAS_EN[nutri.id] : undefined;
    return en ? { ...nutri, ...en } : nutri;
}

export function logroEn<T extends Achievement>(logro: T, idioma: Idioma): T {
    const en = idioma === 'en' ? LOGROS_EN[logro.id] : undefined;
    return en ? { ...logro, ...en } : logro;
}
