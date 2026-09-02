/**
 * El reloj de la ingesta.
 *
 * ## Por qué existe
 *
 * Los workers de alta frecuencia declaraban cada diez, quince y treinta minutos en GitHub
 * Actions y corrían **cada tres horas largas** — medido el 2 de septiembre de
 * 2026 sobre las últimas veinte ejecuciones de cada uno: entre 117 y 273
 * minutos, y los tres a la vez, que es lo que delata que el planificador los
 * agrupa y se salta el intervalo pedido.
 *
 * Para un radar de siete marcos de diez minutos, eso no es un retraso: es otro
 * producto.
 *
 * ## Por qué solo el reloj y no el trabajo
 *
 * Porque el trabajo no cabe aquí. El plan gratuito de Workers da **10 ms de
 * CPU por invocación** y **50 subpeticiones**: la observación agrega 189
 * estaciones y el radar baja 28 teselas y sube otras 28. Ninguno de los dos
 * entra, y no por poco.
 *
 * En cambio esto —una petición a la API de GitHub— son unas décimas de
 * milisegundo y una subpetición. Y los minutos de Actions en un repositorio
 * público no se cobran, así que el trabajo se queda donde ya funciona.
 *
 * Coste: 288 invocaciones al día de las 100.000 gratuitas. El 0,3 %.
 *
 * ## Y las `schedule` de GitHub se quedan puestas
 *
 * A propósito, pero degradadas a una vez por hora. Si este reloj se para —el
 * token caduca, Cloudflare tiene un mal día— la ingesta no se apaga: vuelve a
 * la cadencia mala, que es mucho mejor que ninguna. Y `/estat` lo enseña.
 */

/**
 * Qué dispara cada cron. Las claves tienen que ser **idénticas** a las de
 * `wrangler.toml`: es la cadena que Cloudflare devuelve en `event.cron`, y si
 * no coincide letra por letra aquí no se dispara nada y no da error.
 */
const WORKFLOWS = {
  '*/10 * * * *': 'observacio.yml',
  '*/15 * * * *': 'avisos.yml',
  '0,30 * * * *': 'mar.yml',
};

export default {
  async scheduled(event, env) {
    const file = WORKFLOWS[event.cron];
    if (!file) {
      // Un cron en `wrangler.toml` que no esté en la tabla de arriba no puede
      // pasar en silencio: no haría nada y parecería que funciona.
      throw new Error(`cron sense workflow assignat: "${event.cron}"`);
    }

    const url = `https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${file}/dispatches`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.GITHUB_TOKEN}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        // GitHub rebutja les peticions sense agent i no diu que es per aixo.
        'user-agent': 'tempscat-scheduler',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
    });

    // 204 es l'unica resposta bona d'aquest endpoint.
    if (res.status !== 204) {
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      throw new Error(`${file}: HTTP ${res.status} ${detail}`);
    }
  },
};
