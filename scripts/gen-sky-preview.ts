/**
 * Els dotze cels de cop, per poder-los mirar de costat.
 *
 *   npm run cels     →  http://localhost:3000/__cels.html
 *
 * No és una prova: és el mirall. `npm run test:sky` comprova el que es pot
 * comprovar amb números —el sol, la lluna, el contrast—, i això serveix per a
 * l'única cosa que no: si els dotze estats **es distingeixen entre ells**.
 *
 * Va servir de seguida. La primera versió del vel de contrast deixava un
 * migdia de juliol i un vespre de novembre plovent exactament igual de
 * foscos: cada un per separat semblava bé, i posats de costat es veia que el
 * fons havia deixat de dir res. Amb una sola captura no s'hauria vist mai.
 *
 * El fitxer que escriu va a `public/` perquè el serveixi el servidor de
 * desenvolupament, i està al `.gitignore`: no s'ha de publicar.
 */
import { writeFileSync } from 'node:fs';
import { skyStyle, drawsRain, drawsSnow, type Sky, type SkyInput } from '../src/lib/sky.ts';

const CASOS: Array<[string, Omit<SkyInput, 'sunriseH' | 'sunsetH'>]> = [
  ['02 h · serè', { hour: 2, cloudCover: 5, code: 0, precipitationMm: 0, moonPhase: 0.5 }],
  ['06 h · alba', { hour: 6.8, cloudCover: 20, code: 1, precipitationMm: 0, moonPhase: 0.5 }],
  ['09 h · poc ennuvolat', { hour: 9, cloudCover: 35, code: 2, precipitationMm: 0, moonPhase: 0.5 }],
  ['14 h · serè', { hour: 14, cloudCover: 5, code: 0, precipitationMm: 0, moonPhase: 0.5 }],
  ['14 h · mig ennuvolat', { hour: 14, cloudCover: 55, code: 2, precipitationMm: 0, moonPhase: 0.5 }],
  ['14 h · cobert', { hour: 14, cloudCover: 100, code: 3, precipitationMm: 0, moonPhase: 0.5 }],
  ['15 h · pluja', { hour: 15, cloudCover: 90, code: 63, precipitationMm: 4, moonPhase: 0.5 }],
  ['16 h · xàfec', { hour: 16, cloudCover: 95, code: 82, precipitationMm: 18, moonPhase: 0.5 }],
  ['17 h · tempesta', { hour: 17, cloudCover: 95, code: 95, precipitationMm: 9, moonPhase: 0.5 }],
  ['11 h · nevada', { hour: 11, cloudCover: 92, code: 73, precipitationMm: 3, moonPhase: 0.5 }],
  ['20 h · posta', { hour: 20.6, cloudCover: 30, code: 1, precipitationMm: 0, moonPhase: 0.5 }],
  ['22 h · nit plovent', { hour: 22, cloudCover: 95, code: 61, precipitationMm: 1.5, moonPhase: 0.2 }],
];

const layer = (o: number) => (o > 0.004 ? `opacity:${o}` : 'display:none');

