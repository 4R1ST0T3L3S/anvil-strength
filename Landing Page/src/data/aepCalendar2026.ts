/**
 * CALENDARIO AEP 2026 - RESPALDO LOCAL
 * =====================================================================
 *
 * Copia literal de `database/Calendario_AEP_2026.xlsx`, el fichero oficial que
 * publica la Asociacion Espanola de Powerlifting, en el mismo formato CSV que
 * devuelve la hoja remota.
 *
 * POR QUE EXISTE
 *
 * El calendario se leia de una hoja de Google a traves de proxies publicos
 * gratuitos (codetabs, corsproxy, allorigins). Cuando los tres fallaban -y
 * fallan: son servicios sin garantia, con limites de uso y caidas- la pantalla
 * se quedaba con la lista vacia y sin decir nada. Eso es lo que se veia como
 * "no funciona el calendario AEP 2026".
 *
 * Con esto, el peor caso deja de ser una pantalla en blanco y pasa a ser un
 * calendario correcto con un aviso de que no se ha podido comprobar si hay
 * cambios. Se parsea con el MISMO codigo que la hoja remota, asi que no hay un
 * segundo camino que pueda divergir.
 *
 * Para actualizarlo: descarga el Excel nuevo de la AEP, guardalo en
 * `database/` y vuelve a exportar la hoja a CSV con estas mismas columnas.
 */

