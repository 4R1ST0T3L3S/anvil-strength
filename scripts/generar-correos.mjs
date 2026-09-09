#!/usr/bin/env node
/**
 * GENERA LAS PLANTILLAS DE CORREO DESDE UN ÚNICO ARMAZÓN.
 * =====================================================================
 *
 * Las cinco plantillas de Supabase Auth son el mismo correo con distinto
 * titular, texto y botón. Escritas a mano serían cinco ficheros de 120
 * líneas que se van separando: se cambia el rojo de marca en una y en las
 * otras cuatro no, y nadie se entera hasta que un atleta recibe un correo
 * con el color viejo.
 *
 * Aquí el armazón vive UNA vez (supabase/templates/_base.html) y esto
 * rellena los huecos. Cambiar la cabecera, el pie o el botón es tocar el
 * armazón y volver a ejecutar:
 *
 *     node scripts/generar-correos.mjs
 *
 * Las plantillas resultantes SÍ se versionan: son lo que hay que pegar en
 * el panel de Supabase, y tener el resultado en el repositorio permite ver
 * en un diff qué cambió de verdad.
 *
 * Ver docs/EMAILS.md para dónde va cada una.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const CARPETA = join(RAIZ, 'supabase', 'templates');

const base = readFileSync(join(CARPETA, '_base.html'), 'utf8');

/**
 * Cada plantilla. `boton` es el texto del botón; `pie` sustituye al aviso
 * genérico del pie cuando hace falta decir algo más concreto.
 */
const PLANTILLAS = [
    {
        fichero: 'magic-link.html',
        // La que dispara `inviteManagedAthlete` (supabase/functions/athletes)
        // cuando un entrenador manda el acceso a una ficha que creó él.
        // Es EL correo de "asociación entrenador → atleta" del encargo.
        vistaPrevia: 'Tu acceso a Anvil Strength. El enlace caduca en una hora.',
        titular: 'Entra en Anvil Strength',
        cuerpo: `Pulsa el botón para entrar en tu cuenta. No hace falta contraseña:
              el enlace te identifica.`,
        aviso: `Caduca en una hora y solo sirve una vez. Si ya has entrado por otro
              sitio, ignóralo.`,
        boton: 'Entrar en mi cuenta',
    },
    {
        fichero: 'invite.html',
        vistaPrevia: 'Te han invitado a entrenar en Anvil Strength.',
        titular: 'Te han invitado a Anvil Strength',
        cuerpo: `Alguien te ha dado de alta en Anvil Strength, el club de powerlifting
              donde entrenas con tu plan, registras tus series y sigues tu progreso.
              Pulsa el botón para activar tu cuenta y elegir contraseña.`,
        aviso: 'La invitación caduca en 24 horas.',
        boton: 'Activar mi cuenta',
    },
    {
        fichero: 'confirm-signup.html',
        vistaPrevia: 'Confirma tu correo y entra en Anvil Strength.',
        titular: 'Confirma tu correo',
        cuerpo: `Ya casi está. Confirma que esta dirección es tuya y tendrás tu cuenta
              de Anvil Strength lista para entrenar.`,
        aviso: 'El enlace caduca en 24 horas.',
        boton: 'Confirmar mi correo',
    },
    {
        fichero: 'reset-password.html',
        vistaPrevia: 'Cambia la contraseña de tu cuenta de Anvil Strength.',
        titular: 'Cambia tu contraseña',
        cuerpo: `Has pedido cambiar la contraseña de tu cuenta. Pulsa el botón y elige
              una nueva.`,
        aviso: `El enlace caduca en una hora. Si no has sido tú, no hagas nada: tu
              contraseña actual sigue funcionando.`,
        boton: 'Elegir contraseña nueva',
    },
    {
        fichero: 'change-email.html',
        vistaPrevia: 'Confirma tu nueva dirección de correo.',
        titular: 'Confirma tu correo nuevo',
        cuerpo: `Has pedido cambiar la dirección de tu cuenta de Anvil Strength.
              Confírmalo desde esta dirección para que el cambio surta efecto.`,
        aviso: 'Hasta que lo confirmes, se sigue usando la dirección anterior.',
        boton: 'Confirmar el cambio',
    },
];

/** El aviso concreto de cada correo, encima de la ayuda del enlace. */
function bloqueDeAviso(texto) {
    return `<p style="margin:0 0 24px 0; font-size:13px; line-height:1.6; color:#8a8a92;">
              ${texto}
            </p>

            `;
}

let escritas = 0;

for (const p of PLANTILLAS) {
    let html = base;

    // Fuera la cabecera de documentación del armazón: es para quien lee el
    // repositorio, no para el panel de Supabase ni para el buzón de nadie.
    html = html.replace(/^<!--[\s\S]*?-->\s*/, '');

    html = html
        .replace(
            '  TEXTO DE VISTA PREVIA — se cambia en cada plantilla.',
            `  ${p.vistaPrevia}`
        )
        .replace('              TITULAR', `              ${p.titular}`)
        .replace('              Texto.', `              ${p.cuerpo}`)
        .replace('                    ACCIÓN', `                    ${p.boton}`)
        // El aviso va justo antes de la ayuda del enlace.
        .replace(
            '<p style="margin:0 0 6px 0; font-size:12px; line-height:1.5; color:#8a8a92;">\n              ¿No funciona el botón?',
            bloqueDeAviso(p.aviso) +
            '<p style="margin:0 0 6px 0; font-size:12px; line-height:1.5; color:#8a8a92;">\n              ¿No funciona el botón?'
        );

    const cabecera = `<!--
  GENERADO. No editar a mano.

  Sale de supabase/templates/_base.html mediante
  scripts/generar-correos.mjs. Para cambiar el aspecto se toca el armazón y
  se vuelve a generar; para cambiar el TEXTO de este correo, la entrada
  "${p.fichero}" de ese guion.

  Dónde se pega: panel de Supabase → Authentication → Emails.
  Ver docs/EMAILS.md.
-->
`;

    writeFileSync(join(CARPETA, p.fichero), cabecera + html, 'utf8');
    console.log(`  ✓ supabase/templates/${p.fichero}`);
    escritas++;
}

console.log(`\n${escritas} plantillas generadas. Pégalas en Supabase → Authentication → Emails.`);
console.log('OJO: cambiar el HTML NO saca los correos de spam por sí solo.');
console.log('La causa real y su arreglo, en docs/EMAILS.md.\n');
