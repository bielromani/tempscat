import { CREDENTIALS, daysUntil, isDate } from './lib/credentials.ts';

/**
 * ¿Le queda poco a alguna clave?
 *
 * Corre solo, una vez por semana, y **no toca ninguna dada**. Es a propósito:
 * si esta comprobación fuera un paso del worker de avisos, el día que fallara
 * dejaría el web sin avisos, que es justo lo que intenta evitar. Aquí un fallo
 * significa una cosa y solo una: hay que renovar una clave.
 *
 * El margen es de 45 días para que lleguen unos seis correos antes de que pase
 * nada, y no de cinco: una clave de AEMET se pide en un minuto, pero hay que
 * estar delante del ordenador, y las cosas que hay que hacer hoy mismo se
 * hacen tarde.
 */

/** Días de margen. Seis avisos semanales antes de que la clave muera. */
const WARN_DAYS = 45;

let bad = 0;

console.log(`Claus que caduquen · marge d'avís: ${WARN_DAYS} dies\n`);

for (const c of CREDENTIALS) {
  const key = process.env[c.env];
  const expires = process.env[c.expiresEnv];

  if (!key) {
    console.error(`✗ ${c.label}`);
    console.error(`  No hi ha ${c.env}. Sense la clau, aquesta font no s'actualitza.`);
    console.error(`  Es demana a ${c.renewAt}\n`);
    bad++;
    continue;
  }

  /*
   * Sin fecha no hay guardia, y eso es peor que una fecha próxima: es el
   * estado en el que estuvo la clave de AEMET desde el primer día. Cuenta
   * como caducada a propósito.
   */
  if (!isDate(expires)) {
    console.error(`✗ ${c.label}`);
    console.error(`  Hi ha ${c.env} però no ${c.expiresEnv}, així que no se sap quan caduca.`);
    console.error(`  Posa-hi la data en AAAA-MM-DD: dura ${c.lifetimeDays} dies des que es demana.`);
    console.error(`  Als secrets del repositori, al costat de la clau.\n`);
    bad++;
    continue;
  }

  const left = daysUntil(expires);
  if (left < 0) {
    console.error(`✗ ${c.label}`);
    console.error(`  Va caducar el ${expires}, fa ${-left} dies. Renova-la a ${c.renewAt}`);
    console.error(`  i actualitza ${c.env} i ${c.expiresEnv} als secrets.\n`);
    bad++;
  } else if (left <= WARN_DAYS) {
    console.error(`✗ ${c.label}`);
    console.error(`  Caduca el ${expires}: queden ${left} dies.`);
    console.error(`  Renova-la a ${c.renewAt} i actualitza ${c.env} i ${c.expiresEnv}.\n`);
    bad++;
  } else {
    console.log(`✓ ${c.label} · caduca el ${expires}, queden ${left} dies`);
  }
}

if (bad) {
  console.error(`\n${bad} ${bad === 1 ? 'clau demana' : 'claus demanen'} atenció.`);
  process.exit(1);
}

console.log('\nCap clau a punt de caducar.');
