-- ============================================================================
-- 001 · Territorio
--
-- Datos estáticos: se tocan una vez al año, cuando el Nomenclàtor publica
-- edición nueva. Se cargan desde data/build/ con scripts/db/import.ts.
--
-- Requiere PostGIS. TimescaleDB no hace falta todavía: llega en la 002, con
-- las series temporales.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- unaccent no es IMMUTABLE por defecto, así que no se puede indexar
-- directamente. Este envoltorio sí lo es y permite el índice GIN del buscador.
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
  RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
$$ SELECT public.unaccent('public.unaccent', $1) $$;

-- ── Tipos ───────────────────────────────────────────────────────────────────

CREATE TYPE location_level AS ENUM (
  'comarca', 'municipi', 'entitat_colectiva', 'entitat_singular', 'nucli', 'disseminat'
);

-- Niveles de indexación: A se abre al lanzar, D nunca. Ver docs/03-seo-y-rutas.md
CREATE TYPE index_tier AS ENUM ('A', 'B', 'C', 'D');

CREATE TYPE geocode_source AS ENUM ('cap-municipi', 'icgc', 'heretat', 'osm', 'derived');

-- ── Comarcas ────────────────────────────────────────────────────────────────
-- 43 desde 2023: el Lluçanès se segregó de Osona, el Berguedà y el Bages.
-- El Nomenclàtor (edición 2021) todavía dice 42; la fuente buena es el dataset
-- de caps de municipi.

CREATE TABLE comarca (
  codi          char(2)  PRIMARY KEY,
  nom           text     NOT NULL,
  slug          text     NOT NULL UNIQUE,
  path          text     NOT NULL UNIQUE,
  nom_es        text,
  nom_en        text,
  centroid      geography(Point, 4326) NOT NULL,
  geom          geometry(MultiPolygon, 4326),   -- GML INSPIRE del ICGC, vía data/build/geo/
  n_municipis   smallint NOT NULL,
  poblacio      integer,
  area_km2      numeric(9,2),
  densitat      numeric(9,2),
  altitud_min   integer,
  altitud_max   integer,
  es_pirinenca  boolean  NOT NULL DEFAULT false,
  es_costanera  boolean  NOT NULL DEFAULT false
);

CREATE INDEX comarca_geom_idx ON comarca USING GIST (geom);

-- ── Estaciones XEMA ─────────────────────────────────────────────────────────

CREATE TABLE station (
  codi           text PRIMARY KEY,
  nom            text NOT NULL,
  slug           text NOT NULL,
  xarxa          text NOT NULL DEFAULT 'XEMA',
  point          geography(Point, 4326) NOT NULL,
  altitud        integer,
  emplacament    text,
  municipi_ine5  char(5),
  municipi_nom   text,
  comarca_codi   char(2) REFERENCES comarca(codi),
  operativa      boolean NOT NULL DEFAULT true,
  estat          text,
  data_inici     date,
  data_fi        date
);

CREATE INDEX station_point_idx ON station USING GIST (point);
CREATE INDEX station_oper_idx  ON station (operativa) WHERE operativa;

-- ── Variables meteorológicas ────────────────────────────────────────────────
-- Tabla Rosetta: mapea el código numérico de Meteocat, el nombre de Open-Meteo
-- y el de AEMET a un identificador único nuestro. Sin ella la fusión de fuentes
-- se convierte en conversiones dispersas por todo el código.

CREATE TABLE variable (
  codi        text PRIMARY KEY,          -- código Meteocat: '32' = temperatura
  slug        text UNIQUE NOT NULL,      -- 'temperature_2m'
  nom_ca      text NOT NULL,
  nom_es      text,
  nom_en      text,
  unitat      text NOT NULL,
  acronim     text,
  decimals    smallint NOT NULL DEFAULT 1,
  acumulada   boolean  NOT NULL DEFAULT false,   -- sumar en vez de promediar
  openmeteo   text,                              -- nombre equivalente en Open-Meteo
  aemet       text
);

-- ── Ubicaciones ─────────────────────────────────────────────────────────────
-- La tabla central. El 95 % de las consultas del sitio pasan por aquí.

