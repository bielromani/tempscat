/**
 * Que el cel del titular digui el que passa de debò.
 *
 *   npm run test:sky
 *
 * ## Per què això necessita una prova
 *
 * Perquè un cel equivocat **segueix semblant un cel**. Un signe canviat a
 * l'arc del sol el posa a l'est a la tarda i ningú no ho nota mirant la
 * pàgina; una fase lunar llegida com a fracció il·luminada dibuixa una lluna
 * plena la nit de lluna nova; i una correcció que no salti deixa ploure amb el
 * cel serè. Cap de les tres dona cap error.
 *
 * ## Contra què es comprova
 *
 * Contra **el que ha de passar al cel**, no contra la fórmula. Al migdia hi ha
 * d'haver sol i a mitjanit no; a la nit de lluna nova no hi pot haver lluna; el
 * cel de les tres de la matinada ha de ser més fosc que el de les dues del
 * migdia, i això es mesura convertint el degradat a colors de debò amb
 * `oklchToHex()`, que és la mateixa conversió que ja es comprova contra Chrome
 * a `npm run test:colors`.
 *
 * I una que no és de cel sinó de lectura: **el text blanc del titular ha de
 * passar de 4,5:1 damunt de qualsevol hora i qualsevol temps**. Es comprova
 * sobre el pitjor cas de debò —el cel més clar de l'any amb el vel de contrast
 * a sobre— i no sobre una captura.
 */
import { skyStyle, drawsRain, drawsSnow, type SkyInput } from '../src/lib/sky.ts';
import { oklchToHex } from '../src/lib/scales.ts';

let bad = 0;
const fail = (msg: string) => { console.error(`  ✗ ${msg}`); bad++; };
const ok = (msg: string) => console.log(`  ✓ ${msg}`);

/** Un dia d'estiu a Barcelona: surt a les 6:20 i es pon a les 21:20. */
const ESTIU = { sunriseH: 6.33, sunsetH: 21.33 };
/** I un de desembre: surt a les 8:15 i es pon a les 17:25. */
const HIVERN = { sunriseH: 8.25, sunsetH: 17.42 };

function sky(over: Partial<SkyInput> = {}) {
  return skyStyle({
    hour: 13, ...ESTIU, cloudCover: 10, code: 0, precipitationMm: 0, moonPhase: 0.25, ...over,
  });
}

// ── Sol i nit ──────────────────────────────────────────────────────────────
console.log('El sol hi és quan hi ha de ser:\n');
{
  const casos: Array<[string, Partial<SkyInput>, boolean]> = [
    ['migdia de juliol', { hour: 13 }, true],
    ['mitjanit de juliol', { hour: 0 }, false],
    ['les 7 del matí al juliol', { hour: 7 }, true],
    ['les 7 del matí al desembre', { hour: 7, ...HIVERN }, false],
    ['les 18 h al juliol', { hour: 18 }, true],
    ['les 18 h al desembre', { hour: 18, ...HIVERN }, false],
  ];
  for (const [label, over, wantDay] of casos) {
    const s = sky(over);
    if (s.isDay !== wantDay) fail(`${label}: isDay=${s.isDay} i hauria de ser ${wantDay}`);
    else ok(`${label} → ${s.isDay ? 'de dia' : 'de nit'}`);
  }
}

// ── L'arc ──────────────────────────────────────────────────────────────────
console.log('\nL\'arc del sol va d\'est a oest i puja pel mig:\n');
{
  const pos = [7, 10, 13.8, 17, 21].map((h) => {
    const s = sky({ hour: h });
    return { h, left: parseFloat(s.bodyLeft), top: parseFloat(s.bodyTop) };
  });
  for (let i = 1; i < pos.length; i++) {
    if (pos[i].left <= pos[i - 1].left) {
      fail(`a les ${pos[i].h} h el sol no ha avançat: ${pos[i - 1].left}% → ${pos[i].left}%`);
    }
  }
  // El migdia solar és el punt més alt, i `top` creix cap avall.
  const alt = pos.reduce((a, b) => (b.top < a.top ? b : a));
  const migdia = (ESTIU.sunriseH + ESTIU.sunsetH) / 2;
  if (Math.abs(alt.h - migdia) > 1.2) {
    fail(`el punt més alt és a les ${alt.h} h i el migdia solar és a les ${migdia.toFixed(1)}`);
  } else {
    ok(`el punt més alt (${alt.top} %) cau a les ${alt.h} h, amb el migdia solar a les ${migdia.toFixed(1)}`);
  }
  ok(`de les 7 a les 21 h el sol va del ${pos[0].left} % al ${pos.at(-1)!.left} % d'amplada`);
}

