import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd, breadcrumbLd, graph } from '@/components/JsonLd';
import { PageHero, Section } from '@/components/PageHero';
import { PushAlerts } from '@/components/PushAlerts';
import { pushAlertsAvailable } from '@/lib/push-available';
import { locationByPath } from '@/lib/territory';
import { aName, placeName } from '@/lib/format';
import { getLang } from '@/lib/i18n';
import { tr } from '@/lib/lang';

/**
 * Els avisos oficials taronja i vermell, al mòbil.
 *
 * S'hi arriba des de la fitxa d'un lloc (`?lloc=/maresme/malgrat-de-mar`), i és
 * l'única pàgina que carrega `PushAlerts`. Les regles del que s'envia són a
 * `src/lib/push-alerts.ts`; aquí es diuen amb paraules, perquè qui ho activa
 * ha de saber exactament què el despertarà i què no.
 *
 * Llegir `searchParams` la fa dinàmica, i per això és a `LIVE_PAGES`.
 */

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return {
    title: tr(lang, 'Avisos al mòbil · tempscat', 'Avisos en el móvil · tempscat'),
    description: tr(lang,
      'Rebeu al mòbil els avisos oficials taronja i vermell de l’AEMET per als llocs que trieu. '
      + 'Sense compte, sense correu i es poden apagar quan vulgueu.',
      'Reciba en el móvil los avisos oficiales naranjas y rojos de AEMET para los lugares que elija. '
      + 'Sin cuenta, sin correo y se pueden desactivar cuando quiera.'),
    alternates: { canonical: '/avisos/alertes' },
  };
}

export default async function AlertesPage(
  { searchParams }: { searchParams: Promise<{ lloc?: string | string[] }> },
) {
  const { lloc } = await searchParams;
  const lang = await getLang();
  const t = (ca: string, es: string) => tr(lang, ca, es);
  const loc = typeof lloc === 'string' ? locationByPath(lloc) : undefined;
  const place = loc?.published ? { path: loc.path, nom: loc.nom } : null;
  const vapidKey = pushAlertsAvailable();

  const trail = [
    { nom: t('Catalunya', 'Cataluña'), path: '/' },
    { nom: t('Avisos', 'Avisos'), path: '/avisos' },
    { nom: t('Avisos al mòbil', 'Avisos en el móvil'), path: '/avisos/alertes' },
  ];

  return (
    <article>
      <JsonLd data={graph(breadcrumbLd(trail, lang))} />

      <PageHero
        crumbs={trail}
        eyebrow={t('Avisos oficials', 'Avisos oficiales')}
        title={place
          ? tr(lang, `Avisos al mòbil ${aName(place.nom)}`, `Avisos en el móvil para ${placeName(place.nom, lang)}`)
          : t('Avisos al mòbil', 'Avisos en el móvil')}
        lead={(
          <>
            {t('Una notificació quan l’AEMET emet un avís taronja o vermell per al lloc que trieu. Sense compte ni correu, i es pot apagar des d’aquí mateix.',
              'Una notificación cuando AEMET emite un aviso naranja o rojo para el lugar que elija. Sin cuenta ni correo, y se puede desactivar desde aquí mismo.')}
          </>
        )}
      />

      <Section id="activa" title={place
        ? tr(lang, `Activeu-los ${aName(place.nom)}`, `Actívelos para ${placeName(place.nom, lang)}`)
        : t('Aquest aparell', 'Este dispositivo')}>
        <div className="card prose">
          {vapidKey ? (
            <PushAlerts vapidKey={vapidKey} place={place} lang={lang} />
          ) : (
            lang === 'es' ? (
              <p>Los avisos en el móvil todavía no están disponibles. Mientras tanto, puede seguirlos con
                el <Link href="/avisos/feed">canal de avisos</Link> o añadirlos al calendario.</p>
            ) : (
              <p>Els avisos al mòbil encara no estan disponibles. Mentrestant, els podeu seguir amb
                el <Link href="/avisos/feed">canal d’avisos</Link> o afegir-los al calendari.</p>
            )
          )}
        </div>
      </Section>

      <Section id="que-arriba" title={t('Què us arribarà, i què no', 'Qué le llegará, y qué no')}>
        <div className="card prose">
          {lang === 'es' ? (
            <ul>
              <li>
                <strong>Solo avisos oficiales de AEMET de nivel naranja o rojo.</strong> Nunca un
                amarillo, y nunca una previsión nuestra: para el amarillo está la franja de la ficha.
              </li>
              <li>
                <strong>De las 23 h a las 7 h, solo el rojo.</strong> Un naranja que se emite de noche
                le llega a las siete de la mañana, si sigue vigente.
              </li>
              <li>
                <strong>Un mensaje por episodio.</strong> AEMET vuelve a emitir el mismo aviso cada
                día que dura; solo le volverá a llegar si sube de naranja a rojo. Si hay
                varios avisos a la vez, le llega un solo mensaje con el más grave.
              </li>
              <li>
                <strong>Se puede desactivar aquí</strong>, lugar por lugar o todo de golpe, sin desinstalar nada.
                También puede bloquear las notificaciones desde el navegador.
              </li>
            </ul>
          ) : (
            <ul>
              <li>
                <strong>Només avisos oficials de l’AEMET de nivell taronja o vermell.</strong> Mai un
                groc, i mai una previsió nostra: per al groc hi ha la franja de la fitxa.
              </li>
              <li>
                <strong>De les 23 h a les 7 h, només el vermell.</strong> Un taronja que s’emet de nit
                us arriba a les set del matí, si encara és vigent.
              </li>
              <li>
                <strong>Un missatge per episodi.</strong> L’AEMET torna a emetre el mateix avís cada
                dia que dura; només us tornarà a arribar si puja de taronja a vermell. Si hi ha
                diversos avisos alhora, us arriba un sol missatge amb el més greu.
              </li>
              <li>
                <strong>Es pot apagar aquí</strong>, lloc per lloc o tot de cop, sense desinstal·lar res.
                També podeu bloquejar les notificacions des del navegador.
              </li>
            </ul>
          )}
          <p>
            {t('Els avisos es comproven cada quinze minuts. Tocant la notificació s’obre la fitxa del lloc, amb l’avís i el text oficial de l’AEMET.',
              'Los avisos se comprueban cada quince minutos. Al tocar la notificación se abre la ficha del lugar, con el aviso y el texto oficial de AEMET.')}
          </p>
        </div>
      </Section>

      <Section id="dades" title={t('Què es desa', 'Qué se guarda')}>
        <div className="card prose">
          {lang === 'es' ? (
            <p>
              Para poder enviarle el mensaje, se guarda la dirección que su navegador da para
              las notificaciones, las claves con que se cifra el mensaje, los lugares que ha elegido y
              el idioma de la web desde la que lo ha activado. Nada más: ni nombre, ni correo, ni
              ubicación. Cuando desactive los avisos, se borra. El detalle está en
              la <Link href="/privacitat#avisos">política de privacidad</Link>.
            </p>
          ) : (
            <p>
              Per poder-vos enviar el missatge, es desa l’adreça que el vostre navegador dona per a
              les notificacions, les claus amb què es xifra el missatge, els llocs que heu triat i
              l’idioma del web des d’on ho heu activat. Res més: ni nom, ni correu, ni ubicació.
              Quan apagueu els avisos, s’esborra. El detall és a
              la <Link href="/privacitat#avisos">política de privadesa</Link>.
            </p>
          )}
        </div>
      </Section>
    </article>
  );
}