CREATE TABLE location (
  id                  char(13) PRIMARY KEY,      -- codi_13 del Nomenclàtor
  level               location_level NOT NULL,
  parent_id           char(13) REFERENCES location(id),
  comarca_codi        char(2)  NOT NULL REFERENCES comarca(codi),
  municipi_codi       char(6),                   -- INE + dígito de control
  municipi_ine5       char(5),                   -- el que usa AEMET

  nom                 text NOT NULL,             -- 'la Guàrdia dels Prats'
  nom_indexat         text NOT NULL,             -- 'Guàrdia dels Prats, la'
  slug                text NOT NULL,
  -- Desnormalizado a propósito: resolver una URL debe ser un único lookup,
  -- sin recorrer la jerarquía. Es la consulta más frecuente del sitio.
  path                text NOT NULL,

  point               geography(Point, 4326),
  altitud             integer,
  geocode_source      geocode_source,
  geocode_confidence  smallint NOT NULL DEFAULT 0,

  poblacio            integer,
  area_km2            numeric(9,2),   -- solo a nivel municipio
  geom                geometry(MultiPolygon, 4326),

  station_ref_codi    text REFERENCES station(codi),
  station_ref_dist_km numeric(6,2),
  station_ref_dalt_m  integer,

  tier                index_tier NOT NULL DEFAULT 'C',
  published           boolean NOT NULL DEFAULT false,
  canonical_path      text,                      -- si no publica, a dónde apunta
  unpublished_reason  text,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Solo las publicadas necesitan ruta única; las no publicadas comparten la
-- ruta canónica de su padre, y eso es correcto.
CREATE UNIQUE INDEX location_path_idx ON location (path) WHERE published;

CREATE INDEX location_point_idx  ON location USING GIST (point);
CREATE INDEX location_parent_idx ON location (parent_id);
CREATE INDEX location_mun_idx    ON location (municipi_codi);
CREATE INDEX location_com_idx    ON location (comarca_codi) WHERE published;
CREATE INDEX location_tier_idx   ON location (tier) WHERE published;

-- Buscador tolerante a acentos y erratas: "guardia prats" → "la Guàrdia dels Prats"
CREATE INDEX location_search_idx ON location
  USING GIN (immutable_unaccent(lower(nom)) gin_trgm_ops);

-- ── Vecindad, para el enlazado interno ──────────────────────────────────────

CREATE TABLE location_neighbour (
  location_id   char(13) NOT NULL REFERENCES location(id) ON DELETE CASCADE,
  neighbour_id  char(13) NOT NULL REFERENCES location(id) ON DELETE CASCADE,
  -- 'sibling'  mismo municipio
  -- 'nearest'  más próximo por distancia (lo que tenemos hoy)
  -- 'adjacent' comparte frontera. No se calcula con ST_Touches: se lee de las
  --            líneas au:boundary del GML del ICGC, que es la topología oficial
  --            y no tiene los falsos positivos de una comparación geométrica
  relation      text     NOT NULL,
  distance_km   numeric(6,2),
  rank          smallint NOT NULL,
  PRIMARY KEY (location_id, neighbour_id, relation)
);

CREATE INDEX location_neighbour_idx ON location_neighbour (location_id, relation, rank);

-- ── Consultas de referencia ─────────────────────────────────────────────────
--
-- Resolver una URL (la más frecuente de todo el sitio, un solo índice):
--   SELECT * FROM location WHERE path = $1 AND published;
--
-- Estación de referencia, ponderando desnivel: 50 m de altura penalizan como
-- 1 km horizontal, porque el gradiente térmico pesa más que la distancia.
--   SELECT s.codi,
--          ST_Distance(l.point, s.point)/1000 AS dist_km,
--          l.altitud - s.altitud              AS d_alt_m
--     FROM station s, location l
--    WHERE l.id = $1 AND s.operativa
--      AND ST_DWithin(l.point, s.point, 60000)
--    ORDER BY ST_Distance(l.point, s.point)/1000
--             + abs(l.altitud - s.altitud)/50.0
--    LIMIT 1;
--
-- Buscador:
--   SELECT path, nom, level,
--          similarity(immutable_unaccent(lower(nom)), immutable_unaccent(lower($1))) AS sim
--     FROM location
--    WHERE published
--      AND immutable_unaccent(lower(nom)) % immutable_unaccent(lower($1))
--    ORDER BY sim DESC, poblacio DESC NULLS LAST
--    LIMIT 10;