// ── La lluna ───────────────────────────────────────────────────────────────
console.log('\nLa lluna:\n');
{
  const nit = { hour: 2, cloudCover: 5 };
  if (sky({ ...nit, moonPhase: 0 }).moonVisible) fail('la nit de lluna nova no hi pot haver lluna');
  else ok('lluna nova → no es dibuixa');
  if (!sky({ ...nit, moonPhase: 0.5 }).moonVisible) fail('la nit de lluna plena n\'hi ha d\'haver');
  else ok('lluna plena → es dibuixa');
  if (sky({ ...nit, cloudCover: 95, moonPhase: 0.5 }).moonVisible) {
    fail('amb el cel tancat no es veu la lluna');
  } else ok('lluna plena amb el cel tancat → no es dibuixa');
  if (sky({ hour: 13, moonPhase: 0.5 }).moonVisible) fail('de dia no es dibuixa la lluna');
  else ok('de dia → no es dibuixa');

  /*
   * El terminador.
   *
   * Amb el quart exacte el radi menor ha de ser **zero** —la vora del
   * terminador és recta— i amb la plena ha de valer el radi sencer. És el que
   * separa «fase» de «fracció il·luminada»: confonent-les, la nit de quart
   * creixent sortiria una lluna plena.
   */
  const rx = (p: number) => Number(sky({ ...nit, moonPhase: p }).moonPath.match(/A ([\d.]+),? ?24/)?.[1]
    ?? sky({ ...nit, moonPhase: p }).moonPath.split(' A ')[2]?.split(' ')[0]);
  const quart = Number(sky({ ...nit, moonPhase: 0.25 }).moonPath.split(' A ')[2].split(' ')[0]);
  const plena = Number(sky({ ...nit, moonPhase: 0.5 }).moonPath.split(' A ')[2].split(' ')[0]);
  void rx;
  if (Math.abs(quart) > 0.01) fail(`al quart el radi menor hauria de ser 0 i és ${quart}`);
  else ok('quart creixent → terminador recte');
  if (Math.abs(plena - 24) > 0.01) fail(`a la plena el radi menor hauria de ser 24 i és ${plena}`);
  else ok('lluna plena → disc sencer');
}

// ── No pot ploure amb el cel serè ──────────────────────────────────────────
console.log('\nLes dues correccions físiques:\n');
{
  // Un model que diu 8 % de núvols i 3 mm a la mateixa hora.
  const s = sky({ cloudCover: 8, code: 63, precipitationMm: 3 });
  if (s.cover < 0.55) fail(`amb pluja la nuvolositat no pot quedar en ${s.cover}`);
  else ok(`8 % de núvols amb 3 mm → es dibuixa amb ${(s.cover * 100).toFixed(0)} %`);
  const t = sky({ cloudCover: 5, code: 95, precipitationMm: 0 });
  if (t.cover < 0.82) fail(`amb tempesta la nuvolositat no pot quedar en ${t.cover}`);
  else ok(`tempesta amb 5 % de núvols → es dibuixa amb ${(t.cover * 100).toFixed(0)} %`);
  if (!t.thunder) fail('el codi 95 hauria de portar llamps');
  if (sky({ code: 0 }).thunder) fail('un cel serè no porta llamps');
}

console.log('\nQuè es dibuixa a sobre:\n');
{
  const casos: Array<[string, Partial<SkyInput>, 'rain' | 'snow' | 'res']> = [
    ['cel serè', { code: 0, precipitationMm: 0 }, 'res'],
    ['ennuvolat sense pluja', { code: 3, precipitationMm: 0 }, 'res'],
    ['una dècima de mil·límetre', { code: 51, precipitationMm: 0.1 }, 'res'],
    ['plugim de 0,5 mm', { code: 51, precipitationMm: 0.5 }, 'rain'],
    ['pluja de 4 mm', { code: 63, precipitationMm: 4 }, 'rain'],
    ['nevada de 2 mm', { code: 73, precipitationMm: 2 }, 'snow'],
    ['tempesta', { code: 95, precipitationMm: 6 }, 'rain'],
    ['boira', { code: 45, precipitationMm: 0 }, 'res'],
  ];
  for (const [label, over, want] of casos) {
    const s = sky(over);
    const got = drawsRain(s) ? 'rain' : drawsSnow(s) ? 'snow' : 'res';
    if (got !== want) fail(`${label}: es dibuixa «${got}» i hauria de ser «${want}»`);
    else ok(`${label} → ${got === 'res' ? 'res' : got === 'rain' ? 'pluja' : 'neu'}`);
  }
}

