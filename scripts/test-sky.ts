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
import { skyStyle, sunAltitude, drawsRain, drawsSnow, type SkyInput } from '../src/lib/sky.ts';
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

// ── L'altura del sol ───────────────────────────────────────────────────────
console.log('\nL\'altura del sol, en graus:\n');
{
  const LAT = 41.7;
  const casos: Array<[string, number, { sunriseH: number; sunsetH: number }, number, number]> = [
    ['migdia solar de juliol', 13.83, ESTIU, 66, 74],
    ['a la sortida', ESTIU.sunriseH, ESTIU, -1, 1],
    ['a la posta', ESTIU.sunsetH, ESTIU, -1, 1],
    ['mitja hora després de la posta', ESTIU.sunsetH + 0.5, ESTIU, -7, -3],
    ['mitjanit de juliol', 1.83, ESTIU, -28, -22],
    ['migdia solar de desembre', 12.83, HIVERN, 22, 28],
    ['mitjanit de desembre', 0.83, HIVERN, -75, -68],
  ];
  for (const [label, hour, dia, lo, hi] of casos) {
    const a = sunAltitude(hour, dia.sunriseH, dia.sunsetH, LAT);
    if (a < lo || a > hi) fail(`${label}: ${a.toFixed(1)}° i hauria de ser entre ${lo}° i ${hi}°`);
    else ok(`${label} → ${a.toFixed(1)}°`);
  }
}

// ── La llum: un cel tapat no és negre ──────────────────────────────────────
console.log('\nLa llum dels núvols i del crepuscle:\n');
{
  const brightnessOf = (filter: string) => Number(filter.match(/brightness\(([\d.]+)\)/)?.[1] ?? 1);

  /*
   * El que va fallar a producció: un lloc ennuvolat, amb claror de sobres, i
   * el titular **negre**. La claror de les textures es restava en comptes de
   * multiplicar-se, i amb poc sol donava zero.
   */
  let darkest = Infinity;
  let darkestAt = '';
  for (let h = 0; h < 24; h += 0.25) {
    for (const cc of [60, 80, 100]) {
      for (const code of [3, 63, 95]) {
        const s = sky({ hour: h, cloudCover: cc, code, precipitationMm: code === 3 ? 0 : 6 });
        const b = brightnessOf(s.cloudFilterNear);
        if (b < darkest) { darkest = b; darkestAt = `${h.toFixed(2)} h, ${cc} %, codi ${code}`; }
      }
    }
  }
  if (darkest < 0.12) fail(`hi ha un núvol a ${darkest.toFixed(3)} de claror (${darkestAt}): és negre`);
  else ok(`el núvol més fosc de tot el dia i tot el temps està a ${darkest.toFixed(2)} (${darkestAt})`);

  // Tapat al migdia: gris clar. Més clar que tapat al capvespre, i aquest més que de nit.
  const migdia = brightnessOf(sky({ hour: 14, cloudCover: 100, code: 3 }).cloudFilter);
  const posta = brightnessOf(sky({ hour: ESTIU.sunsetH, cloudCover: 100, code: 3 }).cloudFilter);
  const civil = brightnessOf(sky({ hour: ESTIU.sunsetH + 0.5, cloudCover: 100, code: 3 }).cloudFilter);
  const nit = brightnessOf(sky({ hour: 2, cloudCover: 100, code: 3 }).cloudFilter);
  if (!(migdia > posta && posta > civil && civil > nit)) {
    fail(`tapat: migdia ${migdia} · posta ${posta} · +30 min ${civil} · nit ${nit}: no van en ordre`);
  } else ok(`cel tapat: migdia ${migdia} > posta ${posta} > +30 min ${civil} > nit ${nit}`);
  if (migdia < 0.75) fail(`un cel tapat al migdia hauria de ser gris clar i està a ${migdia}`);
  if (posta < 0.45) fail(`a la posta encara hi ha més de la meitat de la claror, i el núvol està a ${posta}`);

  // Mitja hora després de la posta no és de nit.
  const dusk = sky({ hour: ESTIU.sunsetH + 0.5, cloudCover: 0 });
  if (dusk.light < 0.15) fail(`mitja hora després de la posta la claror és ${dusk.light}: massa fosc`);
  else ok(`mitja hora després de la posta: sol a ${dusk.sunAltitude}°, claror ${dusk.light}`);
  if (Number(dusk.starOpacity) > 0.05) fail('mitja hora després de la posta encara no es veuen estrelles');
  const late = sky({ hour: ESTIU.sunsetH + 2.2, cloudCover: 0 });
  if (late.light > 0.02) fail(`dues hores després de la posta la claror és ${late.light}: hauria de ser nit`);
  else ok(`dues hores després de la posta: sol a ${late.sunAltitude}°, nit tancada`);

  // La boira tapa el cel.
  if (sky({ code: 45, cloudCover: 10 }).cover < 0.9) fail('amb boira el cel no es veu');
  else ok('boira amb 10 % de núvols → es dibuixa tapat');
}

