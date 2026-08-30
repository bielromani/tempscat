# 01 — Fuentes de datos

Todo lo de este documento está **verificado con peticiones reales** el 30 de agosto de 2026,
no copiado de documentación. Donde algo no se pudo comprobar, se dice explícitamente.

---

## A. Observación real — XEMA vía datos abiertos ⭐ la pieza clave

**Portal:** `analisi.transparenciacatalunya.cat` (Socrata / SODA 2.0)
**API key:** no necesaria (recomendable un *app token* gratuito para subir el throughput)

| Dataset | ID | Filas | Contenido |
|---|---|---|---|
| Datos meteorológicos de la XEMA | `nzvn-apee` | cientos de millones | Lecturas semihorarias, histórico desde 1988 |
| Metadatos de estaciones | `yqwd-vj5e` | 245 | Nombre, lat/lon, altitud, municipio, comarca, estado |
| Metadatos de variables | `4fb2-n3yi` | ~90 | Código, nombre, unidad, tipo |

**Latencia real medida:** última lectura disponible `2026-08-30T20:30 UTC`, portal actualizado
a las `21:16 UTC`. Es decir, **~45 minutos de retraso** con cadencia semihoraria. Suficiente
para "condiciones actuales".

Esquema de una lectura:

```json
{ "id":"X6353003171300", "codi_estacio":"X6", "codi_variable":"35",
  "data_lectura":"2017-03-30T13:00:00.000", "valor_lectura":"0", "codi_estat":"V" }
```

`codi_estat` es el control de calidad: `V` = validado, `T` = pendiente de validar. **Hay que
filtrarlo o etiquetarlo**; publicar datos `T` como si fueran definitivos es un error de
credibilidad que se paga caro.

Consulta incremental (el patrón que usará el worker de ingesta):

```
GET /resource/nzvn-apee.json
    ?$where=data_lectura > '2026-08-30T20:00:00'
    &$order=data_lectura
    &$limit=50000
```

### Por qué esta vía y no la API oficial de Meteocat

La API REST oficial (`api.meteo.cat`) tiene plan gratuito para ciudadanos, estudiantes,
investigación y administración. Pero sus condiciones de uso incluyen literalmente la
obligación de no difundir a terceros, ni total ni parcialmente, la información recibida del
SMC.

Una web pública es exactamente eso. **El plan gratuito es incompatible con este proyecto.**

Planes profesionales (por familia de datos; XEMA, XDDE y Predicción se contratan por separado):

| Plan | Llamadas/mes | Precio |
|---|---|---|
| Pla 1.500 | hasta 1.500 | 67,14 €/mes |
| Pla 8.000 | 1.500–8.000 | 73,14 €/mes |
| Pla 20.000 | 8.000–20.000 | 79,12 €/mes |
| Pla 100.000 | 20.000–100.000 | 91,07 €/mes |
| Premium | hasta 5.000.000 | 305,72 €/mes |

Límite técnico 1.000 peticiones/segundo; la cuota se reinicia el día 1 de cada mes a las 00:00
UTC; el exceso devuelve `429`. La documentación exige además consumo desde servidor con caché,
nunca desde el cliente.

**Decisión:** arrancamos con el portal de datos abiertos. Cuando el proyecto monetice,
contratar `Predicció` + `XDDE` en Pla 20.000 (~158 €/mes) añadiría predicción oficial comarcal
y rayos en tiempo real, que sí son exclusivos de la API de pago.

---

## B. Predicción — Open-Meteo ⭐ el caballo de batalla

**Endpoint:** `api.open-meteo.com/v1/forecast` — sin API key.

### Modelos verificados sobre Catalunya

| Modelo | Resolución | Cobertura CAT | Uso |
|---|---|---|---|
| `meteofrance_arome_france_hd` | 1,5 km | ✅ | Referencia a corto plazo (0–48 h) |
| `knmi_harmonie_arome_europe` | ~2 km | ✅ | Segunda opinión de alta resolución |
| `ecmwf_ifs025` | 25 km | ✅ | Referencia a medio plazo (2–10 d) |
| `gfs_seamless` | 13–25 km | ✅ | Tercera opinión, estable |
| `icon_eu` | 7 km | ✅ | Cuarta opinión europea |
| `icon_d2` | 2 km | ❌ **no cubre Catalunya** | descartado |

