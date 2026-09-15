import { windDecode } from '@/lib/wind';

/**
 * Les partícules de vent, com una capa pròpia de MapLibre.
 *
 * ## Per què partícules i no fletxes
 *
 * Perquè una fletxa diu cap on bufa en un punt i una partícula ensenya **què
 * fa l'aire**: on s'accelera, on gira, on es troben dos règims. En un dia de
 * marinada es veu el mar empenyent cap a terra a tota la costa alhora, que és
 * una cosa que amb fletxes s'ha de deduir.
 *
 * ## Com es mou, i per què no es mou a la velocitat de veritat
 *
 * Cada partícula llegeix la graella amb interpolació bilineal i avança. Si
 * avancés en temps real no es veuria: deu metres per segon a l'escala del país
 * és un píxel cada mig minut. Així que cada fotograma val uns quants minuts de
 * rellotge, i **el pas s'escurça amb el zoom**: sense això, la mateixa
 * velocitat de terra que al país sencer es veu tranquil·la, ampliada a un
 * poble sortiria disparada. El que es manté constant és la velocitat a la
 * pantalla, que és el que fa que es pugui mirar.
 *
 * ## El rastre són segments, no una acumulació a la memòria
 *
 * Cada partícula desa les seves últimes posicions i es dibuixen com a segments
 * amb l'alfa caient cap enrere. L'altra manera —dibuixar damunt del fotograma
 * anterior i anar-lo enfosquint— necessita dos búfers i una passada més, i
 * amb tres mil partícules això no fa falta.
 *
 * ## Les coordenades són mercator de 0 a 1
 *
 * És el que espera la matriu que MapLibre passa a una capa pròpia. La
 * conversió es fa aquí i no amb `MercatorCoordinate` per no arrossegar-hi una
 * dependència per a dues línies d'aritmètica.
 */

export interface WindData {
  width: number;
  height: number;
  box: { west: number; east: number; south: number; north: number };
  /** Cap a l'est, m/s, per files de nord a sud. */
  u: Float32Array;
  /** Cap al nord, m/s. */
  v: Float32Array;
}

/**
 * Quantes n'hi ha.
 *
 * Tres mil és el que omple el país sense que es vegin com una trama. Amb deu
 * mil el dibuix no millora i el navegador d'un telèfon comença a patir.
 */
const PARTICLES = 3000;

/** Quantes posicions es recorden de cada una. Deu fan un rastre curt i llegible. */
const TRAIL = 10;

/**
 * Quants píxels es mou una partícula per fotograma, abans de comprimir el rang.
 *
 * ## Per què es compta en píxels i no en segons de rellotge
 *
 * La primera versió avançava «tants minuts de rellotge per fotograma», que
 * sona més honest i **no es veia**: amb el vent fluix d'una tarda de setembre
 * —tres metres per segon— i el país sencer a la pantalla, cada pas era un terç
 * de píxel i el rastre sencer feia dos. La targeta dibuixava vint mil segments
 * perfectament correctes i invisibles.
 *
 * I té un segon problema: la mateixa velocitat de terra, ampliada a un poble,
 * surt disparada. Comptant en píxels les dues coses se solucionen alhora,
 * perquè el que ha de ser llegible és el moviment **a la pantalla**.
 *
 * La constant va acompanyada de l'exponent de sota: veure-la sola no diu res.
 */
const PX_PER_STEP = 1.6;

/**
 * I l'exponent que comprimeix el rang.
 *
 * Amb el desplaçament proporcional a la velocitat, la tarda que es va provar
 * això —vent d'un metre i mig per segon— cada pas era mig píxel i el rastre
 * sencer en feia quatre: es dibuixaven vint mil segments perfectament correctes
 * i invisibles. Pujant la constant fins que allò es veiés, una tramuntana de
 * 25 m/s hauria travessat la pantalla en tres fotogrames.
 *
 * Amb `velocitat^0,6` les dues caben: 1,5 m/s fa 2 píxels per pas i 25 m/s en
 * fa 11. **La direcció no es toca** —el vector es reescala, no es gira— i el
 * que es perd és poder llegir la velocitat de la longitud del rastre, que no
 * és el que un camp de partícules explica: per a això hi ha el gruix i el
 * número del peu.
 */
const SPEED_EXP = 0.6;

/** La mida de tessel·la amb què MapLibre compta el zoom. */
const TILE_PX = 512;

/** Fotogrames que viu una partícula abans de tornar a néixer en un altre lloc. */
const LIFE_MIN = 40;
const LIFE_MAX = 140;

const VERT = `
attribute vec2 a_pos;
attribute float a_alpha;
uniform mat4 u_matrix;
varying float v_alpha;
void main() {
  gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
  v_alpha = a_alpha;
}`;

/*
 * Blau fosc, i no blanc.
 *
 * Els camps de vent que tothom té al cap són blancs perquè van damunt d'un
 * mapa negre. El nostre fons és la cartografia topogràfica de l'ICGC, que és
 * clara: escrit en blanc, el vent hi era —les partícules es movien, el
 * navegador no es queixava de res— i **no es veia ni una**.
 */