// ── El contrast del titular ────────────────────────────────────────────────
console.log('\nEl text blanc del titular, contra el pitjor cel i el pitjor núvol:\n');
{
  /*
   * Es torna a compondre el titular **capa a capa i en l'ordre en què les
   * dibuixa el component**: el cel, el vel de nuvolositat, les quatre textures
   * i, a sobre, el vel de contrast. Tot llegit del que `skyStyle()` retorna
   * —les cadenes de CSS que van a la pàgina—, no dels seus números interns:
   * si un dia el càlcul del vel i el que es pinta se separen, es veu aquí.
   *
   * **Els núvols** són textures que es mouen, i el que hi ha darrere d'una
   * lletra concreta depèn del fotograma. Però el pitjor cas sí que es pot
   * mesurar: les tres imatges arriben a **blanc pur amb alfa sencera** —mesurat
   * amb sharp damunt dels fitxers que se serveixen—, així que el pitjor que pot
   * passar darrere d'una lletra és un núvol opac i blanc amb el filtre de
   * lluminositat de l'hora a sobre.
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
  const lumsOf = (cssText: string) => [...cssText.matchAll(/oklch\([^)/]+\)/g)]
    .map((m) => oklchToHex(m[0]))
    .filter((x) => /^#[0-9a-f]{6}$/.test(x))
    .map(srgbLum);

  const SKY_AT = [0, 0.36, 0.72, 1];
  const VEIL_S = srgbLum(oklchToHex('oklch(19% 0.028 250)'));

  const track = (stops: number[][], x: number) => {
    for (let i = 1; i < stops.length; i++) {
      if (x <= stops[i][0]) {
        const t = (x - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
        return lerp(stops[i - 1][1], stops[i][1], t);
      }
    }
    return stops.at(-1)![1];
  };

  /**
   * El que deixa passar el filtre d'una textura blanca: `brightness()`,
   * `contrast()` i `sepia()`, que apuja una mica la lluminositat perquè la
   * seva matriu suma més d'u.
   */
  const whiteThrough = (filter: string) => {
    const b = Math.min(1, Number(filter.match(/brightness\(([\d.]+)\)/)?.[1] ?? 1));
    const c = Number(filter.match(/contrast\(([\d.]+)\)/)?.[1] ?? 1);
    const sp = Number(filter.match(/sepia\(([\d.]+)\)/)?.[1] ?? 0);
    return Math.max(0, Math.min(1, Math.max(0, Math.min(1, (b - 0.5) * c + 0.5)) * (1 + 0.215 * sp)));
  };

  /*
   * Fins on arriba cada textura, en fracció de l'alçada: són les caixes del
   * component (`top` i `height` de cada capa a `LocationHero.tsx`).
   */
  const BANDS = { wisp: 0.46, far: 0.62, near: 0.70, over: 0.72 };

  /*
   * D'on cap avall hi ha text, **mesurat al navegador i no suposat**: des del
   * 2 %, que és on cauen els enllaços de la barra del web d'ençà que va dins
   * del titular.
   */
  const TEXT_FROM = 0.02;

  let worst = Infinity;
  let worstAt = '';
  let lightest = 0;
  let lightestAt = '';

  for (const dia of [ESTIU, HIVERN]) {
    for (let h = 0; h < 24; h += 0.25) {
      for (const cc of [0, 10, 20, 40, 60, 80, 100]) {
        for (const [code, mm] of [[0, 0], [3, 0], [63, 4], [95, 9], [45, 0]] as const) {
          const s = skyStyle({ hour: h, ...dia, cloudCover: cc, code, precipitationMm: mm, moonPhase: 0.5 });
          const sky4 = lumsOf(s.skyGradient);
          const veil2 = lumsOf(s.veilImage);
          if (sky4.length < 4 || veil2.length < 2) { fail('no s\'han pogut llegir els colors del cel'); continue; }
          const veilO = Number(s.veilOpacity);
          const far = whiteThrough(s.cloudFilter);
          const near = whiteThrough(s.cloudFilterNear);

          for (let p = TEXT_FROM; p <= 1.0001; p += 0.01) {
            let comp = track(SKY_AT.map((a, i) => [a, sky4[i]]), Math.min(1, p));
            comp = comp * (1 - veilO) + lerp(veil2[0], veil2[1], p) * veilO;
            if (p <= BANDS.wisp) comp = comp * (1 - s.wispOpacity) + far * s.wispOpacity;
            if (p <= BANDS.far) comp = comp * (1 - s.cloudFarOpacity) + far * s.cloudFarOpacity;
            if (p <= BANDS.near) comp = comp * (1 - s.cloudNearOpacity) + near * s.cloudNearOpacity;
            if (p <= BANDS.over) comp = comp * (1 - s.overcastOpacity) + near * s.overcastOpacity;

            const alpha = track(s.contrastStops, Math.min(1, p));
            const behind = comp * (1 - alpha) + VEIL_S * alpha;
            const ratio = 1.05 / (toLinear(behind) + 0.05);
            const at = `${h.toFixed(2)} h, ${cc} % de núvols, codi ${code}, al ${(p * 100).toFixed(0)} % de l'alçada`;
            if (ratio < worst) { worst = ratio; worstAt = at; }
            if (behind > lightest) { lightest = behind; lightestAt = at; }
          }
        }
      }
    }
  }

  console.log(`  pitjor punt · ${worstAt}`);
  if (worst < 4.5) fail(`el text queda a ${worst.toFixed(2)}:1, i el mínim és 4,5:1`);
  else ok(`el text blanc, damunt del pitjor cel i el pitjor núvol: ${worst.toFixed(2)}:1`);
  ok(`el fons més clar que queda darrere del text: ${(lightest * 100).toFixed(0)} % (${lightestAt})`);

  /*
   * I l'altra meitat, que és la raó del canvi: **el vel no tapa el que ja és
   * fosc**. De nit n'hi ha prou amb un fil, i un capvespre tapat no n'ha de
   * portar més que un migdia.
   */
  const maxAlpha = (over: Partial<SkyInput>) => Math.max(...sky(over).contrastStops.map(([, a]) => a));
  const nitSerena = maxAlpha({ hour: 2, cloudCover: 0 });
  const nitTapada = maxAlpha({ hour: 2, cloudCover: 100, code: 3 });
  const migdia = maxAlpha({ hour: 14, cloudCover: 40, code: 2 });
  if (nitSerena > 0.15) fail(`de nit el vel arriba a ${nitSerena}: tapa un cel que ja és fosc`);
  else ok(`nit serena: el vel no passa de ${nitSerena}`);
  if (nitTapada > 0.15) fail(`una nit tapada porta un vel de ${nitTapada}: sortiria negra`);
  else ok(`nit tapada: el vel no passa de ${nitTapada}`);
  if (migdia < 0.4) fail(`un migdia amb núvols blancs només porta ${migdia} de vel`);
  else ok(`migdia amb núvols: el vel arriba a ${migdia}`);
}

if (bad) {
  console.error(`\n${bad} ${bad === 1 ? 'comprovació ha fallat' : 'comprovacions han fallat'}.`);
  process.exit(1);
}
console.log('\nEl cel diu el que passa.');