> `icon_d2` devolvió serie vacía en Montblanc: su dominio es Alemania y los Alpes. Es un error
> habitual asumir que sirve para Catalunya. No sirve.

### El hallazgo que hace viable el coste: peticiones multi-punto

Open-Meteo acepta listas de coordenadas en una sola petición. **Probado con 200 puntos:
devuelve 200 objetos correctos en una única llamada.**

```
?latitude=41.376,41.383,42.30,41.12&longitude=1.161,2.177,1.53,1.24
```

Esto reduce drásticamente el número de conexiones HTTP:

| Enfoque | Peticiones HTTP por refresco completo |
|---|---|
| Ingenuo (1 punto = 1 petición) | ~4.900 |
| Multi-punto en lotes de 200 | ~25 |
| Multi-punto + deduplicación de puntos representativos | **~8** |

Pero **cuidado con confundir peticiones con cuota**, que es el error que casi cometemos aquí: →

> ⚠️ **Confirmado en la práctica, no solo en la letra pequeña.** Open-Meteo no cuenta
> peticiones: cuenta **ubicaciones**. Al construir el territorio nos devolvió un `429` real
> pidiendo altitudes en lotes de 100 puntos a ritmo libre — cada lote consume como 100 llamadas
> contra el límite de 600/minuto. Con ~11 s entre lotes se pasa sin incidencias.
>
> Consecuencia para el diseño: el multi-punto **no abarata la cuota**, abarata la latencia y el
> número de conexiones. El presupuesto real hay que calcularlo en ubicaciones × variables ×
> días. Con 1.500 puntos representativos y 5 modelos, un refresco completo consume del orden de
> 7.500 unidades; a 4 refrescos diarios son ~30.000/día contra un límite de 10.000. **No cabe en
> el tier gratuito si se refresca todo el territorio 4 veces al día.**
>
> Mitigación, por orden: refrescar por niveles (los municipios grandes cada 3 h, las entidades
> pequeñas cada 12 h), reducir el número de modelos por punto según su nivel, y pasar al plan de
> pago cuando el proyecto monetice — que es en cualquier caso obligatorio por licencia.

### APIs hermanas (todas verificadas, HTTP 200)

| API | Host | Aporta |
|---|---|---|
| Ensemble | `ensemble-api.open-meteo.com` | Bandas de incertidumbre, probabilidades reales |
| Calidad del aire | `air-quality-api.open-meteo.com` | PM2.5, PM10, NO₂, O₃, AQI europeo, polen |
| Marine | `marine-api.open-meteo.com` | Oleaje, swell, periodo — vertical playas y surf |
| Histórico (ERA5) | `archive-api.open-meteo.com` | Climatología 1940–hoy para comparativas |
| Geocoding | `geocoding-api.open-meteo.com` | No lo usaremos: nuestro nomenclátor es mejor |

**Licencia:** CC-BY 4.0, **uso no comercial** en el tier gratuito. Atribución obligatoria. Si
el sitio monetiza (publicidad incluida), hay que pasar a plan de pago. Ver doc 09.

---

## C. Territorio — Nomenclátor estadístico ⭐ el foso defensivo

**Dataset:** `tssr-jqsj` — *Nomenclàtor estadístic d'entitats i nuclis de població de
Catalunya*. 11.019 filas, edición 2021 (la única publicada en el portal).

Jerarquía verificada con consultas de agregación reales:

| Nivel | Filas | Criterio SoQL |
|---|---|---|
| Municipio | **947** | `entitat_colectiva='00' AND entitat_singular='00'` |
| Entidad singular | **3.903** | `entitat_singular!='00' AND nucli_poblacio='00'` |
| Núcleo y diseminado | **6.158** | `nucli_poblacio!='00'` |

