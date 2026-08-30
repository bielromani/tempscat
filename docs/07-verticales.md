# 07 — Verticales territoriales

Las verticales son lo que convierte "una web del tiempo" en "la web del tiempo **de
Catalunya**". Una agregadora internacional nunca construirá un índice de bolets por comarca
ni cruzará el nivel de los embalses con la lluvia de las últimas semanas.

Todas comparten la misma disciplina: **puntuación explicable**, nunca un número mágico.

---

## 1. Nieve y Pirineo

**Datos:** estaciones XEMA de alta montaña (Boí, Certascan, Núria, Malniu, Sasseuva…),
`snow_depth` y `snowfall` de Open-Meteo, boletín de aludes (`nnwt-dwkm`), predicción de montaña
de AEMET.

Páginas:

```
/neu                          panorámica: cotas, gruesos, aludes
/neu/cotes                    cota de nieve por macizo, hoy y próximos 5 días
/neu/[estacio-esqui]          Baqueira, La Molina, Masella, Boí Taüll, Port Ainé,
                              Espot, Vallter, Vall de Núria, Tavascan, Port del Comte,
                              Núria, Masella…
/allaus/[zona]                7 zonas del boletín de aludes catalán
```

**La cota de nieve es la pregunta.** Es lo que la gente busca en invierno y lo que todas las
webs responden mal, dando un único número para toda Catalunya. Nosotros la calculamos por
macizo desde el nivel de congelación de cada modelo, corregido por el efecto de enfriamiento
por fusión (con precipitación intensa la nieve cuaja 200–300 m por debajo del nivel de
congelación teórico) y presentada como **rango con probabilidad**, no como cifra exacta.

Visualización propia: **corte vertical del valle** con la cota marcada sobre el perfil real del
terreno y los núcleos habitados situados a su altura. Se entiende de un vistazo si nevará en
tu pueblo o solo en la cresta.

**Estado de pistas:** los datos oficiales de las estaciones de esquí no son abiertos. Vías, por
orden de preferencia: acuerdo directo con las estaciones (les interesa el tráfico), FGC publica
datos de sus estaciones (`g9qt-zz33` es de FGC), o estimación propia a partir de gruesos y
temperaturas, **claramente etiquetada como estimación**. Nunca presentar una estimación como
dato oficial.

---

## 2. Embalses y sequía

**Datos:** `gn9e-3qhr` (verificado, actualizado a diario), `39c7-5ydt`, `i5n8-43cw` (estado de
sequía por municipio), más precipitación acumulada de XEMA.

```
/embassaments                 estado de todas las cuencas internas
/embassaments/[embassament]   Sau, Susqueda, la Baells, Sant Ponç, Siurana, Riudecanyes…
/sequera                      estado por unidad de explotación
/sequera/[municipi]           qué restricciones aplican en tu municipio
```

**El cruce que nadie hace:** correlacionar el nivel de los embalses con la precipitación
acumulada en su **cuenca de aportación**, no en el punto del embalse. Permite responder la
pregunta real: *"ha llovido lo suficiente esta semana como para que suba Sau?"* — que es
justo lo que la gente quiere saber cuando llueve tras una sequía, y lo que ninguna web
responde.

Visualización: nivel actual sobre la banda de la media histórica del mismo día del año, con la
lluvia de la cuenca superpuesta en las últimas 12 semanas.

`/sequera/[municipi]` es además SEO de alto valor: cuando hay restricciones, la búsqueda
*"restriccions aigua [municipi]"* se dispara.

---

## 3. Bolets

La vertical más catalana que existe y, hecha bien, potencialmente la más viral.

**Modelo:** la fructificación de *Lactarius* y *Boletus* depende de una secuencia, no de un
estado instantáneo:

| Factor | Peso | Detalle |
|---|---|---|
| Lluvia acumulada 15–20 días antes | Alto | Umbral ~40 mm; el rendimiento crece hasta ~120 mm |
| Temperatura media posterior a la lluvia | Alto | Ventana óptima 10–18 °C; una helada corta la temporada |
| Oscilación térmica día/noche | Medio | Amplitudes de 8–12 °C favorecen |
| Humedad del suelo | Medio | `soil_moisture_0_to_7cm` de Open-Meteo |
| Altitud y orientación | Medio | La temporada sube en altitud a lo largo del otoño |
| Tipo de bosque | Alto | Mapa forestal: pino royo, pinassa, encinar, hayedo |
| Días desde la última lluvia | Alto | 8–15 días después es la ventana |

