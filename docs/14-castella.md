# 14 · El web en castellano

> Empezado el 5 de noviembre de 2026. El orden lo puso el usuario: avisos al móvil y 404 →
> **castellano** → la app para Google Play y App Store, que se hace sobre las dos lenguas.

## Dónde vive

`es.tempscat.cat`, con **las mismas rutas** que `tempscat.cat`. `next.config.ts` reescribe la
dirección a `/ca/…` o `/es/…` según el dominio y las páginas viven en `src/app/[lang]/…`. Por qué
subdominio y no prefijo: en `src/lib/lang.ts`.

Hasta que no quede ni una página con texto en catalán, el castellano lleva `noindex`
(`ES_PUBLIC` en `src/app/[lang]/layout.tsx`).

## Cómo se escribe una página en las dos lenguas

```tsx
import { getLang } from '@/lib/i18n';
import { tr } from '@/lib/lang';

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return { title: tr(lang, 'Platges i mar', 'Playas y mar'), alternates: { canonical: '/mar' } };
}

export default async function Page() {
  const lang = await getLang();
  const t = (ca: string, es: string) => tr(lang, ca, es);
  const trail = [{ nom: t('Catalunya', 'Cataluña'), path: '/' }, { nom: t('Platges', 'Playas'), path: '/mar' }];
  return <JsonLd data={graph(breadcrumbLd(trail, lang))} /> /* … */;
}
```

Reglas, todas aprendidas en las primeras horas:

- **El catalán no puede cambiar ni un byte.** Toda la traducción es aditiva: la cadena catalana
  se queda tal cual como primer argumento de `tr()`. Las pruebas (`npm run test`) y
  `check:coherence` buscan frases catalanas exactas.
- **`getLang()` solo en componentes de servidor.** Un componente síncrono que lo necesite se
  vuelve `async`, o recibe `lang` por props. Los de cliente (`'use client'`) lo reciben siempre
  por props. Las funciones de `src/lib` lo reciben como **último parámetro, `lang: Lang = 'ca'`**,
  para que el código que aún no lo pasa siga escribiendo catalán.
- **Nunca `.map(deName)` ni `.map(comarcaName)`**: con `lang` como segundo parámetro, `map` le
  pasa el índice. TypeScript lo para; la forma buena es `.map((n) => deName(n, lang))`.
- **`metadata` fijo pasa a `generateMetadata()`** cuando lleva texto.
- **`breadcrumbLd(trail, lang)`**: sin el `lang`, el marcado del castellano apunta al dominio
  catalán.
- **Los enlaces internos no cambian**: `href="/radar"` ya es bueno en los dos dominios. Un enlace
  absoluto se hace con `absolute(path, lang)`.
- **El trato es de usted** («consulte», «puede», «su»), equivalente formal del «vós» catalán. Ni
  un «tú» ni un «vosotros».
- **Los topónimos no se traducen.** «Lleida», «Girona», «Val d'Aran», «Empordà». En castellano el
  artículo del nombre va en mayúscula y no se contrae: `placeName()`, `deName(n, 'es')` → «de El
  Prat», `aName(n, 'es')` → «en El Prat». Las comarcas sí contraen: `deComarca(n, 'es')` → «del
  Bages», «de la Anoia». «Cataluña», no «Catalunya», en castellano.
- **Los nombres propios de fuentes y organismos no se traducen**: Meteocat, XEMA, AEMET, Agència
  Catalana de l'Aigua, Protecció Civil, ICGC, Servei Meteorològic de Catalunya, FGC.
- **Las mismas tres reglas de redacción del catalán** (AGENTS.md, «Cómo se escribe lo que lee el
  usuario»): la página no habla de sí misma, registro neutro, sin pullas.
- **Las frases se escriben, no se calcan.** `narrative.ts` y `describe.ts` llevan una plantilla
  propia en castellano, con la gramática del castellano; no se traduce palabra a palabra.
- **Los comentarios del código no se traducen.**

## Glosario

Lo que tiene que salir igual en todo el sitio. Ante la duda, la palabra de AEMET.

| Català | Castellano |
|---|---|
| el temps (a un lloc) | el tiempo (en un lugar) |
| plugim | llovizna |
| pluja feble / moderada / forta | lluvia débil / moderada / fuerte |
| ruixat | chubasco |
| xàfec | aguacero |
| calamarsa | granizo pequeño |
| pedra | granizo |
| tempesta | tormenta |
| nevada, neu | nevada, nieve |
| aiguaneu | aguanieve |
| boira | niebla |
| boirina | neblina |
| calitja | calima |
| gebre, gelada | escarcha, helada |
| serè | despejado |
| ennuvolat, cobert | nuboso, cubierto |
| ratxa | racha |
| tramuntana, mestral, garbí, llevant, marinada | tramontana, mistral, garbí, levante, marinada |
| sensació tèrmica | sensación térmica |
| punt de rosada | punto de rocío |
| humitat relativa | humedad relativa |
| pressió | presión |
| cota de neu | cota de nieve |
| isoterma de zero graus | isoterma de cero grados |
| rànquing | ranking |
| avís groc / taronja / vermell | aviso amarillo / naranja / rojo |
| rècord | récord |
| normal climàtica | normal climática |
| anomalia | anomalía |
| ratxa seca | racha seca |
| onatge, mar de fons | oleaje, mar de fondo |
| plana, arrissada, marejol, maror, forta maror, maregassa | calma, rizada, marejadilla, marejada, fuerte marejada, gruesa (escala Douglas) |
| bandera verda / groga / vermella | bandera verde / amarilla / roja |
| meduses | medusas |
| embassament, pantà | embalse, pantano |
| aforament | aforo (estación de aforo) |
| cabal | caudal |
| sequera | sequía |
| gruix de neu | espesor de nieve |
| pistes, remuntadors | pistas, remontes |
| itinerari | ruta |
| cim, coll, refugi | cima, collado, refugio |
| municipi, nucli, entitat de població, barri | municipio, núcleo, entidad de población, barrio |
| fitxa (d'un lloc) | ficha |
| estació (meteorològica) | estación |
| qualitat de l'aire, pol·len | calidad del aire, polen |
| índex UV | índice UV |
| avui, demà, ahir, aquesta nit | hoy, mañana, ayer, esta noche |
| a la tarda, al vespre, a la matinada | por la tarde, al anochecer, de madrugada |
| predicció, observació | predicción, observación |
| encert (dels models) | acierto |

## Lo que falta

Por orden. Cada punto, en su rama, con su comprobación.

1. ✅ La base: dominio, `[lang]`, `format.ts`, cabecera, pie, buscador, 404.
2. ✅ Los nombres compartidos: avisos, códigos de tiempo, cuándo vale un aviso.
3. Las frases: `narrative.ts`, `describe.ts` y los textos de `src/lib` que acaban en la ficha.
4. La ficha de lugar y sus bloques, que son las 4.293 páginas.
5. Las páginas de sección.
6. Lo legal, los feeds, las imágenes para compartir, el sitemap y `hreflang`.
7. `es.tempscat.cat` en Vercel y en Cloudflare, comprobar que no queda catalán y quitar el
   `noindex`.
