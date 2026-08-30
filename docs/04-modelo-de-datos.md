# 04 — Modelo de datos

PostgreSQL 16 + PostGIS 3.4 + TimescaleDB 2.x.

Tres dominios claramente separados: **territorio** (estático, se toca una vez al año),
**observación y predicción** (series temporales masivas) y **derivados** (fusión, índices,
verificación).

---

## Extensiones

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- buscador de topónimos
CREATE EXTENSION IF NOT EXISTS unaccent;     -- "Guardia" debe encontrar "Guàrdia"
```

---

## Dominio 1 — Territorio

```sql
CREATE TABLE comarca (
  codi            char(2)      PRIMARY KEY,       -- '19' = Conca de Barberà
  nom             text         NOT NULL,
  slug            text         NOT NULL UNIQUE,
  nom_es          text, nom_en text,
  provincia       text         NOT NULL,
  geom            geometry(MultiPolygon, 4326) NOT NULL,
  centroid        geography(Point, 4326)       NOT NULL,
  area_km2        numeric(10,2),
  poblacio        integer,
  altitud_min     integer, altitud_max integer,
  es_pirinenca    boolean NOT NULL DEFAULT false, -- activa vertical nieve
  es_costanera    boolean NOT NULL DEFAULT false  -- activa vertical mar
);
CREATE INDEX comarca_geom_idx ON comarca USING GIST (geom);
```

```sql
CREATE TABLE municipi (
  codi_ine        char(6)      PRIMARY KEY,       -- '430862' (INE + dígito de control)
  codi_ine5       char(5)      NOT NULL UNIQUE,   -- '43086' — el que usa AEMET
  comarca_codi    char(2)      NOT NULL REFERENCES comarca(codi),
  nom             text         NOT NULL,          -- 'Montblanc'
  nom_indexat     text         NOT NULL,          -- 'Montblanc' / 'Cogul, el'
  slug            text         NOT NULL,
  geom            geometry(MultiPolygon, 4326),
  cap_municipi    geography(Point, 4326) NOT NULL,
  altitud         integer,
  poblacio        integer,
  UNIQUE (comarca_codi, slug)
);
CREATE INDEX municipi_geom_idx ON municipi USING GIST (geom);
```

### La tabla central: `location`

Unifica los tres niveles publicables. Es la que consulta el 95 % del sitio.

```sql
CREATE TYPE location_level AS ENUM
  ('comarca','municipi','entitat_colectiva','entitat_singular','nucli','disseminat');

CREATE TYPE index_tier AS ENUM ('A','B','C','D');   -- ver doc 03

