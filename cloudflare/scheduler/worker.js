/**
 * El reloj de la ingesta.
 *
 * ## Por qué existe
 *
 * Los workers declaraban cadencias de diez, quince y treinta minutos en GitHub
 * Actions y corrían **cada tres horas largas** — medido el 2 de septiembre de
 * 2026 sobre las últimas veinte ejecuciones de cada uno: entre 117 y 273
 * minutos, y los tres a la vez, que es lo que delata que el planificador los
 * agrupa y se salta el intervalo pedido.
 *
 * Para un radar de siete marcos de diez minutos, eso no es un retraso: es otro
 * producto. Y en la predicción era peor que un retraso: el planificador
 * acumulaba las horas que no había podido servir y las disparaba en ráfaga
 * —tres refrescos en dos horas y media—, y cada nivel A cuesta 3.290 de las
 * 10.000 unidades diarias de Open-Meteo.
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
 * ## Un solo cron y la decisión aquí dentro
 *
 * El plan gratuito permite tres crons por worker, y hacen falta cinco horarios
 * distintos. Con un único tic cada cinco minutos y la tabla de abajo, sobran
 * dos y se gana algo que tres crons no daban: la predicción se dispara **con
 * el nivel puesto**, en vez de deducirlo de la hora dentro del workflow.
 *
 * ## Y las `schedule` de GitHub se quedan puestas
 *
 * A propósito. Si este reloj se para —Cloudflare tiene un mal día— la ingesta
 * no se apaga: vuelve a la cadencia mala, que es mucho mejor que ninguna. Y
 * `/estat` lo enseña.
 *
 * Que las dos cosas disparen a la vez no cuesta cuota: el worker de predicción
 * no vuelve a pedir un nivel que acaba de refrescar.
 */

/**
 * Qué toca a cada hora, en UTC.
 *
 * `at(h, m)` recibe la hora y el minuto del tic y decide. La predicción lleva
 * el nivel en los `inputs` porque `github.event.schedule` viene vacío en un
 * `workflow_dispatch`, y sin eso el workflow refrescaría siempre el nivel A.
 */
const PLAN = [
  { file: 'observacio.yml', at: (h, m) => m % 10 === 0 },
  { file: 'avisos.yml', at: (h, m) => m % 15 === 0 },
  { file: 'mar.yml', at: (h, m) => m === 0 || m === 30 },
  { file: 'diari.yml', at: (h, m) => h === 6 && m === 0 },
  { file: 'cameres.yml', at: (h, m) => m === 25 },

  { file: 'prediccio.yml', at: (h, m) => h === 2 && m === 0, inputs: { tiers: 'B' } },
  { file: 'prediccio.yml', at: (h, m) => h === 3 && m === 30, inputs: { tiers: 'C' } },
  { file: 'prediccio.yml', at: (h, m) => h === 5 && m === 0, inputs: { tiers: 'A' } },
  { file: 'prediccio.yml', at: (h, m) => h === 17 && m === 0, inputs: { tiers: 'A' } },
];

async function dispatch(env, file, inputs) {
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
    body: JSON.stringify(inputs ? { ref: 'main', inputs } : { ref: 'main' }),
  });

  // 204 es l'unica resposta bona d'aquest endpoint.
  if (res.status !== 204) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`${file}: HTTP ${res.status} ${detail}`);
  }
}

const scheduler = {
  async scheduled(event, env) {
    const now = new Date(event.scheduledTime);
    const h = now.getUTCHours();
    const m = now.getUTCMinutes();

    const due = PLAN.filter((p) => p.at(h, m));
    if (!due.length) return;

    /*
     * Uno detras de otro y sin parar en el primer fallo.
     *
     * Si el token no sirve para uno, tampoco servira para los demas y da
     * igual; pero si falla por otra razon -GitHub devuelve un 503- no hay
     * motivo para que se quede sin disparar el resto. Al final se lanza con
     * todo lo que haya ido mal, que es lo que aparece en los registros.
     */
    const failures = [];
    for (const p of due) {
      try {
        await dispatch(env, p.file, p.inputs);
      } catch (err) {
        failures.push(String(err));
      }
    }
    if (failures.length) throw new Error(failures.join(' | '));
  },
};

export default scheduler;
