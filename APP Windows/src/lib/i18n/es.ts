/**
 * ANVIL STRENGTH — DICCIONARIO BASE (ESPAÑOL)
 * =====================================================================
 *
 * ESTE FICHERO ES EL CONTRATO. `en.ts` se declara `: DiccionarioTraducido`,
 * así que una clave que falte o sobre allí es un error de compilación, no una
 * cadena en español apareciendo en medio de la interfaz inglesa seis meses
 * después. Es el mismo patrón de "contrato en código" que ya usan
 * `lib/prefs/contract.ts` y `lib/vbt/metricRegistry.ts`.
 *
 *
 * LO QUE NO ENTRA AQUÍ, Y ES LA REGLA MÁS IMPORTANTE
 *
 * **Nada que haya escrito una persona.** Nombres de atletas, nombres de
 * ejercicios, títulos de bloques, notas del entrenador, mensajes del chat.
 * Eso son DATOS, y traducirlos sería inventarse lo que alguien dijo.
 *
 * Si un entrenador llama a un ejercicio «Sentadilla con pausa», en inglés se
 * sigue leyendo «Sentadilla con pausa». La aplicación traduce SU propia voz:
 * botones, títulos de sección, mensajes de error, estados vacíos.
 *
 * La frontera es fácil de comprobar: si el texto viene de Supabase, no se
 * traduce. Si está escrito en el código, sí.
 *
 *
 * CÓMO SE NOMBRAN LAS CLAVES
 *
 * `zona.pieza` en plano, sin anidar. Anidar obliga a `t('a.b.c.d')` con
 * autocompletado a trompicones, y a decidir jerarquías que luego cambian.
 * Plano se busca con Ctrl+F, que es como se busca de verdad.
 *
 * Las que llevan `_una` / `_varias` son plurales; ver `plural()` en index.ts.
 * Los huecos van entre llaves: `{n}`, `{nombre}`.
 */

