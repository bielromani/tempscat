# 05 — Motor de fusión multi-modelo

Aquí está el argumento técnico que sostiene la promesa de "superar a cualquier web
meteorológica de Catalunya". Todo lo demás —el diseño, el SEO, los mapas— es replicable en
meses. Esto no, porque requiere haber acumulado histórico de verificación.

---

## El problema con lo que hace todo el mundo

Las webs meteorológicas escogen **un** modelo y lo muestran. Meteored muestra su elección,
eltiempo.es la suya, AccuWeather la suya. Cuando dos webs discrepan, el usuario no tiene forma
de saber cuál acierta, y ninguna se lo dice.

Peor: casi todas muestran la salida cruda del modelo en la coordenada del municipio. Eso
significa que **para 3.900 núcleos de población el dato mostrado es literalmente el de otro
sitio**, a menudo a cientos de metros de desnivel.

---

## Nuestro pipeline: cuatro pasos

```
salidas crudas de 5 modelos
        │
   ① corrección de altitud       Δaltitud real vs. orografía del modelo
        │
   ② corrección de sesgo          error sistemático medido contra XEMA
        │
   ③ consenso ponderado           pesos = skill reciente por variable/horizonte/zona
        │
   ④ incertidumbre                dispersión entre modelos + ensemble
        ▼
forecast_consensus  →  la web
```

---

## ① Corrección de altitud

El modelo AROME tiene su propia orografía. Para Montblanc devuelve `elevation: 351 m`, muy
cercana a la real. Pero Lilla, en el mismo municipio y a 12 km, está a ~715 m: el modelo
sencillamente no resuelve ese detalle.

```
T_corregida = T_modelo + Γ × (alt_modelo − alt_real)
```

Con un gradiente Γ que **no es constante**:

| Situación | Γ (°C/100 m) | Detección |
|---|---|---|
| Atmósfera bien mezclada (día, viento) | 0,65 | Por defecto |
| Adiabática seca (soleado, seco) | 0,98 | HR baja, insolación alta |
| Saturada (nublado, lluvia) | 0,50 | HR > 90 %, precipitación |
| **Inversión térmica** | **negativo** | Noche despejada, viento < 2 m/s, invierno, fondo de valle |

La inversión térmica es el caso decisivo. En la Plana de Vic, la Cerdanya o la Conca de Barberà,
las noches despejadas de invierno el fondo del valle está **más frío** que la ladera 300 m por
encima. Aplicar un lapse rate estándar en esas condiciones da un error de signo contrario y de
5–8 °C.

Por eso `location` tiene el flag `es_fons_de_vall` (doc 04): en esas ubicaciones, con esas
condiciones sinópticas, el gradiente se invierte y se calibra contra la estación XEMA más
próxima de altitud similar.

**Ninguna web generalista hace esto para Catalunya.** Es lo que hará que nuestra mínima de
Lilla en enero sea creíble y la de la competencia no.

## ② Corrección de sesgo

Cada modelo tiene errores sistemáticos por lugar, mes y hora del día. Se miden continuamente:

```sql
bias(station, model, variable, month, hour_bucket)
  = avg(forecast_value − observed_value)
```

sobre una ventana móvil de 60 días. Se aplica al punto de predicción interpolando el sesgo de
las estaciones cercanas ponderado por distancia y desnivel.

El desglose por `hour_bucket` importa mucho: los modelos suelen sobreestimar las mínimas
nocturnas y ser razonables de día. Un sesgo medio diario ocultaría exactamente el error que
más se nota.

## ③ Consenso ponderado por skill

No es una media aritmética. Cada modelo aporta según lo que ha acertado **recientemente, en
esa variable, a ese horizonte y en esa zona climática**.

```
peso(m) = 1 / (MAE(m, variable, lead, zona) + ε)      normalizado a Σ = 1
```

Zonas climáticas de Catalunya: `litoral`, `prelitoral`, `depressió central`, `prepirineu`,
`pirineu`, `terres de l'Ebre`.

Consecuencias que salen solas y son correctas:

- AROME domina a 0–24 h, sobre todo en precipitación convectiva de verano.
- ECMWF domina a partir de 72 h.
- La transición es **suave y automática**, no un corte arbitrario a 48 h como el que aplican
  los productos "seamless" comerciales.
- Si un modelo se degrada tras un cambio de versión, su peso baja solo en dos semanas.

**Excepción para la precipitación:** promediar precipitación es un error clásico. Si un modelo
predice 20 mm y otro 0 mm, la media (10 mm) es un valor que ningún modelo considera probable y
que además casi nunca ocurre. Para precipitación se usa:

- **Probabilidad** = fracción de modelos que superan el umbral (>0,1 mm, >1 mm, >10 mm).
- **Cantidad** = mediana ponderada de los modelos que sí predicen lluvia, no la media global.

Y se comunica como probabilidad e intervalo, que es lo honesto.

## ④ Incertidumbre y confianza

```
spread     = desviación típica entre modelos, tras corregir
confidence = f(spread, skill medio del conjunto, horizonte)   → 0-100
```

En la interfaz esto se traduce en lenguaje llano, no en un número:

| Confianza | Mensaje |
|---|---|
| > 80 | "Predicció molt fiable" |
| 60–80 | "Predicció fiable" |
| 40–60 | "Els models no acaben de coincidir" |
| < 40 | "Situació incerta: consulta l'evolució" |

Y cuando la confianza es baja, en vez de esconderlo, la página **muestra el desacuerdo**: un
gráfico con la línea de cada modelo. Un usuario que va de excursión el sábado prefiere saber
que hay dudas antes que recibir una certeza falsa.

---

## La página `/models`: convertir el rigor en SEO

La tabla `model_skill` se publica. Una página que responde, con datos propios y actualizados
mensualmente:

- ¿Qué modelo acertó mejor la temperatura en el Pirineo el mes pasado?
- ¿Cuánto se equivocan de media los modelos a 5 días vista en Catalunya?
- ¿Cuál detectó mejor los episodios de lluvia intensa?

Esto es contenido que **no existe en catalán en ningún sitio**, interesa a un público técnico
(que enlaza y comparte), y demuestra la afirmación del producto en vez de proclamarla. Es
simultáneamente control de calidad interno y activo de marketing.

---

## Validación antes de publicar nada

La afirmación "somos mejores" hay que probarla antes de hacerla. Protocolo:

1. Acumular 60 días de predicciones de los 5 modelos más observación XEMA.
2. Calcular MAE del consenso frente a cada modelo individual, y frente a la predicción
   publicada por los principales competidores en una muestra de municipios.
3. Publicar el resultado **sea cual sea**.

Si el consenso no gana al mejor modelo individual, hay un fallo en la implementación y toca
arreglarlo. Es un criterio de aceptación real, no un adorno: aparece como tal en el roadmap
(fase 4).

---

## Índices derivados

El mismo motor alimenta los índices de actividad (doc 07). Todos comparten dos reglas:

- Salida `0-100` **más un desglose explicable** guardado en `activity_index.factors`.
- Nunca un número sin explicación. La página dice qué suma y qué resta, y por qué.
