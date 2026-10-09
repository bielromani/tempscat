# 12 — Estado del proyecto y cómo continuar

**Documento de traspaso.** Léelo entero antes de tocar nada: contiene el estado exacto, las
decisiones ya tomadas y —sobre todo— **las trampas que ya nos han costado horas**. Casi todas
son fallos que no dan error: dan datos plausibles y equivocados.

Última actualización: **6 de octubre de 2026**. Todo lo descrito aquí está **publicado en
tempscat.cat**: el rediseño «Cel» en todo el sitio, las páginas con datos sin ISR, el cielo del
titular con la altura real del sol, y el proyecto en el **plan Pro de Vercel**. No hay ninguna
rama ni pull request abierto con trabajo pendiente de fusionar.

> La lista de trampas **más completa y al día** es la sección «Rarezas de las fuentes» de
> `AGENTS.md`, que se carga sola en cada sesión. La de este documento es la de agosto y se
> queda como está; lo nuevo va allí.

---

## Cómo retomar en una conversación nueva

Basta con abrir Claude Code en la carpeta del proyecto y decir:

> Lee `docs/12-estado-y-continuacion.md` y sigue con lo pendiente.

`AGENTS.md` se carga solo en cada sesión y ya contiene las restricciones técnicas duras,
incluido **cómo se trabaja** (rama, `npm run check`, fusión por lotes). Léelo antes de empujar
nada a `main`.

**Cómo se entrega** (acordado con el usuario el 29 de septiembre): cada cambio va a una rama y
a su pull request en `bielromani/tempscat`, con `npm run check` pasado; cuando el CI está en
verde se fusiona a `main` —con `gh pr merge N --merge`— y se le dice. El repositorio no permite
la fusión automática de GitHub. Después de cada fusión, `web.yml` comprueba la web publicada
con `check:coherence` y `check:jsonld` en cuanto Vercel da el despliegue por bueno, y otra vez
cada mañana; se pueden seguir pasando a mano.

---

## Qué es esto

Plataforma meteorológica de Catalunya con cobertura hasta el núcleo de población. La tesis, en
una frase: **no competir por «el tiempo en Barcelona», sino por «el temps a Lilla»** — 4.293
páginas territoriales con observación real, consenso multimodelo y corrección por altitud.

La justificación cuantificada: de las 3.303 entidades publicadas con altitud comparable, el
**29 % está a 100 m o más** del núcleo de su municipio y el **15 % a 200 m o más**. Eso es un
error sistemático de 1,3 °C o superior para 38.341 habitantes, todos los días, en cualquier web
que muestre un único valor por municipio.

Diseño completo en [`docs/`](.). Empieza por [00 — Resumen ejecutivo](00-resumen-ejecutivo.md).

---

## Estado exacto

| | |
|---|---|
| Fase 0 · territorio | ✅ completada y validada |
| Fase 1 · ingesta y páginas | ✅ en producción en **tempscat.cat**, con el rediseño completo |
| Fase 2 · SEO e indexación | ✅ sitemaps, `robots.txt`, canónicas y JSON-LD hechos, y el sitio dado de alta en Search Console; falta mirar qué indexa |
| Fase 4 · verificación de modelos | 🟡 `worker:verify` acumulando desde septiembre; no sirve hasta tener ~60 días |

**Dónde vive cada cosa en producción:**

| | Dónde | Notas |
|---|---|---|
| La web | **Vercel, plan Pro** | desde el 20 sep 2026; ver «La cuenta de Vercel» abajo |
| Los datos vivos | **Cloudflare R2**, leído por `https://dades.tempscat.cat` | dominio propio desde el 29 sep; antes `pub-…r2.dev` |
| La ingesta | GitHub Actions, disparada por un cron de Cloudflare | `cloudflare/scheduler/worker.js` |
| El DNS | Cloudflare | |

**Territorio construido** (`data/build/`, versionado):

- 43 comarcas · 947 municipios · 2.759 entidades singulares · 533 núcleos = **4.293 rutas**
- 6.769 ubicaciones no publican, cada una con su motivo registrado
- 947 + 43 polígonos, 5.424 relaciones de colindancia real, 3.190 puntos de predicción
- 245 estaciones XEMA (189 operativas) · 683 itinerarios señalizados

**Datos vivos:** el inventario al día —qué trozo es cada cosa y por qué está partido— es
`src/lib/shards.ts`. Una lista escrita aquí se quedaría vieja a la primera.

**Medido el 2 de octubre de 2026:** el build genera **29 páginas** y `.next/server/app` pesa
**29 MB** —eran 1.326 páginas y 956 MB—, porque las veinte rutas con datos de ahora se
generan en cada petición (`LIVE_PAGES` en `next.config.ts`) y el CDN de Vercel las guarda
cinco minutos. El CI entero, build incluido, tarda alrededor de un minuto. La ficha de Malgrat
pesa unos 590 kB sin comprimir, y más de la mitad sigue siendo la carga RSC. Hay **cuatro**
`'use client'` (`SiteSearch`, `RadarMap`, `MenuClose` y la página de error) y ninguno cambia
una ficha de lugar.

---

## Hecho en octubre

Todo publicado. Los pull requests, por orden: #4 (1 oct), #6, #7 y #8 (2 oct).

