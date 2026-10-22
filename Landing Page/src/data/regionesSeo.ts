/**
 * DATOS SEO TERRITORIALES — VALENCIA, MURCIA E ISLAS BALEARES
 * =====================================================================
 *
 * POR QUÉ ESTE FICHERO ES 100 % SERIALIZABLE (SIN JSX NI IMPORTS)
 * Un script de build lo reutilizará para prerenderizar el HTML estático de
 * cada ruta (`/powerlifting-valencia`, `/powerlifting-murcia` y
 * `/powerlifting-baleares`). Por eso aquí solo viven cadenas, arrays y
 * objetos planos: cero componentes de React y cero importaciones externas.
 *
 * POR QUÉ VA SOLO EN ESPAÑOL
 * Las búsquedas objetivo ("powerlifting valencia", "powerlifting murcia",
 * "powerlifting baleares", "club powerlifting ...") se realizan en español y
 * el selector de idioma de la web no tiene rutas propias por idioma, de modo
 * que el contenido indexable de estas tres páginas se sirve únicamente en
 * castellano.
 */

export type RegionSlug =
    | 'powerlifting-valencia'
    | 'powerlifting-murcia'
    | 'powerlifting-baleares';

export interface SeccionRegionSeo {
    titulo: string;
    parrafos: string[];
}

export interface FaqRegionSeo {
    q: string;
    a: string;
}

export interface RegionSeo {
    slug: RegionSlug;
    nombre: string;
    /** Etiqueta para el enlace en el bloque "Powerlifting en tu zona" del pie. */
    etiquetaEnlace: string;
    /** Antetítulo breve sobre el H1 para situar demarcación y federación. */
    antetitulo: string;
    /** Título SEO (< 60 caracteres). Se expone también como `titulo` por compatibilidad con scripts de prerender. */
    titulo: string;
    tituloSeo: string;
    /** Meta description (< 155 caracteres). */
    descripcion: string;
    /** Único encabezado H1 de la página. */
    h1: string;
    /** Párrafo introductorio bajo el H1. */
    intro: string;
    /** Términos (sin tildes, en minúsculas) para filtrar la columna LOCALIDAD de aepCalendar2026.ts. */
    terminosSede: string[];
    /** Términos (sin tildes, en minúsculas) para filtrar campeonatos de la demarcación en aepCalendar2026.ts. */
    terminosZona: string[];
    /** Bloques de contenido editorial específicos de cada región. */
    secciones: SeccionRegionSeo[];
    /** Preguntas frecuentes visibles y exportadas en el esquema JSON-LD FAQPage. */
    faqs: FaqRegionSeo[];
}

export const TITULO_PIE_REGIONES = 'Powerlifting en tu zona';