// ── Que el cel de nit sigui fosc de debò ───────────────────────────────────
console.log('\nLa nit és més fosca que el dia, mesurat en píxels:\n');
{
  /** La lluminositat mitjana de les quatre parades, de 0 a 1. */
  const lum = (gradient: string): number => {
    const stops = [...gradient.matchAll(/oklch\([^)]+\)/g)].map((m) => m[0]);
    // Amb `color-mix` es queda amb el primer dels dos, que és el que pesa més.
    const hexes = stops.map(oklchToHex).filter((h) => /^#[0-9a-f]{6}$/.test(h));
    const rel = hexes.map((h) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    });
    return rel.reduce((a, b) => a + b, 0) / rel.length;
  };

  const nit = lum(sky({ hour: 3 }).skyGradient);
  const dia = lum(sky({ hour: 14 }).skyGradient);
  const posta = lum(sky({ hour: 21 }).skyGradient);
  if (!(nit < posta && posta < dia)) {
    fail(`nit ${nit.toFixed(3)} · posta ${posta.toFixed(3)} · migdia ${dia.toFixed(3)}: no van en ordre`);
  } else {
    ok(`nit ${nit.toFixed(3)} < posta ${posta.toFixed(3)} < migdia ${dia.toFixed(3)}`);
  }
  if (nit > 0.22) fail(`el cel de les 3 de la matinada té una lluminositat de ${nit.toFixed(3)}: massa clar`);
  else ok(`el cel de les 3 de la matinada està al ${(nit * 100).toFixed(0)} % de lluminositat`);
}

