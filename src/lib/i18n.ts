import { lang as langParam } from 'next/root-params';
import { notFound } from 'next/navigation';
import { isLang, type Lang } from './lang';

/**
 * L'idioma de la pàgina que s'està fent, des de qualsevol component de servidor.
 *
 * Surt del segment `[lang]` que hi ha damunt del layout arrel, que
 * `next.config.ts` omple segons el domini. No cal passar-lo de pare a fill;
 * els components de client i les funcions pures de `src/lib`, en canvi, el
 * reben per paràmetre, perquè aquí no hi arriben.
 *
 * Un valor que no sigui `ca` ni `es` només pot venir d'algú que demani
 * `/ca/ca/…` a mà: 404.
 */
export async function getLang(): Promise<Lang> {
  const l = await langParam();
  if (!isLang(l)) notFound();
  return l;
}