export const AEP_2026_FALLBACK_CSV = `FECHA,COMPETICIONES 2026,LOCALIDAD,ORGANIZADOR,NIVEL,DIVISIONES
17 ene,Copa de los Pirineos: Francia-España,Valladolid,ESPAÑA,AEP1,OPEN (SUB-25)
24-25 ene,AEP 3 - IV Copa Black Crown - Madrid,Arganda del Rey (Madrid),Black Crown,AEP3,OPEN
7-8 feb,AEP 3 - Comarca de Guadalteba - Málaga,Campillos  (Málaga),Energy Alhaurin,AEP3,OPEN
07-15 feb,EUROPEAN Masters Classic Powerlifting Championships,Place Oulu,Finland,EPF,MASTERs
21-22 feb,AEP 3 - Hirugorri txapelketa - Vitoria,Vitoria-Gasteiz (Araba),Hirugorri,AEP3,OPEN
28-01 feb-mar,"CENTRO-2, Madrid - II Campeonato Intend Power",Cotos de Monterrey  (Madrid),Intend Power,AEP2,OPEN
7-8 mar,AEP 3 - I Copa Bollodromo,Tarragona,Federación Catalana,AEP3,OPEN
15-22 mar,EUROPEAN Open Classic Powerlifting Championships,Valetta,Malta,EPF,OPEN
21-22 mar,AEP 3 - IV BLACK ONI,Murcia,Myrthea,AEP3,OPEN
21-22 mar,"NOROESTE-2, Aragón-Cantabria-Euskadi-La Rioja-Navarra",Soto de la Marina (Cantabria),Young Ambition,AEP2,OPEN
28-29 mar,Campeonato de ESPAÑA de Press Banca y Peso Muerto,El Viso de San Juan  (Toledo),Berserkers,AEP1,OPEN
28-29 mar,"CENTRO-1, Castilla-La Mancha y Extremadura - IV Regional Reino de Toledo",El Viso de San Juan  (Toledo),Berserkers,AEP2,OPEN
28-29 mar,AEP 3 - Conquer Power Cup - Gijon,Gijon (Asturias),Conquer,AEP3,OPEN
4-5 abr,AEP 3 - Campeonato de Canarias,Arinaga (Las Palmas De Gran Canaria),Fuerza Guanche,AEP3,OPEN
11-12 abr,Campeonato de ESPAÑA SUB JUNIOR,Marbella (Málaga),Energy Alhaurin,AEP1,SUBJ
11-12 abr,ANDALUCIA - Energy Cup,Marbella (Málaga),Energy Alhaurin,AEP2,OPEN
18-19 abr,"ESTE-1, Cataluña y Baleares",Tarragona,Federación Catalana,AEP2,OPEN
25-26 abr,Campeonato de ESPAÑA MASTERs,Narón,Power Fenix,AEP1,MASTERs
25-26 abr,"NOROESTE-1, Asturias-Galicia-Castilla y León",Narón,Power Fenix,AEP2,OPEN
01-10 may,"EUROPEAN Masters, Open, Sub-Junior & Junior Equipped Powerlifting Championships",Pilsen,Czech Republic,EPF,OPEN-SBJ-JUN-MASTERs
2-3 may,AEP 3 - I Campeonato “Los montes de Toledo” - Toledo,San Pablo de los Montes (Toledo),P. Toledo y P. Albacete,AEP3,OPEN
15-16-17 may,Campeonato de ESPAÑA JUNIOR,Murcia,Myrthea,AEP1,JUN
22-31 may,WORLD Classic & Equipped Bench Press Championship,Warsaw,Poland,IPF,OPEN-SBJ-JUN-MASTERs
5-6-7 jun,CLASIFICATORIO NACIONAL,Velilla de San Antonio (Madrid),Gimnasio Crom y  Soy Powerlifter,ESP.,OPEN
13-26 jun,WORLD Open Classic Powerlifting Championships,Dubai,Emiratos Arabes Unidos,IPF,OPEN
20-21 jun,"ESTE-2, Campeonato SudEste: Murcia-Valencia-Baleares",Chiva,Fuerza Isabel,AEP2,OPEN
20-21 jun,AEP 3 - Valencia,Chiva,Fuerza Isabel,AEP3,OPEN
03-09 ago,"EUROPEAN Open, Sub-Junior, Junior, Masters Classic & Equipped Bench Press Championships",Druskininkai,Lithuania,EPF,MASTERs
29 ago - 07 sep,WORLD Sub-Junior & Junior Classic & Equipped Powerlifting Championships,Sun City,South Africa,IPF,SBJ-JUN
17-20 sept,Western EUROPEAN Championships,Hamm,Luxembourg,EPF,OPEN
pendiente,AEP 3 - Tarragona,Tarragona,Moonstone,AEP3,OPEN
sin confirmar,AEP 3 - Canarias,Canarias,,AEP3,OPEN
OCT - NOV **,Copa de ESPAÑA de POWERLIFTING,,Insane Powerlifting,AEP1,OPEN
OCT - NOV **,Copa de ESPAÑA de PRESS BANCA,,Insane Powerlifting,AEP1,OPEN
3-4 oct,ANDALUCÍA,Almeria,Power Huercal Overa,AEP2,OPEN
3-4 oct,AEP 3 - Andalucía,Almeria,Power Huercal Overa,AEP3,OPEN
14-25 oct,WORLD Masters Classic&Equipped Powerlifting Championships,"Reno, Nevada",USA,IPF,MASTERs
pendiente,AEP 3 - Valencia,Valencia,GR Strength,AEP3,OPEN
pendiente,"CENTRO-2, Madrid",Madrid,Black Crown,AEP2,OPEN
sin confirmar,"CENTRO-1, Castilla-La Mancha y Extremadura",,,AEP2,OPEN
pendiente,"ESTE-1, Cataluña y Baleares",Barcelona,P. Barcelona,AEP2,OPEN
NOVIEMBRE **,Campeonato de ESPAÑA ABSOLUTO,,Power Fenix,AEP1,OPEN
NOVIEMBRE **,Campeonato de ESPAÑA OPEN EQUIPADO,,Power Fenix,AEP1,OPEN
VARIABLE **,Campeonato por EQUIPOS para clubes AEP,,,ESP.,OPEN
pendiente,"NOROESTE-1, Asturias-Galicia-Castilla y León",Valladolid,Valkyria,AEP2,OPEN
pendiente,AEP 3 - Valladolid,Valladolid,Valkyria,AEP3,OPEN
09-15 nov,WORLD Open Equipped Powerlifting Championships,Istanbul,Turkiye,IPF,OPEN
pendiente,CANARIAS,,,AEP2,OPEN
06-13 dic,EUROPEAN Sub-Junior & Junior Classic Powerlifting Championships,Krajnska Gora,Slovenia,EPF,SBJ-JUN
pendiente,"NOROESTE-2, Aragón-Cantabria-Euskadi-La Rioja-Navarra",Cantabria,P. Cantabria,AEP2,OPEN
pendiente,AEP 3 - Cantabria,Cantabria,P. Cantabria,AEP3,OPEN
pendiente,"ESTE-2, Campeonato SudEste: Murcia-Valencia-Baleares",Murcia,Myrthea,AEP2,OPEN
FINAL DE AÑO,EVENTO PATROCINADO,,,ESP.,OPEN
,CAMPEONATO PROVINCIAL NIVEL AEP 3,,,,
,CAMPEONATO REGIONAL NIVEL AEP 2,,,,
CÓDIGO,CAMPEONATO CLASIFICATORIO NACIONAL,,,,
DE,CAMPEONATO NACIONAL NIVEL AEP 1,,,,
COLORES,CAMPEONATO EUROPEO EPF,,,,
,CAMPEONATO MUNDIAL IPF,,,,
,"CAMPEONATO ESPECIAL (patrocinado, equipos u otros)",,,,
`;

/** Revision del documento oficial del que sale esta copia. */
export const AEP_2026_FALLBACK_UPDATED = '13 de enero de 2026';