// ── El contrast del titular ────────────────────────────────────────────────
console.log('\nEl text blanc del titular, contra el pitjor cel i el pitjor núvol:\n');
{
  /*
   * Això es fa en dues meitats perquè hi ha dues coses darrere del text.
   *
   * **El cel** es pot calcular exactament: és un degradat de quatre parades i
   * el vel n'és un altre, i els dos s'han d'emparellar **per alçada**. La
   * primera versió d'aquesta comprovació agafava la parada més clara de tot el
   * degradat i la posava sota la franja més transparent del vel, i deia que el
   * titular quedava a 1,83:1. Aquella combinació no existeix enlloc: el cel
   * s'aclareix cap avall i el vel s'enfosqueix cap avall, justament perquè es
   * compensin.
   *
   * **Els núvols** són textures que es mouen, i el que hi ha darrere d'una
   * lletra concreta depèn del fotograma. Però el pitjor cas sí que es pot
   * mesurar: les tres imatges arriben a **blanc pur amb alfa sencera** —mesurat
   * amb sharp damunt dels fitxers que se serveixen—, així que el pitjor que pot
   * passar darrere d'una lletra és un núvol opac i blanc amb el filtre de
   * lluminositat de l'hora a sobre. Això es compon capa per capa, en l'ordre en
   * què les dibuixa el component.
   *
   * La composició es fa en sRGB i no en lineal perquè és on la fa el navegador;
   * la conversió a lineal es deixa per al final, que és el que demana WCAG.
   */
  const srgbLum = (hex: string) =>
    (0.2126 * parseInt(hex.slice(1, 3), 16)
      + 0.7152 * parseInt(hex.slice(3, 5), 16)
      + 0.0722 * parseInt(hex.slice(5, 7), 16)) / 255;
  const toLinear = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  const SKY_AT = [0, 0.36, 0.72, 1];
  /** Les parades del vel, de baix a dalt (`to top`), amb la seva alfa. */
  const VEIL = [[0, 0.74], [0.4, 0.66], [0.72, 0.56], [0.92, 0.5], [1, 0.22]];
  const VEIL_S = srgbLum(oklchToHex('oklch(19% 0.028 250)'));

  /*
   * El segon vel, el de dalt, va en **píxels** i el seu valor el calcula
   * `sky.ts` a partir de la cobertura i el brillo reals d'aquell moment: un dia
   * serè en porta zero. Per comprovar-lo cal una alçada de titular, i com que depèn del
   * contingut es prova tot el rang que s'ha mesurat al navegador —d'un titular
   * curt sense estació a un de llarg amb nota de correcció—. Com més alt és el
   * titular, més amunt queda el text en tant per cent i més fluix hi és el
   * primer vel: el pitjor cas és el titular **més alt**, i per això es
   * comproven tots.
   */
  const topStops = (a: number) => [[0, a], [150, a * 0.87], [300, 0]];
  const HEIGHTS = [340, 420, 500, 560, 640];

  const track = (stops: number[][], x: number) => {
    for (let i = 1; i < stops.length; i++) {
      if (x <= stops[i][0]) {
        const t = (x - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
        return lerp(stops[i - 1][1], stops[i][1], t);
      }
    }
    return stops.at(-1)![1];
  };

  /** El `brightness(x)` que porta una cadena de filtre. */
  const brightnessOf = (filter: string) => Number(filter.match(/brightness\(([\d.]+)\)/)?.[1] ?? 1);

  /*
   * D'on cap avall hi ha text, **mesurat al navegador i no suposat**.
   *
   * Des del 2 %: des que la barra del web va **dins** del titular, el text que
   * surt més amunt són els seus enllaços, i són de 14 píxels. La ruta de
   * navegació ve just a sota, al 6 %, amb 12.
   *
   * La primera versió donava per fet que no hi havia text fins al 22 % i deia
   * que tot passava; el que passava és que no s'estava mirant on hi ha el text.
   */
  const TEXT_FROM = 0.02;

  let worstSky = Infinity;
  let worstSkyAt = '';
  let worstAll = Infinity;
  let worstAllAt = '';

  for (let h = 0; h < 24; h += 0.25) {
    for (const cc of [0, 20, 40, 60, 80, 100]) {
      const s = skyStyle({
        hour: h, ...ESTIU, cloudCover: cc, code: 0, precipitationMm: 0, moonPhase: 0.5,
      });
      const stops = [...s.skyGradient.matchAll(/oklch\([^)]+\)/g)]
        .map((m) => oklchToHex(m[0]))
        .filter((x) => /^#[0-9a-f]{6}$/.test(x))
        .map(srgbLum);
      if (stops.length < 4) continue;
      const sky4 = stops.slice(0, 4);

      const bFar = Math.min(1, brightnessOf(s.cloudFilter));
      const bNear = Math.min(1, brightnessOf(s.cloudFilterNear));
      /** Les quatre capes, en l'ordre en què es dibuixen, amb la seva lluminositat. */
      const clouds: Array<[number, number]> = [
        [s.wispOpacity, bFar],
        [s.cloudFarOpacity, bFar],
        [s.cloudNearOpacity, bNear],
        [s.overcastOpacity, bNear],
      ];

      for (const H of HEIGHTS) {
        for (let p = TEXT_FROM; p <= 1.0001; p += 0.02) {
          const alpha = track(VEIL, 1 - Math.min(1, p));
          const top = track(topStops(s.scrimTop), Math.min(300, p * H));
          const skyS = track(SKY_AT.map((a, i) => [a, sky4[i]]), Math.min(1, p));

          // Només el cel.
          const bs1 = skyS * (1 - alpha) + VEIL_S * alpha;
          const behindSky = bs1 * (1 - top) + VEIL_S * top;
          const rSky = 1.05 / (toLinear(behindSky) + 0.05);
          if (rSky < worstSky) { worstSky = rSky; worstSkyAt = `${h.toFixed(2)} h, ${cc} %, al ${(p * 100).toFixed(0)} % d'un titular de ${H} px`; }

          // I amb el pitjor núvol possible a sobre: blanc opac, capa a capa.
          let comp = skyS;
          for (const [op, b] of clouds) comp = comp * (1 - op) + b * op;
          const ba1 = comp * (1 - alpha) + VEIL_S * alpha;
          const behindAll = ba1 * (1 - top) + VEIL_S * top;
          const rAll = 1.05 / (toLinear(behindAll) + 0.05);
          if (rAll < worstAll) { worstAll = rAll; worstAllAt = `${h.toFixed(2)} h, ${cc} % de núvols, al ${(p * 100).toFixed(0)} % d'un titular de ${H} px`; }
        }
      }
    }
  }

  console.log(`  només cel   · pitjor punt: ${worstSkyAt}`);
  if (worstSky < 4.5) fail(`damunt del cel el text queda a ${worstSky.toFixed(2)}:1`);
  else ok(`damunt del cel: ${worstSky.toFixed(2)}:1`);

  console.log(`  amb núvol   · pitjor punt: ${worstAllAt}`);
  if (worstAll < 4.5) fail(`damunt d'un núvol blanc opac el text queda a ${worstAll.toFixed(2)}:1, i el mínim és 4,5:1`);
  else ok(`damunt d'un núvol blanc opac: ${worstAll.toFixed(2)}:1`);
}

if (bad) {
  console.error(`\n${bad} ${bad === 1 ? 'comprovació ha fallat' : 'comprovacions han fallat'}.`);
  process.exit(1);
}
console.log('\nEl cel diu el que passa.');
