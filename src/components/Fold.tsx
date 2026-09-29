import type { ReactNode } from 'react';

/**
 * Un bloc plegat: el títol i la xifra que importa, i la resta a un toc.
 *
 * ## Per què
 *
 * La fitxa havia crescut per acumulació fins a **onze pantalles** de mòbil —
 * mesurat el 29 de setembre de 2026: 9.371 px a Lilla i 10.017 a Malgrat, a
 * 390 px d'amplada—, i tots els blocs tenien el mateix pes: la qualitat de
 * l'aire, la comparativa comarcal o els rècords de l'estació ocupaven el mateix
 * que la predicció que ve a buscar gairebé tothom.
 *
 * Plegats, cada un és una línia amb el número que el resumeix —«38 ·
 * Raonablement bona»—, i qui en vol el detall l'obre. **És un `<details>`**:
 * l'obre el navegador, la fitxa segueix sense JavaScript, i el contingut és a
 * l'HTML, que és el que llegeix el cercador.
 *
 * La capçalera és la targeta i el contingut va a sota, fora: els blocs de dins
 * ja porten `.card`, i una targeta dins d'una altra són dues vores seguides.
 */
export function Fold({
  title, summary, children, id,
}: {
  title: ReactNode;
  /** La xifra o la frase curta que es veu amb el bloc tancat. */
  summary?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <details className="fold" id={id}>
      <summary>
        <span className="fold-head">
          <span className="card-title">{title}</span>
          {summary && <span className="fold-summary">{summary}</span>}
        </span>
      </summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}