export const es = {
    // --- Acciones. Verbo en infinitivo, sin "por favor" y sin puntos. ---
    'accion.guardar': 'Guardar',
    'accion.cancelar': 'Cancelar',
    'accion.borrar': 'Borrar',
    'accion.editar': 'Editar',
    'accion.crear': 'Crear',
    'accion.cerrar': 'Cerrar',
    'accion.volver': 'Volver',
    'accion.reintentar': 'Reintentar',
    'accion.buscar': 'Buscar',
    'accion.filtrar': 'Filtrar',
    'accion.quitarFiltro': 'Quitar el filtro',
    'accion.verMas': 'Ver más',
    'accion.volverArriba': 'Volver arriba',
    'accion.crearCuenta': 'Crear cuenta gratis',
    'accion.entrar': 'Entrar',
    'accion.salir': 'Cerrar sesión',

    // --- Navegación del panel ---
    'nav.inicio': 'Inicio',
    'nav.planificacion': 'Planificación',
    'nav.calendario': 'Calendario',
    'nav.competiciones': 'Competiciones',
    'nav.nutricion': 'Nutrición',
    'nav.atletas': 'Atletas',
    'nav.chat': 'Chat',
    'nav.perfil': 'Perfil',
    'nav.arena': 'La Arena',
    'nav.ranking': 'Ranking',
    'nav.entrenar': 'Entrenar',
    'nav.velocidad': 'Velocidad',
    'nav.calendarioAep': 'Calendario AEP',
    'nav.tienda': 'Tienda Anvil',
    'nav.cambiarAEntrenador': 'Cambiar a entrenador',
    'nav.cambiarANutricion': 'Cambiar a nutrición',

    // --- Los cuatro estados. Ver `EstadoDeDatos`. ---
    'estado.cargando': 'Cargando…',
    'estado.vacioTitulo': 'Todavía no hay nada aquí',
    'estado.errorTitulo': 'No se han podido cargar los datos',
    'estado.errorTituloDe': 'No se han podido cargar {que}',
    'estado.errorSinRed': 'Parece que no hay conexión. Compruébala y vuelve a intentarlo.',
    'estado.errorSesion': 'Tu sesión ha caducado. Vuelve a entrar y lo tendrás todo como estaba.',
    'estado.errorLento': 'El servidor ha tardado demasiado en responder.',
    'estado.errorGenerico': 'Ha sido un fallo puntual: lo más probable es que reintentando funcione.',
    // El COMPLEMENTO de «No se han podido cargar ___». Va por clave y no como
    // texto suelto: si el que llama pasara «los atletas» a mano, la frase
    // inglesa saldría medio traducida — "Couldn't load los atletas".
    'que.datos': 'los datos',
    'que.atletas': 'los atletas',
    'que.bloques': 'los bloques',
    'que.combates': 'los combates',
    'que.sesiones': 'las sesiones',
    'que.competiciones': 'las competiciones',
    'que.cuestionarios': 'los cuestionarios',
    'que.ranking': 'el ranking',

    // --- Validación. Dicen QUÉ FALTA, no qué hace falta. ---
    'validacion.requerido': 'Falta rellenar esto',
    'validacion.email': 'Falta la arroba',
    'validacion.emailSinDominio': 'Falta el dominio, después de la arroba',
    'validacion.minimoLargo_una': 'Falta {n} carácter',
    'validacion.minimoLargo_varias': 'Faltan {n} caracteres',
    'validacion.maximoLargo_una': 'Sobra {n} carácter',
    'validacion.maximoLargo_varias': 'Sobran {n} caracteres',
    'validacion.numero': 'Esto tiene que ser un número',
    'validacion.rango': 'Tiene que estar entre {min} y {max}',
    'validacion.entero': 'Tiene que ser un número entero',
    'validacion.fecha': 'Esta fecha no parece correcta',

    // --- Tema ---

    // --- Días de la semana. POR CLAVE, nunca por índice de array. ---
    // Un array `['Lunes', ...]` obliga a acordarse de si el 0 es lunes o
    // domingo, y las dos convenciones conviven: ISO 8601 empieza en lunes y
    // `Date.getDay()` en domingo. Con claves, el error no se puede escribir.
    'dia.lunes': 'Lunes',
    'dia.martes': 'Martes',
    'dia.miercoles': 'Miércoles',
    'dia.jueves': 'Jueves',
    'dia.viernes': 'Viernes',
    'dia.sabado': 'Sábado',
    'dia.domingo': 'Domingo',
    'diaCorto.lunes': 'L',
    'diaCorto.martes': 'M',
    'diaCorto.miercoles': 'X',
    'diaCorto.jueves': 'J',
    'diaCorto.viernes': 'V',
    'diaCorto.sabado': 'S',
    'diaCorto.domingo': 'D',

    // --- Periodo temporal (bloque 4) ---
    'periodo.semana': 'Esta semana',
    'periodo.mes': 'Este mes',
    'periodo.ultimas': 'Últimas {n} semanas',
    'periodo.bloque': 'Este bloque',
    'periodo.todo': 'Desde siempre',
    'periodo.sinFecha': 'Este bloque no tiene fecha de inicio',
    'periodo.ponerFecha': 'Poner fecha de inicio',

    'inicio.saludoManana': 'Buenos días',
    'inicio.saludoTarde': 'Buenas tardes',
    'inicio.saludoNoche': 'Buenas noches',
    'inicio.hoy': 'Hoy',
    'inicio.proximaCompeticion': 'Próxima competición',
    'inicio.tuCarrera': 'Tu carrera',
    'inicio.planificacion': 'Planificación',
    'inicio.planificacionPista': 'Bloques y sesiones',
    'inicio.competicionesPista': 'Marcas y eventos',
    'inicio.calendarioPista': 'Tu año de un vistazo',
    'inicio.miPerfil': 'Mi perfil',
    'inicio.miPerfilPista': 'Marcas, categoría y datos',
    'inicio.arenaPista': 'Apuestas del club',
    'inicio.rankingPista': 'Clasificación de atletas',
    'inicio.necesitasAcceso': 'Necesitas acceso completo',
    'inicio.cargaDeBarra': 'Carga de barra',
    'inicio.cargaDeBarraPista': 'Qué discos poner',
    'inicio.aproximaciones': 'Aproximaciones',
    'inicio.aproximacionesPista': 'Escalera de calentamiento',
    'inicio.unRm': '1RM',
    'inicio.unRmPista': 'Desde RPE o velocidad',
    'inicio.sushi': 'Sushi',
    'inicio.sushiPista': 'Recuento post-competición',

    // --- Entrenamiento ---
    'entreno.serie_una': '{n} serie',
    'entreno.serie_varias': '{n} series',
    'entreno.repeticion_una': '{n} repetición',
    'entreno.repeticion_varias': '{n} repeticiones',
    'entreno.kg': 'kg',
    'entreno.rpe': 'RPE',
    'entreno.porcentaje1rm': '% 1RM',
    'entreno.descanso': 'Descanso',
    'entreno.sesionDeHoy': 'La sesión de hoy',
    'entreno.sinSesion': 'Hoy no toca entrenar',

    // --- Pago (bloque 5) ---
    'pago.vencido': 'Tu cuota está vencida',
    'pago.alDiaHasta': 'Estuviste al día hasta el {fecha}',
    'pago.hablarConEntrenador': 'Hablar con tu entrenador',
} as const;

/**
 * DOS TIPOS, Y LA DIFERENCIA IMPORTA.
 *
 * `Traducciones` conserva los LITERALES españoles. No es para que los demás
 * diccionarios los copien —sería absurdo—: es lo que permite leer los huecos
 * de cada frase en tiempo de compilación. `'Faltan {n} caracteres'` se lee
 * como "esta clave necesita un `n`", y pasarle otra cosa no compila.
 *
 * `DiccionarioTraducido` es lo que cumple cualquier otro idioma: LAS MISMAS
 * CLAVES, con el texto que sea. Falta una y no compila; sobra una y tampoco.
 *
 * El primer intento anotó `en.ts` con `Traducciones` a secas y TypeScript
 * exigió que 'Save' fuera literalmente 'Guardar', que es exactamente lo que
 * no se quiere.
 */
export type Traducciones = typeof es;
export type ClaveDeTraduccion = keyof Traducciones;
export type DiccionarioTraducido = Record<ClaveDeTraduccion, string>;