Y 42 comarcas distintas. **Ojo: hoy son 43.** El Lluçanès se creó en 2023 segregando
municipios de Osona, el Berguedà y el Bages, y esta edición del Nomenclàtor es de 2021, así
que no lo conoce. La comarca la manda el dataset `wpyq-we8x`, que sí está al día.

Cada fila trae `codi_ine`, `codi_13` (código jerárquico de 13 dígitos), nombre normalizado,
municipio, comarca y población desglosada por sexo. El `codi_13` codifica el árbol entero:

```
4308620002201
└─┬──┘└┘└┘│└┘
  │   │  │ │ └── núcleo de población (01);  99 = diseminado
  │   │  │ └──── dígito de control (2)
  │   │  └────── entidad singular (02 → Lilla)
  │   └───────── entidad colectiva (00)
  └───────────── municipio, INE + dígito de control (430862 → Montblanc)
```

Salida real de la consulta para Montblanc:

```
4308620000000  Montblanc                        7433   ← municipio
4308620001700  Guàrdia dels Prats, la            203   ← entidad singular
4308620001701  Guàrdia dels Prats, la            157   ← núcleo
4308620001799  Disseminat de la Guàrdia...        46   ← diseminado
4308620002200  Lilla                              96
4308620002201  Lilla                              92
4308620002299  Disseminat de Lilla                 4
4308620003800  Montblanc                        7014
4308620004300  Pinetell, el                        7
4308620005600  Prenafeta                          64
...
```

Es exactamente el nivel de detalle pedido.

### El problema de las coordenadas y su solución

**El nomenclátor no trae lat/lon.** Verificado: el dataset `byd8-nf5f` (Unitats poblacionals)
tiene los 11.007 códigos pero **ninguna columna geométrica** — sus únicas columnas son códigos
y nombres.

Fuentes de geocodificación, en orden de preferencia:

1. **ICGC "Noms geogràfics" v1.1** — CSV oficial delimitado por `;` con coordenadas UTM
   ETRS89, descargable de `datacloud.ide.cat`. Es el nomenclátor oficial de toponimia mayor de
   Catalunya. **Fuente primaria.**
2. **`wpyq-we8x`** — Caps de municipi georeferenciados: 947 puntos con lat/lon listos. Cubre
   el nivel municipio al 100 % de inmediato. *Verificado.*
3. **`9aju-tpwc`** — Municipis Catalunya Geo: 949 centroides. *Verificado.*
4. **OpenStreetMap** (`place=village|hamlet|isolated_dwelling`) como relleno y verificación
   cruzada de lo que quede sin geocodificar.

Además hay que resolver la **altitud real de cada núcleo**, no la del municipio: Lilla está a
~700 m y Montblanc a ~350 m, y ese desnivel son 2–3 °C de diferencia sistemática. Se obtiene
del MDE del ICGC, o más simple, del campo `elevation` que Open-Meteo devuelve por punto (que
es la orografía que el propio modelo asume, justo lo que necesitamos para corregir).

**Criterio de calidad de la geocodificación:** un núcleo sin coordenada verificada **no
publica página**. Preferimos 4.200 páginas correctas que 4.900 con inventos.

---

## D. AEMET OpenData

**API key:** gratuita e inmediata desde `opendata.aemet.es` introduciendo un email. **Caduca a
los 90 días** — el sistema debe contemplar rotación de clave, no darla por permanente. Se
pueden generar tantas como haga falta.

No hay cuota documentada públicamente. Hay que implementar backoff y tratarla como fuente
*best-effort*, nunca crítica.

