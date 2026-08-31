# Meteo Catalunya — notas para trabajar en este repositorio

Plataforma meteorológica de Catalunya con cobertura hasta el núcleo de población.
Diseño completo en [`docs/`](docs/); empieza por [`docs/00-resumen-ejecutivo.md`](docs/00-resumen-ejecutivo.md).

## Estructura

| Ruta | Qué es |
|---|---|
| `scripts/` | Pipeline de datos. Node ejecuta el TypeScript directamente, sin build |
| `scripts/workers/` | Ingesta periódica: observación, predicción, avisos |
| `src/lib/` | Frontera entre datos y aplicación |
| `src/app/` | Rutas Next.js |
| `data/build/` | Territorio construido. **Se versiona** |
| `data/raw/`, `data/cache/` | Descargas y datos vivos. No se versionan |
| `db/migrations/` | Esquema PostgreSQL, sin aplicar todavía |

## Restricciones de TypeScript en los scripts

Node 24 ejecuta `.ts` **borrando los tipos, sin transformarlos**. Todo lo que genere código en
tiempo de ejecución falla al arrancar:

- ❌ Propiedades de parámetro: `constructor(private readonly x: T)`
- ❌ `enum` (usa `as const` o uniones de literales)
- ❌ `namespace`, decoradores
- ✅ Todo lo demás, incluidos genéricos y `satisfies`

Los imports relativos **necesitan la extensión `.ts` explícita**, cosa que el `tsconfig.json` de
Next no admite. Por eso `scripts/` tiene su propio `tsconfig.json` y la raíz lo excluye.

Comprueba ambos proyectos con `npm run typecheck`.

## Código compartido entre scripts y aplicación

`src/lib/variables.ts` lo importan los dos, así que **no puede importar nada**: los scripts lo
cargan con extensión `.ts` y la aplicación con el alias `@/`. Si necesita dependencias, duplica
en vez de romper uno de los dos.

## Comandos

```bash
npm run data:all        # construye el territorio desde cero (~35 min)
npm run data:validate   # criterios de aceptación de la fase 0
npm run typecheck       # aplicación y scripts
npm run build
```

Workers:

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/workers/xema-observations.ts
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/workers/forecast-refresh.ts --tiers=A,B,C
```

## Principios que no se negocian

**La ingesta está desacoplada del renderizado.** Ninguna petición de un usuario dispara jamás
una llamada a una API externa. Los workers escriben en `data/cache/`; las páginas leen de ahí.

**Sin dato verificado no se publica.** Una ubicación sin coordenada fiable no tiene página. Vale
más un sitio con 4.293 páginas correctas que uno con 11.019 inventadas.

**No se llama "limítrofe" a lo que solo está cerca.** La colindancia real sale de las líneas de
frontera del ICGC (`relation: 'adjacent'`); la proximidad es `'nearest'` y se etiqueta distinto.
Esa diferencia acaba en el texto de las páginas.

**Se dice de dónde viene cada número.** Estación, distancia, desnivel y hora de la lectura.
Cumple CC-BY y es la mejor decisión de producto del sitio.

**No se promete precisión no demostrada.** Mientras no exista la verificación de la fase 4, los
modelos pesan igual y la página lo dice.

## Cuotas: la restricción que manda

Open-Meteo factura **ubicaciones**, no peticiones (10 variables × 7 días × 1 ubicación = 1
llamada). Refrescar los 3.190 puntos con 5 modelos son 15.950 unidades contra un límite diario
de 10.000: no cabe ni una vez al día. De ahí la política de modelos por nivel en
`scripts/workers/forecast-refresh.ts`.

`QuotaGuard` corta al 95 % y degrada al 80 %. No lo desactives para "hacer una prueba rápida".

## Rarezas de las fuentes, ya descubiertas a base de golpes

- **Open-Meteo devuelve `nan` sin comillas** cuando un punto cae fuera del dominio de un modelo.
  No es JSON válido. Hay que sanear el texto antes de parsear.
- **La XEMA no rellena `codi_estat` en los datos recientes.** Filtrar por `'V'` deja la web sin
  ningún dato actual. Se etiquetan como provisionales.
- **El retraso de la XEMA es de 45 a 65 minutos**, variable. Nunca presentes la lectura como si
  fuera de ahora mismo.
- **El Nomenclàtor es de 2021 y dice 42 comarcas. Son 43** desde que se creó el Lluçanès.
- **El dataset de centroides `9aju-tpwc` trae dos filas basura** (`999998`, `999999`).
