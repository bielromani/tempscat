import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

/**
 * La imatge que surt quan es comparteix un enllaç: WhatsApp, Telegram, xarxes.
 *
 * ## Per què no porta la temperatura
 *
 * Seria el més vistós i és justament el que no s'hi pot posar. Les xarxes
 * desen la imatge la primera vegada que algú comparteix l'enllaç i la tornen a
 * ensenyar durant dies: un «23°» d'un migdia de juliol seguiria sortint al
 * xat de la família a les tres de la matinada, sense hora i sense estació. Al
 * web cada número diu d'on surt i de quan és; aquí no hi hauria manera de dir-ho.
 * La imatge diu **de quin lloc** és la pàgina —nom, comarca, altitud—, que és
 * el que no caduca, i el número el veu qui hi entra.
 *
 * I per això també es pot desar: no llegeix cap dada viva, així que Next la
 * genera la primera vegada i la guarda.
 *
 * ## Els colors van en hex, i no en OKLCH com a la resta del lloc
 *
 * El motor que la dibuixa (Satori) no entén `oklch()`. Són els de `globals.css`
 * passats per `oklchToHex()` —`--paper`, `--accent`, `--brand`— i, si el tema
 * canvia, aquí s'han de tornar a convertir a mà.
 *
 * ## La lletra
 *
 * Inter, la del web, en WOFF —Satori no llegeix WOFF2, que és el que serveix
 * `next/font`—. Són dos fitxers de 30 kB a `assets/fonts/`, amb la llicència
 * OFL al costat, que `next.config.ts` fa viatjar amb el desplegament.
 */

export const OG_SIZE = { width: 1200, height: 630 };

const PAPER = '#0e1e35';
const DEEP = '#164781';
const MID = '#3e8cc9';
const ACCENT = '#83cefd';
const INK = '#f5f9fc';

const fonts = Promise.all([
  readFile(join(/* turbopackIgnore: true */ process.cwd(), 'assets/fonts/Inter-Regular.woff')),
  readFile(join(/* turbopackIgnore: true */ process.cwd(), 'assets/fonts/Inter-ExtraBold.woff')),
]);

/** La icona de la marca: la mateixa d'`icon.svg`, en línia perquè Satori no llegeix fitxers. */
const ICON = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
  + '<defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="1">'
  + '<stop offset="0" stop-color="#4AA8FF"/><stop offset="1" stop-color="#1257D6"/></linearGradient></defs>'
  + '<rect width="32" height="32" rx="9" fill="url(#s)"/>'
  + '<circle cx="21.5" cy="11" r="5" fill="#FFD166"/>'
  + '<path d="M2.5 26 L11 14.5 L15.8 20.5 L19.5 16 L29.5 26 Z" fill="#fff"/>'
  + '<path d="M11 14.5 L13.2 17.4 L11.8 17 L10.6 18 L9.6 16.7 Z" fill="#DDEBFF"/></svg>',
);

/** Un perfil de muntanyes per al peu: decoració, el mateix per a tot arreu. */
const RIDGE = 'M0 630 L0 560 L90 510 L170 545 L260 470 L340 520 L430 440 L520 500 L600 460 '
  + 'L690 510 L780 430 L860 485 L950 450 L1040 510 L1120 470 L1200 495 L1200 630 Z';

export interface OgCard {
  /** La línia petita de dalt: «El temps a», «El temps al», «Comarca». */
  kicker: string;
  /** El nom, gran. */
  title: string;
  /** Sota el nom: comarca, altitud. */
  subtitle?: string;
}

/** La mida del nom segons la llargada: «Lilla» i «Sant Martí de Centelles» han de cabre tots dos. */
function titleSize(title: string): number {
  if (title.length <= 12) return 112;
  if (title.length <= 18) return 96;
  if (title.length <= 26) return 80;
  if (title.length <= 34) return 66;
  return 56;
}

export async function ogImage({ kicker, title, subtitle }: OgCard): Promise<ImageResponse> {
  const [regular, extraBold] = await fonts;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          backgroundImage: `linear-gradient(180deg, ${PAPER} 0%, ${DEEP} 62%, ${MID} 100%)`,
          color: INK,
          fontFamily: 'Inter',
          padding: '64px 76px',
        }}
      >
        {/* La claror del sol, a la dreta, on al titular de la fitxa hi ha el sol o la lluna. */}
        <div
          style={{
            position: 'absolute',
            right: 120,
            top: 70,
            width: 340,
            height: 340,
            borderRadius: 340,
            backgroundImage: 'radial-gradient(circle, rgba(255,214,120,0.55) 0%, rgba(255,214,120,0.12) 40%, rgba(255,214,120,0) 70%)',
          }}
        />
        <svg
          width="1200"
          height="630"
          viewBox="0 0 1200 630"
          style={{ position: 'absolute', left: 0, top: 0 }}
        >
          <path d={RIDGE} fill="rgba(8,18,36,0.55)" />
        </svg>

        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- Satori: no hi ha cap altra manera */}
          <img src={ICON} width={64} height={64} alt="" />
          <div style={{ display: 'flex', fontSize: 44, fontWeight: 800, letterSpacing: '-0.04em' }}>
            <span>temps</span>
            <span style={{ color: ACCENT }}>cat</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto', marginBottom: 'auto' }}>
          <div style={{ fontSize: 30, fontWeight: 400, letterSpacing: '0.14em', textTransform: 'uppercase', opacity: 0.85 }}>
            {kicker}
          </div>
          <div
            style={{
              fontSize: titleSize(title),
              fontWeight: 800,
              letterSpacing: '-0.04em',
              lineHeight: 1.02,
              marginTop: 10,
              maxWidth: 1000,
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div style={{ fontSize: 34, fontWeight: 400, marginTop: 22, opacity: 0.9 }}>{subtitle}</div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 26, opacity: 0.92 }}>
          <span>Hora a hora i a 14 dies, amb l’estació més propera</span>
          <span style={{ fontWeight: 800 }}>tempscat.cat</span>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: 'Inter', data: regular, style: 'normal', weight: 400 },
        { name: 'Inter', data: extraBold, style: 'normal', weight: 800 },
      ],
    },
  );
}
