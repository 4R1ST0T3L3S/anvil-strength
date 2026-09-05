import type { DiccionarioTraducido } from './es';

/**
 * ANVIL STRENGTH — ENGLISH DICTIONARY
 * =====================================================================
 *
 * `: DiccionarioTraducido` es lo que hace que esto no se pudra: falta una
 * clave y no compila, sobra una y tampoco. Un diccionario que se queda a medias no
 * llega a producción como "casi traducido": no llega.
 *
 * NO SE TRADUCE NADA QUE HAYA ESCRITO UNA PERSONA. Los nombres de ejercicio,
 * los nombres de atleta y las notas del entrenador salen tal cual de la base
 * de datos, en el idioma en que se escribieron. Ver la cabecera de `es.ts`.
 *
 * REGISTRO: el español de esta app tutea y va al grano ("Falta la arroba", no
 * "Por favor, introduzca una dirección de correo válida"). El inglés hace lo
 * mismo — directo y sin ceremonia— en vez de caer en el registro corporativo
 * que suelen tener las traducciones.
 *
 * `kg` NO se convierte a libras. Es una app de powerlifting: la federación
 * pesa en kilos, los discos son de kilos y una sentadilla de 180 es 180 en
 * todas partes. Cambiar la unidad al cambiar de idioma sería un error de
 * dominio, no una cortesía.
 */