**El rediseño «Cel», publicado (PR #4, 1 oct).** Lo que se describe más abajo, en
«Rediseño "Cel"», salió entero en un solo despliegue, con el PR #5 —que deja de calcular el
campo de lluvia— fusionado dentro.

**Sin copia vieja (PR #6, 2 oct).** El usuario entraba en la ficha de una ciudad y veía la
temperatura y el cielo de hacía horas; al recargar salía bien. Es lo que hace ISR: sirve
primero la copia que tiene, tenga la edad que tenga, y la regenera después. Ahora las veinte
rutas con datos de ahora —fichas de municipio y de núcleo, portada, comarcas, radar, mapas,
avisos, mar, náutica, nieve, montaña, itinerarios, cámaras, estaciones, ránquings, agua, aire
y estado— llevan `dynamic = 'force-dynamic'` y `Vercel-CDN-Cache-Control: max-age=300`, sin
`stale-while-revalidate`: pasados cinco minutos no se sirve la vieja, se vuelve a generar.
Comprobado en producción: la ficha de Barcelona da `MISS` y luego `HIT` con edad cero, y el
navegador recibe `private, no-store`. `/dades`, la lista de itinerarios y los ejes siguen
estáticos. El plazo de memoria de la observación, el radar y los avisos (`cache-store.ts`) baja
de cinco minutos a dos.

**El cielo del titular, con la luz de verdad (PR #6 y #8, 2 oct).** Salía **negro** en sitios
nublados con claridad de sobra. Eran tres defectos y los tres están en `src/lib/sky.ts`:
- La altura del sol no era la real: el día era una fracción entre la salida y la puesta, y al
  ponerse el sol la luz caía a cero de golpe. Ahora `sunAltitude()` la da en grados, también
  bajo el horizonte, y hay crepúsculo civil (−6°), náutico (−12°) y noche (−18°).
- La luz de las nubes se restaba y con poco sol daba negativo. Ahora se multiplica por el
  grosor de la nube y tiene un suelo: cubierto a mediodía 0,83; a la puesta 0,58; media hora
  después 0,43; de noche 0,27.
- El velo de contraste era el mismo a todas las horas. Ahora `contrastVeil` lleva, a cada
  altura, solo la opacidad que hace falta para que el texto blanco pase de 4,5:1.

Y dos cosas más: el cielo se dibuja con **la hora del reloj con minutos** (`localClockHour()`),
no con la hora en punto de la predicción; y **cubierto no es gris** —el primer arreglo lo dejó
de color cemento—: el velo de nubosidad es azul plomo, no tapa del todo el cielo de debajo, el
horizonte es más claro que el cenit y las texturas llevan un tono azulado de día. En pantalla
ancha el velo se aclara a la derecha, donde no hay texto. `npm run test:sky` vuelve a componer
el titular capa a capa; `npm run cels` enseña los dieciocho estados de lado.

**Lo que no se puede cambiar del cielo:** detrás del texto blanco el fondo no puede ser más
claro que un gris medio, así que un día cubierto es azul plomo y no blanco.

**La ficha (PR #7, 2 oct).**
- **Sensación térmica:** al pasar de la lista de lecturas a las baldosas se perdió su fila.
  Vuelve como baldosa propia y en el titular, **solo cuando redondeada es distinta de la
  temperatura** —lo pidió así el usuario—, con la causa cuando se puede comprobar: la humedad
  la sube o el viento la baja. Hoy, sin calor húmedo ni frío con viento, no sale en ninguna.
- **«Text oficial de l'AEMET»**, sin «, en castellà»: en la tarjeta del aviso, en el feed y en
  el calendario. El texto desplegado sigue marcado con `lang="es"`.
- La máxima y la mínima del día cuentan también la lectura de ahora.

## Hecho en septiembre

> Parte de lo que sigue ya no es así y se deja como historia: la columna de 38 rem, el
> `revalidate` de 3.600 y la prueba de frescura de los núcleos los sustituyó lo de octubre.

**Rediseño (15 sep).**
- El titular de cada ficha es el **cielo calculado** del lugar (`src/lib/sky.ts` +
  `LocationHero.tsx`), CSS puro, con el velo del texto calculado según la nubosidad y el brillo.
  Pruebas: `npm run test:sky`; los doce cielos de golpe con `npm run cels`.
- Sistema de diseño en `globals.css` (`.card`, `.card-title`, `.crumbs`, `.page-title`,
  `.page-head`, `.measure`) aplicado a las 24 páginas. Una sola columna de 38 rem; `data-wide`
  en las pocas que necesitan anchura.
- Barra del móvil: «El temps» + buscador + menú (un `<details>`, sin JavaScript).
- Portada que abre con el tiempo de ahora —los extremos del país— en vez de con un índice.

**Avisos.** Manda el más grave y solo se descarta el que no dice nada nuevo
(`src/lib/warning-stack.ts`, `npm run test:warnings`). Las 21 zonas de Meteoalerta se dibujan en
el mapa interactivo (`warnings-zones.json`).

**La cuenta de Vercel (20 sep).** El plan gratuito entero —tempscat más otros tres proyectos
del usuario— se **pausó**: tempscat gastó 29 GB de Fast Origin Transfer (techo 10), 2,1 millones
de escrituras de ISR (techo 200.000) y 90 GB de almacenamiento de despliegues (techo 10). La
causa: **casi cada visita regeneraba la ficha entera**, porque con 4.293 fichas y menos de una
visita diaria por ficha ISR no amortiza nada. Se arregló con:
- el plan **Pro**;
- un `robots.txt` que bloquea 26 recolectores de IA y de SEO y las 6 rutas de imágenes (el 5 de
  octubre se abrió a los asistentes que citan: ver «Robots de IA» arriba);
- `revalidate` de 1800 a **3600** en las fichas: la XEMA llega con 45-65 min de retraso, así
  que media hora reconstruía la página dos veces con la misma lectura.

Resultado medido en los ocho días siguientes: **~$0,30 al día**, unos $9 por ciclo, dentro de
los $20 incluidos y **$0 de extra**. La transferencia de origen pasó de 29 GB a $0,10.

**Forma de trabajar.** `main` es lo publicado. Se trabaja en una rama, se pasa
`npm run check` y se fusiona por lotes; los despliegues de previsualización están apagados en
Vercel. El porqué y los números, en `AGENTS.md`.

**Los correos de «Run failed» (29 sep, PR #1).** Eran tres cosas y ninguna era una avería:
- las cámaras de FGC que a ratos no contestan ya no hacen fallar la ejecución;
- las lecturas del almacén reintentan (`fetchWithRetry`, con `passStatus: [404]`);
- el CI estaba en rojo en `main` **desde el 15 de septiembre** sin que nadie lo viera:
  `test:warnings` leía `data/cache/`, que en GitHub Actions no existe.

De paso, `/estat` ya no borra la hora del último éxito cuando una ejecución falla.

**Credibilidad: que una ficha no se contradiga (29 sep, rama `credibilitat`).** Salió de una
auditoría de la web publicada un día de avisos naranja. `npm run check:coherence`, nuevo, dio
**75 contradicciones en 20 fichas** de producción; con la rama, **0 en 40**. Lo arreglado:
- La frase y el cielo del titular ya no dicen «feble» debajo de un aviso de lluvia o tormenta
  que cubre esas horas (`narrativeFor` recibe los avisos; `test:narrative` lo comprueba).
- El bloque de lluvia y los «dies sense pluja» incluyen lo medido hoy y ayer
  (`src/lib/recent-rain.ts`, `test:rain`). Lilla decía 16,6 mm hoy y «fa més de 45 dies».
- Las fichas de un solo modelo —nueve de cada diez— ya no hablan de «consens».
- La presión se da reducida al nivel del mar (967 hPa en Lilla eran 1.023).
- Contracciones: «de l'ESE», «dels Hostalets», «al Perelló», «Dins de la Conca», y los
  meses con `monthOf()` —el 1 de octubre habría salido «dies de octubre» en todas—.
- Una sola cifra de lugares en todo el sitio (4.250; el 4.293 contaba las comarcas).
- `/estat`, en hora de Madrid, y el mensaje técnico de cada fallo, plegado.

**Frescura (29 sep, lote `frescor`).** Las fichas leen sus trece datos a la vez
(`fichaData()`: de 795 a 350-500 ms en frío) y las de núcleo están en una prueba de 48 h
sin ISR. Qué mirar, en «Lo que falta», punto 0.

**La ficha como producto (29 sep, rama `producte`).** De 11 pantallas de móvil a 5: arriba
y abierto lo que se consulta —cielo, avisos, frase y franjas, próximas horas, 14 días, por
qué el tiempo aquí es distinto—, y el resto en tarjetas plegadas (`Fold`, un `<details>`)
que enseñan su cifra en una línea. Medido a 390 px: Lilla de 9.371 a 4.216 px, Malgrat de
10.017 a 4.629. El HTML pesa lo mismo: lo plegado sigue ahí para el buscador. De paso, en
escritorio con tema claro la barra del web era **texto blanco sobre blanco** fuera del
cielo; ahora cabe dentro. Y la portada abre con el buscador grande, los avisos y el mapa
de temperaturas por comarca, en vez de con un índice y cuatro contadores.

**Rediseño «Cel» (29 sep, misma rama `producte`, PR #4).** El usuario eligió entre dos
maquetas la dirección A: todo el sitio con el color del cielo —azul de noche, tarjetas de
cristal—, un solo tema, marca **tempscat** con logo propio, Inter y los iconos Meteocons.
- **La ficha:** el cielo del lugar a todo el ancho, y debajo dos columnas: el resumen, las
  próximas 24 horas en tira con la salida y la puesta del sol, los 14 días en lista con barra
  de temperaturas, y baldosas de viento, humedad, lluvia, UV, sol, presión, aire y mar. El
  resto, plegado como antes.
- **La portada:** título, buscador y accesos rápidos al lado del mapa; las cuatro capitales
  ahora; la franja de avisos; los extremos; y todas las secciones con su icono.
- **Fuera la lluvia futura**, a petición del usuario: ni en `/radar`, ni en el mapa
  interactivo, ni el bloque «Cap on va la pluja» de la ficha. Y después, en la rama
  `sense-camp-de-pluja`, **tampoco se hace**: `forecast-field.ts` ya no pinta ni publica las
  imágenes de lluvia ni su índice, y se borraron `precipField()`, `src/lib/field.ts` y la
  ruta `/camp/`. El worker sigue, con el mismo nombre, porque también da el viento del mapa
  interactivo; su salida de viento se comprobó idéntica byte a byte antes y después. La
  cuota no cambia (129 unidades al día del anillo, con dos variables igual que con tres);
  lo que se ahorra son escrituras en R2 y tiempo de worker. Detalle en `AGENTS.md`, «El
  futuro del radar».
- `/avisos` deja de ser una pared de bloques naranjas: tarjetas de cristal con el color oficial
  en el borde y en la pastilla.
- **Las 22 páginas de sección**, con la misma composición que la portada (`PageHero`: título,
  respuesta corta, cifras clave y el mapa al lado; cada bloque en una tarjeta; la prosa larga,
  plegada al final). Se hicieron en paralelo por grupos y se revisaron a 390 y 1.280 px, sin
  scroll horizontal en ninguna. De paso: `/senderisme/rutes` de 1.248 a 681 kB, la ficha del
  GR 1 de 1.354 a 363 kB, `/avisos` con un mapa de las zonas de Meteoalerta, el viento de
  vuelta en `/mapa/interactiu` (la hora de ahora) y el favicon, que seguía siendo el de
  «Create Next App».
- **Las clases de `globals.css` van en `@layer components`.** Sin capa ganaban a cualquier
  utilidad de Tailwind (`class="card p-0"` no quitaba el relleno); fuera quedan solo la anchura
  de `main` y el titular del cielo, que sí tienen que ganar al `py-8` del layout.
- Textos: el titular ya no escribe «El temps a els Albans» ni «a les 1 h»; el plugim solo
  «no arriba a mullar el terra» por debajo de 1 mm; un aviso vigente se dice aunque el
  modelo vea la lluvia a otras horas; y la descripción del lugar ya no repite la estación
  que dice el titular.

**Almacén.** `DATA_BASE_URL` = `https://dades.tempscat.cat` en Vercel (los tres entornos), en
GitHub Actions y en `.env.local`. Antes de cambiarlo se comprobó que el dominio nuevo sirve
exactamente lo mismo que `r2.dev`: contenido y ETag idénticos, los mismos 404, `304` en las
peticiones condicionales, y el borde de Cloudflare guarda las imágenes 60 s —lo que se sube con
`max-age=60`— aunque la cabecera que manda hacia abajo diga 14.400: la aplicación no la lee.

### Antes, en agosto

Calidad del aire y polen, radar sin JavaScript, ránquings, comparativa comarcal, cámaras de
montaña, nieve y estaciones de esquí, ficha de estación, calidad del aire medida (XVPCA), campo
de lluvia del modelo como futuro del radar, mapa interactivo con viento de partículas, e
itinerarios con su mapa y su perfil. El detalle de cada uno está en `git log`, y sus trampas en
`AGENTS.md`.

---

## Lo que falta, por orden

**Con fecha, y son del usuario:**

1. **6 de octubre — apagar `r2.dev`.** R2 → bucket → Settings → *Public Development URL* →
   **Disable**, y comprobar la web y `/estat`. Es la única prueba de que nada sigue leyendo la
   dirección vieja: las dos sirven lo mismo, así que desde fuera no se distinguen.
2. **Hacia el 16 de octubre, `credencials.yml` empezará a fallar** avisando de que la clave de
   AEMET caduca el **30 de noviembre**. Es a propósito: 45 días de margen. Se renueva gratis en
   `opendata.aemet.es`, y hay que actualizar `AEMET_API_KEY` y `AEMET_API_KEY_EXPIRES` en
   GitHub. `credencials.yml` no se ha lanzado nunca a mano.
3. **Search Console:** ya está dado de alta (confirmado por el usuario el 3 de octubre). Lo que
   queda es mirar, por tipo de sitemap, cuántas de las fichas entran de verdad en el índice.

**Por mirar después de lo de octubre:**

4. **El cielo al atardecer y de noche, en una ficha real.** De día se ha visto en producción;
   el crepúsculo y la noche solo en la rejilla de `npm run cels`. Si el usuario lo quiere con
   más azul o más luz, los números están en `sky.ts`: el croma y la opacidad del velo de
   nubosidad, y el suelo de la luz de las nubes.
5. **Vercel → Usage, unos días después del 2 de octubre.** Sin ISR, cada visita que no acierta
   el CDN es una invocación. Con el plan Pro no debería notarse, pero no se ha medido. Si
   subiera demasiado, el número que se toca es el `max-age=300` de `next.config.ts`.
6. **Lo que quedó en R2 bajo `field/`** —las imágenes del campo de lluvia que ya no se
   hacen— se puede borrar a mano, **menos `field/voltant.json`**, que es el anillo del viento.

**La decisión grande, pendiente del usuario:**

7. **Sacar las cifras vivas del HTML y pedirlas desde el navegador.** Ya no hace falta para la
   frescura —eso lo arregló quitar ISR—; lo que arreglaría es el **peso**: más de la mitad de
   una ficha es la carga RSC, el mismo contenido escrito otra vez para hidratar. Tiene dos
   precios, y los decide el usuario: rompe la regla de «cero JavaScript en las fichas» y saca
   los números del HTML que lee el buscador.

**Sin decisión pendiente:**

8. **Reescribir los textos** para que el sitio suene a portal profesional. Las reglas de tono
   están en `AGENTS.md`, «Cómo se escribe lo que lee el usuario». En el rediseño se acortaron
   y se plegaron las explicaciones largas de las páginas de sección, pero no se han repasado
   una a una.
9. Menores: `AEMET_API_KEY` sobra en las variables de Vercel (el sitio no la usa; quitarla es
   un ajuste de la cuenta y lo hace el usuario) · el sol del titular puede quedar detrás del
   final de un nombre largo en el móvil, y el velo de contraste no lo cuenta — va con el
   punto 4, porque se mira en el mismo sitio.

**Platges, por tramos (9 de octubre, rama `mar-trams`).** La primera versión de la muestra
(6 oct) no convenció al usuario: «difícil de entender». Se rehízo partiendo de una propuesta
de Gemini que trajo él, quedándose con lo que los datos aguantan:
- **La unidad es el tramo, no la playa.** El modelo de mar tiene 20 puntos; cada uno es una
  tarjeta con su nombre por los municipios de sus playas («Roses i Castelló d'Empúries») y
  todo junto: agua, ola, viento medido en la estación de la orilla, los **tres días** del
  modelo (ola más alta y agua de cada día) y las playas del tramo, con la bandera al lado
  cuando es reciente. Poner una temperatura a cada una de las 230 playas sería fingir 230
  medidas teniendo 20.
- Arriba, la frase, dos cifras con lugar, y el **aviso de fenómenos costeros** de la AEMET si
  lo hay. Fuera de temporada se dice una vez («l'últim parte és del 8 d'octubre») en vez de
  enseñar banderas viejas.
- Atajos a cada costa con anclas (sin script). El mapa solo en escritorio.
- Cada playa conserva su `id` `p-<codi>` (el buscador lleva ahí) y enlaza a la ficha de su
  municipio, que tiene el UV y la predicción.
- **Descartado de la propuesta, y por qué:** mareas (en la costa catalana son unos 20 cm),
  horario de socorristas (no lo publica ninguna fuente), webcams de playa (ninguna con
  licencia para reservirlas), geolocalización «a prop meva» (pediría un componente de
  cliente; se puede hacer después si hace falta) y UV por playa (habría que leer los
  trozos de predicción de once comarcas para una sola página: está en cada ficha).
Y el mismo día, lo que pidió el usuario al verla: **el mapa también en el móvil**; **un
buscador propio** solo de playas y pueblos de costa (`?q=` contra la misma página, sin script, con
`<datalist>` para las sugerencias); y los tramos bien puestos: el punto de delante de Montgat
recogía de Vilassar de Mar a Barcelona y la tarjeta entera salía en el Barcelonès. Ahora cada
punto se parte por la costa de sus playas —dos tarjetas con las mismas cifras del modelo—, el
nombre dice de dónde a dónde va («De Vilassar de Mar a Montgat») y dentro salen todos los
pueblos con sus playas, en vez de «i 5 més».
De la versión del 6 se quedan `articleFirst()` (con prueba en `test:catalan`) y el arreglo
de «1 platges».

**Un solo radar (6 de octubre, rama `radar-unic`).** `/radar` y `/mapa/interactiu` eran dos
caras de lo mismo; ahora `/radar` es el mapa de MapLibre con los controles del radar (la hora en
grande, «Reprodueix les 2 hores», la barra) y las capas Pluja, Temperatura y Vent. Los avisos
van con su interruptor y **arrancan apagados**; desde `/avisos` se llega con `?avisos=1`. El orden,
pedido por el usuario: las tres capas encima del mapa; debajo, la barra, y debajo de la barra la
hora y «Reprodueix». Los atajos a las seis zonas se quitaron el mismo día: el mapa ya se amplía
con los dedos. La ficha de cada lugar enlaza `/radar?lloc=<camino>`, que abre
centrado allí con una aguja. `/mapa/interactiu` redirige a `/radar`. Arreglado de paso: **la
lluvia no salía en el móvil hasta hacer zoom** — el radar iba como fuente de teselas con
`minzoom: 7` y un teléfono abre al 6,3; ahora cada tesela es una fuente `image`. Fuera los
bloques «D'on surt…» de las dos páginas y «Cercar un lloc» del menú: `/cerca` sigue existiendo
porque es adonde va el formulario del buscador al pulsar Intro.

**Menos correos (5 de octubre, rama `menys-correus`).** Un worker que falla ya no sale en rojo
—y no manda correo— mientras el dato publicado esté dentro de su límite; cuando caduca, avisa
una vez y recuerda cada 24 horas. Las máquinas, fijadas en `ubuntu-24.04`. **Pendiente**:
probar Ubuntu 26 a propósito en una rama antes de mover la versión.

**Robots de IA (5 de octubre, rama `robots-ia`).** `robots.txt` deja entrar a los asistentes que
leen la página en el momento de la pregunta y la citan con enlace —búsqueda de ChatGPT, Claude,
Perplexity— y a `Google-Extended` y `Applebot-Extended`, que son las señales para Gemini y
Apple Intelligence (Google no separa entrenamiento y respuesta). Siguen bloqueados los de
entrenamiento masivo (`GPTBot`, `ClaudeBot`, `CCBot`, `Bytespider`…) y los de SEO. **Pendiente:
mirar Vercel → Usage hacia el 12 de octubre**; si uno se dispara, se le cierra a él.

**Compartir y errores (5 de octubre, rama `compartir-i-errors`).**
- Imagen para compartir en cada ficha, comarca y en el resto del web: nombre, comarca y
  altitud, sin ningún número de ahora (`src/lib/og.tsx`). Antes no salía ninguna.
- Página de «no trobada» en catalán, con el buscador y los accesos rápidos; antes era la de
  Next en inglés. Y página de error del servidor (`error.tsx`).
- `manifest.ts` e iconos en `public/icons/app/`: el web se puede añadir a la pantalla de inicio.
- La descripción de las fichas decía «7 dies»; la predicción es de 14.

**El móvil y las páginas legales (4 de octubre, rama `mobil-i-legal`).**
- Las sugerencias del buscador salían 44 px fuera de la pantalla por la izquierda: se
  alineaban por la derecha con el cuadro, que acaba antes del botón del menú. Por debajo de
  `sm` se colocan contra la fila de la cabecera, de borde a borde con 16 px de margen.
- El menú del móvil se quedaba abierto al pulsar un enlace: `MenuClose` lo cierra.
- Fuera el enlace a GitHub del pie. El repositorio sigue público: hacerlo privado dejaría la
  ingesta sin minutos de Actions (~450 al día).
- `/avis-legal` y `/privacitat`, enlazadas desde el pie. El titular es Biel Romaní, con su
  correo (`src/lib/owner.ts`). Sin NIF ni dirección: solo los exige la LSSI con actividad
  económica, y el día que haya publicidad hay que añadirlos.

**El cielo en el móvil (3 de octubre, rama `cel-mobil`).** El usuario lo vio en el teléfono:
una noche con pocas nubes salía negra y sin luna, y de día las nubes lo tapaban todo y no se
veía que se movieran. Eran cuatro cosas:
- Las texturas de nubes tenían **tamaño fijo de escritorio** —la cercana, 1.900 px— y cada una
  tiene un solo hueco: en 375 px se veía un trozo de banco de nubes continuo durante casi todo
  el ciclo. Por debajo de 640 px van a la mitad, y **el primer fotograma pone el hueco de cada
  capa donde está el sol o la luna** (`.cel-drift` en `globals.css`, con `--g`, el sitio del
  hueco medido sobre el alfa). Así se ve el cielo al entrar y luego las nubes pasando.
- La luna y el sol iban **debajo de las tres capas de nubes**; ahora van encima de los
  filamentos y debajo de los cúmulos, y la luna sale hasta el 85 % de nubosidad.
- De noche el cielo era casi negro (L 17 %) y las nubes más oscuras que él. El cielo de noche
  es ahora azul marino y las nubes, plateadas según la fase de la luna.
- **El velo de contraste era gris pizarra** y de día tapa más de la mitad. Ahora es azul de
  cielo con luz, el oscuro de antes con poca luz, y se apaga con lluvia y tormenta. Cada capa
  de nubes entra más tarde y más floja, así que un «mig ennuvolat» enseña medio cielo.

El texto sigue pasando de 4,5:1 en el peor caso (`test:sky`, que ahora lee el color del velo
de cada cielo en vez de tenerlo copiado). Lo que no se puede: un mediodía con nubes sigue
siendo un azul más profundo que el cielo de verdad, porque el texto blanco lo exige.

**Cerrado el 2 de octubre, rama `neteja`:** los iconos de las 24 horas, de la tabla de 48 y
de los 14 días ya no dicen «Pluja feble» en el `alt` bajo un aviso (`warnedIconLabel()`,
con prueba en `test:narrative`); `check:coherence` y `check:jsonld` los lanza `web.yml`; el
tipo `'forecast'` de los marcos y la rama de imagen única de `InteractiveMap` ya no existen;
y `data/cache/` queda fuera del trazado de ficheros (`turbopackIgnore` en `cache-store.ts` y
`outputFileTracingExcludes`).

**Cerrado desde la versión anterior de este documento:** la prueba de frescura de los núcleos
(extendida a todas las páginas con datos), Pro o gratuito (Pro), pregenerar menos en el build
(29 páginas), revisar a ojo las fichas de detalle, el viento del mapa interactivo, la
descripción que prometía «consens multimodel» y la antigüedad de `/estat` en hora de Madrid.

**Externo, no es nuestro:** la XVPCA no publica días completos desde el 24 de septiembre, y
AEMET se cae a ratos (el 23 de septiembre, 16 ejecuciones en rojo). Esos correos siguen
llegando a propósito.

---

## Hacia dónde va

Los pasos a seguir, en orden y con la decisión técnica de cada uno ya tomada,
están en **[13 — Hoja de ruta](13-full-de-ruta.md)**: qué cabe con la
arquitectura de hoy, qué necesita fuentes nuevas —con las cinco ya verificadas
contra la API real—, qué va en su propia ruta porque llevaría JavaScript, y qué
se descarta y por qué.

Este documento sigue siendo el que dice **dónde estamos**; ese dice **hacia
dónde**.

---

## Trampas ya descubiertas

Esta es la parte que más tiempo ahorra. **Todas son reales, todas costaron encontrarlas.**

### Cuotas de Open-Meteo

- **Factura datos, no peticiones**: `peso = max(1, variables/10) × max(1, días/14) × ubicaciones`.
  El multi-punto abarata latencia y conexiones, **no cuota**.
- **Cuatro techos simultáneos**: 600/min, 5.000/hora, 10.000/día y **300.000/mes** (= 9.677/día,
  más apretado que el diario).
- **El que salta primero en un refresco masivo es el horario**, y su síntoma engaña: los lotes
  fallan como si fuera un corte de red y se reintentan seis veces sin éxito. El mensaje real solo
  aparece pidiendo a mano: `429 Hourly API request limit exceeded`.
- Si algo queda sin datos: `npm run worker:forecast -- --tiers=C --fill` pide **solo lo que
  falta**. Recuperar 161 puntos costó 306 unidades frente a 2.206 de relanzar el nivel.

### Formatos y respuestas raras

- **Open-Meteo devuelve `nan` sin comillas** cuando un punto cae fuera del dominio de un modelo.
  No es JSON válido: hay que sanear el texto antes de parsear o se pierde el lote entero.
- **`icon_d2` no cubre Catalunya.** Su dominio es Alemania y los Alpes. Devuelve serie vacía.
- **AROME-HD solo llega a ~48 h.** Como único modelo deja los días 3 a 7 en blanco.
- **AEMET sirve los avisos como un tar** de XML CAP, en ISO-8859-15, y en **dos saltos**: la
  primera petición devuelve una URL temporal.
- **El área de AEMET para Catalunya es la 69.** No está documentada en ningún sitio legible.
- **`tar` en Windows interpreta `C:/...` como host remoto** y falla en silencio. Por eso hay un
  lector de tar propio en `scripts/lib/tar.ts`.

### Socrata y la XEMA

- **`ORDER BY valor` tarda 110 s y expira**: no hay índice en esa columna. Los agregados
  (`max`, `avg`) sí van rápidos, pero no devuelven la fecha del extremo. Por eso el histórico se
  descarga entero y se calcula en local.
- **El dataset semihorario `nzvn-apee` no sirve para récords** (>120 s por consulta). Usa
  **`7bvh-jvq2`**, ya agregado por día: la misma pregunta en menos de un segundo.
- **`codi_estat` viene vacío en los datos recientes.** Filtrar por `'V'` deja la web sin ningún
  dato actual. Se etiquetan como provisionales.
- **El retraso de la XEMA es de 45 a 65 minutos**, variable. Nunca presentes la lectura como si
  fuera de ahora.
- **`9aju-tpwc` trae dos filas basura**: `999998` y `999999`.
- **El Nomenclàtor es de 2021 y dice 42 comarcas. Son 43** desde el Lluçanès (2023). La comarca
  la manda `wpyq-we8x`.

### RainViewer

- **El tilecache público solo llega al zoom 7.** Del 8 en adelante devuelve un PNG que dice
  «Zoom Level Not Supported» **con código 200 y tipo `image/png`**. No falla nada: se descarga, se
  guarda y se pinta. Se detectó porque dos teselas contiguas salían byte a byte idénticas — y
  porque la web mostraba el cartel en grande. El worker comprueba el tamaño y aborta.
- Con teselas de **512 px** el zoom 7 da la densidad de píxeles del 8: cuatro teselas cubren
  Catalunya a unos 460 m/px, por encima de la resolución nativa del radar (~1 km).
- La paleta del PNG **cambia de tesela a tesela** (son PNG indexados y cuantizados), así que no se
  puede extraer una escala de intensidad fija del propio fichero. Por eso la página no publica una
  leyenda numérica en dBZ: sería inventada.

### AEMET y los avisos

- **Solo publica en castellano y en inglés.** Los CAP del área 69 traen `es-ES` y `en-GB` y
  nada más; no hay versión catalana que pedir. La tarjeta se escribe desde los códigos
  —nivel, fenómeno, zona, ventana, umbral— y el texto oficial va aparte, etiquetado y en su
  idioma. Tablas en `src/lib/warning-labels.ts`. Lo natural sería tomar los avisos del
  **Meteocat**, que los emite en catalán: hace falta pedirles una clave.
- **`phenomenon` es el código, no el nombre.** `/avisos` publicó «de nivell groc per at».
- **Un fichero CAP por día y por zona.** Tres días de ola de calor son tres avisos idénticos
  salvo la fecha, y salían tres tarjetas seguidas. `groupWarnings()` los junta por fenómeno,
  nivel y zona, y nunca por menos: un día que suba a naranja va en su propia tarjeta.
- El registro de playas trae el motivo de la bandera **tecleado a mano**: había `MEDUSES` en
  mayúsculas y `Medusas` en castellano. Lista cerrada de seis valores, normalizada en
  `flagReasonText()`.
- Los nombres de la ACA llevan la etiqueta del tipo de estación delante, y seis llevan **dos**:
  `Aforament - Qualitat - <lugar>`. Y seis aforos están *en* el embalse más cercano, así que el
  mismo nombre salía dos veces bajo dos títulos distintos.

### Estaciones de esquí de FGC

- **El `limit` de la API tiene el techo en cien y no lo dice.** `pistes-desqui` tiene 181 filas:
  devuelve un 200 con cien y el `total_count` a 181. Sin paginar, La Molina pasaba de 66 pistas a
  18 y su desnivel de 1.654–2.530 a 1.654–2.138 m.
- **El tipo de pista llega de dos formas en el mismo campo**: «Pista» en 104 filas y la clave del
  enumerado, `ski_slope`, en 26. Filtrando por «Pista», Vallter se quedaba con 1 pista de 14.
- **`last_update` dice `+00:00` y es hora local de Madrid.** Un comunicado de las 09:13 quedaba
  media hora en el futuro. Leído como UTC, todo comunicado parece dos horas más fresco.
- **Nada de presión ni de velocidad de viento.** La presión viene reducida al nivel del mar y una
  de las nueve estaciones da 1.056,6 hPa. El `VentActual` de Boí Taüll estuvo clavado en 16,1
  media hora siendo mayor que su propio máximo, y ningún fichero declara la unidad.
- **Y nada de riesgo de aludes.** El campo existe y el comunicado de Espot del 8 de abril seguía
  diciendo «3 - Marcat» cinco meses después. El boletín oficial es el del ICGC con el Meteocat.
- **Tres de los seis comunicados llevaban semanas o meses parados.** El contenido variable —nieve,
  porcentajes, cielo— se retira a las 48 h; el abierto/cerrado y el catálogo de pistas se quedan,
  porque el primero sigue siendo cierto y el segundo no caduca.

### Cámaras de FGC

- **El catálogo dice 30 y son 24 las que se pueden publicar, y ninguna de las seis da error.**
  `is_active: 1` en las treinta. Cinco apuntan a `api.pirineu365.cat`, que redirige a
  `statics.3cat.cat`: la imagen es de la CCMA, no de FGC, así que la CC-BY del conjunto no la
  cubre — el conjunto solo la enlaza. La sexta es un reproductor de `webtv.feratel.com` y
  devuelve 404.
- **Cinco de las treinta traen la coordenada inventada.** Tres dan `40.3298, -3.7793` —el centro
  de la península, a 345 km del punto publicado más cercano— y dos de Vallter llevan la longitud
  a cero, que cae en Francia a 59 km. El filtro es la ubicación publicada más cercana: si está a
  más de 20 km, no hay coordenada. Vallter se queda sin ninguna cámara colocada.
- **Y cinco llevan horas o meses paradas, sirviendo el mismo fotograma con un 200.** Una de Boí
  Taüll servía el 2 de septiembre la imagen del 10 de abril. Es la trampa de la bandera de playa
  otra vez: cada imagen viaja con su hora de captura y no se enseña ninguna de más de seis horas.
- **En Roundshot, `og:updated_time` es la hora en que se ha generado la página**, no la de la
  fotografía: las doce cámaras devolvían el mismo segundo. Y el `Last-Modified` de la imagen
  **falta justo en las paradas**, que son las que más importa datar. La hora buena está en la
  ruta del fichero al que redirige —`…/2026-09-02/15-40-00/…`— y es **hora local de Madrid**. El
  worker lo comprueba cada vuelta contra el `Last-Modified` de las que sí lo traen.
- **Cuatro de las veinticuatro traen basura antes de un marcador JPEG** —«608 extraneous bytes
  before marker 0xfe»— y con las opciones de serie de sharp eso es un error, no un aviso: la
  cámara se quedaba fuera por una imagen que cualquier navegador pinta. Va con
  `failOn: 'truncated'`, que sigue rechazando un fichero cortado por la mitad.
- **El fallo habitual no es que la cámara se apague: es bajar el fotograma mientras el proveedor
  lo escribe** y recibirlo cortado. Si eso pasa se conserva la ficha de la vuelta anterior — con
  su hora, así que si de verdad ha dejado de mandar el reloj lo dice igual.

### Calidad del aire

- **Contador aparte del de predicción**, verificado. Es lo que hace viable el bloque sin quitar
  ningún modelo.
- **CAMS trabaja a 0,1°**, así que pedir un punto por ubicación paga diez veces por el mismo
  número interpolado. La unidad es la celda (`src/lib/air-grid.ts`): 372 en vez de 3.190.
- La clave de celda se construye con `toFixed(1)`: la aritmética de coma flotante devuelve
  `41.30000000000001` y sin fijar decimales eso son dos celdas distintas para el mismo sitio.
- **El AQI europeo es el peor de sus subíndices, no una media.** Sin decir cuál manda, el número
  no sirve para decidir nada: un 62 por ozono en julio no se parece a un 62 por NO₂ en hora punta.
- **Los umbrales de polen no son los mismos para todas las especies.** 30 granos de gramínea son
  muchos y 30 de olivo no son casi nada. Una escala única sería un error de bulto.

### Catalán

- **El artículo forma parte del topónimo y se contrae con la preposición.** «de el Prat» y «a el
  Prat» estuvieron publicados. Se arregla con `deName()` y `aName()` de `src/lib/format.ts`.
- **Los meses también**: «al llarg de agost» estuvo publicado un rato. `monthOf()`.
- **`Intl` no da la alternancia `de` / `d'`** de «31 d'agost» y «1 de setembre» con ninguna
  combinación de opciones. Los nombres de mes van a mano, y es por esto.

### JavaScript y fechas

- **`toLocaleString('sv-SE')` devuelve `2026-08-31 10:30` con espacio**, y las series de
  Open-Meteo usan `T`. Sin unificarlos, la búsqueda de «la hora actual» no encuentra nada y cae
  al primer elemento — las 00:00, con UV cero y cielo despejado. No da error: da datos
  plausibles y falsos. Ahora vive en un solo sitio: `localNowHour()` en `src/lib/weather.ts`.
- **Las horas locales no se pasan por `new Date()` para leerlas.** Las series ya vienen en hora
  de Madrid; construir un `Date` las reinterpreta en la zona del servidor, que en Vercel es UTC,
  y las 08:00 se mostrarían como las 06:00. `src/lib/format.ts` trocea la cadena.
- **`Date.now()` dentro de un componente hace saltar `react-hooks/purity`**, y el lint lo marca
  como error, no como aviso. La hora del reloj es un dato y se calcula en la capa de datos: de ahí
  salieron `dayFraction` en `Astronomy` y `ageMin` en `radar()`.
- **Node 24 ejecuta TypeScript borrando tipos, sin transformarlos.** Nada de propiedades de
  parámetro (`constructor(private x)`), `enum`, `namespace` ni decoradores.
- **Los imports relativos de `scripts/` necesitan extensión `.ts` explícita**, que el tsconfig
  de Next no admite. Por eso hay dos proyectos de TypeScript.

### Meteorología

- **En la tabla WMO, el número no es la severidad.** La niebla es el 45 y el cielo cubierto el 3:
  quedarse con el máximo numérico pinta niebla en días de 32 °C.
- **Entre modelos, el más severo no es el consenso.** Si uno de tres ve niebla, quedarse con él
  hace la predicción sistemáticamente más sombría que cualquiera de los modelos por separado.
  Se usa mayoría, con severidad solo como desempate.
- **Una hora de niebla al alba no define un día soleado**, pero una hora de tormenta sí define el
  día. Por eso el resumen diario tiene dos reglas, no una.
- **La cota de nieve no es la isocero.** Con precipitación, la fusión enfría la capa que
  atraviesan los copos y la nieve cuaja 200–300 m por debajo.
- **La media de direcciones se hace con vectores.** La media aritmética de 350° y 10° da 180°,
  que es el viento contrario.
- **La precipitación no se promedia.** Promediar 20 mm y 0 mm da 10 mm, un valor que ningún
  modelo considera probable. Se usa mediana de los que dan lluvia, y probabilidad aparte.
- **La presión de la XEMA (código 34) es de estación, no reducida al nivel del mar.** Compararla
  con `pressure_msl` mete un sesgo proporcional a la altitud.

### Diseño

- **Un panel que se pinta con la escala de temperatura no puede coger los textos de los tokens
  del tema.** En modo oscuro salía gris claro sobre beige claro. Toda la tinta del panel deriva
  ahora del propio dato.
- **La rampa de croma tiene que ser no lineal.** Con rampa lineal, el tramo 15–22 °C —donde cae
  la mayoría de temperaturas catalanas— quedaba incoloro y una lista de municipios se veía toda
  igual.

---

## Decisiones tomadas que no se vuelven a discutir

- **No se usa la API directa de Meteocat.** Su plan gratuito prohíbe redistribuir. Los mismos
  datos XEMA están en el portal de datos abiertos con licencia que sí lo permite.
- **Open-Meteo gratuito es no comercial.** El día que haya publicidad hay que contratar el plan
  de pago **antes**, no después.
- **Sin coordenada fiable no hay página.** 4.293 páginas correctas antes que 11.019 con inventos.
- **No se llama «limítrofe» a lo que solo está cerca.** `adjacent` sale de las líneas de frontera
  del ICGC; la proximidad es `nearest` y se etiqueta distinto.
- **Se dice de dónde viene cada número**: estación, distancia, desnivel y hora de la lectura.
- **No se promete precisión no demostrada.** Hasta la verificación de la fase 4, los modelos
  pesan igual y la página lo dice.
- **Los avisos oficiales no se reescriben ni se recolorean.** Los verdes no se muestran.
- **La astronomía se calcula, no se pide.** Cuota cero y da lo que ninguna API ofrece.
- **Cero JavaScript propio en las páginas territoriales.** El mapa que se mueve vive en su
  propia dirección, `/radar`, y `/mapa` sigue siendo un SVG de servidor. Esta regla
  es la que la decisión 7 de «Lo que falta» pondría en cuestión.
- **Un solo tema, el del cielo.** No hay tema claro ni oscuro (rediseño «Cel», octubre de 2026).
- **El radar no enseña futuro.** Pasado y presente; dónde lloverá lo dicen las horas de la
  ficha, en milímetros. El campo de lluvia del modelo ya no se calcula.
- **Las páginas con datos de ahora no usan ISR** y no se guardan más de cinco minutos.
- **La sensación térmica no se enseña cuando coincide con la temperatura.**
- **El rótulo del texto de AEMET es «Text oficial de l'AEMET»**, sin decir el idioma.

---

## Comandos

La lista completa y al día está en `AGENTS.md`, sección «Comandos». Los dos que más importan:

```bash
npm run check    # la puerta de antes de empujar: workflows, lockfile, tipos, lint y pruebas
npm run build    # desde el ordenador del trabajo falla por el proxy al leer R2; lo hace el CI
```

---

## Credenciales

`.env.local` (ignorado por git; la plantilla es `.env.example`):

- **`AEMET_API_KEY`** — configurada. **Caduca el 30 de noviembre de 2026**, que es lo que dice
  `AEMET_API_KEY_EXPIRES` y lo que enseña `/estat`. Se renueva gratis y al instante en
  `opendata.aemet.es`. `credencials.yml` avisa con 45 días de margen.
- **`R2_*` y `DATA_BASE_URL`** — las cuatro de escritura del almacén y la de lectura, que
  desde el 29 de septiembre es `https://dades.tempscat.cat`.
- `SOCRATA_APP_TOKEN` — opcional, sube el throughput del portal de datos abiertos.
- `OPENWEATHER_API_KEY` — opcional, solo para teselas del mapa. Sin pedir todavía.

---

## Riesgos abiertos

| Riesgo | Estado |
|---|---|
| `forecast.json` de 42 MB en el bundle de Vercel | **Resuelto.** 43 trozos por comarca; el mayor, 2 MB |
| Discrepancia de hidratación en producción por un `<title>` de SVG con tres hijos | **Resuelto** en `WindRose`. React descartaba el HTML servido y rehacía el árbol en el navegador, sin dar ningún error visible |
| 167 KB de runtime de React y Next en cada página territorial | **Sin resolver, y probablemente sin arreglo dentro del App Router.** No lo pone ningún componente nuestro: los `'use client'` que hay no tocan el contenido de las fichas. Medido en `AGENTS.md` |
| Una ficha pesa 570–700 kB y cada despliegue ~1 GB | **Abierto.** El 62 % es carga RSC. Ver «Lo que falta», 4 y 5 |
| La ficha se sirve caducada a quien la visita | **Abierto.** Es cómo funciona ISR con pocas visitas por página. Ver «Lo que falta», 4 |
| El plan gratuito de Vercel no cabe | **Mitigado** con el plan Pro y el arreglo del 20 de septiembre. Decisión el ~20 de octubre |
| Sin base de datos: todo son ficheros | Deliberado. Migración escrita en `db/migrations/001` |
| El token de AEMET caduca cada 90 días | **Automatizado:** `credencials.yml` falla con 45 días de margen, y `/estat` enseña la fecha |
| Indexación (fase 2) | Sitemaps partidos por tipo, JSON-LD comprobado con `check:jsonld` y Search Console dado de alta. El riesgo real sigue siendo el *index bloat* |
| Sin verificación de modelos | **En marcha:** `worker:verify` acumula desde septiembre. Sirve a partir de ~60 días |