const cards = CASOS.map(([label, over]: [string, Omit<SkyInput, 'sunriseH' | 'sunsetH'>]) => {
  const s: Sky = skyStyle({ sunriseH: 6.33, sunsetH: 21.33, ...over });
  return `<figure style="margin:0">
  <div class="hero" style="background:${s.skyGradient}">
    <div class="l" style="background:${s.skyGradient}"></div>
    ${s.sunVisible ? `<div class="l" style="left:${s.bodyLeft};top:${s.bodyTop};width:0;height:0;inset:auto"><div style="position:absolute;inset:-230px;border-radius:999px;background:radial-gradient(circle, ${s.sunScatter} 0%, transparent 64%)"></div></div>` : ''}
    <div class="l stars" style="opacity:${s.starOpacity}"></div>
    ${s.moonVisible ? `<div class="l" style="left:${s.bodyLeft};top:${s.bodyTop};inset:auto;width:76px;height:76px;margin:-38px 0 0 -38px"><svg viewBox="0 0 76 76" width="76" height="76"><circle cx="38" cy="38" r="24" fill="oklch(88% 0.03 250)" opacity=".2"/><path d="${s.moonPath}" fill="oklch(99% 0.015 100)"/></svg></div>` : ''}
    ${s.sunVisible ? `<div class="l" style="left:${s.bodyLeft};top:${s.bodyTop};inset:auto;width:84px;height:84px;margin:-42px 0 0 -42px;opacity:${s.sunOpacity}">
      <div style="position:absolute;inset:-86px;border-radius:999px;background:radial-gradient(circle, ${s.sunBloom} 0%, transparent 60%)"></div>
      <div style="position:absolute;left:-170px;right:-170px;top:50%;height:6px;margin-top:-3px;background:linear-gradient(90deg,transparent 0%,${s.sunStreak} 26%,${s.sunStreak} 74%,transparent 100%);filter:blur(3.5px)"></div>
      <div style="position:absolute;inset:20px;border-radius:999px;background:radial-gradient(circle,oklch(100% 0 0) 0%,oklch(100% 0 0) 36%,oklch(98% 0.07 92 / .8) 62%,transparent 100%);filter:blur(1.2px)"></div></div>` : ''}
    <div class="l" style="opacity:${s.veilOpacity};background-image:${s.veilImage}"></div>
    <div class="l" style="left:0;right:0;top:-2%;height:48%;bottom:auto;overflow:hidden;filter:${s.cloudFilter};${layer(s.wispOpacity)}"><div class="t" style="background-image:url(/cel/wisps.webp);background-size:1280px 100%"></div></div>
    <div class="l" style="left:0;right:0;top:0;height:62%;bottom:auto;overflow:hidden;filter:${s.cloudFilter};${layer(s.cloudFarOpacity)}"><div class="t" style="background-image:url(/cel/cumulus.webp);background-size:900px 100%"></div></div>
    <div class="l" style="left:0;right:0;top:-12%;height:82%;bottom:auto;overflow:hidden;filter:${s.cloudFilterNear};${layer(s.cloudNearOpacity)}"><div class="t" style="background-image:url(/cel/cumulus.webp);background-size:1900px 100%"></div></div>
    <div class="l" style="left:0;right:0;top:-8%;height:80%;bottom:auto;overflow:hidden;filter:${s.cloudFilterNear};${layer(s.overcastOpacity)}"><div class="t" style="background-image:url(/cel/overcast.webp);background-size:1280px 100%"></div></div>
    ${s.thunder ? `<div class="l" style="background:radial-gradient(120% 74% at 64% 2%, oklch(99% .015 250/.95) 0%, oklch(92% .04 250/.42) 26%, transparent 62%);opacity:.5"></div>` : ''}
    ${drawsRain(s) ? `<div class="l" style="opacity:${s.rainOpacity};overflow:hidden"><div style="position:absolute;inset:-20% -30%;background-image:repeating-linear-gradient(${s.rainAngle[1]}, transparent 0 9px, oklch(95% .012 240/.24) 9px 10px, transparent 10px 23px);background-size:160px 640px"></div><div style="position:absolute;inset:-20% -30%;filter:blur(2.4px);background-image:repeating-linear-gradient(${s.rainAngle[2]}, transparent 0 34px, oklch(99% .006 240/.55) 34px 37px, transparent 37px 74px);background-size:320px 1020px"></div></div>` : ''}
    ${drawsSnow(s) ? `<div class="l" style="opacity:${s.snowOpacity};overflow:hidden"><div style="position:absolute;inset:-24%;background-repeat:repeat;background-image:radial-gradient(circle, oklch(100% 0 0/.85) 0%, oklch(100% 0 0/.85) 5%, transparent 11%),radial-gradient(circle, oklch(100% 0 0/.62) 0%, oklch(100% 0 0/.62) 4%, transparent 9%);background-size:53px 53px,79px 79px"></div></div>` : ''}
    <div class="l relleu"></div>
    <div class="l veil"></div>
    <div class="l top"></div>
    <div class="content">
      <div class="crumb">CATALUNYA › ALT EMPORDÀ</div>
      <div class="h1">Agullana</div>
      <div class="sub">l'Alt Empordà · 164 m · 885 hab.</div>
      <div class="big">31<span class="dec">,2°</span></div>
      <div class="cond">${label}</div>
    </div>
  </div>
</figure>`;
}).join('\n');

writeFileSync('public/__cels.html', `<!doctype html><meta charset=utf8><title>Cels</title>
<style>
body{margin:0;background:#111;font-family:system-ui,sans-serif;display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px;padding:10px}
.hero{position:relative;overflow:hidden;border-radius:16px;height:250px}
.l{position:absolute;inset:0}
.t{position:absolute;inset:0;background-repeat:repeat-x}
.stars{background-image:${Array(9).fill('radial-gradient(circle, oklch(99% 0 0) 0%, transparent 100%)').join(',')};background-size:3px 3px,2px 2px,4px 4px,2px 2px,3px 3px,3px 3px,2px 2px,3px 3px,2px 2px;background-position:12% 14%,27% 8%,41% 22%,58% 11%,71% 26%,84% 16%,19% 33%,63% 38%,91% 31%;background-repeat:no-repeat}
.relleu{background-image:url(/relleu-v1.png);background-size:1120px auto;background-position:-160px -452px;background-repeat:no-repeat;filter:brightness(.26) contrast(1.45) saturate(0);opacity:.74;top:auto;height:140px;-webkit-mask-image:linear-gradient(to top,#000 45%,transparent 100%)}
.veil{background:linear-gradient(to top, oklch(17% .02 250/.74) 0%, oklch(18% .024 250/.66) 40%, oklch(19% .028 250/.56) 72%, oklch(20% .03 250/.5) 92%, oklch(21% .03 250/.22) 100%)}
.top{top:0;bottom:auto;height:300px;background:linear-gradient(to bottom, oklch(17% .02 250/.30) 0px, oklch(17% .02 250/.26) 150px, transparent 300px)}
.content{position:relative;padding:22px 20px;color:oklch(99% 0 0)}
.crumb{font-size:12px;letter-spacing:.08em}
.h1{font-size:24px;font-weight:600;letter-spacing:-.025em;margin-top:6px}
.sub{font-size:13px;opacity:.9}
.big{font-size:58px;font-weight:300;letter-spacing:-.06em;line-height:.86;margin-top:12px}
.dec{font-size:26px}
.cond{font-size:17px;font-weight:500;margin-top:10px}
</style>
${cards}`);
console.log('escrit public/__cels.html');
