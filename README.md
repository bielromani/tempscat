# Meteo Catalunya — plataforma meteorológica unificada

Web app meteorológica para Catalunya con la cobertura territorial más granular que existe
(43 comarcas → 947 municipios → 3.903 entidades singulares → 3.283 núcleos),
datos de múltiples fuentes fusionados en un motor de consenso multi-modelo verificado contra
observación real, y una arquitectura SEO diseñada para dominar la long tail.

**Estado: fase 0 — fundamentos de datos.** El pipeline territorial está construido y
validado; la aplicación todavía no tiene páginas. Documentación de diseño en [`docs/`](docs/).

| Documento | Contenido |
|---|---|
| [00 — Resumen ejecutivo](docs/00-resumen-ejecutivo.md) | Tesis del producto, decisiones clave, qué nos hace ganar |
| [01 — Fuentes de datos](docs/01-fuentes-de-datos.md) | Cada API/dataset verificado: cuotas, latencia, licencia |
| [02 — Arquitectura técnica](docs/02-arquitectura.md) | Stack, capas, ingesta, caché, despliegue |
| [03 — SEO y árbol de rutas](docs/03-seo-y-rutas.md) | El núcleo del proyecto: ~15.000 páginas indexables |
| [04 — Modelo de datos](docs/04-modelo-de-datos.md) | DDL completo de PostgreSQL + PostGIS |
| [05 — Motor de fusión](docs/05-motor-de-fusion.md) | Consenso multi-modelo, verificación, corrección de sesgo |
| [06 — UI/UX y visualización](docs/06-ui-ux.md) | Sistema de diseño, dashboards, mapas, gráficos |
| [07 — Verticales territoriales](docs/07-verticales.md) | Nieve, embalses, bolets, playas, senderismo |
| [08 — Roadmap](docs/08-roadmap.md) | Fases, entregables, criterios de aceptación |
| [09 — Legal y costes](docs/09-legal-y-costes.md) | Licencias, atribución obligatoria, coste mensual real |
| [10 — Pipeline de datos](docs/10-pipeline-de-datos.md) | Cómo se construye el territorio, paso a paso |
| [11 — Contenido de página](docs/11-contenido-de-pagina.md) | Qué lleva dentro una ficha de lugar y de dónde sale cada dato |
| **[12 — Estado y continuación](docs/12-estado-y-continuacion.md)** | **Dónde estamos, qué falta y las trampas ya descubiertas. Empieza aquí** |

## Arranque

```bash
npm install
npm run data:all      # construye el territorio: ~25 min en frío
npm run dev
```

El pipeline de datos está documentado en [docs/10](docs/10-pipeline-de-datos.md).

## Hallazgos que condicionan todo el diseño

1. **La API directa de Meteocat NO sirve para una web pública en su plan gratuito.** Sus
   condiciones de uso prohíben explícitamente "difondre a tercers, total ni parcialment, la
   informació rebuda de l'SMC". El plan profesional cuesta 67–306 €/mes.
2. **Pero los mismos datos XEMA están en el portal de datos abiertos de la Generalitat, con
   licencia redistribuible, sin API key y con latencia de ~45 minutos.** Esta es la vía legal
   y gratuita para tener observación real de 245 estaciones catalanas.
3. **Open-Meteo acepta hasta cientos de coordenadas en una sola petición.** Refrescar los
   ~4.900 puntos del territorio cuesta ~25 llamadas por modelo, no 4.900.
4. **El Nomenclàtor estadístico da la jerarquía completa** municipio → entidad colectiva →
   entidad singular → núcleo. Montblanc sale con Lilla, la Guàrdia dels Prats, el Pinetell,
   Prenafeta y Rojals, exactamente como se pedía.