const FRAG = `
precision mediump float;
varying float v_alpha;
void main() {
  gl_FragColor = vec4(0.09, 0.16, 0.29, v_alpha);
}`;

function mercY(lat: number): number {
  const s = Math.sin((lat * Math.PI) / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
}

export class WindLayer {
  readonly id = 'vent';
  readonly type = 'custom' as const;
  readonly renderingMode = '2d' as const;

  private data: WindData | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private buffer: WebGLBuffer | null = null;
  /**
   * El seu propi objecte de vèrtexs.
   *
   * MapLibre deixa un VAO seu enllaçat quan crida una capa pròpia, i llavors
   * `vertexAttribPointer` no configura «els atributs»: configura **els d'ell**.
   * Les línies s'enviaven, la targeta no es queixava, i no es dibuixava res
   * mentre el mapa base quedava intacte. Amb un VAO propi, cada un escriu al
   * seu.
   */
  private vao: WebGLVertexArrayObject | null = null;
  private locPos = 0;
  private locAlpha = 0;
  private locMatrix: WebGLUniformLocation | null = null;

  /** `lon, lat` de cada partícula, i les seves últimes posicions. */
  private lon = new Float32Array(PARTICLES);
  private lat = new Float32Array(PARTICLES);
  private trail = new Float32Array(PARTICLES * TRAIL * 2);
  private age = new Int32Array(PARTICLES);
  private life = new Int32Array(PARTICLES);
  /** Quants passos ha fet cada partícula des que va néixer, fins a `TRAIL`. */
  private filled = new Int32Array(PARTICLES);

  /** El que s'envia a la targeta: dues posicions i un alfa per vèrtex. */
  private verts = new Float32Array(PARTICLES * (TRAIL - 1) * 2 * 3);

  private zoomOf: () => number = () => 7;
  private repaint: () => void = () => {};

  constructor(zoomOf: () => number, repaint: () => void) {
    this.zoomOf = zoomOf;
    this.repaint = repaint;
  }

  /** La graella d'una hora. En canviar d'hora es torna a sembrar. */
  setData(data: WindData | null) {
    this.data = data;
    if (data) for (let i = 0; i < PARTICLES; i++) this.spawn(i, true);
  }

  private spawn(i: number, scatter: boolean) {
    const b = this.data!.box;
    this.lon[i] = b.west + Math.random() * (b.east - b.west);
    this.lat[i] = b.south + Math.random() * (b.north - b.south);
    this.age[i] = scatter ? Math.floor(Math.random() * LIFE_MAX) : 0;
    this.life[i] = LIFE_MIN + Math.floor(Math.random() * (LIFE_MAX - LIFE_MIN));
    this.filled[i] = 0;
  }

  /**
   * El vent en un punt, interpolant les quatre caselles del voltant.
   *
   * Sense la interpolació, les partícules es mourien a salts entre caselles de
   * quatre quilòmetres i el camp semblaria una graella, que és exactament el
   * que un camp de vent no és.
   */
  private sample(lon: number, lat: number): [number, number] {
    const d = this.data!;
    const step = (d.box.east - d.box.west) / (d.width - 1);
    const fx = (lon - d.box.west) / step;
    const fy = (d.box.north - lat) / step;
    if (fx < 0 || fy < 0 || fx > d.width - 1 || fy > d.height - 1) return [NaN, NaN];

    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(x0 + 1, d.width - 1);
    const y1 = Math.min(y0 + 1, d.height - 1);
    const tx = fx - x0;
    const ty = fy - y0;

    const mix = (a: Float32Array) => {
      const top = a[y0 * d.width + x0] * (1 - tx) + a[y0 * d.width + x1] * tx;
      const bot = a[y1 * d.width + x0] * (1 - tx) + a[y1 * d.width + x1] * tx;
      return top * (1 - ty) + bot * ty;
    };
    return [mix(d.u), mix(d.v)];
  }

  onAdd(_map: unknown, gl: WebGL2RenderingContext) {
    this.gl = gl;
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error(`el vent no compila: ${gl.getShaderInfoLog(sh)}`);
      }
      return sh;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(`el vent no s'enllaça: ${gl.getProgramInfoLog(p)}`);
    }
    this.program = p;
    this.locPos = gl.getAttribLocation(p, 'a_pos');
    this.locAlpha = gl.getAttribLocation(p, 'a_alpha');
    this.locMatrix = gl.getUniformLocation(p, 'u_matrix');
    this.buffer = gl.createBuffer();
    this.vao = gl.createVertexArray();
  }

  onRemove() {
    const gl = this.gl;
    if (!gl) return;
    if (this.program) gl.deleteProgram(this.program);
    if (this.buffer) gl.deleteBuffer(this.buffer);
    if (this.vao) gl.deleteVertexArray(this.vao);
    this.gl = null;
  }

  private step() {
    const zoom = this.zoomOf();
    /*
     * Graus per píxel a aquest zoom. La latitud n'ocupa menys com més amunt,
     * perquè el mercator estira: per això porta el cosinus.
     */
    const degPerPx = 360 / (TILE_PX * 2 ** zoom);

    for (let i = 0; i < PARTICLES; i++) {
      const [u, v] = this.sample(this.lon[i], this.lat[i]);
      if (!Number.isFinite(u)) { this.spawn(i, false); continue; }

      // Desa la posició d'ara al final del rastre, abans de moure's.
      const base = i * TRAIL * 2;
      const slot = (this.age[i] % TRAIL) * 2;
      this.trail[base + slot] = this.lon[i];
      this.trail[base + slot + 1] = this.lat[i];
      if (this.filled[i] < TRAIL) this.filled[i]++;

      const speed = Math.hypot(u, v);
      // Reescalat, no girat: el factor és igual per als dos components.
      const k = speed > 0.01 ? (PX_PER_STEP * speed ** SPEED_EXP) / speed : 0;
      const cos = Math.max(0.1, Math.cos((this.lat[i] * Math.PI) / 180));
      this.lon[i] += u * k * degPerPx;
      this.lat[i] += v * k * degPerPx * cos;

      this.age[i]++;
      if (this.age[i] > this.life[i]) this.spawn(i, false);
    }
  }

  private fill(): number {
    let n = 0;
    for (let i = 0; i < PARTICLES; i++) {
      const filled = this.filled[i];
      if (filled < 2) continue;
      const base = i * TRAIL * 2;

      /*
       * L'anella, ben comptada.
       *
       * Després de `N` passos, `age` val `N` i l'última casella escrita és la
       * `(N − 1) % TRAIL`: la `N` encara no existeix. La primera versió unia
       * `N−1` amb `N`, o sigui el punt bo amb una casella sense estrenar
       * —lon 0, lat 0, al golf de Guinea— i a més es deixava el tram més vell.
       * Aquí es va del més vell al més nou i no es toca res que no s'hagi
       * escrit.
       */
      const first = this.age[i] - filled;
      for (let k = 0; k < filled - 1; k++) {
        const a = ((first + k) % TRAIL + TRAIL) % TRAIL;
        const b = ((first + k + 1) % TRAIL + TRAIL) % TRAIL;
        const aLon = this.trail[base + a * 2];
        const aLat = this.trail[base + a * 2 + 1];
        const bLon = this.trail[base + b * 2];
        const bLat = this.trail[base + b * 2 + 1];

        /*
         * L'alfa cau cap enrere i puja amb la velocitat: un vent fluix es veu
         * tènue i una tramuntana es veu. Sense això, un camp de calmes es
         * dibuixaria igual de marcat que un temporal i el mapa mentiria.
         */
        const speed = Math.hypot(...this.sample(bLon, bLat));
        const strength = Math.min(1, (Number.isFinite(speed) ? speed : 0) / 12);
        /*
         * Cap al cap del rastre s'esvaeix, i el conjunt s'apaga amb el vent
         * fluix. Sense el segon factor, un camp de calmes es dibuixaria igual
         * de marcat que un temporal i el mapa mentiria; sense el primer, els
         * fils no tindrien cap.
         */
        const fade = (0.15 + 0.85 * ((k + 1) / filled)) * (0.45 + 0.55 * strength);

        const o = n * 6;
        this.verts[o] = (aLon + 180) / 360;
        this.verts[o + 1] = mercY(aLat);
        this.verts[o + 2] = fade;
        this.verts[o + 3] = (bLon + 180) / 360;
        this.verts[o + 4] = mercY(bLat);
        this.verts[o + 5] = fade;
        n++;
      }
    }
    return n;
  }

  render(
    gl: WebGL2RenderingContext,
    options: { defaultProjectionData: { mainMatrix: Float32Array | number[] } },
  ) {
    if (!this.data || !this.program) return;

    this.step();
    const segments = this.fill();
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.verts.subarray(0, segments * 6), gl.DYNAMIC_DRAW);

    gl.enableVertexAttribArray(this.locPos);
    gl.vertexAttribPointer(this.locPos, 2, gl.FLOAT, false, 12, 0);
    gl.enableVertexAttribArray(this.locAlpha);
    gl.vertexAttribPointer(this.locAlpha, 1, gl.FLOAT, false, 12, 8);

    gl.uniformMatrix4fv(this.locMatrix, false, options.defaultProjectionData.mainMatrix as Float32Array);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.LINES, 0, segments * 2);

    // Desenllaçat: el que ve després és el mapa, i no ha de trobar-se el nostre.
    gl.bindVertexArray(null);

    // Una capa pròpia només es torna a dibuixar si algú ho demana.
    this.repaint();
  }
}

/**
 * De PNG a graella.
 *
 * El vermell porta la u i el verd la v, tots dos en un byte entre `−WIND_MAX`
 * i `+WIND_MAX`. Es descodifica un cop per hora, no a cada fotograma.
 */
export function decodeWind(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  box: WindData['box'],
): WindData {
  const n = width * height;
  const u = new Float32Array(n);
  const v = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    u[i] = windDecode(pixels[i * 4]);
    v[i] = windDecode(pixels[i * 4 + 1]);
  }
  return { width, height, box, u, v };
}