```
/bolets                        mapa de calor de las 43 comarcas
/bolets/[comarca]              detalle, especies probables, evolución
/bolets/[municipi]             índice local y bosques cercanos
```

Salida: índice 0–100 **con desglose visible** ("+35 pluja acumulada · +20 temperatura ·
+15 humitat del sòl · −10 fa massa dies de la darrera pluja") y especies probables según altitud
y bosque.

Precaución explícita en la página: **no publicamos localizaciones concretas**. Es a la vez
respeto por una cultura que valora el secreto de los rodales y una protección legal.

---

## 4. Playas, mar y actividades náuticas

**Datos:** Open-Meteo Marine (verificado), predicción de playas de AEMET, temperatura del mar
de XOM.

```
/platges                       estado de toda la costa
/platges/[municipi]            los 71 municipios costeros
/surf                          previsión de olas por punto
/surf/[spot]                   Pantà de Foix, Llafranc, Castelldefels, Somorrostro…
```

Datos por playa: temperatura del agua, altura y periodo de ola, dirección del swell, viento
(terral u onshore — decisivo para el surf), UV, medusas cuando haya fuente, y bandera cuando
sea accesible.

**Índice de surf** separado del índice de baño: son necesidades opuestas. Lo que arruina un día
de playa (viento y oleaje) es lo que hace bueno un día de surf.

---

## 5. Senderismo y montaña

```
/muntanya                      condiciones en los principales macizos
/muntanya/[cim]                Pedraforca, Puigmal, Aneto, Carlit, Montseny (Turó de l'Home),
                               Montserrat, Els Ports, Comabona…
```

Índice horario, porque el senderismo es una actividad con hora de salida:

- Riesgo de tormenta por franja horaria (crítico en verano: la convección pirenaica es
  vespertina y mata gente cada año).
- Sensación térmica con viento a la altitud de la cima, no la del valle.
- Visibilidad y probabilidad de niebla.
- Índice UV a esa altitud (sube ~10 % cada 1.000 m).
- Hora de salida y puesta de sol, y horas de luz útil restantes.
- En invierno: presencia de nieve, riesgo de placa, necesidad de crampones.

La página debe decir claramente **"millor sortir abans de les 11 h"** cuando corresponda. Es
información que salva excursiones y, ocasionalmente, algo más.

---

## 6. Agricultura y viticultura

Menos volumen de búsqueda pero altísimo valor y muy poca competencia: DO Priorat, Penedès,
Empordà, Costers del Segre, Terra Alta.

- Riesgo de helada primaveral (crítico en viña y frutales del Segrià y el Baix Ebre).
- Grados-día acumulados para seguimiento de maduración.
- Riesgo de mildiu y oídio a partir de humedad y temperatura.
- Ventanas de tratamiento (sin lluvia y sin viento en las próximas N horas).
- Ventanas de siega y vendimia.

---

## 7. Astronomía y cielo

Barato de construir (los datos ya están) y sorprendentemente popular:

- Nubosidad por capas para observación nocturna.
- Fases lunares, orto y ocaso.
- Índice de calidad del cielo cruzando nubosidad con contaminación lumínica.
- Perseidas, eclipses y eventos, con predicción de nubosidad específica para esa noche.

Las páginas de eventos astronómicos concretos ("Perseides 2027 a Catalunya: on mirar") son
picos de tráfico estacional muy fáciles de captar.

---

## Prioridad de construcción

| Orden | Vertical | Por qué |
|---|---|---|
| 1 | **Nieve / Pirineo** | Mayor volumen estacional, diferenciación máxima, dato ya disponible |
| 2 | **Embalses / sequía** | Dato abierto verificado y actualizado a diario; muy poco esfuerzo |
| 3 | **Bolets** | Viralidad y catalanidad; requiere el mapa forestal |
| 4 | **Playas / surf** | Open-Meteo Marine ya verificado |
| 5 | **Senderismo** | Reutiliza datos existentes, valor de seguridad |
| 6 | **Astronomía** | Barato, buen tráfico estacional |
| 7 | **Agricultura** | Nicho, alto valor, sin prisa |