export const REGIONES_SEO: RegionSeo[] = [
    {
        slug: 'powerlifting-valencia',
        nombre: 'Valencia',
        etiquetaEnlace: 'Powerlifting en Valencia',
        antetitulo: 'Comunidad Valenciana · Puerto de Sagunto · AEP e IPF',
        titulo: 'Club de Powerlifting en Valencia | Anvil Strength',
        tituloSeo: 'Club de Powerlifting en Valencia | Anvil Strength',
        descripcion: 'Club de powerlifting en Valencia (Puerto de Sagunto) afiliado a AEP e IPF. Afiliación gratis, entrenamiento online en tu gimnasio y calendario AEP.',
        h1: 'Club de powerlifting en Valencia',
        intro: 'Anvil Strength (Grupo de Recreación Deportiva de Halterofilia Anvil Strength) tiene su domicilio social en Puerto de Sagunto, Valencia, y está afiliado oficialmente a la Asociación Española de Powerlifting (AEP) y a la IPF. Funcionamos como un club 100 % digital y sin cuota de pertenencia: entrenas en tu gimnasio habitual en Valencia, Castellón o Alicante con la planificación en nuestra aplicación y compites en tarima oficial respaldado por el equipo.',
        terminosSede: ['valencia', 'chiva'],
        terminosZona: ['valencia', 'chiva'],
        secciones: [
            {
                titulo: 'Domicilio en Puerto de Sagunto, entrenamiento en tu propio gimnasio',
                parrafos: [
                    'Aunque el domicilio del club está en Puerto de Sagunto (Valencia), Anvil Strength no es un gimnasio comercial ni te obliga a desplazarte a una nave concreta para entrenar. Nacimos con una estructura a distancia a propósito: cada levantador entrena en el gimnasio que mejor le encaje por cercanía, horario o material, y compite bajo el nombre del club.',
                    'Toda la preparación se coordina desde la aplicación propia de Anvil Strength. Allí recibes tu programación semanal con series, kilos y RPE, registras cada sesión desde el móvil entre series, subes los vídeos de tus levantamientos para corrección técnica, asocias registros de velocidad de barra (VBT) si usas encoder y hablas por chat directo con tu entrenador y tu nutricionista.',
                ],
            },
            {
                titulo: 'Cómo empezar a competir en la AEP desde la Comunidad Valenciana',
                parrafos: [
                    'Para estrenarte en una competición oficial de la AEP en Valencia o en el resto de la Comunidad Valenciana no necesitas acreditar ninguna marca mínima si empiezas por un campeonato de nivel AEP-3 (provincial o promocional). El siguiente escalón es el regional AEP-2 de la demarcación ESTE-2 (Campeonato SudEste, que agrupa a Valencia, Murcia y Baleares) y, a partir de ahí, los campeonatos nacionales AEP-1.',
                    'Lo que sí exige el reglamento de la Asociación Española de Powerlifting es contar con licencia federativa anual tramitada a través de un club dado de alta en la AEP. En Anvil Strength gestionamos tu afiliación y tus inscripciones en plazo, revisamos que tu equipamiento (singlet, cinturón, rodilleras y muñequeras) cumpla la normativa técnica de la IPF y planificamos la entrada en tu categoría de peso corporal.',
                ],
            },
            {
                titulo: 'Por qué competir respaldado por un club y no en solitario',
                parrafos: [
                    'En un campeonato oficial el resultado no depende solo de lo que levantas en tu gimnasio. Quien acude por primera vez sin estructura suele perder intentos por desconocer las órdenes de los tres jueces en sentadilla, press de banca y peso muerto, calcular mal los tiempos de calentamiento o no entregar el papel del siguiente intento en mesa dentro del minuto reglamentario.',
                    'Competir con Anvil Strength en las citas de la Comunidad Valenciana significa llegar al pesaje con los tres intentos de apertura definidos a partir de los datos reales de tu bloque, compartir convocatoria con compañeros de equipo que levantan en la misma jornada y contar con entrenadores que preparan tu competición con reglamento IPF desde el primer día.',
                ],
            },
            {
                titulo: 'Afiliación gratuita al club y cuerpo técnico especializado',
                parrafos: [
                    'Formar parte de Anvil Strength y utilizar su aplicación cuesta cero euros: el club no cobra cuota mensual, ni matrícula de entrada, ni permanencia. Los únicos costes obligatorios para competir son las tasas anuales de licencia y la inscripción a cada campeonato, que fija y percibe íntegramente la AEP.',
                    'Si además de federarte con el club buscas que uno de nuestros entrenadores o nuestro nutricionista deportivo lleve tu preparación personalizada, te asignamos profesional tras revisar tu ficha de inscripción y acuerdas el servicio directamente con él, sin comisiones por parte del club.',
                ],
            },
        ],
        faqs: [
            {
                q: '¿Tenéis un gimnasio físico en Valencia o en Puerto de Sagunto al que haya que asistir?',
                a: 'No. Nuestro domicilio social está en Puerto de Sagunto (Valencia), pero el club es 100 % digital. Puedes entrenar en el gimnasio que prefieras en Valencia capital, el área metropolitana o cualquier localidad de la Comunidad Valenciana y llevar toda tu programación y seguimiento en nuestra app.',
            },
            {
                q: '¿Cuánto cuesta federarse en la AEP con Anvil Strength en Valencia?',
                a: 'Pertenecer al club es totalmente gratuito: no hay cuota mensual ni anual del club. Solo abonas las tasas oficiales que establece la AEP para tu licencia federativa anual y las inscripciones a los campeonatos en los que compitas. El servicio de entrenamiento personalizado o nutrición es opcional y se acuerda directamente con el profesional.',
            },
            {
                q: '¿Hace falta un total mínimo para debutar en un campeonato AEP-3 en Valencia?',
                a: 'No. Los campeonatos de nivel AEP-3 son la puerta de entrada al calendario oficial y no piden marca mínima clasificatoria. Solo necesitas tramitar tu licencia anual con un club afiliado a la AEP, llevar la indumentaria aprobada por la IPF y preparar tus levantamientos con las pausas y órdenes reglamentarias.',
            },
            {
                q: '¿Cómo se prepara la elección de intentos antes de competir?',
                a: 'Durante las semanas previas al campeonato tu entrenador analiza en la aplicación tus series principales, los vídeos y la velocidad de ejecución para fijar primeros intentos seguros que te aseguren puntuar en los tres movimientos, dejando margen en los segundos y terceros intentos según cómo avance la sesión.',
            },
        ],
    },
    {
        slug: 'powerlifting-murcia',
        nombre: 'Murcia',
        etiquetaEnlace: 'Powerlifting en Murcia',
        antetitulo: 'Región de Murcia · Demarcación ESTE-2 · AEP e IPF',
        titulo: 'Club de Powerlifting en Murcia | Anvil Strength',
        tituloSeo: 'Club de Powerlifting en Murcia | Anvil Strength',
        descripcion: 'Club de powerlifting para atletas de Murcia afiliado a AEP e IPF. Afiliación gratis, preparación online en tu gimnasio y campeonatos AEP en tu zona.',
        h1: 'Club de powerlifting en Murcia',
        intro: 'Anvil Strength acoge a levantadores de toda la Región de Murcia que quieren entrenar con planificación rigurosa y competir en el calendario oficial de la Asociación Española de Powerlifting (AEP) y la IPF. Compartimos con Murcia la demarcación territorial ESTE-2 (Campeonato SudEste) y funcionamos a distancia para que entrenes en tu gimnasio de siempre, sin pagar cuota de club y con toda la tramitación federativa resuelta.',
        terminosSede: ['murcia'],
        terminosZona: ['murcia'],
        secciones: [
            {
                titulo: 'Un club abierto a los atletas de la Región de Murcia',
                parrafos: [
                    'Muchos levantadores en Murcia, Cartagena, Lorca, Molina de Segura o el resto de la región entrenan en gimnasios comerciales o centros de fuerza que no están constituidos como club deportivo dentro de la AEP. Para salir a la tarima oficial es obligatorio tener licencia a través de un club afiliado, pero ese club no tiene por qué ser el local donde entrenas a diario.',
                    'En Anvil Strength damos cabida a atletas de la Región de Murcia con una estructura 100 % online y gratuita. Sigues entrenando en tu gimnasio habitual y te integras en el equipo a través de nuestra aplicación, donde llevas tu bloque semanal, registras marcas y mantienes contacto directo con tu entrenador y tus compañeros de convocatoria.',
                ],
            },
            {
                titulo: 'Competir en Murcia y en la demarcación ESTE-2 (SudEste) de la AEP',
                parrafos: [
                    'Dentro de la organización territorial de la AEP, la Región de Murcia forma junto a la Comunidad Valenciana y las Islas Baleares la demarcación ESTE-2 (Campeonato SudEste). Gracias a ello, Murcia cuenta con presencia habitual en el calendario oficial tanto en competiciones promocionales AEP-3 como en regionales AEP-2 y campeonatos nacionales AEP-1.',
                    'Empezar a competir en sedes de la propia Región de Murcia o en desplazamientos cortos por el eje mediterráneo facilita mucho el estreno en plataforma. Desde el club nos ocupamos de gestionar tu alta federativa anual, avisarte de los plazos de inscripción de cada campeonato y guiar tu entrada en categoría de peso y revisión de material IPF.',
                ],
            },
            {
                titulo: 'Cómo funciona el entrenamiento a distancia en el día a día',
                parrafos: [
                    'Sustituimos las hojas de cálculo sueltas y los mensajes perdidos por una plataforma diseñada para powerlifting. Cada semana tu entrenador publica tu programación con series, repeticiones, kilos y RPE; tú registras lo que haces desde el móvil entre serie y serie y subes los vídeos de sentadilla, press de banca y peso muerto para corregir técnica y validar que cada repetición sería válida ante tres jueces.',
                    'Si utilizas encoder lineal para medir velocidad de barra (VBT), la app asocia los datos a la serie correspondiente para evaluar tu fatiga y tu progreso real sin depender de estimaciones a ojo. Y si necesitas ajustar tu composición corporal para entrar en categoría, cuentas con nutricionista deportivo dentro del mismo entorno.',
                ],
            },
            {
                titulo: 'Por qué dar el paso a un club federado marca la diferencia',
                parrafos: [
                    'Entrenar fuerza sin una fecha en el calendario suele terminar en bloques interminables sin puesta a punto ni referencias objetivas. Al unirte a un club activo en la AEP ordenas tu año en torno a competiciones reales, aprendes a gestionar el pesaje de dos horas y sales a la plataforma con una estrategia de nueve intentos trabajada de antemano.',
                    'Además, aunque cada atleta de Murcia entrene en su propio gimnasio durante la semana, en el día del campeonato coincides con el resto de convocados de Anvil Strength que compiten en la zona SudEste y en las citas nacionales.',
                ],
            },
        ],
        faqs: [
            {
                q: 'Vivo en la Región de Murcia, ¿puedo federarme con Anvil Strength aunque su sede social esté en Valencia?',
                a: 'Sí. Cualquier levantador residente en la Región de Murcia puede tramitar su licencia anual de la AEP con Anvil Strength. Además, Murcia y la Comunidad Valenciana pertenecen a la misma demarcación interterritorial (ESTE-2 / Campeonato SudEste) en el calendario oficial de la federación.',
            },
            {
                q: '¿Necesito cambiar de gimnasio en Murcia para pertenecer al club?',
                a: 'No. Puedes seguir entrenando en tu gimnasio actual en cualquier municipio de la Región de Murcia. Toda la planificación semanal, el análisis de vídeo, los datos de velocidad de barra y el chat con tu entrenador funcionan desde nuestra aplicación.',
            },
            {
                q: '¿Por qué competición de la AEP conviene empezar en Murcia?',
                a: 'Si nunca has competido, el estreno natural es un campeonato de nivel AEP-3, ya que no exige marca mínima previa y te permite registrar tu primer total oficial en acta. Con esa experiencia o alcanzando la marca mínima correspondiente, puedes dar el salto al regional ESTE-2 (AEP-2) y a los Campeonatos o Copas de España (AEP-1).',
            },
            {
                q: '¿Tiene algún coste pertenecer a Anvil Strength desde Murcia?',
                a: 'Unirse al club y usar la plataforma es gratis (0 € de cuota). Solo asumes las tasas oficiales de la AEP por tu licencia anual y por la inscripción a los campeonatos en los que participes. El entrenamiento personalizado y la nutrición deportiva son servicios opcionales que se acuerdan directamente con el entrenador o nutricionista.',
            },
        ],
    },
    {
        slug: 'powerlifting-baleares',
        nombre: 'Baleares',
        etiquetaEnlace: 'Powerlifting en Baleares',
        antetitulo: 'Islas Baleares · Mallorca, Menorca, Ibiza y Formentera · AEP e IPF',
        titulo: 'Club de Powerlifting en Baleares | Anvil Strength',
        tituloSeo: 'Club de Powerlifting en Baleares | Anvil Strength',
        descripcion: 'Club de powerlifting en Baleares afiliado a AEP e IPF. Afiliación gratis y preparación online para atletas de Mallorca, Menorca, Ibiza y Formentera.',
        h1: 'Club de powerlifting en Baleares',
        intro: 'Anvil Strength acoge a atletas de Mallorca, Menorca, Ibiza y Formentera que buscan un club afiliado a la Asociación Española de Powerlifting (AEP) y a la IPF para competir de forma oficial sin depender de que exista un club presencial en su isla. Nuestra estructura 100 % digital y sin cuota de club te permite entrenar en tu gimnasio habitual en Baleares y desplazarte a competir con toda la gestión federativa y la puesta a punto planificadas.',
        terminosSede: ['baleares', 'mallorca', 'palma', 'menorca', 'ibiza', 'formentera'],
        terminosZona: ['baleares'],
        secciones: [
            {
                titulo: 'Entrenar en Mallorca, Menorca, Ibiza o Formentera dentro de un club AEP',
                parrafos: [
                    'Quien entrena powerlifting en las Islas Baleares se encuentra a menudo con un obstáculo práctico: hay buenos gimnasios donde mover kilos, pero muy pocos clubes dados de alta en la AEP que gestionen licencias, inscripciones y preparación específica de competición sin exigir presencialidad.',
                    'Anvil Strength nació precisamente para eliminar esa barrera geográfica. Te afilias al club de forma gratuita, entrenas en tu gimnasio en Mallorca, Menorca, Ibiza o Formentera y trabajas desde nuestra aplicación web y móvil: allí consultas tu programación semanal, anotas cargas y RPE, envías los vídeos de tus series y mantienes contacto directo por chat con tu entrenador y tu nutricionista.',
                ],
            },
            {
                titulo: 'Cómo encaja Baleares en el calendario oficial de la AEP',
                parrafos: [
                    'En la estructura competitiva de la Asociación Española de Powerlifting, los levantadores de las Islas Baleares participan en los campeonatos interterritoriales del bloque Este —tanto la demarcación ESTE-1 (Cataluña y Baleares) como la ESTE-2 (Campeonato SudEste: Murcia-Valencia-Baleares)—, además de las citas AEP-3 abiertas y los campeonatos nacionales AEP-1.',
                    'Cuando el calendario oficial no programa una sede física dentro del archipiélago, competir implica volar o viajar en barco a sedes peninsulares cercanas como Valencia, Barcelona, Tarragona o Murcia. Por eso llevamos al día los plazos de afiliación e inscripción ante la AEP: para que puedas organizar vuelos, alojamiento y fechas de competición con suficiente margen.',
                ],
            },
            {
                titulo: 'Por qué la preparación importa el doble cuando viajas desde las islas',
                parrafos: [
                    'Desplazarse fuera de la isla para competir añade variables que hay que controlar: horarios de viaje, descanso, comidas fuera de casa y ajuste del peso corporal antes del pesaje oficial de dos horas. Improvisar cualquiera de esos puntos o fallar intentos por no dominar las órdenes de los jueces y el material aprobado por la IPF sale mucho más caro cuando has cogido un avión para estar en la tarima.',
                    'Con el equipo técnico del club planificas la bajada de fatiga (*tapering*), la estrategia nutricional previa al pesaje y la tabla de intentos de apertura a partir de los datos reales registrados en la app durante todo el bloque de entrenamiento.',
                ],
            },
            {
                titulo: 'Comunidad real y afiliación gratuita sin letra pequeña',
                parrafos: [
                    'Entrenar en tu gimnasio en las islas no significa llegar solo al campeonato. A través de la plataforma del club compartes calendario, ranking interno y convocatorias con atletas de Valencia, Murcia y el resto del equipo con los que coincidirás en la sala de calentamiento y en la competición.',
                    'Unirse a Anvil Strength y usar la aplicación es completamente gratuito (0 € de cuota). Solo abonas a la AEP tu licencia federativa anual y el dorsal de cada competición; y si quieres preparación individualizada con un entrenador o nutricionista del club, lo acuerdas directamente con él.',
                ],
            },
        ],
        faqs: [
            {
                q: 'Vivo en Mallorca, Menorca, Ibiza o Formentera, ¿puedo tramitar mi licencia AEP con Anvil Strength?',
                a: 'Sí. Acogemos a levantadores de todas las Islas Baleares. Tramitamos tu licencia federativa anual ante la Asociación Española de Powerlifting (AEP) para que puedas participar en cualquier campeonato oficial AEP-3, AEP-2 o AEP-1 representando al club.',
            },
            {
                q: '¿Dónde compiten habitualmente los atletas de Baleares dentro de la AEP?',
                a: 'En el calendario de la AEP, Baleares se encuadra en los campeonatos interterritoriales ESTE-1 (Cataluña y Baleares) y ESTE-2 (Campeonato SudEste: Murcia-Valencia-Baleares), además de los campeonatos nacionales. Cuando no se convoca sede en las islas, las pruebas más directas por conexión se celebran en Valencia, Barcelona, Tarragona o Murcia.',
            },
            {
                q: '¿Cómo se hace el seguimiento técnico si entreno en mi gimnasio en las islas?',
                a: 'Toda la supervisión se realiza dentro de la aplicación de Anvil Strength. Tu entrenador pauta las sesiones de cada semana y tú registras los kilos, el RPE, los datos de velocidad de barra (VBT) si usas encoder y los vídeos de tus series principales para recibir correcciones técnicas detalladas por chat.',
            },
            {
                q: '¿Cuánto cuesta unirse a Anvil Strength desde Baleares?',
                a: 'Pertenecer al club es gratis: no existe cuota de alta ni mensualidad por formar parte de Anvil Strength o usar su app. Los únicos gastos obligatorios para competir son las tasas anuales de licencia e inscripción de la AEP. El servicio de entrenamiento personalizado o nutrición deportiva es independiente y se acuerda directamente con el profesional.',
            },
        ],
    },
];

export const REGIONES_SEO_POR_SLUG: Record<RegionSlug, RegionSeo> = {
    'powerlifting-valencia': REGIONES_SEO[0],
    'powerlifting-murcia': REGIONES_SEO[1],
    'powerlifting-baleares': REGIONES_SEO[2],
};