CREATE TABLE location (
  id                  bigserial PRIMARY KEY,
  codi_13             char(13)  UNIQUE,            -- '4308620002201' → Lilla
  level               location_level NOT NULL,
  parent_id           bigint    REFERENCES location(id),
  municipi_codi       char(6)   REFERENCES municipi(codi_ine),
  comarca_codi        char(2)   NOT NULL REFERENCES comarca(codi),

  nom                 text NOT NULL,               -- 'la Guàrdia dels Prats'
  nom_indexat         text NOT NULL,               -- 'Guàrdia dels Prats, la'
  slug                text NOT NULL,               -- 'la-guardia-dels-prats'
  path                text NOT NULL UNIQUE,        -- '/conca-de-barbera/montblanc/la-guardia-dels-prats'

  point               geography(Point, 4326),
  altitud             integer,
  geocode_source      text,                        -- 'icgc' | 'osm' | 'nomenclator' | 'derived'
  geocode_confidence  smallint,                    -- 0-100; <60 ⇒ no publica página

  poblacio            integer,
  poblacio_any        smallint,

  -- Contexto físico, alimenta el texto único de cada página (doc 03)
  orientacio          smallint,                    -- azimut de la ladera, 0-359
  pendent             numeric(4,1),
  es_fons_de_vall     boolean DEFAULT false,       -- propenso a inversión térmica
  dist_costa_km       numeric(6,1),

  forecast_point_id   bigint REFERENCES forecast_point(id),
  station_ref_id      bigint REFERENCES station(id),
  station_ref_dist_km numeric(6,2),
  station_ref_dalt_m  integer,                     -- desnivel respecto a esa estación

  tier                index_tier NOT NULL DEFAULT 'C',
  published           boolean NOT NULL DEFAULT false,

  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX location_point_idx  ON location USING GIST (point);
CREATE INDEX location_parent_idx ON location(parent_id);
CREATE INDEX location_search_idx ON location
  USING GIN (unaccent(lower(nom)) gin_trgm_ops);
CREATE INDEX location_pub_idx    ON location(tier, published) WHERE published;
```

> `path` está desnormalizado a propósito: la resolución de una URL a una ubicación tiene que
> ser un único índice único, sin recorrer la jerarquía. Es la consulta más frecuente del sitio.

### Vecindad, para el enlazado interno

```sql
CREATE TABLE location_neighbour (
  location_id   bigint NOT NULL REFERENCES location(id),
  neighbour_id  bigint NOT NULL REFERENCES location(id),
  relation      text   NOT NULL,   -- 'sibling' | 'adjacent' | 'nearest'
  distance_km   numeric(6,2),
  rank          smallint,
  PRIMARY KEY (location_id, neighbour_id, relation)
);
```

`adjacent` se calcula una sola vez con `ST_Touches` sobre los polígonos reales de municipio.
Es mucho mejor que "los más cercanos por centroide": dos municipios pueden tener centroides
próximos y no compartir frontera.

---

## Dominio 2 — Observación

```sql
CREATE TABLE station (
  id            bigserial PRIMARY KEY,
  codi          text UNIQUE NOT NULL,             -- 'X2'
  nom           text NOT NULL,                    -- 'Barcelona - Zoo'
  network       text NOT NULL DEFAULT 'XEMA',     -- XEMA | AEMET | XOM
  point         geography(Point, 4326) NOT NULL,
  altitud       integer,
  municipi_codi char(6) REFERENCES municipi(codi_ine),
  comarca_codi  char(2) REFERENCES comarca(codi),
  estat         text,                             -- 'Operativa' | 'Desmantellada'
  data_inici    date, data_fi date,
  emplacament   text
);
CREATE INDEX station_point_idx ON station USING GIST (point);
```

```sql
CREATE TABLE variable (
  codi        text PRIMARY KEY,        -- '32' (temperatura), '35' (precipitación)
  slug        text UNIQUE NOT NULL,    -- 'temperature_2m'
  nom_ca      text, nom_es text, nom_en text,
  unitat      text NOT NULL,           -- unidad SI canónica
  acumulada   boolean DEFAULT false,   -- suma vs media al agregar
  decimals    smallint DEFAULT 1
);
```

> `variable` es la **tabla Rosetta**: mapea el `codi_variable` numérico de Meteocat, el nombre
> de Open-Meteo y el de AEMET a un identificador único nuestro. Sin ella, la fusión de fuentes
> es un caos de conversiones dispersas por el código.

```sql
CREATE TABLE observation (
  station_id   bigint    NOT NULL REFERENCES station(id),
  variable     text      NOT NULL REFERENCES variable(codi),
  ts           timestamptz NOT NULL,
  value        real      NOT NULL,
  quality      char(1)   NOT NULL DEFAULT 'V',    -- V validado, T pendiente
  PRIMARY KEY (station_id, variable, ts)
);
SELECT create_hypertable('observation','ts', chunk_time_interval => INTERVAL '7 days');
```

Volumen estimado: ~140.000 filas/día, ~51 millones/año.

### Agregados continuos y retención

```sql
CREATE MATERIALIZED VIEW observation_hourly
WITH (timescaledb.continuous) AS
SELECT station_id, variable, time_bucket('1 hour', ts) AS hour,
       avg(value) AS avg, min(value) AS min, max(value) AS max,
       sum(value) AS sum, count(*) AS n
FROM observation WHERE quality = 'V'
GROUP BY station_id, variable, hour;

CREATE MATERIALIZED VIEW observation_daily
WITH (timescaledb.continuous) AS
SELECT station_id, variable, time_bucket('1 day', ts) AS day,
       avg(value) AS avg, min(value) AS min, max(value) AS max, sum(value) AS sum
FROM observation WHERE quality = 'V'
GROUP BY station_id, variable, day;

SELECT add_retention_policy('observation',        INTERVAL '90 days');
SELECT add_retention_policy('observation_hourly', INTERVAL '2 years');
-- observation_daily no se poda nunca
```

### Récords — nunca se borran

```sql
CREATE TABLE station_record (
  station_id  bigint NOT NULL REFERENCES station(id),
  variable    text   NOT NULL REFERENCES variable(codi),
  kind        text   NOT NULL,     -- 'max_abs'|'min_abs'|'max_daily_sum'|'max_monthly_sum'
  scope       text   NOT NULL,     -- 'all'|'month-01'…'month-12'
  value       real   NOT NULL,
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY (station_id, variable, kind, scope)
);
```

Ocupa unos pocos miles de filas y alimenta contenido SEO de primer nivel ("la temperatura més
alta mai registrada a Montblanc").

---

## Dominio 3 — Predicción

```sql
CREATE TABLE forecast_point (
  id         bigserial PRIMARY KEY,
  point      geography(Point, 4326) NOT NULL,
  altitud    integer NOT NULL,                 -- altitud del modelo, no la real
  grid_key   text UNIQUE NOT NULL,             -- '41.38,1.16,350' clave de deduplicación
  n_locations integer NOT NULL DEFAULT 0       -- cuántas ubicaciones lo comparten
);
CREATE INDEX forecast_point_geom_idx ON forecast_point USING GIST (point);
```

```sql
CREATE TABLE model (
  id           text PRIMARY KEY,          -- 'meteofrance_arome_france_hd'
  nom          text NOT NULL,
  provider     text NOT NULL,
  resolution_km numeric(5,2),
  max_hours    smallint,
  runs_per_day smallint,
  covers_cat   boolean NOT NULL DEFAULT true,   -- icon_d2 = false
  enabled      boolean NOT NULL DEFAULT true
);

CREATE TABLE forecast (
  point_id   bigint      NOT NULL REFERENCES forecast_point(id),
  model_id   text        NOT NULL REFERENCES model(id),
  run_ts     timestamptz NOT NULL,          -- pasada del modelo
  valid_ts   timestamptz NOT NULL,          -- momento predicho
  variable   text        NOT NULL REFERENCES variable(codi),
  value      real        NOT NULL,
  PRIMARY KEY (point_id, model_id, run_ts, valid_ts, variable)
);
SELECT create_hypertable('forecast','valid_ts', chunk_time_interval => INTERVAL '2 days');
SELECT add_retention_policy('forecast', INTERVAL '30 days');
```

> Guardar la pasada (`run_ts`) además del instante predicho no es opcional: **sin ella no se
> puede verificar nada**. El error de un modelo a 6 h y a 96 h de horizonte son magnitudes
> completamente distintas, y la ponderación del doc 05 depende de poder separarlos.

### Consenso — el resultado que consume la web

```sql
CREATE TABLE forecast_consensus (
  location_id  bigint      NOT NULL REFERENCES location(id),
  valid_ts     timestamptz NOT NULL,
  variable     text        NOT NULL REFERENCES variable(codi),
  value        real        NOT NULL,      -- ya corregido por altitud y sesgo
  p10          real, p90 real,            -- banda de incertidumbre
  spread       real,                      -- desacuerdo entre modelos
  confidence   smallint,                  -- 0-100, derivado de spread + skill
  n_models     smallint NOT NULL,
  computed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (location_id, valid_ts, variable)
);
SELECT create_hypertable('forecast_consensus','valid_ts', chunk_time_interval => INTERVAL '2 days');
```

`confidence` es un diferenciador de producto: permite decir *"predicció fiable"* o *"els
models no es posen d'acord"* en vez de fingir una certeza que no existe. Es honesto y ningún
competidor lo muestra.

### Verificación — la prueba de que somos mejores

```sql
CREATE TABLE model_skill (
  model_id     text     NOT NULL REFERENCES model(id),
  variable     text     NOT NULL REFERENCES variable(codi),
  lead_bucket  smallint NOT NULL,   -- 6,12,24,48,72,120,168 h
  zone         text     NOT NULL,   -- 'litoral'|'prelitoral'|'depressio'|'pirineu'|'prepirineu'
  period       daterange NOT NULL,
  mae          real, rmse real, bias real,
  n_samples    integer NOT NULL,
  weight       real NOT NULL,       -- peso derivado, usado por el motor de fusión
  PRIMARY KEY (model_id, variable, lead_bucket, zone, period)
);
```

```sql
CREATE TABLE station_bias (
  station_id  bigint NOT NULL REFERENCES station(id),
  model_id    text   NOT NULL REFERENCES model(id),
  variable    text   NOT NULL REFERENCES variable(codi),
  month       smallint NOT NULL,       -- sesgo estacional
  hour_bucket smallint NOT NULL,       -- 0,6,12,18 — la inversión térmica es nocturna
  bias        real NOT NULL,
  n_samples   integer NOT NULL,
  PRIMARY KEY (station_id, model_id, variable, month, hour_bucket)
);
```

---

## Dominio 4 — Avisos e índices derivados

```sql
CREATE TABLE warning (
  id           text PRIMARY KEY,          -- identificador CAP
  source       text NOT NULL,             -- 'AEMET' | 'METEOCAT' | 'PROTECCIO_CIVIL'
  event        text NOT NULL,             -- 'Lluvia' | 'Nieve' | 'Viento' | 'Costeros'
  severity     text NOT NULL,             -- CAP: Minor|Moderate|Severe|Extreme
  certainty    text,
  onset        timestamptz NOT NULL,
  expires      timestamptz NOT NULL,
  headline     text, description text, instruction text,
  geom         geometry(MultiPolygon, 4326),
  raw          jsonb,
  ingested_at  timestamptz DEFAULT now()
);
CREATE INDEX warning_geom_idx   ON warning USING GIST (geom);
CREATE INDEX warning_active_idx ON warning (expires) WHERE expires > now();
```

```sql
CREATE TABLE activity_index (
  location_id  bigint NOT NULL REFERENCES location(id),
  day          date   NOT NULL,
  activity     text   NOT NULL,   -- 'bolets'|'senderisme'|'esqui'|'surf'|'platja'|'astronomia'
  score        smallint NOT NULL, -- 0-100
  factors      jsonb  NOT NULL,   -- desglose explicable: qué suma y qué resta
  computed_at  timestamptz DEFAULT now(),
  PRIMARY KEY (location_id, day, activity)
);
```

`factors` guarda el desglose porque la página debe **explicar** la puntuación
("+30 pluja acumulada 15 dies · +20 temperatura del sòl · −15 vent"), no soltar un número
mágico. Es lo que separa una herramienta útil de un adorno.

---

## Dominio 5 — Verticales

```sql
CREATE TABLE reservoir (
  id           text PRIMARY KEY,
  nom          text NOT NULL,
  conca        text NOT NULL,
  capacitat_hm3 numeric(8,2),
  point        geography(Point, 4326),
  comarca_codi char(2) REFERENCES comarca(codi)
);

CREATE TABLE reservoir_level (
  reservoir_id text NOT NULL REFERENCES reservoir(id),
  day          date NOT NULL,
  volum_hm3    numeric(8,2),
  percentatge  numeric(5,2),
  PRIMARY KEY (reservoir_id, day)
);

CREATE TABLE ski_resort (
  id            text PRIMARY KEY,
  nom           text NOT NULL,
  comarca_codi  char(2) REFERENCES comarca(codi),
  point         geography(Point, 4326),
  alt_base      integer, alt_cim integer,
  km_pistes     numeric(5,1)
);

CREATE TABLE ski_conditions (
  resort_id     text NOT NULL REFERENCES ski_resort(id),
  day           date NOT NULL,
  gruix_base_cm smallint, gruix_cim_cm smallint,
  pistes_obertes smallint, pistes_total smallint,
  remuntadors_oberts smallint,
  qualitat_neu  text,
  source        text NOT NULL,       -- procedencia: propia, estación, scraping
  PRIMARY KEY (resort_id, day)
);

CREATE TABLE avalanche_bulletin (
  zone       text NOT NULL,
  day        date NOT NULL,
  level      smallint NOT NULL,      -- escala europea 1-5
  trend      text,
  problems   jsonb,
  raw        jsonb,
  PRIMARY KEY (zone, day)
);
```

---

## Dominio 6 — Operación

```sql
CREATE TABLE ingest_run (
  id          bigserial PRIMARY KEY,
  source_id   text NOT NULL,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status      text NOT NULL,          -- 'running'|'ok'|'partial'|'failed'
  rows_in     integer, rows_written integer,
  api_calls   integer,
  error       text
);

CREATE TABLE data_freshness (
  source_id       text PRIMARY KEY,
  last_success_at timestamptz,
  last_data_ts    timestamptz,        -- timestamp del dato más reciente, no de la ejecución
  staleness_limit interval NOT NULL,
  is_stale        boolean GENERATED ALWAYS AS
                    (last_data_ts < now() - staleness_limit) STORED
);
```

`data_freshness` alimenta un panel de estado público. **Mostrar abiertamente cuándo se
actualizó cada fuente por última vez es una ventaja competitiva**, no una debilidad: las webs
que ocultan que su dato lleva seis horas parado pierden la confianza del usuario en cuanto
este lo descubre una vez.

---

## Consultas críticas

**Resolver una URL** — la más frecuente de todo el sitio, un solo índice:

```sql
SELECT * FROM location WHERE path = $1 AND published;
```

**Estación de referencia** — ponderando distancia y desnivel, porque 300 m de altura importan
más que 10 km de distancia horizontal:

```sql
SELECT s.id,
       ST_Distance(l.point, s.point)/1000                    AS dist_km,
       abs(l.altitud - s.altitud)                            AS dalt_m
FROM station s, location l
WHERE l.id = $1 AND s.estat = 'Operativa'
  AND ST_DWithin(l.point, s.point, 40000)
ORDER BY ST_Distance(l.point, s.point)/1000 + abs(l.altitud - s.altitud)/50.0
LIMIT 1;
```

**Buscador de topónimos** — tolerante a acentos y erratas:

```sql
SELECT path, nom, level, similarity(unaccent(lower(nom)), unaccent(lower($1))) AS sim
FROM location
WHERE published AND unaccent(lower(nom)) % unaccent(lower($1))
ORDER BY sim DESC, poblacio DESC NULLS LAST
LIMIT 10;
```

---

## Volumen estimado a un año

| Tabla | Filas | Tamaño aprox. |
|---|---|---|
| `location` | ~11.000 | 6 MB |
| `observation` (90 d) | ~12,6 M | 900 MB |
| `observation_hourly` (2 a) | ~4,3 M | 300 MB |
| `observation_daily` (perpetua) | ~180 k/año | 15 MB/año |
| `forecast` (30 d) | ~50 M | 3 GB |
| `forecast_consensus` (7 d) | ~9 M | 600 MB |
| **Total** | | **~5 GB** |

Cabe holgadamente en el tier de pago inicial de Neon. Si `forecast` se hace incómodo, se baja
la retención a 14 días: solo se necesita histórico de predicción para verificar, y 14 días de
muestras bastan para el cálculo de skill continuo.
