import Link from 'next/link';

/**
 * La capçalera de les pàgines de secció: la mateixa composició que la portada.
 *
 * A l'esquerra, la ruta, l'etiqueta de la secció amb la seva icona, el títol
 * gran, una entradilla curta i les xifres que contesten la pregunta del títol;
 * a la dreta, el dibuix principal de la pàgina —gairebé sempre un mapa— dins
 * d'una targeta. Al mòbil, una cosa sota l'altra.
 *
 * ## Per què un component i no una classe
 *
 * Al redisseny «Cel» (29 de setembre de 2026) vint pàgines portaven la mateixa
 * capçalera escrita a mà: la ruta copiada, el títol amb la classe, l'entradilla
 * amb la seva mida. I el que es veia mirant-ne dues seguides és que cada una
 * havia triat el seu ordre. Amb un component, l'ordre és un.
 *
 * ## La ruta és la mateixa llista que el JSON-LD
 *
 * `crumbs` porta el lloc actual al final, igual que `breadcrumbLd()`: la pàgina
 * fa la llista un cop i la passa a tots dos. Construint-les per separat, un dia
 * una diria tres passos al lector i quatre al robot.
 */

export interface Crumb {
  nom: string;
  path: string;
}

export interface HeroStat {
  /** Què és: «La més càlida», «Aigua», «Ratxa màxima». */
  label: string;
  /** Un nom de `public/icons/w/`, sense extensió. */
  icon?: string;
  /** La xifra, ja formatada: «24,9», «82 %». */
  value: string;
  /** La unitat, més petita al costat: «°C», «mm», «km/h». */
  unit?: string;
  /** On, o de quan: una línia sota la xifra. Pot portar un enllaç. */
  sub?: React.ReactNode;
}

/** Les xifres que falten es poden passar com a `false` o `null`: no es dibuixen. */
type MaybeStat = HeroStat | false | null | undefined;

export function StatGrid({ stats: all, className = '' }: { stats: MaybeStat[]; className?: string }) {
  const stats = all.filter((s): s is HeroStat => Boolean(s));
  if (!stats.length) return null;
  return (
    <ul className={`stat-grid ${className}`}>
      {stats.map((s) => (
        <li key={s.label} className="stat">
          <p className="stat-label">
            {s.icon && (
              /* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */
              <img src={`/icons/w/${s.icon}.svg`} width={20} height={20} alt="" />
            )}
            {s.label}
          </p>
          <p className="stat-value tnum">
            {s.value}
            {s.unit && <small>{s.unit}</small>}
          </p>
          {s.sub && <div className="stat-sub">{s.sub}</div>}
        </li>
      ))}
    </ul>
  );
}

export function Crumbs({ trail }: { trail: Crumb[] }) {
  return (
    <nav aria-label="Ruta de navegació" className="crumbs">
      {trail.map((c, i) => (
        <span key={c.path}>
          {i > 0 && <span aria-hidden className="crumbs-sep">›</span>}
          {i < trail.length - 1
            ? <Link href={c.path}>{c.nom}</Link>
            : <span className="text-[var(--ink-2)]">{c.nom}</span>}
        </span>
      ))}
    </nav>
  );
}

export function PageHero({
  crumbs, eyebrow, icon, title, lead, stats, note, aside, children,
}: {
  crumbs: Crumb[];
  /** L'etiqueta de la secció, a sobre del títol: «Platges i mar». */
  eyebrow?: string;
  icon?: string;
  title: React.ReactNode;
  /** Una o dues frases: la resposta, no l'explicació. */
  lead?: React.ReactNode;
  stats?: MaybeStat[];
  /** La lletra petita: d'on surt, de quan és. Va després de les xifres. */
  note?: React.ReactNode;
  /** El dibuix de la dreta. */
  aside?: React.ReactNode;
  /** El que calgui sota les xifres: un cercador, uns enllaços. */
  children?: React.ReactNode;
}) {
  return (
    <header className={aside ? 'page-hero has-aside' : 'page-hero'}>
      <div className="page-hero-text">
        <Crumbs trail={crumbs} />
        {eyebrow && (
          <p className="page-eyebrow">
            {icon && (
              /* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */
              <img src={`/icons/w/${icon}.svg`} width={24} height={24} alt="" />
            )}
            {eyebrow}
          </p>
        )}
        <h1 className="page-hero-title">{title}</h1>
        {lead && <div className="page-lead">{lead}</div>}
        {stats && <StatGrid stats={stats} className="mt-6" />}
        {children}
        {note && <div className="page-note">{note}</div>}
      </div>
      {aside && <div className="page-hero-aside">{aside}</div>}
    </header>
  );
}

/**
 * Una secció de la pàgina: el títol a l'esquerra i, si n'hi ha, l'enllaç de
 * «tot» a la dreta. El contingut va a sota, i normalment dins d'una `.card`.
 */
export function Section({
  id, title, action, children, className = '',
}: {
  id?: string;
  title: React.ReactNode;
  action?: { href: string; label: string };
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`section ${className}`} aria-labelledby={id ? `${id}-h` : undefined}>
      <div className="section-head">
        <h2 id={id ? `${id}-h` : undefined} className="card-title">{title}</h2>
        {action && <Link href={action.href} className="section-action">{action.label} ›</Link>}
      </div>
      {children}
    </section>
  );
}
