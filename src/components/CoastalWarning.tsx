import Link from 'next/link';
import { dateTimeLong } from '@/lib/format';
import { phenomenonName, zoneName } from '@/lib/warning-labels';
import type { Warning } from '@/lib/warning-stack';

const CAP = { groc: 'yellow', taronja: 'orange', vermell: 'red' } as const;
const RANK = ['groc', 'taronja', 'vermell'];

/**
 * L'avís de fenòmens costaners de l'AEMET, si n'hi ha.
 *
 * És el que de veritat diu si el mar estarà dolent, i el que es busca abans de
 * baixar a la platja o de sortir del port. Va a dalt de `/mar` i de `/nautica`
 * i és un sol component perquè les dues el diguin igual.
 *
 * Es diu el més alt i, al costat, totes les zones que en tenen: el detall de
 * cada un és a `/avisos`.
 */
export function CoastalWarning({ warnings }: { warnings: Warning[] }) {
  const coastal = warnings.filter((w) => w.phenomenon === 'CO' && w.level !== 'verd');
  if (!coastal.length) return null;

  const worst = coastal.reduce((a, w) => (RANK.indexOf(w.level) > RANK.indexOf(a.level) ? w : a));
  const zones = [...new Set(coastal.flatMap((w) => w.zones.map(zoneName)))];
  const level = worst.level as keyof typeof CAP;
  // L'hora de l'AEMET ve en UTC: es diu en hora de Madrid.
  const until = dateTimeLong(
    new Date(worst.expires).toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }).replace(' ', 'T'),
  );

  return (
    <Link
      href="/avisos"
      className="card mb-6 flex items-start gap-3 no-underline"
      style={{ borderColor: `var(--cap-${CAP[level]})` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
      <img src={`/icons/w/code-${CAP[level]}.svg`} width={32} height={32} alt="" />
      <span>
        <strong className="block text-[var(--ink)]">
          Avís {level} per {phenomenonName('CO').toLowerCase()}
        </strong>
        <span className="text-sm text-[var(--ink-2)]">
          {zones.join(' · ')} · fins {until} ›
        </span>
      </span>
    </Link>
  );
}