export const en: DiccionarioTraducido = {
    'accion.guardar': 'Save',
    'accion.cancelar': 'Cancel',
    'accion.borrar': 'Delete',
    'accion.editar': 'Edit',
    'accion.crear': 'Create',
    'accion.cerrar': 'Close',
    'accion.volver': 'Back',
    'accion.reintentar': 'Try again',
    'accion.buscar': 'Search',
    'accion.filtrar': 'Filter',
    'accion.quitarFiltro': 'Clear the filter',
    'accion.verMas': 'See more',
    'accion.volverArriba': 'Back to top',
    'accion.crearCuenta': 'Create a free account',
    'accion.entrar': 'Log in',
    'accion.salir': 'Log out',

    'nav.inicio': 'Home',
    'nav.planificacion': 'Training',
    'nav.calendario': 'Calendar',
    'nav.competiciones': 'Competitions',
    'nav.nutricion': 'Nutrition',
    'nav.atletas': 'Athletes',
    'nav.chat': 'Chat',
    'nav.perfil': 'Profile',
    'nav.arena': 'The Arena',
    'nav.ranking': 'Ranking',
    'nav.entrenar': 'Train',
    'nav.velocidad': 'Velocity',
    // AEP es la federación española: su nombre no se traduce, igual que no se
    // traduce IPF. Lo que se traduce es la palabra que lo acompaña.
    'nav.calendarioAep': 'AEP calendar',
    'nav.tienda': 'Anvil store',
    'nav.cambiarAEntrenador': 'Switch to coaching',
    'nav.cambiarANutricion': 'Switch to nutrition',

    'estado.cargando': 'Loading…',
    'estado.vacioTitulo': 'Nothing here yet',
    'estado.errorTitulo': "Couldn't load the data",
    'estado.errorTituloDe': "Couldn't load {que}",
    'estado.errorSinRed': "Looks like you're offline. Check your connection and try again.",
    'estado.errorSesion': 'Your session expired. Log back in and everything will be where you left it.',
    'estado.errorLento': 'The server took too long to answer.',
    'estado.errorGenerico': 'This looks like a one-off. Trying again will most likely work.',
    'que.datos': 'the data',
    'que.atletas': 'the athletes',
    'que.bloques': 'the blocks',
    'que.combates': 'the bouts',
    'que.sesiones': 'the sessions',
    'que.competiciones': 'the competitions',
    'que.cuestionarios': 'the check-ins',
    'que.ranking': 'the ranking',

    'validacion.requerido': 'This one is missing',
    'validacion.email': 'The @ is missing',
    'validacion.emailSinDominio': 'The domain is missing, after the @',
    'validacion.minimoLargo_una': '{n} character short',
    'validacion.minimoLargo_varias': '{n} characters short',
    'validacion.maximoLargo_una': '{n} character too many',
    'validacion.maximoLargo_varias': '{n} characters too many',
    'validacion.numero': 'This has to be a number',
    'validacion.rango': 'It has to be between {min} and {max}',
    'validacion.entero': 'It has to be a whole number',
    'validacion.fecha': "That date doesn't look right",

    'tema.etiqueta': 'Theme',
    'tema.sistema': 'System',
    'tema.sistemaPista': 'Follows your device',
    'tema.claro': 'Light',
    'tema.claroPista': 'Always light',
    'tema.oscuro': 'Dark',
    'tema.oscuroPista': 'Always dark',
    'tema.cambiar': 'Theme: {actual}. Change',

    'dia.lunes': 'Monday',
    'dia.martes': 'Tuesday',
    'dia.miercoles': 'Wednesday',
    'dia.jueves': 'Thursday',
    'dia.viernes': 'Friday',
    'dia.sabado': 'Saturday',
    'dia.domingo': 'Sunday',
    // Las iniciales inglesas chocan (Tuesday/Thursday, Saturday/Sunday), así
    // que van dos letras. En español una basta porque X y M las separan.
    'diaCorto.lunes': 'Mo',
    'diaCorto.martes': 'Tu',
    'diaCorto.miercoles': 'We',
    'diaCorto.jueves': 'Th',
    'diaCorto.viernes': 'Fr',
    'diaCorto.sabado': 'Sa',
    'diaCorto.domingo': 'Su',

    'periodo.semana': 'This week',
    'periodo.mes': 'This month',
    'periodo.ultimas': 'Last {n} weeks',
    'periodo.bloque': 'This block',
    'periodo.todo': 'All time',
    'periodo.sinFecha': "This block has no start date",
    'periodo.ponerFecha': 'Set a start date',

    'inicio.saludoManana': 'Good morning',
    'inicio.saludoTarde': 'Good afternoon',
    'inicio.saludoNoche': 'Good evening',
    'inicio.hoy': 'Today',
    'inicio.proximaCompeticion': 'Next competition',
    'inicio.tuCarrera': 'Your career',
    'inicio.planificacion': 'Training plan',
    'inicio.planificacionPista': 'Blocks and sessions',
    'inicio.competicionesPista': 'Lifts and events',
    'inicio.calendarioPista': 'Your year at a glance',
    'inicio.miPerfil': 'My profile',
    'inicio.miPerfilPista': 'Lifts, category and details',
    'inicio.arenaPista': 'Club bets',
    'inicio.rankingPista': 'Athlete standings',
    'inicio.necesitasAcceso': 'Needs full access',
    'inicio.cargaDeBarra': 'Bar loading',
    'inicio.cargaDeBarraPista': 'Which plates to put on',
    'inicio.aproximaciones': 'Warm-up sets',
    'inicio.aproximacionesPista': 'The ramp up to your top set',
    'inicio.unRm': '1RM',
    'inicio.unRmPista': 'From RPE or velocity',
    'inicio.sushi': 'Sushi',
    'inicio.sushiPista': 'Post-meet tally',

    'entreno.serie_una': '{n} set',
    'entreno.serie_varias': '{n} sets',
    'entreno.repeticion_una': '{n} rep',
    'entreno.repeticion_varias': '{n} reps',
    'entreno.kg': 'kg',
    'entreno.rpe': 'RPE',
    'entreno.porcentaje1rm': '% 1RM',
    'entreno.descanso': 'Rest',
    'entreno.sesionDeHoy': "Today's session",
    'entreno.sinSesion': 'No training today',

    'pago.vencido': 'Your membership is overdue',
    'pago.alDiaHasta': 'You were paid up until {fecha}',
    'pago.hablarConEntrenador': 'Message your coach',
};
