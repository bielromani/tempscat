# El temps a Catalunya, poble a poble

Plataforma meteorològica que arriba fins al **nucli de població**: no només els
947 municipis, sinó també les entitats i els nuclis que la resta de webs
ignoren. **4.293 pàgines**, cadascuna amb la seva altitud real i l'estació
automàtica que li correspon.

> Aquest README explica què és i com funciona. El disseny complet és a
> [`docs/`](docs/) i les normes per treballar-hi, a [`AGENTS.md`](AGENTS.md).

## Què el fa diferent

**Es diu d'on ve cada número.** Estació, distància, desnivell i hora de la
lectura. No és només complir la CC-BY: és la millor decisió de producte del
lloc. Quan una pàgina diu «22,4 °C a 3,9 km i 105 m de desnivell, fa 51
minuts», el lector pot decidir si s'ho creu.

**Sense dada verificada no es publica.** Una ubicació sense coordenada fiable no
té pàgina. Val més un lloc amb 4.293 pàgines correctes que un amb 11.019
inventades — i per això dels 11.019 topònims del Nomenclàtor només se'n
publiquen 4.250.

**Les frases es generen amb plantilles, mai amb un model en temps d'execució.**
Amb 4.293 pàgines, un generatiu produeix quatre mil afirmacions que ningú ha
comprovat. [`narrative.ts`](src/lib/narrative.ts) és determinista i auditable, i
si la dada no hi és, la frase no s'escriu.

**No es promet precisió no demostrada.** Mentre no existeixi la verificació
d'encert, tots els models pesen igual i la pàgina ho diu.

## Com està fet

La regla que ho ordena tot: **la ingesta està desacoblada del renderitzat.** Cap
petició d'un usuari dispara mai una crida a una API externa. Els workers
escriuen a `data/cache/`; les pàgines llegeixen d'allà.

```
scripts/workers/   →   data/cache/   →   src/app/
   ingesta              instantànies      pàgines
```

| | |
|---|---|
| **Next.js 16** amb App Router | Server components. **Cap `'use client'` a tot el projecte** |
| **Node 24 executa el TypeScript directament** | Sense pas de compilació als scripts |
| **Sense base de dades** | Instantànies JSON. L'esquema per migrar és a `db/migrations/` |

Les pàgines territorials no porten JavaScript propi. Els mapes interactius i el
tauler viuran a les seves pròpies rutes, i és allà on carregaran el seu codi.

## El territori

Construït un cop i versionat a `data/build/`, perquè és el que fa reproduïble
tota la resta:

| | |
|---|---|
| Comarques | 43 |
| Municipis | 947 |
| Entitats i nuclis publicats | 3.303 |
| Estacions XEMA operatives | 189 |
| Punts de predicció | 3.190 |
| Veïnatges per frontera real de l'ICGC | 5.424 |

**No es diu «limítrof» al que només és a prop.** La colindància surt de les
línies de frontera de l'ICGC; la proximitat s'etiqueta diferent, i la diferència
acaba al text de les pàgines.

## D'on surten les dades

Totes obertes, i totes citades a cada pàgina on apareixen.

| Font | Què aporta | Llicència |
|---|---|---|
| **Meteocat · XEMA** (Dades Obertes de la Generalitat) | Observació de 189 estacions automàtiques | CC-BY 4.0 |
| **Open-Meteo** | Predicció multimodel: ECMWF IFS, AROME HD i el consens | CC-BY 4.0 |
| **AEMET OpenData** | Avisos oficials en format CAP | Avís legal d'AEMET |
| **Agència Catalana de l'Aigua** | Embassaments, cabals i registre de sequera | Dades Obertes |
| **XVPCA** | Qualitat de l'aire mesurada | Dades Obertes |
| **Protecció Civil i socorristes** | Banderes de platja, meduses i estat del mar | Dades Obertes |
| **CAMS via Open-Meteo** | Qualitat de l'aire i pol·len modelats | CC-BY 4.0 |
| **RainViewer** | Tessel·les de radar de precipitació | Condicions de RainViewer |
| **ICGC** | Límits administratius i altimetria | CC-BY 4.0 |

Els avisos oficials **no es reescriuen, no es recoloren i no se'ls ajusta el
nivell**. Es mostren com els publica AEMET, amb enllaç a l'original.

## Posar-lo en marxa

```bash
npm install
cp .env.example .env.local     # omple AEMET_API_KEY
npm run data:all               # construeix el territori (~35 min, un sol cop)
npm run workers:frequent       # observació, radar i mar
npm run worker:forecast        # predicció (triga; consumeix quota)
npm run dev
```

Sense `data/cache/` el lloc arrenca igualment: surt el territori sencer i cada
buit es diu en veu alta, en comptes de sortir en blanc.

### Comprovacions

```bash
npm run typecheck   # aplicació i scripts, són dos projectes
npm run lint
npm run test        # topònims, astronomia i frases
```

## La restricció que mana

Open-Meteo factura **ubicacions**, no peticions. Refrescar els 3.190 punts amb
cinc models són 15.950 unitats contra un límit diari de 10.000: no hi cap ni un
cop al dia. D'aquí la política de models per nivell, i d'aquí que la qualitat de
l'aire es demani **per cel·la de 0,1°** i no per punt — de 3.190 punts en surten
372 cel·les, una desena part de la quota per exactament la mateixa informació.

`QuotaGuard` talla al 95 % i degrada al 80 %.

## Estat

Fase 1 tancada. El que ve i per quin ordre, a
[`docs/13-full-de-ruta.md`](docs/13-full-de-ruta.md); on som exactament i —el que
més temps estalvia— **les trampes ja descobertes de cada font**, a
[`docs/12-estado-y-continuacion.md`](docs/12-estado-y-continuacion.md). Gairebé
cap font dóna error: donen dades plausibles i equivocades.

Un tast, perquè es vegi de quina mena són:

- El sensor de neu **menteix a l'estiu** i el portal marca la lectura com a bona:
  12 cm a Das el 28 d'agost amb la mínima a 9,3 °C.
- Al registre de platges, `coordenada_x` és la **latitud** i `coordenada_y` la
  longitud, al revés del que diuen els noms. Sense adonar-se'n, totes les
  platges cauen a Somàlia.
- El tilecache públic de RainViewer només arriba al zoom 7. Del 8 endavant
  retorna un PNG que diu «Zoom Level Not Supported» **amb codi 200**.
- `?? 0` sobre una dada que pot faltar converteix una llacuna en un zero mesurat:
  el comptador de dies sense pluja donava 398 al Port de Barcelona, que no té
  pluviòmetre.

## Llicència

**El codi encara no en té**, i mentre no n'hi hagi cap el que val per defecte és
«tots els drets reservats»: ningú el pot reutilitzar legalment. Està pendent de
decidir.

Les dades no són nostres. Són de les fonts citades a dalt i mantenen cadascuna
la seva llicència: si en reutilitzes cap, l'atribució és d'elles.