| Recurso | Endpoint | Valor |
|---|---|---|
| Avisos CAP | `/avisos_cap/ultimoelaborado/area/cat` | **Alto** — avisos oficiales, obligatorio mostrarlos |
| Predicción municipal diaria | `/prediccion/especifica/municipio/diaria/{ine}` | Medio — cuarta opinión, con el código INE que ya tenemos |
| Predicción de montaña | `/prediccion/especifica/montaña/pasada/area/{area}` | **Alto** — vertical Pirineo |
| Predicción de playas | `/prediccion/especifica/playa/{playa}` | **Alto** — vertical costa |
| Radar regional | `/red/radar/regional/{region}` | Medio — imagen, no dato |
| Observación convencional | `/observacion/convencional/todas` | Medio — complementa XEMA |

Patrón de la API: **dos saltos**. La primera petición devuelve un JSON con una URL `datos`
temporal; hay que hacer una segunda petición a esa URL. La capa de ingesta debe encapsularlo.

---

## E. Datos abiertos catalanes para las verticales

Mismo portal Socrata:

| Vertical | Dataset | ID | Estado |
|---|---|---|---|
| Embalses | Quantitat d'aigua als embassaments de les Conques Internes | `gn9e-3qhr` | **actualizado hoy 10:00 UTC** ✅ |
| Sequía | Estat de sequera per unitats d'explotació i municipis | `i5n8-43cw` | por verificar frescura |
| Aludes | Predicció de perill d'allaus | `nnwt-dwkm` | por verificar frescura |
| Riesgo nieve | Mapa de Protecció Civil: risc per nevades | `rf6m-waq5` | estático |
| EMD | Dades d'ens locals — Entitats municipals descentralitzades | `us88-r4bd` | — |
| Volumen embalses | Volum d'aigua per embassament | `39c7-5ydt` | — |

> ⚠️ **Trampa detectada:** los datasets `tbmx-edrm` (Predicció meteorològica de Catalunya) y
> `h3zv-7tki` (Predicció comarcal) **no contienen datos**. Son de tipo `href`: enlaces a
> páginas de meteo.cat, sin actualizar desde marzo de 2017. Devuelven
> `no row or column access to non-tabular tables`. La predicción oficial estructurada de
> Meteocat solo existe en la API de pago.

---

## F. OpenWeatherMap

Tier gratuito: 1.000 llamadas/día, 60/minuto. Su valor **no** es la predicción (Open-Meteo es
mejor y sin límite práctico), sino:

- **Tiles de mapa** (`tile.openweathermap.org`): precipitación, nubes, presión, viento y
  temperatura como capas raster listas para MapLibre.
- Redundancia si Open-Meteo cae.

Se proxea desde nuestro edge para no exponer la key en el cliente.

---

## G. Cartografía base

| Fuente | Uso | Coste |
|---|---|---|
| **Protomaps** (self-host) | Un único `.pmtiles` de Catalunya (~50 MB) en nuestro CDN | Gratis |
| **ICGC vector tiles** | Mapa base oficial catalán, topónimos correctos | Gratis |
| **RainViewer** | Radar de precipitación animado | Gratis con atribución |
| **Meteocat WMS (XRAD)** | Radar oficial | Verificar términos antes de usar |

**Recomendación: Protomaps.** Elimina un punto de fallo externo, es gratis para siempre y da
control total del estilo — importante cuando el mapa es una pieza central del producto.

---

## Resumen de decisiones

| Necesidad | Fuente elegida | Alternativa / respaldo |
|---|---|---|
| Observación actual | **XEMA vía datos abiertos** | AEMET observación |
| Predicción horaria | **Open-Meteo multi-modelo** | AEMET municipal |
| Incertidumbre | **Open-Meteo Ensemble** | — |
| Avisos oficiales | **AEMET CAP** | Meteocat (de pago) |
| Rayos | ninguna gratuita | Meteocat XDDE (de pago) |
| Territorio | **Nomenclàtor `tssr-jqsj`** | INE |
| Coordenadas | **ICGC Noms geogràfics** | OSM |
| Marino / oleaje | **Open-Meteo Marine** | Puertos del Estado |
| Calidad del aire | **Open-Meteo Air Quality** | OWM |
| Mapa base | **Protomaps self-host** | ICGC tiles |
| Capas raster | **RainViewer + OWM tiles** | — |
